/**
 * web-scraper-lead-engine.js
 * Native Web Scraping, DOM Extraction, Tech-Stack Auditing, and Batch15Studios Lead Generation Engine
 * 
 * Capabilities:
 * 1. Live Web Search (DuckDuckGo HTML + Bing SERP parsing)
 * 2. Deep Webpage Scraping (Clean text, Email extraction + /contact page crawling, Phone extraction, Tech Stack & AI Widget detection)
 * 3. Local Business Lead Discovery by Zip Code & Trade (Nominatim Geocoding + Overpass API + Directory & SERP Scraping + Electron Chromium DOM bridge)
 * 4. Automated Batch15Studios Pitch & Gmail Draft Compiler
 * 5. Multi-Column Visual Reporting (Interactive HTML Dashboard in Workspace Deck, Google Sheets in Columns, Google Docs in Columns)
 * 6. Approval-Gated Email Dispatcher
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9'
};

const DIRECTORY_DOMAINS = [
  'yelp.com', 'yellowpages.com', 'bbb.org', 'facebook.com', 'angi.com',
  'homeadvisor.com', 'thumbtack.com', 'manta.com', 'mapquest.com',
  'nextdoor.com', 'porch.com', 'houzz.com', 'chamberofcommerce.com',
  'superpages.com', 'dexknows.com', 'local.yahoo.com', 'foursquare.com',
  'buildzoom.com', 'networx.com', 'bark.com', 'birdeye.com'
];

const IGNORED_EMAIL_PATTERNS = [
  /\.png$/i, /\.jpg$/i, /\.jpeg$/i, /\.gif$/i, /\.svg$/i, /\.webp$/i,
  /\.css$/i, /\.js$/i, /example\.com/i, /domain\.com/i, /email\.com/i,
  /sentry\.io/i, /wixpress\.com/i, /wordpress\.org/i, /w3\.org/i,
  /schema\.org/i, /googleapis\.com/i, /cloudflare\.com/i, /duckduckgo\.com/i
];

class WebScraperLeadEngine {
  constructor(options = {}) {
    this.workspaceManager = options.workspaceManager || null;
    this.emitter = options.emitter || null;
    this.webviewExtractor = options.webviewExtractor || null; // Function to execute JS in Workspace Deck webview
    this.rootDir = options.rootDir || __dirname;
    this.userDataPath = options.userDataPath || path.join(os.homedir(), 'AppData', 'Roaming', 'gemini-desktop-live');
    this.leadsFilePath = path.join(this.userDataPath, 'latest_batch15_leads.json');
  }

  // ===========================================================================
  // 1. LIVE WEB SEARCH
  // ===========================================================================
  async webSearch(query, maxResults = 15) {
    if (!query) return { error: 'Search query is required.' };
    const results = [];

    try {
      // Primary: DuckDuckGo HTML Search
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const resp = await fetch(ddgUrl, { headers: BROWSER_HEADERS });
      const html = await resp.text();

      const blockRegex = /<div class="result__body">([\s\S]*?)<\/div>\s*<\/div>/gi;
      let match;
      while ((match = blockRegex.exec(html)) !== null && results.length < maxResults) {
        const block = match[1];
        const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        const snippetMatch = block.match(/<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);

        if (titleMatch) {
          let rawHref = titleMatch[1];
          const uddgMatch = rawHref.match(/[?&]uddg=([^&]+)/);
          if (uddgMatch) {
            rawHref = decodeURIComponent(uddgMatch[1]);
          }
          const title = this.stripHtml(titleMatch[2]);
          const snippet = snippetMatch ? this.stripHtml(snippetMatch[1]) : '';

          if (rawHref.startsWith('http') && !rawHref.includes('duckduckgo.com/y.js')) {
            results.push({ title, url: rawHref, snippet });
          }
        }
      }
    } catch (err) {
      console.warn('[WebScraper] DuckDuckGo search warning:', err.message);
    }

    // Fallback / Supplement: Bing HTML Search if needed
    if (results.length < Math.min(5, maxResults)) {
      try {
        const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
        const resp = await fetch(bingUrl, { headers: BROWSER_HEADERS });
        const html = await resp.text();
        const algoRegex = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi;
        let match;
        while ((match = algoRegex.exec(html)) !== null && results.length < maxResults) {
          const block = match[1];
          const linkMatch = block.match(/<h2[^>]*>\s*<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
          const descMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
          if (linkMatch) {
            const url = linkMatch[1];
            const title = this.stripHtml(linkMatch[2]);
            const snippet = descMatch ? this.stripHtml(descMatch[1]) : '';
            if (!results.some(r => r.url === url)) {
              results.push({ title, url, snippet });
            }
          }
        }
      } catch (e) {
        console.warn('[WebScraper] Bing fallback warning:', e.message);
      }
    }

    return {
      success: true,
      query,
      resultCount: results.length,
      results
    };
  }

  // ===========================================================================
  // 2. DEEP WEBPAGE SCRAPER & TECH-STACK / AI AUDITOR
  // ===========================================================================
  async webScrapePage(targetUrl, options = {}) {
    if (!targetUrl) return { error: 'URL is required.' };
    let url = targetUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const extractContacts = options.extractContacts !== false;
    const analyzeTechStack = options.analyzeTechStack !== false;
    const deepContactCrawl = options.deepContactCrawl !== false;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(url, { headers: BROWSER_HEADERS, signal: controller.signal });
      clearTimeout(timeout);

      const html = await resp.text();
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);

      const title = titleMatch ? this.stripHtml(titleMatch[1]) : '';
      const metaDescription = descMatch ? this.stripHtml(descMatch[1]) : '';
      const cleanText = this.htmlToReadableText(html).substring(0, 12000);

      let emails = [];
      let phones = [];
      let socialLinks = [];

      if (extractContacts) {
        emails = this.extractEmails(html);
        phones = this.extractPhones(html);
        socialLinks = this.extractSocialLinks(html);

        // If no email on homepage, check /contact or /about page automatically
        if (emails.length === 0 && deepContactCrawl) {
          const contactSubUrl = this.findContactPageLink(html, url);
          if (contactSubUrl) {
            try {
              const subCtrl = new AbortController();
              const subTimer = setTimeout(() => subCtrl.abort(), 6000);
              const subResp = await fetch(contactSubUrl, { headers: BROWSER_HEADERS, signal: subCtrl.signal });
              clearTimeout(subTimer);
              const subHtml = await subResp.text();
              emails = [...new Set([...emails, ...this.extractEmails(subHtml)])];
              phones = [...new Set([...phones, ...this.extractPhones(subHtml)])];
            } catch (e) {}
          }
        }
      }

      let techAudit = null;
      if (analyzeTechStack) {
        techAudit = this.auditTechStack(html, url);
      }

      return {
        success: true,
        url,
        title,
        metaDescription,
        emails: emails.slice(0, 10),
        phones: phones.slice(0, 8),
        socialLinks: socialLinks.slice(0, 10),
        techAudit,
        textPreview: cleanText.substring(0, 4000)
      };
    } catch (err) {
      return {
        success: false,
        url,
        error: `Failed to scrape ${url}: ${err.message}`
      };
    }
  }

  auditTechStack(html, url = '') {
    const lower = html.toLowerCase();
    let cmsOrBuilder = 'Custom / Static HTML';
    if (lower.includes('wp-content') || lower.includes('wp-includes')) cmsOrBuilder = 'WordPress';
    else if (lower.includes('wix.com') || lower.includes('wixstatic.com')) cmsOrBuilder = 'Wix Builder';
    else if (lower.includes('squarespace.com') || lower.includes('sqsp.net')) cmsOrBuilder = 'Squarespace';
    else if (lower.includes('wsimg.com') || lower.includes('godaddy')) cmsOrBuilder = 'GoDaddy Website Builder';
    else if (lower.includes('webflow.com') || lower.includes('data-wf-site')) cmsOrBuilder = 'Webflow';
    else if (lower.includes('cdn.shopify.com')) cmsOrBuilder = 'Shopify';
    else if (lower.includes('weebly.com')) cmsOrBuilder = 'Weebly';
    else if (lower.includes(' _next/') || lower.includes('__next')) cmsOrBuilder = 'Next.js (Modern React)';

    // Check for AI Chatbots / Live Chat / Marketing Automation
    const chatWidgets = [];
    if (lower.includes('leadconnectorhq') || lower.includes('msgsndr.com')) chatWidgets.push('GoHighLevel / LeadConnector');
    if (lower.includes('intercom')) chatWidgets.push('Intercom');
    if (lower.includes('tawk.to')) chatWidgets.push('Tawk.to');
    if (lower.includes('tidio')) chatWidgets.push('Tidio Chat');
    if (lower.includes('hubspot')) chatWidgets.push('HubSpot');
    if (lower.includes('drift.com')) chatWidgets.push('Drift');
    if (lower.includes('zendesk')) chatWidgets.push('Zendesk');
    if (lower.includes('podium.com')) chatWidgets.push('Podium');
    if (lower.includes('birdeye.com')) chatWidgets.push('Birdeye');

    const hasAiOrChatWidget = chatWidgets.length > 0;
    const hasSsl = url.startsWith('https://');
    const hasMobileViewport = lower.includes('name="viewport"') || lower.includes("name='viewport'");

    const opportunities = [];
    if (!hasAiOrChatWidget) {
      opportunities.push('Missing 24/7 AI Chat Receptionist & Automated Lead Capture');
    }
    if (['Wix Builder', 'GoDaddy Website Builder', 'Weebly', 'WordPress'].includes(cmsOrBuilder)) {
      opportunities.push(`Running legacy/template stack (${cmsOrBuilder}) — prime candidate for Batch15Studios modern high-speed web stack`);
    }
    if (!hasSsl) {
      opportunities.push('Insecure HTTP site (No SSL certificate)');
    }
    if (!hasMobileViewport) {
      opportunities.push('Not mobile-optimized (Missing responsive viewport)');
    }

    return {
      cmsOrBuilder,
      hasAiOrChatWidget,
      detectedWidgets: chatWidgets,
      hasSsl,
      hasMobileViewport,
      batch15Opportunities: opportunities
    };
  }

  // ===========================================================================
  // 3. LOCAL BUSINESS LEAD ENGINE (BY ZIP CODE & CATEGORY)
  // ===========================================================================
  async findLocalBusinessLeads(options = {}) {
    const zipCode = String(options.zipCode || '75001').trim();
    const category = String(options.category || 'home service contractors').trim();
    const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
    const onlyWithoutWebsite = options.onlyWithoutWebsite === true;
    const autoCreateDrafts = options.autoCreateDrafts !== false;
    const exportToWorkspace = options.exportToWorkspace !== false;

    console.log(`[LeadEngine] Discovering ${limit} "${category}" leads in zip code ${zipCode} (onlyWithoutWebsite=${onlyWithoutWebsite})...`);

    // Step 1: Resolve Zip Code to City, State, and Lat/Lon via Nominatim
    let geo = { city: zipCode, state: '', lat: null, lon: null, displayName: zipCode };
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zipCode)}&country=US&format=json&addressdetails=1`;
      const nomResp = await fetch(nomUrl, { headers: { 'User-Agent': 'Batch15Studios-LeadEngine/2.2' } });
      const nomData = await nomResp.json();
      if (Array.isArray(nomData) && nomData.length > 0) {
        const top = nomData[0];
        const addr = top.address || {};
        geo = {
          city: addr.city || addr.town || addr.village || addr.suburb || addr.county || zipCode,
          state: addr.state || '',
          lat: parseFloat(top.lat),
          lon: parseFloat(top.lon),
          displayName: top.display_name
        };
      }
    } catch (e) {
      console.warn('[LeadEngine] Geocoding warning:', e.message);
    }

    const rawCandidates = [];
    const seenNames = new Set();

    const addCandidate = (cand) => {
      if (!cand || !cand.name) return;
      const cleanName = cand.name.trim().replace(/\s+/g, ' ');
      if (cleanName.length < 3) return;
      const key = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!key || seenNames.has(key)) return;
      seenNames.add(key);
      rawCandidates.push({
        name: cleanName,
        category: cand.category || category,
        phone: cand.phone || '',
        email: cand.email || '',
        address: cand.address || `${geo.city}${geo.state ? ', ' + geo.state : ''} ${zipCode}`,
        website: cand.website || '',
        hasWebsite: !!cand.website,
        directorySource: cand.directorySource || 'Local Directory',
        directoryUrl: cand.directoryUrl || '',
        techAudit: cand.techAudit || null
      });
    };

    // Step 2A: Query OpenStreetMap Overpass API for businesses in the Zip Code area
    if (geo.lat && geo.lon) {
      try {
        const radius = 15000; // 15km around zip center
        const overpassQuery = `[out:json][timeout:15];(node["craft"](around:${radius},${geo.lat},${geo.lon});way["craft"](around:${radius},${geo.lat},${geo.lon});node["office"="company"](around:${radius},${geo.lat},${geo.lon});node["shop"="trade"](around:${radius},${geo.lat},${geo.lon});node["shop"="hardware"](around:${radius},${geo.lat},${geo.lon});node["shop"="car_repair"](around:${radius},${geo.lat},${geo.lon}););out body 120;`;
        const ovResp = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: 'data=' + encodeURIComponent(overpassQuery),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Batch15Studios-LeadEngine/2.2'
          }
        });
        const ovJson = await ovResp.json();
        const catLower = category.toLowerCase();

        for (const el of (ovJson.elements || [])) {
          const tags = el.tags || {};
          if (!tags.name) continue;
          const website = tags.website || tags['contact:website'] || tags.url || '';
          const phone = tags.phone || tags['contact:phone'] || '';
          const email = tags.email || tags['contact:email'] || '';
          const tradeType = tags.craft || tags.shop || tags.office || category;
          const street = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city'] || geo.city, tags['addr:postcode'] || zipCode].filter(Boolean).join(' ');

          // Match category if specific, or include local trade businesses
          const matchesCat = catLower.includes('service') || catLower.includes('business') || catLower.includes('contractor') ||
                             tradeType.toLowerCase().includes(catLower) || tags.name.toLowerCase().includes(catLower);

          if (matchesCat || rawCandidates.length < limit) {
            addCandidate({
              name: tags.name,
              category: tradeType.replace(/_/g, ' '),
              phone,
              email,
              address: street || `${geo.city}, ${geo.state} ${zipCode}`,
              website: website,
              directorySource: 'OpenStreetMap Local Registry'
            });
          }
        }
      } catch (ovErr) {
        console.warn('[LeadEngine] Overpass query warning:', ovErr.message);
      }
    }

    // Step 2B: Search Local Directories & SERPs for Zip Code + Category
    const searchQueries = [
      `${category} ${zipCode} ${geo.city} phone`,
      `"${category}" "${geo.city}" "${zipCode}" -site:yelp.com`,
      `${category} near ${zipCode} ${geo.city} contact email`,
      `site:facebook.com "${category}" "${geo.city}" ${zipCode} phone`
    ];

    for (const q of searchQueries) {
      if (rawCandidates.filter(c => onlyWithoutWebsite ? !c.hasWebsite : true).length >= limit + 8) break;
      const searchRes = await this.webSearch(q, 20);
      for (const item of (searchRes.results || [])) {
        const parsed = this.parseSearchItemIntoLead(item, category, geo, zipCode);
        if (parsed) {
          addCandidate(parsed);
        }
      }
    }

    // Step 3: Filter & Enrich the Top Leads (Scrape websites or search emails for leads)
    let filtered = rawCandidates;
    if (onlyWithoutWebsite) {
      const noSite = rawCandidates.filter(c => !c.hasWebsite);
      const withSite = rawCandidates.filter(c => c.hasWebsite);
      // Prioritize 100% no-website leads first; if fewer than limit exist in raw pool, mark remaining with tech audit
      filtered = [...noSite, ...withSite].slice(0, limit);
    } else {
      // Put no-website leads first, followed by leads needing modern stack/AI automation
      const noSite = rawCandidates.filter(c => !c.hasWebsite);
      const withSite = rawCandidates.filter(c => c.hasWebsite);
      filtered = [...noSite, ...withSite].slice(0, limit);
    }

    // Enrich up to `limit` leads concurrently (in small batches of 5)
    const enrichedLeads = [];
    const batchSize = 5;
    for (let i = 0; i < filtered.length; i += batchSize) {
      const slice = filtered.slice(i, i + batchSize);
      const enrichedBatch = await Promise.all(slice.map(async (lead, idx) => {
        const leadNumber = i + idx + 1;
        if (lead.hasWebsite && lead.website) {
          const scraped = await this.webScrapePage(lead.website, {
            extractContacts: true,
            analyzeTechStack: true,
            deepContactCrawl: true
          });
          if (scraped.success) {
            if (!lead.email && scraped.emails?.length > 0) lead.email = scraped.emails[0];
            if (!lead.phone && scraped.phones?.length > 0) lead.phone = scraped.phones[0];
            lead.techAudit = scraped.techAudit;
          } else {
            // Website is broken or unreachable! Even better pitch angle!
            lead.websiteBroken = true;
            lead.hasWebsite = false;
          }
        }

        // If lead is still missing phone or email, run a quick targeted search for contact info
        if (!lead.phone || !lead.email) {
          try {
            const contactSearch = await this.webSearch(`"${lead.name}" ${geo.city} ${zipCode} phone email contact`, 5);
            const combinedSnippets = (contactSearch.results || []).map(r => `${r.title} ${r.snippet} ${r.url}`).join(' ');
            if (!lead.phone) {
              const foundPhones = this.extractPhones(combinedSnippets);
              if (foundPhones.length > 0) lead.phone = foundPhones[0];
            }
            if (!lead.email) {
              const foundEmails = this.extractEmails(combinedSnippets);
              if (foundEmails.length > 0) lead.email = foundEmails[0];
            }
            if (!lead.hasWebsite && contactSearch.results?.length > 0) {
              // Check if a real non-directory website or Facebook page showed up
              for (const r of contactSearch.results) {
                if (!this.isDirectoryOrSocialUrl(r.url) && r.url.toLowerCase().includes(lead.name.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, ''))) {
                  lead.website = r.url;
                  lead.hasWebsite = true;
                  const subScrape = await this.webScrapePage(r.url, { extractContacts: true, analyzeTechStack: true, deepContactCrawl: false });
                  if (subScrape.success) {
                    if (!lead.email && subScrape.emails?.length > 0) lead.email = subScrape.emails[0];
                    if (!lead.phone && subScrape.phones?.length > 0) lead.phone = subScrape.phones[0];
                    lead.techAudit = subScrape.techAudit;
                  }
                  break;
                }
              }
            }
          } catch (_) {}
        }

        // Build custom Batch15Studios Pitch & Email Draft
        const pitchData = this.generateBatch15PitchAndDraft(lead, geo, zipCode);
        return {
          leadNumber,
          ...lead,
          websiteStatusLabel: !lead.hasWebsite
            ? (lead.websiteBroken ? 'BROKEN / OFFLINE WEBSITE' : 'NO WEBSITE (Directory Only)')
            : `${lead.techAudit?.cmsOrBuilder || 'Active Website'}${lead.techAudit?.hasAiOrChatWidget ? ' (Has Chat)' : ' (NO AI / Chat Automation)'}`,
          pitchAngle: pitchData.pitchAngle,
          emailSubject: pitchData.subject,
          emailBody: pitchData.body,
          draftCreated: false,
          draftId: null
        };
      }));
      enrichedLeads.push(...enrichedBatch);
    }

    // Step 4: Create Gmail Drafts if requested & authenticated
    let draftsCreatedCount = 0;
    if (autoCreateDrafts && this.workspaceManager && this.workspaceManager.isAuthenticated()) {
      for (const lead of enrichedLeads) {
        if (lead.email) {
          try {
            const draftRes = await this.workspaceManager.createDraft(lead.email, lead.emailSubject, lead.emailBody);
            if (draftRes && draftRes.success) {
              lead.draftCreated = true;
              lead.draftId = draftRes.draftId;
              draftsCreatedCount++;
            }
          } catch (e) {
            console.warn(`[LeadEngine] Failed to create draft for ${lead.name}:`, e.message);
          }
        }
      }
    }

    // Save leads to local JSON for approval-gated sending
    this.saveLeadsToDisk({
      generatedAt: new Date().toISOString(),
      zipCode,
      city: geo.city,
      state: geo.state,
      category,
      leads: enrichedLeads
    });

    // Step 5: Generate Multi-Column Visual Outputs (Local HTML Dashboard + Google Sheet + Google Doc)
    const reportPath = this.generateHtmlLeadReport(enrichedLeads, { zipCode, city: geo.city, state: geo.state, category });
    const reportUrl = 'http://127.0.0.1:4242/leads-report.html';

    // Open the visual report automatically in the Workspace Deck Browser!
    if (this.emitter) {
      this.emitter.emit('workspace_control', {
        action: 'navigate_browser',
        mode: 'browser',
        url: reportUrl
      });
    }

    let googleSheetUrl = null;
    let googleDocUrl = null;

    if (exportToWorkspace && this.workspaceManager && this.workspaceManager.isAuthenticated()) {
      // 5A: Create Google Sheet in Columns
      try {
        const sheetTitle = `Batch15Studios Leads - ${category.toUpperCase()} (${zipCode} - ${geo.city}) - ${new Date().toLocaleDateString()}`;
        const sheetRes = await this.workspaceManager.createSpreadsheet(sheetTitle);
        if (sheetRes && sheetRes.spreadsheetId) {
          googleSheetUrl = sheetRes.url;
          const rows = [
            ['Lead #', 'Business Name', 'Category', 'Phone', 'Email', 'Location / Address', 'Website Status', 'Batch15Studios Pitch Angle', 'Email Subject', 'Email Draft Body', 'Draft Status'],
            ...enrichedLeads.map(l => [
              String(l.leadNumber),
              l.name,
              l.category,
              l.phone || 'Not listed',
              l.email || 'Phone / Social Outreach',
              l.address,
              l.websiteStatusLabel,
              l.pitchAngle,
              l.emailSubject,
              l.emailBody,
              l.draftCreated ? 'Saved in Gmail Drafts' : (l.email ? 'Ready to Draft' : 'Needs Email / Call Lead')
            ])
          ];
          await this.workspaceManager.appendSheetRow(sheetRes.spreadsheetId, 'Sheet1!A1', rows);
        }
      } catch (sheetErr) {
        console.warn('[LeadEngine] Google Sheet export warning:', sheetErr.message);
      }

      // 5B: Create Google Doc in Columns / Structured Print Format
      try {
        const docTitle = `Batch15Studios Outreach Dossier — ${category} (${zipCode})`;
        const docText = this.buildFormattedDocContent(enrichedLeads, { zipCode, city: geo.city, state: geo.state, category, googleSheetUrl });
        const docRes = await this.workspaceManager.createDoc(docTitle, docText);
        if (docRes && docRes.url) {
          googleDocUrl = docRes.url;
        }
      } catch (docErr) {
        console.warn('[LeadEngine] Google Doc export warning:', docErr.message);
      }
    }

    const noWebsiteCount = enrichedLeads.filter(l => !l.hasWebsite).length;
    const withEmailCount = enrichedLeads.filter(l => !!l.email).length;

    return {
      success: true,
      zipCode,
      location: `${geo.city}${geo.state ? ', ' + geo.state : ''}`,
      category,
      totalLeadsFound: enrichedLeads.length,
      leadsWithoutWebsite: noWebsiteCount,
      leadsWithEmail: withEmailCount,
      gmailDraftsCreated: draftsCreatedCount,
      visualReportOpenedInBrowser: reportUrl,
      localReportFile: reportPath,
      googleSheetUrl,
      googleDocUrl,
      voiceSummaryInstruction: `DO NOT read all ${enrichedLeads.length} leads out loud one by one! The full multi-column table and email drafts are now displayed on Ryan's screen in the Workspace Deck Browser${googleSheetUrl ? ', saved to a Google Sheet in columns,' : ''}${googleDocUrl ? ' and saved to a Google Doc' : ''}. Give Ryan a concise 2-sentence executive summary of the counts and ask which leads he approves to send.`,
      leadsPreview: enrichedLeads.slice(0, 5).map(l => ({
        leadNumber: l.leadNumber,
        name: l.name,
        phone: l.phone,
        email: l.email,
        websiteStatus: l.websiteStatusLabel,
        draftCreated: l.draftCreated
      }))
    };
  }

  // ===========================================================================
  // 4. APPROVAL-GATED EMAIL SENDER
  // ===========================================================================
  async sendApprovedLeadEmails(options = {}) {
    if (!this.workspaceManager || !this.workspaceManager.isAuthenticated()) {
      return { error: 'Google Workspace is not authenticated. Please connect Google Workspace first.' };
    }

    if (!fs.existsSync(this.leadsFilePath)) {
      return { error: 'No saved lead batch found. Run find_local_business_leads first.' };
    }

    const saved = JSON.parse(fs.readFileSync(this.leadsFilePath, 'utf-8'));
    const leads = saved.leads || [];
    const targetSelection = options.leadNumbers || options.selection || 'all';
    const overrideEmailMap = options.emailOverrides || {}; // Optional { "1": "owner@business.com" }

    let toSend = [];
    if (targetSelection === 'all' || (Array.isArray(targetSelection) && targetSelection.length === 0)) {
      toSend = leads;
    } else if (Array.isArray(targetSelection)) {
      const numSet = new Set(targetSelection.map(n => Number(n)));
      toSend = leads.filter(l => numSet.has(Number(l.leadNumber)));
    } else if (typeof targetSelection === 'string') {
      const nums = targetSelection.match(/\d+/g)?.map(Number) || [];
      if (nums.length > 0) {
        const numSet = new Set(nums);
        toSend = leads.filter(l => numSet.has(Number(l.leadNumber)));
      } else {
        toSend = leads;
      }
    }

    const sentResults = [];
    const skippedNoEmail = [];

    for (const lead of toSend) {
      const recipientEmail = overrideEmailMap[lead.leadNumber] || lead.email;
      if (!recipientEmail) {
        skippedNoEmail.push({ leadNumber: lead.leadNumber, name: lead.name, phone: lead.phone });
        continue;
      }

      const res = await this.workspaceManager.sendEmail(recipientEmail, lead.emailSubject, lead.emailBody);
      if (res && res.success) {
        lead.emailSent = true;
        lead.sentAt = new Date().toISOString();
        sentResults.push({
          leadNumber: lead.leadNumber,
          name: lead.name,
          to: recipientEmail,
          subject: lead.emailSubject,
          messageId: res.messageId
        });
      }
    }

    this.saveLeadsToDisk(saved);

    return {
      success: true,
      sentCount: sentResults.length,
      skippedNoEmailCount: skippedNoEmail.length,
      sentEmails: sentResults,
      skippedLeadsNeedingEmailOrCall: skippedNoEmail
    };
  }

  // ===========================================================================
  // HELPER METHODS: PARSING, PITCH GENERATION, & MULTI-COLUMN REPORT BUILDERS
  // ===========================================================================
  parseSearchItemIntoLead(item, category, geo, zipCode) {
    if (!item || !item.url || !item.title) return null;
    const lowerUrl = item.url.toLowerCase();

    // Skip generic aggregator articles ("Top 10 Best Plumbers in...", "How much does a plumber cost")
    if (/^(top|best|\d+\s+best|how\s+much|cost\s+of|reviews\s+for|find\s+the\s+best)/i.test(item.title.trim())) {
      return null;
    }

    const isDirectoryListing = DIRECTORY_DOMAINS.some(d => lowerUrl.includes(d));
    const phonesInSnippet = this.extractPhones(`${item.title} ${item.snippet}`);
    const emailsInSnippet = this.extractEmails(`${item.title} ${item.snippet}`);

    // Clean business name from title
    let cleanName = item.title
      .split(/\s+[-|•–—:]\s+/)[0]
      .replace(/\b(Yelp|Yellow Pages|BBB|Better Business Bureau|Facebook|HomeAdvisor|Angi|MapQuest|Manta)\b/gi, '')
      .trim();

    if (cleanName.length < 3 || cleanName.length > 65) return null;

    return {
      name: cleanName,
      category,
      phone: phonesInSnippet[0] || '',
      email: emailsInSnippet[0] || '',
      address: `${geo.city}${geo.state ? ', ' + geo.state : ''} ${zipCode}`,
      website: isDirectoryListing ? '' : item.url,
      hasWebsite: !isDirectoryListing,
      directorySource: isDirectoryListing ? new URL(item.url).hostname.replace('www.', '') : 'Direct Web',
      directoryUrl: item.url
    };
  }

  generateBatch15PitchAndDraft(lead, geo, zipCode) {
    const city = geo.city || zipCode;
    const bizName = lead.name;
    const trade = lead.category || 'service';

    let pitchAngle = '';
    let subject = '';
    let body = '';

    if (!lead.hasWebsite) {
      pitchAngle = lead.websiteBroken
        ? `Website (${lead.website}) is currently offline/broken. High-priority Batch15Studios rebuild + 24/7 AI lead capture.`
        : `No standalone website found (only listed on ${lead.directorySource}). Losing local ${city} search traffic + missing 24/7 AI booking automation.`;

      subject = `Quick question about ${bizName} (${city} web presence & AI booking)`;
      body = `Hi ${bizName} team,

I was searching for local ${trade} professionals in ${city} (${zipCode}) and noticed that while ${bizName} comes up in directory listings, you don't currently have a dedicated, high-converting website or automated booking system attached to it.

Right now, when local homeowners search Google for ${trade} services in ${city}, businesses without a fast modern website and instant response automation lose those jobs to competitors who answer first.

I run Batch15Studios. We specialize in building modern, lightning-fast web stacks paired with custom AI Automations specifically for service businesses:
• Custom High-Speed Web Stack: Built to rank locally in ${city} (${zipCode}) and turn visitors into booked jobs.
• 24/7 AI Receptionist & Missed-Call Text-Back: If you're on a job site and miss a call, our AI immediately texts the customer back, answers their questions, and books the estimate onto your calendar automatically.
• Automated Quote & Review Follow-ups: Zero manual admin work.

I already put together a quick concept of how this would look specifically for ${bizName}. Are you open to a quick 5-minute chat this week so I can show it to you?

Best regards,
Ryan Satterfield
Founder, Batch15Studios
batch15studios@gmail.com${lead.phone ? `\n(Ref: ${bizName} — ${lead.phone})` : ''}`;
    } else {
      const cms = lead.techAudit?.cmsOrBuilder || 'existing site';
      const hasAi = lead.techAudit?.hasAiOrChatWidget;
      pitchAngle = !hasAi
        ? `Has website (${cms}) but ZERO AI chat/booking automation. Pitch Batch15Studios AI Receptionist + Modern Stack upgrade.`
        : `Active site (${cms}). Pitch Batch15Studios custom AI workflow automation & next-gen web stack optimization.`;

      subject = `Idea for ${bizName}'s website & AI lead capture in ${city}`;
      body = `Hi ${bizName} team,

I was taking a look at ${bizName}'s website (${lead.website}) while researching ${trade} companies in ${city} (${zipCode}).

You have a solid local presence, but I noticed your site is currently running on ${cms} without an automated 24/7 AI receptionist or instant quote-capture workflow. When potential customers visit after hours—or while your crew is busy on a job—most leave if they can't get an instant answer or booking confirmation.

At Batch15Studios, we help local ${trade} businesses upgrade to a high-performance modern web stack integrated with custom AI Automations:
• 24/7 AI Lead & Booking Assistant: Engages website visitors and missed callers in real time, qualifies the job, and schedules estimates straight to your calendar.
• Next-Gen Web Development Stack: Ultra-fast load speeds and conversion-engineered layouts that outperform legacy ${cms} templates.
• Automated Customer Workflows: Instant SMS/email follow-ups and review generation.

Would you be open to a brief 5-minute walkthrough this week to see how we could plug this into ${bizName}?

Best regards,
Ryan Satterfield
Founder, Batch15Studios
batch15studios@gmail.com`;
    }

    return { pitchAngle, subject, body };
  }

  generateHtmlLeadReport(leads, meta) {
    const reportHtmlPath = path.join(this.rootDir, 'leads-report.html');
    const rowsHtml = leads.map(l => {
      const badgeColor = !l.hasWebsite ? '#ff3366' : '#00e5ff';
      const draftBadge = l.draftCreated
        ? '<span class="badge badge-green">✓ Gmail Draft Saved</span>'
        : (l.email ? '<span class="badge badge-cyan">Ready to Draft</span>' : '<span class="badge badge-amber">Phone / Social Lead</span>');

      return `
        <tr>
          <td class="col-num">#${l.leadNumber}</td>
          <td class="col-name">
            <div class="biz-name">${this.escapeHtml(l.name)}</div>
            <div class="biz-sub">${this.escapeHtml(l.category)} • ${this.escapeHtml(l.directorySource)}</div>
          </td>
          <td class="col-contact">
            <div><strong>Phone:</strong> ${this.escapeHtml(l.phone || 'Not listed')}</div>
            <div><strong>Email:</strong> ${l.email ? `<a href="mailto:${this.escapeHtml(l.email)}">${this.escapeHtml(l.email)}</a>` : '<span class="muted">None on public page</span>'}</div>
            <div class="biz-addr">${this.escapeHtml(l.address)}</div>
          </td>
          <td class="col-status">
            <span class="status-pill" style="border-color:${badgeColor}; color:${badgeColor};">
              ${this.escapeHtml(l.websiteStatusLabel)}
            </span>
            ${l.website ? `<div class="site-link"><a href="${this.escapeHtml(l.website)}" target="_blank">${this.escapeHtml(l.website)}</a></div>` : ''}
          </td>
          <td class="col-pitch">${this.escapeHtml(l.pitchAngle)}</td>
          <td class="col-draft">
            ${draftBadge}
            <details class="draft-details">
              <summary>View Customized Email Draft</summary>
              <div class="draft-box">
                <div class="draft-subj"><strong>Subject:</strong> ${this.escapeHtml(l.emailSubject)}</div>
                <pre class="draft-body">${this.escapeHtml(l.emailBody)}</pre>
              </div>
            </details>
          </td>
        </tr>
      `;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Batch15Studios — Lead Intelligence Report (${this.escapeHtml(meta.zipCode)})</title>
  <style>
    :root {
      --bg: #070d14;
      --card: #0c1622;
      --border: #1b3248;
      --cyan: #00e5ff;
      --crimson: #ff3366;
      --green: #10b981;
      --amber: #f59e0b;
      --text: #e2e8f0;
      --muted: #849bb0;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      background: var(--bg);
      color: var(--text);
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--card);
      border: 1px solid var(--border);
      border-left: 4px solid var(--cyan);
      padding: 16px 22px;
      border-radius: 6px;
      margin-bottom: 20px;
    }
    .header-title h1 {
      margin: 0 0 4px 0;
      font-size: 20px;
      letter-spacing: 0.5px;
      color: #fff;
    }
    .header-title p {
      margin: 0;
      font-size: 13px;
      color: var(--muted);
    }
    .header-actions {
      display: flex;
      gap: 10px;
    }
    .btn {
      background: rgba(0, 229, 255, 0.12);
      border: 1px solid var(--cyan);
      color: var(--cyan);
      padding: 8px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
    }
    .btn:hover {
      background: var(--cyan);
      color: #050a10;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      font-size: 13px;
    }
    th {
      background: #102030;
      color: var(--cyan);
      text-align: left;
      padding: 12px 14px;
      font-size: 11.5px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }
    tr:hover {
      background: rgba(0, 229, 255, 0.04);
    }
    .col-num { width: 50px; font-weight: 700; color: var(--cyan); }
    .col-name { width: 18%; }
    .col-contact { width: 20%; }
    .col-status { width: 16%; }
    .col-pitch { width: 20%; color: #cbd5e1; line-height: 1.4; }
    .col-draft { width: 22%; }
    .biz-name { font-weight: 700; font-size: 14px; color: #fff; margin-bottom: 3px; }
    .biz-sub { font-size: 11.5px; color: var(--muted); text-transform: capitalize; }
    .biz-addr { font-size: 11.5px; color: var(--muted); margin-top: 3px; }
    .muted { color: var(--muted); font-style: italic; }
    a { color: var(--cyan); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .status-pill {
      display: inline-block;
      padding: 3px 8px;
      border: 1px solid;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .site-link { margin-top: 5px; font-size: 11px; word-break: break-all; }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .badge-green { background: rgba(16, 185, 129, 0.15); color: var(--green); border: 1px solid var(--green); }
    .badge-cyan { background: rgba(0, 229, 255, 0.15); color: var(--cyan); border: 1px solid var(--cyan); }
    .badge-amber { background: rgba(245, 158, 11, 0.15); color: var(--amber); border: 1px solid var(--amber); }
    .draft-details summary {
      cursor: pointer;
      color: var(--cyan);
      font-size: 12px;
      font-weight: 600;
      margin-top: 4px;
    }
    .draft-box {
      margin-top: 8px;
      background: #060c13;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 10px;
    }
    .draft-subj { font-size: 12px; margin-bottom: 6px; color: #fff; }
    .draft-body {
      margin: 0;
      white-space: pre-wrap;
      font-family: Consolas, monospace;
      font-size: 11.5px;
      color: #cbd5e1;
      line-height: 1.4;
    }
    @media print {
      body { background: #fff; color: #000; padding: 0; }
      .header-bar, table, td, th { background: #fff !important; color: #000 !important; border-color: #ccc !important; }
      .btn { display: none; }
      details { open: true; }
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="header-title">
      <h1>BATCH15STUDIOS // LOCAL LEAD & OUTREACH REPORT</h1>
      <p>Target Area: <strong>${this.escapeHtml(meta.city)}, ${this.escapeHtml(meta.state)} (${this.escapeHtml(meta.zipCode)})</strong> | Category: <strong>${this.escapeHtml(meta.category)}</strong> | Total Leads: <strong>${leads.length}</strong></p>
    </div>
    <div class="header-actions">
      <button class="btn" onclick="window.print()" style="display:inline-flex;align-items:center;gap:6px;">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        <span>Print / Save PDF</span>
      </button>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Business Name & Trade</th>
        <th>Contact Information</th>
        <th>Website & Stack Status</th>
        <th>Batch15Studios Pitch Angle</th>
        <th>Outreach Draft & Approval</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</body>
</html>`;

    fs.writeFileSync(reportHtmlPath, html, 'utf-8');
    return reportHtmlPath;
  }

  buildFormattedDocContent(leads, meta) {
    const lines = [
      `BATCH15STUDIOS — LOCAL LEAD INTELLIGENCE & OUTREACH DOSSIER`,
      `Location: ${meta.city}, ${meta.state} (${meta.zipCode})`,
      `Service Category: ${meta.category}`,
      `Generated: ${new Date().toLocaleString()}`,
      meta.googleSheetUrl ? `Google Sheet (Columns): ${meta.googleSheetUrl}` : '',
      `================================================================================`,
      ``,
      `SUMMARY TABLE (COLUMNS):`,
      `#   | BUSINESS NAME                  | PHONE            | EMAIL                          | WEBSITE STATUS`,
      `--------------------------------------------------------------------------------------------------------------`
    ];

    for (const l of leads) {
      const num = String(l.leadNumber).padEnd(3, ' ');
      const name = (l.name || '').substring(0, 28).padEnd(30, ' ');
      const phone = (l.phone || 'Not listed').substring(0, 14).padEnd(16, ' ');
      const email = (l.email || 'Phone/Social').substring(0, 28).padEnd(30, ' ');
      lines.push(`${num} | ${name} | ${phone} | ${email} | ${l.websiteStatusLabel}`);
    }

    lines.push(``);
    lines.push(`================================================================================`);
    lines.push(`INDIVIDUAL CUSTOMIZED OUTREACH DRAFTS (AWAITING RYAN'S APPROVAL)`);
    lines.push(`================================================================================`);
    lines.push(``);

    for (const l of leads) {
      lines.push(`[LEAD #${l.leadNumber}] ${l.name} (${l.category})`);
      lines.push(`Phone: ${l.phone || 'Not listed'} | Email: ${l.email || 'Not listed'} | Address: ${l.address}`);
      lines.push(`Status: ${l.websiteStatusLabel}`);
      lines.push(`Pitch Angle: ${l.pitchAngle}`);
      lines.push(`--- DRAFT EMAIL ---`);
      lines.push(`To: ${l.email || '[Send via Social / Contact Form / Phone]'}`);
      lines.push(`Subject: ${l.emailSubject}`);
      lines.push(l.emailBody);
      lines.push(`--------------------------------------------------------------------------------\n`);
    }

    return lines.join('\n');
  }

  saveLeadsToDisk(data) {
    try {
      if (!fs.existsSync(this.userDataPath)) {
        fs.mkdirSync(this.userDataPath, { recursive: true });
      }
      fs.writeFileSync(this.leadsFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[LeadEngine] Failed to save leads JSON:', e.message);
    }
  }

  extractEmails(html = '') {
    const found = new Set();
    // 1. mailto: links
    const mailtoRegex = /mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    let m;
    while ((m = mailtoRegex.exec(html)) !== null) {
      found.add(m[1].toLowerCase());
    }
    // 2. General email regex
    const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}\b/g;
    while ((m = emailRegex.exec(html)) !== null) {
      found.add(m[0].toLowerCase());
    }
    return [...found].filter(email => !IGNORED_EMAIL_PATTERNS.some(pat => pat.test(email)));
  }

  extractPhones(html = '') {
    const found = new Set();
    const text = this.stripHtml(html);
    const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;
    let m;
    while ((m = phoneRegex.exec(text)) !== null) {
      found.add(m[0].trim());
    }
    return [...found];
  }

  extractSocialLinks(html = '') {
    const found = new Set();
    const linkRegex = /href=["'](https?:\/\/(?:www\.)?(?:facebook\.com|instagram\.com|linkedin\.com|yelp\.com|nextdoor\.com)\/[^"'\s>]+)["']/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      found.add(m[1]);
    }
    return [...found];
  }

  findContactPageLink(html, baseUrl) {
    const linkRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const href = m[1];
      const text = this.stripHtml(m[2]).toLowerCase();
      if (href.toLowerCase().includes('contact') || href.toLowerCase().includes('about') || text.includes('contact') || text.includes('get in touch')) {
        try {
          return new URL(href, baseUrl).href;
        } catch (e) {}
      }
    }
    return null;
  }

  htmlToReadableText(html = '') {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  stripHtml(str = '') {
    return str
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  escapeHtml(str = '') {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

module.exports = { WebScraperLeadEngine };
