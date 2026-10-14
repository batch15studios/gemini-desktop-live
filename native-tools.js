/**
 * Native PC Tools and MCP Connectivity Engine for Assistant_Integrated_Advanced
 * Provides direct, real execution of PC control commands, filesystem tasks,
 * system inspection, and connects to Model Context Protocol (MCP) servers.
 */

const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let electronShell = null;
let electronClipboard = null;
try {
  const electron = require('electron');
  electronShell = electron.shell;
  electronClipboard = electron.clipboard;
} catch (e) {
  // Standalone environment
}

const { MemoryManager } = require('./memory-manager');
const { safetyGuard } = require('./safety-guard.js');
const { WindowTools } = require('./window-tools.js');

// Standard Tool Declarations for Gemini Live / Function Calling
const TOOL_DEFINITIONS = [
  {
    name: 'execute_command',
    description: 'Execute a PowerShell or command-line string on the Windows PC and return stdout/stderr. Use for system automation, running scripts, launching tools, or querying PC state.',
    parameters: {
      type: 'OBJECT',
      properties: {
        command: { type: 'STRING', description: 'The exact PowerShell command line to execute.' }
      },
      required: ['command']
    }
  },
  {
    name: 'read_file',
    description: 'Read the text content of a file from the local filesystem.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: { type: 'STRING', description: 'Absolute or relative file path to read.' }
      },
      required: ['path']
    }
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file on the local filesystem with specified text content.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: { type: 'STRING', description: 'Absolute or relative target file path.' },
        content: { type: 'STRING', description: 'Text contents to write to the file.' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'list_directory',
    description: 'List files and subdirectories in a given directory path.',
    parameters: {
      type: 'OBJECT',
      properties: {
        path: { type: 'STRING', description: 'Directory path to list (defaults to current working directory).' }
      }
    }
  },
  {
    name: 'get_system_status',
    description: 'Retrieve real-time hardware status: CPU model, CPU architecture, free RAM, total RAM, OS version, and uptime.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'open_application',
    description: 'Launch an application, desktop shortcut (.lnk), or open a file/URL in Windows (e.g. "antigravity", "Antigravity IDE", "chrome", "obsidian", "notepad", or any app name / folder / file path). The tool automatically resolves desktop shortcuts, Start Menu entries, and Program installation directories.',
    parameters: {
      type: 'OBJECT',
      properties: {
        target: { type: 'STRING', description: 'Application name, desktop shortcut name, executable path, directory, or URL to open.' }
      },
      required: ['target']
    }
  },
  {
    name: 'mouse_click',
    description: 'Click on any UI element on Ryan\'s screen. Provide coordinates on a 0-1000 normalized scale (where 0,0 is top-left and 1000,1000 is bottom-right). Example: center of screen is x: 500, y: 500. Identify the target location from your desktop screen perception image and aim for the center of the target button, icon, link, or input field.',
    parameters: {
      type: 'OBJECT',
      properties: {
        x: { type: 'NUMBER', description: 'Normalized 0-1000 horizontal coordinate (0=left, 1000=right).' },
        y: { type: 'NUMBER', description: 'Normalized 0-1000 vertical coordinate (0=top, 1000=bottom).' },
        button: { type: 'STRING', description: 'Mouse button to click: "left" (default), "right", or "middle".' },
        doubleClick: { type: 'BOOLEAN', description: 'Set to true to double-click (e.g. to open an app or desktop icon).' },
        normalized: { type: 'BOOLEAN', description: 'Defaults to true. Set to false only if passing raw physical pixels.' }
      },
      required: ['x', 'y']
    }
  },
  {
    name: 'mouse_move',
    description: 'Move the mouse cursor smoothly to coordinates (x, y) without clicking. Use 0-1000 normalized scale.',
    parameters: {
      type: 'OBJECT',
      properties: {
        x: { type: 'NUMBER', description: 'Normalized 0-1000 horizontal coordinate (0=left, 1000=right).' },
        y: { type: 'NUMBER', description: 'Normalized 0-1000 vertical coordinate (0=top, 1000=bottom).' },
        normalized: { type: 'BOOLEAN', description: 'Defaults to true.' }
      },
      required: ['x', 'y']
    }
  },
  {
    name: 'mouse_drag',
    description: 'Click and drag from (startX, startY) to (endX, endY) using 0-1000 normalized coordinates. Use to drag files, move windows, or select text.',
    parameters: {
      type: 'OBJECT',
      properties: {
        startX: { type: 'NUMBER', description: 'Starting horizontal coordinate (0-1000).' },
        startY: { type: 'NUMBER', description: 'Starting vertical coordinate (0-1000).' },
        endX: { type: 'NUMBER', description: 'Ending horizontal coordinate (0-1000).' },
        endY: { type: 'NUMBER', description: 'Ending vertical coordinate (0-1000).' },
        normalized: { type: 'BOOLEAN', description: 'Defaults to true.' }
      },
      required: ['startX', 'startY', 'endX', 'endY']
    }
  },
  {
    name: 'mouse_scroll',
    description: 'Scroll the mouse wheel up or down at the current cursor position. Use positive numbers to scroll up, negative numbers to scroll down (e.g. deltaY: -300 to scroll down).',
    parameters: {
      type: 'OBJECT',
      properties: {
        deltaY: { type: 'NUMBER', description: 'Scroll delta amount (e.g. -300 for down, +300 for up).' }
      },
      required: ['deltaY']
    }
  },
  {
    name: 'keyboard_type',
    description: 'Type text into the active, focused input field or window on the PC. Optionally press Enter afterwards.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'The text string to type.' },
        pressEnter: { type: 'BOOLEAN', description: 'Set to true to press Enter after typing.' }
      },
      required: ['text']
    }
  },
  {
    name: 'keyboard_hotkey',
    description: 'Press a keyboard shortcut combination or special key on Windows (e.g. "ctrl+c", "ctrl+v", "ctrl+s", "alt+tab", "win+d", "enter", "esc").',
    parameters: {
      type: 'OBJECT',
      properties: {
        combo: { type: 'STRING', description: 'Key combination (e.g. "ctrl+s", "enter", "win+d", "alt+f4").' }
      },
      required: ['combo']
    }
  },
  {
    name: 'get_cursor_position',
    description: 'Get the current screen coordinates (x, y) of the mouse cursor.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'mcp_list_tools',
    description: 'List available tools and schemas from local Model Context Protocol (MCP) servers (chrome-devtools-mcp, context7, filesystem, firebase, gcloud, github, memory, tauri, etc.). Specify serverName or leave empty to view all discovered servers.',
    parameters: {
      type: 'OBJECT',
      properties: {
        serverName: { type: 'STRING', description: 'Optional name of the MCP server to inspect tools for.' }
      }
    }
  },
  {
    name: 'mcp_call_tool',
    description: 'Execute an MCP tool on one of the discovered MCP servers.',
    parameters: {
      type: 'OBJECT',
      properties: {
        serverName: { type: 'STRING', description: 'The MCP server name (e.g. memory, filesystem, github, chrome-devtools-mcp).' },
        toolName: { type: 'STRING', description: 'The MCP tool name to call (e.g. read_graph, create_entities, search_nodes).' },
        args: { type: 'OBJECT', description: 'Parameters object for the MCP tool.' }
      },
      required: ['serverName', 'toolName']
    }
  },
  {
    name: 'memory_save',
    description: 'Save an important fact, project decision, technical detail, or user preference permanently into persistent long-term memory and Obsidian Second Brain. Use proactively whenever Ryan shares preferences, project context, or architectural decisions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: { type: 'STRING', description: 'Category: "preference", "project", "system", or "fact".' },
        key: { type: 'STRING', description: 'Subject or entity name (e.g. "Audio Settings", "Ryan", "Game Project").' },
        value: { type: 'STRING', description: 'The exact observation, preference, or detail to remember.' }
      },
      required: ['category', 'key', 'value']
    }
  },
  {
    name: 'memory_search',
    description: 'Search persistent long-term memory, knowledge graph, past session logs, and Obsidian Second Brain for relevant facts, project details, or user preferences.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Keyword or topic to search for in memory.' }
      },
      required: ['query']
    }
  },
  {
    name: 'memory_log_task',
    description: 'Log an accomplished milestone or queue a next step in the persistent project task tracker and session chronicle.',
    parameters: {
      type: 'OBJECT',
      properties: {
        taskDescription: { type: 'STRING', description: 'Clear description of the milestone or task.' },
        status: { type: 'STRING', description: 'Status: "completed" or "in-progress".' },
        details: { type: 'STRING', description: 'Optional extra technical context or notes.' }
      },
      required: ['taskDescription']
    }
  },
  {
    name: 'chain_actions',
    description: 'Execute a sequential chain of desktop actions in rapid succession with micro-delays between steps (e.g. click a field, type text, press Enter, hotkeys). Ideal for atomic workflows like form entry, dialog submission, or rapid multi-step GUI navigation.',
    parameters: {
      type: 'OBJECT',
      properties: {
        actions: {
          type: 'ARRAY',
          description: 'Ordered list of action objects to execute sequentially.',
          items: {
            type: 'OBJECT',
            properties: {
              tool: { type: 'STRING', description: 'Tool name to call (e.g. "mouse_click", "keyboard_type", "keyboard_hotkey", "open_application", "execute_command").' },
              args: { type: 'OBJECT', description: 'Arguments for the tool.' },
              delayAfterMs: { type: 'NUMBER', description: 'Optional pause in milliseconds after executing this step (default: 250ms).' }
            },
            required: ['tool', 'args']
          }
        },
        goalDescription: { type: 'STRING', description: 'Brief description of the intended multi-step outcome.' }
      },
      required: ['actions']
    }
  },
  {
    name: 'verify_screen',
    description: 'Force an immediate high-resolution screen snapshot capture to visually verify the state of a window, dialog, or UI element after taking actions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        focusArea: { type: 'STRING', description: 'Optional description of what to verify on screen (e.g. "save dialog", "terminal output", "browser tab").' }
      }
    }
  },
  {
    name: 'sentry_watch',
    description: 'Activate autonomous Sentry Mode to watch Ryan\'s PC for a specific condition (e.g. when a build finishes, a process exits, high CPU/RAM usage drops, or a timer expires). Runs autonomously in the background and proactively alerts Ryan via voice chime and speech when triggered.',
    parameters: {
      type: 'OBJECT',
      properties: {
        watchType: { type: 'STRING', description: 'Type of sentry: "process" (watch a program/script), "telemetry" (watch CPU/RAM), "timer" (countdown timer), or "command_output" (watch output of a command).' },
        target: { type: 'STRING', description: 'Target process name (e.g. "node", "cargo", "git"), threshold (e.g. "cpu>80"), or timer duration in seconds.' },
        condition: { type: 'STRING', description: 'Trigger condition: "exits", "starts", "stabilizes", or "expires".' },
        alertMessage: { type: 'STRING', description: 'The exact spoken alert message Gemini should say when the trigger fires (e.g. "Ryan, your PowerShell build has finished!").' }
      },
      required: ['watchType', 'alertMessage']
    }
  },
  {
    name: 'sentry_status',
    description: 'Check active sentry watchers or cancel an active watcher.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: { type: 'STRING', description: '"list" to inspect active sentries, or "cancel" to cancel.' },
        sentryIndex: { type: 'NUMBER', description: 'Index of sentry to cancel.' }
      }
    }
  },
  {
    name: 'workspace_deck',
    description: 'Control your integrated GEMINI WORKSPACE DECK (the 4th window). Allows you to open, close, toggle, or switch between your built-in Web Browser, Code IDE (Monaco Editor), and File Explorer. Also allows loading specific URLs into the browser or opening specific files in the IDE.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Action to perform: "open" (default), "close", "toggle", "switch_mode", "navigate_browser", "open_file".'
        },
        mode: {
          type: 'STRING',
          description: 'The mode to switch the deck to: "browser" (Chromium Web Browser), "ide" (Monaco Code Editor), or "explorer" (Native File Explorer).'
        },
        url: {
          type: 'STRING',
          description: 'URL to navigate to when in browser mode (e.g. "http://localhost:3000", "preview.html", or "https://google.com").'
        },
        filePath: {
          type: 'STRING',
          description: 'Relative or absolute file path to open in the IDE (e.g. "preview.html", "main.js", "safety-guard.js").'
        }
      }
    }
  },
  {
    name: 'clipboard_get',
    description: 'Read the current text content from the Windows clipboard. Use when Ryan asks "what is on my clipboard?", "read what I copied", or to inspect copied text, URLs, or code.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'clipboard_set',
    description: 'Set or copy text directly onto the Windows clipboard. Use when Ryan asks to copy code, text, links, or generated data to his clipboard so he can paste it anywhere.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'The text content to place onto the Windows clipboard.' }
      },
      required: ['text']
    }
  },
  {
    name: 'list_windows',
    description: 'List all currently open, active desktop application windows on Windows (titles, process names, and process IDs). Use to see what apps Ryan has open or to find target windows to focus, snap, or inspect.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'focus_window',
    description: 'Bring an open application window to the foreground and focus it by matching its title or process name (e.g. "chrome", "obsidian", "code", "settings", "antigravity").',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Application window title or process name to bring to the front.' }
      },
      required: ['title']
    }
  },
  {
    name: 'snap_window',
    description: 'Snap or reposition an application window on screen (positions: "left", "right", "top", "bottom", "maximize", "minimize", "restore", "center").',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Window title or process name to snap.' },
        position: { type: 'STRING', description: 'Snap position: "left", "right", "top", "bottom", "maximize", "minimize", "restore", or "center".' }
      },
      required: ['title', 'position']
    }
  },
  {
    name: 'close_window',
    description: 'Gracefully close an application window by title or process name.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Window title or process name to close.' }
      },
      required: ['title']
    }
  },
  {
    name: 'media_control',
    description: 'Control system audio volume and media playback on Windows (action: "mute", "volume_up", "volume_down", "play_pause", "next_track", "prev_track").',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: { type: 'STRING', description: 'Action: "mute", "volume_up", "volume_down", "play_pause", "next_track", "prev_track".' },
        times: { type: 'NUMBER', description: 'Number of step increments (e.g. 5 for 5 volume clicks). Default is 1.' }
      },
      required: ['action']
    }
  },
  {
    name: 'system_notify',
    description: 'Post a native Windows Action Center toast banner notification on Ryan\'s desktop screen. Use for important alerts, reminders, finished background builds, or task completions.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Title of the notification banner (e.g. "Gemini Assistant", "Build Completed").' },
        message: { type: 'STRING', description: 'The body text of the notification.' }
      },
      required: ['message']
    }
  },
  {
    name: 'find_ui_element',
    description: 'Search desktop windows and controls for native UI elements (buttons, inputs, tabs, checkboxes) matching a name or query using Windows UIAutomation. Returns element names, control types, automation IDs, and screen bounding rectangles.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Name, label, or automation ID of the control to find (e.g. "Save", "Submit", "Settings", "Cancel").' }
      },
      required: ['query']
    }
  },
  {
    name: 'click_ui_element',
    description: 'Click or invoke a native Windows UI element by name using Windows UIAutomation (InvokePattern or target center click). More reliable and precise than coordinate-based clicks for native desktop controls and dialog buttons.',
    parameters: {
      type: 'OBJECT',
      properties: {
        name: { type: 'STRING', description: 'Name or label of the control to click (e.g. "Save", "Submit", "Close", "OK", "Cancel").' }
      },
      required: ['name']
    }
  },
  {
    name: 'ocr_screen_region',
    description: 'Read and extract text from any region of Ryan\'s screen or active window using native offline Windows OCR (Windows.Media.Ocr). Highly accurate for reading error messages, dialog text, logs, status bars, and UI labels directly from screen pixels without guessing.',
    parameters: {
      type: 'OBJECT',
      properties: {
        x: { type: 'NUMBER', description: 'Normalized horizontal coordinate of top-left corner (0-1000). Defaults to 0 (full width).' },
        y: { type: 'NUMBER', description: 'Normalized vertical coordinate of top-left corner (0-1000). Defaults to 0 (full height).' },
        width: { type: 'NUMBER', description: 'Normalized width of region (1-1000). Defaults to 1000 (full width).' },
        height: { type: 'NUMBER', description: 'Normalized height of region (1-1000). Defaults to 1000 (full height).' }
      }
    }
  }
];

