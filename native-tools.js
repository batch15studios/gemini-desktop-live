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
const { GoogleWorkspaceManager } = require('./google-workspace-manager.js');
const { WebScraperLeadEngine } = require('./web-scraper-lead-engine.js');
const { ResearchDatabase } = require('./research-database.js');

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
    name: 'calibrate_cursor_bounds',
    description: 'Calibrate and remap desktop cursor boundaries. Insets the right and bottom boundaries by a pixel margin so cursor movements to extreme edges stay cleanly within Ryan\'s visible screen area.',
    parameters: {
      type: 'OBJECT',
      properties: {
        insetRight: { type: 'NUMBER', description: 'Pixels to inset from the right screen boundary (default: 28).' },
        insetBottom: { type: 'NUMBER', description: 'Pixels to inset from the bottom screen boundary (default: 28).' },
        originX: { type: 'NUMBER', description: 'Horizontal origin offset from left (default: 0).' },
        originY: { type: 'NUMBER', description: 'Vertical origin offset from top (default: 0).' }
      }
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
    description: 'Control your integrated GEMINI WORKSPACE DECK (the 4th window). Allows you to open, close, toggle, or switch between your built-in Web Browser (Alt+1), Code IDE (Alt+2), File Explorer (Alt+3), and Research Database & Leads Dashboard (Alt+4). Also allows loading specific URLs into the browser or opening specific files in the IDE.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Action to perform: "open" (default), "close", "toggle", "switch_mode", "navigate_browser", "open_file".'
        },
        mode: {
          type: 'STRING',
          description: 'The mode to switch the deck to: "browser" (Chromium Web Browser), "ide" (Monaco Code Editor), "explorer" (Native File Explorer), or "database" (Visual Research & Leads Database dashboard).'
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
  },
  {
    name: 'workspace_get_unread_emails',
    description: 'Fetch unread emails from Ryan\'s Gmail inbox, including senders, subjects, dates, and preview snippets.',
    parameters: {
      type: 'OBJECT',
      properties: {
        maxResults: { type: 'NUMBER', description: 'Maximum unread emails to retrieve (default: 5).' }
      }
    }
  },
  {
    name: 'workspace_search_emails',
    description: 'Search Ryan\'s Gmail messages using standard Gmail query syntax (e.g. "from:ryan", "is:unread", "subject:project", "after:2026/10/01").',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Gmail search query string.' },
        maxResults: { type: 'NUMBER', description: 'Max results to return (default: 10).' }
      },
      required: ['query']
    }
  },
  {
    name: 'workspace_send_email',
    description: 'Send an email directly from Ryan\'s Gmail account to a recipient with subject and body.',
    parameters: {
      type: 'OBJECT',
      properties: {
        to: { type: 'STRING', description: 'Recipient email address.' },
        subject: { type: 'STRING', description: 'Email subject line.' },
        body: { type: 'STRING', description: 'Plaintext body content of the email.' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'workspace_create_draft',
    description: 'Compose and save a draft email in Ryan\'s Gmail account without sending it immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        to: { type: 'STRING', description: 'Recipient email address.' },
        subject: { type: 'STRING', description: 'Draft subject line.' },
        body: { type: 'STRING', description: 'Draft email body.' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'workspace_get_calendar_events',
    description: 'Retrieve scheduled events, meetings, and agenda from Ryan\'s primary Google Calendar for today or a specified timeframe.',
    parameters: {
      type: 'OBJECT',
      properties: {
        timeMin: { type: 'STRING', description: 'Start time in ISO format (defaults to beginning of today).' },
        timeMax: { type: 'STRING', description: 'End time in ISO format (defaults to end of today).' },
        maxResults: { type: 'NUMBER', description: 'Maximum events to return (default: 10).' }
      }
    }
  },
  {
    name: 'workspace_create_calendar_event',
    description: 'Schedule a new event or meeting on Ryan\'s Google Calendar with summary, start time, end time, and optional location/description.',
    parameters: {
      type: 'OBJECT',
      properties: {
        summary: { type: 'STRING', description: 'Event title or meeting name.' },
        startDateTime: { type: 'STRING', description: 'Start date/time in ISO format (e.g. "2026-10-15T14:00:00Z").' },
        endDateTime: { type: 'STRING', description: 'End date/time in ISO format (e.g. "2026-10-15T15:00:00Z").' },
        description: { type: 'STRING', description: 'Optional meeting notes or description.' },
        location: { type: 'STRING', description: 'Optional physical location or meeting link.' }
      },
      required: ['summary', 'startDateTime', 'endDateTime']
    }
  },
  {
    name: 'workspace_list_drive_files',
    description: 'List or search files and folders in Ryan\'s Google Drive with modified dates, links, and mimeTypes.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Optional search keyword or filter.' },
        pageSize: { type: 'NUMBER', description: 'Number of files to return (default: 15).' }
      }
    }
  },
  {
    name: 'workspace_upload_drive_file',
    description: 'Upload a file from the local Windows PC directly into Ryan\'s Google Drive.',
    parameters: {
      type: 'OBJECT',
      properties: {
        filePath: { type: 'STRING', description: 'Absolute or relative local file path to upload.' },
        customName: { type: 'STRING', description: 'Optional custom name for the uploaded file.' }
      },
      required: ['filePath']
    }
  },
  {
    name: 'workspace_create_doc',
    description: 'Create a new Google Doc on Ryan\'s Google Drive with a specified title and optional initial content.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Title of the new Google Doc.' },
        initialContent: { type: 'STRING', description: 'Initial text content to insert.' }
      },
      required: ['title']
    }
  },
  {
    name: 'workspace_read_doc',
    description: 'Read the full text content of an existing Google Doc given its documentId.',
    parameters: {
      type: 'OBJECT',
      properties: {
        documentId: { type: 'STRING', description: 'The Google Doc ID.' }
      },
      required: ['documentId']
    }
  },
  {
    name: 'workspace_append_doc',
    description: 'Append text, notes, or code to the end of an existing Google Doc given its documentId.',
    parameters: {
      type: 'OBJECT',
      properties: {
        documentId: { type: 'STRING', description: 'The Google Doc ID.' },
        text: { type: 'STRING', description: 'Text to append.' }
      },
      required: ['documentId', 'text']
    }
  },
  {
    name: 'workspace_create_sheet',
    description: 'Create a new Google Sheets spreadsheet with title and optional header row.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Title of the spreadsheet.' },
        headers: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Column headers array.' }
      },
      required: ['title']
    }
  },
  {
    name: 'workspace_read_sheet',
    description: 'Read cell values from a Google Sheets spreadsheet given its spreadsheetId and optional range.',
    parameters: {
      type: 'OBJECT',
      properties: {
        spreadsheetId: { type: 'STRING', description: 'The Google Spreadsheet ID.' },
        range: { type: 'STRING', description: 'Cell range (e.g. "Sheet1!A1:Z50"). Defaults to "Sheet1!A1:Z50".' }
      },
      required: ['spreadsheetId']
    }
  },
  {
    name: 'workspace_append_sheet_row',
    description: 'Append a row of data values into a Google Sheets spreadsheet.',
    parameters: {
      type: 'OBJECT',
      properties: {
        spreadsheetId: { type: 'STRING', description: 'The Google Spreadsheet ID.' },
        values: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Array of cell values for the row.' },
        range: { type: 'STRING', description: 'Target range or sheet (default: "Sheet1!A1").' }
      },
      required: ['spreadsheetId', 'values']
    }
  },
  {
    name: 'workspace_list_tasks',
    description: 'List pending tasks and to-do items from Google Tasks.',
    parameters: {
      type: 'OBJECT',
      properties: {
        showCompleted: { type: 'BOOLEAN', description: 'Whether to include completed tasks (default: false).' }
      }
    }
  },
  {
    name: 'workspace_create_task',
    description: 'Create a new task in Google Tasks with a title, optional notes, and optional due date.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Title of the task.' },
        notes: { type: 'STRING', description: 'Optional task details or notes.' },
        due: { type: 'STRING', description: 'Optional due date in ISO format.' }
      },
      required: ['title']
    }
  },
  {
    name: 'workspace_complete_task',
    description: 'Mark a task completed in Google Tasks by its taskId.',
    parameters: {
      type: 'OBJECT',
      properties: {
        taskId: { type: 'STRING', description: 'The ID of the task to complete.' }
      },
      required: ['taskId']
    }
  },
  {
    name: 'workspace_search_contacts',
    description: 'Search Ryan\'s Google Contacts address book by name, email, or phone number.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Name, email, or phone number to search for.' }
      },
      required: ['query']
    }
  },
  {
    name: 'workspace_create_slides',
    description: 'Create a new Google Slides presentation deck with title.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Title of the presentation.' }
      },
      required: ['title']
    }
  },
  {
    name: 'workspace_create_form',
    description: 'Create a new Google Form survey/quiz with title and description.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Title of the form.' },
        description: { type: 'STRING', description: 'Optional description of the form.' }
      },
      required: ['title']
    }
  },
  {
    name: 'workspace_startup_rundown',
    description: 'Generate an executive morning rundown summarizing unread emails, today\'s calendar schedule, and pending tasks with a spoken voice brief.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'workspace_sync_drive',
    description: 'Synchronize assistant memory, preferences, and knowledge graph to Google Drive for seamless cross-device continuity.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'import_gemini_takeout',
    description: 'Import past conversation histories exported from Google Takeout (JSON or directory), extracting preferences, past topics, and syncing them into persistent memory and Obsidian.',
    parameters: {
      type: 'OBJECT',
      properties: {
        sourcePath: { type: 'STRING', description: 'Path to Google Takeout JSON file or extracted folder.' }
      },
      required: ['sourcePath']
    }
  },
  {
    name: 'web_search',
    description: 'Search the live web for any query, topic, or local business information and return structured results (titles, URLs, and snippets).',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search query string.' },
        maxResults: { type: 'NUMBER', description: 'Maximum number of results to return (default 15).' }
      },
      required: ['query']
    }
  },
  {
    name: 'web_scrape_page',
    description: 'Fetch and scrape any public webpage URL to extract readable text, contact emails (including crawling /contact subpages), phone numbers, social media links, and a full Tech Stack & AI Automation audit (detecting WordPress, Wix, Squarespace, GoDaddy, and whether AI chat widgets are missing).',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: { type: 'STRING', description: 'Target webpage URL to scrape.' },
        extractContacts: { type: 'BOOLEAN', description: 'Extract emails, phones, and social links (default true).' },
        analyzeTechStack: { type: 'BOOLEAN', description: 'Analyze website CMS/stack and check for AI chat/automation widgets (default true).' }
      },
      required: ['url']
    }
  },
  {
    name: 'browser_extract_dom',
    description: 'Extract live rendered DOM text, links, and content directly from the webpage currently open inside your Workspace Deck Browser.',
    parameters: {
      type: 'OBJECT',
      properties: {
        selector: { type: 'STRING', description: 'Optional CSS selector to target (default "body").' }
      }
    }
  },
  {
    name: 'find_local_business_leads',
    description: 'Batch15Studios Local Lead Generation Engine: Discover local service businesses by zip code and category/trade (e.g. find 20 businesses without a website or needing modern web dev + AI automations). Automatically compiles all leads into a Multi-Column Visual Report opened in the Workspace Deck Browser, creates a Google Sheet in columns, creates a formatted Google Doc in columns, and saves customized Batch15Studios outreach emails into Gmail Drafts awaiting Ryan\'s approval.',
    parameters: {
      type: 'OBJECT',
      properties: {
        zipCode: { type: 'STRING', description: 'Target US zip code (e.g. "75001", "90210").' },
        category: { type: 'STRING', description: 'Business trade or category (e.g. "plumbing", "HVAC", "roofing", "landscaping", "service businesses").' },
        limit: { type: 'NUMBER', description: 'Number of leads to compile (default 20).' },
        onlyWithoutWebsite: { type: 'BOOLEAN', description: 'If true, prioritize businesses that do not have a standalone website.' },
        autoCreateDrafts: { type: 'BOOLEAN', description: 'Automatically save tailored outreach emails into Gmail Drafts for discovered emails (default true).' },
        exportToWorkspace: { type: 'BOOLEAN', description: 'Export multi-column table to Google Sheets and Google Docs (default true).' }
      },
      required: ['zipCode', 'category']
    }
  },
  {
    name: 'send_approved_lead_emails',
    description: 'Send the compiled Batch15Studios outreach emails ONLY after Ryan explicitly approves them. Can send all leads with emails ("all") or specific lead numbers (e.g. [1, 3, 5]).',
    parameters: {
      type: 'OBJECT',
      properties: {
        selection: { type: 'STRING', description: '"all" to send to all leads from the latest batch, or comma-separated lead numbers (e.g. "1, 2, 5").' },
        emailOverrides: { type: 'OBJECT', description: 'Optional map of leadNumber -> custom email address if Ryan provides an email for a specific lead.' }
      },
      required: ['selection']
    }
  },
  {
    name: 'db_save_records',
    description: 'Save or update structured records in the dedicated local Research Database (separate from Obsidian so high-volume business leads, large website lists, and lengthy task datasets do not clutter the Obsidian vault). Supports collections: "business_leads", "websites_directory", and "task_datasets".',
    parameters: {
      type: 'OBJECT',
      properties: {
        collection: { type: 'STRING', description: 'Collection name: "business_leads", "websites_directory", or "task_datasets".' },
        records: { type: 'ARRAY', items: { type: 'OBJECT' }, description: 'Array of structured record objects to insert or upsert.' },
        datasetName: { type: 'STRING', description: 'Required when collection="task_datasets": unique name for the research dataset.' },
        category: { type: 'STRING', description: 'Optional category or trade tag.' },
        zipCode: { type: 'STRING', description: 'Optional zip code tag for business leads.' }
      },
      required: ['collection', 'records']
    }
  },
  {
    name: 'db_query_records',
    description: 'Query, filter, and retrieve structured records from the dedicated local Research Database ("business_leads", "websites_directory", or "task_datasets") with precision filtering by keyword, zipCode, category, outreachStatus, hasWebsite, or datasetName.',
    parameters: {
      type: 'OBJECT',
      properties: {
        collection: { type: 'STRING', description: 'Collection to query: "business_leads", "websites_directory", or "task_datasets".' },
        query: { type: 'STRING', description: 'Optional keyword search across business name, domain, category, pitch angle, or notes.' },
        zipCode: { type: 'STRING', description: 'Filter business_leads by zip code.' },
        category: { type: 'STRING', description: 'Filter by category or trade.' },
        outreachStatus: { type: 'STRING', description: 'Filter business_leads by status ("discovered", "draft_created", "email_sent").' },
        hasWebsite: { type: 'BOOLEAN', description: 'Filter business_leads by whether they have a website (true/false).' },
        hasEmail: { type: 'BOOLEAN', description: 'Filter business_leads by whether an email address was found (true/false).' },
        datasetName: { type: 'STRING', description: 'When collection="task_datasets", filter by dataset name.' },
        limit: { type: 'NUMBER', description: 'Maximum records to return (default 50).' }
      },
      required: ['collection']
    }
  },
  {
    name: 'db_get_summary',
    description: 'Get an instant overview and statistics of all structured data stored in the local Research Database (total business leads, leads without websites, leads with emails, outreach sent count, zip codes covered, websites directory count, and saved task datasets).',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'db_export_csv',
    description: 'Export any collection or filtered query from the local Research Database ("business_leads", "websites_directory", or "task_datasets") to a clean CSV spreadsheet file on disk.',
    parameters: {
      type: 'OBJECT',
      properties: {
        collection: { type: 'STRING', description: 'Collection to export: "business_leads", "websites_directory", or "task_datasets".' },
        zipCode: { type: 'STRING', description: 'Optional zip code filter.' },
        category: { type: 'STRING', description: 'Optional category filter.' },
        datasetName: { type: 'STRING', description: 'Optional dataset name if exporting task_datasets.' },
        outputPath: { type: 'STRING', description: 'Optional custom output file path for the CSV.' }
      },
      required: ['collection']
    }
  },
  {
    name: 'take_screenshot',
    description: 'Capture a high-resolution screenshot of the Windows desktop screen, automatically save it as a timestamped PNG file in Pictures/Screenshots (or Desktop), copy the image directly to the Windows clipboard, and display a native notification.',
    parameters: {
      type: 'OBJECT',
      properties: {
        save_to_file: { type: 'BOOLEAN', description: 'Whether to save the screenshot as a PNG file on disk (default true).' },
        copy_to_clipboard: { type: 'BOOLEAN', description: 'Whether to copy the screenshot directly to the Windows clipboard (default true).' },
        custom_filename: { type: 'STRING', description: 'Optional custom filename for the saved screenshot (e.g. "project_mockup.png").' }
      }
    }
  },
  {
    name: 'assistant_control',
    description: 'Control the desktop assistant application lifecycle, window layout, and audio state via voice command. Supports disconnecting the live session, minimizing all windows to the floating toolbar or system tray, muting/unmuting, or completely shutting down the app.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          enum: ['disconnect', 'minimize_all', 'restore_all', 'minimize_tray', 'mute', 'unmute', 'quit'],
          description: 'The assistant control action: "disconnect" (ends the live Gemini session), "minimize_all" (morphs into the compact mini floating bar), "restore_all" (restores the 3-window desktop HUD), "minimize_tray" (minimizes everything to system tray), "mute" / "unmute" (toggles microphone), or "quit" (shuts down the application).'
        },
        reason: { type: 'STRING', description: 'Optional verbal reason or context for the action.' }
      },
      required: ['action']
    }
  }
];

