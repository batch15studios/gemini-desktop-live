/**
 * google-workspace-manager.js
 * Comprehensive Google Workspace Integration Engine for Assistant_Integrated_Advanced (v2.0)
 * 
 * Provides native tool execution for Google Workspace services:
 * 1. Gmail: Read unread messages, search threads, compose drafts, send emails
 * 2. Google Calendar: Today's agenda, upcoming meetings, schedule events
 * 3. Google Drive: Search files, list contents, upload assets, cloud memory sync
 * 4. Google Docs: Create collaborative documents, read doc contents, append notes
 * 5. Google Sheets: Create spreadsheets, read ranges, append tabular data rows
 * 6. Google Tasks: List to-do items, create tasks, mark tasks completed
 * 7. Google Contacts (People API): Search address book, retrieve emails and phone numbers
 * 8. Google Slides: Create presentations and slide decks
 * 9. Google Forms: Create forms and surveys
 * 10. Startup Executive Rundown: Multi-service briefing of emails, calendar, and tasks for spoken voice boot
 * 11. Google Takeout Chat Importer: Ingests past Gemini conversation exports into long-term memory & Obsidian
 * 12. Cross-Device Memory Live Sync: Syncs assistant_memory.json to Google Drive for multi-device continuity
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const url = require('url');
const { OAuth2Client } = require('google-auth-library');

let electronShell = null;
try {
  const electron = require('electron');
  electronShell = electron.shell;
} catch (e) {
  // Standalone mode
}

const FULL_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/contacts.readonly'
];

class GoogleWorkspaceManager {
  constructor(options = {}) {
    this.userDataPath = options.userDataPath || path.join(os.homedir(), 'AppData', 'Roaming', 'gemini-desktop-live');
    this.tokensPath = path.join(this.userDataPath, 'google_workspace_tokens.json');
    this.credentialsPath = path.join(this.userDataPath, 'google_workspace_credentials.json');
    this.emitter = options.emitter || null;

    // Load credentials (Client ID / Secret)
    this.clientId = options.clientId || process.env.GOOGLE_WORKSPACE_CLIENT_ID || '';
    this.clientSecret = options.clientSecret || process.env.GOOGLE_WORKSPACE_CLIENT_SECRET || '';
    this.redirectUri = options.redirectUri || 'http://127.0.0.1:8585/oauth2callback';

    this.loadSavedCredentials();

    this.oauth2Client = null;
    this.tokens = this.loadTokens();
    this.initOAuthClient();

    this.authServer = null;
  }

  loadSavedCredentials() {
    try {
      if (fs.existsSync(this.credentialsPath)) {
        const creds = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf-8'));
        if (creds.client_id) this.clientId = creds.client_id;
        if (creds.client_secret) this.clientSecret = creds.client_secret;
        if (creds.redirect_uri) this.redirectUri = creds.redirect_uri;
      }
    } catch (e) {
      console.warn('[GoogleWorkspace] Error reading saved credentials:', e.message);
    }
  }

  saveCredentials(clientId, clientSecret) {
    this.clientId = (clientId || '').trim();
    this.clientSecret = (clientSecret || '').trim();
    try {
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
      fs.writeFileSync(this.credentialsPath, JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri
      }, null, 2), 'utf-8');
      this.initOAuthClient();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  initOAuthClient() {
    if (this.clientId && this.clientSecret) {
      this.oauth2Client = new OAuth2Client(this.clientId, this.clientSecret, this.redirectUri);
      if (this.tokens) {
        this.oauth2Client.setCredentials(this.tokens);
      }
    } else {
      this.oauth2Client = null;
    }
  }

  loadTokens() {
    try {
      if (fs.existsSync(this.tokensPath)) {
        const raw = fs.readFileSync(this.tokensPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[GoogleWorkspace] Warning loading tokens:', e.message);
    }
    return null;
  }

  saveTokens(tokens) {
    this.tokens = tokens;
    try {
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
      fs.writeFileSync(this.tokensPath, JSON.stringify(tokens, null, 2), 'utf-8');
      if (this.oauth2Client) {
        this.oauth2Client.setCredentials(tokens);
      }
      if (this.emitter) {
        this.emitter.emit('workspace:auth-changed', { authenticated: true });
      }
      console.log('[GoogleWorkspace] Tokens persisted to disk successfully.');
      return { success: true };
    } catch (e) {
      console.error('[GoogleWorkspace] Failed to persist tokens:', e.message);
      return { success: false, error: e.message };
    }
  }

  isAuthenticated() {
    return !!(this.oauth2Client && this.tokens && (this.tokens.access_token || this.tokens.refresh_token));
  }

  getStatus() {
    return {
      configured: !!(this.clientId && this.clientSecret),
      authenticated: this.isAuthenticated(),
      clientIdConfigured: !!this.clientId,
      hasRefreshToken: !!(this.tokens && this.tokens.refresh_token),
      tokenExpiry: this.tokens?.expiry_date ? new Date(this.tokens.expiry_date).toLocaleString() : null
    };
  }

  // --- Interactive OAuth2 Authorization Server ---

  async startAuthFlow() {
    if (!this.clientId || !this.clientSecret) {
      return {
        error: 'Google OAuth Client ID and Client Secret are not configured yet.',
        instructions: 'Please configure client_id and client_secret in your Assistant Settings or create a Desktop OAuth Client ID in Google Cloud Console (project: batch-15-web-studios).'
      };
    }

    if (this.authServer) {
      try { this.authServer.close(); } catch (e) {}
    }

    this.initOAuthClient();

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: FULL_WORKSPACE_SCOPES
    });

    return new Promise((resolve) => {
      this.authServer = http.createServer(async (req, res) => {
        try {
          const parsedUrl = url.parse(req.url, true);
          if (parsedUrl.pathname === '/oauth2callback') {
            const code = parsedUrl.query.code;
            const err = parsedUrl.query.error;

            if (err) {
              res.writeHead(400, { 'Content-Type': 'text/html' });
              res.end(`<h2>Google Workspace Authorization Failed</h2><p>${err}</p>`);
              this.authServer.close();
              this.authServer = null;
              return resolve({ error: err });
            }

            if (code) {
              const { tokens } = await this.oauth2Client.getToken(code);
              this.saveTokens(tokens);

              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(`
                <html>
                <body style="font-family: system-ui, sans-serif; background: #09101c; color: #00f0ff; text-align: center; padding: 50px;">
                  <h1>Google Workspace Connected!</h1>
                  <p style="color: #cbd5e1;">Your Gemini Assistant is now authenticated for Gmail, Calendar, Drive, Docs, Sheets, and Tasks.</p>
                  <p style="color: #64748b;">You can safely close this browser tab and return to the assistant.</p>
                </body>
                </html>
              `);

              this.authServer.close();
              this.authServer = null;
              return resolve({ success: true, message: 'Google Workspace successfully authenticated!' });
            }
          }
          res.writeHead(404);
          res.end('Not Found');
        } catch (serverErr) {
          console.error('[GoogleWorkspace] Auth callback error:', serverErr);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end(`Internal Server Error: ${serverErr.message}`);
          this.authServer?.close();
          this.authServer = null;
          resolve({ error: serverErr.message });
        }
      });

      this.authServer.listen(8585, '127.0.0.1', () => {
        console.log('[GoogleWorkspace] Temporary OAuth2 loopback listening on http://127.0.0.1:8585/oauth2callback');
        if (electronShell) {
          electronShell.openExternal(authUrl);
        }
      });
    });
  }

  async makeAuthorizedRequest(requestOptions) {
    if (!this.isAuthenticated()) {
      return {
        error: 'Google Workspace is not authenticated. Please authenticate via the Control Hub or configure OAuth tokens.'
      };
    }

    try {
      const response = await this.oauth2Client.request(requestOptions);
      return response.data;
    } catch (err) {
      console.error('[GoogleWorkspace] Authorized request failed:', err.message);
      if (err.response && err.response.data) {
        return { error: err.response.data.error?.message || err.message, status: err.response.status };
      }
      return { error: err.message };
    }
  }

  // ==========================================
  // 1. GMAIL SUBSYSTEM
  // ==========================================

  async getUnreadEmails(maxResults = 5) {
    const listRes = await this.makeAuthorizedRequest({
      url: `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=${Math.min(20, Math.max(1, maxResults))}`
    });

    if (listRes.error) return listRes;

    const messages = listRes.messages || [];
    if (messages.length === 0) {
      return {
        unreadCount: 0,
        messages: [],
        summary: 'You have no unread emails in your inbox.'
      };
    }

    const detailedEmails = [];
    for (const msg of messages) {
      try {
        const detail = await this.makeAuthorizedRequest({
          url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
        });

        if (detail && !detail.error) {
          const headers = detail.payload?.headers || [];
          const from = headers.find(h => h.name.toLowerCase() === 'from')?.value || 'Unknown Sender';
          const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value || '(No Subject)';
          const date = headers.find(h => h.name.toLowerCase() === 'date')?.value || '';

          detailedEmails.push({
            id: msg.id,
            threadId: msg.threadId,
            from,
            subject,
            date,
            snippet: detail.snippet || ''
          });
        }
      } catch (detailErr) {
        console.warn(`[GoogleWorkspace] Failed to fetch email ${msg.id}:`, detailErr.message);
      }
    }

    return {
      unreadCount: detailedEmails.length,
      messages: detailedEmails,
      summary: `Found ${detailedEmails.length} unread email(s). Latest is from ${detailedEmails[0]?.from}: "${detailedEmails[0]?.subject}".`
    };
  }

  async searchEmails(query, maxResults = 10) {
    if (!query) return { error: 'Search query is required.' };
    const encoded = encodeURIComponent(query);
    const listRes = await this.makeAuthorizedRequest({
      url: `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encoded}&maxResults=${Math.min(25, maxResults)}`
    });

    if (listRes.error) return listRes;

    const messages = listRes.messages || [];
    const detailed = [];
    for (const msg of messages.slice(0, 10)) {
      const detail = await this.makeAuthorizedRequest({
        url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`
      });
      if (detail && !detail.error) {
        const headers = detail.payload?.headers || [];
        detailed.push({
          id: msg.id,
          from: headers.find(h => h.name.toLowerCase() === 'from')?.value || '',
          subject: headers.find(h => h.name.toLowerCase() === 'subject')?.value || '',
          date: headers.find(h => h.name.toLowerCase() === 'date')?.value || '',
          snippet: detail.snippet || ''
        });
      }
    }

    return { query, resultCount: detailed.length, messages: detailed };
  }

  async sendEmail(to, subject, body) {
    const cleanTo = String(to || '').replace(/[\r\n]/g, '').trim();
    if (!cleanTo || !subject || !body) {
      return { error: 'Fields "to", "subject", and "body" are required.' };
    }

    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const emailLines = [
      `To: ${cleanTo}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      body
    ];
    const rawEmail = emailLines.join('\r\n');
    const base64Encoded = Buffer.from(rawEmail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await this.makeAuthorizedRequest({
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      method: 'POST',
      data: { raw: base64Encoded }
    });

    if (res.error) return res;
    return {
      success: true,
      sentTo: cleanTo,
      subject,
      id: res.id,
      threadId: res.threadId
    };
  }

  async createDraft(to, subject, body) {
    const cleanTo = String(to || '').replace(/[\r\n]/g, '').trim();
    if (!cleanTo || !subject || !body) {
      return { error: 'Fields "to", "subject", and "body" are required.' };
    }

    const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
    const emailLines = [
      `To: ${cleanTo}`,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      body
    ];
    const rawEmail = emailLines.join('\r\n');
    const base64Encoded = Buffer.from(rawEmail)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await this.makeAuthorizedRequest({
      url: 'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
      method: 'POST',
      data: { message: { raw: base64Encoded } }
    });

    if (res.error) return res;
    return {
      success: true,
      draftId: res.id,
      messageId: res.message?.id,
      to,
      subject
    };
  }

  // ==========================================
  // 2. GOOGLE CALENDAR SUBSYSTEM
  // ==========================================

  async getUpcomingEvents(timeMin = null, timeMax = null, maxResults = 10) {
    const now = new Date();
    const startIso = timeMin || now.toISOString();
    
    let endIso = timeMax;
    if (!endIso) {
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);
      endIso = endOfDay.toISOString();
    }

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(startIso)}&timeMax=${encodeURIComponent(endIso)}&singleEvents=true&orderBy=startTime&maxResults=${maxResults}`;

    const res = await this.makeAuthorizedRequest({ url });
    if (res.error) return res;

    const items = res.items || [];
    const formattedEvents = items.map(ev => ({
      id: ev.id,
      summary: ev.summary || '(Untitled Event)',
      start: ev.start?.dateTime || ev.start?.date,
      end: ev.end?.dateTime || ev.end?.date,
      location: ev.location || '',
      description: ev.description || '',
      hangoutLink: ev.hangoutLink || '',
      attendees: (ev.attendees || []).map(a => a.displayName || a.email)
    }));

    return {
      eventCount: formattedEvents.length,
      events: formattedEvents,
      summary: formattedEvents.length === 0
        ? 'No scheduled events for the requested timeframe.'
        : `Found ${formattedEvents.length} event(s). Next event: "${formattedEvents[0].summary}" at ${new Date(formattedEvents[0].start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
    };
  }

  async createCalendarEvent(summary, startDateTime, endDateTime, description = '', location = '') {
    if (!summary || !startDateTime || !endDateTime) {
      return { error: 'summary, startDateTime, and endDateTime are required (ISO 8601 strings).' };
    }

    const res = await this.makeAuthorizedRequest({
      url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      method: 'POST',
      data: {
        summary,
        description,
        location,
        start: { dateTime: new Date(startDateTime).toISOString() },
        end: { dateTime: new Date(endDateTime).toISOString() }
      }
    });

    if (res.error) return res;
    return {
      success: true,
      id: res.id,
      htmlLink: res.htmlLink,
      summary: res.summary,
      start: res.start?.dateTime,
      end: res.end?.dateTime
    };
  }

  // ==========================================
  // 3. GOOGLE DRIVE SUBSYSTEM
  // ==========================================

  async listDriveFiles(pageSize = 15, query = '') {
    let q = 'trashed = false';
    if (query) {
      const sanitized = query.replace(/'/g, "\\'");
      q += ` and (name contains '${sanitized}' or fullText contains '${sanitized}')`;
    }

    const url = `https://www.googleapis.com/drive/v3/files?pageSize=${Math.min(50, pageSize)}&q=${encodeURIComponent(q)}&fields=files(id, name, mimeType, modifiedTime, webViewLink, size)&orderBy=modifiedTime desc`;

    const res = await this.makeAuthorizedRequest({ url });
    if (res.error) return res;

    return {
      fileCount: res.files?.length || 0,
      files: res.files || []
    };
  }

  async uploadFileToDrive(filePath, customName = '') {
    if (!filePath || !fs.existsSync(filePath)) {
      return { error: `File not found on local PC: ${filePath}` };
    }

    const stat = fs.statSync(filePath);
    if (stat.size > 20 * 1024 * 1024) {
      return { error: 'File size exceeds 20MB limit for direct upload.' };
    }

    const fileName = customName || path.basename(filePath);
    const content = fs.readFileSync(filePath);

    const metadata = { name: fileName };
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/octet-stream\r\n\r\n' +
      content.toString('latin1') +
      closeDelimiter;

    const res = await this.makeAuthorizedRequest({
      url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      data: multipartBody
    });

    if (res.error) return res;
    return {
      success: true,
      fileId: res.id,
      name: res.name,
      mimeType: res.mimeType,
      uploadedFrom: filePath
    };
  }

  // ==========================================
  // 4. GOOGLE DOCS SUBSYSTEM
  // ==========================================

  async createGoogleDoc(title, initialContent = '') {
    if (!title) return { error: 'Document title is required.' };

    const docRes = await this.makeAuthorizedRequest({
      url: 'https://docs.googleapis.com/v1/documents',
      method: 'POST',
      data: { title }
    });

    if (docRes.error) return docRes;

    const docId = docRes.documentId;

    if (initialContent) {
      await this.appendDocText(docId, initialContent);
    }

    return {
      success: true,
      documentId: docId,
      title: docRes.title,
      docUrl: `https://docs.google.com/document/d/${docId}/edit`
    };
  }

  async readGoogleDoc(documentId) {
    if (!documentId) return { error: 'Document ID is required.' };

    const docRes = await this.makeAuthorizedRequest({
      url: `https://docs.googleapis.com/v1/documents/${documentId}`
    });

    if (docRes.error) return docRes;

    // Extract text content from structural elements
    let fullText = '';
    const bodyContent = docRes.body?.content || [];
    for (const elem of bodyContent) {
      if (elem.paragraph) {
        for (const p of elem.paragraph.elements || []) {
          if (p.textRun?.content) fullText += p.textRun.content;
        }
      }
    }

    return {
      documentId: docRes.documentId,
      title: docRes.title,
      textLength: fullText.length,
      content: fullText.trim(),
      docUrl: `https://docs.google.com/document/d/${documentId}/edit`
    };
  }

  async appendDocText(documentId, text) {
    if (!documentId || !text) return { error: 'documentId and text are required.' };

    const updateRes = await this.makeAuthorizedRequest({
      url: `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
      method: 'POST',
      data: {
        requests: [
          {
            insertText: {
              endOfSegmentLocation: {},
              text: (text.endsWith('\n') ? text : text + '\n')
            }
          }
        ]
      }
    });

    if (updateRes.error) return updateRes;
    return { success: true, documentId, appendedLength: text.length };
  }

  // ==========================================
  // 5. GOOGLE SHEETS SUBSYSTEM
  // ==========================================

  async createSpreadsheet(title, headers = []) {
    if (!title) return { error: 'Spreadsheet title is required.' };

    const sheetRes = await this.makeAuthorizedRequest({
      url: 'https://sheets.googleapis.com/v4/spreadsheets',
      method: 'POST',
      data: {
        properties: { title }
      }
    });

    if (sheetRes.error) return sheetRes;

    const spreadsheetId = sheetRes.spreadsheetId;

    if (Array.isArray(headers) && headers.length > 0) {
      await this.appendSheetRow(spreadsheetId, headers, 'Sheet1!A1');
    }

    return {
      success: true,
      spreadsheetId,
      title: sheetRes.properties?.title,
      spreadsheetUrl: sheetRes.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    };
  }

  async readSheetValues(spreadsheetId, range = 'Sheet1!A1:Z50') {
    if (!spreadsheetId) return { error: 'Spreadsheet ID is required.' };

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
    const res = await this.makeAuthorizedRequest({ url });
    if (res.error) return res;

    return {
      spreadsheetId,
      range: res.range,
      rowCount: res.values?.length || 0,
      rows: res.values || []
    };
  }

  async appendSheetRow(spreadsheetId, values = [], range = 'Sheet1!A1') {
    if (!spreadsheetId || !Array.isArray(values)) {
      return { error: 'spreadsheetId and an array of values are required.' };
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
    const res = await this.makeAuthorizedRequest({
      url,
      method: 'POST',
      data: {
        values: [values]
      }
    });

    if (res.error) return res;
    return {
      success: true,
      spreadsheetId,
      updatedRange: res.updates?.updatedRange,
      updatedRows: res.updates?.updatedRows
    };
  }

  // ==========================================
  // 6. GOOGLE TASKS SUBSYSTEM
  // ==========================================

  async listTasks(taskListId = '@default', showCompleted = false) {
    const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks?showCompleted=${showCompleted}&maxResults=25`;
    const res = await this.makeAuthorizedRequest({ url });
    if (res.error) return res;

    const tasks = (res.items || []).map(t => ({
      id: t.id,
      title: t.title || '(Untitled Task)',
      status: t.status,
      due: t.due || null,
      notes: t.notes || ''
    }));

    return {
      taskCount: tasks.length,
      tasks,
      summary: tasks.length === 0
        ? 'No pending tasks in your Google Tasks list.'
        : `You have ${tasks.length} task(s). Next task: "${tasks[0].title}".`
    };
  }

  async createTask(title, notes = '', due = null, taskListId = '@default') {
    if (!title) return { error: 'Task title is required.' };

    const data = { title, notes };
    if (due) {
      data.due = new Date(due).toISOString();
    }

    const res = await this.makeAuthorizedRequest({
      url: `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`,
      method: 'POST',
      data
    });

    if (res.error) return res;
    return {
      success: true,
      id: res.id,
      title: res.title,
      status: res.status,
      due: res.due
    };
  }

  async completeTask(taskId, taskListId = '@default') {
    if (!taskId) return { error: 'Task ID is required.' };

    const res = await this.makeAuthorizedRequest({
      url: `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`,
      method: 'PATCH',
      data: { status: 'completed' }
    });

    if (res.error) return res;
    return { success: true, taskId, status: 'completed', title: res.title };
  }

  // ==========================================
  // 7. GOOGLE CONTACTS SUBSYSTEM
  // ==========================================

  async searchContacts(query, maxResults = 10) {
    if (!query) return { error: 'Contact search query is required.' };
    const url = `https://people.googleapis.com/v1/people:searchContacts?query=${encodeURIComponent(query)}&readMask=names,emailAddresses,phoneNumbers&pageSize=${maxResults}`;

    const res = await this.makeAuthorizedRequest({ url });
    if (res.error) return res;

    const results = (res.results || []).map(r => {
      const person = r.person || {};
      const name = person.names?.[0]?.displayName || 'Unknown';
      const emails = (person.emailAddresses || []).map(e => e.value);
      const phones = (person.phoneNumbers || []).map(p => p.value);
      return { name, emails, phones };
    });

    return { query, count: results.length, contacts: results };
  }

  async listRecentContacts(pageSize = 20) {
    const url = `https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers&pageSize=${pageSize}`;
    const res = await this.makeAuthorizedRequest({ url });
    if (res.error) return res;

    const connections = (res.connections || []).map(c => ({
      name: c.names?.[0]?.displayName || 'Unknown',
      emails: (c.emailAddresses || []).map(e => e.value),
      phones: (c.phoneNumbers || []).map(p => p.value)
    }));

    return { total: connections.length, contacts: connections };
  }

  // ==========================================
  // 8. GOOGLE SLIDES SUBSYSTEM
  // ==========================================

  async createPresentation(title) {
    if (!title) return { error: 'Presentation title is required.' };

    const res = await this.makeAuthorizedRequest({
      url: 'https://slides.googleapis.com/v1/presentations',
      method: 'POST',
      data: { title }
    });

    if (res.error) return res;
    return {
      success: true,
      presentationId: res.presentationId,
      title: res.title,
      slidesUrl: `https://docs.google.com/presentation/d/${res.presentationId}/edit`
    };
  }

  // ==========================================
  // 9. GOOGLE FORMS SUBSYSTEM
  // ==========================================

  async createForm(title, description = '') {
    if (!title) return { error: 'Form title is required.' };

    const res = await this.makeAuthorizedRequest({
      url: 'https://forms.googleapis.com/v1/forms',
      method: 'POST',
      data: {
        info: {
          title,
          description: description || 'Created by Gemini Desktop Assistant'
        }
      }
    });

    if (res.error) return res;
    return {
      success: true,
      formId: res.formId,
      responderUri: res.responderUri,
      editUrl: `https://docs.google.com/forms/d/${res.formId}/edit`
    };
  }

  // ==========================================
  // 10. EXECUTIVE MORNING RUNDOWN & BRIEFING
  // ==========================================

  async getStartupRundown() {
    if (!this.isAuthenticated()) {
      return {
        authenticated: false,
        message: 'Google Workspace is not connected. Connect your Google account in Settings to enable automated morning briefs.',
        spokenBriefing: 'System initialized. Google Workspace is not currently connected, so I cannot pull unread emails or today\'s calendar yet.'
      };
    }

    try {
      const [emailData, calendarData, taskData] = await Promise.all([
        this.getUnreadEmails(5),
        this.getUpcomingEvents(),
        this.listTasks('@default', false)
      ]);

      const unreadCount = emailData.unreadCount || 0;
      const topEmails = emailData.messages || [];
      const eventCount = calendarData.eventCount || 0;
      const events = calendarData.events || [];
      const taskCount = taskData.taskCount || 0;
      const topTasks = taskData.tasks || [];

      // Construct spoken executive brief script
      let spokenParts = [];
      spokenParts.push(`Good morning Ryan. System is online.`);

      if (unreadCount === 0) {
        spokenParts.push('Your inbox is clear with zero unread messages.');
      } else {
        const topFrom = topEmails[0]?.from?.split('<')[0]?.trim() || 'an unknown sender';
        spokenParts.push(`You have ${unreadCount} unread email${unreadCount > 1 ? 's' : ''}, with the latest from ${topFrom}.`);
      }

      if (eventCount === 0) {
        spokenParts.push('Your calendar has no scheduled events today.');
      } else {
        const nextEv = events[0];
        const timeStr = new Date(nextEv.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        spokenParts.push(`You have ${eventCount} scheduled event${eventCount > 1 ? 's' : ''} today. Next up is ${nextEv.summary} at ${timeStr}.`);
      }

      if (taskCount > 0) {
        spokenParts.push(`You also have ${taskCount} pending task${taskCount > 1 ? 's' : ''} in Google Tasks, leading with "${topTasks[0].title}".`);
      }

      return {
        authenticated: true,
        unreadCount,
        recentEmails: topEmails.slice(0, 3),
        eventCount,
        todayEvents: events,
        taskCount,
        pendingTasks: topTasks.slice(0, 3),
        spokenBriefing: spokenParts.join(' ')
      };
    } catch (e) {
      console.error('[GoogleWorkspace] Startup rundown error:', e);
      return {
        authenticated: true,
        error: e.message,
        spokenBriefing: 'System online, but I encountered an issue synchronizing your Workspace rundown.'
      };
    }
  }

  // ==========================================
  // 11. GOOGLE DRIVE CROSS-DEVICE MEMORY SYNC
  // ==========================================

  async syncMemoryToDrive(memoryData) {
    if (!this.isAuthenticated()) {
      return { error: 'Not authenticated with Google Workspace.' };
    }

    try {
      const fileName = 'gemini_assistant_memory_sync.json';
      const searchRes = await this.makeAuthorizedRequest({
        url: `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and trashed=false&fields=files(id, name, modifiedTime)`
      });

      const existingFile = searchRes.files?.[0];
      const contentStr = typeof memoryData === 'string' ? memoryData : JSON.stringify(memoryData, null, 2);

      if (existingFile) {
        // Update existing file
        await this.makeAuthorizedRequest({
          url: `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          data: contentStr
        });
        return { success: true, action: 'updated', fileId: existingFile.id, timestamp: new Date().toISOString() };
      } else {
        // Create new file
        const metadata = { name: fileName, mimeType: 'application/json' };
        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;

        const multipartBody =
          delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          'Content-Type: application/json\r\n\r\n' +
          contentStr +
          closeDelimiter;

        const createRes = await this.makeAuthorizedRequest({
          url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          data: multipartBody
        });
        return { success: true, action: 'created', fileId: createRes.id, timestamp: new Date().toISOString() };
      }
    } catch (e) {
      return { error: `Drive sync error: ${e.message}` };
    }
  }

  // ==========================================
  // 12. GOOGLE TAKEOUT GEMINI CHAT IMPORTER
  // ==========================================

  importTakeoutConversations(sourcePath, memoryManager) {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { error: `Specified path does not exist: ${sourcePath}` };
    }

    try {
      let conversations = [];
      const stat = fs.statSync(sourcePath);

      if (stat.isFile() && sourcePath.toLowerCase().endsWith('.json')) {
        const raw = fs.readFileSync(sourcePath, 'utf-8');
        const parsed = JSON.parse(raw);
        conversations = Array.isArray(parsed) ? parsed : (parsed.conversations || [parsed]);
      } else if (stat.isDirectory()) {
        const files = fs.readdirSync(sourcePath);
        for (const file of files) {
          const fullPath = path.join(sourcePath, file);
          if (file.toLowerCase().endsWith('.json')) {
            try {
              const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
              if (Array.isArray(content)) conversations.push(...content);
              else conversations.push(content);
            } catch (e) {}
          }
        }
      }

      if (conversations.length === 0) {
        return { error: 'No valid conversation records found in target path.' };
      }

      let importedCount = 0;
      let newObservationsCount = 0;
      const maxConversations = 100;
      const targetConversations = Array.isArray(conversations) ? conversations.slice(0, maxConversations) : [];

      for (const conv of targetConversations) {
        const title = conv.title || conv.name || 'Past Gemini Conversation';
        const date = conv.createTime ? new Date(conv.createTime).toISOString().split('T')[0] : 'Historical';
        const messages = conv.messages || conv.turns || [];

        if (messages.length > 0) {
          importedCount++;
          const sampleQueries = messages
            .filter(m => (m.author === 'user' || m.role === 'user') && m.content)
            .map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).substring(0, 140))
            .slice(0, 3);

          if (memoryManager) {
            memoryManager.saveMemoryItem('imported_session', title, `Past session on ${date}: ${sampleQueries.join('; ')}`, false);
            newObservationsCount++;
          }
        }
      }

      if (memoryManager && newObservationsCount > 0) {
        memoryManager.saveMemory();
      }

      if (memoryManager && memoryManager.obsidianVaultPath && fs.existsSync(memoryManager.obsidianVaultPath)) {
        const takeoutNotePath = path.join(memoryManager.obsidianVaultPath, 'Gemini Imported Chats Chronicle.md');
        const lines = [
          '# Gemini Imported Chats Chronicle (Google Takeout Migration)',
          '',
          `*Imported on ${new Date().toLocaleString()} from: \`${sourcePath}\`*`,
          '',
          `Total Conversations Ingested: **${importedCount}**`,
          '',
          '## Ingested Topics & Milestones',
          ...conversations.slice(0, 100).map(c => `- **${c.title || 'Conversation'}** (${c.createTime || 'Historical'}): ${c.messages?.length || 0} turns`)
        ];
        fs.writeFileSync(takeoutNotePath, lines.join('\n'), 'utf-8');
      }

      return {
        success: true,
        importedConversations: importedCount,
        newKnowledgeNodes: newObservationsCount,
        obsidianNoteCreated: true
      };
    } catch (err) {
      console.error('[GoogleWorkspace] Takeout import error:', err);
      return { error: `Takeout import failed: ${err.message}` };
    }
  }
}

module.exports = { GoogleWorkspaceManager };
