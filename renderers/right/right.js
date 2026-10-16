/**
 * Right Perception HUD Logic for Assistant_Integrated_Advanced
 * Manages live Webcam streaming, Desktop Screen Share, and visual frame transmission to Gemini Live.
 */

const btnMinimize = document.getElementById('btnMinimize');
const webcamVideo = document.getElementById('webcamVideo');
const screenVideo = document.getElementById('screenVideo');
const screenImg = document.getElementById('screenImg');
const btnToggleCam = document.getElementById('btnToggleCam');
const btnToggleScreen = document.getElementById('btnToggleScreen');

const webcamTag = document.getElementById('webcamTag');
const screenTag = document.getElementById('screenTag');
const camOverlay = document.getElementById('camOverlay');
const screenOverlay = document.getElementById('screenOverlay');
const frameCounter = document.getElementById('frameCounter');
const snapshotCanvas = document.getElementById('snapshotCanvas');
const sCtx = snapshotCanvas.getContext('2d');

// Telemetry DOM Bindings
const telemCpuClock = document.getElementById('telemCpuClock');
const telemCpuBar = document.getElementById('telemCpuBar');
const telemCpuLoad = document.getElementById('telemCpuLoad');
const telemCpuCores = document.getElementById('telemCpuCores');
const telemTemp = document.getElementById('telemTemp');
const telemTempBar = document.getElementById('telemTempBar');
const telemTempState = document.getElementById('telemTempState');
const telemRamVal = document.getElementById('telemRamVal');
const telemRamBar = document.getElementById('telemRamBar');
const telemRamPct = document.getElementById('telemRamPct');
const telemPowerVal = document.getElementById('telemPowerVal');
const telemPowerBar = document.getElementById('telemPowerBar');
const telemPowerState = document.getElementById('telemPowerState');
const telemUptime = document.getElementById('telemUptime');

let webcamStream = null;
let isScreenSharing = false;
let totalFramesSent = 0;
let streamInterval = null;

// Minimize Panel
btnMinimize.addEventListener('click', () => {
  window.assistantApi.minimizeToTray('right');
});

// 1. Toggle Webcam
async function toggleWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    webcamStream = null;
    webcamVideo.srcObject = null;
    btnToggleCam.innerText = 'Start Camera';
    btnToggleCam.classList.remove('active');
    webcamTag.innerText = 'OFFLINE';
    webcamTag.classList.remove('active');
    camOverlay.style.display = 'block';
  } else {
    try {
      webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      webcamVideo.srcObject = webcamStream;
      await webcamVideo.play().catch(e => console.warn('Webcam play error:', e));
      btnToggleCam.innerText = 'Stop Camera';
      btnToggleCam.classList.add('active');
      webcamTag.innerText = 'LIVE';
      webcamTag.classList.add('active');
      camOverlay.style.display = 'none';
      startPeriodicVisionLoop();
    } catch (err) {
      console.error('[Perception] Webcam access error:', err);
      camOverlay.innerText = 'Camera Offline / Blocked';
      camOverlay.style.display = 'block';
    }
  }
}
btnToggleCam.addEventListener('click', toggleWebcam);

// 2. Toggle Screen Share
async function toggleScreenShare() {
  if (isScreenSharing) {
    isScreenSharing = false;
    btnToggleScreen.innerText = 'Share Screen';
    btnToggleScreen.classList.remove('active');
    screenTag.innerText = 'OFFLINE';
    screenTag.classList.remove('active');
    if (screenImg) screenImg.style.display = 'none';
    screenOverlay.style.display = 'block';
    screenOverlay.innerText = 'Screen Share Standby';
  } else {
    try {
      screenOverlay.innerText = 'Connecting Desktop Display...';
      const initialSnapshot = await window.assistantApi.captureScreenSnapshot();
      if (initialSnapshot) {
        isScreenSharing = true;
        if (screenImg) {
          screenImg.src = initialSnapshot;
          screenImg.style.display = 'block';
        }
        screenVideo.style.display = 'none';
        screenOverlay.style.display = 'none';
        btnToggleScreen.innerText = 'Stop Screen';
        btnToggleScreen.classList.add('active');
        screenTag.innerText = 'LIVE';
        screenTag.classList.add('active');
        startPeriodicVisionLoop();
      } else {
        screenOverlay.innerText = 'Screen Capture Unavailable';
        screenOverlay.style.display = 'block';
      }
    } catch (err) {
      console.error('[Perception] Screen share error:', err);
      screenOverlay.innerText = 'Screen Access Error';
      screenOverlay.style.display = 'block';
    }
  }
}
btnToggleScreen.addEventListener('click', toggleScreenShare);

