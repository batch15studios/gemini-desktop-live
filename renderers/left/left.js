/**
 * Left Control Hub Logic for Assistant_Integrated_Advanced
 * Manages Gemini Live status, active task logs, settings, and native/MCP tools.
 */

const btnMinimize = document.getElementById('btnMinimize');
const btnConnect = document.getElementById('btnConnect');
const liveStatusText = document.getElementById('liveStatusText');
const headerDot = document.getElementById('headerDot');
const taskLog = document.getElementById('taskLog');
const textPrompt = document.getElementById('textPrompt');
const btnSendText = document.getElementById('btnSendText');

const inputApiKey = document.getElementById('inputApiKey');
const btnSaveKey = document.getElementById('btnSaveKey');
const selectModel = document.getElementById('selectModel');
const selectVoice = document.getElementById('selectVoice');
const mcpSwitchboard = document.getElementById('mcpSwitchboard');
const mcpActiveCountBadge = document.getElementById('mcpActiveCountBadge');
const telCpu = document.getElementById('telCpu');
const telRam = document.getElementById('telRam');

let isConnected = false;

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById(btn.dataset.tab);
    if (target) {
      target.classList.add('active');
      target.scrollTop = 0;
    }
  });
});

// Workspace Deck Toggle
const btnOpenDeck = document.getElementById('btnOpenDeck');
if (btnOpenDeck) {
  btnOpenDeck.addEventListener('click', () => {
    window.assistantApi.toggleWorkspaceDeck();
  });
}

// Minimize to Tray
btnMinimize.addEventListener('click', () => {
  window.assistantApi.minimizeToTray('left');
});

