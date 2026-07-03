import fs from 'fs';
import path from 'path';
import makeWASocket, { 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { getConfig } from './config-manager.js';
import { generateChatReply, extractLeadInfo } from './ai-service.js';
import { 
  addChatMessage, 
  getChatHistory, 
  getEscalation, 
  escalate, 
  addLead, 
  getLeads,
  getUsers,
  getUser,
  incrementUserMessageCount
} from './database.js';

const logger = pino({ level: 'silent' });
const BASE_AUTH_DIR = path.resolve(process.cwd(), 'auth_info');

// Pools to keep track of active sockets and pairing status
const clientSockets = new Map(); // username -> WASocket
const clientStates = new Map();  // username -> { status, qr }
let ioInstance = null;

// Initialize WhatsApp engine for all active users on boot
export async function initWhatsApp(io) {
  if (io) ioInstance = io;

  // Make sure auth_info directory exists
  if (!fs.existsSync(BASE_AUTH_DIR)) {
    fs.mkdirSync(BASE_AUTH_DIR, { recursive: true });
  }

  const users = getUsers();
  const clients = users.filter(u => u.role === 'client' && u.status === 'active');

  console.log(`[WhatsApp] Booting multi-instance manager. Found ${clients.length} active client profiles.`);

  for (const client of clients) {
    // Only auto-resume if they have existing session files to avoid unnecessary sockets for new users
    const clientAuthDir = path.join(BASE_AUTH_DIR, `client_${client.username}`);
    if (fs.existsSync(clientAuthDir)) {
      console.log(`[WhatsApp] Auto-resuming WhatsApp session for client: ${client.username}`);
      startClientWhatsApp(client.username);
    }
  }
}

// Start/reconnect session for a specific client
export async function startClientWhatsApp(username) {
  // If already running, return its status
  if (clientSockets.has(username)) {
    return getClientWhatsAppStatus(username);
  }

  const clientAuthDir = path.join(BASE_AUTH_DIR, `client_${username}`);
  clientStates.set(username, { status: 'disconnected', qr: null });

  try {
    const { state, saveCreds } = await useMultiFileAuthState(clientAuthDir);

    // Fetch dynamic WhatsApp Web version
    let version = [2, 3000, 1017531287]; // Fallback
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
    } catch (err) {
      // Fail silent and use fallback version
    }

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['ShopAssistant AI', 'Chrome', '1.0.0']
    });

    clientSockets.set(username, sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      const clientState = clientStates.get(username) || { status: 'disconnected', qr: null };

      if (qr) {
        clientState.status = 'pairing';
        try {
          clientState.qr = await QRCode.toDataURL(qr);
          console.log(`[WhatsApp] [${username}] QR generated. Awaiting web pairing scan.`);
          broadcastClientStatus(username);
        } catch (err) {
          console.error(`[WhatsApp] [${username}] Failed to generate QR Base64:`, err);
        }
      }

      if (connection === 'close') {
        clientState.qr = null;
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`[WhatsApp] [${username}] Connection closed (Reason: ${statusCode}). Reconnecting: ${shouldReconnect}`);
        
        if (shouldReconnect) {
          clientState.status = 'disconnected';
          broadcastClientStatus(username);
          
          // Reconnect logic
          clientSockets.delete(username);
          setTimeout(() => startClientWhatsApp(username), 5000);
        } else {
          clientState.status = 'disconnected';
          broadcastClientStatus(username);
          clientSockets.delete(username);
          try {
            fs.rmSync(clientAuthDir, { recursive: true, force: true });
          } catch (e) {}
          console.log(`[WhatsApp] [${username}] Session logged out. Auth directory cleared.`);
        }
      }

      if (connection === 'open') {
        clientState.status = 'connected';
        clientState.qr = null;
        console.log(`[WhatsApp] [${username}] Connected successfully! Logged in as: ${sock.user.name || sock.user.id}`);
        broadcastClientStatus(username);
      }

      clientStates.set(username, clientState);
    });

    // Handle messages
    sock.ev.on('messages.upsert', async (m) => {
      if (m.type === 'notify') {
        for (const msg of m.messages) {
          if (msg.key.fromMe) continue;

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast')) {
            continue;
          }

          const phone = remoteJid.split('@')[0];
          const pushName = msg.pushName || 'Customer';

          // Enforce message limit & license expiration boundaries
          const user = getUser(username);
          if (!user || user.status !== 'active') continue;

          // Check Expiry Date
          if (user.expiresAt && Date.now() > user.expiresAt) {
            console.warn(`[WhatsApp] [${username}] Suppressing replies: License has expired.`);
            await sock.sendMessage(remoteJid, {
              text: `Hello! Our automated assistant is currently inactive due to an expired subscription. Please contact the administrator.`
            });
            continue;
          }

          // Check Message Quota Limits
          if (user.messageLimit && (user.messageCount || 0) >= user.messageLimit) {
            console.warn(`[WhatsApp] [${username}] Suppressing replies: Message count has hit the limit (${user.messageLimit}).`);
            await sock.sendMessage(remoteJid, {
              text: `Hello! Our automated assistant has temporarily reached its message limit. We will respond manually as soon as possible.`
            });
            continue;
          }

          // View once & audio checks
          const isVoiceNote = msg.message?.audioMessage?.ptt === true;
          if (isVoiceNote) {
            await sock.sendMessage(remoteJid, {
              text: `Hello ${pushName}! I received your audio message. Because I am an AI text assistant, I cannot listen to voice notes directly. Could you please type your message?`
            });
            incrementUserMessageCount(username);
            broadcastClientStatsUpdate(username);
            continue;
          }

          const isViewOnceImage = 
            msg.message?.viewOnceMessageV2?.message?.imageMessage || 
            msg.message?.viewOnceMessage?.message?.imageMessage;
          if (isViewOnceImage) {
            await sock.sendMessage(remoteJid, {
              text: `Hello! I noticed you sent a view-once image. Because of privacy safeguards, I cannot view this content. Please send standard images or type your message details.`
            });
            incrementUserMessageCount(username);
            broadcastClientStatsUpdate(username);
            continue;
          }

          const text = msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text || 
                       msg.message?.imageMessage?.caption || 
                       '';

          if (!text.trim()) continue;

          console.log(`[WhatsApp] [${username}] Message from ${pushName} (${phone}): "${text}"`);
          
          // Increment message count on standard text messages
          incrementUserMessageCount(username);
          broadcastClientStatsUpdate(username);

          await handleClientIncomingMessage(username, phone, pushName, text, remoteJid, sock);
        }
      }
    });

  } catch (err) {
    console.error(`[WhatsApp] [${username}] Core startup failure:`, err);
    clientStates.set(username, { status: 'disconnected', qr: null });
    broadcastClientStatus(username);
  }
}

