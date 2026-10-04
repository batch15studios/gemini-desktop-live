/**
 * Main Process for Assistant_Integrated_Advanced
 * Manages 3 transparent floating windows (Left Dock, Central Orb, Right Vision Dock),
 * Windows System Tray, Native Tool dispatch, and Gemini Live streaming.
 */

const { app, BrowserWindow, ipcMain, Tray, Menu, screen, desktopCapturer, nativeImage, session, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');
require('dotenv').config();

const { GeminiLiveEngine } = require('./gemini-live-engine');
const { ToolsManager } = require('./native-tools');

// Enable native Chromium WebRTC Audio Processing Module (AEC3, AGC, NS) & loopback
app.commandLine.appendSwitch('enable-features', 'WebRtcApmInAudioService,AudioServiceOutOfProcess');
app.commandLine.appendSwitch('enable-webrtc-apm-in-audio-service');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

class AssistantApp {
  constructor() {
    this.orbWindow = null;
    this.leftWindow = null;
    this.rightWindow = null;
    this.tray = null;
    this.isAlwaysOnTop = true;
    this.isMiniMode = false;

    this.engineEmitter = new EventEmitter();
    this.toolsManager = new ToolsManager(this.engineEmitter);
    this.configPath = path.join(app.getPath('userData'), 'assistant_config.json');
    this.config = this.loadConfig();

    this.liveEngine = new GeminiLiveEngine({
      apiKey: this.config.apiKey || process.env.GEMINI_API_KEY || '',
      voiceName: this.config.voiceName || 'Aoede',
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
        loaded.theme = loaded.theme || 'cyber-cyan';
        return loaded;
      }
    } catch (e) {
      console.warn('Could not read config, using defaults:', e);
    }
    return {
      apiKey: process.env.GEMINI_API_KEY || '',
      voiceName: 'Aoede',
      visionEnabled: true,
      screenShareEnabled: true,
      theme: 'cyber-cyan'
    };
  }

  saveConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
      if (newConfig.apiKey) {
        this.liveEngine.setApiKey(newConfig.apiKey);
      }
      if (newConfig.voiceName) {
        this.liveEngine.setVoice(newConfig.voiceName);
      }
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  setupEngineEvents() {
    this.engineEmitter.on('status', (data) => this.broadcast('live:status', data));
    this.engineEmitter.on('transcript', (data) => this.broadcast('live:transcript', data));
    this.engineEmitter.on('audio_output_chunk', (chunk) => this.broadcast('live:audio-chunk', chunk));
    this.engineEmitter.on('interrupted', () => this.broadcast('live:interrupted'));
    this.engineEmitter.on('tool_executing', (data) => this.broadcast('live:tool-activity', { type: 'executing', ...data }));
    this.engineEmitter.on('tool_completed', (data) => this.broadcast('live:tool-activity', { type: 'completed', ...data }));
    this.engineEmitter.on('tool_failed', (data) => this.broadcast('live:tool-activity', { type: 'failed', ...data }));
    this.engineEmitter.on('mute_changed', (isMuted) => this.broadcast('live:mute-changed', isMuted));
  }

  broadcast(channel, data) {
    if (this.orbWindow && !this.orbWindow.isDestroyed()) this.orbWindow.webContents.send(channel, data);
    if (this.leftWindow && !this.leftWindow.isDestroyed()) this.leftWindow.webContents.send(channel, data);
    if (this.rightWindow && !this.rightWindow.isDestroyed()) this.rightWindow.webContents.send(channel, data);
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

    // 3. Right Window: Perception HUD, Webcam, Screen Share
    const rightW = 430;
    const rightH = Math.min(760, height - 50);
    this.rightWindow = new BrowserWindow({
      width: rightW,
      height: rightH,
      x: width - rightW - 30,
      y: Math.round((height - rightH) / 2),
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
        const maxHeight = primaryDisplay.workAreaSize.height - 40;
        const [currentW, currentH] = win.getSize();
        const targetW = width || currentW;
        const targetH = Math.min(Math.max(Math.round(height), 480), maxHeight);
        if (Math.abs(currentH - targetH) > 4 || currentW !== targetW) {
          win.setSize(targetW, targetH);
          const [currX, currY] = win.getPosition();
          const newY = Math.max(20, Math.min(currY, primaryDisplay.workAreaSize.height - targetH - 20));
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
    ipcMain.on('theme:set', (e, themeId) => {
      this.config.theme = themeId;
      this.saveConfig({ theme: themeId });
      this.broadcast('theme:changed', themeId);
      console.log('[Main] Theme applied and broadcast to all windows:', themeId);
    });

    // Native Tools & System Status
    ipcMain.handle('tools:system-status', () => this.toolsManager.getSystemStatus());
    ipcMain.handle('tools:exec-cmd', (e, cmd) => this.toolsManager.runPowerShell(cmd));

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
      try {
        const primary = screen.getPrimaryDisplay();
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: {
            width: Math.min(1280, primary.size.width),
            height: Math.min(720, primary.size.height)
          }
        });
        if (sources && sources.length > 0) {
          return sources[0].thumbnail.toDataURL();
        }
      } catch (err) {
        console.error('[Main] Desktop snapshot error:', err);
      }
      return null;
    });

    // Wake / Standby Toggle
    ipcMain.on('app:wake-or-toggle', () => {
      this.toggleVisibility();
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
    console.log('[Main] Global wake shortcuts registered: Ctrl+Shift+Space / Ctrl+Shift+G');
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
