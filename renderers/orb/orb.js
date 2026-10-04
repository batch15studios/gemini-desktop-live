/**
 * Multimodal AI Orb Logic & Audio-Reactive Canvas Engine
 * Handles real-time WebGL/2D energy sphere animations, mic capture, and 24kHz PCM playback.
 */

// Canvas & Visual State
const canvas = document.getElementById('orbCanvas');
const ctx = canvas.getContext('2d');
const stateBadge = document.getElementById('stateBadge');
const btnMic = document.getElementById('btnMic');
const btnPin = document.getElementById('btnPin');
const btnMin = document.getElementById('btnMin');

// Mini Floating Toolbar Elements
const miniToolbar = document.getElementById('miniToolbar');
const miniStatus = document.getElementById('miniStatus');
const miniStatusDot = document.getElementById('miniStatusDot');
const miniStatusText = document.getElementById('miniStatusText');
const synthCanvas = document.getElementById('waveSynthCanvas');
const synthCtx = synthCanvas ? synthCanvas.getContext('2d') : null;
const btnMiniMic = document.getElementById('btnMiniMic');
const btnExpand = document.getElementById('btnExpand');
const btnMiniTray = document.getElementById('btnMiniTray');
const miniSynthWrapper = document.getElementById('miniSynthWrapper');

let isMiniMode = false;
let currentTheme = 'cyber-cyan';
let currentState = 'IDLE'; // IDLE, LISTENING, THINKING, SPEAKING
let micLevel = 0;
let outputLevel = 0;
let isMuted = false;
let isPinned = true;
let animAngle = 0;

function applyTheme(themeId) {
  currentTheme = themeId || 'cyber-cyan';
  document.documentElement.setAttribute('data-theme', currentTheme);
  const pal = (typeof getThemePalette === 'function') ? getThemePalette(currentTheme) : null;
  if (canvas && currentState === 'IDLE' && pal) {
    canvas.style.filter = `drop-shadow(0 0 25px ${pal.glow})`;
  }
}

// Particles for visual depth
const particles = [];
const numParticles = 40;
for (let i = 0; i < numParticles; i++) {
  particles.push({
    x: (Math.random() - 0.5) * 160,
    y: (Math.random() - 0.5) * 160,
    size: Math.random() * 2 + 1,
    speed: Math.random() * 0.02 + 0.01,
    angle: Math.random() * Math.PI * 2,
    dist: Math.random() * 70 + 20
  });
}

function updateState(newState) {
  currentState = newState;
  stateBadge.innerText = newState;
  
  if (miniStatusText) {
    miniStatusText.innerText = isMuted ? 'MUTED' : newState;
  }
  if (miniStatusDot) {
    miniStatusDot.className = 'mini-status-dot';
    if (isMuted) {
      miniStatusDot.classList.add('muted');
    } else if (newState === 'SPEAKING') {
      miniStatusDot.classList.add('speaking');
    } else if (newState === 'THINKING') {
      miniStatusDot.classList.add('thinking');
    } else if (newState === 'LISTENING') {
      miniStatusDot.classList.add('listening');
    }
  }

  if (newState === 'SPEAKING') {
    stateBadge.style.color = '#00f0ff';
    stateBadge.style.borderColor = 'rgba(0, 240, 255, 0.6)';
    canvas.style.filter = 'drop-shadow(0 0 35px rgba(0, 240, 255, 0.75))';
  } else if (newState === 'THINKING') {
    stateBadge.style.color = '#ffd32a';
    stateBadge.style.borderColor = 'rgba(255, 211, 42, 0.6)';
    canvas.style.filter = 'drop-shadow(0 0 30px rgba(255, 211, 42, 0.65))';
  } else if (newState === 'LISTENING') {
    stateBadge.style.color = '#2ed573';
    stateBadge.style.borderColor = 'rgba(46, 213, 115, 0.6)';
    canvas.style.filter = 'drop-shadow(0 0 30px rgba(46, 213, 115, 0.65))';
  } else {
    const pal = (typeof getThemePalette === 'function') ? getThemePalette(currentTheme) : null;
    const accent = pal ? pal.primary : '#00f0ff';
    stateBadge.style.color = accent;
    stateBadge.style.borderColor = pal ? pal.ring : 'rgba(0, 240, 255, 0.3)';
    canvas.style.filter = pal ? `drop-shadow(0 0 25px ${pal.glow})` : 'drop-shadow(0 0 25px rgba(0, 220, 255, 0.45))';
  }
}

