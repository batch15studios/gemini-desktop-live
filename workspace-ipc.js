/**
 * workspace-ipc.js
 * Backend IPC Handlers for GEMINI // WORKSPACE DECK (4th Window Integration)
 */

const { ipcMain, screen, app } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { exec } = require('child_process');

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(date) {
  const now = new Date();
  const d = new Date(date);
  const isToday = now.toDateString() === d.toDateString();
  const hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const formattedHours = hours % 12 || 12;
  const timeStr = `${formattedHours}:${minutes} ${ampm}`;

  if (isToday) return `Today, ${timeStr}`;

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (yesterday.toDateString() === d.toDateString()) return `Yesterday, ${timeStr}`;

  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${timeStr}`;
}

function getFileType(fileName, isDir) {
  if (isDir) return 'Folder';
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.html':
    case '.htm':
      return 'HTML Document';
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'JavaScript File';
    case '.ts':
      return 'TypeScript File';
    case '.css':
      return 'CSS Stylesheet';
    case '.json':
      return 'JSON Document';
    case '.md':
      return 'Markdown Document';
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.gif':
    case '.svg':
    case '.webp':
      return 'Image File';
    case '.mp3':
    case '.wav':
    case '.ogg':
      return 'Audio File';
    case '.exe':
      return 'Executable Application';
    case '.bat':
    case '.cmd':
    case '.ps1':
      return 'Script File';
    case '.cs':
      return 'C# Source File';
    default:
      return `${ext ? ext.slice(1).toUpperCase() : 'Plain'} File`;
  }
}

let devServer = null;
let devServerPort = 4242;

function startDevServer(rootDir) {
  if (devServer) return;
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.wasm': 'application/wasm'
  };

  devServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      let reqPath = decodeURI((req.url || '').split('?')[0]);
      if (reqPath === '/' || reqPath === '') reqPath = '/preview.html';
      const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(rootDir, safePath);

      if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }

      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        const indexHtml = path.join(filePath, 'index.html');
        if (fs.existsSync(indexHtml)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(indexHtml).pipe(res);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Directory Index Not Found');
        }
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`500 Server Error: ${err.message}`);
    }
  });

  const tryListen = (port) => {
    devServerPort = port;
    devServer.listen(port, '127.0.0.1', () => {
      console.log(`[Workspace DevServer] Live reload server listening at http://127.0.0.1:${port}`);
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE' && port < 4260) {
        tryListen(port + 1);
      } else {
        console.warn('[Workspace DevServer] Error:', err.message);
      }
    });
  };

  tryListen(devServerPort);
}

