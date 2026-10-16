# Changelog — Gemini Desktop Live

All notable changes, version milestones, and architectural revisions to `gemini-desktop-live` (`Assistant_Integrated_Advanced`) are documented in this file.

---

## [2.3.0] — 2026-10-15
### Added
- **Web Search, Deep Web Scraper & Batch15Studios Local Lead Generation Engine (`web-scraper-lead-engine.js`)**:
  - **`web_search`**: Live search engine query parser (DuckDuckGo HTML + Bing fallback) returning real titles, URLs, and snippets.
  - **`web_scrape_page`**: Deep webpage scraper that strips scripts/boilerplate, extracts clean text, harvests emails and phone numbers, automatically crawls `/contact` and `/about` subpages, and runs `auditTechStack()` to detect CMS/builders (WordPress, Wix, Squarespace, GoDaddy, Next.js, Shopify) and whether the site has AI/chat automation widgets (GoHighLevel, Intercom, Tawk.to, HubSpot, Drift, Podium).
  - **`browser_extract_dom`**: Live Chromium `<webview>` DOM extractor wired via `main.js` (`extractWorkspaceWebviewDom`) and `call_mcp_tool` (`chrome-devtools-mcp`) so Gemini can extract rendered text, links, emails, and phones from any JS-rendered webpage open in the Workspace Deck Browser.
  - **`find_local_business_leads`**: End-to-end automated pipeline for **Batch15Studios**:
    1. Geocodes target zip code via Nominatim (`nominatim.openstreetmap.org`).
    2. Queries OpenStreetMap Overpass API (`overpass-api.de`) + local directory SERPs to discover local service businesses and identify which ones have **NO website**, a **broken website**, or an **outdated website lacking AI automations**.
    3. Enriches missing contact info via targeted search snippets and `/contact` subpage crawling.
    4. Generates personalized **Batch15Studios** outreach pitches (modern web stack + 24/7 AI receptionists, missed-call text-back, and automated lead booking) and saves them directly to **Gmail Drafts**.
    5. Compiles all leads into a **Multi-Column Interactive HTML Dashboard (`leads-report.html`)** with a Print/Save PDF button and opens it automatically in the Workspace Deck Browser (`http://127.0.0.1:4242/leads-report.html`).
    6. Exports all leads in structured columns to a new **Google Sheet** and a new **Google Doc** (complete with full email copy) so Gemini never has to read 20 leads aloud one-by-one.
  - **`send_approved_lead_emails`**: Approval-gated email dispatcher that sends drafted outreach emails via Gmail (`batch15studios@gmail.com`) **only after** explicit user confirmation (supports `"all"` or specific lead numbers like `"1, 3, 5"`).

### Changed
- **System Prompt & Long-Term Memory (`gemini-live-engine.js`, `memory-manager.js`)**:
  - Added Section 6 & Rule 6 instructing Vega never to claim an inability to scrape the web, never to read 20 leads aloud one-by-one, to always present the visual multi-column report/Sheet/Doc, and to wait for explicit approval before calling `send_approved_lead_emails`.

---

## [2.2.1] — 2026-10-15
### Changed
- **Default Viewport Mode to Web Browser**:
  - The Workspace Deck now loads directly into the **Chromium Web Browser** view by default on every boot and open action, instead of loading into the Monaco IDE view.
  - Initialized `initBrowser()` on boot in `workspace.js` and set `#viewBrowser` and `data-mode="browser"` as active in `workspace.html`.
  - Updated `controlWorkspaceDeck()` in `native-tools.js` to automatically default to `mode: 'browser'` whenever opening or navigating, unless a specific file is explicitly requested for the IDE.

### Fixed
- **IPC Command Dropping on Window Instantiation**:
  - In `main.js`, attached `webContents.once('did-finish-load')` when creating a new Workspace window before dispatching `workspace:set-mode` and `workspace:navigate`. Eliminates the race condition where Gemini thought the page was loaded into the browser but the window had dropped the command during creation.

### Confirmed
- **Google Workspace OAuth2 Authentication Active**:
  - Verified active refresh tokens and OAuth credentials for `batch15studios@gmail.com`.
  - Updated Gemini's boot situational awareness context and long-term memory graph to reflect active Google Workspace connectivity across Gmail, Calendar, Drive, Docs, Sheets, and Tasks.