// Append Log Entry
function addLogEntry(speaker, text, type = 'system') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="log-time">[${new Date().toLocaleTimeString()}]</span> <strong>${speaker}:</strong> ${text}`;
  taskLog.appendChild(entry);
  taskLog.scrollTop = taskLog.scrollHeight;
}

// Send Text Prompt
function handleSendText() {
  const val = textPrompt.value.trim();
  if (val) {
    window.assistantApi.sendTextMessage(val);
    textPrompt.value = '';
  }
}
btnSendText.addEventListener('click', handleSendText);
textPrompt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSendText();
});

// Connect / Disconnect Live Session
btnConnect.addEventListener('click', async () => {
  if (btnConnect.disabled) return;

  if (isConnected) {
    btnConnect.disabled = true;
    btnConnect.innerText = 'Disconnecting...';
    await window.assistantApi.disconnectLive();
    btnConnect.disabled = false;
  } else {
    const key = inputApiKey.value.trim();
    const voice = selectVoice.value;
    btnConnect.disabled = true;
    btnConnect.innerText = 'Connecting...';
    headerDot.className = 'status-dot connecting';
    liveStatusText.innerText = 'Connecting...';

    const connectConfig = { voiceName: voice };
    if (key) connectConfig.apiKey = key;

    await window.assistantApi.connectLive(connectConfig);
    btnConnect.disabled = false;
  }
});

// Settings Save
btnSaveKey.addEventListener('click', async () => {
  const key = inputApiKey.value.trim();
  const voice = selectVoice.value;
  await window.assistantApi.saveConfig({ apiKey: key, standardVoice: voice, voiceName: voice });
  btnSaveKey.innerText = 'Saved!';
  setTimeout(() => { btnSaveKey.innerText = 'Save'; }, 1800);
  addLogEntry('System', 'Configuration updated successfully.', 'system');
});

const inputGhToken = document.getElementById('inputGhToken');
const btnSaveGhKey = document.getElementById('btnSaveGhKey');

if (btnSaveGhKey) {
  btnSaveGhKey.addEventListener('click', async () => {
    const ghKey = inputGhToken ? inputGhToken.value.trim() : '';
    if (ghKey) {
      await window.assistantApi.saveConfig({ githubToken: ghKey });
      btnSaveGhKey.innerText = 'Saved!';
      setTimeout(() => { btnSaveGhKey.innerText = 'Save'; }, 1800);
      addLogEntry('System', 'GitHub Personal Access Token updated for batch15studios.', 'system');
    }
  });
}

const inputGearsVoice = document.getElementById('inputGearsVoice');
const btnSaveGearsVoice = document.getElementById('btnSaveGearsVoice');

if (btnSaveGearsVoice) {
  btnSaveGearsVoice.addEventListener('click', async () => {
    const customVoice = inputGearsVoice ? inputGearsVoice.value.trim() : '';
    await window.assistantApi.saveConfig({ gearsVoice: customVoice });
    btnSaveGearsVoice.innerText = 'Saved!';
    setTimeout(() => { btnSaveGearsVoice.innerText = 'Save'; }, 1800);
    if (customVoice) {
      addLogEntry('System', `Gears of War custom voice saved: "${customVoice}". Auto-loads when Gears skin is active.`, 'system');
    } else {
      addLogEntry('System', 'Gears of War custom voice cleared. Will use standard voice until configured.', 'system');
    }
  });
}

selectVoice.addEventListener('change', async () => {
  const chosen = selectVoice.value;
  await window.assistantApi.saveConfig({ standardVoice: chosen, voiceName: chosen });
  addLogEntry('System', `Standard assistant voice changed to "${chosen}".`, 'system');
});

if (window.assistantApi.onVoiceChanged) {
  window.assistantApi.onVoiceChanged((voiceName) => {
    const hasOption = Array.from(selectVoice.options).some(o => o.value === voiceName);
    if (hasOption) {
      selectVoice.value = voiceName;
    }
    addLogEntry('System', `Active Live voice is now "${voiceName}".`, 'system');
  });
}

if (selectModel) {
  selectModel.addEventListener('change', async () => {
    const chosen = selectModel.value;
    await window.assistantApi.saveConfig({ model: chosen });
    addLogEntry('System', `Gemini core model changed to "${chosen}".`, 'system');
  });
}

if (window.assistantApi.onModelChanged) {
  window.assistantApi.onModelChanged((model) => {
    if (selectModel) selectModel.value = model;
    addLogEntry('System', `Active model is now "${model}".`, 'system');
  });
}

// Skin Selection Handlers
function setActiveSkin(skinId) {
  document.documentElement.setAttribute('data-skin', skinId || 'default');
  document.querySelectorAll('.skin-card').forEach(card => {
    card.classList.toggle('active', card.dataset.skinId === (skinId || 'default'));
  });
}

document.querySelectorAll('.skin-card').forEach(card => {
  card.addEventListener('click', () => {
    const skinId = card.dataset.skinId;
    setActiveSkin(skinId);
    window.assistantApi.setSkin(skinId);
    const skinName = card.querySelector('.skin-name')?.innerText || skinId;
    addLogEntry('System', `Visual skin changed to "${skinName}".`, 'system');
    
    // Play the custom Marcus Fenix voice quote!
    if (skinId === 'gears') {
      const audio = new Audio('../../assets/gears-intro.mp3');
      audio.volume = 0.8;
      audio.play().catch(e => console.warn('Could not play gears intro', e));
    }
  });
});

window.assistantApi.onSkinChanged((skinId) => {
  setActiveSkin(skinId);
});

// Theme Selection Handlers
function setActiveTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId);
  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.toggle('active', card.dataset.themeId === themeId);
  });
}

document.querySelectorAll('.theme-card').forEach(card => {
  card.addEventListener('click', () => {
    const themeId = card.dataset.themeId;
    setActiveTheme(themeId);
    window.assistantApi.setTheme(themeId);
    const themeName = card.querySelector('.theme-name')?.innerText || themeId;
    addLogEntry('System', `Palette changed to "${themeName}".`, 'system');
  });
});

window.assistantApi.onThemeChanged((themeId) => {
  setActiveTheme(themeId);
});

// Status Updates
window.assistantApi.onStatus((data) => {
  if (data.status === 'connected') {
    isConnected = true;
    headerDot.className = 'status-dot online';
    liveStatusText.innerText = 'Gemini Live (Active)';
    btnConnect.innerText = 'Disconnect';
    btnConnect.classList.add('connected');
    addLogEntry('System', 'Gemini Live connection established.', 'system');
  } else if (data.status === 'connecting') {
    headerDot.className = 'status-dot connecting';
    liveStatusText.innerText = 'Connecting...';
    btnConnect.innerText = 'Connecting...';
  } else {
    isConnected = false;
    headerDot.className = 'status-dot';
    liveStatusText.innerText = 'Disconnected';
    btnConnect.innerText = 'Connect';
    btnConnect.classList.remove('connected');
    addLogEntry('System', data.message || 'Disconnected from Gemini Live.', 'system');
  }
});

// Transcripts
window.assistantApi.onTranscript((data) => {
  const type = data.speaker.includes('Ryan') ? 'user' : 'assistant';
  addLogEntry(data.speaker, data.text, type);
});

// Tool Activity
window.assistantApi.onToolActivity((activity) => {
  if (activity.type === 'executing') {
    addLogEntry('Gemini', `[EXEC] ${activity.name}(${JSON.stringify(activity.args || {})})`, 'tool');
  } else if (activity.type === 'completed') {
    addLogEntry('Gemini', `[DONE] ${activity.name}`, 'tool');
  } else if (activity.type === 'failed') {
    addLogEntry('Gemini', `[FAIL] ${activity.name} - ${activity.error}`, 'tool');
  }
});

// Autonomous Sentry Trigger Log
if (window.assistantApi.onSentryFired) {
  window.assistantApi.onSentryFired((sentry) => {
    addLogEntry('Sentry', `[ALERT] ${sentry.alertMessage} (Condition: ${sentry.condition} on ${sentry.target || 'target'})`, 'system');
  });
}

// Windows System Integrity Shield Interceptions
if (window.assistantApi.onSafetyBlocked) {
  window.assistantApi.onSafetyBlocked((data) => {
    addLogEntry('SHIELD', `BLOCKED CRITICAL SYSTEM ACTION: ${data.reason}`, 'user');
  });
}

// MCP Switchboard Renderer & Interactive Toggles
let detailedMcpServers = [];
const defaultMcpSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>`;