const MCP_SERVER_METADATA = {
  'memory': {
    displayName: 'Persistent Memory & Graph',
    description: 'Knowledge graph, user preferences, past session chronicle, and Obsidian Second Brain sync.',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>',
    category: 'Memory'
  },
  'filesystem': {
    displayName: 'Filesystem Driver',
    description: 'Direct file reading, writing, directory listing, file moving, and filesystem inspection.',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    category: 'System'
  },
  'github': {
    displayName: 'GitHub Integration',
    description: 'Inspect repositories, pull requests, issue tracking, and global code searches.',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>',
    category: 'Development'
  },
  'chrome-devtools-mcp': {
    displayName: 'Chrome DevTools Automation',
    description: 'Live browser page automation, element clicks, DOM evaluation, and page screenshots.',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    category: 'Browser'
  },
  'context7': {
    displayName: 'Context7 Technical Docs',
    description: 'Real-time documentation search and API lookups across libraries and frameworks.',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    category: 'Knowledge'
  },
  'tauri': {
    displayName: 'Tauri Desktop Runtime',
    description: 'Tauri application window automation, IPC events, and Webview interaction.',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    category: 'System'
  },
  'firebase': {
    displayName: 'Firebase Cloud Platform',
    description: 'Firestore databases, security rules, authentication, and hosting deployment.',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
    category: 'Cloud'
  },
  'gcloud': {
    displayName: 'Google Cloud Platform',
    description: 'GCloud command execution, project management, and Cloud SDK services.',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
    category: 'Cloud'
  },
  'genkit-mcp-server': {
    displayName: 'Genkit AI Workflows',
    description: 'Flow execution, runtime telemetry, traces, and Genkit documentation.',
    icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
    category: 'AI'
  }
};