---

## [2.2.0] — 2026-10-15
### Fixed
- **Workspace Deck Minimize Button**:
  - Re-engineered the titlebar minimize button (`btnWinMinimize`) from a geometry restore/unmaximize action to a genuine native OS window minimize (`win.minimize()`).
  - Minimized state now completely hides the workspace deck from view without unloading Monaco editor state, dev server threads, or webview instances.
  - Enhanced `toggleWorkspaceDeck()` in `main.js` to detect `win.isMinimized()` and seamlessly restore and focus the window via `win.restore()`.
  - Updated title attribute to `"Minimize Window"`.

### Added
- **Browser Activity Verification & Loading Indicators**:
  - **Address Bar Cyber Spinner (`#browserActivitySpinner`)**: Added glowing animated cyan ring indicator next to the address input bar that spins actively whenever network requests or page renders are pending.
  - **Top Shimmer Progress Bar (`#browserLoadBar`)**: Added a dynamic cyan-to-crimson gradient progress line along the top edge of the browser frame container that animates during page loads and smoothly completes on completion.
  - **Spinning Reload Button**: Reload icon (`btnBrowserReload`) now gains a continuous rotation animation while pages are actively fetching.
  - Wired to Electron `<webview>` lifecycle events: `did-start-loading`, `did-stop-loading`, `did-fail-load`, `did-navigate`, and `did-navigate-in-page`.

### Changed
- **Google Cloud Platform Workspace APIs Provisioning**:
  - Automatically enabled all 9 core Google Workspace APIs on GCP project `batch-15-web-studios` (`gmail.googleapis.com`, `calendar-json.googleapis.com`, `drive.googleapis.com`, `docs.googleapis.com`, `sheets.googleapis.com`, `tasks.googleapis.com`, `people.googleapis.com`, `slides.googleapis.com`, `forms.googleapis.com`).

---

## [2.1.0] — 2026-10-14
### Added
- **Google Workspace Full Suite Engine (`google-workspace-manager.js`)**:
  - **Gmail**: Read unread messages (`workspace_get_unread_emails`), search threads (`workspace_search_emails`), compose drafts (`workspace_create_draft`), send emails (`workspace_send_email`).
  - **Google Calendar**: Today's agenda & upcoming meetings (`workspace_get_calendar_events`), schedule events (`workspace_create_calendar_event`).
  - **Google Drive**: Search & list files (`workspace_list_drive_files`), upload assets (`workspace_upload_drive_file`), cross-device cloud memory sync (`workspace_sync_drive`).
  - **Google Docs**: Create docs (`workspace_create_doc`), read doc contents (`workspace_read_doc`), append notes (`workspace_append_doc`).
  - **Google Sheets**: Create spreadsheets (`workspace_create_sheet`), read cell ranges (`workspace_read_sheet`), append tabular rows (`workspace_append_sheet_row`).
  - **Google Tasks**: List to-do tasks (`workspace_list_tasks`), create tasks (`workspace_create_task`), mark tasks completed (`workspace_complete_task`).
  - **Google Contacts (People API)**: Search address book by name/email/phone (`workspace_search_contacts`).
  - **Google Slides & Forms**: Create presentation decks (`workspace_create_slides`), create forms/surveys (`workspace_create_form`).
- **Executive Morning Briefing (`workspace_startup_rundown`)**:
  - Automated multi-stream synthesis on system boot: inspects unread messages, pending tasks, and today's schedule, speaking a crisp natural executive brief in Vega / Leda's voice.
- **Google Takeout Gemini Chat Importer (`import_gemini_takeout`)**:
  - Ingests past conversation archives from Google Takeout (`takeout.google.com` → Gemini Apps), parses prompts and answers, extracts user preferences and project milestones, and updates the Knowledge Graph + Obsidian Second Brain (`Gemini Imported Chats Chronicle.md`).
- **Program Directory & Self-Maintenance Consciousness (Rule 5)**:
  - Gemini is now explicitly aware of her local codebase directory (`c:\Users\Ryan\.gemini\antigravity\workspaces\Assistant_Integrated_Advanced`) and AppData config directory (`%APPDATA%\gemini-desktop-live`).
  - Authorized to safely inspect, tweak, and adjust her own application files and boot directives for Ryan, bound by a strict rule never to make destructive edits that could crash or kill the application.
