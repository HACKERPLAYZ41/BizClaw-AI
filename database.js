import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'database.json');

const DEFAULT_DB = {
  users: [],             // Registered clients
  licenses: [],          // License keys
  configs: {},           // Client configs
  businessProfiles: {},  // Business onboarding info: { username: { name, category, services, pricing, hours, location, phone, gbpLink, keywords } }
  gbpPosts: {},          // AI-generated Google posts: { username: [ { id, topic, content, createdAt, status } ] }
  reviewsHistory: {},    // Review logs: { username: [ { id, reviewerName, rating, reviewText, replyText, sentiment, escalated, createdAt } ] }
  leads: {},             // Client leads
  chatHistory: {},       // Message histories
  escalations: {}        // Support locks
};

function isSafeKey(key) {
  if (typeof key !== 'string') return false;
  const k = key.toLowerCase();
  return k !== '__proto__' && k !== 'constructor' && k !== 'prototype';
}

let dbCache = null;

function readDb() {
  if (dbCache) return dbCache;
  try {
    if (!fs.existsSync(DB_PATH)) {
      writeDb(DEFAULT_DB);
      dbCache = JSON.parse(JSON.stringify(DEFAULT_DB));
      return dbCache;
    }
    const rawData = fs.readFileSync(DB_PATH, 'utf8');
    dbCache = JSON.parse(rawData);
    
    // Migration: Ensure all keys exist
    for (const key of Object.keys(DEFAULT_DB)) {
      if (dbCache[key] === undefined) {
        dbCache[key] = JSON.parse(JSON.stringify(DEFAULT_DB[key]));
      }
    }
    return dbCache;
  } catch (error) {
    console.error('[Database] Failed to read database, falling back to default:', error);
    dbCache = JSON.parse(JSON.stringify(DEFAULT_DB));
    return dbCache;
  }
}

function writeDb(data) {
  try {
    dbCache = data;
    const tempPath = DB_PATH + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, DB_PATH);
  } catch (error) {
    console.error('[Database] Failed to write database atomically:', error);
  }
}

// Default client configuration template
const DEFAULT_CLIENT_CONFIG = {
  ai: {
    provider: 'openrouter',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    temperature: 0.7
  },
  business_agent: {
    name: 'BizClaw AI',
    system_prompt: '',
    auto_lead_capture: true,
    escalation_keywords: ['human', 'manager', 'complaint', 'refund', 'support', 'owner']
  }
};

// --- User Management ---

export function getUsers() {
  const db = readDb();
  return db.users || [];
}