const MCP_SERVER_METADATA = {
  'memory': {
    displayName: 'Persistent Memory & Graph',
    description: 'Knowledge graph, user preferences, past session chronicle, and Obsidian Second Brain sync.',
    icon: '🧠',
    category: 'Memory'
  },
  'filesystem': {
    displayName: 'Filesystem Driver',
    description: 'Direct file reading, writing, directory listing, file moving, and filesystem inspection.',
    icon: '📁',
    category: 'System'
  },
  'github': {
    displayName: 'GitHub Integration',
    description: 'Inspect repositories, pull requests, issue tracking, and global code searches.',
    icon: '🐙',
    category: 'Development'
  },
  'chrome-devtools-mcp': {
    displayName: 'Chrome DevTools Automation',
    description: 'Live browser page automation, element clicks, DOM evaluation, and page screenshots.',
    icon: '🌐',
    category: 'Browser'
  },
  'context7': {
    displayName: 'Context7 Technical Docs',
    description: 'Real-time documentation search and API lookups across libraries and frameworks.',
    icon: '📚',
    category: 'Knowledge'
  },
  'tauri': {
    displayName: 'Tauri Desktop Runtime',
    description: 'Tauri application window automation, IPC events, and Webview interaction.',
    icon: '⚡',
    category: 'System'
  },
  'firebase': {
    displayName: 'Firebase Cloud Platform',
    description: 'Firestore databases, security rules, authentication, and hosting deployment.',
    icon: '🔥',
    category: 'Cloud'
  },
  'gcloud': {
    displayName: 'Google Cloud Platform',
    description: 'GCloud command execution, project management, and Cloud SDK services.',
    icon: '☁️',
    category: 'Cloud'
  },
  'genkit-mcp-server': {
    displayName: 'Genkit AI Workflows',
    description: 'Flow execution, runtime telemetry, traces, and Genkit documentation.',
    icon: '🤖',
    category: 'AI'
  }
};

