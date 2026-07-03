let socket = null;
let currentToken = localStorage.getItem('dashboard_token');
let currentRole = localStorage.getItem('dashboard_role');

document.addEventListener('DOMContentLoaded', () => {
  setupAuthForms();
  if (currentToken && currentRole) {
    mountDashboard(currentToken, currentRole);
  }
});

// --- Dynamic Auth panels toggles & submits ---

function setupAuthForms() {
  const authContainer = document.getElementById('auth-container');
  const dashboardContainer = document.getElementById('dashboard-container');
  
  const toggleLogin = document.getElementById('toggle-login-btn');
  const toggleReg = document.getElementById('toggle-register-btn');
  
  const loginForm = document.getElementById('login-form');
  const regForm = document.getElementById('register-form');
  
  const loginError = document.getElementById('login-error');
  const regError = document.getElementById('register-error');

  toggleLogin.addEventListener('click', () => {
    toggleLogin.className = "flex-1 py-2 text-sm font-semibold rounded-lg text-white bg-purple-600/20 border border-purple-500/10";
    toggleReg.className = "flex-1 py-2 text-sm font-semibold rounded-lg text-gray-400 hover:text-white";
    loginForm.classList.remove('hidden');
    regForm.classList.add('hidden');
    loginError.classList.add('hidden');
    regError.classList.add('hidden');
  });

  toggleReg.addEventListener('click', () => {
    toggleReg.className = "flex-1 py-2 text-sm font-semibold rounded-lg text-white bg-purple-600/20 border border-purple-500/10";
    toggleLogin.className = "flex-1 py-2 text-sm font-semibold rounded-lg text-gray-400 hover:text-white";
    regForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    loginError.classList.add('hidden');
    regError.classList.add('hidden');
  });

  // Login handler
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('dashboard_token', data.token);
        localStorage.setItem('dashboard_role', data.role);
        
        currentToken = data.token;
        currentRole = data.role;

        authContainer.classList.add('hidden');
        dashboardContainer.classList.remove('hidden');
        mountDashboard(currentToken, currentRole);
      } else {
        loginError.innerText = data.error || 'Invalid credentials';
        loginError.classList.remove('hidden');
      }
    } catch (err) {
      loginError.innerText = 'Failed to connect to authentication server.';
      loginError.classList.remove('hidden');
    }
  });

  // Register handler
  regForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    regError.classList.add('hidden');

    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value;
    const licenseKey = document.getElementById('register-key').value.trim();

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, licenseKey })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert('Account created successfully! You can now log in.');
        toggleLogin.click();
        document.getElementById('login-username').value = username;
      } else {
        regError.innerText = data.error || 'Registration failed.';
        regError.classList.remove('hidden');
      }
    } catch (err) {
      regError.innerText = 'Failed to connect to authentication server.';
      regError.classList.remove('hidden');
    }
  });

  // Top header lock session trigger
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('dashboard_token');
    localStorage.removeItem('dashboard_role');
    location.reload();
  });
}

// --- Mount Dashboard Views & WebSockets ---