async function renderMcpSwitchboard() {
  if (!mcpSwitchboard) return;
  try {
    detailedMcpServers = await window.assistantApi.getMcpServersDetailed();
    if (!detailedMcpServers || detailedMcpServers.length === 0) {
      mcpSwitchboard.innerHTML = '<div class="mcp-loading">No local MCP servers found</div>';
      if (mcpActiveCountBadge) mcpActiveCountBadge.innerText = '0 ACTIVE';
      return;
    }

    const activeCount = detailedMcpServers.filter(s => s.isEnabled).length;
    if (mcpActiveCountBadge) {
      mcpActiveCountBadge.innerText = `${activeCount} / ${detailedMcpServers.length} ACTIVE`;
    }

    mcpSwitchboard.innerHTML = detailedMcpServers.map(server => {
      const isChecked = server.isEnabled ? 'checked' : '';
      const activeClass = server.isEnabled ? 'active' : '';
      const stateLabel = server.isEnabled ? 'ON' : 'OFF';

      const toolChips = (server.tools || []).map(t => `
        <span class="mcp-tool-chip" title="${(t.description || '').replace(/"/g, '&quot;')}">${t.name}</span>
      `).join('');

      return `
        <div class="mcp-card ${activeClass}" id="mcp-card-${server.id}">
          <div class="mcp-card-top">
            <div class="mcp-identity">
              <div class="mcp-icon">${server.icon || defaultMcpSvg}</div>
              <div class="mcp-details">
                <div class="mcp-name-row">
                  <span class="mcp-name">${server.displayName || server.id}</span>
                  <span class="mcp-tool-count">${server.toolCount || 0} tools</span>
                </div>
                <div class="mcp-desc">${server.description || ''}</div>
              </div>
            </div>
            <div class="mcp-controls">
              <span class="mcp-status-pill" id="mcp-state-${server.id}">${stateLabel}</span>
              <label class="mcp-switch">
                <input type="checkbox" data-server="${server.id}" ${isChecked} class="mcp-toggle-input">
                <span class="mcp-slider"></span>
              </label>
            </div>
          </div>
          ${server.tools && server.tools.length > 0 ? `
            <button class="mcp-expand-btn" data-target="mcp-drawer-${server.id}">
              <span class="caret">▸</span> View Tools (${server.tools.length})
            </button>
            <div class="mcp-tools-drawer" id="mcp-drawer-${server.id}">
              ${toolChips}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    // Attach Toggle Checkbox Handlers
    mcpSwitchboard.querySelectorAll('.mcp-toggle-input').forEach(input => {
      input.addEventListener('change', async (e) => {
        const srvId = e.target.dataset.server;
        const isEnabled = e.target.checked;
        const card = document.getElementById(`mcp-card-${srvId}`);
        const statePill = document.getElementById(`mcp-state-${srvId}`);

        if (card) card.classList.toggle('active', isEnabled);
        if (statePill) statePill.innerText = isEnabled ? 'ON' : 'OFF';

        await window.assistantApi.toggleMcpServer(srvId, isEnabled);

        const currentActive = mcpSwitchboard.querySelectorAll('.mcp-toggle-input:checked').length;
        if (mcpActiveCountBadge) {
          mcpActiveCountBadge.innerText = `${currentActive} / ${detailedMcpServers.length} ACTIVE`;
        }

        const serverObj = detailedMcpServers.find(s => s.id === srvId);
        const name = serverObj?.displayName || srvId;
        addLogEntry('System', `MCP Server "${name}" toggled ${isEnabled ? 'ON (Active in Gemini)' : 'OFF'}.`, 'system');
      });
    });

    // Attach Drawer Expand/Collapse Handlers
    mcpSwitchboard.querySelectorAll('.mcp-expand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const drawer = document.getElementById(targetId);
        const caret = btn.querySelector('.caret');
        if (drawer) {
          const isOpen = drawer.classList.toggle('open');
          if (caret) caret.innerText = isOpen ? '▾' : '▸';
        }
      });
    });
  } catch (err) {
    console.error('Failed to render MCP switchboard:', err);
    mcpSwitchboard.innerHTML = '<div class="mcp-loading">Error loading MCP servers</div>';
  }
}