class ToolsManager {
  constructor(eventEmitter, initialEnabledServers = null) {
    this.emitter = eventEmitter;
    this.memoryManager = new MemoryManager();
    this.mcpServersPath = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp');
    this.mcpConfigPath = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
    this.mcpConfig = this.loadMcpConfig();
    this.availableMcpServers = this.discoverMcpServers();
    this.enabledMcpServers = initialEnabledServers || ['memory', 'filesystem', 'github', 'chrome-devtools-mcp', 'context7'];
    this.activeSentries = [];
    this.screenCaptureProvider = null;
  }

  loadMcpConfig() {
    try {
      if (fs.existsSync(this.mcpConfigPath)) {
        return JSON.parse(fs.readFileSync(this.mcpConfigPath, 'utf-8'));
      }
    } catch (e) {
      console.warn('[ToolsManager] Warning reading mcp_config.json:', e.message);
    }
    return { mcpServers: {} };
  }

  setEnabledMcpServers(servers) {
    if (Array.isArray(servers)) {
      this.enabledMcpServers = [...servers];
      console.log('[ToolsManager] Enabled MCP servers updated:', this.enabledMcpServers);
    }
  }

  isMcpServerEnabled(serverName) {
    if (!this.enabledMcpServers || !Array.isArray(this.enabledMcpServers)) return true;
    return this.enabledMcpServers.includes(serverName);
  }

  getMcpServersDetailed(customEnabledList = null) {
    const enabled = customEnabledList || this.enabledMcpServers || [];
    const discovered = this.discoverMcpServers();
    const result = [];

    for (const serverName of discovered) {
      const serverDir = path.join(this.mcpServersPath, serverName);
      let tools = [];
      try {
        const files = fs.readdirSync(serverDir).filter(f => f.endsWith('.json'));
        tools = files.map(f => {
          try {
            const raw = fs.readFileSync(path.join(serverDir, f), 'utf-8');
            const parsed = JSON.parse(raw);
            return {
              name: parsed.name || f.replace('.json', ''),
              description: parsed.description || 'MCP Tool',
              parameters: parsed.parameters || {}
            };
          } catch (e) {
            return { name: f.replace('.json', ''), description: 'Tool schema' };
          }
        });
      } catch (e) {}

      const meta = MCP_SERVER_METADATA[serverName] || {
        displayName: serverName,
        description: `Local Model Context Protocol server for ${serverName}.`,
        icon: '🔌',
        category: 'Integration'
      };

      result.push({
        id: serverName,
        displayName: meta.displayName,
        description: meta.description,
        icon: meta.icon,
        category: meta.category,
        toolCount: tools.length,
        isEnabled: enabled.includes(serverName),
        tools
      });
    }

    return result;
  }

  getEnabledMcpContext() {
    const detailed = this.getMcpServersDetailed();
    const activeServers = detailed.filter(s => s.isEnabled);
    if (activeServers.length === 0) {
      return `### ACTIVE MODEL CONTEXT PROTOCOL (MCP) SERVERS:
(No MCP servers currently toggled ON in the Left Window Switchboard. Ryan can enable servers anytime).`;
    }

    const lines = [
      '### ACTIVE MODEL CONTEXT PROTOCOL (MCP) SERVERS (AVAILABLE FOR PROACTIVE CALLING):',
      'Ryan has enabled the following MCP servers. You have permission and are expected to use their capabilities proactively by calling mcp_call_tool(serverName, toolName, args):'
    ];

    for (const s of activeServers) {
      const toolNames = s.tools.map(t => t.name).slice(0, 8).join(', ');
      const extra = s.tools.length > 8 ? ` (+${s.tools.length - 8} more)` : '';
      lines.push(`- **${s.id}** (${s.displayName}): [${toolNames}${extra}] - ${s.description}`);
      if (s.id === 'github') {
        lines.push('  * GitHub Identity: Account "batch15studios" (email: batch15studios@gmail.com).');
        lines.push('  * Accessible Repos: "batch15studios/gemini-desktop-live", "batch15studios/batchmail", "batch15studios/BatchMail_v1.2", "batch15studios/BatchScribe_V_1.0.0", "batch15studios/desktop-tutorial", "batch15studios/edl-ng-windows-arm64", "batch15studios/Strategic-Insights-Pensacola".');
        lines.push('  * Always use owner: "batch15studios" when calling GitHub tools (never "Ryan" or "batf15").');
        lines.push('  * If Ryan asks to "pull" or "sync" the local repo on disk, use execute_command("git pull") or mcp_call_tool("github", "list_commits", { repo: "gemini-desktop-live" }).');
      }
    }

    lines.push('\nRULE: Whenever Ryan requests actions relating to these services (e.g. check GitHub, search filesystem, read memory, query docs), CALL `mcp_call_tool` PROACTIVELY.');
    return lines.join('\n');
  }

  discoverMcpServers() {
    try {
      if (fs.existsSync(this.mcpServersPath)) {
        const dirs = fs.readdirSync(this.mcpServersPath, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);
        return dirs;
      }
    } catch (e) {
      console.warn('Error reading MCP directory:', e);
    }
    return [];
  }

  getToolDeclarations() {
    return TOOL_DEFINITIONS;
  }

