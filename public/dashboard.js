let socket = null;
let currentRole = null;
let currentTab = 'tab-onboarding';
let token = localStorage.getItem('bizclaw_token');

// DOM Elements
const authContainer = document.getElementById('auth-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const toggleLoginBtn = document.getElementById('toggle-login-btn');
const toggleRegisterBtn = document.getElementById('toggle-register-btn');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');

// Boot check
document.addEventListener('DOMContentLoaded', () => {
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[0]));
      currentRole = payload.role;
      showDashboard(currentRole);
    } catch (e) {
      logout();
    }
  } else {
    showAuth();
  }

  setupEventListeners();
});

function setupEventListeners() {
  toggleLoginBtn?.addEventListener('click', () => {
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
    toggleLoginBtn.className = 'flex-1 py-2 text-sm font-semibold rounded-lg text-white bg-purple-600/20 border border-purple-500/10';
    toggleRegisterBtn.className = 'flex-1 py-2 text-sm font-semibold rounded-lg text-gray-400 hover:text-white';
  });

  toggleRegisterBtn?.addEventListener('click', () => {
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    toggleRegisterBtn.className = 'flex-1 py-2 text-sm font-semibold rounded-lg text-white bg-purple-600/20 border border-purple-500/10';
    toggleLoginBtn.className = 'flex-1 py-2 text-sm font-semibold rounded-lg text-gray-400 hover:text-white';
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();

      if (data.success) {
        token = data.token;
        localStorage.setItem('bizclaw_token', token);
        currentRole = data.role;
        showDashboard(currentRole);
      } else {
        loginError.textContent = data.error || 'Login failed';
        loginError.classList.remove('hidden');
      }
    } catch (err) {
      loginError.textContent = 'Server connection error';
      loginError.classList.remove('hidden');
    }
  });

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.classList.add('hidden');
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const licenseKey = document.getElementById('register-key').value;

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, licenseKey })
      });
      const data = await res.json();

      if (data.success) {
        showToast('Registration successful! Please login.', 'success');
        toggleLoginBtn.click();
      } else {
        registerError.textContent = data.error || 'Registration failed';
        registerError.classList.remove('hidden');
      }
    } catch (err) {
      registerError.textContent = 'Server error during registration';
      registerError.classList.remove('hidden');
    }
  });

  document.getElementById('logout-btn')?.addEventListener('click', logout);

  // Business Onboarding Form Submit
  document.getElementById('onboarding-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('ob-name').value,
      category: document.getElementById('ob-category').value,
      services: document.getElementById('ob-services').value,
      pricing: document.getElementById('ob-pricing').value,
      hours: document.getElementById('ob-hours').value,
      location: document.getElementById('ob-location').value,
      phone: document.getElementById('ob-phone').value,
      gbpLink: document.getElementById('ob-gbplink').value,
      keywords: document.getElementById('ob-keywords').value
    };

    try {
      const res = await apiFetch('/api/client/business-profile', 'POST', payload);
      if (res.success) {
        showToast('Business profile updated successfully!', 'success');
      }
    } catch (err) {
      showToast('Error saving profile: ' + err.message, 'error');
    }
  });

  // Google Post Generator Form Submit
  document.getElementById('gbp-post-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = document.getElementById('gbp-topic').value;
    const tone = document.getElementById('gbp-tone').value;
    const btn = document.getElementById('btn-gen-gbp');

    btn.disabled = true;
    btn.textContent = 'Generating Post...';

    try {
      const res = await apiFetch('/api/client/agent/gbp-post', 'POST', { topic, tone });
      if (res.success && res.post) {
        document.getElementById('gbp-output-text').textContent = res.post.content;
        document.getElementById('gbp-output-box').classList.remove('hidden');
        showToast('Google Business Post generated!', 'success');
        loadGBPPosts();
      }
    } catch (err) {
      showToast('Generation failed: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate Google Post';
    }
  });

  // Reviews Reply Form Submit
  document.getElementById('review-reply-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const reviewerName = document.getElementById('rev-name').value;
    const rating = parseInt(document.getElementById('rev-rating').value, 10);
    const reviewText = document.getElementById('rev-text').value;

    try {
      const res = await apiFetch('/api/client/agent/reply-review', 'POST', { reviewerName, rating, reviewText });
      if (res.success) {
        showToast('AI reply drafted successfully!', 'success');
        loadReviewsHistory();
        document.getElementById('rev-text').value = '';
      }
    } catch (err) {
      showToast('Error drafting reply: ' + err.message, 'error');
    }
  });

  // WhatsApp Force Logout
  document.getElementById('wa-logout-btn')?.addEventListener('click', async () => {
    if (confirm('Disconnect WhatsApp device?')) {
      try {
        await apiFetch('/api/client/logout-whatsapp', 'POST');
        showToast('WhatsApp logged out.', 'info');
      } catch (e) {}
    }
  });
}

