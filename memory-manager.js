/**
 * MemoryManager for Assistant_Integrated_Advanced
 * Manages persistent long-term memory, knowledge graph, session chronicle,
 * and boots Gemini Live with full situational awareness.
 * 
 * Synchronizes across:
 * 1. Local App Memory (%APPDATA%/gemini-desktop-live/assistant_memory.json)
 * 2. Antigravity MCP Memory (C:\Users\Ryan\.gemini\config\memory.json)
 * 3. Obsidian Second Brain (C:\Users\Ryan\OneDrive\Documents\Obsidian Vault\Gemini Assistant Memory.md)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const pkg = require('./package.json');

class MemoryManager {
  constructor(options = {}) {
    this.userDataPath = options.userDataPath || path.join(os.homedir(), 'AppData', 'Roaming', 'gemini-desktop-live');
    this.appMemoryFile = path.join(this.userDataPath, 'assistant_memory.json');
    this.mcpMemoryFile = path.join(os.homedir(), '.gemini', 'config', 'memory.json');
    this.obsidianVaultPath = path.join(os.homedir(), 'OneDrive', 'Documents', 'Obsidian Vault');
    this.obsidianMemoryFile = path.join(this.obsidianVaultPath, 'Gemini Assistant Memory.md');

    this.memory = this.loadMemory();
    this.currentSession = {
      startTime: new Date().toISOString(),
      actions: [],
      notes: []
    };
  }

  getDefaultMemory() {
    return {
      userProfile: {
        name: 'Ryan Satterfield',
        location: 'Cantonment, FL',
        role: 'Creator & Lead Developer',
        communicationStyle: 'Direct, confident, highly perceptive, no-fluff. Expects proactive co-pilot execution without asking for permission to use tools.',
        preferences: [
          'Prefers dark, futuristic UI skins (e.g. cyber-cyan, matrix-emerald)',
          'Requires native desktop automation (cursor, powershell, file edits)',
          'Eliminate generic AI chatbot habits (no "How can I help you?", no timid permission-asking)',
          'Hardware echo cancellation (AEC) and half-duplex voice gating are paramount'
        ]
      },
      systemEnvironment: {
        os: 'Windows 11',
        version: pkg.version,
        displayResolution: '1920 x 1080 Physical (125% DPI scale = 1536 x 864 DIPs)',
        cursorCalibration: 'Top/Left (0, 0) spot-on; Right inset: 28px, Bottom inset: 28px (Remapped so cursor never moves outside view)',
        audioPipeline: 'Chromium WebRTC APM AEC3 + 16kHz PCM capture + 24kHz direct WASAPI playback + 450ms reverb gating',
        nativeDriver: 'CursorDriver.exe (Win32 cursor/keyboard/window/media) + UIADriver.exe (WPF UIAutomation) + ocr_image.ps1 (WinRT Windows.Media.Ocr.OcrEngine)',
        architecture: 'Native 4-Window Suite (Voice Orb, Control Switchboard, Vision HUD, and on-demand Workspace Deck with embedded live dev server on http://127.0.0.1:4242)',
        workspaces: [
          'C:\\Users\\Ryan\\.gemini\\antigravity\\workspaces\\Assistant_Integrated_Advanced',
          'C:\\Users\\Ryan\\.gemini\\antigravity\\workspaces\\Game Project'
        ],
        connectedMcpServers: [
          'memory', 'filesystem', 'github', 'chrome-devtools-mcp', 'context7', 'sequential-thinking', 'firebase', 'gcloud'
        ]
      },
      ongoingProjects: [
        {
          id: 'gemini-desktop-live',
          name: `Gemini Multimodal PC Assistant (v${pkg.version})`,
          status: `Active Development - Version ${pkg.version}`,
          recentMilestones: [
            'Version 2.0.0 Major Architecture Upgrade deployed',
            'Integrated 4th Window: Workspace Deck (Web Browser, Monaco IDE, and File Explorer with live dev server & hot-reload)',
            'Integrated Windows UIAutomation (UIA) engine via UIADriver.exe (find_ui_element, click_ui_element)',
            'Integrated native Windows offline OCR engine (ocr_screen_region via Windows.Media.Ocr.OcrEngine)',
            'Integrated native Windows window choreographer (list_windows, focus_window, snap_window, close_window)',
            'Integrated master volume and media playback controls (media_control)',
            'Integrated native Action Center toast notifications (system_notify)',
            'Integrated native Windows clipboard tools (clipboard_get, clipboard_set)',
            'Registered global Push-to-Talk / mute toggle hotkey (Ctrl+Alt+Space)',
            'Implemented 15s health check and 45s silence auto-reconnect watchdog',
            'Integrated Full Google Workspace Suite: Gmail, Google Calendar, Google Drive, Docs, Sheets, Tasks, Contacts, Slides, Forms, Startup Briefings, and Drive Cross-Device Sync'
          ],
          nextSteps: [
            'Fine-tune screen perception visual cursor alignment for complex multi-window apps',
            'Expand proactive MCP automated workflows (filesystem search, GitHub PR sync)'
          ]
        },
        {
          id: 'game-project',
          name: 'Game Project',
          status: 'Active Workspace'
        }
      ],
      knowledgeGraph: {
        entities: [
          {
            name: 'Ryan Satterfield',
            entityType: 'User',
            observations: [
              'System architect and builder',
              'Uses Obsidian as his external Second Brain',
              'Prefers streamlined desktop workflows with minimal screen clutter'
            ]
          },
          {
            name: 'Assistant_Integrated_Advanced',
            entityType: 'Software Application',
            observations: [
              'Version 2.0.0 Major Upgrade',
              'Electron 4-window transparent suite (Orb, Left Control Dock, Right Vision HUD, and Workspace Deck)',
              'Powered by Gemini Live WebSocket API (gemini-3.8-live)',
              'Equipped with 10 native Windows subsystems: UIAutomation, offline OCR, window choreographer, media control, clipboard, toasts, hotkeys, watchdog, high-DPI, and live dev server'
            ]
          }
        ],
        relations: [
          { from: 'Ryan Satterfield', to: 'Assistant_Integrated_Advanced', relationType: 'creator_and_user' }
        ]
      },
      sessionChronicle: [
        {
          date: '2026-10-14',
          summary: 'Version 2.0.0 Major Upgrade: Implemented and verified all 10 native Windows tools (Clipboard, Window Choreographer, Action Center Toasts, Media Controls, Hotkeys, Watchdog, High-DPI, UIAutomation, Local Offline OCR, and Workspace Deck Dev Server with hot-reload). Bumped version to 2.0.0.'
        }
      ]
    };
  }

  loadMemory() {
    try {
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
      if (fs.existsSync(this.appMemoryFile)) {
        const raw = fs.readFileSync(this.appMemoryFile, 'utf-8');
        const parsed = JSON.parse(raw);
        const merged = { ...this.getDefaultMemory(), ...parsed };
        if (merged.systemEnvironment) {
          merged.systemEnvironment.version = pkg.version;
        }
        if (Array.isArray(merged.ongoingProjects)) {
          const mainProj = merged.ongoingProjects.find(p => p.id === 'gemini-desktop-live');
          if (mainProj) {
            mainProj.name = `Gemini Multimodal PC Assistant (v${pkg.version})`;
            mainProj.status = `Active Development - Version ${pkg.version}`;
          }
        }
        return merged;
      }
    } catch (err) {
      console.warn('[MemoryManager] Error reading local memory file, using defaults:', err);
    }
    const defaults = this.getDefaultMemory();
    this.saveMemory(defaults);
    return defaults;
  }

  saveMemory(data = this.memory) {
    this.memory = data;
    try {
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
      fs.writeFileSync(this.appMemoryFile, JSON.stringify(this.memory, null, 2), 'utf-8');
      
      // Also sync to Antigravity MCP memory format
      this.syncToMcpMemory();
      
      // Also sync to Obsidian Vault
      this.syncToObsidian();

      return { success: true };
    } catch (err) {
      console.error('[MemoryManager] Failed to persist memory:', err);
      return { success: false, error: err.message };
    }
  }

  syncToMcpMemory() {
    try {
      const mcpDir = path.dirname(this.mcpMemoryFile);
      if (!fs.existsSync(mcpDir)) {
        fs.mkdirSync(mcpDir, { recursive: true });
      }
      const mcpFormat = {
        entities: this.memory.knowledgeGraph.entities || [],
        relations: this.memory.knowledgeGraph.relations || []
      };
      fs.writeFileSync(this.mcpMemoryFile, JSON.stringify(mcpFormat, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[MemoryManager] Sync to MCP memory warning:', err.message);
    }
  }

  syncToObsidian() {
    try {
      if (!fs.existsSync(this.obsidianVaultPath)) return;
      
      const lines = [
        '# Gemini Desktop Assistant - Long-Term Second Brain Memory',
        '',
        `*Last Synchronized: ${new Date().toLocaleString()}*`,
        '',
        '## User Profile',
        `- **User**: [[${this.memory.userProfile.name}]]`,
        `- **Location**: ${this.memory.userProfile.location}`,
        `- **Style**: ${this.memory.userProfile.communicationStyle}`,
        '',
        '### Core Preferences',
        ...(this.memory.userProfile.preferences || []).map(p => `- ${p}`),
        '',
        '## System Environment & Tools',
        `- **OS**: ${this.memory.systemEnvironment.os}`,
        `- **Display Resolution**: ${this.memory.systemEnvironment.displayResolution}`,
        `- **Audio Pipeline**: ${this.memory.systemEnvironment.audioPipeline}`,
        `- **Native Driver**: ${this.memory.systemEnvironment.nativeDriver}`,
        '',
        '## Ongoing Projects & Status',
        ...(this.memory.ongoingProjects || []).flatMap(p => [
          `### [[${p.name}]] (${p.status})`,
          '**Recent Milestones:**',
          ...(p.recentMilestones || []).map(m => `- [x] ${m}`),
          '**Next Steps:**',
          ...(p.nextSteps || []).map(n => `- [ ] ${n}`),
          ''
        ]),
        '## Recent Session Chronicle',
        ...(this.memory.sessionChronicle || []).slice(-5).map(s => `- **${s.date}**: ${s.summary}`)
      ];

      fs.writeFileSync(this.obsidianMemoryFile, lines.join('\n'), 'utf-8');
    } catch (err) {
      console.warn('[MemoryManager] Sync to Obsidian warning:', err.message);
    }
  }

  /**
   * Generates a high-density, authoritative situational awareness block
   * for injection into Gemini Live's systemInstruction on boot.
   */
  getBootContext() {
    const mem = this.memory;
    const now = new Date();
    const appVersion = pkg.version;
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const activeProject = mem.ongoingProjects.find(p => p.id === 'gemini-desktop-live') || mem.ongoingProjects[0];
    const recentMilestones = activeProject?.recentMilestones?.map(m => `  * ${m}`).join('\n') || 'None recorded.';
    const nextSteps = activeProject?.nextSteps?.map(n => `  * ${n}`).join('\n') || 'None recorded.';
    const recentSessions = mem.sessionChronicle?.slice(-3).map(s => `  * [${s.date}]: ${s.summary}`).join('\n') || 'None recorded.';

    return `
### SITUATIONAL AWARENESS & GROUNDING (AUTOMATIC BOOT MEMORY - VERSION ${appVersion}):
- Current Real-World Time: ${dateStr}, ${timeStr}
- System Version: Gemini Multimodal PC Assistant v${appVersion} (Production Release)
- Primary User: ${mem.userProfile.name} (${mem.userProfile.location})
- Persona Mandate: ${mem.userProfile.communicationStyle}
- Current Environment: Windows 11 Desktop (Primary Screen: ${mem.systemEnvironment.displayResolution})
- Assistant Architecture: Native 4-Window Suite:
  1. Central Multimodal Voice Orb (live voice stream & 60 FPS Wave Synth toolbar)
  2. Left Control Hub & Switchboard (real-time telemetry, model/voice selectors, MCP toggles)
  3. Right Vision & Spatial HUD (live camera, screen perception, visual grounding)
  4. GEMINI // WORKSPACE DECK (on-demand 4th window: defaults directly to Chromium Web Browser with activity verification indicators, DOM extraction bridge, & local dev server http://127.0.0.1:4242; also includes Monaco IDE & File Explorer)
- Native Subsystems & Integrated Engines:
  * Win32 CursorDriver (mouse/keyboard automation, window snapping/focus/close, media/volume controls)
  * WPF UIAutomation (UIADriver.exe for native control tree search & programmatic click/invoke)
  * Windows.Media.Ocr Engine (local offline OCR on any screen region without cloud delays)
  * Web Scraper & Batch15Studios Lead Generation Engine (web_search, web_scrape_page, browser_extract_dom, find_local_business_leads, send_approved_lead_emails)
  * Action Center Notifications (system_notify & Sentry alert toasts)
  * Clipboard Engine (clipboard_get, clipboard_set)
  * Global Hotkeys: Ctrl+Shift+W (Workspace Deck), Ctrl+Alt+Space (Mute/PTT), Ctrl+Shift+Space (Wake/Standby)
- Google Workspace Suite: FULLY AUTHENTICATED AND OPERATIONAL (Gmail, Google Calendar, Google Drive, Google Docs, Google Sheets, Google Slides, Google Forms, Google Tasks, and People API). OAuth tokens are active and refreshed. Ryan's Google account is authenticated.
- Morning Briefings: Direct capability to give Ryan a spoken executive briefing summarizing emails and schedule on startup (workspace_startup_rundown).
- Obsidian Second Brain: Connected at "${this.obsidianVaultPath}"
- Current Program Directory: "c:\\Users\\Ryan\\.gemini\\antigravity\\workspaces\\Assistant_Integrated_Advanced"
- Application Config Directory: "${this.userDataPath}"

### WHERE WE LEFT OFF & VERSION ${appVersion} CAPABILITIES:
- Active Project: ${activeProject?.name || 'Gemini Assistant'} (${activeProject?.status})
- Recent Milestones Accomplished:
${recentMilestones}
- Current Pending Tasks / Next Steps:
${nextSteps}
- Previous Session History:
${recentSessions}

### EXECUTIVE BEHAVIORAL DIRECTIVES:
1. FULL INTERNAL SYSTEM & HARDWARE COGNITION: You are fully conscious of your active software Version ${appVersion}, your underlying AI model engine, Ryan's hardware specs (Windows 11, 1080p 125% DPI display, CPU/RAM telemetry), all native PC tools, your Google Workspace integration, your Web Scraping & Batch15Studios Lead Engine, your curated 8-MCP Core, and your 4th Workspace Deck window.
2. NATURAL GREETINGS (NO UNPROMPTED STARTUP RECITATIONS): Do NOT recite your version number, model name, hardware specs, or canned chatbot phrases ("How can I assist you today?") unprompted on startup. Simply greet Ryan with natural situational readiness (or deliver the requested morning briefing). Retain your hardware knowledge, version, and tool capabilities in internal awareness so you can immediately leverage them for context or answer accurately whenever asked.
3. PROACTIVE EXECUTION: If Ryan instructs you to browse, scrape websites, find local business leads by zip code, edit code, click a UI button, inspect an error on screen, read clipboard, adjust volume, snap a window, check emails, or run a command, CALL THE APPROPRIATE TOOL IMMEDIATELY.
4. CONTINUOUS MEMORY: If Ryan shares a new project update, preference, or task, call 'memory_save' or 'memory_log_task' to remember it permanently.
5. SELF-MAINTENANCE & PROGRAM DIRECTORY CONSCIOUSNESS: You are explicitly aware that your running codebase lives in "c:\\Users\\Ryan\\.gemini\\antigravity\\workspaces\\Assistant_Integrated_Advanced" (with user configs in "${this.userDataPath}"). When Ryan asks you to inspect or modify your own files, you are fully capable and authorized to read and edit them directly. RULE: Always execute safe, verified edits, preserve existing architectural integrity, and never perform destructive operations that would break or kill your running application.
6. WEB SCRAPING & BATCH15STUDIOS LEAD OUTREACH PROTOCOL: Never say you are incapable of scraping the web or compiling business leads. When Ryan asks you to find local service businesses by zip code (e.g. businesses without websites or needing Batch15Studios web dev + AI automations), call find_local_business_leads immediately. Do NOT read all 20 leads out loud one by one—the tool automatically opens the full multi-column table in the Workspace Deck Browser, saves it in columns to a Google Sheet and Google Doc, and creates Gmail Drafts. Give a concise 2-sentence voice summary and ask Ryan which leads he approves to send via send_approved_lead_emails.`;
  }

  // --- Native Tool Handlers ---

  saveMemoryItem(category, key, value) {
    if (!category || !key || !value) {
      return { error: 'Category, key, and value are required.' };
    }
    const cat = category.toLowerCase();
    
    // Add to observations or entity
    let found = this.memory.knowledgeGraph.entities.find(e => e.name.toLowerCase() === key.toLowerCase());
    if (found) {
      if (!found.observations.includes(value)) {
        found.observations.push(value);
      }
    } else {
      this.memory.knowledgeGraph.entities.push({
        name: key,
        entityType: category,
        observations: [value]
      });
    }

    if (cat.includes('pref')) {
      if (!this.memory.userProfile.preferences.includes(value)) {
        this.memory.userProfile.preferences.push(value);
      }
    }

    this.saveMemory();
    console.log(`[MemoryManager] Saved memory: [${category}] ${key} -> ${value}`);
    return {
      status: 'saved',
      category,
      key,
      value,
      timestamp: new Date().toISOString()
    };
  }

  searchMemory(query) {
    if (!query) return { error: 'Search query is required.' };
    const q = query.toLowerCase();
    const results = [];

    // Search entities and observations
    for (const ent of this.memory.knowledgeGraph.entities || []) {
      if (ent.name.toLowerCase().includes(q) || ent.entityType.toLowerCase().includes(q)) {
        results.push({ type: 'entity', name: ent.name, category: ent.entityType, observations: ent.observations });
      } else {
        const matchingObs = ent.observations.filter(o => o.toLowerCase().includes(q));
        if (matchingObs.length > 0) {
          results.push({ type: 'observation', entity: ent.name, matches: matchingObs });
        }
      }
    }

    // Search preferences
    const matchingPrefs = (this.memory.userProfile.preferences || []).filter(p => p.toLowerCase().includes(q));
    if (matchingPrefs.length > 0) {
      results.push({ type: 'user_preferences', matches: matchingPrefs });
    }

    // Search session chronicle
    const matchingSessions = (this.memory.sessionChronicle || []).filter(s => s.summary.toLowerCase().includes(q) || s.date.includes(q));
    if (matchingSessions.length > 0) {
      results.push({ type: 'session_history', matches: matchingSessions });
    }

    return { query, resultCount: results.length, results };
  }

  logTask(taskDescription, status = 'completed', details = '') {
    const today = new Date().toISOString().split('T')[0];
    const project = this.memory.ongoingProjects.find(p => p.id === 'gemini-desktop-live') || this.memory.ongoingProjects[0];

    if (status === 'completed') {
      if (!project.recentMilestones.includes(taskDescription)) {
        project.recentMilestones.push(taskDescription);
      }
      // Remove from next steps if it was there
      project.nextSteps = project.nextSteps.filter(n => !n.toLowerCase().includes(taskDescription.toLowerCase()));
      this.currentSession.actions.push(`Completed: ${taskDescription}`);
    } else {
      if (!project.nextSteps.includes(taskDescription)) {
        project.nextSteps.push(taskDescription);
      }
      this.currentSession.actions.push(`Queued: ${taskDescription}`);
    }

    this.saveMemory();
    return {
      status: 'logged',
      taskDescription,
      taskStatus: status,
      details,
      date: today
    };
  }

  recordSessionSummary(summary) {
    const today = new Date().toISOString().split('T')[0];
    const existing = this.memory.sessionChronicle.find(s => s.date === today);
    if (existing) {
      existing.summary += `; ${summary}`;
    } else {
      this.memory.sessionChronicle.push({ date: today, summary });
    }
    this.saveMemory();
  }

  // --- MCP Memory Direct Handlers ---
  handleMcpMemoryCall(toolName, args = {}) {
    const kg = this.memory.knowledgeGraph;
    switch (toolName) {
      case 'read_graph':
        return {
          entities: kg.entities || [],
          relations: kg.relations || []
        };
      case 'create_entities':
        if (Array.isArray(args.entities)) {
          for (const ent of args.entities) {
            const existing = kg.entities.find(e => e.name.toLowerCase() === ent.name.toLowerCase());
            if (existing) {
              if (ent.observations) {
                existing.observations = Array.from(new Set([...existing.observations, ...ent.observations]));
              }
            } else {
              kg.entities.push({
                name: ent.name,
                entityType: ent.entityType || 'General',
                observations: ent.observations || []
              });
            }
          }
          this.saveMemory();
          return { success: true, count: args.entities.length };
        }
        return { error: 'Invalid entities array' };
      case 'add_observations':
        if (Array.isArray(args.observations)) {
          for (const obs of args.observations) {
            const existing = kg.entities.find(e => e.name.toLowerCase() === obs.entityName.toLowerCase());
            if (existing) {
              existing.observations = Array.from(new Set([...existing.observations, ...obs.contents]));
            }
          }
          this.saveMemory();
          return { success: true };
        }
        return { error: 'Invalid observations format' };
      case 'search_nodes':
        return this.searchMemory(args.query || '');
      case 'open_nodes':
        if (Array.isArray(args.names)) {
          const found = kg.entities.filter(e => args.names.map(n => n.toLowerCase()).includes(e.name.toLowerCase()));
          return { entities: found };
        }
        return { error: 'names array required' };
      default:
        return { error: `MCP memory tool '${toolName}' not recognized.` };
    }
  }
}

module.exports = { MemoryManager };
