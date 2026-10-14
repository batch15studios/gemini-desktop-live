/**
 * window-tools.js
 * Native Windows Window Management & Media Controls for Assistant_Integrated_Advanced
 */

const { exec, execSync } = require('child_process');
const path = require('path');
const { safetyGuard } = require('./safety-guard.js');

const DRIVER_PATH = path.join(__dirname, 'assets', 'bin', 'CursorDriver.exe');

class WindowTools {
  static async listWindows() {
    return new Promise((resolve) => {
      exec('tasklist /v /fo csv', { windowsHide: true, maxBuffer: 1024 * 1024 * 2 }, (err, stdout) => {
        if (err || !stdout) {
          return resolve({ success: false, windows: [], error: err ? err.message : 'No output' });
        }

        const lines = stdout.split('\r\n').filter(l => l.trim().length > 0);
        if (lines.length <= 1) return resolve({ success: true, windows: [] });

        const windows = [];
        const ignoredTitles = new Set([
          'N/A', '', 'OleMainThreadWndName', 'OLEChannelWnd', 
          'Default IME', 'MSCTFIME UI', 'Program Manager', 'Windows Input Experience'
        ]);

        for (let i = 1; i < lines.length; i++) {
          const row = [];
          let current = '';
          let inQuotes = false;
          const line = lines[i];

          for (let c = 0; c < line.length; c++) {
            const ch = line[c];
            if (ch === '"') {
              inQuotes = !inQuotes;
            } else if (ch === ',' && !inQuotes) {
              row.push(current);
              current = '';
            } else {
              current += ch;
            }
          }
          row.push(current);

          if (row.length >= 9) {
            const proc = row[0].replace(/^"|"$/g, '').trim();
            const pid = parseInt(row[1].replace(/^"|"$/g, '').trim(), 10);
            const sessionName = row[2].replace(/^"|"$/g, '').trim();
            const title = row[8].replace(/^"|"$/g, '').trim();

            const isConsoleSession = sessionName.toLowerCase() === 'console' || row[3] === '1';
            const isSystemHelper = proc.toLowerCase().includes('host') || proc.toLowerCase().includes('svchost') || proc.toLowerCase().includes('dwm');

            if (isConsoleSession && !isSystemHelper && title && !ignoredTitles.has(title)) {
              windows.push({ pid, process: proc, title });
            }
          }
        }

        // Deduplicate and filter
        const unique = [];
        const seen = new Set();
        for (const w of windows) {
          const key = `${w.process}:${w.title}`;
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(w);
          }
        }

        resolve({ success: true, total: unique.length, windows: unique });
      });
    });
  }

  static async findWindow(query) {
    if (!query) return null;
    const res = await this.listWindows();
    if (!res.success || !res.windows) return null;
    const q = query.toLowerCase().trim();
    return res.windows.find(w => 
      w.title.toLowerCase().includes(q) || 
      w.process.toLowerCase().includes(q) ||
      String(w.pid) === q
    ) || null;
  }

  static async focusWindow(query) {
    const target = await this.findWindow(query);
    if (!target) {
      return { success: false, error: `No active window found matching query: "${query}"` };
    }

    return new Promise((resolve) => {
      const psScript = `
        $p = Get-Process -Id ${target.pid} -ErrorAction SilentlyContinue
        if ($p -and $p.MainWindowHandle -ne 0) {
          (New-Object -ComObject WScript.Shell).AppActivate($p.Id)
        }
      `.replace(/\r?\n\s*/g, ' ');

      exec(`powershell -NoProfile -NonInteractive -Command "${psScript}"`, { windowsHide: true }, (err) => {
        if (err) return resolve({ success: false, error: err.message });
        resolve({
          success: true,
          action: 'focus',
          target: target.title,
          process: target.process,
          pid: target.pid,
          message: `Brought "${target.title}" (${target.process}) to foreground.`
        });
      });
    });
  }

  static async snapWindow(query, position = 'left') {
    const target = await this.findWindow(query);
    if (!target) {
      return { success: false, error: `No active window found matching query: "${query}"` };
    }

    const pos = position.toLowerCase().trim();

    return new Promise((resolve) => {
      const psScript = `
        Add-Type @'
        using System;
        using System.Runtime.InteropServices;
        public class WinSnap {
          [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
          [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
          [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int W, int H, bool repaint);
        }
'@
        $p = Get-Process -Id ${target.pid} -ErrorAction SilentlyContinue
        if ($p -and $p.MainWindowHandle -ne 0) {
          $h = $p.MainWindowHandle
          [System.Windows.Forms.Screen]::PrimaryScreen | Out-Null
          Add-Type -AssemblyName System.Windows.Forms
          $area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
          
          if ('${pos}' -eq 'maximize') {
            [WinSnap]::ShowWindowAsync($h, 3)
          } elseif ('${pos}' -eq 'minimize') {
            [WinSnap]::ShowWindowAsync($h, 6)
          } elseif ('${pos}' -eq 'left') {
            [WinSnap]::ShowWindowAsync($h, 9)
            [WinSnap]::MoveWindow($h, $area.Left, $area.Top, [int]($area.Width / 2), $area.Height, $true)
          } elseif ('${pos}' -eq 'right') {
            [WinSnap]::ShowWindowAsync($h, 9)
            [WinSnap]::MoveWindow($h, [int]($area.Left + ($area.Width / 2)), $area.Top, [int]($area.Width / 2), $area.Height, $true)
          } elseif ('${pos}' -eq 'top') {
            [WinSnap]::ShowWindowAsync($h, 9)
            [WinSnap]::MoveWindow($h, $area.Left, $area.Top, $area.Width, [int]($area.Height / 2), $true)
          } elseif ('${pos}' -eq 'bottom') {
            [WinSnap]::ShowWindowAsync($h, 9)
            [WinSnap]::MoveWindow($h, $area.Left, [int]($area.Top + ($area.Height / 2)), $area.Width, [int]($area.Height / 2), $true)
          } elseif ('${pos}' -eq 'center' -or '${pos}' -eq 'restore') {
            [WinSnap]::ShowWindowAsync($h, 9)
            $w = [int]($area.Width * 0.8)
            $hH = [int]($area.Height * 0.8)
            $x = [int]($area.Left + ($area.Width - $w) / 2)
            $y = [int]($area.Top + ($area.Height - $hH) / 2)
            [WinSnap]::MoveWindow($h, $x, $y, $w, $hH, $true)
          }
          [WinSnap]::SetForegroundWindow($h)
        }
      `;

      exec(`powershell -NoProfile -NonInteractive -Command "${psScript.replace(/"/g, '`"')}"`, { windowsHide: true }, (err) => {
        if (err) return resolve({ success: false, error: err.message });
        resolve({
          success: true,
          action: 'snap',
          position: pos,
          target: target.title,
          process: target.process,
          pid: target.pid,
          message: `Snapped "${target.title}" to ${pos}.`
        });
      });
    });
  }

  static async closeWindow(query) {
    const target = await this.findWindow(query);
    if (!target) {
      return { success: false, error: `No active window found matching query: "${query}"` };
    }

    // Safety check against critical OS processes
    const safeCheck = safetyGuard.validateCommand(`Stop-Process -Id ${target.pid}`);
    if (!safeCheck.allowed) {
      return { success: false, error: `Protected OS process cannot be closed: ${safeCheck.reason}` };
    }

    return new Promise((resolve) => {
      const psScript = `
        $p = Get-Process -Id ${target.pid} -ErrorAction SilentlyContinue
        if ($p) {
          $p.CloseMainWindow() | Out-Null
          Start-Sleep -Milliseconds 400
          if (-not $p.HasExited) {
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
          }
        }
      `.replace(/\r?\n\s*/g, ' ');

      exec(`powershell -NoProfile -NonInteractive -Command "${psScript}"`, { windowsHide: true }, (err) => {
        if (err) return resolve({ success: false, error: err.message });
        resolve({
          success: true,
          action: 'close',
          target: target.title,
          process: target.process,
          pid: target.pid,
          message: `Closed window "${target.title}" (${target.process}).`
        });
      });
    });
  }

  static async mediaControl(action, times = 1) {
    const cleanAction = (action || '').toLowerCase().trim();
    return new Promise((resolve) => {
      exec(`"${DRIVER_PATH}" media ${cleanAction} ${parseInt(times, 10) || 1}`, { windowsHide: true }, (err, stdout) => {
        if (err) return resolve({ success: false, error: err.message });
        try {
          const res = JSON.parse(stdout.trim());
          resolve(res);
        } catch (e) {
          resolve({ success: true, action: 'media', command: cleanAction, stdout: stdout.trim() });
        }
      });
    });
  }
}

module.exports = { WindowTools };
