/**
 * Main Process for Assistant_Integrated_Advanced
 * Manages 3 transparent floating windows (Left Dock, Central Orb, Right Vision Dock),
 * Windows System Tray, Native Tool dispatch, and Gemini Live streaming.
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, screen, desktopCapturer, nativeImage, session, globalShortcut, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EventEmitter = require('events');
require('dotenv').config();

const { GeminiLiveEngine } = require('./gemini-live-engine');
const { ToolsManager } = require('./native-tools');
const { registerWorkspaceIpc } = require('./workspace-ipc');

// Enable native Chromium WebRTC Audio Processing Module (AEC3, AGC, NS) & loopback
app.commandLine.appendSwitch('enable-features', 'WebRtcApmInAudioService,AudioServiceOutOfProcess');
app.commandLine.appendSwitch('enable-webrtc-apm-in-audio-service');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('high-dpi-support', '1');

class AssistantApp {
  constructor() {
    this.orbWindow = null;
    this.leftWindow = null;
    this.rightWindow = null;
    this.workspaceWindow = null;
    this.tray = null;
    this.isAlwaysOnTop = true;
    this.isMiniMode = false;
    this.hasDeliveredStartupRundown = false;

    this.engineEmitter = new EventEmitter();
    this.configPath = path.join(app.getPath('userData'), 'assistant_config.json');
    this.config = this.loadConfig();
    this.toolsManager = new ToolsManager(this.engineEmitter, this.config.enabledMcpServers);
    this.toolsManager.setScreenCaptureProvider(() => this.captureDesktopSnapshotJpeg());
    this.toolsManager.setWebviewDomExtractor((selector) => this.extractWorkspaceWebviewDom(selector));

    const activeVoice = (this.config.skin === 'gears' && this.config.gearsVoice && this.config.gearsVoice.trim() !== '')
      ? this.config.gearsVoice.trim()
      : (this.config.standardVoice || 'Vega');

    this.config.voiceName = activeVoice;

    this.liveEngine = new GeminiLiveEngine({
      apiKey: this.config.apiKey || process.env.GEMINI_API_KEY || '',
      voiceName: activeVoice,
      model: this.config.model,
      toolsManager: this.toolsManager,
      emitter: this.engineEmitter
    });

    this.setupEngineEvents();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const loaded = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
        if (!loaded.apiKey && process.env.GEMINI_API_KEY) {
          loaded.apiKey = process.env.GEMINI_API_KEY;
        }
        if (!loaded.githubToken) {
          try {
            const mcpCfgPath = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
            if (fs.existsSync(mcpCfgPath)) {
              const mcpCfg = JSON.parse(fs.readFileSync(mcpCfgPath, 'utf-8'));
              loaded.githubToken = mcpCfg.mcpServers?.github?.env?.GITHUB_PERSONAL_ACCESS_TOKEN || '';
            }
          } catch (e) {}
        }
        loaded.theme = loaded.theme || 'cyber-cyan';
        loaded.skin = loaded.skin || 'default';
        loaded.standardVoice = loaded.standardVoice || 'Vega';
        loaded.gearsVoice = loaded.gearsVoice || '';
        loaded.model = loaded.model || 'gemini-3.8-live';
        loaded.voiceName = (loaded.skin === 'gears' && loaded.gearsVoice && loaded.gearsVoice.trim() !== '')
          ? loaded.gearsVoice.trim()
          : (loaded.standardVoice || 'Vega');
        if (!loaded.enabledMcpServers || !Array.isArray(loaded.enabledMcpServers)) {
          loaded.enabledMcpServers = ['memory', 'filesystem', 'github', 'chrome-devtools-mcp', 'context7'];
        }
        loaded.startupRundownEnabled = loaded.startupRundownEnabled !== undefined ? loaded.startupRundownEnabled : true;
        if (loaded.cursorCalibration && typeof loaded.cursorCalibration === 'object') {
          if (this.toolsManager) {
            this.toolsManager.cursorCalibration = loaded.cursorCalibration;
          }
        }
        return loaded;
      }
    } catch (e) {
      console.warn('Could not read config, using defaults:', e);
    }
    return {
      apiKey: process.env.GEMINI_API_KEY || '',
      githubToken: '',
      standardVoice: 'Vega',
      gearsVoice: '',
      voiceName: 'Vega',
      model: 'gemini-3.8-live',
      visionEnabled: true,
      screenShareEnabled: true,
      theme: 'cyber-cyan',
      skin: 'default',
      startupRundownEnabled: true,
      enabledMcpServers: ['memory', 'filesystem', 'github', 'chrome-devtools-mcp', 'context7']
    };
  }

  saveConfig(newConfig) {
    if (!newConfig) return { success: false };

    if (typeof newConfig.startupRundownEnabled === 'boolean') {
      this.config.startupRundownEnabled = newConfig.startupRundownEnabled;
    }

    // Protect apiKey: Only update if a valid non-empty string is provided
    if (newConfig.apiKey && typeof newConfig.apiKey === 'string' && newConfig.apiKey.trim().length > 0) {
      this.config.apiKey = newConfig.apiKey.trim();
      this.liveEngine.setApiKey(this.config.apiKey);
    }
    if (newConfig.githubToken && typeof newConfig.githubToken === 'string' && newConfig.githubToken.trim().length > 0) {
      this.config.githubToken = newConfig.githubToken.trim();
      try {
        const mcpCfgPath = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
        if (fs.existsSync(mcpCfgPath)) {
          const mcpCfg = JSON.parse(fs.readFileSync(mcpCfgPath, 'utf-8'));
          if (!mcpCfg.mcpServers) mcpCfg.mcpServers = {};
          if (!mcpCfg.mcpServers.github) mcpCfg.mcpServers.github = {};
          if (!mcpCfg.mcpServers.github.env) mcpCfg.mcpServers.github.env = {};
          mcpCfg.mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN = this.config.githubToken;
          fs.writeFileSync(mcpCfgPath, JSON.stringify(mcpCfg, null, 2), 'utf-8');
          if (this.toolsManager) {
            this.toolsManager.mcpConfig = mcpCfg;
          }
          console.log('[Main] GitHub PAT synchronized to mcp_config.json and ToolsManager');
        }
      } catch (err) {
        console.warn('[Main] Warning updating mcp_config.json with githubToken:', err.message);
      }
    }
    if (newConfig.standardVoice) {
      this.config.standardVoice = newConfig.standardVoice;
      if (this.config.skin !== 'gears') {
        this.config.voiceName = newConfig.standardVoice;
        this.liveEngine.setVoice(newConfig.standardVoice);
        this.broadcast('voice:changed', newConfig.standardVoice);
      }
    }
    if (newConfig.gearsVoice !== undefined) {
      this.config.gearsVoice = (newConfig.gearsVoice || '').trim();
      if (this.config.skin === 'gears' && this.config.gearsVoice) {
        this.config.voiceName = this.config.gearsVoice;
        this.liveEngine.setVoice(this.config.gearsVoice);
        this.broadcast('voice:changed', this.config.gearsVoice);
      }
    }
    if (newConfig.voiceName && !newConfig.standardVoice && newConfig.gearsVoice === undefined) {
      this.config.voiceName = newConfig.voiceName;
      if (this.config.skin === 'gears' && this.config.gearsVoice) {
        this.config.gearsVoice = newConfig.voiceName;
      } else {
        this.config.standardVoice = newConfig.voiceName;
      }
      this.liveEngine.setVoice(newConfig.voiceName);
      this.broadcast('voice:changed', newConfig.voiceName);
    }
    if (newConfig.theme) this.config.theme = newConfig.theme;
    if (newConfig.skin) this.config.skin = newConfig.skin;
    if (newConfig.enabledMcpServers && Array.isArray(newConfig.enabledMcpServers)) {
      this.config.enabledMcpServers = newConfig.enabledMcpServers;
      if (this.toolsManager) {
        this.toolsManager.setEnabledMcpServers(this.config.enabledMcpServers);
      }
    }
    if (typeof newConfig.visionEnabled === 'boolean') this.config.visionEnabled = newConfig.visionEnabled;
    if (typeof newConfig.screenShareEnabled === 'boolean') this.config.screenShareEnabled = newConfig.screenShareEnabled;
    if (newConfig.model) {
      this.config.model = newConfig.model;
      this.liveEngine.setModel(newConfig.model);
      this.broadcast('model:changed', newConfig.model);
    }

    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  setupEngineEvents() {
    this.engineEmitter.on('status', (data) => {
      this.broadcast('live:status', data);
      if (data?.status === 'connected' && this.config.startupRundownEnabled && !this.hasDeliveredStartupRundown) {
        this.hasDeliveredStartupRundown = true;
        setTimeout(() => {
          console.log('[Main] Delivering automated morning startup briefing...');
          if (this.liveEngine && this.liveEngine.isConnected) {
            this.liveEngine.sendTextMessage(
              '[SYSTEM EVENT: STARTUP EXECUTIVE RUNDOWN] Ryan has booted up the assistant. Please invoke workspace_startup_rundown (or your workspace tools) to inspect Ryan\'s unread emails, pending tasks, and today\'s calendar schedule, then deliver a crisp, natural spoken briefing.'
            );
          }
        }, 3000);
      }
    });
    this.engineEmitter.on('transcript', (data) => this.broadcast('live:transcript', data));
    this.engineEmitter.on('audio_output_chunk', (chunk) => this.broadcast('live:audio-chunk', chunk));
    this.engineEmitter.on('interrupted', () => this.broadcast('live:interrupted'));
    this.engineEmitter.on('tool_executing', (data) => this.broadcast('live:tool-activity', { type: 'executing', ...data }));
    this.engineEmitter.on('tool_completed', (data) => this.broadcast('live:tool-activity', { type: 'completed', ...data }));
    this.engineEmitter.on('tool_failed', (data) => this.broadcast('live:tool-activity', { type: 'failed', ...data }));
    this.engineEmitter.on('turn_complete', () => this.broadcast('live:turn-complete'));
    this.engineEmitter.on('mute_changed', (isMuted) => this.broadcast('live:mute-changed', isMuted));

    // Screen action feedback: feed fresh screen frames immediately into Gemini Live's vision perception buffer
    this.engineEmitter.on('screen_action_feedback', (base64Jpeg) => {
      if (this.liveEngine && this.liveEngine.isConnected) {
        this.liveEngine.sendVideoFrame(base64Jpeg, 'screen');
      }
      this.broadcast('screen:feedback-captured', { timestamp: Date.now() });
    });

    // Autonomous Sentry Trigger: broadcast alert to UI and command Gemini to proactively speak
    this.engineEmitter.on('sentry_fired', (sentry) => {
      console.log('[Main] Sentry condition triggered:', sentry.alertMessage);
      this.broadcast('sentry:fired', sentry);
      if (Notification && Notification.isSupported()) {
        try {
          new Notification({
            title: 'Gemini Autonomous Sentry',
            body: sentry.alertMessage,
            icon: path.join(__dirname, 'assets', 'icon.png')
          }).show();
        } catch (e) {
          console.warn('[Main] Notification error:', e.message);
        }
      }
      if (this.liveEngine && this.liveEngine.isConnected) {
        this.liveEngine.sendTextMessage(`[SENTRY ALERT - PROACTIVELY SPEAK TO RYAN NOW]: ${sentry.alertMessage}`);
      }
    });

    // Windows Safety Guard: broadcast blocked action
    this.engineEmitter.on('safety_blocked', (data) => {
      console.warn('[Main] Windows System Integrity Guard intercepted unsafe action:', data.reason);
      this.broadcast('safety:blocked', data);
    });

    // Workspace Deck Hot-Reload: broadcast file modifications
    this.engineEmitter.on('file_written', (data) => {
      if (this.workspaceWindow && !this.workspaceWindow.isDestroyed()) {
        this.workspaceWindow.webContents.send('workspace:file-updated', data);
      }
    });

    // Workspace Deck AI Automation Controller
    this.engineEmitter.on('workspace_control', ({ action, mode, url, filePath }) => {
      console.log(`[Main] AI commanding Workspace Deck: action=${action}, mode=${mode}, url=${url}, file=${filePath}`);
      if (action === 'close') {
        if (this.workspaceWindow && !this.workspaceWindow.isDestroyed()) {
          this.workspaceWindow.hide();
          this.workspaceWindow.webContents.send('workspace:unloaded');
        }
        return;
      }

      if (action === 'toggle') {
        this.toggleWorkspaceDeck();
        return;
      }

      const sendDeckCommands = () => {
        if (this.workspaceWindow && !this.workspaceWindow.isDestroyed()) {
          const targetMode = mode || (filePath && !url ? 'ide' : 'browser');
          this.workspaceWindow.webContents.send('workspace:set-mode', targetMode);
          if (url) {
            this.workspaceWindow.webContents.send('workspace:navigate', url);
          }
          if (filePath) {
            this.workspaceWindow.webContents.send('workspace:open-file', filePath);
          }
        }
      };

      // Default: ensure window is instantiated and shown
      if (!this.workspaceWindow || this.workspaceWindow.isDestroyed()) {
        this.createWorkspaceWindow();
        this.workspaceWindow.webContents.once('did-finish-load', () => {
          sendDeckCommands();
        });
      } else {
        if (this.workspaceWindow.isMinimized()) {
          this.workspaceWindow.restore();
        }
        this.workspaceWindow.show();
        this.workspaceWindow.focus();
        sendDeckCommands();
      }
    });

    // Cursor boundary calibration persistence
    this.engineEmitter.on('cursor:calibrated', (calib) => {
      this.config.cursorCalibration = calib;
      this.saveConfig(this.config);
    });
  }

  async captureDesktopSnapshotJpeg() {
    try {
      const primary = screen.getPrimaryDisplay();
      const scale = primary.scaleFactor || 1;
      const physW = Math.round(primary.bounds.width * scale);
      const physH = Math.round(primary.bounds.height * scale);
      const aspect = (physW > 0 && physH > 0) ? (physW / physH) : (16 / 9);
      // Downscale proportionally (1280 max width) for AI vision perception with exact physical aspect ratio
      const targetW = Math.min(physW, 1280);
      const targetH = Math.round(targetW / aspect);
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: targetW,
          height: targetH
        }
      });
      if (sources && sources.length > 0) {
        const thumb = sources[0].thumbnail;
        const jpegBuf = thumb.toJPEG(60);
        return jpegBuf.toString('base64');
      }
    } catch (err) {
      console.error('[Main] Desktop snapshot capture error:', err);
    }
    return null;
  }

  async extractWorkspaceWebviewDom(selector = 'body') {
    try {
      if (!this.workspaceWindow || this.workspaceWindow.isDestroyed()) {
        return { error: 'Workspace Deck window is not currently open. Open or navigate the browser first.' };
      }
      const safeSel = JSON.stringify(selector || 'body');
      return await this.workspaceWindow.webContents.executeJavaScript(`
        (async () => {
          const wv = document.getElementById('deckWebview');
          if (!wv) return { error: 'Browser webview element not found.' };
          try {
            return await wv.executeJavaScript(\`
              (() => {
                const el = document.querySelector(${safeSel}) || document.body;
                const text = el ? el.innerText.substring(0, 15000) : '';
                const links = Array.from(document.querySelectorAll('a[href]'))
                  .slice(0, 80)
                  .map(a => ({ text: (a.innerText || '').trim().substring(0, 80), href: a.href }))
                  .filter(l => l.href && l.href.startsWith('http'));
                return {
                  success: true,
                  title: document.title,
                  url: window.location.href,
                  textContent: text,
                  links
                };
              })()
            \`);
          } catch (innerErr) {
            return { error: innerErr.message };
          }
        })()
      `);
    } catch (e) {
      return { error: `Failed to extract DOM from Workspace browser: ${e.message}` };
    }
  }

  broadcast(channel, data) {
    if (this.orbWindow && !this.orbWindow.isDestroyed()) this.orbWindow.webContents.send(channel, data);
    if (this.leftWindow && !this.leftWindow.isDestroyed()) this.leftWindow.webContents.send(channel, data);
    if (this.rightWindow && !this.rightWindow.isDestroyed()) this.rightWindow.webContents.send(channel, data);
    if (this.workspaceWindow && !this.workspaceWindow.isDestroyed()) this.workspaceWindow.webContents.send(channel, data);
  }

  createWindows() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const appIcon = path.join(__dirname, 'assets', 'icon.png');

    const commonWebPreferences = {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    };

    // 1. Center Window: The Multimodal AI Orb
    const orbSize = 360;
    this.orbWindow = new BrowserWindow({
      width: orbSize,
      height: orbSize,
      x: Math.round((width - orbSize) / 2),
      y: Math.round((height - orbSize) / 2) - 40,
      transparent: true,
      frame: false,
      resizable: true,
      alwaysOnTop: this.isAlwaysOnTop,
      hasShadow: false,
      skipTaskbar: false,
      icon: appIcon,
      webPreferences: commonWebPreferences
    });
    this.orbWindow.loadFile(path.join(__dirname, 'renderers', 'orb', 'index.html'));

    // 2. Left Window: Settings, Active Tasks, MCP & Tools
    const leftW = 410;
    const leftH = Math.min(740, height - 70);
    this.leftWindow = new BrowserWindow({
      width: leftW,
      height: leftH,
      x: 30,
      y: Math.round((height - leftH) / 2),
      transparent: true,
      frame: false,
      resizable: true,
      alwaysOnTop: false,
      hasShadow: true,
      skipTaskbar: false,
      icon: appIcon,
      webPreferences: commonWebPreferences
    });
    this.leftWindow.loadFile(path.join(__dirname, 'renderers', 'left', 'index.html'));

    // 3. Right Window: Perception HUD, Webcam, Screen Share & Telemetry Deck
    const rightW = 430;
    const rightH = Math.min(840, height - 16);
    this.rightWindow = new BrowserWindow({
      width: rightW,
      height: rightH,
      x: width - rightW - 20,
      y: Math.max(8, Math.round((height - rightH) / 2)),
      transparent: true,
      frame: false,
      resizable: true,
      alwaysOnTop: false,
      hasShadow: true,
      skipTaskbar: false,
      icon: appIcon,
      webPreferences: commonWebPreferences
    });
    this.rightWindow.loadFile(path.join(__dirname, 'renderers', 'right', 'index.html'));

    // Explicitly show windows once ready and ensure focus
    [this.orbWindow, this.leftWindow, this.rightWindow].forEach(win => {
      win.once('ready-to-show', () => {
        win.show();
      });
      win.show();
    });
    this.orbWindow.focus();

    // Prevent full close on window 'close' to allow minimizing to tray
    [this.orbWindow, this.leftWindow, this.rightWindow].forEach(win => {
      win.on('close', (e) => {
        if (!app.isQuitting) {
          e.preventDefault();
          win.hide();
        }
      });
    });

    this.createSystemTray();
  }

  createWorkspaceWindow() {
    if (this.workspaceWindow && !this.workspaceWindow.isDestroyed()) {
      this.workspaceWindow.show();
      this.workspaceWindow.focus();
      return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const appIcon = path.join(__dirname, 'assets', 'icon.png');

    // Centered in workspace gap between HUDs (92vw x 90vh)
    const deckW = Math.round(width * 0.92);
    const deckH = Math.round(height * 0.90);
    const deckX = Math.round((width - deckW) / 2);
    const deckY = Math.round((height - deckH) / 2);

    this.workspaceWindow = new BrowserWindow({
      width: deckW,
      height: deckH,
      x: deckX,
      y: deckY,
      transparent: true,
      frame: false,
      resizable: true,
      hasShadow: true,
      backgroundColor: '#00000000',
      icon: appIcon,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true,
        backgroundThrottling: false
      }
    });

    this.workspaceWindow.loadFile(path.join(__dirname, 'renderers', 'workspace', 'workspace.html'));

    this.workspaceWindow.once('ready-to-show', () => {
      this.workspaceWindow.show();
      this.workspaceWindow.focus();
    });

    this.workspaceWindow.on('close', (e) => {
      if (!app.isQuitting) {
        e.preventDefault();
        this.workspaceWindow.hide();
        this.workspaceWindow.webContents.send('workspace:unloaded');
      }
    });
  }

  toggleWorkspaceDeck() {
    if (!this.workspaceWindow || this.workspaceWindow.isDestroyed()) {
      this.createWorkspaceWindow();
    } else if (this.workspaceWindow.isMinimized()) {
      this.workspaceWindow.restore();
      this.workspaceWindow.show();
      this.workspaceWindow.focus();
    } else if (this.workspaceWindow.isVisible()) {
      this.workspaceWindow.hide();
      this.workspaceWindow.webContents.send('workspace:unloaded');
    } else {
      this.workspaceWindow.show();
      this.workspaceWindow.focus();
    }
  }

  createSystemTray() {
    try {
      const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
      let icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        icon = nativeImage.createEmpty();
      }
      this.tray = new Tray(icon);
      this.tray.setToolTip('Gemini Desktop Assistant (Gemini Live)');
    } catch (trayErr) {
      console.warn('[Main] System tray initialization warning:', trayErr);
      return;
    }

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Full Desktop HUD',
        click: () => this.setMiniMode(false)
      },
      {
        label: 'Mini Floating Toolbar',
        click: () => this.setMiniMode(true)
      },
      {
        label: 'Floating Orb Only (Hide Side Docks)',
        click: () => {
          this.orbWindow?.show();
          this.leftWindow?.hide();
          this.rightWindow?.hide();
        }
      },
      {
        label: 'Minimize All to Tray',
        click: () => {
          this.orbWindow?.hide();
          this.leftWindow?.hide();
          this.rightWindow?.hide();
        }
      },
      {
        label: 'Workspace Deck (Ctrl+Shift+W)',
        click: () => this.toggleWorkspaceDeck()
      },
      { type: 'separator' },
      {
        label: 'Toggle Microphone',
        click: () => this.liveEngine.toggleMute()
      },
      {
        label: 'Toggle Vision Feed',
        click: () => this.liveEngine.toggleVision()
      },
      {
        label: 'Toggle Screen Share',
        click: () => this.liveEngine.toggleScreenShare()
      },
      { type: 'separator' },
      {
        label: 'Reconnect Gemini Live',
        click: () => this.liveEngine.connect()
      },
      {
        label: 'Exit Assistant',
        click: () => {
          app.isQuitting = true;
          this.liveEngine.disconnect();
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
    this.tray.on('double-click', () => {
      if (this.orbWindow.isVisible()) {
        this.orbWindow.hide();
        this.leftWindow.hide();
        this.rightWindow.hide();
      } else {
        if (this.isMiniMode) {
          this.orbWindow.show();
        } else {
          this.orbWindow.show();
          this.leftWindow.show();
          this.rightWindow.show();
        }
      }
    });
  }

  setupIpcHandlers() {
    // Live Connection Controls
    ipcMain.handle('live:connect', async (e, config) => {
      if (config) this.saveConfig(config);
      return await this.liveEngine.connect();
    });

    ipcMain.handle('live:disconnect', () => {
      this.liveEngine.disconnect();
      return true;
    });

    ipcMain.handle('live:send-text', (e, text) => {
      this.liveEngine.sendTextMessage(text);
      return true;
    });

    ipcMain.on('live:send-audio', (e, base64Pcm) => {
      this.liveEngine.sendAudioChunk(base64Pcm);
    });

    ipcMain.on('live:audio-stream-end', () => {
      this.liveEngine.sendAudioStreamEnd();
    });

    ipcMain.on('live:send-video', (e, { base64Jpeg, source }) => {
      this.liveEngine.sendVideoFrame(base64Jpeg, source);
    });

    ipcMain.handle('live:toggle-mute', () => this.liveEngine.toggleMute());
    ipcMain.handle('live:toggle-vision', () => this.liveEngine.toggleVision());
    ipcMain.handle('live:toggle-screen', () => this.liveEngine.toggleScreenShare());

    // Window & Tray Management
    ipcMain.on('window:minimize-tray', (e, windowName) => {
      if (windowName === 'left' && this.leftWindow) this.leftWindow.hide();
      else if (windowName === 'right' && this.rightWindow) this.rightWindow.hide();
      else if (windowName === 'orb' && this.orbWindow) this.orbWindow.hide();
      else if (windowName === 'all') {
        this.orbWindow?.hide();
        this.leftWindow?.hide();
        this.rightWindow?.hide();
      }
    });

    ipcMain.on('window:set-mini-mode', (e, isMini) => {
      this.setMiniMode(isMini);
    });

    ipcMain.on('window:restore', (e, windowName) => {
      if (windowName === 'left') this.leftWindow?.show();
      if (windowName === 'right') this.rightWindow?.show();
      if (windowName === 'orb') this.orbWindow?.show();
    });

    ipcMain.handle('window:toggle-top', () => {
      this.isAlwaysOnTop = !this.isAlwaysOnTop;
      this.orbWindow?.setAlwaysOnTop(this.isAlwaysOnTop);
      return this.isAlwaysOnTop;
    });

    ipcMain.on('window:adjust-size', (e, { windowName, width, height }) => {
      const win = windowName === 'right' ? this.rightWindow : (windowName === 'left' ? this.leftWindow : null);
      if (win && !win.isDestroyed()) {
        const primaryDisplay = screen.getPrimaryDisplay();
        const maxHeight = primaryDisplay.workAreaSize.height - 16;
        const [currentW, currentH] = win.getSize();
        const targetW = width || currentW;
        const targetH = Math.min(Math.max(Math.round(height), 480), maxHeight);
        if (Math.abs(currentH - targetH) > 4 || currentW !== targetW) {
          win.setSize(targetW, targetH);
          const [currX, currY] = win.getPosition();
          const newY = Math.max(8, Math.min(currY, primaryDisplay.workAreaSize.height - targetH - 8));
          win.setPosition(currX, newY);
        }
      }
    });

    ipcMain.on('app:quit', () => {
      app.isQuitting = true;
      this.liveEngine.disconnect();
      app.quit();
    });

    // Config Persistence & Theme
    ipcMain.handle('config:save', (e, cfg) => this.saveConfig(cfg));
    ipcMain.handle('config:load', () => this.config);
    ipcMain.handle('cursor:calibrate', (e, calib) => {
      return this.toolsManager.calibrateCursorBounds(calib?.insetRight, calib?.insetBottom, calib?.originX, calib?.originY);
    });
    ipcMain.on('theme:set', (e, themeId) => {
      this.config.theme = themeId;
      this.saveConfig({ theme: themeId });
      this.broadcast('theme:changed', themeId);
      console.log('[Main] Theme applied and broadcast to all windows:', themeId);
    });
    ipcMain.on('skin:set', (e, skinId) => {
      this.config.skin = skinId;

      // Auto-load voice based on active skin
      let targetVoice = this.config.standardVoice || 'Vega';
      if (skinId === 'gears' && this.config.gearsVoice && this.config.gearsVoice.trim() !== '') {
        targetVoice = this.config.gearsVoice.trim();
      }

      if (this.config.voiceName !== targetVoice) {
        this.config.voiceName = targetVoice;
        this.liveEngine.setVoice(targetVoice);
        this.broadcast('voice:changed', targetVoice);
        console.log(`[Main] Skin changed to "${skinId}". Auto-switched voice to "${targetVoice}".`);
      }

      this.saveConfig({ skin: skinId, voiceName: this.config.voiceName });
      this.broadcast('skin:changed', skinId);
      console.log('[Main] Skin applied and broadcast to all windows:', skinId);
    });

    // Native Tools & System Status
    ipcMain.handle('tools:system-status', () => this.toolsManager.getSystemStatus());
    ipcMain.handle('tools:exec-cmd', (e, cmd) => this.toolsManager.runPowerShell(cmd));

    // MCP Switchboard & Tool Execution Handlers
    ipcMain.handle('mcp:get-detailed', () => {
      return this.toolsManager.getMcpServersDetailed(this.config.enabledMcpServers);
    });

    ipcMain.handle('mcp:toggle-server', (e, { serverName, isEnabled }) => {
      let enabled = this.config.enabledMcpServers || [];
      if (isEnabled) {
        if (!enabled.includes(serverName)) enabled.push(serverName);
      } else {
        enabled = enabled.filter(s => s !== serverName);
      }
      this.saveConfig({ enabledMcpServers: enabled });
      return { success: true, enabledMcpServers: enabled };
    });

    ipcMain.handle('mcp:call-tool', async (e, { serverName, toolName, args }) => {
      return await this.toolsManager.callMcpTool(serverName, toolName, args);
    });

    // Screen Share Sources
    ipcMain.handle('screen:get-sources', async () => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        return sources.map(s => ({ id: s.id, name: s.name }));
      } catch (err) {
        console.error('[Main] Failed to get desktop sources:', err);
        return [];
      }
    });

    // Fast Desktop Screen Snapshot (Zero-WebRTC, 100% reliable)
    ipcMain.handle('screen:capture-snapshot', async () => {
      const base64 = await this.captureDesktopSnapshotJpeg();
      return base64 ? `data:image/jpeg;base64,${base64}` : null;
    });

    // Wake / Standby Toggle
    ipcMain.on('app:wake-or-toggle', () => {
      this.toggleVisibility();
    });

    // Workspace Deck IPC
    registerWorkspaceIpc(this);
    ipcMain.on('workspace:toggle', () => {
      this.toggleWorkspaceDeck();
    });
    ipcMain.on('workspace:open', () => {
      if (!this.workspaceWindow || this.workspaceWindow.isDestroyed()) {
        this.createWorkspaceWindow();
      } else {
        this.workspaceWindow.show();
        this.workspaceWindow.focus();
      }
    });

    // Google Workspace & Productivity Suite IPC
    ipcMain.handle('google-workspace:get-status', () => {
      return this.toolsManager.workspaceManager.getStatus();
    });
    ipcMain.handle('google-workspace:save-credentials', (e, { clientId, clientSecret }) => {
      return this.toolsManager.workspaceManager.saveCredentials(clientId, clientSecret);
    });
    ipcMain.handle('google-workspace:start-auth', async () => {
      return await this.toolsManager.workspaceManager.startAuthFlow();
    });
    ipcMain.handle('google-workspace:get-rundown', async () => {
      return await this.toolsManager.workspaceManager.getStartupRundown();
    });
    ipcMain.handle('google-workspace:toggle-rundown', (e, enabled) => {
      this.saveConfig({ startupRundownEnabled: enabled });
      return this.config.startupRundownEnabled;
    });
    ipcMain.handle('google-workspace:import-takeout', (e, sourcePath) => {
      return this.toolsManager.workspaceManager.importTakeoutConversations(sourcePath, this.toolsManager.memoryManager);
    });
    ipcMain.handle('google-workspace:sync-drive', async () => {
      return await this.toolsManager.workspaceManager.syncMemoryToDrive(this.toolsManager.memoryManager.memory);
    });
  }

  setMiniMode(isMini) {
    this.isMiniMode = !!isMini;
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    if (this.isMiniMode) {
      // 1. Hide side docks to maximize desktop workspace
      if (this.leftWindow && !this.leftWindow.isDestroyed()) this.leftWindow.hide();
      if (this.rightWindow && !this.rightWindow.isDestroyed()) this.rightWindow.hide();

      // 2. Morph Orb window into sleek top-of-screen floating toolbar
      const miniW = 420;
      const miniH = 46;
      const miniX = Math.round((width - miniW) / 2);
      const miniY = 10;

      if (this.orbWindow && !this.orbWindow.isDestroyed()) {
        this.orbWindow.setBounds({ x: miniX, y: miniY, width: miniW, height: miniH });
        this.orbWindow.setAlwaysOnTop(true, 'screen-saver');
        this.orbWindow.show();
        this.orbWindow.webContents.send('window:mini-mode-changed', true);
      }
    } else {
      // Restore full 3-window desktop suite
      const orbSize = 360;
      const orbX = Math.round((width - orbSize) / 2);
      const orbY = Math.round((height - orbSize) / 2) - 40;

      if (this.orbWindow && !this.orbWindow.isDestroyed()) {
        this.orbWindow.setBounds({ x: orbX, y: orbY, width: orbSize, height: orbSize });
        this.orbWindow.setAlwaysOnTop(this.isAlwaysOnTop);
        this.orbWindow.show();
        this.orbWindow.webContents.send('window:mini-mode-changed', false);
      }

      if (this.leftWindow && !this.leftWindow.isDestroyed()) this.leftWindow.show();
      if (this.rightWindow && !this.rightWindow.isDestroyed()) this.rightWindow.show();
    }
  }

  toggleVisibility() {
    const isOrbVisible = this.orbWindow && this.orbWindow.isVisible();
    if (isOrbVisible) {
      // Background / Standby mode: minimize all windows to system tray
      console.log('[Main] Entering standby mode (minimizing to tray)');
      this.orbWindow?.hide();
      this.leftWindow?.hide();
      this.rightWindow?.hide();
      this.broadcast('app:standby-changed', true);
    } else {
      // Wake up: restore active mode, bring to front, and activate
      console.log('[Main] Waking assistant from standby');
      if (this.isMiniMode) {
        this.orbWindow?.show();
        this.orbWindow?.focus();
      } else {
        this.orbWindow?.show();
        this.leftWindow?.show();
        this.rightWindow?.show();
        this.orbWindow?.focus();
      }
      this.broadcast('app:standby-changed', false);
      this.broadcast('app:woken-up');
    }
  }
}

// App Lifecycle & Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[Main] Another instance of Assistant_Integrated_Advanced is already running. Exiting redundant process.');
  app.quit();
  process.exit(0);
}

const assistant = new AssistantApp();

app.on('second-instance', () => {
  console.log('[Main] Second instance launched; bringing existing windows to front.');
  assistant.orbWindow?.show();
  assistant.leftWindow?.show();
  assistant.rightWindow?.show();
  assistant.orbWindow?.focus();
});

app.whenReady().then(() => {
  // Allow getDisplayMedia() to automatically capture primary desktop screen in Electron
  if (session.defaultSession.setDisplayMediaRequestHandler) {
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
        if (sources && sources.length > 0) {
          callback({ video: sources[0] });
        } else {
          callback({});
        }
      }).catch((err) => {
        console.error('[Main] setDisplayMediaRequestHandler error:', err);
        callback({});
      });
    });
  }

  assistant.setupIpcHandlers();
  assistant.createWindows();

  // Global Hotkey Wake/Minimize toggle (Ctrl+Shift+Space or Ctrl+Shift+G)
  try {
    globalShortcut.register('CommandOrControl+Shift+Space', () => {
      assistant.toggleVisibility();
    });
    globalShortcut.register('CommandOrControl+Shift+G', () => {
      assistant.toggleVisibility();
    });
    globalShortcut.register('CommandOrControl+Alt+Space', () => {
      const isMuted = assistant.liveEngine.toggleMute();
      console.log('[Main] Global Hotkey (Ctrl+Alt+Space) toggled microphone mute:', isMuted);
    });
    globalShortcut.register('CommandOrControl+Shift+W', () => {
      assistant.toggleWorkspaceDeck();
    });
    console.log('[Main] Global shortcuts registered: Ctrl+Shift+Space / Ctrl+Shift+G (Wake/Standby) | Ctrl+Alt+Space (Mute Toggle) | Ctrl+Shift+W (Workspace Deck)');
  } catch (err) {
    console.warn('[Main] Global shortcut registration error:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      assistant.createWindows();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep app running in tray unless explicit quit
  }
});
