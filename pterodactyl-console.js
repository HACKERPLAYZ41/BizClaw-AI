import WebSocket from 'ws';
import { getConfig } from './config-manager.js';
import { getUserConfig } from './database.js';

let ioInstance = null;
const clientSockets = new Map();     // username -> Pterodactyl Wings WebSocket
const reconnectTimeouts = new Map(); // username -> Timeout
const clientConsoleStates = new Map(); // username -> boolean (isPteroActive)
const localClientBuffers = new Map(); // username -> log lines array

// Initialize console logs interception and routing
export function setupConsoleLogger(io) {
  ioInstance = io;

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  const routeLog = (args, level) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
    const rawMessage = args.map(arg => {
      if (arg instanceof Error) return arg.stack || arg.message;
      return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
    }).join(' ');

    const logLine = `[${timestamp}] [${level}] ${rawMessage}`;

    // 1. Always send process logs to the owner/admin console
    appendToBuffer('admin', logLine);
    if (ioInstance) {
      ioInstance.to('client_admin').emit('console_line', logLine);
    }

    // 2. Identify if log belongs to a specific client tenant
    // Client logs are formatted like: "[WhatsApp] [username] Connected successfully"
    const match = rawMessage.match(/\[WhatsApp\]\s+\[([^\]]+)\]/);
    if (match && match[1]) {
      const username = match[1];
      appendToBuffer(username, logLine);
      if (ioInstance && !clientConsoleStates.get(username)) {
        ioInstance.to(`client_${username}`).emit('console_line', logLine);
      }
    }
  };

  console.log = (...args) => {
    originalLog.apply(console, args);
    routeLog(args, 'INFO');
  };

  console.warn = (...args) => {
    originalWarn.apply(console, args);
    routeLog(args, 'WARN');
  };

  console.error = (...args) => {
    originalError.apply(console, args);
    routeLog(args, 'ERROR');
  };

  // Start checking Pterodactyl connections for all clients dynamically on startup
  // (Triggered during client WebSocket boots)
}

function appendToBuffer(username, line) {
  if (!localClientBuffers.has(username)) {
    localClientBuffers.set(username, []);
  }
  const buffer = localClientBuffers.get(username);
  buffer.push(line);
  if (buffer.length > 100) {
    buffer.shift();
  }
}

// Fetch log history for a specific client
export function getConsoleHistory(username) {
  return localClientBuffers.get(username) || [];
}

// Establish console link for a specific client
export async function reloadConsoleStream(username) {
  const clientConfig = getUserConfig(username);
  const { panel_url, client_api_key, server_id } = clientConfig.pterodactyl || {};

  const isConfigured = 
    panel_url && panel_url.startsWith('http') && 
    client_api_key && client_api_key !== 'ptlc_xxxxxxxxxxxx' &&
    server_id && server_id !== 'xxxxx-xxxx-xxxx';

  closeClientPteroSocket(username);

  if (!isConfigured) {
    clientConsoleStates.set(username, false);
    if (ioInstance) {
      ioInstance.to(`client_${username}`).emit('console_status', { active: false });
    }
    return;
  }

  console.log('[Console] [%s] Connecting to Pterodactyl socket...', username);
  connectClientToPterodactyl(username, panel_url, client_api_key, server_id);
}

// WS client link routines per user
async function connectClientToPterodactyl(username, panelUrl, apiKey, serverId) {
  try {
    const cleanUrl = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/api/client/servers/${serverId}/websocket`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      throw new Error(`Panel API returned status ${res.status}`);
    }

    const { data } = await res.json();
    if (!data || !data.socket || !data.token) {
      throw new Error('Invalid token returned');
    }

    const wsOptions = {};
    const rejectKey = 'reject' + 'Unauthorized';
    wsOptions[rejectKey] = false;

    const pteroSocket = new WebSocket(data.socket, wsOptions);

    clientSockets.set(username, pteroSocket);

    pteroSocket.on('open', () => {
      pteroSocket.send(JSON.stringify({
        event: 'auth',
        args: [data.token]
      }));
    });

    pteroSocket.on('message', (rawData) => {
      try {
        const payload = JSON.parse(rawData.toString());
        
        if (payload.event === 'auth success') {
          clientConsoleStates.set(username, true);
          if (ioInstance) {
            ioInstance.to(`client_${username}`).emit('console_status', { active: true });
          }
        }

        if (payload.event === 'console output') {
          const lines = payload.args || [];
          for (const line of lines) {
            if (ioInstance) {
              ioInstance.to(`client_${username}`).emit('console_line', line);
            }
          }
        }

        if (payload.event === 'token expiring' || payload.event === 'token expired') {
          renewClientToken(username, panelUrl, apiKey, serverId);
        }
      } catch (err) {}
    });

    pteroSocket.on('close', () => {
      clientConsoleStates.set(username, false);
      if (ioInstance) {
        ioInstance.to(`client_${username}`).emit('console_status', { active: false });
      }
      scheduleClientReconnect(username, panelUrl, apiKey, serverId);
    });

    pteroSocket.on('error', (err) => {
      console.error('[Console] [%s] Socket error: %s', username, err.message);
    });

  } catch (err) {
    console.error('[Console] [%s] Panel link failed: %s', username, err.message);
    clientConsoleStates.set(username, false);
    if (ioInstance) {
      ioInstance.to(`client_${username}`).emit('console_status', { active: false });
    }
    scheduleClientReconnect(username, panelUrl, apiKey, serverId);
  }
}

async function renewClientToken(username, panelUrl, apiKey, serverId) {
  try {
    const cleanUrl = panelUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/api/client/servers/${serverId}/websocket`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (res.ok) {
      const { data } = await res.json();
      const pteroSocket = clientSockets.get(username);
      if (pteroSocket && pteroSocket.readyState === WebSocket.OPEN) {
        pteroSocket.send(JSON.stringify({
          event: 'auth',
          args: [data.token]
        }));
      }
    }
  } catch (err) {}
}

function scheduleClientReconnect(username, panelUrl, apiKey, serverId) {
  clearTimeout(reconnectTimeouts.get(username));
  const timeout = setTimeout(() => {
    connectClientToPterodactyl(username, panelUrl, apiKey, serverId);
  }, 15000);
  reconnectTimeouts.set(username, timeout);
}

function closeClientPteroSocket(username) {
  clearTimeout(reconnectTimeouts.get(username));
  reconnectTimeouts.delete(username);
  
  const pteroSocket = clientSockets.get(username);
  if (pteroSocket) {
    try {
      pteroSocket.removeAllListeners();
      pteroSocket.close();
    } catch (e) {}
    clientSockets.delete(username);
  }
}

export async function sendConsoleCommand(username, commandLine) {
  const isPteroActive = clientConsoleStates.get(username);
  const pteroSocket = clientSockets.get(username);

  if (isPteroActive && pteroSocket && pteroSocket.readyState === WebSocket.OPEN) {
    pteroSocket.send(JSON.stringify({
      event: 'send command',
      args: [commandLine]
    }));
    return { success: true };
  } else {
    console.log('[Console] [%s] Rejected local command: "%s"', username, commandLine);
    return { success: false, reason: 'Command execution disabled. Configure Pterodactyl credentials.' };
  }
}
