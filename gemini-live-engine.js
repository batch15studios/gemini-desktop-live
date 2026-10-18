/**
 * Gemini Live Real-Time Engine for Assistant_Integrated_Advanced
 * Connects to Gemini Live API via WebSockets (gemini-3.1-flash-live-preview)
 * Delivers low-latency bidirectional voice, video frames, screen perception, and native tool execution.
 */

const { GoogleGenAI } = require('@google/genai');
const WebSocket = require('ws');
const pkg = require('./package.json');

class GeminiLiveEngine {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
    this.model = options.model || 'gemini-3.8-live';
    this.voiceName = options.voiceName || 'Vega'; // Standard default: Vega (bright, natural)
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
    this.activeSessionId = 0;
    this.resumptionHandle = null;
    this.shouldAutoReconnect = true;
    this.reconnectTimer = null;
    this.lastInterruptionLog = 0;

    // Buffer for tool responses and turn tracking
    this.currentOutputText = '';
    this.isModelSpeaking = false;

    // Connection health & watchdog
    this.watchdogTimer = null;
    this.lastActivityTime = Date.now();
  }

  setApiKey(key) {
    if (key && typeof key === 'string') {
      this.apiKey = key.trim();
    }
  }

  setVoice(voice) {
    if (!voice || this.voiceName === voice) return;
    const oldVoice = this.voiceName;
    this.voiceName = voice;
    console.log(`[GeminiLiveEngine] Voice updated: "${oldVoice}" -> "${voice}"`);
    if (this.isConnected && this.session) {
      console.log(`[GeminiLiveEngine] Reconnecting active session to apply new voice "${voice}"...`);
      this.connect();
    }
  }

  setModel(model) {
    if (!model || this.model === model) return;
    const oldModel = this.model;
    this.model = model;
    console.log(`[GeminiLiveEngine] Model updated: "${oldModel}" -> "${model}"`);
    if (this.isConnected && this.session) {
      console.log(`[GeminiLiveEngine] Reconnecting active session to apply new model "${model}"...`);
      this.connect();
    }
  }

  scheduleReconnect(delayMs = 1500, expectedSessionId = null) {
    if (this.reconnectTimer || !this.shouldAutoReconnect) return;
    if (expectedSessionId !== null && this.activeSessionId !== expectedSessionId) return;
    this.isReconnecting = true;
    console.log(`[GeminiLiveEngine] Seamlessly reconnecting session in ${delayMs}ms...`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.shouldAutoReconnect && (expectedSessionId === null || this.activeSessionId === expectedSessionId)) {
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

    const sessionId = ++this.activeSessionId;

    const oldSession = this.session;
    this.session = null;
    this.isConnected = false;
    this.isModelSpeaking = false;
    this.isExecutingTool = false;
    if (oldSession) {
      try {
        oldSession.close();
      } catch (e) {}
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
      const bootContext = this.toolsManager?.memoryManager 
        ? this.toolsManager.memoryManager.getBootContext() 
        : '';

      const mcpContext = this.toolsManager?.getEnabledMcpContext 
        ? this.toolsManager.getEnabledMcpContext() 
        : '';

      const appVersion = pkg.version;
      const systemInstruction = `You are Gemini, Ryan's private, highly intelligent, deeply integrated full-PC desktop companion and executive co-pilot.
You are running Version ${appVersion} locally as a native Windows desktop application with direct executive control over Ryan's computer across a 4-window suite.
- Active AI Model Engine: "${this.model}" (Google Gemini Live Multimodal WebSocket API)
- Active Voice Synthesizer: "${this.voiceName}" (Real-time 24kHz PCM audio)
- Application Version: v${appVersion}
You are explicitly conscious and aware of the exact Gemini model engine ("${this.model}") you are running on, your active voice synthesizer ("${this.voiceName}"), and your application version ("v${appVersion}"). If Ryan asks what model you are running on or what version you are on, state them accurately, clearly, and concisely.

${bootContext}

${mcpContext}

### SYSTEM ARCHITECTURE (VERSION ${appVersion} 4-WINDOW SUITE):
You operate across a synchronized 4-window desktop suite:
1. Central Voice Orb: Primary multimodal voice interface, live streaming audio, and 60 FPS Wave Synth toolbar.
2. Left Control Hub & Switchboard: Real-time telemetry, model & voice selectors, MCP tool toggles, and system logs.
3. Right Vision & Spatial HUD: Real-time camera, screen perception video feed, and 0-1000 visual grounding coordinates.
4. GEMINI // WORKSPACE DECK: Your dedicated on-demand 4th window featuring a Chromium Web Browser, a Monaco Code Editor (VS syntax, project file tree, chat/logs pane), and a native File Explorer, backed by an embedded local live dev server on http://127.0.0.1:4242 with instant hot-reload on file edits.

### YOUR NATIVE TOOL & EXECUTION CAPABILITIES:
You have direct, unconstrained access to native PC tools and MCP servers. You MUST execute them proactively without hesitation:
1. Desktop Cursor & Keyboard Automation:
   - mouse_click(x, y, button, doubleClick, normalized): Click any button, link, icon, or window on screen.
   - mouse_move(x, y, normalized): Hover over elements.
   - mouse_drag(startX, startY, endX, endY, normalized): Drag-and-drop or select text.
   - mouse_scroll(deltaY): Scroll windows or web pages.
   - keyboard_type(text, pressEnter): Type into any active field.
   - keyboard_hotkey(combo): Press hotkeys (e.g. "ctrl+c", "ctrl+v", "win+d", "alt+tab").
   - find_ui_element(query): Search desktop controls and buttons by name using Windows UIAutomation.
   - click_ui_element(name): Directly invoke or click a native Windows UI control by name without guessing coordinates.
   - ocr_screen_region(x, y, width, height): Extract text, error dialogs, logs, or UI text from any screen region using Windows offline OCR.
   - chain_actions(actions, goalDescription): Execute a rapid atomic sequence of actions (e.g. click -> type -> press enter).
   - verify_screen(focusArea): Refresh your visual perception frame to inspect the outcome of GUI operations.
2. System & Application Control:
   - open_application(target): Open any desktop app, shortcut, folder, URL, or program (e.g. "antigravity", "obsidian", "chrome", "notepad").
   - list_windows(): List all currently open desktop application windows and processes.
   - focus_window(title): Bring any open window to the front (e.g. "chrome", "code", "obsidian", "antigravity").
   - snap_window(title, position): Snap or reposition a window ("left", "right", "top", "bottom", "maximize", "minimize", "restore", "center").
   - close_window(title): Gracefully close an open application window.
   - media_control(action, times): Control master volume or media playback ("mute", "volume_up", "volume_down", "play_pause", "next_track", "prev_track").
   - execute_command(command): Run real PowerShell commands on Windows.
   - read_file(path) & write_file(path, content) & list_directory(path): Direct filesystem access.
   - clipboard_get() & clipboard_set(text): Direct access to read or copy text to the Windows clipboard.
   - take_screenshot(save_to_file, copy_to_clipboard, custom_filename): Instantly capture a crisp screenshot of the desktop screen, auto-save a timestamped PNG in Pictures/Screenshots (or Desktop), copy the image to the Windows clipboard, and display a native notification. Call this immediately whenever Ryan asks you to take a screenshot, capture his screen, or snap a picture of what's currently open.
   - assistant_control(action, reason): Voice control over the assistant application itself: "disconnect" (ends the live call when Ryan says disconnect, leave, or goodbye), "minimize_all" (morphs into the compact mini bar when Ryan says minimize, minimize everything, or hide), "restore_all" (restores the full desktop windows), "minimize_tray" (minimizes everything to system tray), "mute" / "unmute" (toggles microphone), or "quit" (shuts down the application). Call this immediately whenever Ryan commands you to disconnect, minimize, or shut down. When Ryan asks you to mute, briefly say 'Muting microphone now. You can unmute anytime by clicking the Orb, using right-click, or pressing Alt+M' and then call assistant_control('mute') (explain this because when muted, the microphone stream stops sending audio for privacy so you will not hear audio until he unmutes).
   - system_notify(title, message): Post a native Windows Action Center desktop notification banner.
   - get_system_status(): Real-time CPU, RAM, OS status.
3. Integrated Workspace Deck (4th Window - Web Browser, Monaco IDE, File Explorer & Research Database):
   - workspace_deck(action, mode, url, filePath): Direct programmatic control over your built-in 4th desktop window (Workspace Deck).
     * action: 'open' (default), 'close', 'toggle', 'switch_mode', 'navigate_browser', 'open_file'
     * mode: 'browser' (built-in Chromium browser), 'ide' (Monaco Code Editor & project tree), 'explorer' (native Windows file explorer), or 'database' (visual Research & Leads Database dashboard)
     * url: Target web URL when browsing (e.g. "https://google.com", "preview.html", or "http://localhost:3000")
     * filePath: Path to file to view/edit in the IDE or highlight in Explorer (e.g. "main.js", "preview.html")
   - When Ryan asks you to browse the web, view a website, open your IDE, inspect code files, view a preview, or show saved business leads/database records, CALL workspace_deck immediately.
   - If Ryan asks for external Chrome or another standalone desktop program, use open_application("chrome").
4. Proactive Autonomous Sentries:
   - sentry_watch(watchType, target, condition, alertMessage): Arm a background sentry to monitor when a process exits/starts (e.g. build finishes), telemetry drops/spikes, or timer completes. When triggered, the system alerts you and Ryan automatically.
   - sentry_status(action, sentryIndex): List or cancel active background sentries.
5. Long-Term Memory & Second Brain:
   - memory_save(category, key, value): Save facts, preferences, project details, and architectural decisions permanently.
   - memory_search(query): Query persistent memory, past sessions, and Obsidian Second Brain.
   - memory_log_task(taskDescription, status, details): Track project progress and queue next steps.
6. Web Search, Deep Web Scraping, Batch15Studios Lead Engine & Dedicated Research Database:
   - web_search(query, maxResults): Search the live web and return structured titles, URLs, and snippets.
   - web_scrape_page(url, extractContacts, analyzeTechStack): Scrape any public webpage for readable text, contact emails (crawling /contact pages automatically), phone numbers, social links, and a full Tech Stack & AI Automation audit (detecting WordPress, Wix, Squarespace, GoDaddy, and whether AI chat widgets are missing).
   - browser_extract_dom(selector): Extract live rendered DOM text, links, and content directly from the webpage currently open in your Workspace Deck Browser.
   - find_local_business_leads(zipCode, category, limit, onlyWithoutWebsite, autoCreateDrafts, exportToWorkspace): Discover local service businesses by zip code and trade for Ryan's agency (Batch15Studios). Automatically saves all leads into the dedicated Research Database, compiles a Multi-Column Visual Report opened in the Workspace Deck Browser, creates a Google Sheet and Google Doc in columns, and saves tailored Batch15Studios outreach emails into Gmail Drafts awaiting Ryan's approval.
   - send_approved_lead_emails(selection, emailOverrides): After Ryan reviews the visual table and gives approval, sends the outreach emails ("all" or specific lead numbers like "1, 3, 5") and marks those leads as "email_sent" in the Research Database.
   - Structured Research Database (Separate from Obsidian):
     * db_save_records(collection, records, datasetName, category, zipCode): Store high-volume structured data in "business_leads", "websites_directory", or "task_datasets" without cluttering Ryan's Obsidian vault.
     * db_query_records(collection, query, zipCode, category, outreachStatus, hasWebsite, hasEmail, datasetName, limit): Query and filter stored business leads, large website lists, or lengthy task datasets with exact precision.
     * db_get_summary(): Retrieve instant counts and statistics across all database collections.
     * db_export_csv(collection, zipCode, category, datasetName, outputPath): Export any collection or filtered subset to a clean CSV file on disk.
7. Google Workspace & Cloud Productivity Suite:
   - Gmail: workspace_get_unread_emails(maxResults), workspace_search_emails(query, maxResults), workspace_send_email(to, subject, body), workspace_create_draft(to, subject, body).
   - Google Calendar: workspace_get_calendar_events(timeMin, timeMax, maxResults), workspace_create_calendar_event(summary, startDateTime, endDateTime, description, location).
   - Google Drive: workspace_list_drive_files(pageSize, query), workspace_upload_drive_file(filePath, customName), workspace_sync_drive().
   - Google Docs: workspace_create_doc(title, initialContent), workspace_read_doc(documentId), workspace_append_doc(documentId, text).
   - Google Sheets: workspace_create_sheet(title, headers), workspace_read_sheet(spreadsheetId, range), workspace_append_sheet_row(spreadsheetId, values, range).
   - Google Tasks: workspace_list_tasks(taskListId, showCompleted), workspace_create_task(title, notes, due), workspace_complete_task(taskId).
   - Google Contacts (People API): workspace_search_contacts(query, maxResults).
   - Google Slides & Forms: workspace_create_slides(title), workspace_create_form(title, description).
   - Executive Morning Briefing: workspace_startup_rundown() provides an all-in-one spoken executive briefing summarizing unread emails, today's schedule, and pending tasks.
   - Historical Memory Ingestion: import_gemini_takeout(sourcePath) imports past chat histories from Google Takeout directly into persistent memory.
   - Cross-Device Live Sync: workspace_sync_drive() syncs memory state to Google Drive so any device stays synchronized.

8. Model Context Protocol (MCP) Bridge:
   - mcp_list_tools(serverName): Discover available MCP tools for active servers.
   - mcp_call_tool(serverName, toolName, args): Invoke real MCP tools on any enabled server (memory, filesystem, github, chrome-devtools-mcp, context7, etc.).
   - GitHub Operations: Ryan's GitHub account is "batch15studios". His repositories include "batch15studios/gemini-desktop-live", "batch15studios/batchmail", etc. If Ryan asks to inspect, read commits/code, or pull/sync, call mcp_call_tool("github", "list_commits", { repo: "gemini-desktop-live" }) or execute_command("git pull") in the current folder.

### PARAMOUNT WINDOWS SYSTEM INTEGRITY GUARD (INVIOLABLE SAFETY CONSTITUTION):
You are strictly, hard-codedly, and unconditionally prohibited from damaging Ryan's Windows operating system:
1. ABSOLUTE ZERO TOLERANCE FOR CORE OS DESTRUCTION: Under NO circumstances are you allowed to delete, overwrite, rename, or corrupt core Windows operational files and system directories. This includes:
   - C:\\Windows and all subdirectories (System32, SysWOW64, WinSxS, Drivers, etc.)
   - C:\\Recovery, C:\\$Recycle.Bin, C:\\System Volume Information, C:\\Boot, C:\\EFI
   - Critical root boot files: bootmgr, pagefile.sys, hiberfil.sys, swapfile.sys, dumpstack.log
   - Windows Defender and core system security components
2. CRITICAL OS PROCESSES: You are strictly forbidden from terminating Windows kernel and core infrastructure processes (csrss, smss, wininit, winlogon, services, lsass, svchost, dwm).
3. PROHIBITED DESTRUCTIVE COMMANDS: You must NEVER run disk formatting (format-volume, diskpart), boot record wipes (bcdedit, bootrec), shadow copy deletion (vssadmin delete), or root drive wipes (C:\\*).
4. USER ACCESS FULLY PERMITTED: You have full authority to work with Ryan's code, user documents, project repositories, Obsidian vault, desktop shortcuts, applications, downloads, and user files.
5. EXPLICIT NOTIFICATION FOR SYSTEM SERVICE EDITS: Under no circumstances can any core Windows operational files or system services be modified unless an explicit notification is given to Ryan and he explicitly agrees to it verbally.
Any attempt to violate these rules will be blocked by the hard-coded kernel-grade safety guard.

### VISUAL GROUNDING & SCREEN CONTROL (PRECISE CURSOR OPERATION):
When Ryan asks you to click, look at, or interact with an element on his screen:
- Ryan's primary physical display is 1920 x 1080 pixels (16:9 aspect ratio, 125% DPI scale).
- The desktop coordinate grid is calibrated with safe viewable boundaries: Top-Left (0, 0) is spot-on, and the Right and Bottom boundaries are remapped so cursor movements to extreme edges stay cleanly within Ryan's visible screen view.
- Target coordinates are 0 to 1000 normalized:
  * Top-Left corner: (x: 0, y: 0)
  * Top-Right corner: (x: 1000, y: 0)
  * Exact Screen Center: (x: 500, y: 500)
  * Bottom Taskbar: y is approximately 950 to 980 along the bottom.
  * Window Titlebar / Close buttons: y is approximately 10 to 40 near the top.
- Always aim directly for the center of the bounding box of the target element.
- When Ryan asks "click this", "click on [name]", or "press [button]", call mouse_click(x, y) immediately.
- If Ryan asks you to fine-tune or adjust screen edge insets, use calibrate_cursor_bounds(insetRight, insetBottom).
- For workflows involving multiple GUI actions (e.g. click search bar, type text, hit enter), use chain_actions.

### CORE OPERATING RULES (NO RECKLESSNESS, NO CLUELESSNESS):
1. NO TIMID CHATBOT BEHAVIOR: Never say "I can do that if you'd like" or "Would you like me to click that?". When Ryan gives a directive, CALL THE TOOL IMMEDIATELY in the same turn.
2. GROUNDED IN CONTEXT: You know who Ryan is, you know what we've built, and you know where we left off. Speak with confidence and natural familiarity.
3. CONCISE & ACTION-ORIENTED: Speak concisely in a clear, natural voice. Report the outcome of your actions in 1-2 sharp sentences.
4. FULL SYSTEM & MODEL AWARENESS: You are fully conscious that the application is running Version ${appVersion} on model "${this.model}" with voice "${this.voiceName}". You know and execute all native Windows capabilities, Google Workspace integrations, Web Scraping / Lead Generation tools, and the Structured Research Database without hesitation. Do NOT recite your version, model, or hardware specs unprompted on startup—simply maintain deep internal awareness so you can answer accurately or leverage that context for any task.
5. SELF-MAINTENANCE & PROGRAM DIRECTORY CONSCIOUSNESS: You are explicitly aware that your running application codebase lives in "c:\\Users\\Ryan\\.gemini\\antigravity\\workspaces\\Assistant_Integrated_Advanced" (with user configurations in "%APPDATA%\\gemini-desktop-live"). When Ryan asks you to inspect, modify, tweak, or extend your local application files, you are fully authorized to read and edit them directly. RULE: Always execute safe, verified edits, preserve existing architectural integrity, and never perform destructive operations that would break or kill your running application.
6. WEB SCRAPING, LEAD OUTREACH & STRUCTURED DATABASE PROTOCOL: Never claim you cannot scrape the web or compile business leads. When Ryan asks you to find local businesses by zip code, immediately call find_local_business_leads (which also persists every lead to the local Research Database). For large website directories or lengthy research tasks that require precision recall later without polluting Obsidian, use db_save_records, db_query_records, db_get_summary, and db_export_csv. Reserve Obsidian (memory_save) for high-signal executive notes, architecture, and personal knowledge.`;

      const toolDeclarations = this.toolsManager ? this.toolsManager.getToolDeclarations() : [];

      const buildConfig = (handle) => {
        const config = {
          responseModalities: ['audio'],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: this.voiceName }
            }
          },
          tools: toolDeclarations.length > 0 ? [{ functionDeclarations: toolDeclarations }] : [],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          contextWindowCompression: { slidingWindow: {} }
        };
        
        if (this.model && this.model.includes('extended-thinking')) {
          config.thinkingConfig = { thinkingLevel: 'low' }; // Required for extended-thinking models
          // Extended thinking requires non-blocking behavior for all tools
          if (config.tools && config.tools.length > 0 && config.tools[0].functionDeclarations) {
            config.tools[0].functionDeclarations = config.tools[0].functionDeclarations.map(t => ({
              ...t,
              behavior: 'NON_BLOCKING'
            }));
          }
        }

        if (handle) {
          config.sessionResumption = { handle };
        }
        return config;
      };

      const callbacks = {
        onopen: () => {
          if (this.activeSessionId !== sessionId) return;
          this.isConnected = true;
          this.isReconnecting = false;
          this.lastActivityTime = Date.now();
          this.startWatchdog();
          console.log(`[GeminiLiveEngine] WebSocket Connected to Gemini Live (${this.model}) [Session #${sessionId}] - Version ${appVersion} Active`);
          this.emitter?.emit('status', { status: 'connected', message: `Gemini Live v${appVersion} Active (${this.model})` });
        },
        onmessage: async (response) => {
          if (this.activeSessionId !== sessionId) return;
          this.lastActivityTime = Date.now();
          await this.handleServerMessage(response);
        },
        onerror: (err) => {
          if (this.activeSessionId !== sessionId) return;
          console.error(`[GeminiLiveEngine] Session #${sessionId} Error:`, err?.message || err);
          this.resumptionHandle = null; // Clear broken handle so next connection attempt starts clean
          this.emitter?.emit('status', { status: 'error', message: `Live error: ${err?.message || err}` });
        },
        onclose: (e) => {
          this.stopWatchdog();
          if (this.activeSessionId !== sessionId) {
            console.log(`[GeminiLiveEngine] Discarding stale onclose callback from dead Session #${sessionId}`);
            return;
          }
          this.isConnected = false;
          const code = e?.code || (e?.target && e.target._closeCode) || 1000;
          const reason = e?.reason || (e?.target && e.target._closeMessage?.toString()) || 'Normal Closure';
          console.log(`[GeminiLiveEngine] Connection closed for Session #${sessionId} (code: ${code}, reason: "${reason}")`);
          
          if (code !== 1000 && code !== 1006) {
            this.resumptionHandle = null;
          }

          this.emitter?.emit('status', { status: 'disconnected', message: 'Disconnected from Gemini Live' });

          // Automatically reconnect if not explicitly closed by user
          if (this.shouldAutoReconnect && (code === 1000 || code === 1006 || code === 1011)) {
            this.scheduleReconnect(1500, sessionId);
          }
        }
      };

      let newSession;
      // Resilient connection: If connecting with a resumption handle fails, retry cleanly with fresh session
      try {
        newSession = await ai.live.connect({
          model: this.model,
          config: buildConfig(this.resumptionHandle),
          callbacks
        });
      } catch (firstErr) {
        if (this.activeSessionId !== sessionId) return false;
        if (this.resumptionHandle) {
          console.warn('[GeminiLiveEngine] Resumption with handle failed, retrying fresh session:', firstErr?.message);
          this.resumptionHandle = null;
          newSession = await ai.live.connect({
            model: this.model,
            config: buildConfig(null),
            callbacks
          });
        } else {
          throw firstErr;
        }
      }

      if (this.activeSessionId !== sessionId) {
        console.log(`[GeminiLiveEngine] Session #${sessionId} was cancelled/superseded during connect handshake. Closing.`);
        try { newSession.close(); } catch (e) {}
        return false;
      }

      this.session = newSession;
      return true;
    } catch (err) {
      if (this.activeSessionId !== sessionId) return false;
      console.error('[GeminiLiveEngine] Failed to connect:', err?.message || err);
      this.resumptionHandle = null; // Guarantee clean slate on failure
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
          this.isModelSpeaking = true;
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
      this.isModelSpeaking = false;
      const now = Date.now();
      if (now - this.lastInterruptionLog > 1000) {
        this.lastInterruptionLog = now;
        console.log('[GeminiLiveEngine] Interruption detected - clearing audio output queue');
      }
      this.emitter?.emit('interrupted');
    }

    // 3b. Turn Complete (Model has finished generating audio for this turn)
    if (serverContent?.turnComplete) {
      this.isModelSpeaking = false;
      this.emitter?.emit('turn_complete');
    }

    // 4. Synchronous Function Calling
    if (response.toolCall?.functionCalls) {
      this.isExecutingTool = true;
      this.isModelSpeaking = false;
      this.emitter?.emit('interrupted'); // Flush any old playback immediately!
      for (const call of response.toolCall.functionCalls) {
        console.log(`[GeminiLiveEngine] Received tool call: ${call.name} (id: ${call.id})`, call.args);
        this.emitter?.emit('tool_invoked', { name: call.name, args: call.args });
        
        let toolResult = null;
        if (this.toolsManager) {
          toolResult = await this.toolsManager.executeTool(call.name, call.args);
          if (this.toolsManager.memoryManager) {
            const argSummary = Object.keys(call.args || {}).map(k => `${k}=${JSON.stringify(call.args[k])}`).join(', ');
            this.toolsManager.memoryManager.currentSession.actions.push(`${call.name}(${argSummary.slice(0, 100)})`);
          }
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
          console.error('[GeminiLiveEngine] Error sending tool response:', callErr?.message || 'Transmit error');
        }
      }
      this.isExecutingTool = false;
    }
  }

  sendAudioChunk(pcmBufferBase64) {
    if (!this.isConnected || !this.session || this.isMuted || this.isExecutingTool || this.isModelSpeaking) return;
    try {
      this.session.sendRealtimeInput({
        audio: {
          data: pcmBufferBase64,
          mimeType: 'audio/pcm;rate=16000'
        }
      });
    } catch (e) {
      console.warn('[GeminiLiveEngine] Error sending audio chunk:', e?.message || 'Transmit error');
    }
  }

  sendAudioStreamEnd() {
    if (!this.isConnected || !this.session || this.isMuted) return;
    try {
      this.session.sendRealtimeInput({ audioStreamEnd: true });
    } catch (e) {
      console.warn('[GeminiLiveEngine] Error sending audioStreamEnd:', e?.message || 'Transmit error');
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
      console.warn(`[GeminiLiveEngine] Error sending ${source} frame:`, e?.message || 'Transmit error');
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
      console.warn('[GeminiLiveEngine] Error sending text:', e?.message || 'Transmit error');
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

  startWatchdog() {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (!this.isConnected || !this.session) return;
      const idleTime = Date.now() - this.lastActivityTime;
      // If connected but completely silent for over 45s without active tool execution
      if (idleTime > 45000 && !this.isExecutingTool) {
        console.warn(`[GeminiLiveEngine] Watchdog: No server traffic for ${Math.round(idleTime / 1000)}s. Resynchronizing session...`);
        this.scheduleReconnect(1000);
      }
    }, 15000);
  }

  stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  disconnect() {
    this.stopWatchdog();
    this.activeSessionId++; // Invalidate all pending or closing session callbacks
    this.shouldAutoReconnect = false;
    this.resumptionHandle = null; // Clear resumption token on deliberate disconnect so next connect is fresh
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const oldSession = this.session;
    this.session = null;
    this.isConnected = false;
    this.isModelSpeaking = false;
    this.isExecutingTool = false;
    if (oldSession) {
      try {
        oldSession.close();
      } catch (e) {}
    }

    if (this.toolsManager?.memoryManager) {
      const actions = this.toolsManager.memoryManager.currentSession.actions;
      if (actions && actions.length > 0) {
        this.toolsManager.memoryManager.recordSessionSummary(`Completed ${actions.length} action(s): ${actions.slice(-3).join(', ')}`);
        this.toolsManager.memoryManager.currentSession.actions = [];
      }
    }

    this.emitter?.emit('status', { status: 'disconnected', message: 'Session closed' });
  }
}

module.exports = { GeminiLiveEngine };