// ----------------------------------------------------
// Audio-Reactive Canvas Render Loop
// ----------------------------------------------------
function renderOrb() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const pal = (typeof getThemePalette === 'function') ? getThemePalette(currentTheme) : null;

  animAngle += (currentState === 'THINKING' ? 0.05 : 0.02);

  // Dynamic radius based on state and sound volume
  let baseRadius = 55;
  let pulse = 0;
  if (currentState === 'SPEAKING') {
    pulse = outputLevel * 45;
  } else if (currentState === 'LISTENING') {
    pulse = micLevel * 35;
  } else {
    pulse = Math.sin(animAngle * 2) * 4;
  }
  const currentRadius = baseRadius + pulse;

  // 1. Outer Diffuse Glow Aura
  const outerGrad = ctx.createRadialGradient(cx, cy, currentRadius * 0.4, cx, cy, currentRadius * 1.8);
  if (currentState === 'THINKING') {
    outerGrad.addColorStop(0, 'rgba(255, 180, 0, 0.35)');
    outerGrad.addColorStop(0.6, 'rgba(255, 100, 0, 0.15)');
    outerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else if (currentState === 'LISTENING') {
    outerGrad.addColorStop(0, 'rgba(46, 213, 115, 0.35)');
    outerGrad.addColorStop(0.6, 'rgba(0, 240, 255, 0.15)');
    outerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  } else {
    outerGrad.addColorStop(0, pal ? pal.aura : 'rgba(0, 220, 255, 0.4)');
    outerGrad.addColorStop(0.6, pal ? pal.glow : 'rgba(0, 100, 255, 0.15)');
    outerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  }
  ctx.fillStyle = outerGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, currentRadius * 1.8, 0, Math.PI * 2);
  ctx.fill();

  // 2. Rotating Orbital Rings
  const ringCount = 3;
  for (let r = 0; r < ringCount; r++) {
    ctx.save();
    ctx.translate(cx, cy);
    const rotation = animAngle * (r % 2 === 0 ? 1 : -1) * (1 + r * 0.3);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.ellipse(0, 0, currentRadius * (1.1 + r * 0.15), currentRadius * (0.65 - r * 0.1), Math.PI / (r + 1), 0, Math.PI * 2);
    ctx.strokeStyle = (currentState === 'THINKING')
      ? `rgba(255, 211, 42, ${0.4 - r * 0.1})`
      : (pal ? pal.ring : `rgba(0, 240, 255, ${0.45 - r * 0.1})`);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  // 3. Swirling Core Particles
  particles.forEach(p => {
    p.angle += p.speed * (currentState === 'THINKING' ? 2.5 : 1);
    const px = cx + Math.cos(p.angle) * (p.dist + pulse * 0.4);
    const py = cy + Math.sin(p.angle) * (p.dist * 0.7 + pulse * 0.3);
    ctx.beginPath();
    ctx.arc(px, py, p.size, 0, Math.PI * 2);
    ctx.fillStyle = (currentState === 'THINKING')
      ? 'rgba(255, 230, 100, 0.75)'
      : (pal ? pal.secondary : 'rgba(120, 245, 255, 0.75)');
    ctx.fill();
  });

  // 4. Vibrant Dense Core
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, currentRadius);
  if (currentState === 'THINKING') {
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.3, '#ffd32a');
    coreGrad.addColorStop(0.7, '#ff5e57');
    coreGrad.addColorStop(1, 'rgba(255, 94, 87, 0.1)');
  } else if (currentState === 'LISTENING') {
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.3, '#2ed573');
    coreGrad.addColorStop(0.7, '#00d2d3');
    coreGrad.addColorStop(1, 'rgba(0, 210, 211, 0.1)');
  } else {
    coreGrad.addColorStop(0, pal ? pal.coreA : '#ffffff');
    coreGrad.addColorStop(0.25, pal ? pal.coreB : '#70a1ff');
    coreGrad.addColorStop(0.65, pal ? pal.coreC : '#00d2d3');
    coreGrad.addColorStop(1, pal ? pal.glow : 'rgba(0, 210, 211, 0.1)');
  }
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, currentRadius, 0, Math.PI * 2);
  ctx.fill();
}