function registerWorkspaceIpc(assistantApp) {
  const rootDir = path.resolve(__dirname);
  startDevServer(rootDir);

  if (!ipcMain) {
    console.log('[Workspace IPC] Running in non-electron environment; skipping IPC listener registration.');
    return;
  }

  // 1. Window Controls (HUD Style)
  ipcMain.on('workspace:minimize-restore', () => {
    const win = assistantApp.workspaceWindow;
    if (!win || win.isDestroyed()) return;
    win.minimize();
  });

  ipcMain.on('workspace:maximize-toggle', () => {
    const win = assistantApp.workspaceWindow;
    if (!win || win.isDestroyed()) return;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.on('workspace:close', () => {
    const win = assistantApp.workspaceWindow;
    if (win && !win.isDestroyed()) {
      win.hide();
      win.webContents.send('workspace:unloaded');
    }
  });

  ipcMain.handle('workspace:get-window-state', () => {
    const win = assistantApp.workspaceWindow;
    if (!win || win.isDestroyed()) return { isMaximized: false, isVisible: false };
    return {
      isMaximized: win.isMaximized(),
      isVisible: win.isVisible()
    };
  });

  // 2. Directory Navigation
  ipcMain.handle('workspace:get-default-path', () => {
    return rootDir;
  });

  ipcMain.handle('workspace:read-dir', async (e, requestedPath) => {
    try {
      const targetDir = requestedPath ? path.resolve(requestedPath) : rootDir;
      if (!fs.existsSync(targetDir)) {
        return { success: false, error: 'Directory does not exist' };
      }

      const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
      const items = [];

      for (const entry of entries) {
        // Exclude system and large build folders
        if (entry.name === 'node_modules' || entry.name === '.git') continue;

        const fullPath = path.join(targetDir, entry.name);
        try {
          const stats = await fs.promises.stat(fullPath);
          const isDir = entry.isDirectory();
          items.push({
            name: entry.name,
            path: fullPath,
            isDirectory: isDir,
            size: isDir ? '--' : formatFileSize(stats.size),
            rawSize: stats.size,
            dateModified: formatDate(stats.mtime),
            rawDate: stats.mtimeMs,
            type: getFileType(entry.name, isDir)
          });
        } catch (statErr) {
          // Skip inaccessible entries
        }
      }

      // Sort: Folders first, then alphabetically
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

      return {
        success: true,
        currentDir: targetDir,
        parentDir: path.dirname(targetDir),
        items
      };
    } catch (err) {
      console.error('[Workspace IPC] Error reading directory:', err);
      return { success: false, error: err.message };
    }
  });

  // 3. File I/O
  ipcMain.handle('workspace:read-file', async (e, filePath) => {
    try {
      if (!filePath) return { success: false, error: 'No file path provided' };
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) {
        return { success: false, error: 'File does not exist' };
      }

      const content = await fs.promises.readFile(resolved, 'utf-8');
      return {
        success: true,
        path: resolved,
        name: path.basename(resolved),
        ext: path.extname(resolved).toLowerCase(),
        content
      };
    } catch (err) {
      console.error('[Workspace IPC] Error reading file:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('workspace:write-file', async (e, { filePath, content }) => {
    try {
      if (!filePath) return { success: false, error: 'No file path provided' };
      const resolved = path.resolve(filePath);
      await fs.promises.writeFile(resolved, content, 'utf-8');
      if (assistantApp.workspaceWindow && !assistantApp.workspaceWindow.isDestroyed()) {
        assistantApp.workspaceWindow.webContents.send('workspace:file-updated', {
          path: resolved,
          name: path.basename(resolved),
          timestamp: Date.now()
        });
      }
      return { success: true, path: resolved, name: path.basename(resolved) };
    } catch (err) {
      console.error('[Workspace IPC] Error writing file:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('workspace:get-server-url', () => {
    return `http://127.0.0.1:${devServerPort}`;
  });

  // 4. Shell Execution
  ipcMain.handle('workspace:exec-cmd', async (e, { command, cwd }) => {
    return new Promise((resolve) => {
      const workingDir = cwd || rootDir;
      exec(command, { cwd: workingDir, maxBuffer: 1024 * 1024 * 2 }, (error, stdout, stderr) => {
        resolve({
          success: !error,
          stdout: stdout || '',
          stderr: stderr || (error ? error.message : ''),
          code: error ? error.code : 0
        });
      });
    });
  });

  // 5. Chat / Gemini Live Integration
  ipcMain.handle('workspace:chat-send', async (e, text) => {
    if (!text || !text.trim()) return { response: '' };
    const query = text.trim();

    // Check if assistant live engine is active
    if (assistantApp.liveEngine && assistantApp.liveEngine.isConnected) {
      assistantApp.liveEngine.sendTextMessage(`[User from Workspace Deck]: ${query}`);
      return { response: `Dispatched to Gemini Live Voice session: "${query}"` };
    }

    // Direct local command execution fallback if starting with '$' or '>'
    if (query.startsWith('$') || query.startsWith('>')) {
      const cmd = query.slice(1).trim();
      return new Promise((resolve) => {
        exec(cmd, { cwd: rootDir }, (err, stdout, stderr) => {
          resolve({ response: stdout || stderr || (err ? err.message : 'Command executed.') });
        });
      });
    }

    return { response: `[Gemini Workspace Hub]: Received "${query}". Live Voice session is in standby mode. Start Gemini in the Control Hub to chat in real-time.` };
  });
}

module.exports = { registerWorkspaceIpc };