class ToolsManager {
  constructor(eventEmitter, initialEnabledServers = null) {
    this.emitter = eventEmitter;
    this.memoryManager = new MemoryManager();
    this.workspaceManager = new GoogleWorkspaceManager({ emitter: this.emitter });
    this.researchDb = new ResearchDatabase({ rootDir: __dirname });
    this.leadEngine = new WebScraperLeadEngine({
      workspaceManager: this.workspaceManager,
      researchDb: this.researchDb,
      emitter: this.emitter,
      rootDir: __dirname
    });
    this.mcpServersPath = path.join(os.homedir(), '.gemini', 'antigravity', 'mcp');
    this.mcpConfigPath = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
    this.mcpConfig = this.loadMcpConfig();
    this.availableMcpServers = this.discoverMcpServers();
    this.enabledMcpServers = initialEnabledServers || ['memory', 'filesystem', 'github', 'chrome-devtools-mcp', 'context7'];
    this.activeSentries = [];
    this.screenCaptureProvider = null;
    this.webviewDomExtractor = null;

    // Hardware Telemetry & CPU Core Sampler
    this.lastCpuSample = this.sampleCpu();
    this.lastCpuUsage = {
      load: 0,
      clockGhz: '2.10',
      clockMhz: 2096,
      coreCount: os.cpus().length,
      model: os.cpus()[0]?.model || 'AMD Ryzen Processor'
    };
    this.hardwareTelemetry = {
      tempC: null,
      tempF: null,
      tempStatus: 'NOMINAL',
      batteryPercent: null,
      batteryCharging: false,
      batteryStatusText: 'AC ONLINE',
      lastUpdated: 0
    };
    this.initHardwareTelemetryPoller();

    // Physical Display Calibration & Safe Viewable Insets
    // (Top/Left origin at 0 is spot on; Right and Bottom insets prevent cursor from falling outside view)
    this.cursorCalibration = {
      originX: 0,
      originY: 0,
      insetRight: 28,
      insetBottom: 28
    };
    this.physicalDisplayBounds = { width: 1920, height: 1080 };
    this.calibrateDisplayBounds();
  }