function showAuth() {
  authContainer.classList.remove('hidden');
  dashboardContainer.classList.add('hidden');
  if (socket) socket.disconnect();
}

function showDashboard(role) {
  authContainer.classList.add('hidden');
  dashboardContainer.classList.remove('hidden');

  document.getElementById('role-badge').textContent = role === 'admin' ? 'System Administrator' : 'Client Workspace';

  renderNavTabs(role);
  initSocket();

  if (role === 'client') {
    switchTab('tab-onboarding');
    loadBusinessProfile();
    loadGBPPosts();
    loadReviewsHistory();
    refreshKeyStats();
  } else {
    switchTab('tab-admin-clients');
  }
}

function logout() {
  localStorage.removeItem('bizclaw_token');
  token = null;
  currentRole = null;
  showAuth();
}

function renderNavTabs(role) {
  const navTabs = document.getElementById('nav-tabs');
  const navMobile = document.getElementById('nav-tabs-mobile');

  let tabs = [];
  if (role === 'client') {
    tabs = [
      { id: 'tab-onboarding', label: '📋 Profile Setup' },
      { id: 'tab-gbp', label: '📍 Google Business Agent' },
      { id: 'tab-reviews', label: '⭐ Reviews Agent' },
      { id: 'tab-status', label: '📱 WhatsApp Assistant' },
      { id: 'tab-leads', label: '📊 Lead Manager' },
      { id: 'tab-keys', label: '🔑 OpenRouter Keys' },
      { id: 'tab-console', label: '💻 Terminal Logs' }
    ];
  } else {
    tabs = [
      { id: 'tab-admin-clients', label: 'Clients Registry' },
      { id: 'tab-admin-licenses', label: 'License Generator' },
      { id: 'tab-console', label: 'Master Terminal' }
    ];
  }

  navTabs.innerHTML = tabs.map(t => `
    <button onclick="switchTab('${t.id}')" data-tab="${t.id}" class="nav-btn px-3 py-2 text-xs font-semibold rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition">
      ${t.label}
    </button>
  `).join('');

  navMobile.innerHTML = tabs.map(t => `
    <button onclick="switchTab('${t.id}')" data-tab="${t.id}" class="nav-btn px-2 py-1 text-[11px] font-semibold text-gray-400">
      ${t.label.split(' ')[0]}
    </button>
  `).join('');
}

function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.getElementById(tabId)?.classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('text-purple-400', 'bg-purple-600/10', 'border', 'border-purple-500/20');
      btn.classList.remove('text-gray-400');
    } else {
      btn.classList.remove('text-purple-400', 'bg-purple-600/10', 'border', 'border-purple-500/20');
      btn.classList.add('text-gray-400');
    }
  });

  if (tabId === 'tab-keys') refreshKeyStats();
}

// API Fetch Wrapper
async function apiFetch(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(endpoint, options);
  if (res.status === 401) {
    logout();
    throw new Error('Session expired');
  }
  return await res.json();
}

// Business Profile Data Handler
async function loadBusinessProfile() {
  try {
    const profile = await apiFetch('/api/client/business-profile');
    if (profile) {
      document.getElementById('ob-name').value = profile.name || '';
      document.getElementById('ob-category').value = profile.category || 'Salon & Spa';
      document.getElementById('ob-services').value = profile.services || '';
      document.getElementById('ob-pricing').value = profile.pricing || '';
      document.getElementById('ob-hours').value = profile.hours || '';
      document.getElementById('ob-location').value = profile.location || '';
      document.getElementById('ob-phone').value = profile.phone || '';
      document.getElementById('ob-gbplink').value = profile.gbpLink || '';
      document.getElementById('ob-keywords').value = profile.keywords || '';
    }
  } catch (err) {
    console.error('Failed to load business profile:', err);
  }
}