// ----------------------------------------------------
// Real-Time Wave Synth Canvas Visualizer (Mini Mode)
// ----------------------------------------------------
function renderWaveSynth() {
  if (!synthCtx || !isMiniMode) return;

  const w = synthCanvas.width;
  const h = synthCanvas.height;
  const midY = h / 2;

  synthCtx.clearRect(0, 0, w, h);

  const numBars = 26;
  const barWidth = 6;
  const totalBarWidth = numBars * barWidth;
  const gap = (w - totalBarWidth) / (numBars + 1);

  let activeData = null;
  let synthTheme = 'idle'; // 'assistant', 'user', 'thinking', 'idle'

  if (isAssistantSpeaking && playbackAnalyser && playbackFreqData) {
    playbackAnalyser.getByteFrequencyData(playbackFreqData);
    activeData = playbackFreqData;
    synthTheme = 'assistant';
  } else if (!isMuted && micLevel > 0.04 && micAnalyser && micFreqData) {
    micAnalyser.getByteFrequencyData(micFreqData);
    activeData = micFreqData;
    synthTheme = 'user';
  } else if (currentState === 'THINKING') {
    synthTheme = 'thinking';
  } else {
    synthTheme = 'idle';
  }

  // Draw background subtle center guideline
  synthCtx.beginPath();
  synthCtx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
  synthCtx.lineWidth = 1;
  synthCtx.moveTo(0, midY);
  synthCtx.lineTo(w, midY);
  synthCtx.stroke();

  // Draw 26 dynamic equalizer synth bars
  for (let i = 0; i < numBars; i++) {
    const x = gap + i * (barWidth + gap);
    let barHeight = 4;

    if (activeData) {
      const binIdx = Math.floor((i / numBars) * (activeData.length * 0.7));
      const val = activeData[binIdx] || 0;
      barHeight = Math.max(4, (val / 255) * (h * 0.88));
    } else if (synthTheme === 'thinking') {
      const wave = Math.sin(animAngle * 4 + i * 0.35);
      barHeight = 6 + Math.abs(wave) * (h * 0.5);
    } else {
      const wave = Math.sin(animAngle * 2 + i * 0.28);
      barHeight = 4 + (wave * 0.5 + 0.5) * 8;
    }

    const halfH = barHeight / 2;
    const yTop = midY - halfH;

    const barGrad = synthCtx.createLinearGradient(0, yTop, 0, yTop + barHeight);
    if (synthTheme === 'assistant') {
      barGrad.addColorStop(0, '#00f0ff');
      barGrad.addColorStop(0.5, '#70a1ff');
      barGrad.addColorStop(1, '#00d2d3');
      synthCtx.shadowColor = 'rgba(0, 240, 255, 0.6)';
    } else if (synthTheme === 'user') {
      barGrad.addColorStop(0, '#2ed573');
      barGrad.addColorStop(0.5, '#10ac84');
      barGrad.addColorStop(1, '#00f0ff');
      synthCtx.shadowColor = 'rgba(46, 213, 115, 0.6)';
    } else if (synthTheme === 'thinking') {
      barGrad.addColorStop(0, '#ffd32a');
      barGrad.addColorStop(0.5, '#ffa502');
      barGrad.addColorStop(1, '#ff6b81');
      synthCtx.shadowColor = 'rgba(255, 211, 42, 0.6)';
    } else {
      const pal = (typeof getThemePalette === 'function') ? getThemePalette(currentTheme) : null;
      if (pal && pal.synthGradient) {
        barGrad.addColorStop(0, pal.synthGradient[0]);
        barGrad.addColorStop(1, pal.synthGradient[1]);
      } else {
        barGrad.addColorStop(0, 'rgba(0, 240, 255, 0.5)');
        barGrad.addColorStop(1, 'rgba(0, 140, 255, 0.2)');
      }
      synthCtx.shadowColor = 'transparent';
    }

    synthCtx.shadowBlur = (synthTheme === 'idle') ? 0 : 6;
    synthCtx.fillStyle = barGrad;

    synthCtx.beginPath();
    if (synthCtx.roundRect) {
      synthCtx.roundRect(x, yTop, barWidth, barHeight, 3);
    } else {
      synthCtx.rect(x, yTop, barWidth, barHeight);
    }
    synthCtx.fill();
  }

  // Draw glowing continuous wave line across the bar tops for oscilloscope synth aesthetic
  synthCtx.shadowBlur = (synthTheme === 'idle') ? 2 : 8;
  synthCtx.beginPath();
  for (let i = 0; i < numBars; i++) {
    const x = gap + i * (barWidth + gap) + barWidth / 2;
    let barHeight = 4;
    if (activeData) {
      const binIdx = Math.floor((i / numBars) * (activeData.length * 0.7));
      const val = activeData[binIdx] || 0;
      barHeight = Math.max(4, (val / 255) * (h * 0.88));
    } else if (synthTheme === 'thinking') {
      const wave = Math.sin(animAngle * 4 + i * 0.35);
      barHeight = 6 + Math.abs(wave) * (h * 0.5);
    } else {
      const wave = Math.sin(animAngle * 2 + i * 0.28);
      barHeight = 4 + (wave * 0.5 + 0.5) * 8;
    }
    const yTop = midY - barHeight / 2;
    if (i === 0) synthCtx.moveTo(x, yTop);
    else synthCtx.lineTo(x, yTop);
  }
  const pal = (typeof getThemePalette === 'function') ? getThemePalette(currentTheme) : null;
  synthCtx.strokeStyle = (synthTheme === 'assistant') ? '#ffffff'
    : (synthTheme === 'user' ? '#a8ff78'
    : (synthTheme === 'thinking' ? '#fff275' : (pal ? pal.synthWave : 'rgba(0, 240, 255, 0.6)')));
  synthCtx.lineWidth = 1.4;
  synthCtx.stroke();
  synthCtx.shadowBlur = 0;
}

