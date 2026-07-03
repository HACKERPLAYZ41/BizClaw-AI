import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

import { getConfig, loadConfig } from './config-manager.js';
import { 
  getLeads, 
  updateLeadStatus, 
  deleteLead, 
  resolveEscalation,
  getUser,
  createUser,
  getUsers,
  updateUserLimits,
  deleteUser,
  getLicenses,
  generateLicense,
  getLicense,
  useLicense,
  getUserConfig,
  updateUserConfig
} from './database.js';
import { 
  initWhatsApp, 
  getClientWhatsAppStatus, 
  logoutClientWhatsApp,
  startClientWhatsApp
} from './whatsapp-handler.js';
import { 
  setupConsoleLogger, 
  getConsoleHistory, 
  sendConsoleCommand, 
  reloadConsoleStream 
} from './pterodactyl-console.js';

// Setup config
loadConfig();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), 'public')));

const JWT_SECRET = getConfig().server?.jwt_secret || 'merchant_session_signature_secure_19385';

// Custom Session Token Utility
function generateToken(payload) {
  const data = JSON.stringify({ ...payload, exp: Date.now() + 24 * 60 * 60 * 1000 }); // 24h Expiry
  const hmac = crypto.createHmac('sha256', JWT_SECRET);
  hmac.update(data);
  const signature = hmac.digest('hex');
  return Buffer.from(data).toString('base64') + '.' + signature;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const dataStr = Buffer.from(parts[0], 'base64').toString('utf8');
    const hmac = crypto.createHmac('sha256', JWT_SECRET);
    hmac.update(dataStr);
    if (hmac.digest('hex') !== parts[1]) return null;
    const payload = JSON.parse(dataStr);
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// Router Security Gates
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : req.query.token;

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  req.user = payload;
  next();
}

function adminOnly(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'Forbidden' });
}

// Authentication & Registration REST APIs
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const config = getConfig();
  const adminUser = config.server?.admin_username || 'utkarsh';
  const adminPass = config.server?.admin_password || '2402';

  // 1. Admin login override
  if (username.toLowerCase() === adminUser.toLowerCase() && password === adminPass) {
    const token = generateToken({ username: adminUser, role: 'admin' });
    return res.json({ success: true, token, role: 'admin' });
  }

  // 2. Client login lookup
  const user = getUser(username);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  const hash = crypto.createHash('sha256').update(password).digest('hex');
  if (user.passwordHash !== hash) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ success: false, error: 'Account has been suspended' });
  }

  const token = generateToken({ username: user.username, role: 'client' });
  return res.json({ success: true, token, role: 'client' });
});

app.post('/api/register', (req, res) => {
  const { username, password, licenseKey } = req.body;

  if (!username || !password || !licenseKey) {
    return res.status(400).json({ success: false, error: 'All fields are required.' });
  }

  // Verify license key validity
  const license = getLicense(licenseKey);
  if (!license || license.usedBy) {
    return res.status(400).json({ success: false, error: 'Invalid or already used license key.' });
  }

  // Calculate expiration date
  const expiresAt = Date.now() + license.days * 24 * 60 * 60 * 1000;
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

  // Insert user
  const newUser = createUser({
    username,
    passwordHash,
    role: 'client',
    licenseKey: license.key,
    expiresAt,
    messageLimit: license.messageLimit
  });

  if (!newUser) {
    return res.status(400).json({ success: false, error: 'Username is already taken.' });
  }

  // Claim license
  useLicense(licenseKey, username);

  // Auto-init client WhatsApp loop in background
  startClientWhatsApp(username);

  res.json({ success: true, message: 'Account registered successfully.' });
});

// Admin Panel REST API endpoints
app.post('/api/admin/licenses', authMiddleware, adminOnly, (req, res) => {
  const { days, messageLimit } = req.body;
  if (!days || !messageLimit) {
    return res.status(400).json({ error: 'Days and message limit are required.' });
  }
  const license = generateLicense({ days, messageLimit });
  res.json(license);
});

app.get('/api/admin/licenses', authMiddleware, adminOnly, (req, res) => {
  res.json(getLicenses());
});

app.get('/api/admin/clients', authMiddleware, adminOnly, (req, res) => {
  // Strip sensitive hashes
  const users = getUsers().filter(u => u.role !== 'admin').map(u => ({
    username: u.username,
    licenseKey: u.licenseKey,
    createdAt: u.createdAt,
    expiresAt: u.expiresAt,
    messageLimit: u.messageLimit,
    messageCount: u.messageCount,
    status: u.status
  }));
  res.json(users);
});