// Message flow routing
async function handleClientIncomingMessage(username, phone, pushName, text, remoteJid, sock) {
  const clientConfig = getUserConfig(username);

  // Check support escalation lock
  const escalation = getEscalation(username, phone);
  if (escalation) {
    console.log(`[WhatsApp] [${username}] Chat thread ${phone} escalated. Suppressing AI.`);
    return;
  }

  // Check escalation keyword matching
  const keywords = clientConfig.business_agent?.escalation_keywords || ['human', 'manager', 'complaint', 'refund', 'support'];
  const containsKeyword = keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()));

  if (containsKeyword) {
    console.log(`[WhatsApp] [${username}] Escalation keyword hit by customer ${pushName} (${phone}).`);
    escalate(username, phone, 3600000);

    await sock.sendMessage(remoteJid, {
      text: `Hello ${pushName}, I have paused my automated responses and marked our conversation as URGENT. A store representative will look at your history and message you back shortly!`
    });

    try {
      if (sock.user && sock.user.id) {
        const botSelfJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        await sock.sendMessage(botSelfJid, {
          text: `⚠️ *HUMAN ESCALATION ALERT*\n\nCustomer *${pushName}* (${phone}) requested support.\n\n*Last Message:* "${text}"\n\n_AI replies paused on this thread for 1 hour._`
        });
      }
    } catch (e) {}

    // Emit CRM update
    broadcastClientLeads(username);
    return;
  }

  // Append user message
  addChatMessage(username, phone, 'user', text);
  const history = getChatHistory(username, phone);

  // Generate reply
  const reply = await generateChatReply(username, phone, text, history);

  // Send message
  await sock.sendMessage(remoteJid, { text: reply });

  // Save AI response
  addChatMessage(username, phone, 'assistant', reply);

  // Extract CRM lead updates
  if (clientConfig.business_agent?.auto_lead_capture) {
    try {
      const currentHistory = getChatHistory(username, phone);
      const summary = await extractLeadInfo(username, phone, pushName, currentHistory);
      
      addLead(username, {
        phone,
        name: pushName,
        summary,
        status: 'Active'
      });

      broadcastClientLeads(username);
    } catch (err) {
      console.error(`[WhatsApp] [${username}] CRM extraction error:`, err);
    }
  }
}

// Log out client and wipe credentials
export async function logoutClientWhatsApp(username) {
  console.log(`[WhatsApp] [${username}] Requesting session logout...`);
  const sock = clientSockets.get(username);
  
  if (sock) {
    try {
      await sock.logout();
    } catch (e) {}
    try {
      sock.end();
    } catch (e) {}
    clientSockets.delete(username);
  }

  const clientAuthDir = path.join(BASE_AUTH_DIR, `client_${username}`);
  try {
    if (fs.existsSync(clientAuthDir)) {
      fs.rmSync(clientAuthDir, { recursive: true, force: true });
      console.log(`[WhatsApp] [${username}] Auth directory deleted.`);
    }
  } catch (e) {}

  clientStates.set(username, { status: 'disconnected', qr: null });
  broadcastClientStatus(username);
}

// Query pairing state
export function getClientWhatsAppStatus(username) {
  return clientStates.get(username) || { status: 'disconnected', qr: null };
}

// Socket room status broadcasts
function broadcastClientStatus(username) {
  if (ioInstance) {
    ioInstance.to(`client_${username}`).emit('whatsapp_status', getClientWhatsAppStatus(username));
  }
}

function broadcastClientLeads(username) {
  if (ioInstance) {
    ioInstance.to(`client_${username}`).emit('leads_update', getLeads(username));
  }
}

function broadcastClientStatsUpdate(username) {
  if (ioInstance) {
    const user = getUser(username);
    ioInstance.to(`client_${username}`).emit('stats_update', {
      messageCount: user?.messageCount || 0,
      messageLimit: user?.messageLimit || 100
    });
  }
}