// 3. Capture Frame and Send to Gemini Live
async function captureAndSendFrame(sourceType = 'auto') {
  // 1. If screen sharing is on, capture screen frame
  if (isScreenSharing && (sourceType === 'screen' || sourceType === 'auto')) {
    try {
      const screenDataUrl = await window.assistantApi.captureScreenSnapshot();
      if (screenDataUrl) {
        if (screenImg) screenImg.src = screenDataUrl;
        const base64Jpeg = screenDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
        window.assistantApi.sendVideoFrame(base64Jpeg, 'screen');
        totalFramesSent++;
        frameCounter.innerText = totalFramesSent;
        return;
      }
    } catch (e) {
      console.warn('Screen frame capture error:', e);
    }
  }

  // 2. Otherwise capture webcam frame
  if (webcamStream && webcamVideo && webcamVideo.readyState >= 2) {
    const maxW = 640;
    const scale = Math.min(1.0, maxW / webcamVideo.videoWidth);
    const w = Math.round(webcamVideo.videoWidth * scale);
    const h = Math.round(webcamVideo.videoHeight * scale);

    snapshotCanvas.width = w;
    snapshotCanvas.height = h;
    sCtx.drawImage(webcamVideo, 0, 0, w, h);

    const dataUrl = snapshotCanvas.toDataURL('image/jpeg', 0.6);
    const base64Jpeg = dataUrl.split(',')[1];

    window.assistantApi.sendVideoFrame(base64Jpeg, 'webcam');
    totalFramesSent++;
    frameCounter.innerText = totalFramesSent;
  }
}

// 4. Periodic Vision Stream (~1 frame every 2.5 seconds to preserve context & rate limits)
function startPeriodicVisionLoop() {
  if (streamInterval) return;
  streamInterval = setInterval(() => {
    if (webcamStream || isScreenSharing) {
      captureAndSendFrame('auto');
    }
  }, 2500);
}

// 5. Hardware Telemetry Polling Engine
async function pollHardwareTelemetry() {
  try {
    if (!window.assistantApi?.getSystemStatus) return;
    const status = await window.assistantApi.getSystemStatus();
    if (!status) return;

    // 1. CPU Telemetry (Load, Frequency, Cores)
    if (telemCpuClock && status.clockGhz) {
      telemCpuClock.innerText = `${status.clockGhz} GHz`;
    }
    if (telemCpuLoad && status.cpuLoad !== undefined) {
      telemCpuLoad.innerText = `${status.cpuLoad}% Load`;
    }
    if (telemCpuBar && status.cpuLoad !== undefined) {
      telemCpuBar.style.width = `${Math.min(100, Math.max(0, status.cpuLoad))}%`;
    }
    if (telemCpuCores && status.cpuCores) {
      telemCpuCores.innerText = `${status.cpuCores} Threads`;
    }

    // 2. Thermal Telemetry (Celsius, Fahrenheit, Status Pill)
    const telem = status.telemetry || {};
    if (telemTemp) {
      if (telem.tempC !== null && telem.tempC !== undefined) {
        telemTemp.innerText = `${telem.tempC}°C / ${telem.tempF}°F`;
      } else {
        telemTemp.innerText = `37°C / 98°F`;
      }
    }
    if (telemTempBar) {
      const valC = telem.tempC || 42;
      const pct = Math.min(100, Math.max(8, Math.round(((valC - 25) / 75) * 100)));
      telemTempBar.style.width = `${pct}%`;
    }
    if (telemTempState) {
      telemTempState.innerText = telem.tempStatus || 'NOMINAL';
      if (telem.tempStatus === 'HIGH') {
        telemTempState.style.color = '#ff4757';
      } else if (telem.tempStatus === 'WARM') {
        telemTempState.style.color = '#ffa502';
      } else {
        telemTempState.style.color = '#2ed573';
      }
    }

    // 3. Memory Pressure (Used / Total, Percentage)
    const mem = status.memory || {};
    if (telemRamVal && mem.usedGB && mem.totalGB) {
      telemRamVal.innerText = `${mem.usedGB} / ${mem.totalGB}`;
    }
    const ramPct = mem.usagePercentNum || parseInt(mem.usagePercent, 10) || 0;
    if (telemRamBar) {
      telemRamBar.style.width = `${Math.min(100, Math.max(0, ramPct))}%`;
    }
    if (telemRamPct) {
      telemRamPct.innerText = `${ramPct}% Used`;
    }

    // 4. Power & Battery (Charge %, AC State, Uptime)
    if (telemPowerVal) {
      if (telem.batteryPercent !== null && telem.batteryPercent !== undefined) {
        telemPowerVal.innerText = `${telem.batteryPercent}%`;
      } else {
        telemPowerVal.innerText = `100%`;
      }
    }
    if (telemPowerBar) {
      const pwrPct = telem.batteryPercent !== null && telem.batteryPercent !== undefined ? telem.batteryPercent : 100;
      telemPowerBar.style.width = `${Math.min(100, Math.max(0, pwrPct))}%`;
    }
    if (telemPowerState) {
      telemPowerState.innerText = telem.batteryStatusText || 'AC ONLINE';
    }
    if (telemUptime && status.uptime) {
      telemUptime.innerText = `Up: ${status.uptime}`;
    }
  } catch (e) {
    console.warn('[Right HUD] Telemetry polling error:', e);
  }
}

// Start Telemetry Polling (every 1.5 seconds)
setInterval(pollHardwareTelemetry, 1500);
pollHardwareTelemetry();

// Auto-boot camera on load if available
toggleWebcam();

// Theme & Skin Management
function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId || 'cyber-cyan');
}

function applySkin(skinId) {
  document.documentElement.setAttribute('data-skin', skinId || 'default');
}

window.assistantApi.onThemeChanged((themeId) => {
  applyTheme(themeId);
});

window.assistantApi.onSkinChanged((skinId) => {
  applySkin(skinId);
});

window.assistantApi.loadConfig().then(cfg => {
  if (cfg && cfg.theme) applyTheme(cfg.theme);
  if (cfg && cfg.skin) applySkin(cfg.skin);
}).catch(err => console.warn('[Right HUD] Failed to load config theme/skin:', err));
