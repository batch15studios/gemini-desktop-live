# Changelog — Gemini Desktop Live

All notable changes, version milestones, and architectural revisions to `gemini-desktop-live` (`Assistant_Integrated_Advanced`) are documented in this file.

---

## [2.6.4] — 2026-10-18
### Security & Robustness Hardening (CodeRabbit Deep Audit)
- **CWE-78 Command Injection Mitigation (`window-tools.js`)**:
  - `snapWindow`: Hardened `position` validation against a strict whitelist Set (`maximize`, `minimize`, `left`, `right`, `top`, `bottom`, `center`, `restore`) and enforced integer parsing on `pid` before passing to PowerShell command strings.
  - `mediaControl`: Eliminated shell execution (`exec`) in favor of direct parameterized binary execution (`execFile`) with strict command whitelist validation and bounded iteration count (`times`).
- **CWE-552 Sensitive File Exposure & CORS Restriction (`workspace-ipc.js`)**:
  - Restricted internal HTTP dev server CORS headers to loopback origin (`http://localhost:${actualPort}`).
  - Implemented access block lists guarding against access to `.env`, `.git`, credentials, tokens, secrets, private keys (`.pem`, `.key`), and `assistant_memory.json`.
- **CWE-834 Denial of Service via Unbounded Loop (`assets/bin/CursorDriver.cs`)**:
  - Bounded media loop repetition count to a maximum of 50 iterations using `int.TryParse` and `Math.Min(parsedTimes, 50)`.
  - Recompiled `CursorDriver.exe` via .NET Framework 4.0 64-bit compiler with full backward compatibility.
- **CWE-79 Cross-Site Scripting (XSS) in File Explorer (`renderers/workspace/workspace.js`)**:
  - Wrapped `item.name`, `item.dateModified`, `item.type`, and `item.size` with `escapeHtml()` when generating the file explorer directory listing.
- **CWE-184 / Email Header Injection Mitigation (`google-workspace-manager.js`)**:
  - Stripped `\r` and `\n` characters from `to` recipient addresses in `sendEmail` and `createDraft` prior to constructing raw MIME payloads.
- **CWE-407 Sync I/O Denial of Service (`google-workspace-manager.js`, `memory-manager.js`)**:
  - Capped Google Takeout conversation ingestion at 100 entries.
  - Added batching support (`autoSave = false`) to `saveMemoryItem` to prevent repeated synchronous disk writes and Obsidian note writes on every item loop.
- **CWE-22 / CWE-180 Path Traversal Protection (`research-database.js`)**:
  - Bound `exportToCsv` output file resolution to `safetyGuard.assertPathSafety(fileName, 'write')` to prevent arbitrary file overwrites or targeting of protected Windows core directories.
- **CWE-209 Sensitive Object & Buffer Logging (`gemini-live-engine.js`)**:
  - Sanitized realtime WebSocket streaming error logs in `sendAudioChunk`, `sendAudioStreamEnd`, `sendVideoFrame`, and `sendTextMessage` to output `e?.message` rather than dumping raw error objects that may expose buffer pointers or authentication headers.

---

## [2.6.3] — 2026-10-18
### Fixed & Improved
- **DOM & XSS Sanitization in Task Log (`renderers/left/left.js`)**:
  - Replaced unescaped `innerHTML` assignment in `addLogEntry` with safe DOM nodes (`textContent` and `createTextNode`). Eliminates any risk of malformed HTML parsing or script injection from speech transcriptions, LLM markdown artifacts, or tool logs.
- **Defensive File I/O & Directory Resolution (`native-tools.js`)**:
  - Wrapped `readFile` in `try...catch` with clean error messages for locked or inaccessible files.
  - Wrapped `listDirectory` in `try...catch` and guarded `fs.statSync` against broken symlinks and unreadable system files.
  - Fixed Context7 catch block in `callMcpTool` to return an explicit error object (`{ error: ... }`) instead of silently falling through to the generic schema fallback.
- **Vision Stream Interval Lifecycle (`renderers/right/right.js`)**:
  - Added `stopPeriodicVisionLoopIfNeeded()`. When both the webcam and screen share are stopped, the 2.5-second `setInterval` is cleanly cleared from memory instead of ticking indefinitely.
- **Microphone AudioContext Suspended State Safeguard (`renderers/orb/orb.js`)**:
  - Added an automatic `.resume()` check on the 16kHz microphone `audioContext` to prevent Windows audio subsystem sleep states from delaying speech capture.
- **UI UTF-8 Character Normalization (`renderers/workspace/workspace.js`)**:
  - Standardized temporary button copy feedback using `textContent = '✓'`.

