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
const btnSnapNow = document.getElementById('btnSnapNow');

const webcamTag = document.getElementById('webcamTag');
const screenTag = document.getElementById('screenTag');
const camOverlay = document.getElementById('camOverlay');
const screenOverlay = document.getElementById('screenOverlay');
const frameCounter = document.getElementById('frameCounter');
const snapshotCanvas = document.getElementById('snapshotCanvas');
const sCtx = snapshotCanvas.getContext('2d');

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
        video: { width: { ideal: 640 }, height: { ideal: 480 } }
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
  setTimeout(autoFitWindow, 150);
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

// 4. Periodic Vision Stream (~1 frame every 1.5 seconds)
function startPeriodicVisionLoop() {
  if (streamInterval) return;
  streamInterval = setInterval(() => {
    if (webcamStream || isScreenSharing) {
      captureAndSendFrame('auto');
    }
  }, 1500);
}

// 5. Manual Instant Snapshot
btnSnapNow.addEventListener('click', () => {
  captureAndSendFrame('auto');
});

// 6. Dynamic Auto-Fit Window Sizing (Zero Scrollbar HUD)
function autoFitWindow() {
  const card = document.querySelector('.glass-card');
  if (card && window.assistantApi?.adjustWindowSize) {
    // 24px clearance for container padding and window shadow
    const neededHeight = card.scrollHeight + 24;
    window.assistantApi.adjustWindowSize('right', 430, neededHeight);
  }
}

window.addEventListener('DOMContentLoaded', () => setTimeout(autoFitWindow, 100));
window.addEventListener('load', () => setTimeout(autoFitWindow, 250));

// Auto-boot camera on load if available
toggleWebcam().then(() => {
  setTimeout(autoFitWindow, 300);
});

// Theme Management
function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId || 'cyber-cyan');
}

window.assistantApi.onThemeChanged((themeId) => {
  applyTheme(themeId);
});

window.assistantApi.loadConfig().then(cfg => {
  if (cfg && cfg.theme) applyTheme(cfg.theme);
}).catch(err => console.warn('[Right HUD] Failed to load config theme:', err));
