/**
 * Windows System Integrity & Safety Guard for Gemini Desktop Assistant
 * Hard-coded kernel-grade interceptor that enforces inviolable OS protection rules.
 * 
 * UNDER NO CIRCUMSTANCES can the assistant:
 * 1. Delete, overwrite, or corrupt core Windows operational files.
 * 2. Terminate critical Windows system processes (csrss, winlogon, lsass, etc.).
 * 3. Execute destructive disk formatting, boot configuration wipes, or OS crash triggers.
 * 4. Perform sensitive system modifications without explicit notification and user authorization.
 */

const path = require('path');
const os = require('os');

class WindowsSafetyGuard {
  constructor() {
    this.systemDrive = (process.env.SystemDrive || 'C:').toUpperCase();
    this.windir = (process.env.WINDIR || process.env.SystemRoot || `${this.systemDrive}\\Windows`).toLowerCase();
    
    // Core Protected Directories (Lower-case normalized for bulletproof checks)
    this.protectedDirectoryPrefixes = [
      this.windir, // e.g. c:\windows (and all subdirs: System32, SysWOW64, WinSxS, etc.)
      `${this.systemDrive.toLowerCase()}\\recovery`,
      `${this.systemDrive.toLowerCase()}\\$recycle.bin`,
      `${this.systemDrive.toLowerCase()}\\system volume information`,
      `${this.systemDrive.toLowerCase()}\\boot`,
      `${this.systemDrive.toLowerCase()}\\efi`,
      `${this.systemDrive.toLowerCase()}\\programdata\\microsoft\\windows defender`,
      `${this.systemDrive.toLowerCase()}\\programdata\\microsoft\\crypto`,
      `${this.systemDrive.toLowerCase()}\\program files\\windows defender`,
      `${this.systemDrive.toLowerCase()}\\program files (x86)\\windows defender`,
      `${this.systemDrive.toLowerCase()}\\program files\\windows nt`,
      `${this.systemDrive.toLowerCase()}\\program files (x86)\\windows nt`
    ];

    // Core Protected Root System Files
    this.protectedRootFiles = [
      'bootmgr',
      'bootnxt',
      'pagefile.sys',
      'swapfile.sys',
      'hiberfil.sys',
      'dumpstack.log',
      'bootstat.dat',
      'ntldr',
      'ntdetect.com'
    ];

    // Critical Windows System Processes (Terminating these causes immediate Windows BSOD or shutdown)
    this.criticalSystemProcesses = [
      'csrss',
      'smss',
      'wininit',
      'winlogon',
      'services',
      'lsass',
      'fontdrvhost',
      'svchost',
      'dwm',
      'sihost',
      'system',
      'idle'
    ];

    // Destructive Command Signatures (Regex patterns)
    this.destructiveCommandPatterns = [
      // Format / Partition wipes
      /\b(format-volume|format-disk|clear-disk|initialize-disk|remove-partition|diskpart)\b/i,
      // Boot records & VSS shadow deletion
      /\b(bcdedit|bootrec|vssadmin\s+delete|wbadmin\s+delete)\b/i,
      // Recursive wipes on system drive root or Windows
      /\b(remove-item|rm|del|rmdir|erase)\b.*?[\\\/](windows|system32|recovery|bootmgr|\$recycle\.bin)/i,
      /\b(remove-item|rm|del|rmdir|erase)\b.*?\b[c-z]:[\\\/]\s*(-r|-recurse|\/s|\*)/i,
      // Process termination targeting critical OS infrastructure
      /\b(stop-process|taskkill)\b.*?\b(csrss|smss|wininit|winlogon|services|lsass|svchost|dwm)\b/i,
      // Stripping permissions on Windows
      /\b(takeown|icacls)\b.*?[\\\/]windows\b/i,
      // Deleting critical registry hives
      /\b(reg\s+delete|remove-item|remove-itemproperty)\b.*?(hklm:[\\\/](system|sam|security)|hkey_local_machine[\\\/](system|sam|security))/i,
      // Forced shutdown / reboot commands
      /\b(stop-computer|restart-computer)\b.*?-force/i
    ];
  }

  /**
   * Normalize path for safe comparison
   */
  normalize(filePath) {
    if (!filePath || typeof filePath !== 'string') return '';
    try {
      return path.resolve(filePath).toLowerCase();
    } catch (e) {
      return filePath.trim().toLowerCase();
    }
  }