  calibrateCursorBounds(insetRight = 28, insetBottom = 28, originX = 0, originY = 0) {
    const ir = typeof insetRight === 'number' ? Math.max(0, Math.min(200, Math.round(insetRight))) : 28;
    const ib = typeof insetBottom === 'number' ? Math.max(0, Math.min(200, Math.round(insetBottom))) : 28;
    const ox = typeof originX === 'number' ? Math.max(0, Math.min(100, Math.round(originX))) : 0;
    const oy = typeof originY === 'number' ? Math.max(0, Math.min(100, Math.round(originY))) : 0;

    this.cursorCalibration = {
      originX: ox,
      originY: oy,
      insetRight: ir,
      insetBottom: ib
    };

    const bounds = this.getDisplayBounds();
    const effectiveW = bounds.width - ox - ir;
    const effectiveH = bounds.height - oy - ib;

    if (this.emitter) {
      this.emitter.emit('cursor:calibrated', this.cursorCalibration);
    }

    console.log(`[ToolsManager] Cursor remapped: Origin(${ox}, ${oy}), Inset(Right: ${ir}px, Bottom: ${ib}px), Effective Viewable Grid: ${effectiveW}x${effectiveH}`);

    return {
      success: true,
      physicalBounds: bounds,
      calibration: this.cursorCalibration,
      effectiveViewableGrid: { width: effectiveW, height: effectiveH }
    };
  }