// Load Config & System Status on Startup
async function init() {
  const config = await window.assistantApi.loadConfig();
  if (config) {
    if (config.apiKey) inputApiKey.value = config.apiKey;
    if (config.githubToken && inputGhToken) inputGhToken.value = config.githubToken;
    if (config.model && selectModel) selectModel.value = config.model;
    if (config.standardVoice) {
      selectVoice.value = config.standardVoice;
    } else if (config.voiceName) {
      selectVoice.value = config.voiceName;
    }
    if (config.gearsVoice && inputGearsVoice) {
      inputGearsVoice.value = config.gearsVoice;
    }
    if (config.theme) setActiveTheme(config.theme);
    if (config.skin) setActiveSkin(config.skin);
  }

  // Render Interactive MCP Switchboard
  await renderMcpSwitchboard();

  // Hardware Telemetry
  const sys = await window.assistantApi.getSystemStatus();
  if (sys) {
    telCpu.innerText = `${sys.cpuCores} Cores`;
    telRam.innerText = `${sys.memory.usedGB} / ${sys.memory.totalGB} (${sys.memory.usagePercent})`;
  }

  // Periodic Telemetry Refresh
  setInterval(async () => {
    const s = await window.assistantApi.getSystemStatus();
    if (s) {
      telRam.innerText = `${s.memory.usedGB} / ${s.memory.totalGB} (${s.memory.usagePercent})`;
    }
  }, 5000);

  // Google Workspace UI Integration
  initWorkspaceUi(config);
}

