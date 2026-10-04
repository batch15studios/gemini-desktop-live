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

  // System State & Native Tools
  getSystemStatus: () => ipcRenderer.invoke('tools:system-status'),
  executeCommand: (cmd) => ipcRenderer.invoke('tools:exec-cmd', cmd),

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
  }
});