function mountDashboard(token, role) {
  const roleBadge = document.getElementById('role-badge');
  const navTabs = document.getElementById('nav-tabs');
  const navTabsMobile = document.getElementById('nav-tabs-mobile');

  // Configure views based on role
  if (role === 'admin') {
    roleBadge.innerText = "Owner Dashboard";
    roleBadge.className = "text-[10px] text-purple-400 uppercase font-bold tracking-wider";

    // Setup owner headers tabs
    const adminTabs = `
      <button data-tab="admin-licenses" class="nav-tab px-4 py-2 rounded-lg text-sm font-medium transition text-white bg-purple-600/20 border border-purple-500/20">Licenses</button>
      <button data-tab="admin-clients" class="nav-tab px-4 py-2 rounded-lg text-sm font-medium transition text-gray-400 hover:text-white hover:bg-white/5">Clients</button>
      <button data-tab="console" class="nav-tab px-4 py-2 rounded-lg text-sm font-medium transition text-gray-400 hover:text-white hover:bg-white/5">System Logs</button>
    `;
    navTabs.innerHTML = adminTabs;
    navTabsMobile.innerHTML = `
      <button data-tab="admin-licenses" class="nav-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition text-white bg-purple-600/20 border border-purple-500/20">Licenses</button>
      <button data-tab="admin-clients" class="nav-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition text-gray-400">Clients</button>
      <button data-tab="console" class="nav-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition text-gray-400">Logs</button>
    `;

    // Swap admin tabs view
    document.getElementById('tab-admin-licenses').classList.remove('hidden');
    document.getElementById('tab-status').classList.add('hidden'); // Client status tab hidden

    setupAdminDashboard(token);
  } 
  else {
    roleBadge.innerText = "Client Dashboard";
    roleBadge.className = "text-[10px] text-emerald-400 uppercase font-bold tracking-wider";

    // Setup client headers tabs (Console removed for client simplicity)
    const clientTabs = `
      <button data-tab="status" class="nav-tab px-4 py-2 rounded-lg text-sm font-medium transition text-white bg-purple-600/20 border border-purple-500/20">WhatsApp Status</button>
      <button data-tab="config" class="nav-tab px-4 py-2 rounded-lg text-sm font-medium transition text-gray-400 hover:text-white hover:bg-white/5">AI Settings</button>
      <button data-tab="leads" class="nav-tab px-4 py-2 rounded-lg text-sm font-medium transition text-gray-400 hover:text-white hover:bg-white/5">CRM Leads</button>
    `;
    navTabs.innerHTML = clientTabs;
    navTabsMobile.innerHTML = `
      <button data-tab="status" class="nav-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition text-white bg-purple-600/20 border border-purple-500/20">WhatsApp</button>
      <button data-tab="config" class="nav-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition text-gray-400">AI Config</button>
      <button data-tab="leads" class="nav-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition text-gray-400">CRM Leads</button>
    `;

    document.getElementById('tab-status').classList.remove('hidden');
    
    setupClientDashboard(token);
  }

  // Setup tab routing switches
  setupTabs();
  
  // Start general socket session
  startSocketSession(token, role);
}

// Bind tabs clicks loops
function setupTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');

      // Sync active styling classes
      tabs.forEach(t => {
        if (t.getAttribute('data-tab') === target) {
          if (t.classList.contains('py-1.5')) {
            t.className = "nav-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition text-white bg-purple-600/20 border border-purple-500/20";
          } else {
            t.className = "nav-tab px-4 py-2 rounded-lg text-sm font-medium transition text-white bg-purple-600/20 border border-purple-500/20";
          }
        } else {
          if (t.classList.contains('py-1.5')) {
            t.className = "nav-tab px-3 py-1.5 rounded-lg text-xs font-semibold transition text-gray-400 hover:text-white";
          } else {
            t.className = "nav-tab px-4 py-2 rounded-lg text-sm font-medium transition text-gray-400 hover:text-white hover:bg-white/5";
          }
        }
      });

      // Toggle divs
      contents.forEach(content => {
        if (content.id === `tab-${target}`) {
          content.classList.remove('hidden');
        } else {
          content.classList.add('hidden');
        }
      });

      // Lazy loads
      if (target === 'config') {
        fetchClientConfiguration();
      }
      if (target === 'admin-licenses') {
        fetchAdminLicenses();
      }
      if (target === 'admin-clients') {
        fetchAdminClients();
      }
    });
  });
}

// --- Socket Receiver Handlers ---