---

## [2.6.2] — 2026-10-18
### Fixed & Improved
- **Natural Startup Greetings (No Unprompted Recitations)**:
  - Refined behavioral directives in `memory-manager.js`, `gemini-live-engine.js`, and `main.js`.
  - Removed prompt phrasing that compelled the assistant to announce version numbers or hardware specs upon greeting.
  - The assistant now greets naturally with situational readiness while retaining deep, silent internal cognition of Ryan's hardware, active model, and tool suite for tasks and explicit questions.
- **Process Execution Hardening & Timeout Guards**:
  - Hardened `runPowerShell` in `native-tools.js` with `timeout: 30000`, null-safe string trimming, and exitCode 124 timeout handling.
  - Added `timeout: 8000` to `runCursorDriver` (`CursorDriver.exe`) and `timeout: 15000` to `runUiaDriver` (`UIADriver.exe`) to prevent UIAutomation freezes when scanning unresponsive desktop windows.
  - Added `timeout: 10000` to `tasklist /v /fo csv` in `window-tools.js`.
  - Added `timeout: 30000` to `workspace:exec-cmd` and chat-send commands in `workspace-ipc.js`.
- **Global Process Crash Shields**:
  - Implemented `uncaughtException` and `unhandledRejection` handlers in `main.js` to safeguard the Electron main process from unexpected async rejections or pipe errors.
- **CodeRabbit Integration**:
  - Added `.coderabbit.yaml` repository configuration with custom review instructions safeguarding the 16kHz/24kHz WebRTC APM AEC3 audio streaming pipeline and native driver integrity.

---

## [2.6.1] — 2026-10-18
### Fixed & Improved
- **Dynamic Version Synchronization Across All Prompts & Boot Memory**:
  - Eliminated hardcoded version numbers (`v2.3.0`, `v2.0.0`, `v2.4.0`) inside `memory-manager.js` and `gemini-live-engine.js`.
  - Tied boot memory context, system directives, session status logs, and memory state dynamically to `package.json` (`pkg.version`).
  - When loading persistent memory from disk, automatically synchronizes `systemEnvironment.version` and the `gemini-desktop-live` ongoing project entry to the active `pkg.version`.
  - Added dynamic `appVersion` (`v${pkg.version}`) to the `get_system_status` native tool output.
- **Explicit Gemini Model Engine Consciousness**:
  - Injected explicit self-awareness parameters into the live engine's `systemInstruction`:
    - `- Active AI Model Engine: "${this.model}" (Google Gemini Live Multimodal WebSocket API)`
    - `- Active Voice Synthesizer: "${this.voiceName}" (Real-time 24kHz PCM audio)`
    - `- Application Version: v${appVersion}`
  - Updated behavioral directives to ensure the assistant knows exactly what model and voice it is running on and can report it accurately whenever asked.
  - Updated the automated startup executive briefing event (`[SYSTEM EVENT: STARTUP EXECUTIVE RUNDOWN]`) in `main.js` to dynamically supply `app.getVersion()` and `this.config.model`.

---

## [2.6.0] — 2026-10-18
### Removed & Cleaned (Anti-Bloat Initiative)
- **Purged Gears of War Audio Bloat**:
  - Removed ~30 MB of audio bloat: deleted `assets/gears-intro.mp3` and `assets/skins/gears/audio/` quote pack (`gears-of-war-3-marcus-fenix-quotes.mp3`, `marcus-*.mp3`).
  - Removed all Marcus Fenix sound clip preloading, decoding, and speech quote triggers from `orb.js` and `left.js`.
  - Removed `#inputGearsVoice` custom voice ID override field and `gearsVoice` branching from `main.js` and `renderers/left/index.html`.
- **Streamlined Palettes to 3 Core Choices**:
  - Reduced palette selector down to **Cyber Cyan** (Original Nexus Prime), **Enterprise Slate** (Native Windows Studio), and **Custom Palette** (Dynamic studio color engine).
  - Built an interactive custom color picker (`#customColorPicker`) and hex input (`#customColorHex`) in the Left Dock settings allowing dynamic selection of any accent color with on-the-fly calculation of glows, borders, and audio visualizer wave gradients.
- **MCP Server Pruning**:
  - Pruned non-essential and redundant MCP servers from discovery (`science_biomolecular_structure_viewer_mcp`, `tauri`, `genkit-mcp-server`, `data-agent-kit-plugin_dak-notebook`, `data-agent-kit-plugin_dak-viz`, `gemini-api-docs`, `firebase-mcp-server`).
  - Defaulted active MCP suite strictly to Ryan's approved daily core: `memory`, `filesystem`, `github`, `chrome-devtools-mcp`, `context7`, `sequential-thinking`, `firebase`, and `gcloud`.

