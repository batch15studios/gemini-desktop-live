/**
 * workspace.js
 * Frontend logic for GEMINI // WORKSPACE DECK
 * Handles unified Web Browser, IDE (14/70/16 with Monaco), and File Explorer.
 */

(function () {
  'use strict';

  // State Management
  let currentMode = 'ide'; // 'ide' | 'browser' | 'explorer'
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
  const btnWinMinimize = document.getElementById('btnWinMinimize');
  const btnWinMaximize = document.getElementById('btnWinMaximize');
  const btnWinClose = document.getElementById('btnWinClose');

  // Views
  const viewIde = document.getElementById('viewIde');
  const viewExplorer = document.getElementById('viewExplorer');
  const viewBrowser = document.getElementById('viewBrowser');

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

  // Keyboard Shortcuts (Alt+1, Alt+2, Alt+3)
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

    // Update Views
    viewIde.classList.toggle('active', newMode === 'ide');
    viewExplorer.classList.toggle('active', newMode === 'explorer');
    viewBrowser.classList.toggle('active', newMode === 'browser');

    if (newMode === 'ide') {
      initIde();
    } else if (newMode === 'explorer') {
      loadExplorerDirectory(currentProjectDir);
    } else if (newMode === 'browser') {
      initBrowser();
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

    res.items.forEach(item => {
      const tr = document.createElement('tr');
      tr.dataset.path = item.path;
      tr.dataset.name = item.name;
      tr.dataset.isDir = item.isDirectory;

      tr.innerHTML = `
        <td class="file-name-cell">${item.isDirectory ? '📁 ' : '📄 '}${item.name}</td>
        <td>${item.dateModified}</td>
        <td>${item.type}</td>
        <td>${item.size}</td>
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
    previewCodeText.innerText = 'Loading preview...';

    if (item.isDirectory) {
      previewCodeText.innerText = `[Directory: ${item.name}]\nContains files and folders in workspace. Double-click to browse.`;
      return;
    }

    if (window.workspaceApi) {
      window.workspaceApi.readFile(item.path).then(res => {
        if (res.success) {
          previewCodeText.innerText = res.content.substring(0, 1500) + (res.content.length > 1500 ? '\n\n... [Content Truncated in Preview]' : '');
        } else {
          previewCodeText.innerText = `Error loading preview: ${res.error}`;
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

  deckWebview.addEventListener('did-navigate', (e) => {
    if (e.url) {
      browserUrlInput.value = e.url.replace(/^file:\/\/\/[A-Za-z]:\/.*?\//, '');
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
    }
    initIde();
  }

  bootWorkspace();
})();
