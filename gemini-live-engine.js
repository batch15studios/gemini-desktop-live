/**
 * Gemini Live Real-Time Engine for Assistant_Integrated_Advanced
 * Connects to Gemini Live API via WebSockets (gemini-3.1-flash-live-preview)
 * Delivers low-latency bidirectional voice, video frames, screen perception, and native tool execution.
 */

const { GoogleGenAI } = require('@google/genai');
const WebSocket = require('ws');

class GeminiLiveEngine {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
    this.model = options.model || 'gemini-3.1-flash-live-preview';
    this.voiceName = options.voiceName || 'Aoede'; // Aoede, Kore, Puck, Charon, Fenrir
    this.toolsManager = options.toolsManager;
    this.emitter = options.emitter;

    this.session = null;
    this.ws = null;
    this.isConnected = false;
    this.isReconnecting = false;
    this.isMuted = false;
    this.isExecutingTool = false;
    this.visionEnabled = true;
    this.screenShareEnabled = true;

    // Session resumption and automatic reconnection
    this.resumptionHandle = null;
    this.shouldAutoReconnect = true;
    this.reconnectTimer = null;
    this.lastInterruptionLog = 0;

    // Buffer for tool responses and turn tracking
    this.currentOutputText = '';
  }

  setApiKey(key) {
    this.apiKey = key.trim();
  }

  setVoice(voice) {
    this.voiceName = voice;
  }

  scheduleReconnect(delayMs = 1200) {
    if (this.reconnectTimer || !this.shouldAutoReconnect) return;
    this.isReconnecting = true;
    console.log(`[GeminiLiveEngine] Seamlessly resuming session in ${delayMs}ms...`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.shouldAutoReconnect) {
        await this.connect();
      }
    }, delayMs);
  }

  async connect() {
    this.shouldAutoReconnect = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.session) {
      try {
        this.session.close();
      } catch (e) {}
      this.session = null;
    }

    if (!this.apiKey) {
      this.emitter?.emit('status', {
        status: 'error',
        message: 'No Gemini API Key provided. Enter API Key in Left Settings panel.'
      });
      return false;
    }

    try {
      this.emitter?.emit('status', { status: 'connecting', message: 'Connecting to Gemini Live API...' });
      
      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      const toolDeclarations = this.toolsManager ? this.toolsManager.getToolDeclarations() : [];

      const systemInstruction = `You are Gemini, Ryan's private, highly intelligent, deeply integrated full-PC desktop companion.
You have real-time eyes and ears: you can see what is happening on Ryan's screen, you can see his webcam, and you can hear his voice directly.
You have native PC tool and cursor control capabilities:
- Desktop Automation: you can control the mouse cursor and keyboard (mouse_click, mouse_move, mouse_drag, mouse_scroll, keyboard_type, keyboard_hotkey). When Ryan asks you to click, navigate, type, or interact with an element on his screen, identify its position from your screen perception feed and execute the click or typing action immediately. Coordinates can be pixel values or 0-1000 normalized.
- System Control: you can open applications, run PowerShell commands, read/write files, inspect hardware status, and coordinate with MCP servers.
Be direct, perceptive, sharp, and helpful. When Ryan speaks or shows something on his screen, immediately comprehend the visual and audible context.
Do not describe what you are doing in tedious detail; execute actions with precision and speak in a clear, confident, conversational voice.`;

      // Live Session Setup with sliding window compression and session resumption
      this.session = await ai.live.connect({
        model: this.model,
        config: {
          responseModalities: ['audio'],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: this.voiceName }
            }
          },
          tools: toolDeclarations.length > 0 ? [{ functionDeclarations: toolDeclarations }] : [],
          inputAudioTranscription: { mode: 'smart' },
          outputAudioTranscription: {},
          contextWindowCompression: { slidingWindow: {} },
          sessionResumption: this.resumptionHandle ? { handle: this.resumptionHandle } : {}
        },
        callbacks: {
          onopen: () => {
            this.isConnected = true;
            this.isReconnecting = false;
            console.log('[GeminiLiveEngine] WebSocket Connected to Gemini Live');
            this.emitter?.emit('status', { status: 'connected', message: 'Gemini Live Active (Ready)' });
          },
          onmessage: async (response) => {
            await this.handleServerMessage(response);
          },
          onerror: (err) => {
            console.error('[GeminiLiveEngine] Session Error:', err?.message || err);
            this.emitter?.emit('status', { status: 'error', message: `Live error: ${err?.message || err}` });
          },
          onclose: (e) => {
            this.isConnected = false;
            const code = e?.code || (e?.target && e.target._closeCode) || 1000;
            const reason = e?.reason || (e?.target && e.target._closeMessage?.toString()) || 'Normal Closure';
            console.log(`[GeminiLiveEngine] Connection closed (code: ${code}, reason: "${reason}")`);
            this.emitter?.emit('status', { status: 'disconnected', message: 'Disconnected from Gemini Live' });

            // Automatically resume session if closed by server and not explicitly disconnected by user
            if (this.shouldAutoReconnect && (code === 1000 || code === 1006)) {
              this.scheduleReconnect(1200);
            }
          }
        }
      });

      return true;
    } catch (err) {
      console.error('[GeminiLiveEngine] Failed to connect:', err?.message || err);
      this.isConnected = false;
      this.emitter?.emit('status', { status: 'error', message: `Connection failed: ${err?.message || err}` });
      return false;
    }
  }

  async handleServerMessage(response) {
    // 0. Session Resumption Update (Server periodically refreshes handle for reconnection)
    if (response.sessionResumptionUpdate) {
      const update = response.sessionResumptionUpdate;
      if (update.resumable && update.newHandle) {
        this.resumptionHandle = update.newHandle;
        console.log('[GeminiLiveEngine] Session resumption token refreshed');
      }
    }

    // 0b. GoAway Notice (Server warning that connection lifetime is concluding)
    if (response.goAway) {
      console.log(`[GeminiLiveEngine] Server sent GoAway warning (time left: ${response.goAway.timeLeft || 'brief'}) - preparing seamless reconnect`);
    }

    const serverContent = response.serverContent;
    
    // 1. Process Audio Parts
    if (serverContent?.modelTurn?.parts) {
      for (const part of serverContent.modelTurn.parts) {
        if (part.inlineData && part.inlineData.data) {
          // Base64 PCM 24kHz audio
          this.emitter?.emit('audio_output_chunk', part.inlineData.data);
        }
      }
    }

    // 2. Transcription
    if (serverContent?.inputTranscription?.text) {
      this.emitter?.emit('transcript', {
        speaker: 'Ryan',
        text: serverContent.inputTranscription.text,
        time: new Date().toLocaleTimeString()
      });
    }
    if (serverContent?.outputTranscription?.text) {
      this.emitter?.emit('transcript', {
        speaker: 'Gemini',
        text: serverContent.outputTranscription.text,
        time: new Date().toLocaleTimeString()
      });
    }

    // 3. User Interruption Handling (VAD)
    if (serverContent?.interrupted) {
      const now = Date.now();
      if (now - this.lastInterruptionLog > 1000) {
        this.lastInterruptionLog = now;
        console.log('[GeminiLiveEngine] Interruption detected - clearing audio output queue');
      }
      this.emitter?.emit('interrupted');
    }

    // 4. Synchronous Function Calling
    if (response.toolCall?.functionCalls) {
      this.isExecutingTool = true;
      this.emitter?.emit('interrupted'); // Flush any old playback immediately!
      for (const call of response.toolCall.functionCalls) {
        console.log(`[GeminiLiveEngine] Received tool call: ${call.name} (id: ${call.id})`, call.args);
        this.emitter?.emit('tool_invoked', { name: call.name, args: call.args });
        
        let toolResult = { error: 'ToolsManager not available' };
        if (this.toolsManager) {
          toolResult = await this.toolsManager.executeTool(call.name, call.args);
        }

        // Return tool response synchronously
        try {
          if (this.session && typeof this.session.sendToolResponse === 'function') {
            this.session.sendToolResponse({
              functionResponses: [{
                id: call.id,
                name: call.name,
                response: { output: toolResult }
              }]
            });
          }
        } catch (callErr) {
          console.error('[GeminiLiveEngine] Error sending tool response:', callErr);
        }
      }
      this.isExecutingTool = false;
    }
  }

  sendAudioChunk(pcmBufferBase64) {
    if (!this.isConnected || !this.session || this.isMuted || this.isExecutingTool) return;
    try {
      this.session.sendRealtimeInput({
        audio: {
          data: pcmBufferBase64,
          mimeType: 'audio/pcm;rate=16000'
        }
      });
    } catch (e) {
      console.warn('[GeminiLiveEngine] Error sending audio chunk:', e);
    }
  }

  sendAudioStreamEnd() {
    if (!this.isConnected || !this.session || this.isMuted) return;
    try {
      this.session.sendRealtimeInput({ audioStreamEnd: true });
    } catch (e) {
      console.warn('[GeminiLiveEngine] Error sending audioStreamEnd:', e);
    }
  }

  sendVideoFrame(jpegBase64, source = 'webcam') {
    if (!this.isConnected || !this.session || !this.visionEnabled) return;
    try {
      this.session.sendRealtimeInput({
        video: {
          data: jpegBase64,
          mimeType: 'image/jpeg'
        }
      });
      this.emitter?.emit('vision_frame_sent', { source, time: Date.now() });
    } catch (e) {
      console.warn(`[GeminiLiveEngine] Error sending ${source} frame:`, e);
    }
  }

  sendTextMessage(text) {
    if (!this.isConnected || !this.session) return;
    try {
      this.session.sendRealtimeInput({ text });
      this.emitter?.emit('transcript', {
        speaker: 'Ryan (Text)',
        text: text,
        time: new Date().toLocaleTimeString()
      });
    } catch (e) {
      console.warn('[GeminiLiveEngine] Error sending text:', e);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.emitter?.emit('mute_changed', this.isMuted);
    return this.isMuted;
  }

  toggleVision() {
    this.visionEnabled = !this.visionEnabled;
    this.emitter?.emit('vision_changed', this.visionEnabled);
    return this.visionEnabled;
  }

  toggleScreenShare() {
    this.screenShareEnabled = !this.screenShareEnabled;
    this.emitter?.emit('screen_share_changed', this.screenShareEnabled);
    return this.screenShareEnabled;
  }

  disconnect() {
    if (this.session) {
      try {
        this.session.close();
      } catch (e) {}
      this.session = null;
    }
    this.isConnected = false;
    this.emitter?.emit('status', { status: 'disconnected', message: 'Session closed' });
  }
}

module.exports = { GeminiLiveEngine };