### Fixed & Improved
- **Shadowless, Non-Clipping Orb Context Menu**:
  - **Eliminated Muddy Drop Shadow**: Replaced the murky `0 12px 32px rgba(0,0,0,0.65)` box shadow on `.orb-context-menu` with a razor-sharp `inset 0 1px 0 rgba(255, 255, 255, 0.12)` highlight. Zero dark smudge or box artifacts on the transparent window.
  - **Smart Bidirectional Flip**: Upgraded `showContextMenu(e)` to calculate live menu dimensions via `getBoundingClientRect()`. When clicking on the lower half of the Orb, the menu pops **UPWARDS** (`e.clientY - menuH`); when clicking on the top half, it pops **DOWNWARDS**.
  - **Expanded Window Headroom**: Expanded `orbWindow` size from 360px to 420px, providing 50px of transparent breathing room so the context menu never clips or gets cut off regardless of where the user right-clicks on the Orb.
  - **Square Corners in Studio Pro**: Styled `.orb-context-menu` and menu items with `border-radius: 0px` when `pro-studio` skin is active.
- **Auto-Tuck Side Docks on Workspace Deck Open**:
  - When the Workspace Command Deck is opened (`Alt+W` or via the Orb context menu), the Left Control Hub and Right Activity HUD automatically tuck away (hide) to eliminate window clutter and overlap on 1080p displays.
  - When the Workspace Deck is minimized, closed, or hidden, the side docks automatically restore to their previous state.
- **Preserved Industrial Cog Gear Orb Visual**:
  - Re-architected the mechanical gear canvas animation as the `cog-gear` ("Industrial Cog") visual skin.
  - Dual-counter-rotating 12-tooth outer and 8-tooth inner precision gears render smoothly on a procedural 60 FPS vector canvas, pulsing dynamically to voice audio (speaking/listening) and matching the active theme's colors without any audio bloat or crimson omen imagery.

---

## [2.5.1] — 2026-10-18
### Fixed & Improved
- **Sharp Square Corners for Enterprise Skin (`pro-studio`)**:
  - Configured `[data-skin="pro-studio"]` across all panels (`.glass-card`, `.deck-container`, `.card-header`, `.deck-titlebar`, `.mini-toolbar`, tabs, inputs, buttons) to use **crisp 90-degree square corners** (`border-radius: 0px !important`).
  - Delivers an authentic native Windows enterprise desktop look, matching developer environments, CAD software, and system monitoring utilities.
- **Removed Outer Drop-Shadows & Square Bounding Box Artifacts**:
  - Eliminated the wide `0 10px 30px rgba(0, 0, 0, 0.4)` drop shadows that previously reached the transparent Electron window edges and caused tacky rectangular corner artifacts.
  - Replaced across all themes with clean `inset 0 0 20px` internal illumination and flush 1px border outlines so transparent window regions remain 100% invisible.
- **Synchronized Theme & Skin on Workspace Deck**:
  - Wired live `onSkinChanged` and `onThemeChanged` listeners in `renderers/workspace/workspace.js` so the 4th Workspace Deck window matches the active visual skin and square corners seamlessly.
- **Microphone Unmute Ergonomics & Global Hotkeys**:
  - **Click-to-Unmute on Orb**: When muted, clicking the Orb directly unmutes the microphone immediately.
  - **Global Hotkeys**: Registered `Alt+M` and `CommandOrControl+Shift+M` (alongside `Ctrl+Alt+Space`) as system-wide mute/unmute toggles operable from any game, browser, or application.
  - **Gemini Audio Awareness**: Updated system prompt so Gemini proactively reminds Ryan that microphone audio transmission is stopped during mute for privacy, and explains that he can unmute anytime by clicking the Orb, using the right-click menu, or pressing `Alt+M`.

---

## [2.5.0] — 2026-10-18
### Added
- **Enterprise Slate & Studio Pro Mode (Native Windows Enterprise Look)**:
  - **Color Palette (`enterprise-pro`)**: Native Windows 11 Acrylic & Mica inspired palette with Microsoft Azure Blue (`#0078d4`), light titanium slate (`#38bdf8`), deep obsidian backing (`#0b111e`), crisp typography, and non-distracting subtle rim illumination.
  - **Visual Skin (`pro-studio`)**: "Studio Pro Lens" — A precision-engineered optical telemetry aperture with concentric precision calibration rings, 24-division degree tick marks, rotating index reticles, studio visualizer rings, and silky audio-reactive dampening that matches native Windows 11 enterprise tools and pro audio workstations.
  - Added full card selectors for both **Studio Pro Lens** and **Enterprise Slate** in the Left Dock settings.
