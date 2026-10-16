/**
 * Preload Script for Assistant_Integrated_Advanced
 * Secure ContextBridge exposing IPC methods to the 3 Transparent Windows
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistantApi', {
  // Connection and Session Controls
  connectLive: (config) => ipcRenderer.invoke('live:connect', config),
  disconnectLive: () => ipcRenderer.invoke('live:disconnect'),
  sendTextMessage: (text) => ipcRenderer.invoke('live:send-text', text),
  sendAudioChunk: (base64Pcm) => ipcRenderer.send('live:send-audio', base64Pcm),
  sendAudioStreamEnd: () => ipcRenderer.send('live:audio-stream-end'),
  sendVideoFrame: (base64Jpeg, source) => ipcRenderer.send('live:send-video', { base64Jpeg, source }),
  
  // Audio & Perception Toggles
  toggleMute: () => ipcRenderer.invoke('live:toggle-mute'),
  toggleVision: () => ipcRenderer.invoke('live:toggle-vision'),
  toggleScreenShare: () => ipcRenderer.invoke('live:toggle-screen'),
  getScreenSources: () => ipcRenderer.invoke('screen:get-sources'),
  captureScreenSnapshot: () => ipcRenderer.invoke('screen:capture-snapshot'),

  // Window & System Tray Actions
  minimizeToTray: (windowName) => ipcRenderer.send('window:minimize-tray', windowName),
  restoreWindow: (windowName) => ipcRenderer.send('window:restore', windowName),
  setMiniMode: (isMini) => ipcRenderer.send('window:set-mini-mode', isMini),
  adjustWindowSize: (windowName, width, height) => ipcRenderer.send('window:adjust-size', { windowName, width, height }),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggle-top'),
  triggerWakeToggle: () => ipcRenderer.send('app:wake-or-toggle'),
  closeApp: () => ipcRenderer.send('app:quit'),

  // Settings, Theme & Configuration Persistence
  saveConfig: (config) => ipcRenderer.invoke('config:save', config),
  loadConfig: () => ipcRenderer.invoke('config:load'),
  setTheme: (themeId) => ipcRenderer.send('theme:set', themeId),
  setSkin: (skinId) => ipcRenderer.send('skin:set', skinId),

  // System State & Native Tools
  getSystemStatus: () => ipcRenderer.invoke('tools:system-status'),
  executeCommand: (cmd) => ipcRenderer.invoke('tools:exec-cmd', cmd),
  calibrateCursor: (calib) => ipcRenderer.invoke('cursor:calibrate', calib),

  // MCP Switchboard & Tool Execution
  getMcpServersDetailed: () => ipcRenderer.invoke('mcp:get-detailed'),
  toggleMcpServer: (serverName, isEnabled) => ipcRenderer.invoke('mcp:toggle-server', { serverName, isEnabled }),
  callMcpToolDirect: (serverName, toolName, args) => ipcRenderer.invoke('mcp:call-tool', { serverName, toolName, args }),

  // Google Workspace & Productivity Suite
  getWorkspaceStatus: () => ipcRenderer.invoke('google-workspace:get-status'),
  saveWorkspaceCredentials: (clientId, clientSecret) => ipcRenderer.invoke('google-workspace:save-credentials', { clientId, clientSecret }),
  startWorkspaceAuth: () => ipcRenderer.invoke('google-workspace:start-auth'),
  getWorkspaceRundown: () => ipcRenderer.invoke('google-workspace:get-rundown'),
  toggleWorkspaceRundown: (enabled) => ipcRenderer.invoke('google-workspace:toggle-rundown', enabled),
  importTakeoutHistory: (sourcePath) => ipcRenderer.invoke('google-workspace:import-takeout', sourcePath),
  syncDriveMemory: () => ipcRenderer.invoke('google-workspace:sync-drive'),

  // Real-time Event Listeners
  onStatus: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('live:status', handler);
    return () => ipcRenderer.removeListener('live:status', handler);
  },
  onTranscript: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('live:transcript', handler);
    return () => ipcRenderer.removeListener('live:transcript', handler);
  },
  onAudioOutputChunk: (callback) => {
    const handler = (e, base64Pcm) => callback(base64Pcm);
    ipcRenderer.on('live:audio-chunk', handler);
    return () => ipcRenderer.removeListener('live:audio-chunk', handler);
  },
  onInterrupted: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('live:interrupted', handler);
    return () => ipcRenderer.removeListener('live:interrupted', handler);
  },
  onTurnComplete: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('live:turn-complete', handler);
    return () => ipcRenderer.removeListener('live:turn-complete', handler);
  },
  onToolActivity: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('live:tool-activity', handler);
    return () => ipcRenderer.removeListener('live:tool-activity', handler);
  },
  onMuteChanged: (callback) => {
    const handler = (e, isMuted) => callback(isMuted);
    ipcRenderer.on('live:mute-changed', handler);
    return () => ipcRenderer.removeListener('live:mute-changed', handler);
  },
  onStandbyChanged: (callback) => {
    const handler = (e, inStandby) => callback(inStandby);
    ipcRenderer.on('app:standby-changed', handler);
    return () => ipcRenderer.removeListener('app:standby-changed', handler);
  },
  onWokenUp: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:woken-up', handler);
    return () => ipcRenderer.removeListener('app:woken-up', handler);
  },
  onMiniModeChanged: (callback) => {
    const handler = (e, isMini) => callback(isMini);
    ipcRenderer.on('window:mini-mode-changed', handler);
    return () => ipcRenderer.removeListener('window:mini-mode-changed', handler);
  },
  onThemeChanged: (callback) => {
    const handler = (e, themeId) => callback(themeId);
    ipcRenderer.on('theme:changed', handler);
    return () => ipcRenderer.removeListener('theme:changed', handler);
  },
  onSkinChanged: (callback) => {
    const handler = (e, skinId) => callback(skinId);
    ipcRenderer.on('skin:changed', handler);
    return () => ipcRenderer.removeListener('skin:changed', handler);
  },
  onVoiceChanged: (callback) => {
    const handler = (e, voiceName) => callback(voiceName);
    ipcRenderer.on('voice:changed', handler);
    return () => ipcRenderer.removeListener('voice:changed', handler);
  },
  onModelChanged: (callback) => {
    const handler = (e, model) => callback(model);
    ipcRenderer.on('model:changed', handler);
    return () => ipcRenderer.removeListener('model:changed', handler);
  },
  onSentryFired: (callback) => {
    const handler = (e, sentry) => callback(sentry);
    ipcRenderer.on('sentry:fired', handler);
    return () => ipcRenderer.removeListener('sentry:fired', handler);
  },
  onSafetyBlocked: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('safety:blocked', handler);
    return () => ipcRenderer.removeListener('safety:blocked', handler);
  },
  
  // Workspace Deck (4th Window Integration)
  openWorkspaceDeck: () => ipcRenderer.send('workspace:toggle'),
  toggleWorkspaceDeck: () => ipcRenderer.send('workspace:toggle')
});

contextBridge.exposeInMainWorld('workspaceApi', {
  minimizeRestore: () => ipcRenderer.send('workspace:minimize-restore'),
  maximizeToggle: () => ipcRenderer.send('workspace:maximize-toggle'),
  close: () => ipcRenderer.send('workspace:close'),
  getWindowState: () => ipcRenderer.invoke('workspace:get-window-state'),
  getDefaultPath: () => ipcRenderer.invoke('workspace:get-default-path'),
  readDir: (dirPath) => ipcRenderer.invoke('workspace:read-dir', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('workspace:read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('workspace:write-file', { filePath, content }),
  execCmd: (command, cwd) => ipcRenderer.invoke('workspace:exec-cmd', { command, cwd }),
  sendChat: (text) => ipcRenderer.invoke('workspace:chat-send', text),
  onUnloaded: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('workspace:unloaded', handler);
    return () => ipcRenderer.removeListener('workspace:unloaded', handler);
  },
  onSetMode: (callback) => {
    const handler = (e, mode) => callback(mode);
    ipcRenderer.on('workspace:set-mode', handler);
    return () => ipcRenderer.removeListener('workspace:set-mode', handler);
  },
  onNavigate: (callback) => {
    const handler = (e, url) => callback(url);
    ipcRenderer.on('workspace:navigate', handler);
    return () => ipcRenderer.removeListener('workspace:navigate', handler);
  },
  onOpenFile: (callback) => {
    const handler = (e, filePath) => callback(filePath);
    ipcRenderer.on('workspace:open-file', handler);
    return () => ipcRenderer.removeListener('workspace:open-file', handler);
  },
  getServerUrl: () => ipcRenderer.invoke('workspace:get-server-url'),
  onFileUpdated: (callback) => {
    const handler = (e, fileInfo) => callback(fileInfo);
    ipcRenderer.on('workspace:file-updated', handler);
    return () => ipcRenderer.removeListener('workspace:file-updated', handler);
  },
  dbGetSummary: () => ipcRenderer.invoke('workspace:db-summary'),
  dbQuery: (options) => ipcRenderer.invoke('workspace:db-query', options),
  dbExportCsv: (options) => ipcRenderer.invoke('workspace:db-export-csv', options),
  onDbUpdated: (callback) => {
    const handler = (e, data) => callback(data);
    ipcRenderer.on('workspace:db-updated', handler);
    return () => ipcRenderer.removeListener('workspace:db-updated', handler);
  }
});

