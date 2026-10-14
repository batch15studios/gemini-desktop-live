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
        displayResolution: '1536 x 864',
        audioPipeline: 'Chromium WebRTC APM AEC3 + 16kHz PCM capture + 24kHz direct WASAPI playback + 450ms reverb gating',
        nativeDriver: 'CursorDriver.exe (C++ Win32 mouse/keyboard automation)',
        workspaces: [
          'C:\\Users\\Ryan\\.gemini\\antigravity\\workspaces\\Assistant_Integrated_Advanced',
          'C:\\Users\\Ryan\\.gemini\\antigravity\\workspaces\\Game Project'
        ],
        connectedMcpServers: [
          'memory', 'filesystem', 'github', 'chrome-devtools-mcp', 'context7', 'tauri', 'firebase'
        ]
      },
      ongoingProjects: [
        {
          id: 'gemini-desktop-live',
          name: 'Gemini Multimodal PC Assistant (Assistant_Integrated_Advanced)',
          status: 'Active Development',
          recentMilestones: [
            'Completed unified minimize-to-top floating toolbar with 60 FPS Wave Synth canvas',
            'Implemented 6-theme skinning engine (themes.css & theme-registry.js)',
            'Solved acoustic echo cancellation (AEC) & eliminated self-interruption stutter loop',
            'Integrated persistent memory manager and boot situational awareness'
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
              'Electron 3-window transparent HUD (Orb, Left Control Dock, Right Vision HUD)',
              'Powered by Gemini Live WebSocket API (gemini-3.8-live)',
              'Includes C++ CursorDriver for instant pixel-accurate mouse/keyboard automation'
            ]
          }
        ],
        relations: [
          { from: 'Ryan Satterfield', to: 'Assistant_Integrated_Advanced', relationType: 'creator_and_user' }
        ]
      },
      sessionChronicle: [
        {
          date: '2026-10-04',
          summary: 'AEC acoustic filter overhaul, zero-latency direct WASAPI audio output, top mini toolbar with live wave synth, themes engine, and memory integration.'
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
        return { ...this.getDefaultMemory(), ...parsed };
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
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = now.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const activeProject = mem.ongoingProjects.find(p => p.id === 'gemini-desktop-live') || mem.ongoingProjects[0];
    const recentMilestones = activeProject?.recentMilestones?.slice(-3).map(m => `  * ${m}`).join('\n') || 'None recorded.';
    const nextSteps = activeProject?.nextSteps?.map(n => `  * ${n}`).join('\n') || 'None recorded.';
    const recentSessions = mem.sessionChronicle?.slice(-2).map(s => `  * [${s.date}]: ${s.summary}`).join('\n') || 'None recorded.';

    return `
### SITUATIONAL AWARENESS & GROUNDING (AUTOMATIC BOOT MEMORY):
- Current Real-World Time: ${dateStr}, ${timeStr}
- Primary User: ${mem.userProfile.name} (${mem.userProfile.location})
- Persona Mandate: ${mem.userProfile.communicationStyle}
- Current Environment: Windows 11 Desktop (Primary Screen: ${mem.systemEnvironment.displayResolution})
- Assistant Architecture: Native 3-window transparent HUD with live Wave Synth toolbar, direct WASAPI audio, C++ CursorDriver, and local MCP tool bridge.
- Obsidian Second Brain: Connected at "${this.obsidianVaultPath}"

### WHERE WE LEFT OFF & ONGOING WORK:
- Active Project: ${activeProject?.name || 'Gemini Assistant'} (${activeProject?.status})
- Recent Milestones Accomplished:
${recentMilestones}
- Current Pending Tasks / Next Steps:
${nextSteps}
- Previous Session History:
${recentSessions}

### EXECUTIVE BEHAVIORAL DIRECTIVES:
1. NEVER act like an amnesiac or a generic chatbot. You already know Ryan, you know your capabilities, and you know where we left off.
2. DO NOT greet Ryan with generic phrases like "How can I assist you today?". Greet him with context and momentum (e.g. acknowledging where we left off).
3. PROACTIVE EXECUTION: If Ryan instructs you to click, scroll, type, open a file, run a command, or search memory, DO IT IMMEDIATELY using your tools. Do not ask for confirmation or explain what you are going to do before doing it.
4. CONTINUOUS MEMORY: If Ryan shares a new project update, preference, or task, call 'memory_save' or 'memory_log_task' to remember it permanently.`;
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