- **Clean Floating Orb & Holographic Right-Click Context Menu**:
  - Removed the bottom button pill (`.orb-controls`) from the center Orb interface, leaving only the pristine floating Orb and the dynamic state badge.
  - Built a sleek, futuristic Right-Click Context Menu (`#orbContextMenu`) on the Orb with zero emojis and 100% precision SVG iconography.
  - Provides quick access to Mute/Unmute Microphone, Toggle Always on Top (Pin), Universal Minimize, Minimize to System Tray, Open Workspace Command Deck, Open Left Settings & MCP Switchboard, and Exit Application.
- **Native Screenshot Tool (`take_screenshot`)**:
  - Added native `take_screenshot` tool callable by voice command.
  - Captures high-resolution screen, auto-saves a timestamped PNG in `Pictures/Screenshots` (or Desktop), copies the image directly to the Windows clipboard, and displays a native Action Center toast notification.
- **Voice-Activated Assistant Control (`assistant_control`)**:
  - Added native `assistant_control` tool enabling voice commands: *"disconnect"* (terminates live call), *"minimize all"* / *"hide"* (morphs to top mini toolbar), *"restore all"* (restores desktop suite), *"mute"* / *"unmute"*, or *"shut down"* / *"quit"*.
- **Universal Minimize Architecture (`main.js`)**:
  - Updated `setMiniMode(true)`, `toggleVisibility()`, and `window:minimize-tray` (`all`) to coordinate across all 4 windows (`orbWindow`, `leftWindow`, `rightWindow`, and `workspaceWindow`).
- **Dynamic Tasking Badge (`renderers/orb/orb.js`)**:
  - Upgraded `stateBadge` on the center Orb to display the exact friendly task name during long-running tool executions (e.g. `TAKE SCREENSHOT`, `SEARCHING WEB...`, `FIND LOCAL BUSINESS LEADS...`) with gold status accenting, automatically restoring to IDLE/SPEAKING upon completion.

---

## [2.4.1] — 2026-10-16
### Added
- **Visual Research & Leads Database Dashboard (4th Tab in Workspace Deck)**:
  - Added direct **Mode Navigation Tab Bar (`.deck-mode-tabs`)** in the Workspace Deck titlebar with 4 dedicated tabs: **Web Browser (`Alt+1`)**, **Code IDE (`Alt+2`)**, **File Explorer (`Alt+3`)**, and **Research Database (`Alt+4`)** featuring real-time lead count badges.
  - Built **View 4: Research & Leads Database (`#viewDatabase`)**:
    - **Live Metric Counter Deck**: Instant visual metrics for Total Leads, No Website (Target Prospects), Emails Discovered, Emails Sent, and Active Zip Codes.
    - **Collection Switcher Pills**: One-click switching between `Business Leads` (`business_leads`), `Websites Directory` (`websites_directory`), and `Task Datasets` (`task_datasets`).
    - **Real-Time Search & Precision Filters**: Instant keyword filtering across business names/trades, Zip Code selector, Outreach Status dropdown (`Discovered`, `Draft Created`, `Email Sent`), and Website Status filter (`No Website Only`, `Has Website`).
    - **Interactive Multi-Column Data Grid**: Sticky header, custom status badges, click-to-copy buttons for phone and email, and full row selection.
    - **Lead Pitch & Diagnostic Slide-Over Drawer (`#dbDetailDrawer`)**: Inspect the full generated outreach email draft, subject, tech stack breakdown, and diagnostic pitch angle with a 1-click "Copy Email" button.
    - **CSV Export & Hot Refresh Buttons**: Direct UI buttons to export filtered results to CSV spreadsheet or trigger a live disk refresh.
  - Added backend IPC channels (`workspace:db-summary`, `workspace:db-query`, `workspace:db-export-csv`, `workspace:db-updated`) and wired `workspace_deck(mode: 'database')` so Gemini can open the visual database dashboard on voice/chat command.

---