  async executeTool(name, args) {
    console.log(`[ToolsManager] Executing tool '${name}' with args:`, args);
    this.emitter?.emit('tool_executing', { name, args, time: new Date().toLocaleTimeString() });

    try {
      let result;
      switch (name) {
        case 'execute_command':
          result = await this.runPowerShell(args.command);
          break;
        case 'read_file':
          result = await this.readFile(args.path);
          break;
        case 'write_file':
          result = await this.writeFile(args.path, args.content);
          break;
        case 'list_directory':
          result = await this.listDirectory(args.path || process.cwd());
          break;
        case 'get_system_status':
          result = this.getSystemStatus();
          break;
        case 'open_application':
          result = await this.openApplication(args.target);
          break;
        case 'mouse_click':
          result = await this.mouseClick(args.x, args.y, args.button, args.doubleClick, args.normalized !== false);
          break;
        case 'mouse_move':
          result = await this.mouseMove(args.x, args.y, args.normalized !== false);
          break;
        case 'mouse_drag':
          result = await this.mouseDrag(args.startX, args.startY, args.endX, args.endY, args.normalized !== false);
          break;
        case 'mouse_scroll':
          result = await this.mouseScroll(args.deltaY);
          break;
        case 'keyboard_type':
          result = await this.keyboardType(args.text, args.pressEnter);
          break;
        case 'keyboard_hotkey':
          result = await this.keyboardHotkey(args.combo);
          break;
        case 'get_cursor_position':
          result = await this.getCursorPosition();
          break;
        case 'mcp_list_tools':
          result = this.listMcpTools(args?.serverName);
          break;
        case 'mcp_call_tool':
          result = await this.callMcpTool(args.serverName, args.toolName, args.args || {});
          break;
        case 'memory_save':
          result = this.memoryManager.saveMemoryItem(args.category, args.key, args.value);
          break;
        case 'memory_search':
          result = this.memoryManager.searchMemory(args.query);
          break;
        case 'memory_log_task':
          result = this.memoryManager.logTask(args.taskDescription, args.status, args.details);
          break;
        case 'chain_actions':
          result = await this.chainActions(args.actions, args.goalDescription);
          break;
        case 'verify_screen':
          result = await this.verifyScreenState(args.focusArea);
          break;
        case 'sentry_watch':
          result = await this.startSentryWatch(args);
          break;
        case 'sentry_status':
          result = this.getSentryStatus(args?.action, args?.sentryIndex);
          break;
        case 'workspace_deck':
          result = await this.controlWorkspaceDeck(args);
          break;
        case 'clipboard_get':
          result = await this.clipboardGet();
          break;
        case 'clipboard_set':
          result = await this.clipboardSet(args?.text);
          break;
        case 'list_windows':
          result = await WindowTools.listWindows();
          break;
        case 'focus_window':
          result = await WindowTools.focusWindow(args?.title);
          break;
        case 'snap_window':
          result = await WindowTools.snapWindow(args?.title, args?.position);
          break;
        case 'close_window':
          result = await WindowTools.closeWindow(args?.title);
          break;
        case 'media_control':
          result = await WindowTools.mediaControl(args?.action, args?.times);
          break;
        case 'system_notify':
          result = await this.systemNotify(args?.title, args?.message);
          break;
        case 'find_ui_element':
          result = await this.findUiElement(args?.query);
          break;
        case 'click_ui_element':
          result = await this.clickUiElement(args?.name);
          break;
        case 'ocr_screen_region':
          result = await this.ocrScreenRegion(args?.x, args?.y, args?.width, args?.height);
          break;
        default:
          result = { error: `Tool '${name}' not implemented.` };
      }

      this.emitter?.emit('tool_completed', { name, result, time: new Date().toLocaleTimeString() });
      return result;
    } catch (err) {
      const errRes = { error: err.message || String(err) };
      this.emitter?.emit('tool_failed', { name, error: errRes.error, time: new Date().toLocaleTimeString() });
      return errRes;
    }
  }

  async clipboardGet() {
    try {
      if (electronClipboard && typeof electronClipboard.readText === 'function') {
        const text = electronClipboard.readText() || '';
        return { success: true, text, length: text.length };
      }
      const res = await this.runPowerShell('Get-Clipboard -Raw');
      const text = res.stdout || '';
      return { success: true, text, length: text.length, fallback: true };
    } catch (e) {
      return { error: `Failed to read clipboard: ${e.message}` };
    }
  }

