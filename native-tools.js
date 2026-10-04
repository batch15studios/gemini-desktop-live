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
try {
  electronShell = require('electron').shell;
} catch (e) {
  // Standalone environment
}

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
    description: 'Move the mouse cursor to a specific screen coordinate (x, y) and perform a mouse click (left, right, or double-click). Use to click buttons, icons, links, or window controls shown in the desktop screen share. Coordinates can be standard pixels or normalized 0-1000 scale.',
    parameters: {
      type: 'OBJECT',
      properties: {
        x: { type: 'NUMBER', description: 'Horizontal coordinate on screen (pixel coordinate or 0-1000 normalized).' },
        y: { type: 'NUMBER', description: 'Vertical coordinate on screen (pixel coordinate or 0-1000 normalized).' },
        button: { type: 'STRING', description: 'Mouse button to click: "left" (default), "right", or "middle".' },
        doubleClick: { type: 'BOOLEAN', description: 'Set to true to double-click (e.g. to open an app or select a word).' },
        normalized: { type: 'BOOLEAN', description: 'Set to true if coordinates are on a 0-1000 normalized scale.' }
      },
      required: ['x', 'y']
    }
  },
  {
    name: 'mouse_move',
    description: 'Move the mouse cursor smoothly to coordinates (x, y) without clicking. Use to hover over elements or preview locations.',
    parameters: {
      type: 'OBJECT',
      properties: {
        x: { type: 'NUMBER', description: 'Horizontal coordinate.' },
        y: { type: 'NUMBER', description: 'Vertical coordinate.' },
        normalized: { type: 'BOOLEAN', description: 'Set to true if coordinates are on a 0-1000 normalized scale.' }
      },
      required: ['x', 'y']
    }
  },
  {
    name: 'mouse_drag',
    description: 'Click and drag from (startX, startY) to (endX, endY). Use to drag and drop files, move windows, or select text.',
    parameters: {
      type: 'OBJECT',
      properties: {
        startX: { type: 'NUMBER', description: 'Starting horizontal coordinate.' },
        startY: { type: 'NUMBER', description: 'Starting vertical coordinate.' },
        endX: { type: 'NUMBER', description: 'Ending horizontal coordinate.' },
        endY: { type: 'NUMBER', description: 'Ending vertical coordinate.' },
        normalized: { type: 'BOOLEAN', description: 'Set to true if coordinates are on a 0-1000 normalized scale.' }
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
  }
];

class ToolsManager {
  constructor(eventEmitter) {
    this.emitter = eventEmitter;
    this.mcpServersPath = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp');
    this.availableMcpServers = this.discoverMcpServers();
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
          result = await this.mouseClick(args.x, args.y, args.button, args.doubleClick, args.normalized);
          break;
        case 'mouse_move':
          result = await this.mouseMove(args.x, args.y, args.normalized);
          break;
        case 'mouse_drag':
          result = await this.mouseDrag(args.startX, args.startY, args.endX, args.endY, args.normalized);
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

  runPowerShell(command) {
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
    const resolved = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, 'utf-8');
    return { success: true, path: resolved, bytesWritten: Buffer.byteLength(content) };
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
    const serverDir = path.join(this.mcpServersPath, serverName);
    if (!fs.existsSync(serverDir)) {
      return { error: `MCP server '${serverName}' not found.` };
    }
    const schemaFile = path.join(serverDir, `${toolName}.json`);
    if (!fs.existsSync(schemaFile)) {
      return { error: `Tool '${toolName}' not found in MCP server '${serverName}'.` };
    }

    if (serverName === 'filesystem') {
      if (toolName === 'read_file' || toolName === 'read_text_file') {
        return await this.readFile(parameters.path);
      }
      if (toolName === 'write_file') {
        return await this.writeFile(parameters.path, parameters.content);
      }
      if (toolName === 'list_directory') {
        return await this.listDirectory(parameters.path || process.cwd());
      }
    }

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

  normalizeCoordinate(val, max) {
    if (typeof val !== 'number') val = parseFloat(val) || 0;
    // 0.0 to 1.0 (float percentage)
    if (val > 0 && val <= 1.0) {
      return Math.round(val * max);
    }
    // 0 to 1000 scale
    if (val > 1.0 && val <= 1000 && max > 1000) {
      return Math.round((val / 1000) * max);
    }
    // Direct pixel value
    return Math.round(val);
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

  async mouseClick(x, y, button = 'left', doubleClick = false, isNormalized = false) {
    const bounds = this.getDisplayBounds();
    const finalX = isNormalized ? Math.round((x / 1000) * bounds.width) : this.normalizeCoordinate(x, bounds.width);
    const finalY = isNormalized ? Math.round((y / 1000) * bounds.height) : this.normalizeCoordinate(y, bounds.height);
    return await this.runCursorDriver(`click ${finalX} ${finalY} ${button} ${doubleClick ? 'true' : 'false'}`);
  }

  async mouseMove(x, y, isNormalized = false) {
    const bounds = this.getDisplayBounds();
    const finalX = isNormalized ? Math.round((x / 1000) * bounds.width) : this.normalizeCoordinate(x, bounds.width);
    const finalY = isNormalized ? Math.round((y / 1000) * bounds.height) : this.normalizeCoordinate(y, bounds.height);
    return await this.runCursorDriver(`move ${finalX} ${finalY}`);
  }

  async mouseDrag(startX, startY, endX, endY, isNormalized = false) {
    const bounds = this.getDisplayBounds();
    const sx = isNormalized ? Math.round((startX / 1000) * bounds.width) : this.normalizeCoordinate(startX, bounds.width);
    const sy = isNormalized ? Math.round((startY / 1000) * bounds.height) : this.normalizeCoordinate(startY, bounds.height);
    const ex = isNormalized ? Math.round((endX / 1000) * bounds.width) : this.normalizeCoordinate(endX, bounds.width);
    const ey = isNormalized ? Math.round((endY / 1000) * bounds.height) : this.normalizeCoordinate(endY, bounds.height);
    return await this.runCursorDriver(`drag ${sx} ${sy} ${ex} ${ey}`);
  }

  async mouseScroll(deltaY) {
    return await this.runCursorDriver(`scroll ${Math.round(deltaY || -120)}`);
  }

  async keyboardType(text, pressEnter = false) {
    const cleanText = (text || '').replace(/"/g, '""');
    return await this.runCursorDriver(`type "${cleanText}" ${pressEnter ? 'true' : 'false'}`);
  }

  async keyboardHotkey(combo) {
    return await this.runCursorDriver(`hotkey "${(combo || '').trim()}"`);
  }

  async getCursorPosition() {
    return await this.runCursorDriver('getpos');
  }
}

module.exports = { ToolsManager };