## [2.4.0] — 2026-10-16
### Added
- **Dedicated Local Structured Research & Lead Database (`research-database.js`, `native-tools.js`, `web-scraper-lead-engine.js`, `gemini-live-engine.js`)**:
  - Built `ResearchDatabase` (`%APPDATA%\gemini-desktop-live\research_database.json`) to store high-volume structured records separately from Ryan's Obsidian Second Brain so bulk business leads, large website directories, and lengthy multi-step research datasets do not clutter the Obsidian markdown vault or Graph View.
  - Supports 3 dedicated collections with automatic deduplication and indexed filtering:
    - `business_leads`: Stores local business leads across zip codes and categories, including phone, email, website status, CMS/tech stack, AI widget detection, tailored Batch15Studios pitch angle, and outreach lifecycle status (`discovered` -> `draft_created` -> `email_sent`).
    - `websites_directory`: Stores large lists of websites, domains, tech stack audits, and extracted contact info.
    - `task_datasets`: Stores named structured datasets from lengthy research tasks for instant precision recall later.
  - Added 4 native Gemini tools: `db_save_records`, `db_query_records`, `db_get_summary`, and `db_export_csv`.
  - Automatically wired `find_local_business_leads` and `send_approved_lead_emails` to persist and update lead statuses in `ResearchDatabase`.

### Fixed
- **Floating Minimized Pill (`.mini-toolbar`) & Orb Control Bar Drop Shadow (`main.js`, `renderers/orb/orb.css`, `assets/themes.css`)**:
  - Updated `setMiniMode()` window bounds in `main.js` from `420x46` (`padding: 0`) to `448x70` with `14px` transparent padding around `.mini-toolbar`, and replaced the wide `box-shadow` + `backdrop-filter` bounding box with a smooth `0 2px 8px` + `0 0 8px` pill-contoured rim glow that never clips at the rectangular window border.

### Removed
- **Full Codebase Audit & Tidy-Up**:
  - Removed unused leftover media/icon test assets (`assets/PXL_20261001_073001610.mp4`, `assets/original-reference-icon.jpg`, `assets/app-icon-generated.jpg`), temporary root artifacts, and redundant `autoFitWindow()` dead code in `renderers/right/right.js`.

---

## [2.3.2] — 2026-10-16
### Fixed
- **Window Drop Shadows & Sharp Rectangular Corner Artifacts (`main.js`, `renderers/left/left.css`, `renderers/right/right.css`, `renderers/workspace/workspace.css`, `assets/themes.css`)**:
  - Disabled Windows DWM native rectangular frame shadow (`hasShadow: false`) on `leftWindow`, `rightWindow`, and `workspaceWindow` in `main.js` (matching `orbWindow`), preventing the OS compositor from drawing a sharp 90-degree rectangular shadow around the transparent `BrowserWindow` bounds.
  - Replaced the oversized `0 16px 40px` outer `box-shadow` (which was getting guillotined at the `10px` window padding boundary into a stiff rectangular box) with a balanced `14px` outer padding and a tight, smooth `0 2px 8px` + `0 0 8px` rim glow that feathers completely to `0` alpha inside the rounded `16px` card corners.

---

## [2.3.1] — 2026-10-16
### Changed
- **Right-Side Vision & Spatial HUD (`renderers/right/index.html`, `renderers/right/right.css`, `renderers/right/right.js`)**:
  - Eliminated all unused vertical space at the bottom of the Right HUD by converting `.hud-body` and `.monitor-card` to a dynamic flex-fill architecture.
  - Expanded **Webcam Perception (`.webcam-card`)** to `flex: 2.15` (with `flex: 1` on `.video-container`), more than doubling the live camera feed viewport height and upgrading capture resolution to `1280x720` ideal while pinning the **Hardware Telemetry Deck** flush against the bottom edge.
- **Workspace Command Center Start Page (`preview.html`, `renderers/workspace/workspace.html`, `renderers/workspace/workspace.js`)**:
  - Replaced the placeholder `"Localhost Live Preview"` heading and template in `preview.html` with the **GEMINI // WORKSPACE COMMAND DECK** start hub featuring an interactive URL/search navigation bar, architectural cards for the **Web Browser (`Alt+1`)**, **Code IDE (`Alt+2`)**, and **File Explorer (`Alt+3`)**, and quick-launch links.
  - Renamed the File Explorer right-hand pane from `"PREVIEW PANE"` to `"SOURCE INSPECTOR"` (`"Open in Code IDE"`).
- **Zero-Emoji Structured Vector SVG Iconography (`renderers/workspace/workspace.html`, `renderers/workspace/workspace.js`, `renderers/left/left.js`, `renderers/left/left.css`, `native-tools.js`, `web-scraper-lead-engine.js`)**:
  - Removed all emojis across every dropdown menu, file explorer table, MCP server switchboard card, activity log stream, and HTML report button.
  - Replaced them with structured, theme-reactive inline SVG vector icons (`stroke="currentColor"`) that automatically inherit `--theme-accent` across all color palettes and the COG Warfare skin.

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