function startSocketSession(token, role) {
  socket = io({ auth: { token } });

  socket.on('connect_error', () => {
    localStorage.removeItem('dashboard_token');
    localStorage.removeItem('dashboard_role');
    location.reload();
  });

  // Consoles line logger outputs
  const terminalPane = document.getElementById('terminal-pane');
  socket.on('console_line', (line) => {
    if (!terminalPane) return;
    const p = document.createElement('div');
    if (line.includes('[WARN]')) {
      p.className = 'text-yellow-400';
    } else if (line.includes('[ERROR]')) {
      p.className = 'text-red-400';
    } else if (line.includes('>') || line.startsWith('>')) {
      p.className = 'text-indigo-400 font-bold';
    } else {
      p.className = 'text-gray-300';
    }
    p.textContent = line;
    terminalPane.appendChild(p);

    if (terminalPane.children.length > 500) {
      terminalPane.removeChild(terminalPane.firstChild);
    }
    terminalPane.scrollTop = terminalPane.scrollHeight;
  });

  // Form submit shell command dispatcher
  const terminalForm = document.getElementById('terminal-form');
  const terminalInput = document.getElementById('terminal-input');
  
  if (terminalForm) {
    terminalForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const cmd = terminalInput.value;
      if (cmd && cmd.trim()) {
        socket.emit('send_command', cmd);
        terminalInput.value = '';
      }
    });
  }

  // Client role WebSocket events
  if (role === 'client') {
    const qrLoading = document.getElementById('qr-loading');
    const qrContainer = document.getElementById('qr-container');
    const qrImage = document.getElementById('qr-image');
    const connectedBanner = document.getElementById('connected-banner');
    const statusPulseCore = document.getElementById('status-pulse-core');
    const statusPulse = document.getElementById('status-pulse');
    const statusText = document.getElementById('status-text');
    const statusSubtext = document.getElementById('status-subtext');
    const waLogoutBtn = document.getElementById('wa-logout-btn');

    socket.on('whatsapp_status', (data) => {
      const { status, qr } = data;
      
      qrLoading.classList.add('hidden');
      qrContainer.classList.add('hidden');
      connectedBanner.classList.add('hidden');
      waLogoutBtn.classList.add('hidden');

      if (status === 'connected') {
        connectedBanner.classList.remove('hidden');
        waLogoutBtn.classList.remove('hidden');
        
        statusPulse.className = "w-5 h-5 rounded-full flex items-center justify-center bg-emerald-500/20";
        statusPulseCore.className = "w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse";
        statusText.className = "text-xl font-bold tracking-wide uppercase text-emerald-400";
        statusText.innerText = "Connected";
        statusSubtext.innerText = "AI Assistant is currently online.";
      } 
      else if (status === 'pairing' && qr) {
        qrContainer.classList.remove('hidden');
        qrImage.src = qr;

        statusPulse.className = "w-5 h-5 rounded-full flex items-center justify-center bg-yellow-500/20";
        statusPulseCore.className = "w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse";
        statusText.className = "text-xl font-bold tracking-wide uppercase text-yellow-400";
        statusText.innerText = "Pairing";
        statusSubtext.innerText = "Scan pairing code in WhatsApp DMs.";
      } 
      else {
        qrLoading.classList.remove('hidden');
        statusPulse.className = "w-5 h-5 rounded-full flex items-center justify-center bg-red-500/20";
        statusPulseCore.className = "w-2.5 h-2.5 rounded-full bg-red-500";
        statusText.className = "text-xl font-bold tracking-wide uppercase text-red-500";
        statusText.innerText = "Disconnected";
        statusSubtext.innerText = "Instance offline. Tap QR scan.";
      }
    });

    socket.on('leads_update', (leads) => {
      renderLeadsTable(leads);
    });

    // Handle limits quotas and expiration displays
    socket.on('stats_update', (data) => {
      updateClientQuotas(data);
    });

    socket.on('console_status', (data) => {
      const consoleBadge = document.getElementById('console-mode-badge');
      if (consoleBadge) {
        if (data.active) {
          consoleBadge.className = "px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-500/10";
          consoleBadge.innerText = "Pterodactyl link active";
        } else {
          consoleBadge.className = "px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-800 text-gray-300";
          consoleBadge.innerText = "Local Process Logs";
        }
      }
    });
  }
}

// --- Client Dashboard Logic ---