function renderVisuals() {
  if (isMiniMode) {
    animAngle += (currentState === 'THINKING' ? 0.05 : 0.02);
    renderWaveSynth();
  } else {
    renderOrb();
  }
  requestAnimationFrame(renderVisuals);
}
requestAnimationFrame(renderVisuals);

// ----------------------------------------------------
// Audio System: Capture 16kHz PCM & Playback 24kHz PCM
// ----------------------------------------------------
let micStream = null;
let audioContext = null;
let scriptProcessor = null;
let playbackContext = null;
let playbackQueue = [];
let nextPlayTime = 0;
let isPlayingAudio = false;
let isAssistantSpeaking = false;
let roomReverbDecayUntil = 0;
let interruptionSustainedFrames = 0;

let activeSources = [];
let isInStandby = false;
let spikeCooldown = 0;

let micAnalyser = null;
let micFreqData = null;
let playbackAnalyser = null;
let playbackFreqData = null;

// High-frequency energy detection for acoustic transients (clap / finger snap)
function detectSoundSnapOrClap(freqArray) {
  if (isAssistantSpeaking) return false;
  // Claps and snaps produce high energy in the 2.5kHz - 8kHz frequency band (bins 30-110)
  let highFreqSum = 0;
  const startBin = 30;
  const endBin = Math.min(freqArray.length, 110);
  for (let i = startBin; i < endBin; i++) {
    highFreqSum += freqArray[i];
  }
  const avgHighFreq = highFreqSum / (endBin - startBin);
  const now = Date.now();

  // Threshold: sudden sharp acoustic transient
  if (avgHighFreq > 140 && (now - spikeCooldown > 1200)) {
    spikeCooldown = now;
    console.log('[Orb] Acoustic transient (clap/snap) detected! Avg:', avgHighFreq);
    window.assistantApi.triggerWakeToggle();
    playWakeChime(isInStandby);
    return true;
  }
  return false;
}

// Futuristic Web Audio Synthesizer Chime
function playWakeChime(isSleep = false) {
  initPlaybackContext();
  try {
    const osc = playbackContext.createOscillator();
    const gain = playbackContext.createGain();
    osc.type = 'sine';
    const now = playbackContext.currentTime;

    if (isSleep) {
      // Descending chime for sleep/minimize
      osc.frequency.setValueAtTime(880.00, now); // A5
      osc.frequency.exponentialRampToValueAtTime(440.00, now + 0.18); // A4
    } else {
      // Ascending chime for wake
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.15); // C6
    }

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(gain);
    if (mediaStreamDest) {
      gain.connect(mediaStreamDest);
    } else {
      gain.connect(playbackContext.destination);
    }
    osc.start(now);
    osc.stop(now + 0.28);
  } catch (e) {
    console.warn('Chime error:', e);
  }
}

