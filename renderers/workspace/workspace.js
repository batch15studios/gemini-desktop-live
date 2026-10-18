/**
 * workspace.js
 * Frontend logic for GEMINI // WORKSPACE DECK
 * Handles unified Web Browser, IDE (14/70/16 with Monaco), and File Explorer.
 */

(function () {
  'use strict';

  // State Management
  let currentMode = 'browser'; // 'browser' | 'ide' | 'explorer'
  let currentProjectDir = '';
  let activeFilePath = 'preview.html';
  let openTabs = ['preview.html', 'main.js', 'safety-guard.js'];
  let fileCache = {}; // path -> content
  let monacoEditor = null;
  let monacoLoaded = false;
  let isLeftCollapsed = false;
  let isRightCollapsed = false;
  let selectedExplorerItem = null;

  // DOM Elements
  const deckContainer = document.getElementById('deckContainer');
  const btnTitleDropdown = document.getElementById('btnTitleDropdown');
  const deckPopoutMenu = document.getElementById('deckPopoutMenu');
  const deckModeTabs = document.getElementById('deckModeTabs');
  const btnWinMinimize = document.getElementById('btnWinMinimize');
  const btnWinMaximize = document.getElementById('btnWinMaximize');
  const btnWinClose = document.getElementById('btnWinClose');

  // Views
  const viewIde = document.getElementById('viewIde');
  const viewExplorer = document.getElementById('viewExplorer');
  const viewBrowser = document.getElementById('viewBrowser');
  const viewDatabase = document.getElementById('viewDatabase');

  // Database Elements
  const dbTabBadge = document.getElementById('dbTabBadge');
  const dbCollectionPills = document.getElementById('dbCollectionPills');
  const dbSearchInput = document.getElementById('dbSearchInput');
  const dbClearSearch = document.getElementById('dbClearSearch');
  const dbFilterZip = document.getElementById('dbFilterZip');
  const dbFilterStatus = document.getElementById('dbFilterStatus');
  const dbFilterWebsite = document.getElementById('dbFilterWebsite');
  const btnDbExportCsv = document.getElementById('btnDbExportCsv');
  const btnDbRefresh = document.getElementById('btnDbRefresh');
  const metricTotalLeads = document.getElementById('metricTotalLeads');
  const metricNoWebsite = document.getElementById('metricNoWebsite');
  const metricWithEmail = document.getElementById('metricWithEmail');
  const metricEmailsSent = document.getElementById('metricEmailsSent');
  const metricZipCodes = document.getElementById('metricZipCodes');
  const dbPathTag = document.getElementById('dbPathTag');
  const dbTimeTag = document.getElementById('dbTimeTag');
  const dbTableHead = document.getElementById('dbTableHead');
  const dbTableBody = document.getElementById('dbTableBody');
  const dbEmptyState = document.getElementById('dbEmptyState');
  const dbDetailDrawer = document.getElementById('dbDetailDrawer');
  const btnDrawerClose = document.getElementById('btnDrawerClose');
  const drawerBusinessName = document.getElementById('drawerBusinessName');
  const drawerStatusBadge = document.getElementById('drawerStatusBadge');
  const drawerCategory = document.getElementById('drawerCategory');
  const drawerLocation = document.getElementById('drawerLocation');
  const drawerPhone = document.getElementById('drawerPhone');
  const drawerEmail = document.getElementById('drawerEmail');
  const drawerWebsite = document.getElementById('drawerWebsite');
  const drawerPitchAngle = document.getElementById('drawerPitchAngle');
  const drawerEmailSubject = document.getElementById('drawerEmailSubject');
  const drawerEmailBody = document.getElementById('drawerEmailBody');
  const btnCopyPitch = document.getElementById('btnCopyPitch');

  // IDE Elements
  const ideTabsContainer = document.getElementById('ideTabsContainer');
  const ideFileList = document.getElementById('ideFileList');
  const idePaneLeft = document.getElementById('idePaneLeft');
  const idePaneCenter = document.getElementById('idePaneCenter');
  const idePaneRight = document.getElementById('idePaneRight');
  const btnCollapseFiles = document.getElementById('btnCollapseFiles');
  const btnToggleLeft = document.getElementById('btnToggleLeft');
  const btnToggleRight = document.getElementById('btnToggleRight');
  const btnSaveFile = document.getElementById('btnSaveFile');
  const btnLaunchBrowser = document.getElementById('btnLaunchBrowser');
  const monacoEditorContainer = document.getElementById('monacoEditorContainer');
  const fallbackEditorContainer = document.getElementById('fallbackEditorContainer');
  const fallbackTextarea = document.getElementById('fallbackTextarea');
  const fallbackLineNumbers = document.getElementById('fallbackLineNumbers');
  const ideChatStream = document.getElementById('ideChatStream');
  const ideLogsStream = document.getElementById('ideLogsStream');
  const ideChatInput = document.getElementById('ideChatInput');
  const btnSendChat = document.getElementById('btnSendChat');

  // Explorer Elements
  const btnExplorerBack = document.getElementById('btnExplorerBack');
  const explorerPathInput = document.getElementById('explorerPathInput');
  const explorerTableBody = document.getElementById('explorerTableBody');
  const previewFileName = document.getElementById('previewFileName');
  const previewCodeText = document.getElementById('previewCodeText');
  const btnOpenInIde = document.getElementById('btnOpenInIde');

  // Browser Elements
  const btnBrowserBack = document.getElementById('btnBrowserBack');
  const btnBrowserForward = document.getElementById('btnBrowserForward');
  const btnBrowserReload = document.getElementById('btnBrowserReload');
  const browserUrlInput = document.getElementById('browserUrlInput');
  const btnBrowserGo = document.getElementById('btnBrowserGo');
  const btnEditSource = document.getElementById('btnEditSource');
  const deckWebview = document.getElementById('deckWebview');
  const browserActivitySpinner = document.getElementById('browserActivitySpinner');
  const browserLoadBar = document.getElementById('browserLoadBar');

  // =========================================================================
  // 1. WINDOW CONTROLS & POPUP MENU
  // =========================================================================
  btnWinMinimize.addEventListener('click', () => {
    if (window.workspaceApi) window.workspaceApi.minimizeRestore();
  });

  btnWinMaximize.addEventListener('click', () => {
    if (window.workspaceApi) window.workspaceApi.maximizeToggle();
  });

  btnWinClose.addEventListener('click', () => {
    disposeMonaco();
    if (window.workspaceApi) window.workspaceApi.close();
  });

  // Dropdown Menu Toggle
  btnTitleDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    deckPopoutMenu.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!deckPopoutMenu.contains(e.target) && e.target !== btnTitleDropdown) {
      deckPopoutMenu.classList.remove('open');
    }
  });

  // Menu Mode Switch
  deckPopoutMenu.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const mode = item.dataset.mode;
      switchMode(mode);
      deckPopoutMenu.classList.remove('open');
    });
  });

  // Mode Navigation Tabs in Titlebar (Direct Clickable Tabs)
  if (deckModeTabs) {
    deckModeTabs.querySelectorAll('.mode-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        if (mode) switchMode(mode);
      });
    });
  }

  // Keyboard Shortcuts (Alt+1: Browser, Alt+2: IDE, Alt+3: Explorer, Alt+4: Database)
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.key === '1') {
      e.preventDefault();
      switchMode('browser');
    } else if (e.altKey && e.key === '2') {
      e.preventDefault();
      switchMode('ide');
    } else if (e.altKey && e.key === '3') {
      e.preventDefault();
      switchMode('explorer');
    } else if (e.altKey && e.key === '4') {
      e.preventDefault();
      switchMode('database');
    } else if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      saveCurrentFile();
    }
  });

  // Unload event from backend
  if (window.workspaceApi && window.workspaceApi.onUnloaded) {
    window.workspaceApi.onUnloaded(() => {
      disposeMonaco();
    });
  }

  // AI Remote Automation Hooks (Invoked when Gemini calls workspace_deck)
  if (window.workspaceApi) {
    if (window.workspaceApi.onSetMode) {
      window.workspaceApi.onSetMode((mode) => {
        if (mode) switchMode(mode);
      });
    }
    if (window.workspaceApi.onNavigate) {
      window.workspaceApi.onNavigate((url) => {
        if (url) {
          switchMode('browser');
          browserUrlInput.value = url;
          navigateBrowser();
        }
      });
    }
    if (window.workspaceApi.onOpenFile) {
      window.workspaceApi.onOpenFile((filePath) => {
        if (filePath) {
          switchMode('ide');
          openFileTab(filePath);
        }
      });
    }
    if (window.workspaceApi.onDbUpdated) {
      window.workspaceApi.onDbUpdated(() => {
        updateDbBadge();
        if (currentMode === 'database') {
          loadDatabaseView();
        }
      });
    }
  }

  // =========================================================================
  // 2. MODE SWITCHING & MEMORY DISPOSAL
  // =========================================================================
  function switchMode(newMode) {
    if (currentMode === newMode) return;

    // Memory Disposal: Explicitly dispose Monaco when leaving IDE mode
    if (currentMode === 'ide' && newMode !== 'ide') {
      disposeMonaco();
    }

    currentMode = newMode;

    // Update Dropdown Active Pill
    deckPopoutMenu.querySelectorAll('.menu-item').forEach(item => {
      item.classList.toggle('active', item.dataset.mode === newMode);
    });

    // Update Titlebar Mode Tabs
    if (deckModeTabs) {
      deckModeTabs.querySelectorAll('.mode-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === newMode);
      });
    }

    // Update Views
    viewIde.classList.toggle('active', newMode === 'ide');
    viewExplorer.classList.toggle('active', newMode === 'explorer');
    viewBrowser.classList.toggle('active', newMode === 'browser');
    if (viewDatabase) viewDatabase.classList.toggle('active', newMode === 'database');

    if (newMode === 'ide') {
      initIde();
    } else if (newMode === 'explorer') {
      loadExplorerDirectory(currentProjectDir);
    } else if (newMode === 'browser') {
      initBrowser();
    } else if (newMode === 'database') {
      loadDatabaseView();
    }
  }

  // =========================================================================
  // 3. IDE VIEW & MONACO EDITOR INTEGRATION
  // =========================================================================
  function initIde() {
    renderTabs();
    loadFileList();
    loadFileContent(activeFilePath);
  }

  function getMonacoLanguage(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    switch (ext) {
      case 'js':
      case 'mjs':
      case 'cjs':
        return 'javascript';
      case 'ts':
        return 'typescript';
      case 'html':
      case 'htm':
        return 'html';
      case 'css':
        return 'css';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      case 'cs':
        return 'csharp';
      case 'bat':
      case 'cmd':
        return 'bat';
      case 'ps1':
        return 'powershell';
      default:
        return 'plaintext';
    }
  }

  function setupMonaco(content, filePath) {
    const lang = getMonacoLanguage(filePath);

    // If Monaco is already loaded via require
    if (window.monaco) {
      createMonacoInstance(content, lang);
      return;
    }

    // Try loading via require.config from CDN
    if (window.require && typeof window.require.config === 'function') {
      try {
        window.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });
        window.require(['vs/editor/editor.main'], function () {
          monacoLoaded = true;
          createMonacoInstance(content, lang);
        });
      } catch (err) {
        console.warn('[Workspace Deck] Monaco loader fallback:', err);
        setupFallbackEditor(content);
      }
    } else {
      setupFallbackEditor(content);
    }
  }

  function createMonacoInstance(content, language) {
    disposeMonaco();

    monacoEditorContainer.classList.remove('hidden');
    fallbackEditorContainer.classList.add('hidden');

    monaco.editor.defineTheme('gemini-dark-slate', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '5c7385', fontStyle: 'italic' },
        { token: 'keyword', foreground: '00e5ff', fontStyle: 'bold' },
        { token: 'string', foreground: '78dce8' },
        { token: 'number', foreground: 'ab9df2' },
        { token: 'identifier', foreground: 'e2f1ff' }
      ],
      colors: {
        'editor.background': '#080e15',
        'editor.foreground': '#e2f1ff',
        'editorLineNumber.foreground': '#2c4254',
        'editorLineNumber.activeForeground': '#00e5ff',
        'editorCursor.foreground': '#00e5ff',
        'editor.selectionBackground': '#0e3a52',
        'editor.lineHighlightBackground': '#0b1622',
        'editorGutter.background': '#060b10'
      }
    });

    monacoEditor = monaco.editor.create(monacoEditorContainer, {
      value: content,
      language: language,
      theme: 'gemini-dark-slate',
      automaticLayout: true,
      fontFamily: '"JetBrains Mono", Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 20,
      renderLineHighlight: 'all',
      minimap: { enabled: true, side: 'right' },
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
        useShadows: false
      },
      tabSize: 2,
      smoothScrolling: true
    });
  }

  function setupFallbackEditor(content) {
    monacoEditorContainer.classList.add('hidden');
    fallbackEditorContainer.classList.remove('hidden');
    fallbackTextarea.value = content;
    updateFallbackLineNumbers();

    fallbackTextarea.oninput = () => {
      updateFallbackLineNumbers();
    };
  }

  function updateFallbackLineNumbers() {
    const lines = fallbackTextarea.value.split('\n').length;
    let numbers = '';
    for (let i = 1; i <= Math.max(lines, 4); i++) {
      numbers += i + '<br>';
    }
    fallbackLineNumbers.innerHTML = numbers;
  }

  function disposeMonaco() {
    if (monacoEditor) {
      try {
        monacoEditor.dispose();
      } catch (e) {}
      monacoEditor = null;
    }
  }

  function getEditorContent() {
    if (monacoEditor) {
      return monacoEditor.getValue();
    }
    return fallbackTextarea.value;
  }

  function setEditorContent(content, filePath) {
    fileCache[filePath] = content;
    if (monacoEditor) {
      const model = monaco.editor.createModel(content, getMonacoLanguage(filePath));
      monacoEditor.setModel(model);
    } else {
      setupMonaco(content, filePath);
    }
  }

  // =========================================================================
  // 4. FILE OPERATIONS & TABS
  // =========================================================================
  async function loadFileContent(relativePath) {
    activeFilePath = relativePath;
    renderTabs();

    // Check cache
    if (fileCache[relativePath] !== undefined) {
      setEditorContent(fileCache[relativePath], relativePath);
      return;
    }

    if (window.workspaceApi) {
      const res = await window.workspaceApi.readFile(relativePath);
      if (res.success) {
        fileCache[relativePath] = res.content;
        setEditorContent(res.content, relativePath);
      } else {
        const fallbackText = `// File: ${relativePath}\n// Error loading file content: ${res.error || 'Not found'}`;
        setEditorContent(fallbackText, relativePath);
      }
    } else {
      setEditorContent(`// Running in local preview mode\n// Active file: ${relativePath}`, relativePath);
    }
  }

  async function saveCurrentFile() {
    const content = getEditorContent();
    fileCache[activeFilePath] = content;

    if (window.workspaceApi) {
      btnSaveFile.innerText = 'Saving...';
      const res = await window.workspaceApi.writeFile(activeFilePath, content);
      if (res.success) {
        btnSaveFile.innerText = 'Saved!';
        appendChatMsg('system', `File "${activeFilePath}" saved successfully.`);
      } else {
        btnSaveFile.innerText = 'Error';
        appendChatMsg('system', `Failed to save "${activeFilePath}": ${res.error}`);
      }
      setTimeout(() => { btnSaveFile.innerText = 'Save File'; }, 1600);
    } else {
      btnSaveFile.innerText = 'Saved!';
      setTimeout(() => { btnSaveFile.innerText = 'Save File'; }, 1600);
    }
  }

  btnSaveFile.addEventListener('click', saveCurrentFile);

  function renderTabs() {
    ideTabsContainer.innerHTML = '';
    openTabs.forEach(file => {
      const tab = document.createElement('div');
      tab.className = `ide-tab ${file === activeFilePath ? 'active' : ''}`;
      tab.dataset.file = file;

      const titleSpan = document.createElement('span');
      titleSpan.innerText = file;
      tab.appendChild(titleSpan);

      const closeSpan = document.createElement('span');
      closeSpan.className = 'tab-close';
      closeSpan.innerText = '×';
      closeSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(file);
      });
      tab.appendChild(closeSpan);

      tab.addEventListener('click', () => {
        loadFileContent(file);
        updateActiveFilePill();
      });

      ideTabsContainer.appendChild(tab);
    });

    updateActiveFilePill();
  }

  function closeTab(file) {
    if (openTabs.length <= 1) return; // Keep at least one tab open
    openTabs = openTabs.filter(f => f !== file);
    if (activeFilePath === file) {
      activeFilePath = openTabs[0];
      loadFileContent(activeFilePath);
    } else {
      renderTabs();
    }
  }

  function openFileTab(file) {
    if (!openTabs.includes(file)) {
      openTabs.push(file);
    }
    loadFileContent(file);
  }

  function updateActiveFilePill() {
    document.querySelectorAll('.file-item').forEach(el => {
      el.classList.toggle('active', el.dataset.path === activeFilePath);
    });
  }

  async function loadFileList() {
    if (!window.workspaceApi) return;
    const res = await window.workspaceApi.readDir(currentProjectDir);
    if (res.success && res.items) {
      ideFileList.innerHTML = '';
      res.items.forEach(item => {
        if (!item.isDirectory) {
          const div = document.createElement('div');
          div.className = `file-item ${item.name === activeFilePath ? 'active' : ''}`;
          div.dataset.path = item.name;
          div.innerText = item.name;
          div.addEventListener('click', () => {
            openFileTab(item.name);
          });
          ideFileList.appendChild(div);
        }
      });
    }
  }

  // Collapsible Panes
  function toggleLeftPane() {
    isLeftCollapsed = !isLeftCollapsed;
    idePaneLeft.classList.toggle('collapsed', isLeftCollapsed);
    if (monacoEditor) {
      setTimeout(() => monacoEditor.layout(), 260);
    }
  }

  function toggleRightPane() {
    isRightCollapsed = !isRightCollapsed;
    idePaneRight.classList.toggle('collapsed', isRightCollapsed);
    if (monacoEditor) {
      setTimeout(() => monacoEditor.layout(), 260);
    }
  }

  btnCollapseFiles.addEventListener('click', toggleLeftPane);
  btnToggleLeft.addEventListener('click', toggleLeftPane);
  btnToggleRight.addEventListener('click', toggleRightPane);

  // Chat & Command Bar
  function appendChatMsg(role, text) {
    const msg = document.createElement('div');
    msg.className = `chat-msg ${role}`;
    msg.innerText = text;
    ideChatStream.appendChild(msg);
    ideChatStream.scrollTop = ideChatStream.scrollHeight;
  }

  async function sendIdeChat() {
    const text = ideChatInput.value.trim();
    if (!text) return;

    appendChatMsg('user', text);
    ideChatInput.value = '';

    if (window.workspaceApi) {
      const res = await window.workspaceApi.sendChat(text);
      if (res && res.response) {
        appendChatMsg('assistant', res.response);
      }
    } else {
      appendChatMsg('assistant', `Echo: ${text}`);
    }
  }

  btnSendChat.addEventListener('click', sendIdeChat);
  ideChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendIdeChat();
  });

  // Chat / Logs Tabs
  document.querySelectorAll('.pane-tabs-header .tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.pane-tabs-header .tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.paneTab;
      ideChatStream.classList.toggle('active', target === 'chat');
      ideLogsStream.classList.toggle('active', target === 'logs');
    });
  });

  // Launch Browser Button
  btnLaunchBrowser.addEventListener('click', () => {
    switchMode('browser');
    if (activeFilePath.endsWith('.html') || activeFilePath === 'preview.html') {
      deckWebview.src = `../../${activeFilePath}`;
      browserUrlInput.value = activeFilePath;
    }
  });

  // =========================================================================
  // 5. FILE EXPLORER VIEW
  // =========================================================================
  async function loadExplorerDirectory(targetPath) {
    if (!window.workspaceApi) return;
    const res = await window.workspaceApi.readDir(targetPath);
    if (!res.success) {
      console.warn('Could not read directory:', res.error);
      return;
    }

    currentProjectDir = res.currentDir;
    explorerPathInput.value = res.currentDir;
    explorerTableBody.innerHTML = '';

    const folderSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    const fileSvg = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

    res.items.forEach(item => {
      const tr = document.createElement('tr');
      tr.dataset.path = item.path;
      tr.dataset.name = item.name;
      tr.dataset.isDir = item.isDirectory;

      tr.innerHTML = `
        <td class="file-name-cell"><span class="explorer-item-icon">${item.isDirectory ? folderSvg : fileSvg}</span><span>${escapeHtml(item.name)}</span></td>
        <td>${escapeHtml(item.dateModified)}</td>
        <td>${escapeHtml(item.type)}</td>
        <td>${escapeHtml(item.size)}</td>
      `;

      tr.addEventListener('click', () => {
        selectExplorerRow(tr, item);
      });

      tr.addEventListener('dblclick', () => {
        if (item.isDirectory) {
          loadExplorerDirectory(item.path);
        } else {
          openFileTab(item.name);
          switchMode('ide');
        }
      });

      explorerTableBody.appendChild(tr);
    });

    // Auto-select first item or preview.html
    const defaultRow = explorerTableBody.querySelector('tr[data-name="preview.html"]') || explorerTableBody.querySelector('tr');
    if (defaultRow) {
      defaultRow.click();
    }
  }

  function selectExplorerRow(tr, item) {
    document.querySelectorAll('#explorerTableBody tr').forEach(r => r.classList.remove('selected'));
    tr.classList.add('selected');
    selectedExplorerItem = item;

    previewFileName.innerText = item.name;
    previewCodeText.innerText = 'Loading file contents...';

    if (item.isDirectory) {
      previewCodeText.innerText = `[Directory: ${item.name}]\nContains files and folders in workspace. Double-click to browse.`;
      return;
    }

    if (window.workspaceApi) {
      window.workspaceApi.readFile(item.path).then(res => {
        if (res.success) {
          previewCodeText.innerText = res.content.substring(0, 1500) + (res.content.length > 1500 ? '\n\n... [Content Truncated in Inspector]' : '');
        } else {
          previewCodeText.innerText = `Error reading file: ${res.error}`;
        }
      });
    }
  }

  btnOpenInIde.addEventListener('click', () => {
    if (selectedExplorerItem && !selectedExplorerItem.isDirectory) {
      openFileTab(selectedExplorerItem.name);
      switchMode('ide');
    }
  });

  btnExplorerBack.addEventListener('click', async () => {
    if (!window.workspaceApi) return;
    const res = await window.workspaceApi.readDir(currentProjectDir);
    if (res.parentDir && res.parentDir !== currentProjectDir) {
      loadExplorerDirectory(res.parentDir);
    }
  });

  explorerPathInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      loadExplorerDirectory(explorerPathInput.value.trim());
    }
  });

  // Quick Access Pinned Links
  document.getElementById('qaProjectRoot').addEventListener('click', () => {
    loadExplorerDirectory(currentProjectDir);
  });
  document.getElementById('qaAssets').addEventListener('click', () => {
    loadExplorerDirectory(currentProjectDir + '\\assets');
  });
  document.getElementById('qaRenderers').addEventListener('click', () => {
    loadExplorerDirectory(currentProjectDir + '\\renderers');
  });

  // =========================================================================
  // 6. WEB BROWSER VIEW
  // =========================================================================
  let devServerBaseUrl = 'http://127.0.0.1:4242';

  function initBrowser() {
    if (!deckWebview.src || deckWebview.src === 'about:blank') {
      const initialUrl = `${devServerBaseUrl}/preview.html`;
      deckWebview.src = initialUrl;
      browserUrlInput.value = initialUrl;
    }
  }

  btnBrowserBack.addEventListener('click', () => {
    if (deckWebview.canGoBack()) deckWebview.goBack();
  });

  btnBrowserForward.addEventListener('click', () => {
    if (deckWebview.canGoForward()) deckWebview.goForward();
  });

  btnBrowserReload.addEventListener('click', () => {
    deckWebview.reload();
  });

  function navigateBrowser() {
    let url = browserUrlInput.value.trim();
    if (!url) return;

    if (url === 'preview.html' || url.endsWith('.html')) {
      if (!url.startsWith('http') && !url.startsWith('file://')) {
        url = `${devServerBaseUrl}/${url.replace(/^(\.\.[\/\\])+/, '').replace(/^\/+/, '')}`;
      }
    } else if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
      url = 'https://' + url;
    }

    deckWebview.src = url;
  }

  btnBrowserGo.addEventListener('click', navigateBrowser);
  browserUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') navigateBrowser();
  });

  btnEditSource.addEventListener('click', () => {
    openFileTab('preview.html');
    switchMode('ide');
  });

  // Browser Loading & Activity Verification Indicators
  function setBrowserLoading(isLoading) {
    if (isLoading) {
      btnBrowserReload.classList.add('loading');
      if (browserActivitySpinner) browserActivitySpinner.classList.add('active');
      if (browserLoadBar) {
        browserLoadBar.classList.add('active');
        browserLoadBar.style.width = '75%';
      }
    } else {
      btnBrowserReload.classList.remove('loading');
      if (browserActivitySpinner) browserActivitySpinner.classList.remove('active');
      if (browserLoadBar) {
        browserLoadBar.style.width = '100%';
        setTimeout(() => {
          browserLoadBar.classList.remove('active');
          browserLoadBar.style.width = '0%';
        }, 300);
      }
    }
  }

  deckWebview.addEventListener('did-start-loading', () => {
    setBrowserLoading(true);
  });

  deckWebview.addEventListener('did-stop-loading', () => {
    setBrowserLoading(false);
  });

  deckWebview.addEventListener('did-fail-load', () => {
    setBrowserLoading(false);
  });

  deckWebview.addEventListener('did-navigate', (e) => {
    if (e.url) {
      browserUrlInput.value = e.url.replace(/^file:\/\/\/[A-Za-z]:\/.*?\//, '');
    }
    setBrowserLoading(false);
  });

  deckWebview.addEventListener('did-navigate-in-page', (e) => {
    if (e.url) {
      browserUrlInput.value = e.url.replace(/^file:\/\/\/[A-Za-z]:\/.*?\//, '');
    }
    setBrowserLoading(false);
  });

  // =========================================================================
  // 6. RESEARCH DATABASE & LEADS MANAGER VIEW
  // =========================================================================
  let currentDbCollection = 'business_leads';
  let cachedDbRecords = [];
  let cachedDbSummary = null;
  let activeLeadItem = null;

  async function updateDbBadge() {
    if (!window.workspaceApi || !window.workspaceApi.dbGetSummary) return;
    try {
      const summary = await window.workspaceApi.dbGetSummary();
      if (summary && summary.success && summary.tables) {
        cachedDbSummary = summary;
        const leadCount = summary.tables.business_leads?.totalRecords || 0;
        if (dbTabBadge) dbTabBadge.textContent = leadCount;
        const countBusinessLeads = document.getElementById('countBusinessLeads');
        if (countBusinessLeads) countBusinessLeads.textContent = leadCount;
        const countWebsites = document.getElementById('countWebsites');
        if (countWebsites) countWebsites.textContent = summary.tables.websites_directory?.totalRecords || 0;
        const countDatasets = document.getElementById('countDatasets');
        if (countDatasets) countDatasets.textContent = summary.tables.task_datasets?.totalDatasets || 0;
      }
    } catch (e) {
      console.warn('[Workspace DB] Error updating badge:', e);
    }
  }

  async function loadDatabaseView() {
    await updateDbBadge();
    await fetchAndRenderDbRecords();
    renderDbMetrics();
  }

  function renderDbMetrics() {
    if (!cachedDbSummary || !cachedDbSummary.tables) return;
    const leadsMeta = cachedDbSummary.tables.business_leads || {};
    if (metricTotalLeads) metricTotalLeads.textContent = leadsMeta.totalRecords || 0;
    if (metricNoWebsite) metricNoWebsite.textContent = leadsMeta.withoutWebsite || 0;
    if (metricWithEmail) metricWithEmail.textContent = leadsMeta.withEmail || 0;
    if (metricEmailsSent) metricEmailsSent.textContent = leadsMeta.emailsSent || 0;
    const zipCount = Object.keys(leadsMeta.byZipCode || {}).length;
    if (metricZipCodes) metricZipCodes.textContent = zipCount;
    if (dbPathTag && cachedDbSummary.databasePath) {
      dbPathTag.textContent = cachedDbSummary.databasePath.split('\\').pop() || 'research_database.json';
      dbPathTag.title = cachedDbSummary.databasePath;
    }
    if (dbTimeTag && cachedDbSummary.lastUpdated) {
      dbTimeTag.textContent = 'Synced ' + new Date(cachedDbSummary.lastUpdated).toLocaleTimeString();
    }

    // Populate Zip Code Filter
    if (dbFilterZip && leadsMeta.byZipCode) {
      const currentVal = dbFilterZip.value;
      dbFilterZip.innerHTML = '<option value="">All Zip Codes</option>';
      Object.keys(leadsMeta.byZipCode).sort().forEach(zip => {
        const count = leadsMeta.byZipCode[zip];
        const opt = document.createElement('option');
        opt.value = zip;
        opt.textContent = `${zip} (${count})`;
        if (zip === currentVal) opt.selected = true;
        dbFilterZip.appendChild(opt);
      });
    }
  }

  async function fetchAndRenderDbRecords() {
    if (!window.workspaceApi || !window.workspaceApi.dbQuery) return;
    try {
      const res = await window.workspaceApi.dbQuery({
        collection: currentDbCollection,
        limit: 250
      });
      if (res && res.success) {
        cachedDbRecords = res.records || [];
        applyDbFiltersAndRender();
      }
    } catch (err) {
      console.error('[Workspace DB] Failed to query database:', err);
    }
  }

  function applyDbFiltersAndRender() {
    const query = (dbSearchInput?.value || '').trim().toLowerCase();
    const zip = dbFilterZip?.value || '';
    const status = dbFilterStatus?.value || '';
    const webFilter = dbFilterWebsite?.value || '';

    let filtered = cachedDbRecords.filter(item => {
      if (query) {
        const textBlob = `${item.name || ''} ${item.category || ''} ${item.email || ''} ${item.phone || ''} ${item.domain || ''} ${item.pitchAngle || ''} ${item.address || ''} ${item.datasetName || ''}`.toLowerCase();
        if (!textBlob.includes(query)) return false;
      }

      if (currentDbCollection === 'business_leads') {
        if (zip && String(item.zipCode || '') !== zip && !(item.address || '').includes(zip)) return false;
        if (status && item.outreachStatus !== status) return false;
        if (webFilter === 'no_website' && item.hasWebsite !== false) return false;
        if (webFilter === 'has_website' && item.hasWebsite !== true) return false;
      }

      return true;
    });

    renderDbTable(filtered);
  }

  function renderDbTable(records) {
    if (!dbTableHead || !dbTableBody) return;

    if (!records || records.length === 0) {
      dbTableHead.innerHTML = '';
      dbTableBody.innerHTML = '';
      if (dbEmptyState) dbEmptyState.classList.remove('hidden');
      return;
    }

    if (dbEmptyState) dbEmptyState.classList.add('hidden');

    if (currentDbCollection === 'business_leads') {
      renderBusinessLeadsTable(records);
    } else if (currentDbCollection === 'websites_directory') {
      renderWebsitesTable(records);
    } else if (currentDbCollection === 'task_datasets') {
      renderDatasetsTable(records);
    }
  }

  function renderBusinessLeadsTable(records) {
    dbTableHead.innerHTML = `
      <tr>
        <th style="width: 4%;">#</th>
        <th style="width: 22%;">Business Name</th>
        <th style="width: 14%;">Trade / Category</th>
        <th style="width: 11%;">Zip / Location</th>
        <th style="width: 13%;">Phone</th>
        <th style="width: 15%;">Email Address</th>
        <th style="width: 12%;">Website Status</th>
        <th style="width: 9%;">Outreach</th>
      </tr>
    `;

    dbTableBody.innerHTML = '';
    records.forEach((lead, idx) => {
      const tr = document.createElement('tr');
      const hasEmail = !!(lead.email && lead.email.trim());
      const hasPhone = !!(lead.phone && lead.phone.trim());

      let statusBadgeClass = 'badge-discovered';
      let statusLabel = 'DISCOVERED';
      if (lead.outreachStatus === 'email_sent') {
        statusBadgeClass = 'badge-sent';
        statusLabel = 'EMAIL SENT';
      } else if (lead.outreachStatus === 'draft_created' || lead.draftCreated) {
        statusBadgeClass = 'badge-draft';
        statusLabel = 'DRAFT READY';
      }

      let webBadgeClass = lead.hasWebsite ? 'badge-hasweb' : 'badge-noweb';
      let webLabel = lead.hasWebsite ? (lead.techAudit?.cms || 'Has Website') : 'NO WEBSITE';

      tr.innerHTML = `
        <td style="color: var(--text-dim); font-family: var(--font-mono);">${idx + 1}</td>
        <td>
          <div style="font-weight: 700; color: var(--text-main); font-size: 12.5px;">${escapeHtml(lead.name || 'Unknown Business')}</div>
          ${lead.address ? `<div style="font-size: 10.5px; color: var(--text-muted);">${escapeHtml(lead.address)}</div>` : ''}
        </td>
        <td>
          <span class="trade-tag">${escapeHtml(lead.category || 'Service')}</span>
        </td>
        <td>
          <span style="font-family: var(--font-mono); font-size: 11.5px; color: var(--text-muted);">${escapeHtml(lead.zipCode || (lead.address?.match(/\\d{5}/)?.[0] || '-'))}</span>
        </td>
        <td>
          <div class="contact-cell">
            <span style="font-family: var(--font-mono); font-size: 11.5px;">${escapeHtml(lead.phone || '-')}</span>
            ${hasPhone ? `<button class="btn-mini-copy" data-copy="${escapeHtml(lead.phone)}" title="Copy phone number"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>` : ''}
          </div>
        </td>
        <td>
          <div class="contact-cell">
            <span style="font-family: var(--font-mono); font-size: 11.5px; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(lead.email || '-')}</span>
            ${hasEmail ? `<button class="btn-mini-copy" data-copy="${escapeHtml(lead.email)}" title="Copy email address"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>` : ''}
          </div>
        </td>
        <td>
          <span class="table-pill ${webBadgeClass}">${escapeHtml(webLabel)}</span>
        </td>
        <td>
          <span class="table-pill ${statusBadgeClass}">${statusLabel}</span>
        </td>
      `;

      tr.addEventListener('click', (e) => {
        if (e.target.closest('.btn-mini-copy')) return;
        openLeadDrawer(lead);
      });

      dbTableBody.appendChild(tr);
    });

    // Wire mini-copy buttons
    dbTableBody.querySelectorAll('.btn-mini-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = btn.dataset.copy;
        if (text) {
          navigator.clipboard.writeText(text);
          const origSvg = btn.innerHTML;
          btn.textContent = '✓';
          setTimeout(() => { btn.innerHTML = origSvg; }, 1200);
        }
      });
    });
  }

  function renderWebsitesTable(records) {
    dbTableHead.innerHTML = `
      <tr>
        <th style="width: 5%;">#</th>
        <th style="width: 25%;">Domain / URL</th>
        <th style="width: 20%;">Tech Stack / CMS</th>
        <th style="width: 20%;">AI / Chat Widgets</th>
        <th style="width: 20%;">Contacts Found</th>
        <th style="width: 10%;">Scraped Date</th>
      </tr>
    `;

    dbTableBody.innerHTML = '';
    records.forEach((site, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color: var(--text-dim); font-family: var(--font-mono);">${idx + 1}</td>
        <td>
          <div style="font-weight: 700; color: var(--accent-cyan); font-size: 12px;">${escapeHtml(site.domain || site.url || 'Unknown')}</div>
          <div style="font-size: 10.5px; color: var(--text-muted); max-width: 240px; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(site.url || '')}</div>
        </td>
        <td>
          <span class="trade-tag">${escapeHtml(site.cms || site.builder || 'Custom / HTML')}</span>
        </td>
        <td>
          <span class="table-pill ${site.hasAiChat ? 'badge-hasweb' : 'badge-noweb'}">${site.hasAiChat ? 'Active Chat' : 'Missing AI Chat'}</span>
        </td>
        <td>
          <div style="font-size: 11px; color: var(--text-muted);">
            ${site.emails?.length ? `Email: ${site.emails.slice(0, 1).join(', ')}` : 'No emails'}
          </div>
        </td>
        <td style="font-size: 10.5px; color: var(--text-dim);">
          ${site.scrapedAt ? new Date(site.scrapedAt).toLocaleDateString() : '-'}
        </td>
      `;
      dbTableBody.appendChild(tr);
    });
  }

  function renderDatasetsTable(records) {
    dbTableHead.innerHTML = `
      <tr>
        <th style="width: 5%;">#</th>
        <th style="width: 30%;">Dataset Name</th>
        <th style="width: 20%;">Category</th>
        <th style="width: 15%;">Records</th>
        <th style="width: 20%;">Saved Date</th>
        <th style="width: 10%;">Actions</th>
      </tr>
    `;

    dbTableBody.innerHTML = '';
    records.forEach((ds, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color: var(--text-dim); font-family: var(--font-mono);">${idx + 1}</td>
        <td style="font-weight: 700; color: var(--accent-cyan);">${escapeHtml(ds.name || 'Dataset')}</td>
        <td><span class="trade-tag">${escapeHtml(ds.category || 'Research')}</span></td>
        <td style="font-family: var(--font-mono);">${ds.records?.length || 0} rows</td>
        <td style="font-size: 11px; color: var(--text-muted);">${ds.savedAt ? new Date(ds.savedAt).toLocaleString() : '-'}</td>
        <td>
          <button class="btn-view-lead" data-export-ds="${escapeHtml(ds.name)}">Export CSV</button>
        </td>
      `;

      tr.querySelector('[data-export-ds]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.workspaceApi?.dbExportCsv) {
          window.workspaceApi.dbExportCsv({ collection: 'task_datasets', datasetName: ds.name });
        }
      });

      dbTableBody.appendChild(tr);
    });
  }

  function openLeadDrawer(lead) {
    if (!dbDetailDrawer) return;
    activeLeadItem = lead;

    if (drawerBusinessName) drawerBusinessName.textContent = lead.name || 'Business Details';
    if (drawerStatusBadge) {
      drawerStatusBadge.textContent = (lead.outreachStatus || 'DISCOVERED').toUpperCase();
      drawerStatusBadge.className = 'drawer-badge ' + (lead.outreachStatus === 'email_sent' ? 'badge-sent' : (lead.outreachStatus === 'draft_created' ? 'badge-draft' : 'badge-discovered'));
    }
    if (drawerCategory) drawerCategory.textContent = lead.category || '-';
    if (drawerLocation) drawerLocation.textContent = lead.address || lead.zipCode || '-';
    if (drawerPhone) drawerPhone.textContent = lead.phone || 'None found';
    if (drawerEmail) drawerEmail.textContent = lead.email || 'None found';
    if (drawerWebsite) {
      drawerWebsite.textContent = lead.website ? `${lead.website} (${lead.techAudit?.cms || 'Detected'})` : 'No standalone website found (Directory listing only)';
    }
    if (drawerPitchAngle) drawerPitchAngle.textContent = lead.pitchAngle || 'Standard Batch15Studios web stack & AI receptionist pitch.';
    if (drawerEmailSubject) drawerEmailSubject.textContent = lead.emailSubject || `Batch15Studios web & AI booking concept for ${lead.name || 'Business'}`;
    if (drawerEmailBody) drawerEmailBody.textContent = lead.emailBody || 'No email copy drafted yet.';

    dbDetailDrawer.classList.remove('hidden');
  }

  function closeLeadDrawer() {
    if (dbDetailDrawer) dbDetailDrawer.classList.add('hidden');
    activeLeadItem = null;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Search & Filter listeners
  dbSearchInput?.addEventListener('input', () => {
    if (dbClearSearch) dbClearSearch.style.display = dbSearchInput.value ? 'block' : 'none';
    applyDbFiltersAndRender();
  });

  dbClearSearch?.addEventListener('click', () => {
    if (dbSearchInput) {
      dbSearchInput.value = '';
      dbClearSearch.style.display = 'none';
      applyDbFiltersAndRender();
    }
  });

  dbFilterZip?.addEventListener('change', () => applyDbFiltersAndRender());
  dbFilterStatus?.addEventListener('change', () => applyDbFiltersAndRender());
  dbFilterWebsite?.addEventListener('change', () => applyDbFiltersAndRender());

  // Collection Selector Pills
  if (dbCollectionPills) {
    dbCollectionPills.querySelectorAll('.db-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        dbCollectionPills.querySelectorAll('.db-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDbCollection = btn.dataset.col || 'business_leads';
        closeLeadDrawer();
        fetchAndRenderDbRecords();
      });
    });
  }

  // Refresh Button
  btnDbRefresh?.addEventListener('click', async () => {
    btnDbRefresh.style.transform = 'rotate(180deg)';
    setTimeout(() => { btnDbRefresh.style.transform = 'none'; }, 400);
    await loadDatabaseView();
  });

  // Export CSV Button
  btnDbExportCsv?.addEventListener('click', async () => {
    if (!window.workspaceApi || !window.workspaceApi.dbExportCsv) return;
    const res = await window.workspaceApi.dbExportCsv({
      collection: currentDbCollection,
      zipCode: dbFilterZip?.value || undefined
    });
    if (res && res.success) {
      alert(`Exported CSV successfully to:\n${res.filePath}`);
    } else {
      alert('CSV export notice: ' + (res?.error || 'Failed'));
    }
  });

  // Drawer Close Button
  btnDrawerClose?.addEventListener('click', closeLeadDrawer);

  // Copy Pitch Button in Drawer
  btnCopyPitch?.addEventListener('click', () => {
    if (drawerEmailBody && drawerEmailBody.textContent) {
      const fullText = `Subject: ${drawerEmailSubject?.textContent || ''}\n\n${drawerEmailBody.textContent}`;
      navigator.clipboard.writeText(fullText);
      const origText = btnCopyPitch.textContent;
      btnCopyPitch.textContent = 'Copied!';
      setTimeout(() => { btnCopyPitch.textContent = origText; }, 1500);
    }
  });

  // =========================================================================
  // 7. INITIAL BOOT
  // =========================================================================
  async function bootWorkspace() {
    if (window.workspaceApi) {
      currentProjectDir = await window.workspaceApi.getDefaultPath();
      explorerPathInput.value = currentProjectDir;

      try {
        const srvUrl = await window.workspaceApi.getServerUrl();
        if (srvUrl) devServerBaseUrl = srvUrl;
      } catch (e) {}

      if (window.workspaceApi.onFileUpdated) {
        window.workspaceApi.onFileUpdated((fileInfo) => {
          console.log('[Workspace Hot-Reload] File updated:', fileInfo.name);
          if (deckWebview && deckWebview.src) {
            try {
              deckWebview.reload();
            } catch (err) {}
          }
          if (ideLogsStream) {
            const logMsg = document.createElement('div');
            logMsg.className = 'chat-msg system';
            logMsg.innerText = `[Live DevServer] Hot-reloaded: ${fileInfo.name}`;
            ideLogsStream.appendChild(logMsg);
            ideLogsStream.scrollTop = ideLogsStream.scrollHeight;
          }
        });
      }

      // Initial DB Badge Count Load
      updateDbBadge();
    }

    // Synchronize Theme & Visual Skin with Assistant HUD
    if (window.assistantApi) {
      const applyWorkspaceTheme = (themeData) => {
        let themeId = 'cyber-cyan';
        let customColor = null;
        if (typeof themeData === 'string') {
          themeId = themeData;
        } else if (themeData && typeof themeData === 'object') {
          themeId = themeData.themeId || 'cyber-cyan';
          customColor = themeData.customColor || null;
        }
        document.documentElement.setAttribute('data-theme', themeId || 'cyber-cyan');
        if (customColor) {
          const clean = customColor.replace('#', '');
          const bigint = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
          if (!isNaN(bigint)) {
            const r = (bigint >> 16) & 255;
            const g = (bigint >> 8) & 255;
            const b = bigint & 255;
            document.documentElement.style.setProperty('--custom-accent', customColor);
            document.documentElement.style.setProperty('--custom-accent-rgb', `${r}, ${g}, ${b}`);
            document.documentElement.style.setProperty('--custom-accent-sec', customColor);
          }
        }
      };

      if (window.assistantApi.onSkinChanged) {
        window.assistantApi.onSkinChanged((skinId) => {
          const target = skinId === 'gears' ? 'cog-gear' : (skinId || 'default');
          document.documentElement.setAttribute('data-skin', target);
        });
      }
      if (window.assistantApi.onThemeChanged) {
        window.assistantApi.onThemeChanged((themeData) => {
          applyWorkspaceTheme(themeData);
        });
      }
      try {
        const cfg = await window.assistantApi.loadConfig();
        if (cfg) {
          if (cfg.skin) {
            const target = cfg.skin === 'gears' ? 'cog-gear' : cfg.skin;
            document.documentElement.setAttribute('data-skin', target);
          }
          if (cfg.theme) {
            applyWorkspaceTheme({ themeId: cfg.theme, customColor: cfg.customColor });
          }
        }
      } catch (err) {}
    }

    initBrowser();
  }

  bootWorkspace();
})();