  /**
   * Check whether a file or directory path is a protected Windows core operational resource
   * @param {string} targetPath - Path to evaluate
   * @param {string} operation - 'delete', 'write', 'modify', 'read'
   * @returns {{ allowed: boolean, reason?: string, isCoreSystem: boolean }}
   */
  validatePathOperation(targetPath, operation = 'write') {
    const norm = this.normalize(targetPath);
    if (!norm) {
      return { allowed: false, reason: 'Invalid or empty path specified.', isCoreSystem: false };
    }

    // Read operations on standard Windows files (e.g. reading system info or fonts) are generally non-destructive,
    // but deleting, overwriting, or modifying core system files is 100% UNCONDITIONALLY FORBIDDEN.
    const isDestructive = ['delete', 'write', 'modify', 'move', 'rename'].includes(operation.toLowerCase());

    // 1. Check if path targets protected directory prefix
    for (const prefix of this.protectedDirectoryPrefixes) {
      if (norm === prefix || norm.startsWith(`${prefix}\\`) || norm.startsWith(`${prefix}/`)) {
        if (isDestructive) {
          const alertMsg = `BLOCKED: Core Windows operational directory '${targetPath}' cannot be modified or deleted under hard-coded system protection rules.`;
          console.error(`[WindowsSafetyGuard] ${alertMsg}`);
          return { allowed: false, reason: alertMsg, isCoreSystem: true };
        }
      }
    }

    // 2. Check if path targets root drive protected system files (e.g. C:\bootmgr, C:\pagefile.sys)
    const baseName = path.basename(norm);
    if (this.protectedRootFiles.includes(baseName)) {
      if (isDestructive) {
        const alertMsg = `BLOCKED: Critical Windows boot/system file '${baseName}' cannot be modified or deleted under hard-coded system protection rules.`;
        console.error(`[WindowsSafetyGuard] ${alertMsg}`);
        return { allowed: false, reason: alertMsg, isCoreSystem: true };
      }
    }

    // 3. Check for drive root wiping (e.g. C:\, C:\*)
    if (/^[a-z]:[\\\/]?$/i.test(norm) || /^[a-z]:[\\\/]\*$/i.test(norm)) {
      if (isDestructive) {
        const alertMsg = `BLOCKED: Drive root destructive operations on '${targetPath}' are strictly prohibited.`;
        console.error(`[WindowsSafetyGuard] ${alertMsg}`);
        return { allowed: false, reason: alertMsg, isCoreSystem: true };
      }
    }

    return { allowed: true, isCoreSystem: false };
  }

  /**
   * Check whether a PowerShell or CMD command string attempts to execute destructive system operations
   * @param {string} command - PowerShell / Command string to evaluate
   * @returns {{ allowed: boolean, reason?: string, requiresVerbalApproval?: boolean }}
   */
  validateCommand(command) {
    if (!command || typeof command !== 'string') {
      return { allowed: false, reason: 'Invalid or empty command string.' };
    }

    const clean = command.trim();

    // 1. Check against hard-coded destructive patterns (Absolute Block)
    for (const pattern of this.destructiveCommandPatterns) {
      if (pattern.test(clean)) {
        const alertMsg = `BLOCKED: Command contains potentially destructive Windows system signatures that could damage OS operation or cause Windows to crash. Pattern matched: ${pattern.toString()}`;
        console.error(`[WindowsSafetyGuard] ${alertMsg} -> Command: "${clean}"`);
        return {
          allowed: false,
          reason: alertMsg,
          isDestructive: true
        };
      }
    }

    // 2. Check for process termination targeting critical OS processes
    const taskkillMatch = clean.match(/taskkill\s+.*?\/im\s+([a-z0-9_\-\.]+)/i);
    const stopProcMatch = clean.match(/stop-process\s+.*?-name\s+['"]?([a-z0-9_\-\.]+)['"]?/i);
    const procTarget = (taskkillMatch && taskkillMatch[1]) || (stopProcMatch && stopProcMatch[1]);
    if (procTarget) {
      const cleanProc = procTarget.toLowerCase().replace('.exe', '');
      if (this.criticalSystemProcesses.includes(cleanProc)) {
        const alertMsg = `BLOCKED: Termination of critical Windows operational process '${cleanProc}' is strictly prohibited to prevent OS crash/BSOD.`;
        console.error(`[WindowsSafetyGuard] ${alertMsg}`);
        return { allowed: false, reason: alertMsg, isDestructive: true };
      }
    }

    // 3. Check for borderline elevated system commands that require Ryan's explicit verbal authorization
    const requiresVerbalPatterns = [
      /\b(set-service|stop-service|start-service|restart-service)\b/i,
      /\b(netsh\s+advfirewall|set-netfirewallrule)\b/i,
      /\b(reg\s+add|set-itemproperty)\b.*?hklm:/i,
      /\b(dism|sfc\s+\/scannow)\b/i
    ];

    for (const vp of requiresVerbalPatterns) {
      if (vp.test(clean)) {
        return {
          allowed: false,
          requiresVerbalApproval: true,
          reason: `NOTIFICATION: This command affects Windows system services or configuration. Explicit verbal authorization from Ryan is required before executing.`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Throw an error if a path operation violates safety rules
   */
  assertPathSafety(targetPath, operation = 'write') {
    const res = this.validatePathOperation(targetPath, operation);
    if (!res.allowed) {
      throw new Error(`[SAFETY INTERCEPTOR] ${res.reason}`);
    }
  }

  /**
   * Throw an error if a command violates safety rules
   */
  assertCommandSafety(command) {
    const res = this.validateCommand(command);
    if (!res.allowed) {
      throw new Error(`[SAFETY INTERCEPTOR] ${res.reason}`);
    }
  }
}

const safetyGuard = new WindowsSafetyGuard();

module.exports = {
  WindowsSafetyGuard,
  safetyGuard
};