app.post('/api/admin/clients/status', authMiddleware, adminOnly, (req, res) => {
  const { username, status } = req.body;
  const success = updateUserLimits(username, { status });
  if (success) {
    // If suspended, logout their whatsapp socket session
    if (status === 'suspended') {
      logoutClientWhatsApp(username);
    }
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Client not found.' });
  }
});

app.delete('/api/admin/clients/:username', authMiddleware, adminOnly, (req, res) => {
  const { username } = req.params;
  // Disconnect socket session
  logoutClientWhatsApp(username);
  const success = deleteUser(username);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Client not found.' });
  }
});

// Client Dashboard REST API endpoints
app.get('/api/client/config', authMiddleware, (req, res) => {
  const config = getUserConfig(req.user.username);
  res.json(config);
});

app.post('/api/client/config', authMiddleware, (req, res) => {
  const config = updateUserConfig(req.user.username, req.body);
  
  // Hot-reload client console parameters & connection settings
  reloadConsoleStream(req.user.username);
  startClientWhatsApp(req.user.username);

  res.json({ success: true, config });
});

app.get('/api/client/leads', authMiddleware, (req, res) => {
  res.json(getLeads(req.user.username));
});

app.post('/api/client/leads/status', authMiddleware, (req, res) => {
  const { phone, status } = req.body;
  const success = updateLeadStatus(req.user.username, phone, status);
  if (success) {
    io.to(`client_${req.user.username}`).emit('leads_update', getLeads(req.user.username));
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Lead not found.' });
  }
});

app.post('/api/client/leads/resolve-escalation', authMiddleware, (req, res) => {
  const { phone } = req.body;
  const success = resolveEscalation(req.user.username, phone);
  if (success) {
    io.to(`client_${req.user.username}`).emit('leads_update', getLeads(req.user.username));
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Escalation not found.' });
  }
});

app.delete('/api/client/leads/:phone', authMiddleware, (req, res) => {
  const { phone } = req.params;
  const success = deleteLead(req.user.username, phone);
  if (success) {
    io.to(`client_${req.user.username}`).emit('leads_update', getLeads(req.user.username));
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Lead not found.' });
  }
});

app.post('/api/client/logout-whatsapp', authMiddleware, async (req, res) => {
  try {
    await logoutClientWhatsApp(req.user.username);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Socket.io Handshake Token validation
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error('Unauthorized'));

  const payload = verifyToken(token);
  if (!payload) return next(new Error('Unauthorized'));

  socket.user = payload;
  next();
});

// Socket.io Connection multiplexer
io.on('connection', (socket) => {
  const username = socket.user.username;
  const role = socket.user.role;

  // Sandbox current socket into user-specific room
  socket.join(`client_${username}`);

  if (role === 'client') {
    // Dispatch initial pairing status and isolated leads list
    socket.emit('whatsapp_status', getClientWhatsAppStatus(username));
    socket.emit('leads_update', getLeads(username));

    // Stream logs history
    const logsHistory = getConsoleHistory(username);
    for (const line of logsHistory) {
      socket.emit('console_line', line);
    }

    // Bind metrics checks
    const user = getUser(username);
    socket.emit('stats_update', {
      messageCount: user?.messageCount || 0,
      messageLimit: user?.messageLimit || 100,
      expiresAt: user?.expiresAt
    });

    // Listen for client console execution inputs
    socket.on('send_command', async (cmd) => {
      if (!cmd || !cmd.trim()) return;
      console.log(`[Console] [${username}] > ${cmd}`);

      const result = await sendConsoleCommand(username, cmd.trim());
      if (!result.success) {
        socket.emit('console_line', `[Console Error] ${result.reason}`);
      }
    });
  } 
  else if (role === 'admin') {
    // Admins receive the whole master logs feed
    const logsHistory = getConsoleHistory('admin');
    for (const line of logsHistory) {
      socket.emit('console_line', line);
    }
  }
});

// Start interceptor
setupConsoleLogger(io);

// Start multi-instance whatsapp runner
initWhatsApp(io);

// Start server
const port = process.env.PORT || getConfig().server?.port || 3000;
server.listen(port, () => {
  console.log(`[Server] Multi-tenant dashboard running on port ${port}`);
});

// Handle safe shutdowns
function shutdown() {
  console.log('[Server] Shutting down multi-tenant server...');
  server.close(() => {
    console.log('[Server] Terminal complete.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 3000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