// Google Workspace UI Handlers
function initWorkspaceUi(config) {
  const workspaceStatusBadge = document.getElementById('workspaceStatusBadge');
  const inputWorkspaceClientId = document.getElementById('inputWorkspaceClientId');
  const inputWorkspaceClientSecret = document.getElementById('inputWorkspaceClientSecret');
  const btnSaveWorkspaceCreds = document.getElementById('btnSaveWorkspaceCreds');
  const btnAuthWorkspace = document.getElementById('btnAuthWorkspace');
  const btnTestRundown = document.getElementById('btnTestRundown');
  const chkStartupRundown = document.getElementById('chkStartupRundown');
  const inputTakeoutPath = document.getElementById('inputTakeoutPath');
  const btnImportTakeout = document.getElementById('btnImportTakeout');

  if (chkStartupRundown && config) {
    chkStartupRundown.checked = config.startupRundownEnabled !== false;
    chkStartupRundown.addEventListener('change', async () => {
      await window.assistantApi.toggleWorkspaceRundown(chkStartupRundown.checked);
      addLogEntry('System', `Startup morning briefing toggled ${chkStartupRundown.checked ? 'ON' : 'OFF'}.`, 'system');
    });
  }

  async function refreshWorkspaceStatus() {
    if (!window.assistantApi.getWorkspaceStatus) return;
    try {
      const status = await window.assistantApi.getWorkspaceStatus();
      if (!workspaceStatusBadge) return;

      if (status.authenticated) {
        workspaceStatusBadge.innerText = 'AUTHENTICATED';
        workspaceStatusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        workspaceStatusBadge.style.color = '#10b981';
      } else if (status.configured) {
        workspaceStatusBadge.innerText = 'READY TO CONNECT';
        workspaceStatusBadge.style.background = 'rgba(0, 240, 255, 0.2)';
        workspaceStatusBadge.style.color = '#00f0ff';
      } else {
        workspaceStatusBadge.innerText = 'NOT CONFIGURED';
        workspaceStatusBadge.style.background = 'rgba(255, 170, 0, 0.2)';
        workspaceStatusBadge.style.color = '#ffaa00';
      }
    } catch (e) {
      console.warn('Workspace status check error:', e);
    }
  }

  refreshWorkspaceStatus();

  if (btnSaveWorkspaceCreds) {
    btnSaveWorkspaceCreds.addEventListener('click', async () => {
      const cid = inputWorkspaceClientId ? inputWorkspaceClientId.value.trim() : '';
      const csec = inputWorkspaceClientSecret ? inputWorkspaceClientSecret.value.trim() : '';
      if (!cid || !csec) {
        alert('Please provide both Client ID and Client Secret.');
        return;
      }
      btnSaveWorkspaceCreds.innerText = 'Saving...';
      const res = await window.assistantApi.saveWorkspaceCredentials(cid, csec);
      btnSaveWorkspaceCreds.innerText = res.success ? 'Saved!' : 'Error';
      setTimeout(() => { btnSaveWorkspaceCreds.innerText = 'Save'; }, 1800);
      refreshWorkspaceStatus();
      addLogEntry('System', 'Google Workspace OAuth credentials saved.', 'system');
    });
  }

  if (btnAuthWorkspace) {
    btnAuthWorkspace.addEventListener('click', async () => {
      btnAuthWorkspace.innerText = 'Authorizing...';
      addLogEntry('System', 'Opening Google authentication prompt in browser...', 'system');
      const res = await window.assistantApi.startWorkspaceAuth();
      btnAuthWorkspace.innerText = 'Connect Workspace';
      if (res && res.success) {
        addLogEntry('System', 'Google Workspace successfully authorized!', 'system');
      } else if (res && res.error) {
        addLogEntry('System', `Google Workspace auth notice: ${res.error}`, 'error');
      }
      refreshWorkspaceStatus();
    });
  }

  if (btnTestRundown) {
    btnTestRundown.addEventListener('click', async () => {
      btnTestRundown.innerText = 'Running...';
      const res = await window.assistantApi.getWorkspaceRundown();
      btnTestRundown.innerText = 'Test Briefing';
      if (res) {
        addLogEntry('Gemini', res.spokenBriefing || 'Rundown complete.', 'assistant');
      }
    });
  }

  if (btnImportTakeout) {
    btnImportTakeout.addEventListener('click', async () => {
      const targetPath = inputTakeoutPath ? inputTakeoutPath.value.trim() : '';
      if (!targetPath) {
        alert('Please enter path to your Google Takeout JSON or folder.');
        return;
      }
      btnImportTakeout.innerText = 'Importing...';
      addLogEntry('System', `Importing Google Takeout conversation history from "${targetPath}"...`, 'system');
      const res = await window.assistantApi.importTakeoutHistory(targetPath);
      btnImportTakeout.innerText = 'Import';
      if (res && res.success) {
        addLogEntry('System', `Takeout Import Success! Ingested ${res.importedConversations} conversations and created Obsidian chronicle.`, 'system');
      } else {
        addLogEntry('System', `Import failed: ${res?.error || 'Unknown error'}`, 'error');
      }
    });
  }
}

init();