export function getUser(username) {
  const db = readDb();
  return db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

export function createUser({ username, passwordHash, role = 'client', licenseKey = null, expiresAt = null, messageLimit = 100 }) {
  const db = readDb();
  
  const existing = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (existing) return null;

  const newUser = {
    username,
    passwordHash,
    role,
    licenseKey,
    createdAt: new Date().toISOString(),
    expiresAt,
    messageLimit,
    messageCount: 0,
    status: 'active'
  };

  db.users.push(newUser);
  writeDb(db);
  return newUser;
}

export function updateUserLimits(username, { messageLimit, expiresAt, status }) {
  const db = readDb();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (user) {
    if (messageLimit !== undefined) user.messageLimit = messageLimit;
    if (expiresAt !== undefined) user.expiresAt = expiresAt;
    if (status !== undefined) user.status = status;
    writeDb(db);
    return true;
  }
  return false;
}

export function incrementUserMessageCount(username) {
  const db = readDb();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (user) {
    user.messageCount = (user.messageCount || 0) + 1;
    writeDb(db);
    return user.messageCount;
  }
  return 0;
}

export function deleteUser(username) {
  const db = readDb();
  const initialLength = db.users.length;
  db.users = db.users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
  
  if (db.users.length !== initialLength) {
    delete db.configs[username];
    delete db.businessProfiles[username];
    delete db.gbpPosts[username];
    delete db.reviewsHistory[username];
    delete db.leads[username];
    delete db.chatHistory[username];
    delete db.escalations[username];
    writeDb(db);
    return true;
  }
  return false;
}

// --- License Management ---

export function getLicenses() {
  const db = readDb();
  return db.licenses || [];
}

export function generateLicense({ days, messageLimit }) {
  const db = readDb();
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const genSeg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const key = `${genSeg()}-${genSeg()}-${genSeg()}`;

  const newLicense = {
    key,
    days: parseInt(days, 10),
    messageLimit: parseInt(messageLimit, 10),
    usedBy: null,
    createdAt: new Date().toISOString()
  };

  db.licenses.push(newLicense);
  writeDb(db);
  return newLicense;
}

export function getLicense(key) {
  const db = readDb();
  return db.licenses.find(l => l.key.toUpperCase() === key.toUpperCase());
}

export function useLicense(key, username) {
  const db = readDb();
  const license = db.licenses.find(l => l.key.toUpperCase() === key.toUpperCase());
  if (license && !license.usedBy) {
    license.usedBy = username;
    license.usedAt = new Date().toISOString();
    writeDb(db);
    return license;
  }
  return null;
}

// --- Config & Business Profile Management ---

export function getUserConfig(username) {
  if (!isSafeKey(username)) return null;
  const db = readDb();
  if (!db.configs[username]) {
    db.configs[username] = JSON.parse(JSON.stringify(DEFAULT_CLIENT_CONFIG));
    writeDb(db);
  }
  return db.configs[username];
}

export function updateUserConfig(username, newConfig) {
  if (!isSafeKey(username)) return null;
  const db = readDb();
  if (!db.configs[username]) {
    db.configs[username] = JSON.parse(JSON.stringify(DEFAULT_CLIENT_CONFIG));
  }

  for (const key of Object.keys(newConfig)) {
    if (!isSafeKey(key)) continue;
    if (typeof newConfig[key] === 'object' && newConfig[key] !== null && db.configs[username][key]) {
      for (const subKey of Object.keys(newConfig[key])) {
        if (!isSafeKey(subKey)) continue;
        db.configs[username][key][subKey] = newConfig[key][subKey];
      }
    } else {
      db.configs[username][key] = newConfig[key];
    }
  }

  writeDb(db);
  return db.configs[username];
}

export function getBusinessProfile(username) {
  if (!isSafeKey(username)) return null;
  const db = readDb();
  return db.businessProfiles[username] || {
    name: '',
    category: '',
    services: '',
    pricing: '',
    hours: '',
    location: '',
    phone: '',
    gbpLink: '',
    keywords: ''
  };
}

export function updateBusinessProfile(username, data) {
  if (!isSafeKey(username)) return null;
  const db = readDb();
  db.businessProfiles[username] = {
    ...(db.businessProfiles[username] || {}),
    ...data,
    updatedAt: new Date().toISOString()
  };
  writeDb(db);
  return db.businessProfiles[username];
}

// --- GBP Posts History ---

export function getGBPPosts(username) {
  if (!isSafeKey(username)) return [];
  const db = readDb();
  return db.gbpPosts[username] || [];
}

export function addGBPPost(username, postData) {
  if (!isSafeKey(username)) return null;
  const db = readDb();
  if (!db.gbpPosts[username]) db.gbpPosts[username] = [];

  const record = {
    id: 'gbp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    topic: postData.topic || 'Google Post',
    content: postData.content,
    createdAt: new Date().toISOString(),
    status: postData.status || 'Draft'
  };

  db.gbpPosts[username].unshift(record);
  // Keep last 50 posts
  if (db.gbpPosts[username].length > 50) {
    db.gbpPosts[username] = db.gbpPosts[username].slice(0, 50);
  }

  writeDb(db);
  return record;
}

// --- Reviews History ---

export function getReviewsHistory(username) {
  if (!isSafeKey(username)) return [];
  const db = readDb();
  return db.reviewsHistory[username] || [];
}

export function addReviewRecord(username, reviewData) {
  if (!isSafeKey(username)) return null;
  const db = readDb();
  if (!db.reviewsHistory[username]) db.reviewsHistory[username] = [];

  const record = {
    id: 'rev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    reviewerName: reviewData.reviewerName || 'Customer',
    rating: reviewData.rating || 5,
    reviewText: reviewData.reviewText || '',
    replyText: reviewData.replyText || '',
    sentiment: reviewData.sentiment || 'Positive',
    escalated: reviewData.escalated || false,
    createdAt: new Date().toISOString()
  };

  db.reviewsHistory[username].unshift(record);
  if (db.reviewsHistory[username].length > 50) {
    db.reviewsHistory[username] = db.reviewsHistory[username].slice(0, 50);
  }

  writeDb(db);
  return record;
}

// --- Leads Management ---

export function getLeads(username) {
  if (!isSafeKey(username)) return [];
  const db = readDb();
  return db.leads[username] || [];
}

export function addLead(username, { phone, name, summary, status = 'New' }) {
  if (!isSafeKey(username) || !isSafeKey(phone)) return null;
  const db = readDb();
  if (!db.leads[username]) db.leads[username] = [];
  
  const existingIdx = db.leads[username].findIndex(l => l.phone === phone);
  const leadData = {
    phone,
    name: name || 'Unknown Customer',
    summary: summary || 'No details provided',
    status,
    timestamp: new Date().toISOString()
  };
  
  if (existingIdx !== -1) {
    db.leads[username][existingIdx] = { 
      ...db.leads[username][existingIdx], 
      ...leadData, 
      status: db.leads[username][existingIdx].status === 'Urgent' ? 'Urgent' : status 
    };
  } else {
    db.leads[username].push(leadData);
  }
  
  writeDb(db);
  return leadData;
}

export function updateLeadStatus(username, phone, status) {
  if (!isSafeKey(username) || !isSafeKey(phone)) return false;
  const db = readDb();
  if (!db.leads[username]) return false;
  
  const lead = db.leads[username].find(l => l.phone === phone);
  if (lead) {
    lead.status = status;
    writeDb(db);
    return true;
  }
  return false;
}

export function deleteLead(username, phone) {
  if (!isSafeKey(username) || !isSafeKey(phone)) return false;
  const db = readDb();
  if (!db.leads[username]) return false;
  
  const initialLength = db.leads[username].length;
  db.leads[username] = db.leads[username].filter(l => l.phone !== phone);
  
  if (db.leads[username].length !== initialLength) {
    writeDb(db);
    return true;
  }
  return false;
}

// --- Chat History ---

export function getChatHistory(username, phone) {
  if (!isSafeKey(username) || !isSafeKey(phone)) return [];
  const db = readDb();
  if (!db.chatHistory[username]) db.chatHistory[username] = {};
  return db.chatHistory[username][phone] || [];
}

export function addChatMessage(username, phone, role, content) {
  if (!isSafeKey(username) || !isSafeKey(phone)) return [];
  const db = readDb();
  if (!db.chatHistory[username]) db.chatHistory[username] = {};
  if (!db.chatHistory[username][phone]) db.chatHistory[username][phone] = [];
  
  db.chatHistory[username][phone].push({
    role,
    content,
    timestamp: new Date().toISOString()
  });
  
  if (db.chatHistory[username][phone].length > 20) {
    db.chatHistory[username][phone] = db.chatHistory[username][phone].slice(-20);
  }
  
  writeDb(db);
  return db.chatHistory[username][phone];
}

export function clearChatHistory(username, phone) {
  if (!isSafeKey(username) || !isSafeKey(phone)) return false;
  const db = readDb();
  if (db.chatHistory[username] && db.chatHistory[username][phone]) {
    delete db.chatHistory[username][phone];
    writeDb(db);
    return true;
  }
  return false;
}

// --- Escalation ---

export function getEscalation(username, phone) {
  if (!isSafeKey(username) || !isSafeKey(phone)) return null;
  const db = readDb();
  if (!db.escalations[username]) db.escalations[username] = {};
  return db.escalations[username][phone] || null;
}

export function escalate(username, phone, durationMs = 3600000) {
  if (!isSafeKey(username) || !isSafeKey(phone)) return null;
  const db = readDb();
  if (!db.escalations[username]) db.escalations[username] = {};
  
  db.escalations[username][phone] = {
    phone,
    escalatedAt: new Date().toISOString(),
    expiresAt: Date.now() + durationMs
  };
  
  writeDb(db);
  addLead(username, { phone, status: 'Urgent' });
  return db.escalations[username][phone];
}

export function resolveEscalation(username, phone) {
  if (!isSafeKey(username) || !isSafeKey(phone)) return false;
  const db = readDb();
  if (!db.escalations[username]) return false;
  
  if (db.escalations[username][phone]) {
    delete db.escalations[username][phone];
    if (db.leads[username]) {
      const lead = db.leads[username].find(l => l.phone === phone);
      if (lead) {
        lead.status = 'Resolved';
      }
    }
    writeDb(db);
    return true;
  }
  return false;
}

export function updateUserPasswordHash(username, newHash) {
  const db = readDb();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (user) {
    user.passwordHash = newHash;
    writeDb(db);
    return true;
  }
  return false;
}
