/**
 * research-database.js
 * Dedicated Local Structured Database for Gemini Desktop Live (Batch15Studios)
 *
 * Separates high-volume structured data (hundreds of local business leads, large website
 * directories, tech-stack audits, and multi-step research datasets) from the Obsidian
 * Second Brain so Obsidian remains clutter-free while Gemini retains 100% precision recall.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { safetyGuard } = require('./safety-guard');

class ResearchDatabase {
  constructor(options = {}) {
    this.rootDir = options.rootDir || __dirname;
    this.userDataDir = options.userDataDir || path.join(os.homedir(), 'AppData', 'Roaming', 'gemini-desktop-live');
    this.dbFilePath = path.join(this.userDataDir, 'research_database.json');
    this.data = this.loadDatabase();
  }

  getDefaultSchema() {
    return {
      meta: {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      business_leads: [],
      websites_directory: [],
      task_datasets: {}
    };
  }

  loadDatabase() {
    try {
      if (fs.existsSync(this.dbFilePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.dbFilePath, 'utf-8'));
        return {
          meta: parsed.meta || { version: '1.0.0', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
          business_leads: Array.isArray(parsed.business_leads) ? parsed.business_leads : [],
          websites_directory: Array.isArray(parsed.websites_directory) ? parsed.websites_directory : [],
          task_datasets: (parsed.task_datasets && typeof parsed.task_datasets === 'object') ? parsed.task_datasets : {}
        };
      }
    } catch (err) {
      console.warn('[ResearchDatabase] Warning loading database, initializing fresh store:', err.message);
    }
    return this.getDefaultSchema();
  }

  saveDatabase() {
    try {
      if (!fs.existsSync(this.userDataDir)) {
        fs.mkdirSync(this.userDataDir, { recursive: true });
      }
      this.data.meta.updatedAt = new Date().toISOString();
      fs.writeFileSync(this.dbFilePath, JSON.stringify(this.data, null, 2), 'utf-8');
      return true;
    } catch (err) {
      console.error('[ResearchDatabase] Failed to save database:', err.message);
      return false;
    }
  }

  // =========================================================================
  // 1. BUSINESS LEADS TABLE (Auto-Deduplicating by Name + Zip / Phone)
  // =========================================================================
  upsertBusinessLeads(leads = [], campaignMeta = {}) {
    if (!Array.isArray(leads) || leads.length === 0) {
      return { inserted: 0, updated: 0, total: this.data.business_leads.length };
    }

    let inserted = 0;
    let updated = 0;
    const now = new Date().toISOString();

    for (const item of leads) {
      if (!item || !item.name) continue;
      const normName = String(item.name).toLowerCase().replace(/[^a-z0-9]/g, '');
      const zip = String(item.zipCode || campaignMeta.zipCode || '').trim();
      const key = `${normName}_${zip}`;

      const existingIdx = this.data.business_leads.findIndex(b => b._dedupeKey === key);
      const record = {
        id: existingIdx >= 0 ? this.data.business_leads[existingIdx].id : `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        _dedupeKey: key,
        name: item.name,
        category: item.category || campaignMeta.category || 'Service Business',
        zipCode: zip,
        city: item.city || campaignMeta.city || '',
        state: item.state || campaignMeta.state || '',
        phone: item.phone || (existingIdx >= 0 ? this.data.business_leads[existingIdx].phone : '') || '',
        email: item.email || (existingIdx >= 0 ? this.data.business_leads[existingIdx].email : '') || '',
        address: item.address || '',
        website: item.website || '',
        hasWebsite: Boolean(item.hasWebsite),
        websiteStatusLabel: item.websiteStatusLabel || (item.hasWebsite ? 'Active Website' : 'NO WEBSITE'),
        cmsOrBuilder: item.techAudit?.cmsOrBuilder || item.cmsOrBuilder || (item.hasWebsite ? 'Custom/Unknown' : 'None'),
        hasAiOrChatWidget: Boolean(item.techAudit?.hasAiOrChatWidget || item.hasAiOrChatWidget),
        pitchAngle: item.pitchAngle || '',
        emailSubject: item.emailSubject || '',
        emailBody: item.emailBody || '',
        outreachStatus: existingIdx >= 0 && this.data.business_leads[existingIdx].outreachStatus === 'email_sent'
          ? 'email_sent'
          : (item.draftCreated ? 'draft_created' : (item.outreachStatus || 'discovered')),
        sentAt: existingIdx >= 0 ? this.data.business_leads[existingIdx].sentAt : null,
        createdAt: existingIdx >= 0 ? this.data.business_leads[existingIdx].createdAt : now,
        updatedAt: now
      };

      if (existingIdx >= 0) {
        this.data.business_leads[existingIdx] = record;
        updated++;
      } else {
        this.data.business_leads.push(record);
        inserted++;
      }
    }

    this.saveDatabase();
    return {
      inserted,
      updated,
      total: this.data.business_leads.length
    };
  }

  markLeadEmailSent(nameOrEmail, zipCode = '') {
    const target = String(nameOrEmail || '').toLowerCase().trim();
    if (!target) return false;
    let count = 0;
    const now = new Date().toISOString();

    for (const lead of this.data.business_leads) {
      const matchEmail = lead.email && lead.email.toLowerCase() === target;
      const matchName = lead.name && lead.name.toLowerCase() === target && (!zipCode || lead.zipCode === zipCode);
      if (matchEmail || matchName) {
        lead.outreachStatus = 'email_sent';
        lead.sentAt = now;
        lead.updatedAt = now;
        count++;
      }
    }
    if (count > 0) this.saveDatabase();
    return count > 0;
  }

  // =========================================================================
  // 2. WEBSITES DIRECTORY TABLE (Large Website Lists & Tech Audits)
  // =========================================================================
  upsertWebsites(websites = [], defaultCategory = 'General') {
    if (!Array.isArray(websites)) websites = [websites];
    let inserted = 0;
    let updated = 0;
    const now = new Date().toISOString();

    for (const site of websites) {
      if (!site || !site.url) continue;
      let domain = '';
      try {
        domain = new URL(site.url.startsWith('http') ? site.url : `https://${site.url}`).hostname.replace(/^www\./, '').toLowerCase();
      } catch (_) {
        domain = String(site.url).toLowerCase();
      }

      const existingIdx = this.data.websites_directory.findIndex(w => w.domain === domain || w.url === site.url);
      const record = {
        id: existingIdx >= 0 ? this.data.websites_directory[existingIdx].id : `site_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        url: site.url,
        domain,
        title: site.title || (existingIdx >= 0 ? this.data.websites_directory[existingIdx].title : domain),
        category: site.category || defaultCategory,
        tags: Array.isArray(site.tags) ? site.tags : [],
        cmsOrBuilder: site.techAudit?.cmsOrBuilder || site.cmsOrBuilder || 'Unknown',
        hasAiOrChatWidget: Boolean(site.techAudit?.hasAiOrChatWidget || site.hasAiOrChatWidget),
        emails: Array.isArray(site.emails) ? site.emails : [],
        phones: Array.isArray(site.phones) ? site.phones : [],
        notes: site.notes || site.summary || '',
        createdAt: existingIdx >= 0 ? this.data.websites_directory[existingIdx].createdAt : now,
        updatedAt: now
      };

      if (existingIdx >= 0) {
        this.data.websites_directory[existingIdx] = record;
        updated++;
      } else {
        this.data.websites_directory.push(record);
        inserted++;
      }
    }

    this.saveDatabase();
    return {
      inserted,
      updated,
      total: this.data.websites_directory.length
    };
  }

  // =========================================================================
  // 3. NAMED TASK DATASETS (Multi-Step Research & Custom Tables)
  // =========================================================================
  saveTaskDataset(datasetName, records = [], description = '', append = true) {
    if (!datasetName) return { error: 'datasetName is required.' };
    const key = String(datasetName).trim();
    const now = new Date().toISOString();
    const incoming = Array.isArray(records) ? records : [records];

    if (!this.data.task_datasets[key] || !append) {
      this.data.task_datasets[key] = {
        datasetName: key,
        description: description || `Structured research dataset: ${key}`,
        createdAt: now,
        updatedAt: now,
        records: incoming
      };
    } else {
      const ds = this.data.task_datasets[key];
      if (description) ds.description = description;
      ds.records.push(...incoming);
      ds.updatedAt = now;
    }

    this.saveDatabase();
    return {
      success: true,
      datasetName: key,
      recordCount: this.data.task_datasets[key].records.length
    };
  }

  // =========================================================================
  // 4. UNIFIED SAVE & QUERY INTERFACE FOR GEMINI TOOLS
  // =========================================================================
  saveRecords({ table = 'business_leads', records = [], datasetName = '', category = '', zipCode = '', description = '', append = true } = {}) {
    if (table === 'business_leads') {
      const res = this.upsertBusinessLeads(records, { category, zipCode });
      return { success: true, table: 'business_leads', ...res };
    }
    if (table === 'websites_directory') {
      const res = this.upsertWebsites(records, category || 'Web Research');
      return { success: true, table: 'websites_directory', ...res };
    }
    if (table === 'task_datasets' || datasetName) {
      return this.saveTaskDataset(datasetName || 'general_research', records, description, append);
    }
    return { error: `Unknown table "${table}". Use "business_leads", "websites_directory", or "task_datasets".` };
  }

  queryRecords({
    table = 'business_leads',
    query = '',
    zipCode = '',
    category = '',
    onlyWithoutWebsite = false,
    outreachStatus = '',
    datasetName = '',
    limit = 50
  } = {}) {
    const q = String(query || '').toLowerCase().trim();
    const max = Math.min(Math.max(Number(limit) || 50, 1), 500);

    if (table === 'task_datasets' || datasetName) {
      const targetDs = datasetName ? this.data.task_datasets[datasetName] : null;
      if (!targetDs) {
        return {
          success: true,
          table: 'task_datasets',
          availableDatasets: Object.keys(this.data.task_datasets).map(k => ({
            datasetName: k,
            description: this.data.task_datasets[k].description,
            recordCount: this.data.task_datasets[k].records.length,
            updatedAt: this.data.task_datasets[k].updatedAt
          }))
        };
      }
      let rows = targetDs.records || [];
      if (q) {
        rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));
      }
      return {
        success: true,
        table: 'task_datasets',
        datasetName,
        totalMatched: rows.length,
        records: rows.slice(0, max)
      };
    }

    if (table === 'websites_directory') {
      let rows = [...this.data.websites_directory];
      if (category) {
        const catLow = category.toLowerCase();
        rows = rows.filter(r => (r.category || '').toLowerCase().includes(catLow));
      }
      if (q) {
        rows = rows.filter(r =>
          (r.url || '').toLowerCase().includes(q) ||
          (r.domain || '').toLowerCase().includes(q) ||
          (r.title || '').toLowerCase().includes(q) ||
          (r.notes || '').toLowerCase().includes(q) ||
          (r.cmsOrBuilder || '').toLowerCase().includes(q)
        );
      }
      return {
        success: true,
        table: 'websites_directory',
        totalMatched: rows.length,
        records: rows.slice(0, max)
      };
    }

    // Default: business_leads
    let rows = [...this.data.business_leads];
    if (zipCode) {
      const z = String(zipCode).trim();
      rows = rows.filter(r => r.zipCode === z || (r.address || '').includes(z));
    }
    if (category) {
      const catLow = category.toLowerCase();
      rows = rows.filter(r =>
        (r.category || '').toLowerCase().includes(catLow) ||
        (r.name || '').toLowerCase().includes(catLow)
      );
    }
    if (onlyWithoutWebsite) {
      rows = rows.filter(r => !r.hasWebsite);
    }
    if (outreachStatus) {
      rows = rows.filter(r => r.outreachStatus === outreachStatus);
    }
    if (q) {
      rows = rows.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.city || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q) ||
        (r.websiteStatusLabel || '').toLowerCase().includes(q)
      );
    }

    return {
      success: true,
      table: 'business_leads',
      totalMatched: rows.length,
      records: rows.slice(0, max)
    };
  }

  getSummary() {
    const leads = this.data.business_leads;
    const noSiteCount = leads.filter(l => !l.hasWebsite).length;
    const withEmailCount = leads.filter(l => Boolean(l.email)).length;
    const sentCount = leads.filter(l => l.outreachStatus === 'email_sent').length;
    const zipBreakdown = {};
    for (const l of leads) {
      const z = l.zipCode || 'Unknown';
      zipBreakdown[z] = (zipBreakdown[z] || 0) + 1;
    }

    return {
      success: true,
      databasePath: this.dbFilePath,
      lastUpdated: this.data.meta.updatedAt,
      tables: {
        business_leads: {
          totalRecords: leads.length,
          withoutWebsite: noSiteCount,
          withEmail: withEmailCount,
          emailsSent: sentCount,
          byZipCode: zipBreakdown
        },
        websites_directory: {
          totalRecords: this.data.websites_directory.length
        },
        task_datasets: {
          totalDatasets: Object.keys(this.data.task_datasets).length,
          datasets: Object.keys(this.data.task_datasets).map(k => ({
            name: k,
            recordCount: this.data.task_datasets[k].records.length,
            description: this.data.task_datasets[k].description
          }))
        }
      }
    };
  }

  exportToCsv({ table = 'business_leads', datasetName = '', outputPath = '' } = {}) {
    const queryRes = this.queryRecords({ table, datasetName, limit: 5000 });
    const records = queryRes.records || [];
    if (records.length === 0) {
      return { success: false, error: 'No records found to export.' };
    }

    const headers = Object.keys(records[0]).filter(k => !k.startsWith('_'));
    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvLines = [
      headers.join(','),
      ...records.map(row => headers.map(h => escapeCsv(row[h])).join(','))
    ];

    const fileName = outputPath
      ? path.resolve(outputPath)
      : path.join(this.rootDir, `export_${datasetName || table}_${Date.now()}.csv`);

    try {
      if (safetyGuard) {
        safetyGuard.assertPathSafety(fileName, 'write');
      }
      fs.writeFileSync(fileName, csvLines.join('\n'), 'utf-8');
      return {
        success: true,
        exportedCount: records.length,
        filePath: fileName
      };
    } catch (err) {
      return {
        error: `Failed to export CSV: ${err.message}`
      };
    }
  }
}

module.exports = { ResearchDatabase };