async function startMicrophoneCapture() {
  try {
    // Full Chromium native WebRTC AEC profile with hardware render loopback
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },
        googEchoCancellation: { ideal: true },
        googAutoGainControl: { ideal: true },
        googNoiseSuppression: { ideal: true },
        googHighpassFilter: { ideal: true },
        googTypingNoiseDetection: { ideal: true }
      }
    });

    // Native AudioContext at 16kHz
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(micStream);

    // --- Voice Isolation & Anti-Feedback DSP Pipeline ---
    // 1. High-Pass Filter (85 Hz): Strips low-frequency room rumble, desk vibration, and speaker bass resonance
    const highpass = audioContext.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 85;
    highpass.Q.value = 0.707;

    // 2. Low-Pass Filter (7500 Hz): Cuts ultrasonic noise, room hiss, and high-frequency feedback squeals
    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 7500;
    lowpass.Q.value = 0.707;

    // 3. Voice Presence Peaking Filter (2500 Hz): Boosts vocal formant clarity & speech intelligibility
    const voicePeaking = audioContext.createBiquadFilter();
    voicePeaking.type = 'peaking';
    voicePeaking.frequency.value = 2500;
    voicePeaking.gain.value = 2.5; // +2.5dB vocal presence
    voicePeaking.Q.value = 1.0;

    // Chain Voice Filters: source -> highpass -> lowpass -> voicePeaking
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(voicePeaking);

    // Connect Filtered Voice to Analyser
    micAnalyser = audioContext.createAnalyser();
    micAnalyser.fftSize = 128;
    micAnalyser.smoothingTimeConstant = 0.7;
    voicePeaking.connect(micAnalyser);

    // Buffer processing to 16-bit PCM (1024 samples = 64ms for ultra-low latency)
    const bufferSize = 1024;
    scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    voicePeaking.connect(scriptProcessor);

    // Anti-Feedback Silent Sink: Ensures mic audio is NEVER amplified back through physical speakers
    const silentSink = audioContext.createGain();
    silentSink.gain.value = 0;
    scriptProcessor.connect(silentSink);
    silentSink.connect(audioContext.destination);

    micFreqData = new Uint8Array(micAnalyser.frequencyBinCount);

    scriptProcessor.onaudioprocess = (e) => {
      // Zero out output buffer to guarantee 100% acoustic isolation (no mic-to-speaker bleed)
      if (e.outputBuffer) {
        e.outputBuffer.getChannelData(0).fill(0);
      }
      if (isMuted || isInStandby) {
        micLevel = 0;
        return;
      }

      micAnalyser.getByteFrequencyData(micFreqData);
      let sum = 0;
      for (let i = 0; i < micFreqData.length; i++) sum += micFreqData[i];
      micLevel = Math.min(1.0, (sum / micFreqData.length) / 80);

      // Acoustic Transient Detection (Clap or Finger Snap)
      detectSoundSnapOrClap(micFreqData);

      const now = Date.now();
      const isEchoPeriod = isAssistantSpeaking || (now < roomReverbDecayUntil);

      if (isEchoPeriod) {
        // Assistant is actively speaking or room reverberation is decaying.
        // Gating is critical: do NOT stream mic audio to Gemini Live to prevent
        // the assistant from hearing its own voice and creating an acoustic feedback loop.
        
        // Check for genuine deliberate user barge-in (sustained high energy above speaker bleed)
        if (micLevel > 0.45) {
          interruptionSustainedFrames++;
          if (interruptionSustainedFrames >= 3) {
            console.log('[Orb] User voice barge-in detected over speaker playback!');
            clearAudioQueue();
            updateState('LISTENING');
            interruptionSustainedFrames = 0;
          }
        } else {
          interruptionSustainedFrames = Math.max(0, interruptionSustainedFrames - 1);
        }

        // Drop transmission while assistant is speaking or reverb is decaying
        return;
      }

      interruptionSustainedFrames = 0;

      // Voice Activity State Tracking (When assistant is quiet)
      if (micLevel > 0.12) {
        updateState('LISTENING');
      } else if (micLevel <= 0.04 && currentState === 'LISTENING') {
        updateState('IDLE');
      }

      // Convert Float32Array to 16-bit Little-Endian PCM
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmBuffer = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcmBuffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      // Convert Int16Array to base64
      const bytes = new Uint8Array(pcmBuffer.buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Pcm = btoa(binary);

      // Stream clean 16kHz PCM to Gemini Live
      window.assistantApi.sendAudioChunk(base64Pcm);
    };

    console.log('[Orb] Chromium WebRTC AEC microphone capture active (16kHz PCM)');
  } catch (err) {
    console.error('[Orb] Error accessing microphone:', err);
  }
}