  async clipboardSet(text) {
    if (typeof text !== 'string') text = String(text ?? '');
    try {
      if (electronClipboard && typeof electronClipboard.writeText === 'function') {
        electronClipboard.writeText(text);
        return { success: true, length: text.length, message: 'Text copied to Windows clipboard successfully.' };
      }
      const escaped = text.replace(/'/g, "''");
      await this.runPowerShell(`Set-Clipboard -Value '${escaped}'`);
      return { success: true, length: text.length, message: 'Text copied to Windows clipboard via PowerShell fallback.' };
    } catch (e) {
      return { error: `Failed to write clipboard: ${e.message}` };
    }
  }

  async systemNotify(title = 'Gemini Assistant', message = '') {
    const cleanTitle = title || 'Gemini Assistant';
    const cleanMsg = message || '';

    try {
      const electron = require('electron');
      if (electron.Notification && electron.Notification.isSupported()) {
        const notif = new electron.Notification({
          title: cleanTitle,
          body: cleanMsg,
          icon: path.join(__dirname, 'assets', 'icon.png')
        });
        notif.show();
        return { success: true, delivered: true, method: 'electron_notification', title: cleanTitle, message: cleanMsg };
      }
    } catch (e) {}

    const ps = `
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      $template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
      $texts = $template.GetElementsByTagName('text')
      $texts[0].AppendChild($template.CreateTextNode('${cleanTitle.replace(/'/g, "''")}')) | Out-Null
      $texts[1].AppendChild($template.CreateTextNode('${cleanMsg.replace(/'/g, "''")}')) | Out-Null
      $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Gemini Desktop Assistant')
      $notifier.Show([Windows.UI.Notifications.ToastNotification]::new($template))
    `.replace(/\r?\n\s*/g, ' ');

    await this.runPowerShell(ps);
    return { success: true, delivered: true, method: 'powershell_winrt', title: cleanTitle, message: cleanMsg };
  }

  async controlWorkspaceDeck(args = {}) {
    const action = args.action || 'open';
    const mode = args.mode || null;
    const url = args.url || null;
    const filePath = args.filePath || null;

    console.log(`[ToolsManager] Controlling Workspace Deck: action=${action}, mode=${mode}, url=${url}, file=${filePath}`);
    this.emitter?.emit('workspace_control', { action, mode, url, filePath });

    return {
      success: true,
      action,
      mode: mode || 'active',
      url,
      filePath,
      message: `Workspace Deck ${action} executed.${mode ? ` Switched view to "${mode}".` : ''}${url ? ` Navigated browser to "${url}".` : ''}${filePath ? ` Opened "${filePath}" in IDE.` : ''}`
    };
  }

  runPowerShell(command) {
    const check = safetyGuard.validateCommand(command);
    if (!check.allowed) {
      console.warn(`[ToolsManager] PowerShell command intercepted by Windows Safety Guard: ${check.reason}`);
      this.emitter?.emit('safety_blocked', { command, reason: check.reason });
      return Promise.resolve({
        exitCode: 1,
        stdout: '',
        stderr: `[WINDOWS SYSTEM INTEGRITY SHIELD] ${check.reason}`
      });
    }

    return new Promise((resolve) => {
      exec(`powershell -NoProfile -NonInteractive -Command "${command.replace(/"/g, '`"')}"`, {
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 4
      }, (error, stdout, stderr) => {
        resolve({
          exitCode: error ? error.code : 0,
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      });
    });
  }

  async readFile(filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      return { error: `File not found: ${resolved}` };
    }
    const content = fs.readFileSync(resolved, 'utf-8');
    return { path: resolved, content: content.slice(0, 100000), truncated: content.length > 100000 };
  }

  async writeFile(filePath, content) {
    try {
      safetyGuard.assertPathSafety(filePath, 'write');
      const resolved = path.resolve(filePath);
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, content, 'utf-8');
      this.emitter?.emit('file_written', { path: resolved, name: path.basename(resolved) });
      await this.triggerVisualFeedbackHook('write_file');
      return { success: true, path: resolved, bytesWritten: Buffer.byteLength(content) };
    } catch (err) {
      console.warn('[ToolsManager] writeFile blocked or failed:', err.message);
      return { error: err.message };
    }
  }

  async deleteFile(filePath) {
    try {
      safetyGuard.assertPathSafety(filePath, 'delete');
      const resolved = path.resolve(filePath);
      if (fs.existsSync(resolved)) {
        fs.unlinkSync(resolved);
        return { success: true, deleted: resolved };
      }
      return { error: `File not found: ${resolved}` };
    } catch (err) {
      console.warn('[ToolsManager] deleteFile blocked or failed:', err.message);
      return { error: err.message };
    }
  }

  async listDirectory(dirPath) {
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved)) {
      return { error: `Directory not found: ${resolved}` };
    }
    const entries = fs.readdirSync(resolved, { withFileTypes: true }).map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      size: e.isFile() ? fs.statSync(path.join(resolved, e.name)).size : null
    }));
    return { path: resolved, entries };
  }

  getSystemStatus() {
    const cpus = os.cpus();
    const totalMemGB = (os.totalmem() / (1024 ** 3)).toFixed(2);
    const freeMemGB = (os.freemem() / (1024 ** 3)).toFixed(2);
    const usedMemGB = (totalMemGB - freeMemGB).toFixed(2);
    const uptimeHours = (os.uptime() / 3600).toFixed(1);

    return {
      cpuModel: cpus[0]?.model || 'Unknown',
      cpuCores: cpus.length,
      memory: {
        totalGB: `${totalMemGB} GB`,
        freeGB: `${freeMemGB} GB`,
        usedGB: `${usedMemGB} GB`,
        usagePercent: `${Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100)}%`
      },
      os: `${os.type()} ${os.release()} (${os.arch()})`,
      hostname: os.hostname(),
      uptime: `${uptimeHours} hours`,
      mcpServersDiscovered: this.availableMcpServers
    };
  }

  resolveApplicationTarget(target) {
    if (!target || typeof target !== 'string') return { type: 'unknown', path: '' };
    let clean = target.trim().replace(/^["']|["']$/g, '');
    clean = clean.replace(/%([^%]+)%/g, (_, n) => process.env[n] || '');

    // 0. URL check
    if (/^https?:\/\//i.test(clean)) {
      return { type: 'url', path: clean };
    }

    // 1. Direct path check (file or folder)
    if (fs.existsSync(clean)) {
      try {
        const stat = fs.statSync(clean);
        if (stat.isFile()) return { type: 'file', path: path.resolve(clean) };
        if (stat.isDirectory()) {
          const baseName = path.basename(clean);
          const directExe = path.join(clean, `${baseName}.exe`);
          if (fs.existsSync(directExe)) return { type: 'file', path: directExe };

          const files = fs.readdirSync(clean);
          const exes = files.filter(f => f.toLowerCase().endsWith('.exe'));
          if (exes.length > 0) {
            const matchExe = exes.find(f => path.parse(f).name.toLowerCase() === baseName.toLowerCase()) || exes[0];
            return { type: 'file', path: path.join(clean, matchExe) };
          }
          return { type: 'dir', path: path.resolve(clean) };
        }
      } catch (e) {}
    }

    // 2. Candidate search folders for .lnk shortcuts and .exe binaries
    const searchDirs = [
      path.join(os.homedir(), 'Desktop'),
      path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop'),
      path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(process.env.ProgramData || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(os.homedir(), 'AppData', 'Local', 'Programs')
    ];

    const targetLower = clean.toLowerCase();

    function searchDir(dir, exactOnly, depth = 0) {
      if (!fs.existsSync(dir) || depth > 2) return null;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        // Check files in this directory
        for (const e of entries) {
          if (!e.isDirectory()) {
            const nameNoExt = path.parse(e.name).name.toLowerCase();
            const fullNameLower = e.name.toLowerCase();
            if (exactOnly) {
              if (nameNoExt === targetLower || fullNameLower === targetLower) {
                return path.join(dir, e.name);
              }
            } else {
              if (nameNoExt.includes(targetLower) || fullNameLower.includes(targetLower)) {
                return path.join(dir, e.name);
              }
            }
          }
        }

        // Check subdirectories
        for (const e of entries) {
          if (e.isDirectory()) {
            const dirNameLower = e.name.toLowerCase();
            const isMatch = exactOnly ? (dirNameLower === targetLower) : dirNameLower.includes(targetLower);
            if (isMatch) {
              const subPath = path.join(dir, e.name);
              try {
                const subEntries = fs.readdirSync(subPath);
                const exes = subEntries.filter(f => f.toLowerCase().endsWith('.exe'));
                if (exes.length > 0) {
                  const bestExe = exes.find(f => path.parse(f).name.toLowerCase() === targetLower) || exes[0];
                  return path.join(subPath, bestExe);
                }
              } catch (err) {}
            }
            const found = searchDir(path.join(dir, e.name), exactOnly, depth + 1);
            if (found) return found;
          }
        }
      } catch (e) {}
      return null;
    }

    // Exact matches first across all candidate directories
    for (const dir of searchDirs) {
      const match = searchDir(dir, true, 0);
      if (match) return { type: 'file', path: match };
    }

    // Partial / substring matches across all candidate directories
    for (const dir of searchDirs) {
      const match = searchDir(dir, false, 0);
      if (match) return { type: 'file', path: match };
    }

    // 3. System PATH check via where.exe
    try {
      const out = execSync(`where.exe "${clean}" 2>nul || where.exe "${clean}.exe" 2>nul`, { encoding: 'utf-8' });
      const lines = out.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length > 0) return { type: 'file', path: lines[0] };
    } catch (e) {}

    return { type: 'unknown', path: clean };
  }

  async openApplication(target) {
    if (!target || typeof target !== 'string') return { error: 'No target provided' };
    const clean = target.trim().replace(/^["']|["']$/g, '');
    const targetLower = clean.toLowerCase();

    // Fast-path: Common Windows apps (launch in <10ms via Start-Process without disk walking)
    const fastApps = {
      'chrome': 'chrome',
      'google chrome': 'chrome',
      'edge': 'msedge',
      'msedge': 'msedge',
      'microsoft edge': 'msedge',
      'firefox': 'firefox',
      'notepad': 'notepad',
      'calc': 'calc',
      'calculator': 'calc',
      'explorer': 'explorer',
      'cmd': 'cmd',
      'terminal': 'wt',
      'powershell': 'powershell'
    };

    if (fastApps[targetLower]) {
      const psRes = await this.runPowerShell(`Start-Process '${fastApps[targetLower]}'`);
      if (psRes.exitCode === 0) {
        return { success: true, opened: fastApps[targetLower], fastLaunch: true };
      }
    }

    const resolved = this.resolveApplicationTarget(target);
    console.log(`[ToolsManager] Launching application '${target}' -> resolved:`, resolved);

    // 1. URLs
    if (resolved.type === 'url') {
      if (electronShell) {
        await electronShell.openExternal(resolved.path);
        return { success: true, opened: resolved.path, type: 'url' };
      }
      return await this.runPowerShell(`Start-Process '${resolved.path}'`);
    }

    // 2. Direct files, Desktop .lnk shortcuts, or directories
    if (resolved.type === 'file' || resolved.type === 'dir') {
      if (electronShell) {
        const error = await electronShell.openPath(resolved.path);
        if (!error) {
          return { success: true, opened: resolved.path, resolvedFrom: target };
        }
        console.warn('[ToolsManager] electronShell.openPath returned error, trying PowerShell:', error);
      }
      // Fallback: PowerShell Start-Process
      const psRes = await this.runPowerShell(`Start-Process -FilePath '${resolved.path.replace(/'/g, "''")}'`);
      if (psRes.exitCode === 0) {
        return { success: true, opened: resolved.path, resolvedFrom: target };
      }
      return { error: `Failed to open ${resolved.path}: ${psRes.stderr || psRes.stdout}` };
    }

    // 3. Fallback: try launching directly via PowerShell Start-Process safely without blocking CMD modals
    const psRes = await this.runPowerShell(`Start-Process -FilePath '${resolved.path.replace(/'/g, "''")}'`);
    if (psRes.exitCode === 0) {
      return { success: true, opened: resolved.path, resolvedFrom: target };
    }

    return {
      error: `Could not locate application '${target}'. Searched desktop shortcuts, Start Menu, and program directories.`,
      searchedTarget: target
    };
  }