- **Hardware Telemetry Deck on Right HUD**:
  - Replaced redundant camera snapshot button with a live cyber-glass telemetry deck displaying CPU thermal zones (°C/°F), operating frequency (GHz/MHz), RAM pressure, and battery status.

### Fixed
- **Monitor Physical DPI Calibration & Edge Inset Remapping**:
  - Resolved 125% Windows DPI scaling discrepancy ($1536 \times 864$ DIPs vs $1920 \times 1080$ physical).
  - Remapped extreme right and bottom cursor boundaries with safe 28px viewable insets, ensuring the cursor icon remains 100% visible across the entire display.
  - Elongated Right HUD height from 640px to 840px to eliminate vertical scrolling.

---

## [2.0.0] — 2026-10-14 (Major Milestone Release)
### Added
- **GEMINI // WORKSPACE DECK (4th Desktop Window)**:
  - Dedicated on-demand floating window featuring a multi-tab Chromium Web Browser, Monaco Code Editor with full VS syntax highlighting, and Windows File Explorer.
  - Integrated local live dev server (`http://127.0.0.1:4242`) with automatic hot-reload on file edits.
- **10 Native Windows Subsystems**:
  1. *UIAutomation Engine (`UIADriver.exe`)*: Programmatic native control tree search and clicking (`find_ui_element`, `click_ui_element`).
  2. *Offline Windows OCR (`ocr_screen_region`)*: Pixel-level text extraction from screen regions using `Windows.Media.Ocr.OcrEngine` without cloud delays.
  3. *Window Choreographer*: Native window listing, snapping, focusing, and closing (`list_windows`, `focus_window`, `snap_window`, `close_window`).
  4. *Master Volume & Media Control*: Direct media key synthesis (`media_control`).
  5. *Action Center Desktop Notifications*: Native Windows toast banners (`system_notify`).
  6. *Clipboard Engine*: Read and write to Windows clipboard (`clipboard_get`, `clipboard_set`).
  7. *Global Hotkeys*: `Ctrl+Shift+W` (Workspace Deck), `Ctrl+Alt+Space` (Mute Toggle), `Ctrl+Shift+Space` (Wake/Standby).
  8. *Watchdog & Auto-Reconnect*: 15s health check and 45s silence auto-recovery.
  9. *Physical High-DPI Cursor Driver*: Upgraded `CursorDriver.exe` with physical resolution query.
  10. *Situational Awareness Boot Memory*: High-density situational briefing injected into Gemini Live system prompt on boot.

---

## [1.5.0] — 2026-10-07
### Added
- Prototype of the 4th Workspace Deck window.
- IPC bridge between central Electron process and Workspace Deck webviews.
- Hotkey binding (`Ctrl+Shift+W`) for fast toggle.

---

## [1.0.0] — 2026-10-05
### Added
- **Chromium WebRTC APM AEC3 Audio Pipeline**:
  - Integrated native acoustic echo cancellation, automated gain control, and noise suppression.
  - Half-duplex 450ms reverb gating to eliminate audio feedback loops.
- **Gemini 3.8 Live & Extended Thinking Switcher**:
  - Dual-mode selector for standard low-latency voice or deep multi-step reasoning.
- **COG Warfare (Gears of War) Custom Skin**:
  - Riveted steel armor, molten rotating skull, custom intro audio, and Marcus Fenix voice integration.
- **Windows Safety Guardrails (`safety-guard.js`)**:
  - Kernel-grade protection preventing destructive deletion of Windows operational files (`C:\Windows`, system processes, volume formats).
- **Long-Term Memory Manager (`memory-manager.js`)**:
  - Persistent knowledge graph, user profile preferences, session chronicles, and Obsidian Second Brain sync.

---

## [0.5.0] — 2026-10-01
### Added
- Initial project architecture: 3-window transparent floating HUD (Central Voice Orb, Left Control Hub, Right Perception HUD).
- Real-time bidirectional audio streaming via Gemini Live WebSocket API (`@google/genai`).
- Native Win32 mouse/keyboard driver (`CursorDriver.exe`).
- Left Switchboard for MCP servers and hardware monitoring.