let mediaStreamDest = null;
const assistantAudio = document.getElementById('assistantAudioPlayer');

function initPlaybackContext() {
  if (!playbackContext) {
    playbackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    
    playbackAnalyser = playbackContext.createAnalyser();
    playbackAnalyser.fftSize = 128;
    playbackAnalyser.smoothingTimeConstant = 0.75;
    playbackFreqData = new Uint8Array(playbackAnalyser.frequencyBinCount);

    // WebRTC AEC Loopback Destination:
    // Routing through MediaStreamDestination into an HTML5 <audio> element ensures Chromium's
    // native WebRTC AEC3 engine recognizes this playback stream as the "Far-End Render Reference".
    mediaStreamDest = playbackContext.createMediaStreamDestination();
    if (assistantAudio) {
      assistantAudio.srcObject = mediaStreamDest.stream;
      assistantAudio.play().catch(e => console.warn('[Orb] Audio element auto-play:', e));
    }
  }
  if (playbackContext.state === 'suspended') {
    playbackContext.resume();
  }
}

function playAudioChunk(base64Data) {
  initPlaybackContext();
  isAssistantSpeaking = true;
  updateState('SPEAKING');

  const binaryString = atob(base64Data);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // 16-bit Little Endian to Float32Array
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  let chunkSum = 0;
  for (let i = 0; i < int16Array.length; i++) {
    const val = int16Array[i] / 32768.0;
    float32Array[i] = val;
    chunkSum += Math.abs(val);
  }
  outputLevel = Math.min(1.0, (chunkSum / int16Array.length) * 5.0);

  const audioBuffer = playbackContext.createBuffer(1, float32Array.length, 24000);
  audioBuffer.copyToChannel(float32Array, 0);

  const sourceNode = playbackContext.createBufferSource();
  sourceNode.buffer = audioBuffer;
  
  // Real-time wave synth analyzer connection
  if (playbackAnalyser) {
    sourceNode.connect(playbackAnalyser);
  }

  // Route to WebRTC AEC reference loopback (with fallback to direct destination)
  if (mediaStreamDest) {
    sourceNode.connect(mediaStreamDest);
  } else {
    sourceNode.connect(playbackContext.destination);
  }

  const now = playbackContext.currentTime;
  // If nextPlayTime is behind the current audio clock, start slightly in front of now (20ms buffer)
  if (nextPlayTime < now) {
    nextPlayTime = now + 0.02;
  }

  sourceNode.start(nextPlayTime);
  nextPlayTime += audioBuffer.duration;

  activeSources.push(sourceNode);

  sourceNode.onended = () => {
    const idx = activeSources.indexOf(sourceNode);
    if (idx !== -1) activeSources.splice(idx, 1);
    if (activeSources.length === 0) {
      outputLevel = 0;
      isAssistantSpeaking = false;
      nextPlayTime = 0; // Flush timeline anchor to eliminate clock drift between turns
      roomReverbDecayUntil = Date.now() + 350; // Allow 350ms for speaker echo in the room to decay
      updateState('IDLE');
    }
  };
}

function clearAudioQueue() {
  // Actively stop all playing and queued buffer sources
  for (const src of activeSources) {
    try {
      src.stop();
      src.disconnect();
    } catch (e) {}
  }
  activeSources = [];
  nextPlayTime = 0; // Reset scheduling anchor immediately
  outputLevel = 0;
  isAssistantSpeaking = false;
  roomReverbDecayUntil = Date.now() + 300; // Allow 300ms acoustic grace period
  updateState('IDLE');
}