function setupClientDashboard(token) {
  // WhatsApp Logout trigger
  document.getElementById('wa-logout-btn').addEventListener('click', async () => {
    if (confirm('Disconnect WhatsApp device session?')) {
      try {
        const res = await fetch('/api/client/logout-whatsapp', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) showToast('WhatsApp session terminated.');
      } catch (err) {
        showToast('Disconnect failed.', true);
      }
    }
  });

  // Client settings form configuration
  const providerSelect = document.getElementById('config-ai-provider');
  const tempSlider = document.getElementById('config-ai-temperature');
  const tempVal = document.getElementById('temp-val');
  
  const panelGemini = document.getElementById('panel-gemini');
  const panelOpenai = document.getElementById('panel-openai');

  tempSlider.addEventListener('input', (e) => {
    tempVal.innerText = e.target.value;
  });

  providerSelect.addEventListener('change', () => {
    if (providerSelect.value === 'gemini') {
      panelGemini.classList.remove('hidden');
      panelOpenai.classList.add('hidden');
    } else {
      panelGemini.classList.add('hidden');
      panelOpenai.classList.remove('hidden');
    }
  });

  const form = document.getElementById('config-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const payload = {
      pterodactyl: {
        panel_url: document.getElementById('config-ptero-url').value.trim(),
        client_api_key: document.getElementById('config-ptero-key').value.trim(),
        server_id: document.getElementById('config-ptero-id').value.trim()
      },
      ai: {
        provider: providerSelect.value,
        gemini_api_key: document.getElementById('config-gemini-key').value.trim(),
        gemini_model: document.getElementById('config-gemini-model').value,
        openai_api_key: document.getElementById('config-openai-key').value.trim(),
        openai_model: document.getElementById('config-openai-model').value,
        temperature: parseFloat(tempSlider.value)
      },
      business_agent: {
        name: document.getElementById('config-agent-name').value.trim(),
        system_prompt: document.getElementById('config-agent-prompt').value.trim(),
        auto_lead_capture: document.getElementById('config-lead-capture').checked,
        escalation_keywords: document.getElementById('config-escalation-keys').value.split(',').map(s => s.trim()).filter(s => s !== '')
      }
    };

    try {
      const res = await fetch('/api/client/config', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        showToast('AI Settings updated successfully!');
      } else {
        showToast('Error saving settings.', true);
      }
    } catch (err) {
      showToast('Connection error updating parameters.', true);
    }
  });
}