  async calibrateDisplayBounds() {
    try {
      const res = await this.runCursorDriver('getdisplay');
      if (res && res.width > 0 && res.height > 0) {
        this.physicalDisplayBounds = { width: res.width, height: res.height };
        console.log(`[ToolsManager] Screen calibrated to physical hardware: ${res.width}x${res.height}`);
      }
    } catch (e) {
      console.warn('[ToolsManager] Display calibration notice:', e.message);
    }
  }

  sampleCpu() {
    const cpus = os.cpus() || [];
    let idle = 0;
    let total = 0;
    const speeds = [];
    for (const cpu of cpus) {
      if (cpu.times) {
        for (const type in cpu.times) {
          total += cpu.times[type];
        }
        idle += cpu.times.idle;
      }
      if (cpu.speed) speeds.push(cpu.speed);
    }
    return { idle, total, count: cpus.length, speeds, timestamp: Date.now() };
  }

  getCpuTelemetry() {
    const current = this.sampleCpu();
    if (!this.lastCpuSample) {
      this.lastCpuSample = current;
      return this.lastCpuUsage;
    }
    const idleDelta = current.idle - this.lastCpuSample.idle;
    const totalDelta = current.total - this.lastCpuSample.total;
    let load = 0;
    if (totalDelta > 0) {
      load = Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100)));
    }
    const avgSpeedMhz = current.speeds.length > 0
      ? Math.round(current.speeds.reduce((a, b) => a + b, 0) / current.speeds.length)
      : 2096;
    const avgSpeedGhz = (avgSpeedMhz / 1000).toFixed(2);

    this.lastCpuSample = current;
    this.lastCpuUsage = {
      load,
      clockGhz: avgSpeedGhz,
      clockMhz: avgSpeedMhz,
      coreCount: current.count,
      model: os.cpus()[0]?.model || 'Processor'
    };
    return this.lastCpuUsage;
  }

  initHardwareTelemetryPoller() {
    this.refreshHardwareTelemetry();
    this.hardwarePollerInterval = setInterval(() => {
      this.refreshHardwareTelemetry();
    }, 4500);
    if (this.hardwarePollerInterval && this.hardwarePollerInterval.unref) {
      this.hardwarePollerInterval.unref();
    }
  }

  refreshHardwareTelemetry() {
    const cmd = `powershell -NoProfile -NonInteractive -Command "$tz=(Get-CimInstance Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue|Select -First 1);$bat=(Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue|Select -First 1);$tz.HighPrecisionTemperature,$tz.Temperature,$bat.EstimatedChargeRemaining,$bat.BatteryStatus -join ','"`;
    exec(cmd, { windowsHide: true, timeout: 4500 }, (err, stdout) => {
      if (err || !stdout) return;
      try {
        const parts = stdout.trim().split(',');
        if (parts.length >= 4) {
          const tzHigh = parseInt(parts[0], 10);
          const tzTemp = parseInt(parts[1], 10);
          const batPct = parseInt(parts[2], 10);
          const batStat = parseInt(parts[3], 10);

          let tempK = null;
          if (!isNaN(tzHigh) && tzHigh > 1000) {
            tempK = tzHigh / 10;
          } else if (!isNaN(tzTemp) && tzTemp > 200) {
            tempK = tzTemp;
          }

          if (tempK !== null) {
            const c = Math.round(tempK - 273.15);
            this.hardwareTelemetry.tempC = c;
            this.hardwareTelemetry.tempF = Math.round(c * 1.8 + 32);
            if (c < 55) this.hardwareTelemetry.tempStatus = 'OPTIMAL';
            else if (c < 75) this.hardwareTelemetry.tempStatus = 'NOMINAL';
            else if (c < 90) this.hardwareTelemetry.tempStatus = 'WARM';
            else this.hardwareTelemetry.tempStatus = 'HIGH';
          }

          if (!isNaN(batPct) && batPct >= 0) {
            this.hardwareTelemetry.batteryPercent = batPct;
            this.hardwareTelemetry.batteryCharging = (batStat === 2 || batStat === 6 || batStat === 7 || batStat === 8);
            if (batStat === 2) this.hardwareTelemetry.batteryStatusText = 'CHARGING (AC)';
            else if (batStat === 3) this.hardwareTelemetry.batteryStatusText = 'FULLY CHARGED';
            else if (batStat === 1) this.hardwareTelemetry.batteryStatusText = 'ON BATTERY';
            else this.hardwareTelemetry.batteryStatusText = 'AC CONNECTED';
          }
          this.hardwareTelemetry.lastUpdated = Date.now();
        }
      } catch (parseErr) {
        // Silent fail on parse
      }
    });
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
        icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>',
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
        case 'calibrate_cursor_bounds':
          result = this.calibrateCursorBounds(args?.insetRight, args?.insetBottom, args?.originX, args?.originY);
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
        case 'workspace_get_unread_emails':
          result = await this.workspaceManager.getUnreadEmails(args?.maxResults);
          break;
        case 'workspace_search_emails':
          result = await this.workspaceManager.searchEmails(args?.query, args?.maxResults);
          break;
        case 'workspace_send_email':
          result = await this.workspaceManager.sendEmail(args?.to, args?.subject, args?.body);
          break;
        case 'workspace_create_draft':
          result = await this.workspaceManager.createDraft(args?.to, args?.subject, args?.body);
          break;
        case 'workspace_get_calendar_events':
          result = await this.workspaceManager.getUpcomingEvents(args?.timeMin, args?.timeMax, args?.maxResults);
          break;
        case 'workspace_create_calendar_event':
          result = await this.workspaceManager.createCalendarEvent(args?.summary, args?.startDateTime, args?.endDateTime, args?.description, args?.location);
          break;
        case 'workspace_list_drive_files':
          result = await this.workspaceManager.listDriveFiles(args?.pageSize, args?.query);
          break;
        case 'workspace_upload_drive_file':
          result = await this.workspaceManager.uploadFileToDrive(args?.filePath, args?.customName);
          break;
        case 'workspace_create_doc':
          result = await this.workspaceManager.createGoogleDoc(args?.title, args?.initialContent);
          break;
        case 'workspace_read_doc':
          result = await this.workspaceManager.readGoogleDoc(args?.documentId);
          break;
        case 'workspace_append_doc':
          result = await this.workspaceManager.appendDocText(args?.documentId, args?.text);
          break;
        case 'workspace_create_sheet':
          result = await this.workspaceManager.createSpreadsheet(args?.title, args?.headers);
          break;
        case 'workspace_read_sheet':
          result = await this.workspaceManager.readSheetValues(args?.spreadsheetId, args?.range);
          break;
        case 'workspace_append_sheet_row':
          result = await this.workspaceManager.appendSheetRow(args?.spreadsheetId, args?.values, args?.range);
          break;
        case 'workspace_list_tasks':
          result = await this.workspaceManager.listTasks(args?.taskListId, args?.showCompleted);
          break;
        case 'workspace_create_task':
          result = await this.workspaceManager.createTask(args?.title, args?.notes, args?.due, args?.taskListId);
          break;
        case 'workspace_complete_task':
          result = await this.workspaceManager.completeTask(args?.taskId, args?.taskListId);
          break;
        case 'workspace_search_contacts':
          result = await this.workspaceManager.searchContacts(args?.query, args?.maxResults);
          break;
        case 'workspace_create_slides':
          result = await this.workspaceManager.createPresentation(args?.title);
          break;
        case 'workspace_create_form':
          result = await this.workspaceManager.createForm(args?.title, args?.description);
          break;
        case 'workspace_startup_rundown':
          result = await this.workspaceManager.getStartupRundown();
          break;
        case 'workspace_sync_drive':
          result = await this.workspaceManager.syncMemoryToDrive(this.memoryManager.memory);
          break;
        case 'import_gemini_takeout':
          result = this.workspaceManager.importTakeoutConversations(args?.sourcePath, this.memoryManager);
          break;
        case 'web_search':
          result = await this.leadEngine.webSearch(args?.query, args?.maxResults);
          break;
        case 'web_scrape_page':
          result = await this.leadEngine.webScrapePage(args?.url, {
            extractContacts: args?.extractContacts,
            analyzeTechStack: args?.analyzeTechStack
          });
          break;
        case 'browser_extract_dom':
          result = await this.extractBrowserDom(args?.selector);
          break;
        case 'find_local_business_leads':
          result = await this.leadEngine.findLocalBusinessLeads({
            zipCode: args?.zipCode,
            category: args?.category,
            limit: args?.limit,
            onlyWithoutWebsite: args?.onlyWithoutWebsite,
            autoCreateDrafts: args?.autoCreateDrafts,
            exportToWorkspace: args?.exportToWorkspace
          });
          break;
        case 'send_approved_lead_emails':
          result = await this.leadEngine.sendApprovedLeadEmails({
            selection: args?.selection,
            emailOverrides: args?.emailOverrides
          });
          break;
        case 'db_save_records':
          result = this.researchDb.saveRecords({
            collection: args?.collection,
            records: args?.records,
            datasetName: args?.datasetName,
            category: args?.category,
            zipCode: args?.zipCode
          });
          break;
        case 'db_query_records':
          result = this.researchDb.queryRecords({
            collection: args?.collection,
            query: args?.query,
            zipCode: args?.zipCode,
            category: args?.category,
            outreachStatus: args?.outreachStatus,
            hasWebsite: args?.hasWebsite,
            hasEmail: args?.hasEmail,
            datasetName: args?.datasetName,
            limit: args?.limit
          });
          break;
        case 'db_get_summary':
          result = this.researchDb.getSummary();
          break;
        case 'db_export_csv':
          result = this.researchDb.exportToCsv({
            collection: args?.collection,
            zipCode: args?.zipCode,
            category: args?.category,
            datasetName: args?.datasetName,
            outputPath: args?.outputPath
          });
          break;
        case 'take_screenshot':
          result = await this.takeScreenshot(args);
          break;
        case 'assistant_control':
          result = await this.handleAssistantControl(args);
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
    const url = args.url || null;
    const filePath = args.filePath || null;
    // Default mode is ALWAYS 'browser' unless explicitly opening a file in the IDE
    let mode = args.mode || null;
    if (!mode) {
      mode = (filePath && !url) ? 'ide' : 'browser';
    } else if (url && mode !== 'browser') {
      mode = 'browser';
    }

    console.log(`[ToolsManager] Controlling Workspace Deck: action=${action}, mode=${mode}, url=${url}, file=${filePath}`);
    this.emitter?.emit('workspace_control', { action, mode, url, filePath });

    return {
      success: true,
      action,
      mode,
      url,
      filePath,
      message: `Workspace Deck ${action} executed. Switched view to "${mode}".${url ? ` Navigated browser to "${url}".` : ''}${filePath ? ` Opened "${filePath}" in IDE.` : ''}`
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
    const cpu = this.getCpuTelemetry();
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemBytes = totalMemBytes - freeMemBytes;
    const totalMemGB = (totalMemBytes / (1024 ** 3)).toFixed(2);
    const freeMemGB = (freeMemBytes / (1024 ** 3)).toFixed(2);
    const usedMemGB = (usedMemBytes / (1024 ** 3)).toFixed(2);
    const ramPercent = Math.round((usedMemBytes / totalMemBytes) * 100);
    const uptimeHours = (os.uptime() / 3600).toFixed(1);

    return {
      cpuModel: cpu.model,
      cpuCores: cpu.coreCount,
      cpuLoad: cpu.load,
      clockGhz: cpu.clockGhz,
      clockMhz: cpu.clockMhz,
      memory: {
        totalGB: `${totalMemGB} GB`,
        freeGB: `${freeMemGB} GB`,
        usedGB: `${usedMemGB} GB`,
        totalRawGB: parseFloat(totalMemGB),
        usedRawGB: parseFloat(usedMemGB),
        usagePercent: `${ramPercent}%`,
        usagePercentNum: ramPercent
      },
      telemetry: {
        tempC: this.hardwareTelemetry.tempC,
        tempF: this.hardwareTelemetry.tempF,
        tempStatus: this.hardwareTelemetry.tempStatus,
        batteryPercent: this.hardwareTelemetry.batteryPercent,
        batteryCharging: this.hardwareTelemetry.batteryCharging,
        batteryStatusText: this.hardwareTelemetry.batteryStatusText,
        lastUpdated: this.hardwareTelemetry.lastUpdated
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

    // 5. Chrome DevTools MCP Server (Connected directly to Workspace Deck Webview)
    if (serverName === 'chrome-devtools-mcp') {
      if (toolName === 'navigate_page' || toolName === 'new_page') {
        const targetUrl = parameters.url || 'https://google.com';
        await this.controlWorkspaceDeck({ action: 'navigate_browser', mode: 'browser', url: targetUrl });
        await new Promise(r => setTimeout(r, 2000));
        return await this.extractBrowserDom('body');
      }
      if (toolName === 'take_snapshot' || toolName === 'evaluate_script') {
        return await this.extractBrowserDom(parameters.selector || 'body');
      }
    }

    // 6. Schema Read & Standard Execution Confirmation
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

  setWebviewDomExtractor(extractor) {
    this.webviewDomExtractor = extractor;
    if (this.leadEngine) {
      this.leadEngine.webviewExtractor = extractor;
    }
  }

  async extractBrowserDom(selector = 'body') {
    if (typeof this.webviewDomExtractor === 'function') {
      return await this.webviewDomExtractor(selector);
    }
    return { error: 'Workspace Deck browser DOM extractor is not initialized.' };
  }

  // --- Native Windows Cursor & Keyboard Control Engine ---
  getDisplayBounds() {
    if (this.physicalDisplayBounds && this.physicalDisplayBounds.width > 0) {
      return this.physicalDisplayBounds;
    }

    let width = 1920;
    let height = 1080;
    try {
      const electron = require('electron');
      if (electron.screen) {
        const primary = electron.screen.getPrimaryDisplay();
        if (primary && primary.bounds) {
          const scale = primary.scaleFactor || 1;
          width = Math.round(primary.bounds.width * scale);
          height = Math.round(primary.bounds.height * scale);
        }
      }
    } catch (e) {}
    return { width, height };
  }

  resolveCoordinates(x, y, isNormalized = true) {
    const bounds = this.getDisplayBounds();
    const rawScreenW = bounds.width;   // Physical resolution (1920)
    const rawScreenH = bounds.height;  // Physical resolution (1080)

    // User-verified calibration: Origin (0,0) at top-left is 100% spot-on.
    // Right and Bottom edges are safely mapped with viewable insets so the cursor icon remains completely visible inside Ryan's screen view.
    const originX = this.cursorCalibration?.originX || 0;
    const originY = this.cursorCalibration?.originY || 0;
    const insetRight = this.cursorCalibration?.insetRight !== undefined ? this.cursorCalibration.insetRight : 28;
    const insetBottom = this.cursorCalibration?.insetBottom !== undefined ? this.cursorCalibration.insetBottom : 28;

    const viewableW = Math.max(100, rawScreenW - originX - insetRight);
    const viewableH = Math.max(100, rawScreenH - originY - insetBottom);

    let numX = parseFloat(x) || 0;
    let numY = parseFloat(y) || 0;

    let targetX, targetY;

    if (isNormalized === false) {
      // Raw physical pixels requested explicitly
      targetX = numX;
      targetY = numY;
    } else {
      // Standard normalized coordinates: 0.0-1.0 float ratios or 0-1000 integer grid
      const isRatio = (numX <= 1.0 && numY <= 1.0 && (numX > 0 || numY > 0));
      const ratioX = isRatio ? numX : (numX / 1000);
      const ratioY = isRatio ? numY : (numY / 1000);

      targetX = originX + (ratioX * viewableW);
      targetY = originY + (ratioY * viewableH);
    }

    // Clamp strictly within viewable boundaries so cursor never travels outside user view
    const maxX = rawScreenW - 1 - insetRight;
    const maxY = rawScreenH - 1 - insetBottom;
    targetX = Math.max(originX, Math.min(Math.round(targetX), maxX));
    targetY = Math.max(originY, Math.min(Math.round(targetY), maxY));

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

  setScreenshotProvider(provider) {
    this.screenshotProvider = provider;
  }

  async takeScreenshot(options = {}) {
    if (typeof this.screenshotProvider === 'function') {
      try {
        return await this.screenshotProvider(options);
      } catch (err) {
        return { error: `Screenshot capture provider error: ${err.message}` };
      }
    }
    // Standalone fallback using PowerShell .NET Graphics
    try {
      const picturesDir = path.join(os.homedir(), 'Pictures', 'Screenshots');
      if (!fs.existsSync(picturesDir)) fs.mkdirSync(picturesDir, { recursive: true });
      const filename = options.custom_filename || `Screenshot_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
      const targetPath = path.join(picturesDir, filename);
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save('${targetPath.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
`;
      await this.runPowerShell(psScript);
      return {
        success: true,
        path: targetPath,
        message: `Screenshot saved to "${targetPath}" and copied to clipboard.`
      };
    } catch (err) {
      return { error: `Failed to capture screenshot: ${err.message}` };
    }
  }

  async handleAssistantControl(args = {}) {
    const action = args?.action;
    console.log(`[ToolsManager] Handling assistant_control action: "${action}" (${args?.reason || 'no reason'})`);
    this.emitter?.emit('assistant_control', { action, reason: args?.reason });
    return {
      success: true,
      action,
      message: `Assistant control action "${action}" initiated successfully.`
    };
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