// ----------------------------------------------------
// UI Button Listeners & IPC Bindings
// ----------------------------------------------------
// Click on the orb or press Spacebar to immediately interrupt speech
canvas.addEventListener('click', () => {
  if (isAssistantSpeaking) {
    console.log('[Orb] Clicked orb to barge-in / stop speech');
    clearAudioQueue();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && isAssistantSpeaking) {
    console.log('[Orb] Spacebar pressed to barge-in / stop speech');
    clearAudioQueue();
  }
});

btnMic.addEventListener('click', async () => {
  isMuted = await window.assistantApi.toggleMute();
  btnMic.classList.toggle('muted', isMuted);
  btnMic.title = isMuted ? 'Unmute Microphone' : 'Mute Microphone';
});

btnPin.addEventListener('click', async () => {
  isPinned = await window.assistantApi.toggleAlwaysOnTop();
  btnPin.classList.toggle('active', isPinned);
  btnPin.title = isPinned ? 'Unpin from Top' : 'Pin to Top';
});

// Window Minimize -> Morph into Mini Floating Toolbar
btnMin.addEventListener('click', () => {
  window.assistantApi.setMiniMode(true);
});

// Mini Toolbar Event Listeners
if (btnExpand) {
  btnExpand.addEventListener('click', () => {
    window.assistantApi.setMiniMode(false);
  });
}

if (btnMiniMic) {
  btnMiniMic.addEventListener('click', async () => {
    isMuted = await window.assistantApi.toggleMute();
    btnMic.classList.toggle('muted', isMuted);
    btnMiniMic.classList.toggle('muted', isMuted);
    btnMiniMic.title = isMuted ? 'Unmute Microphone' : 'Mute Microphone';
    updateState(currentState);
  });
}

if (btnMiniTray) {
  btnMiniTray.addEventListener('click', () => {
    window.assistantApi.minimizeToTray('all');
  });
}

if (miniSynthWrapper) {
  miniSynthWrapper.addEventListener('dblclick', () => {
    window.assistantApi.setMiniMode(false);
  });
}

function applyMiniMode(mini) {
  isMiniMode = mini;
  document.body.classList.toggle('mini-mode', mini);
  const container = document.getElementById('orbContainer');
  if (container) container.classList.toggle('mini-mode', mini);
  if (miniToolbar) miniToolbar.style.display = mini ? 'flex' : 'none';
  if (miniStatusText) miniStatusText.innerText = isMuted ? 'MUTED' : currentState;
}

window.assistantApi.onMiniModeChanged((mini) => {
  applyMiniMode(mini);
});

// Assistant Event Listeners
window.assistantApi.onStatus((data) => {
  console.log('[Orb] Status:', data);
  if (data.status === 'connecting') updateState('THINKING');
  else if (data.status === 'connected') updateState('IDLE');
});

window.assistantApi.onAudioOutputChunk((chunk) => {
  playAudioChunk(chunk);
});

window.assistantApi.onInterrupted(() => {
  clearAudioQueue();
});

window.assistantApi.onToolActivity((activity) => {
  if (activity.type === 'executing') updateState('THINKING');
  else if (activity.type === 'completed') updateState('IDLE');
});

window.assistantApi.onMuteChanged((muted) => {
  isMuted = muted;
  btnMic.classList.toggle('muted', isMuted);
  if (btnMiniMic) btnMiniMic.classList.toggle('muted', isMuted);
  updateState(currentState);
});

// Standby & Wake State Handling
window.assistantApi.onStandbyChanged((inStandby) => {
  isInStandby = inStandby;
  console.log('[Orb] Standby state changed:', inStandby);
  if (inStandby) {
    clearAudioQueue();
  }
});

window.assistantApi.onWokenUp(() => {
  console.log('[Orb] Assistant woken up!');
  isInStandby = false;
  playWakeChime(false);
  updateState('LISTENING');
});

// Boot Audio, Microphone Listeners & Theme Sync
startMicrophoneCapture();

window.assistantApi.onThemeChanged((themeId) => {
  console.log('[Orb] Theme changed to:', themeId);
  applyTheme(themeId);
});

window.assistantApi.loadConfig().then(cfg => {
  if (cfg && cfg.theme) {
    applyTheme(cfg.theme);
  }
}).catch(err => console.warn('[Orb] Failed to load config theme:', err));