// Google Posts Handler
async function loadGBPPosts() {
  try {
    const posts = await apiFetch('/api/client/agent/gbp-posts');
    const tbody = document.getElementById('gbp-posts-body');
    if (!tbody) return;

    if (!Array.isArray(posts) || posts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="px-4 py-4 text-center text-gray-500">No generated posts yet. Generate your first post above!</td></tr>`;
      return;
    }

    tbody.innerHTML = posts.map(p => `
      <tr class="hover:bg-white/5">
        <td class="px-4 py-3 font-semibold text-purple-400">${escapeHtml(p.topic)}</td>
        <td class="px-4 py-3 text-gray-300 whitespace-pre-line max-w-md">${escapeHtml(p.content)}</td>
        <td class="px-4 py-3 text-gray-500">${new Date(p.createdAt).toLocaleDateString()}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load GBP posts:', err);
  }
}

async function requestLocalKeywords() {
  try {
    showToast('Analyzing local SEO keywords...', 'info');
    const res = await apiFetch('/api/client/agent/keywords', 'POST', {});
    if (res.success && res.suggestions) {
      document.getElementById('gbp-output-text').textContent = res.suggestions;
      document.getElementById('gbp-output-box').classList.remove('hidden');
      showToast('Local SEO keyword report generated!', 'success');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function requestReviewRequestLink() {
  try {
    const res = await apiFetch('/api/client/agent/review-request', 'POST', { customerName: 'Valued Customer' });
    if (res.success && res.message) {
      document.getElementById('gbp-output-text').textContent = res.message;
      document.getElementById('gbp-output-box').classList.remove('hidden');
      showToast('Review request template generated!', 'success');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function copyGBPOutput() {
  const text = document.getElementById('gbp-output-text').textContent;
  navigator.clipboard.writeText(text);
  showToast('Copied to clipboard!', 'success');
}

// Reviews Handler
async function loadReviewsHistory() {
  try {
    const reviews = await apiFetch('/api/client/agent/reviews');
    const tbody = document.getElementById('reviews-table-body');
    if (!tbody) return;

    if (!Array.isArray(reviews) || reviews.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">No review logs yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = reviews.map(r => `
      <tr class="hover:bg-white/5">
        <td class="px-4 py-3 font-semibold text-white">${escapeHtml(r.reviewerName)}</td>
        <td class="px-4 py-3 font-bold text-amber-400">${'⭐'.repeat(r.rating)} (${r.rating}/5)</td>
        <td class="px-4 py-3 text-gray-300 max-w-xs">${escapeHtml(r.reviewText)}</td>
        <td class="px-4 py-3 text-purple-300 max-w-xs">${escapeHtml(r.replyText)}</td>
        <td class="px-4 py-3">
          ${r.escalated 
            ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-400 border border-red-500/20">URGENT ESCALATED</span>`
            : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/20">RESOLVED</span>`
          }
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load reviews history:', err);
  }
}

// Key Stats Handler
async function refreshKeyStats() {
  try {
    const stats = await apiFetch('/api/client/key-stats');
    if (!stats) return;

    document.getElementById('key-total').textContent = stats.totalKeys || 0;
    document.getElementById('key-active').textContent = stats.activeKeys || 0;
    document.getElementById('key-cooldown').textContent = stats.coolingDownKeys || 0;

    const tbody = document.getElementById('keys-table-body');
    if (!tbody) return;

    if (!Array.isArray(stats.keys) || stats.keys.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No OpenRouter keys configured in env.</td></tr>`;
      return;
    }

    tbody.innerHTML = stats.keys.map(k => `
      <tr class="hover:bg-white/5">
        <td class="px-6 py-3 text-purple-400 font-bold">${escapeHtml(k.maskedKey)}</td>
        <td class="px-6 py-3 text-white">${k.requestsInCurrentWindow} / ${stats.maxRequestsPerMinute} req/min</td>
        <td class="px-6 py-3">
          ${k.isCoolingDown 
            ? `<span class="px-2 py-0.5 rounded text-[10px] bg-amber-950 text-amber-400 border border-amber-500/20 font-bold">COOLDOWN (${k.cooldownRemainingSec}s)</span>`
            : `<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-500/20 font-bold">READY</span>`
          }
        </td>
        <td class="px-6 py-3 text-emerald-400">${k.totalSuccess}</td>
        <td class="px-6 py-3 text-red-400">${k.totalFailures}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load key stats:', err);
  }
}

// Socket.io Connection & Events
function initSocket() {
  if (socket) socket.disconnect();

  socket = io({
    auth: { token }
  });

  socket.on('whatsapp_status', (data) => {
    updateWhatsAppStatusUI(data);
  });

  socket.on('leads_update', (leads) => {
    renderLeadsTable(leads);
  });

  socket.on('stats_update', (stats) => {
    updateStatsUI(stats);
  });

  socket.on('console_line', (line) => {
    appendTerminalLine(line);
  });
}

function updateWhatsAppStatusUI(data) {
  const statusText = document.getElementById('status-text');
  const statusSubtext = document.getElementById('status-subtext');
  const qrLoading = document.getElementById('qr-loading');
  const qrContainer = document.getElementById('qr-container');
  const qrImage = document.getElementById('qr-image');
  const connectedBanner = document.getElementById('connected-banner');
  const waLogoutBtn = document.getElementById('wa-logout-btn');

  if (!statusText) return;

  if (data.status === 'connected') {
    statusText.textContent = 'CONNECTED';
    statusText.className = 'text-xl font-bold tracking-wide uppercase text-emerald-400';
    statusSubtext.textContent = '24/7 AI Assistant Active';

    qrLoading.classList.add('hidden');
    qrContainer.classList.add('hidden');
    connectedBanner.classList.remove('hidden');
    waLogoutBtn.classList.remove('hidden');
  } else if (data.status === 'pairing' && data.qr) {
    statusText.textContent = 'PAIRING WAITING';
    statusText.className = 'text-xl font-bold tracking-wide uppercase text-amber-400';
    statusSubtext.textContent = 'Scan QR code with phone.';

    qrLoading.classList.add('hidden');
    connectedBanner.classList.add('hidden');
    qrContainer.classList.remove('hidden');
    qrImage.src = data.qr;
    waLogoutBtn.classList.add('hidden');
  } else {
    statusText.textContent = 'DISCONNECTED';
    statusText.className = 'text-xl font-bold tracking-wide uppercase text-gray-400';
    statusSubtext.textContent = 'Waiting for instance startup...';

    qrLoading.classList.remove('hidden');
    qrContainer.classList.add('hidden');
    connectedBanner.classList.add('hidden');
    waLogoutBtn.classList.add('hidden');
  }
}

function renderLeadsTable(leads) {
  const tbody = document.getElementById('leads-table-body');
  if (!tbody) return;

  if (!Array.isArray(leads) || leads.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-6 text-center text-gray-500">No leads captured yet. Inbound customer chats will appear here.</td></tr>`;
    return;
  }

  tbody.innerHTML = leads.map(l => `
    <tr class="hover:bg-white/5">
      <td class="px-6 py-4 font-semibold text-white">${escapeHtml(l.name)}</td>
      <td class="px-6 py-4 font-mono text-purple-400">${escapeHtml(l.phone)}</td>
      <td class="px-6 py-4 text-gray-300 max-w-xs">${escapeHtml(l.summary)}</td>
      <td class="px-6 py-4 text-gray-500 text-xs">${new Date(l.timestamp).toLocaleDateString()}</td>
      <td class="px-6 py-4">
        ${l.status === 'Urgent' 
          ? `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-red-950 text-red-400 border border-red-500/30">URGENT CALL</span>`
          : `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-950 text-purple-300 border border-purple-500/20">${escapeHtml(l.status)}</span>`
        }
      </td>
      <td class="px-6 py-4 text-right flex justify-end gap-2">
        <button onclick="generateLeadFollowUpMsg('${escapeHtml(l.name)}', '${escapeHtml(l.summary)}')" class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-xs font-semibold text-white">Send Offer</button>
      </td>
    </tr>
  `).join('');
}

async function generateLeadFollowUpMsg(leadName, summary) {
  try {
    showToast('Drafting re-engagement offer message...', 'info');
    const res = await apiFetch('/api/client/agent/lead-followup', 'POST', {
      leadName,
      summary,
      offerDetails: '15% special discount on your next visit!'
    });
    if (res.success && res.message) {
      alert(`Generated Follow-up Message for ${leadName}:\n\n${res.message}`);
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

function updateStatsUI(stats) {
  const quotaText = document.getElementById('quota-text');
  const quotaBar = document.getElementById('quota-bar');
  const expiryText = document.getElementById('expiry-text');

  if (quotaText && stats.messageLimit) {
    quotaText.textContent = `${stats.messageCount || 0} / ${stats.messageLimit}`;
    const pct = Math.min(100, Math.round(((stats.messageCount || 0) / stats.messageLimit) * 100));
    if (quotaBar) quotaBar.style.width = `${pct}%`;
  }

  if (expiryText && stats.expiresAt) {
    const remainingDays = Math.max(0, Math.ceil((stats.expiresAt - Date.now()) / (1000 * 60 * 60 * 24)));
    expiryText.textContent = `${remainingDays} Days Left`;
  }
}

function appendTerminalLine(line) {
  const pane = document.getElementById('terminal-pane');
  if (!pane) return;

  const div = document.createElement('div');
  div.className = 'whitespace-pre-wrap font-mono';
  div.textContent = line;
  pane.appendChild(div);
  pane.scrollTop = pane.scrollHeight;
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  const toastIcon = document.getElementById('toast-icon');

  if (!toast) return;

  toastMsg.textContent = msg;
  toastIcon.textContent = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';

  toast.classList.remove('hidden', 'translate-y-10', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-10', 'opacity-0');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
