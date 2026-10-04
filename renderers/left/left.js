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
const selectVoice = document.getElementById('selectVoice');
const mcpServerList = document.getElementById('mcpServerList');
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
  if (isConnected) {
    await window.assistantApi.disconnectLive();
  } else {
    const key = inputApiKey.value.trim();
    const voice = selectVoice.value;
    btnConnect.innerText = 'Connecting...';
    headerDot.className = 'status-dot connecting';
    liveStatusText.innerText = 'Connecting...';
    await window.assistantApi.connectLive({ apiKey: key, voiceName: voice });
  }
});

// Settings Save
btnSaveKey.addEventListener('click', async () => {
  const key = inputApiKey.value.trim();
  const voice = selectVoice.value;
  await window.assistantApi.saveConfig({ apiKey: key, voiceName: voice });
  btnSaveKey.innerText = 'Saved!';
  setTimeout(() => { btnSaveKey.innerText = 'Save'; }, 1800);
  addLogEntry('System', 'Configuration updated successfully.', 'system');
});

selectVoice.addEventListener('change', async () => {
  await window.assistantApi.saveConfig({ voiceName: selectVoice.value });
  addLogEntry('System', `Assistant voice changed to ${selectVoice.value}.`, 'system');
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
    addLogEntry('System', `Interface skin changed to "${themeName}".`, 'system');
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
    addLogEntry('Gemini', `⚡ Executing: ${activity.name}(${JSON.stringify(activity.args || {})})`, 'tool');
  } else if (activity.type === 'completed') {
    addLogEntry('Gemini', `✓ Completed: ${activity.name}`, 'tool');
  } else if (activity.type === 'failed') {
    addLogEntry('Gemini', `✗ Failed: ${activity.name} - ${activity.error}`, 'tool');
  }
});

// Load Config & System Status on Startup
async function init() {
  const config = await window.assistantApi.loadConfig();
  if (config) {
    if (config.apiKey) inputApiKey.value = config.apiKey;
    if (config.voiceName) selectVoice.value = config.voiceName;
    if (config.theme) setActiveTheme(config.theme);
  }

  // Telemetry & MCP Discovery
  const sys = await window.assistantApi.getSystemStatus();
  if (sys) {
    telCpu.innerText = `${sys.cpuCores} Cores`;
    telRam.innerText = `${sys.memory.usedGB} / ${sys.memory.totalGB} (${sys.memory.usagePercent})`;

    if (sys.mcpServersDiscovered && sys.mcpServersDiscovered.length > 0) {
      mcpServerList.innerHTML = sys.mcpServersDiscovered.map(name => `
        <div class="mcp-item">
          <span>${name}</span>
          <span class="mcp-status">AVAILABLE</span>
        </div>
      `).join('');
    } else {
      mcpServerList.innerHTML = '<div class="mcp-item">No local MCP servers found</div>';
    }
  }

  // Periodic Telemetry Refresh
  setInterval(async () => {
    const s = await window.assistantApi.getSystemStatus();
    if (s) {
      telRam.innerText = `${s.memory.usedGB} / ${s.memory.totalGB} (${s.memory.usagePercent})`;
    }
  }, 5000);
}

init();