// Retrieve client configurations
async function fetchClientConfiguration() {
  try {
    const res = await fetch('/api/client/config', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    if (!res.ok) return;
    const config = await res.json();

    document.getElementById('config-ai-provider').value = config.ai?.provider || 'gemini';
    document.getElementById('config-ai-provider').dispatchEvent(new Event('change'));

    document.getElementById('config-ai-temperature').value = config.ai?.temperature ?? 0.7;
    document.getElementById('temp-val').innerText = config.ai?.temperature ?? 0.7;

    document.getElementById('config-gemini-key').value = config.ai?.gemini_api_key || '';
    document.getElementById('config-gemini-model').value = config.ai?.gemini_model || 'gemini-2.5-flash';
    document.getElementById('config-openai-key').value = config.ai?.openai_api_key || '';
    document.getElementById('config-openai-model').value = config.ai?.openai_model || 'gpt-4o-mini';

    document.getElementById('config-agent-name').value = config.business_agent?.name || 'ShopAssistant AI';
    document.getElementById('config-agent-prompt').value = config.business_agent?.system_prompt || '';
    document.getElementById('config-lead-capture').checked = !!config.business_agent?.auto_lead_capture;
    document.getElementById('config-escalation-keys').value = (config.business_agent?.escalation_keywords || []).join(', ');

    document.getElementById('config-ptero-url').value = config.pterodactyl?.panel_url || '';
    document.getElementById('config-ptero-key').value = config.pterodactyl?.client_api_key || '';
    document.getElementById('config-ptero-id').value = config.pterodactyl?.server_id || '';

  } catch (err) {
    console.error('Failed to load configs:', err);
  }
}

// Client quotas meter updater
function updateClientQuotas(data) {
  const quotaText = document.getElementById('quota-text');
  const quotaBar = document.getElementById('quota-bar');
  const expiryText = document.getElementById('expiry-text');

  const count = data.messageCount || 0;
  const limit = data.messageLimit || 100;
  quotaText.innerText = `${count} / ${limit}`;

  const pct = Math.min((count / limit) * 100, 100);
  quotaBar.style.width = `${pct}%`;
  
  if (pct >= 100) {
    quotaBar.className = "bg-red-500 h-full rounded-full";
  } else if (pct >= 85) {
    quotaBar.className = "bg-yellow-500 h-full rounded-full";
  } else {
    quotaBar.className = "bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full";
  }

  // Set subscription end date
  if (data.expiresAt) {
    const expiry = new Date(data.expiresAt);
    const diff = expiry - Date.now();
    
    if (diff <= 0) {
      expiryText.innerText = "Expired";
      expiryText.className = "text-base font-bold text-red-500 mt-1 animate-pulse";
    } else {
      const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
      expiryText.innerText = `${daysLeft} Days Left`;
      expiryText.className = "text-base font-bold text-emerald-400 mt-1";
    }
  } else {
    expiryText.innerText = "Permanent / Free";
    expiryText.className = "text-base font-bold text-purple-400 mt-1";
  }
}

// Leads CRM Table rendering
function renderLeadsTable(leads) {
  const tableBody = document.getElementById('leads-table-body');
  const totalLeadsSpan = document.getElementById('stat-total-leads');
  const urgentLeadsSpan = document.getElementById('stat-urgent-leads');

  const total = leads.length;
  const urgent = leads.filter(l => l.status === 'Urgent').length;

  if (totalLeadsSpan) totalLeadsSpan.innerText = total;
  if (urgentLeadsSpan) urgentLeadsSpan.innerText = urgent;

  tableBody.innerHTML = '';

  if (leads.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" class="px-6 py-12 text-center text-gray-500">
          No leads captured yet. Keep bot active.
        </td>
      </tr>
    `;
    return;
  }

  leads.forEach(lead => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-white/[0.02] transition duration-150";

    const formattedDate = new Date(lead.timestamp).toLocaleDateString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    let statusPill = '';
    if (lead.status === 'Urgent') {
      statusPill = `<span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-950/40 text-red-400 border border-red-500/10"><span class="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping"></span>Urgent</span>`;
    } else if (lead.status === 'Active') {
      statusPill = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-500/10">Active</span>`;
    } else {
      statusPill = `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-900/60 text-gray-400 border border-white/5">Resolved</span>`;
    }

    let actionsHtml = '';
    if (lead.status === 'Urgent') {
      actionsHtml += `
        <button onclick="resolveLeadEscalationRest('${lead.phone}')" class="px-3 py-1 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-lg transition mr-2">
          Resolve
        </button>
      `;
    }

    actionsHtml += `
      <select onchange="updateLeadStatusRest('${lead.phone}', this.value)" class="glass-input px-2 py-1 rounded text-xs mr-2">
        <option value="Active" ${lead.status === 'Active' ? 'selected' : ''}>Active</option>
        <option value="Urgent" ${lead.status === 'Urgent' ? 'selected' : ''}>Urgent</option>
        <option value="Resolved" ${lead.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
      </select>
      <button onclick="deleteLeadRest('${lead.phone}')" class="p-1 text-gray-500 hover:text-red-400 transition" title="Delete lead record">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    `;

    tr.innerHTML = `
      <td class="px-6 py-4 font-semibold text-white">${escapeHtml(lead.name)}</td>
      <td class="px-6 py-4 text-xs font-mono text-gray-400">${lead.phone}</td>
      <td class="px-6 py-4 font-medium text-gray-300">${escapeHtml(lead.summary)}</td>
      <td class="px-6 py-4 text-xs text-gray-500">${formattedDate}</td>
      <td class="px-6 py-4">${statusPill}</td>
      <td class="px-6 py-4 text-right">${actionsHtml}</td>
    `;
    tableBody.appendChild(tr);
  });
}

window.updateLeadStatusRest = async function(phone, status) {
  try {
    const res = await fetch('/api/client/leads/status', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ phone, status })
    });
    if (!res.ok) throw new Error();
  } catch (err) {
    showToast('Failed to update status.', true);
  }
};