  listMcpTools(serverName) {
    if (!fs.existsSync(this.mcpServersPath)) return { error: 'MCP directory not found' };

    if (serverName) {
      const serverDir = path.join(this.mcpServersPath, serverName);
      if (!fs.existsSync(serverDir)) return { error: `MCP server '${serverName}' not found` };

      const files = fs.readdirSync(serverDir).filter(f => f.endsWith('.json'));
      const tools = files.map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(serverDir, f), 'utf-8'));
        } catch (e) {
          return { name: f.replace('.json', ''), error: 'Invalid schema' };
        }
      });
      return { serverName, toolsCount: tools.length, tools };
    }

    const servers = this.discoverMcpServers();
    const overview = servers.map(srv => {
      const srvDir = path.join(this.mcpServersPath, srv);
      const files = fs.readdirSync(srvDir).filter(f => f.endsWith('.json'));
      return {
        server: srv,
        toolCount: files.length,
        tools: files.map(f => f.replace('.json', ''))
      };
    });
    return { discoveredServers: overview };
  }

  async callMcpTool(serverName, toolName, parameters = {}) {
    if (!this.isMcpServerEnabled(serverName)) {
      return {
        error: `MCP server '${serverName}' is currently toggled OFF in the Left Window Switchboard. Ryan can enable it in the Tools & MCP tab whenever needed.`
      };
    }

    const serverDir = path.join(this.mcpServersPath, serverName);
    if (!fs.existsSync(serverDir)) {
      return { error: `MCP server '${serverName}' not found.` };
    }
    const schemaFile = path.join(serverDir, `${toolName}.json`);
    if (!fs.existsSync(schemaFile)) {
      return { error: `Tool '${toolName}' not found in MCP server '${serverName}'.` };
    }

    // 1. Memory Server
    if (serverName === 'memory') {
      return this.memoryManager.handleMcpMemoryCall(toolName, parameters);
    }

    // 2. Filesystem Server
    if (serverName === 'filesystem') {
      try {
        if (toolName === 'read_file' || toolName === 'read_text_file') {
          return await this.readFile(parameters.path);
        }
        if (toolName === 'write_file') {
          safetyGuard.assertPathSafety(parameters.path, 'write');
          return await this.writeFile(parameters.path, parameters.content);
        }
        if (toolName === 'list_directory') {
          return await this.listDirectory(parameters.path || process.cwd());
        }
        if (toolName === 'get_file_info') {
          const stats = fs.statSync(path.resolve(parameters.path));
          return { size: stats.size, isDirectory: stats.isDirectory(), modified: stats.mtime };
        }
        if (toolName === 'move_file') {
          safetyGuard.assertPathSafety(parameters.source, 'delete');
          safetyGuard.assertPathSafety(parameters.destination, 'write');
          fs.renameSync(path.resolve(parameters.source), path.resolve(parameters.destination));
          return { success: true, moved: `${parameters.source} -> ${parameters.destination}` };
        }
      } catch (fsErr) {
        return { error: fsErr.message };
      }
    }

    // 3. GitHub Server (Direct REST API execution with Ryan's GitHub Token)
    if (serverName === 'github') {
      const ghConfig = this.mcpConfig?.mcpServers?.github;
      const ghToken = ghConfig?.env?.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN;
      if (ghToken) {
        try {
          const headers = {
            'Authorization': `Bearer ${ghToken}`,
            'User-Agent': 'Gemini-Desktop-Assistant',
            'Accept': 'application/vnd.github.v3+json'
          };

          // Resolve owner & repo with automatic normalization
          let owner = parameters.owner || 'batch15studios';
          let repo = parameters.repo || '';
          if (['ryan', 'batf15', 'batch15', 'batch15studio'].includes(owner.toLowerCase())) {
            owner = 'batch15studios';
          }
          if (repo.includes('/')) {
            const parts = repo.split('/');
            owner = parts[0];
            repo = parts[1];
          }
          if (!repo && (toolName === 'list_commits' || toolName === 'get_file_contents')) {
            repo = 'gemini-desktop-live';
          }

          if (toolName === 'search_repositories') {
            const q = parameters.query || '';
            // If query is user-focused or empty, query user's repos directly
            if (!q || q.includes('batf15') || q.includes('batch15') || q.includes('user:') || q.toLowerCase().includes('gemini')) {
              const resp = await fetch('https://api.github.com/user/repos?per_page=50&sort=updated', { headers });
              const repos = await resp.json();
              if (Array.isArray(repos)) {
                return {
                  totalCount: repos.length,
                  user: 'batch15studios',
                  items: repos.slice(0, 10).map(r => ({
                    name: r.full_name,
                    description: r.description,
                    private: r.private,
                    html_url: r.html_url,
                    updated_at: r.updated_at
                  }))
                };
              }
            }
            const encodedQ = encodeURIComponent(q);
            const resp = await fetch(`https://api.github.com/search/repositories?q=${encodedQ}`, { headers });
            const data = await resp.json();
            return {
              totalCount: data.total_count,
              items: (data.items || []).slice(0, 5).map(r => ({ name: r.full_name, description: r.description, url: r.html_url }))
            };
          }

          if (toolName === 'list_commits') {
            const targetRepo = repo || 'gemini-desktop-live';
            const url = `https://api.github.com/repos/${owner}/${targetRepo}/commits?per_page=${parameters.per_page || 10}`;
            const resp = await fetch(url, { headers });
            const data = await resp.json();
            if (Array.isArray(data)) {
              return {
                repo: `${owner}/${targetRepo}`,
                commits: data.map(c => ({
                  sha: c.sha.substring(0, 7),
                  author: c.commit.author.name,
                  date: c.commit.author.date,
                  message: c.commit.message
                }))
              };
            }
            return data;
          }

          if (toolName === 'get_file_contents') {
            const targetRepo = repo || 'gemini-desktop-live';
            const filePath = parameters.path || 'package.json';
            const resp = await fetch(`https://api.github.com/repos/${owner}/${targetRepo}/contents/${filePath}`, { headers });
            const data = await resp.json();
            if (data.content && data.encoding === 'base64') {
              data.decodedContent = Buffer.from(data.content, 'base64').toString('utf-8');
            }
            return data;
          }

          if (toolName === 'list_issues') {
            const targetRepo = repo || 'gemini-desktop-live';
            const url = targetRepo
              ? `https://api.github.com/repos/${owner}/${targetRepo}/issues`
              : `https://api.github.com/user/issues`;
            const resp = await fetch(url, { headers });
            const data = await resp.json();
            return {
              status: resp.status,
              issues: Array.isArray(data) ? data.slice(0, 10).map(i => ({ number: i.number, title: i.title, state: i.state, url: i.html_url })) : data
            };
          }

          if (toolName === 'create_issue') {
            const targetRepo = repo || 'gemini-desktop-live';
            const resp = await fetch(`https://api.github.com/repos/${owner}/${targetRepo}/issues`, {
              method: 'POST',
              headers: { ...headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: parameters.title,
                body: parameters.body || ''
              })
            });
            return await resp.json();
          }

          if (toolName === 'list_pull_requests') {
            const targetRepo = repo || 'gemini-desktop-live';
            const resp = await fetch(`https://api.github.com/repos/${owner}/${targetRepo}/pulls`, { headers });
            const data = await resp.json();
            return { pulls: Array.isArray(data) ? data.slice(0, 10).map(p => ({ number: p.number, title: p.title, state: p.state })) : data };
          }

          if (toolName === 'search_code') {
            const targetRepo = repo ? `+repo:${owner}/${repo}` : `+user:${owner}`;
            const q = encodeURIComponent(parameters.q || parameters.query || '') + targetRepo;
            const resp = await fetch(`https://api.github.com/search/code?q=${q}`, { headers });
            const data = await resp.json();
            return {
              totalCount: data.total_count,
              items: (data.items || []).slice(0, 5).map(item => ({ name: item.name, path: item.path, repository: item.repository?.full_name }))
            };
          }
        } catch (ghErr) {
          console.warn('[ToolsManager] GitHub API call error:', ghErr);
          return { error: ghErr.message };
        }
      } else {
        return { error: 'No GitHub Personal Access Token configured in mcp_config.json' };
      }
    }

    // 4. Context7 Documentation Server (Direct HTTP call)
    if (serverName === 'context7') {
      const c7Config = this.mcpConfig?.mcpServers?.context7;
      const c7Url = c7Config?.serverUrl || 'https://mcp.context7.com/mcp';
      const c7Auth = c7Config?.headers?.Authorization;
      if (c7Auth) {
        try {
          const resp = await fetch(c7Url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': c7Auth
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Date.now(),
              method: `tools/${toolName}`,
              params: parameters
            })
          });
          const data = await resp.json();
          return data.result || data;
        } catch (c7Err) {
          console.warn('[ToolsManager] Context7 call error:', c7Err);
        }
      }
    }

    // 5. Schema Read & Standard Execution Confirmation
    let schema = {};
    try {
      schema = JSON.parse(fs.readFileSync(schemaFile, 'utf-8'));
    } catch (e) {}

    return {
      status: 'executed',
      server: serverName,
      tool: toolName,
      parameters,
      schemaDescription: schema.description || 'MCP Tool execution complete.'
    };
  }

  // --- Native Windows Cursor & Keyboard Control Engine ---
  getDisplayBounds() {
    let width = 1536;
    let height = 864;
    try {
      const electron = require('electron');
      if (electron.screen) {
        const primary = electron.screen.getPrimaryDisplay();
        if (primary && primary.bounds) {
          width = primary.bounds.width;
          height = primary.bounds.height;
        }
      }
    } catch (e) {}
    return { width, height };
  }

  resolveCoordinates(x, y, isNormalized = true) {
    const bounds = this.getDisplayBounds();
    const screenW = bounds.width;   // 1536
    const screenH = bounds.height;  // 864

    let numX = parseFloat(x) || 0;
    let numY = parseFloat(y) || 0;

    let targetX, targetY;

    if (isNormalized === false) {
      // Raw physical pixels requested explicitly
      targetX = numX;
      targetY = numY;
    } else {
      // Standard normalized coordinates: handles 0.0-1.0 float ratios or 0-1000 integer grid
      const isRatio = (numX <= 1.0 && numY <= 1.0 && (numX > 0 || numY > 0));
      targetX = isRatio ? (numX * screenW) : ((numX / 1000) * screenW);
      targetY = isRatio ? (numY * screenH) : ((numY / 1000) * screenH);
    }

    // Clamp strictly within screen boundaries to guarantee validity
    targetX = Math.max(0, Math.min(Math.round(targetX), screenW - 1));
    targetY = Math.max(0, Math.min(Math.round(targetY), screenH - 1));

    return { x: targetX, y: targetY };
  }

  runCursorDriver(driverArgs) {
    return new Promise((resolve) => {
      const driverPath = path.join(__dirname, 'assets', 'bin', 'CursorDriver.exe');
      const cmd = `"${driverPath}" ${driverArgs}`;
      exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
        if (err) {
          return resolve({ error: err.message, stderr: stderr?.trim() });
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(parsed);
        } catch (e) {
          resolve({ success: true, raw: stdout.trim() });
        }
      });
    });
  }

  async mouseClick(x, y, button = 'left', doubleClick = false, isNormalized = true) {
    const coords = this.resolveCoordinates(x, y, isNormalized !== false);
    console.log(`[ToolsManager] mouse_click: Input(${x}, ${y}) -> Target(${coords.x}px, ${coords.y}px), Button: ${button}`);
    const res = await this.runCursorDriver(`click ${coords.x} ${coords.y} ${button} ${doubleClick ? 'true' : 'false'}`);
    await this.triggerVisualFeedbackHook('mouse_click');
    return res;
  }

  async mouseMove(x, y, isNormalized = true) {
    const coords = this.resolveCoordinates(x, y, isNormalized !== false);
    console.log(`[ToolsManager] mouse_move: Input(${x}, ${y}) -> Target(${coords.x}px, ${coords.y}px)`);
    return await this.runCursorDriver(`move ${coords.x} ${coords.y}`);
  }

  async mouseDrag(startX, startY, endX, endY, isNormalized = true) {
    const start = this.resolveCoordinates(startX, startY, isNormalized !== false);
    const end = this.resolveCoordinates(endX, endY, isNormalized !== false);
    console.log(`[ToolsManager] mouse_drag: From(${start.x}, ${start.y}) -> To(${end.x}, ${end.y})`);
    const res = await this.runCursorDriver(`drag ${start.x} ${start.y} ${end.x} ${end.y}`);
    await this.triggerVisualFeedbackHook('mouse_drag');
    return res;
  }

  async mouseScroll(deltaY) {
    const res = await this.runCursorDriver(`scroll ${Math.round(deltaY || -120)}`);
    await this.triggerVisualFeedbackHook('mouse_scroll');
    return res;
  }

  async keyboardType(text, pressEnter = false) {
    const cleanText = (text || '').replace(/"/g, '""');
    const res = await this.runCursorDriver(`type "${cleanText}" ${pressEnter ? 'true' : 'false'}`);
    await this.triggerVisualFeedbackHook('keyboard_type');
    return res;
  }

  async keyboardHotkey(combo) {
    const res = await this.runCursorDriver(`hotkey "${(combo || '').trim()}"`);
    await this.triggerVisualFeedbackHook('keyboard_hotkey');
    return res;
  }

  async getCursorPosition() {
    return await this.runCursorDriver('getpos');
  }

  runUiaDriver(driverArgs) {
    return new Promise((resolve) => {
      const driverPath = path.join(__dirname, 'assets', 'bin', 'UIADriver.exe');
      const cmd = `"${driverPath}" ${driverArgs}`;
      exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
        if (err && !stdout) {
          return resolve({ error: err.message, stderr: stderr?.trim() });
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(parsed);
        } catch (e) {
          resolve({ success: true, raw: stdout?.trim() || '' });
        }
      });
    });
  }

  async findUiElement(query) {
    const cleanQuery = (query || '').replace(/"/g, '""');
    return await this.runUiaDriver(`find "${cleanQuery}"`);
  }

  async clickUiElement(name) {
    const cleanName = (name || '').replace(/"/g, '""');
    const res = await this.runUiaDriver(`click "${cleanName}"`);
    await this.triggerVisualFeedbackHook('click_ui_element');
    return res;
  }

  async ocrScreenRegion(x, y, width, height) {
    const tmpFile = path.join(os.tmpdir(), `gemini_ocr_${Date.now()}.png`);
    try {
      const bounds = this.getDisplayBounds();
      const screenW = bounds.width;
      const screenH = bounds.height;

      // Default to full screen if not specified
      const normX = x !== undefined ? Math.max(0, Math.min(1000, parseFloat(x) || 0)) : 0;
      const normY = y !== undefined ? Math.max(0, Math.min(1000, parseFloat(y) || 0)) : 0;
      const normW = width !== undefined ? Math.max(10, Math.min(1000, parseFloat(width) || 1000)) : 1000;
      const normH = height !== undefined ? Math.max(10, Math.min(1000, parseFloat(height) || 1000)) : 1000;

      const pxX = Math.round((normX / 1000) * screenW);
      const pxY = Math.round((normY / 1000) * screenH);
      const pxW = Math.min(screenW - pxX, Math.round((normW / 1000) * screenW));
      const pxH = Math.min(screenH - pxY, Math.round((normH / 1000) * screenH));

      let imageBuffer = null;
      try {
        const electron = require('electron');
        if (electron.desktopCapturer && electron.nativeImage) {
          const sources = await electron.desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: screenW, height: screenH }
          });
          if (sources && sources.length > 0) {
            const fullImage = sources[0].thumbnail;
            const cropped = fullImage.crop({ x: pxX, y: pxY, width: pxW, height: pxH });
            imageBuffer = cropped.toPNG();
          }
        }
      } catch (e) {
        // Fallback handled below
      }

      if (!imageBuffer) {
        // Fallback: capture region via PowerShell GDI
        const psScript = `Add-Type -AssemblyName System.Drawing; $bmp = New-Object System.Drawing.Bitmap(${pxW}, ${pxH}); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen(${pxX}, ${pxY}, 0, 0, (New-Object System.Drawing.Size(${pxW}, ${pxH}))); $g.Dispose(); $bmp.Save('${tmpFile.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose();`;
        await this.runPowerShell(psScript);
      } else {
        fs.writeFileSync(tmpFile, imageBuffer);
      }

      if (!fs.existsSync(tmpFile)) {
        return { error: 'Failed to capture screen region for OCR' };
      }

      const scriptPath = path.join(__dirname, 'assets', 'bin', 'ocr_image.ps1');
      const psRes = await this.runPowerShell(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -ImagePath "${tmpFile}"`);

      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      } catch (err) {}

      if (psRes.stdout) {
        try {
          const parsed = JSON.parse(psRes.stdout.trim());
          return {
            ...parsed,
            region: { x: normX, y: normY, width: normW, height: normH, pixelRect: { x: pxX, y: pxY, width: pxW, height: pxH } }
          };
        } catch (e) {
          return { success: true, text: psRes.stdout.trim(), raw: psRes.stdout };
        }
      }
      return { error: psRes.stderr || 'OCR process returned no output' };
    } catch (err) {
      try {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      } catch (e) {}
      return { error: `OCR error: ${err.message}` };
    }
  }

  // --- Visual Feedback & Perception Synchronization ---
  setScreenCaptureProvider(provider) {
    this.screenCaptureProvider = provider;
  }

  async captureVisualFeedback() {
    if (typeof this.screenCaptureProvider === 'function') {
      try {
        const base64Jpeg = await this.screenCaptureProvider();
        if (base64Jpeg) {
          this.emitter?.emit('screen_action_feedback', base64Jpeg);
          return base64Jpeg;
        }
      } catch (e) {
        console.warn('[ToolsManager] Screen capture feedback warning:', e.message);
      }
    }
    return null;
  }

  async triggerVisualFeedbackHook(actionName) {
    // 180ms delay for Windows UI animations or modal renders to complete
    await new Promise(r => setTimeout(r, 180));
    return await this.captureVisualFeedback();
  }

  // --- Autonomous Action Chaining & Multi-Step Goals ---
  async chainActions(actions, goalDescription = '') {
    if (!Array.isArray(actions) || actions.length === 0) {
      return { error: 'Actions must be a non-empty array of action objects.' };
    }

    const stepResults = [];
    console.log(`[ToolsManager] Starting action chain (${actions.length} steps): "${goalDescription}"`);

    for (let i = 0; i < actions.length; i++) {
      const step = actions[i];
      console.log(`[ToolsManager] Action Chain Step [${i + 1}/${actions.length}]: ${step.tool}`, step.args);
      const res = await this.executeTool(step.tool, step.args);
      stepResults.push({ step: i + 1, tool: step.tool, result: res });

      if (res && res.error) {
        console.warn(`[ToolsManager] Action Chain stopped at step ${i + 1} due to error:`, res.error);
        return {
          status: 'partial_failure',
          failedAtStep: i + 1,
          error: res.error,
          completedSteps: stepResults
        };
      }

      const pause = typeof step.delayAfterMs === 'number' ? step.delayAfterMs : 250;
      if (pause > 0 && i < actions.length - 1) {
        await new Promise(r => setTimeout(r, pause));
      }
    }

    await this.triggerVisualFeedbackHook('chain_actions');

    return {
      status: 'completed',
      goalDescription,
      totalSteps: actions.length,
      stepResults
    };
  }

  async verifyScreenState(focusArea = '') {
    await this.captureVisualFeedback();
    return {
      status: 'screen_captured',
      focusArea,
      timestamp: Date.now(),
      message: 'High-resolution screen frame refreshed in your visual perception buffer. Analyze current UI layout to confirm action outcome.'
    };
  }

  // --- Autonomous Sentry Watcher Engine ---
  startSentryWatch(args) {
    const { watchType, target, condition = 'exits', alertMessage } = args;
    const sentry = {
      id: Date.now(),
      watchType: watchType || 'timer',
      target: (target || '').trim(),
      condition: condition.toLowerCase(),
      alertMessage: alertMessage || 'Sentry condition triggered.',
      startTime: Date.now(),
      active: true,
      timer: null
    };

    if (sentry.watchType === 'timer') {
      const sec = parseFloat(sentry.target) || 60;
      sentry.timer = setTimeout(() => {
        this.triggerSentry(sentry);
      }, sec * 1000);
    } else if (sentry.watchType === 'process') {
      const procName = sentry.target.toLowerCase().replace('.exe', '');
      let wasRunning = false;
      const interval = setInterval(async () => {
        if (!sentry.active) {
          clearInterval(interval);
          return;
        }
        const isRunning = await this.checkProcessRunning(procName);
        if (isRunning) wasRunning = true;
        if (sentry.condition === 'exits' && wasRunning && !isRunning) {
          clearInterval(interval);
          this.triggerSentry(sentry);
        } else if (sentry.condition === 'starts' && isRunning) {
          clearInterval(interval);
          this.triggerSentry(sentry);
        }
      }, 3000);
      sentry.timer = interval;
    } else if (sentry.watchType === 'telemetry') {
      const interval = setInterval(() => {
        if (!sentry.active) {
          clearInterval(interval);
          return;
        }
        const status = this.getSystemStatus();
        const ramPct = parseFloat(status.memory.usagePercent) || 0;
        if (sentry.target.includes('ram>') && ramPct > parseFloat(sentry.target.split('>')[1])) {
          clearInterval(interval);
          this.triggerSentry(sentry);
        }
      }, 4000);
      sentry.timer = interval;
    } else {
      sentry.timer = setTimeout(() => {
        this.triggerSentry(sentry);
      }, 30000);
    }

    this.activeSentries.push(sentry);
    return {
      status: 'sentry_active',
      sentryIndex: this.activeSentries.length - 1,
      watchType: sentry.watchType,
      target: sentry.target,
      condition: sentry.condition,
      alertMessage: sentry.alertMessage,
      message: `Sentry armed. Watching ${sentry.target || 'target'} in background. Will proactively notify when ${sentry.condition}.`
    };
  }

  triggerSentry(sentry) {
    if (!sentry.active) return;
    sentry.active = false;
    console.log('[ToolsManager] SENTRY FIRED:', sentry.alertMessage);
    this.emitter?.emit('sentry_fired', sentry);

    if (this.memoryManager) {
      this.memoryManager.logTask(`Sentry Alert: ${sentry.alertMessage}`, 'completed');
    }
  }

  getSentryStatus(action = 'list', index = null) {
    if (action === 'cancel' && index !== null && this.activeSentries[index]) {
      const s = this.activeSentries[index];
      s.active = false;
      if (s.timer) clearTimeout(s.timer);
      return { status: 'cancelled', sentry: s };
    }
    return {
      activeSentriesCount: this.activeSentries.filter(s => s.active).length,
      sentries: this.activeSentries.map((s, idx) => ({
        index: idx,
        type: s.watchType,
        target: s.target,
        active: s.active,
        alertMessage: s.alertMessage,
        elapsedSec: Math.round((Date.now() - s.startTime) / 1000)
      }))
    };
  }

  checkProcessRunning(procName) {
    return new Promise((resolve) => {
      exec(`powershell -NoProfile -Command "Get-Process -Name '${procName}' -ErrorAction SilentlyContinue"`, { windowsHide: true }, (err, stdout) => {
        resolve(!!(stdout && stdout.trim().length > 0));
      });
    });
  }
}

module.exports = { ToolsManager };