window.resolveLeadEscalationRest = async function(phone) {
  try {
    const res = await fetch('/api/client/leads/resolve-escalation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ phone })
    });
    if (res.ok) {
      showToast('Escalation resolved. Bot is active on thread.');
    } else throw new Error();
  } catch (err) {
    showToast('Failed to resolve escalation.', true);
  }
};

window.deleteLeadRest = async function(phone) {
  if (confirm('Delete lead record?')) {
    try {
      const res = await fetch(`/api/client/leads/${phone}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      if (res.ok) {
        showToast('Lead deleted.');
      } else throw new Error();
    } catch (err) {
      showToast('Failed to delete lead.', true);
    }
  }
};

// --- Owner (Admin) Dashboard Logic ---

function setupAdminDashboard(token) {
  const licenseForm = document.getElementById('license-generator-form');
  
  // Key generator submit
  licenseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const days = document.getElementById('gen-days').value;
    const messageLimit = document.getElementById('gen-limit').value;

    try {
      const res = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ days, messageLimit })
      });

      if (res.ok) {
        showToast('License Key generated successfully!');
        fetchAdminLicenses(); // Refresh
      } else {
        showToast('Failed to generate license.', true);
      }
    } catch (err) {
      showToast('Connection error generating license.', true);
    }
  });

  // Initial load
  fetchAdminLicenses();
  fetchAdminClients();
}

// Retrieve generated licenses keys list
async function fetchAdminLicenses() {
  try {
    const res = await fetch('/api/admin/licenses', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    if (!res.ok) return;
    const licenses = await res.json();

    const tableBody = document.getElementById('licenses-table-body');
    tableBody.innerHTML = '';

    if (licenses.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" class="px-6 py-8 text-center text-gray-500">
            No license keys generated yet.
          </td>
        </tr>
      `;
      return;
    }

    licenses.reverse().forEach(lic => {
      const tr = document.createElement('tr');
      tr.className = "hover:bg-white/[0.02] border-b border-white/5";

      const formattedDate = new Date(lic.createdAt).toLocaleDateString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      const usedStatus = lic.usedBy 
        ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-500/10">Used: ${escapeHtml(lic.usedBy)}</span>`
        : `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-950/40 text-purple-400 border border-purple-500/10">Unused</span>`;

      tr.innerHTML = `
        <td class="px-6 py-4 font-mono font-bold text-white tracking-wider">${lic.key}</td>
        <td class="px-6 py-4 font-semibold text-gray-300">${lic.days} Days</td>
        <td class="px-6 py-4 text-gray-300 font-medium">${lic.messageLimit} Messages</td>
        <td class="px-6 py-4">${usedStatus}</td>
        <td class="px-6 py-4 text-xs text-gray-500">${formattedDate}</td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load licenses:', err);
  }
}

// Retrieve registered client accounts list
async function fetchAdminClients() {
  try {
    const res = await fetch('/api/admin/clients', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    if (!res.ok) return;
    const clients = await res.json();

    const tableBody = document.getElementById('clients-table-body');
    tableBody.innerHTML = '';

    if (clients.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-8 text-center text-gray-500">
            No clients registered yet.
          </td>
        </tr>
      `;
      return;
    }

    clients.forEach(client => {
      const tr = document.createElement('tr');
      tr.className = "hover:bg-white/[0.02] border-b border-white/5";

      const expiryDate = new Date(client.expiresAt);
      const isExpired = expiryDate < Date.now();
      const expiryText = isExpired 
        ? `<span class="text-red-400 font-semibold uppercase text-xs">Expired (${expiryDate.toLocaleDateString()})</span>`
        : `<span class="text-gray-300 font-medium">${expiryDate.toLocaleDateString()}</span>`;

      const limitPct = Math.min(((client.messageCount || 0) / client.messageLimit) * 100, 100);
      const limitClass = limitPct >= 100 ? 'text-red-400 font-bold' : (limitPct >= 85 ? 'text-yellow-400' : 'text-gray-300');

      let statusPill = '';
      if (client.status === 'suspended') {
        statusPill = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-950/40 text-red-400 border border-red-500/10">Suspended</span>`;
      } else {
        statusPill = `<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-500/10">Active</span>`;
      }

      const suspendAction = client.status === 'suspended'
        ? `<button onclick="updateClientStatusRest('${client.username}', 'active')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded transition mr-2">Activate</button>`
        : `<button onclick="updateClientStatusRest('${client.username}', 'suspended')" class="px-2.5 py-1 bg-red-900/60 hover:bg-red-600 text-red-100 font-bold text-xs rounded transition mr-2">Suspend</button>`;

      tr.innerHTML = `
        <td class="px-6 py-4 font-bold text-white">${escapeHtml(client.username)}</td>
        <td class="px-6 py-4 text-xs font-mono text-gray-400">${client.licenseKey}</td>
        <td class="px-6 py-4">${expiryText}</td>
        <td class="px-6 py-4 ${limitClass}">${client.messageCount || 0} / ${client.messageLimit}</td>
        <td class="px-6 py-4">${statusPill}</td>
        <td class="px-6 py-4 text-right">
          ${suspendAction}
          <button onclick="deleteClientRest('${client.username}')" class="p-1 text-gray-500 hover:text-red-400 transition" title="Delete Account">
            <svg class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  } catch (err) {
    console.error('Failed to load clients:', err);
  }
}

window.updateClientStatusRest = async function(username, status) {
  if (confirm(`Change status for user ${username} to ${status}?`)) {
    try {
      const res = await fetch('/api/admin/clients/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({ username, status })
      });
      if (res.ok) {
        showToast('Client status updated.');
        fetchAdminClients();
      } else throw new Error();
    } catch (err) {
      showToast('Failed to update client status.', true);
    }
  }
};

window.deleteClientRest = async function(username) {
  if (confirm(`Permanently delete account for client "${username}"? All configs and sessions will be wiped.`)) {
    try {
      const res = await fetch(`/api/admin/clients/${username}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      if (res.ok) {
        showToast('Client account deleted.');
        fetchAdminClients();
      } else throw new Error();
    } catch (err) {
      showToast('Failed to delete client.', true);
    }
  }
};

// --- Toast and Escape helpers ---

function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');
  const toastIcon = document.getElementById('toast-icon');

  toastMessage.innerText = message;
  if (isError) {
    toastIcon.className = 'text-red-400';
    toastIcon.innerHTML = `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    `;
  } else {
    toastIcon.className = 'text-purple-400';
    toastIcon.innerHTML = `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    `;
  }

  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.remove('translate-y-10', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('translate-y-10', 'opacity-0');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 300);
  }, 3500);
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- Dynamic AI Prompts Templates helper ---
window.applyPromptTemplate = function(type) {
  const promptBox = document.getElementById('config-agent-prompt');
  const agentName = document.getElementById('config-agent-name').value.trim() || 'Our Store';
  
  const templates = {
    retail: `You are an AI Assistant for ${agentName}.\n\nBusiness Info:\n- Products: [List products here]\n- Address: [Insert address]\n- Open Hours: 9 AM - 8 PM\n\nInstructions:\n- Answer customer queries politely and concisely.\n- Help them check product availability and pricing.\n- Escalate to a human if they ask for custom quotes.`,
    
    restaurant: `You are an AI Assistant for ${agentName}.\n\nBusiness Info:\n- Menu: [Insert menu details here]\n- Table Booking: We accept reservations via WhatsApp.\n- Open Hours: 11 AM - 11 PM\n\nInstructions:\n- Be welcoming and friendly.\n- Answer questions about dishes, allergens, and availability.\n- Help them book a table by asking for name, date, time, and number of guests.`,
    
    service: `You are an AI Assistant for ${agentName}.\n\nBusiness Info:\n- Services: [List services, e.g., Haircut, Salon treatments, Consultations]\n- Appointments: We book appointments directly.\n- Address: [Insert address]\n\nInstructions:\n- Guide clients through our list of services and prices.\n- Help them schedule bookings by asking for their name, preferred service, date, and time.\n- Be highly professional.`
  };

  if (templates[type]) {
    promptBox.value = templates[type];
    showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} template loaded! Review and save.`);
  }
};

