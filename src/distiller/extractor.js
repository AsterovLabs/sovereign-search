/**
 * =============================================================================
 * Sovereign Search — Dual-Tier Markdown Distiller & SPA Hydration
 * =============================================================================
 * @trce-id trce-mcphub-sovereign-distiller-001
 * @trce-who Sovereign Search MCP Server and web extraction agents.
 * @trce-what Transforms raw HTML into clean, token-dense Markdown with code/table fidelity.
 * @trce-where servers/sovereign-search/src/distiller/extractor.js
 * @trce-when Invoked during sovereign_extract or sovereign_ask workflows.
 * @trce-why Web pages are full of navigation, cookies, ads, and dynamic JS shells. Agents
 *          require clean, structured Markdown without burning context on noise.
 * @trce-how Fast path: HTTP fetch -> JSDOM -> Mozilla Readability -> Turndown with code rules.
 *          Dynamic path: Playwright Chromium headless execution for SPAs (React/Next.js/Vue).
 * =============================================================================
 */

import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

let sharedBrowser = null;

async function getHeadlessBrowser() {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return sharedBrowser;
}

export class ContentExtractor {
  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      emDelimiter: '_'
    });

    // Enhance Turndown for code block preservation
    this.turndown.addRule('fencedCodeBlock', {
      filter: ['pre'],
      replacement: (content, node) => {
        const codeElement = node.querySelector('code');
        let lang = '';
        if (codeElement) {
          const className = codeElement.getAttribute('class') || '';
          const match = className.match(/(?:lang|language)-(\w+)/);
          if (match) lang = match[1];
        }
        const text = node.textContent.trim();
        return `\n\`\`\`${lang}\n${text}\n\`\`\`\n`;
      }
    });

    // Enhance Turndown for tables
    this.turndown.addRule('tableRow', {
      filter: ['tr'],
      replacement: (content, node) => {
        return content + '\n';
      }
    });
  }

  /**
   * Determine whether the fetched HTML looks like an empty client-side rendered SPA shell.
   */
  isSpaShell(html, textContent) {
    if (!textContent || textContent.length < 200) {
      if (html.includes('id="root"') || 
          html.includes('id="__next"') || 
          html.includes('id="app"') || 
          html.includes('enable JavaScript') ||
          html.includes('requires JavaScript')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Fast static extraction using HTTP fetch + Mozilla Readability + Turndown.
   */
  async extractStatic(url) {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const html = await res.text();
    const doc = new JSDOM(html, { url });
    const reader = new Readability(doc.window.document, {
      charThreshold: 60
    });
    const article = reader.parse();

    if (!article || this.isSpaShell(html, article.textContent?.trim())) {
      return { isSpa: true, html };
    }

    // Convert cleaned article HTML to Markdown
    const markdown = this.turndown.turndown(article.content || '');

    return {
      isSpa: false,
      title: article.title || 'Untitled',
      author: article.byline || '',
      excerpt: article.excerpt || '',
      markdown: markdown.trim(),
      rawLength: html.length,
      cleanLength: markdown.length
    };
  }

  /**
   * Dynamic headless extraction via Playwright for client-side hydrated SPAs.
   */
  async extractDynamic(url) {
    const browser = await getHeadlessBrowser();
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      // Allow extra settling time for micro-framework hydration
      await page.waitForTimeout(500);

      const html = await page.content();
      const title = await page.title();

      const doc = new JSDOM(html, { url });
      const reader = new Readability(doc.window.document);
      const article = reader.parse();

      let markdown = '';
      if (article && article.content) {
        markdown = this.turndown.turndown(article.content);
      } else {
        // Fallback: strip scripts/styles and parse body directly
        const $ = cheerio.load(html);
        $('script, style, noscript, nav, footer, header, svg').remove();
        markdown = this.turndown.turndown($('body').html() || '');
      }

      return {
        title: article?.title || title || 'Untitled',
        author: article?.byline || '',
        excerpt: article?.excerpt || '',
        markdown: markdown.trim(),
        renderedWith: 'playwright-headless'
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  /**
   * Unified extract method with automatic fallback from Fast Static to Dynamic Headless.
   * @param {string} url Target webpage URL
   * @param {object} options force_browser (boolean), mode ('markdown'|'code'|'tables')
   */
  async extract(url, options = {}) {
    const { force_browser = false, mode = 'markdown' } = options;

    let result = null;

    if (force_browser) {
      result = await this.extractDynamic(url);
    } else {
      try {
        const staticResult = await this.extractStatic(url);
        if (staticResult.isSpa) {
          result = await this.extractDynamic(url);
        } else {
          result = staticResult;
        }
      } catch (err) {
        console.error(`[sovereign-distiller] Static extraction failed: ${err.message}. Retrying via Headless Browser...`);
        result = await this.extractDynamic(url);
      }
    }

    if (mode === 'code') {
      result.codeBlocks = this.extractCodeBlocks(result.markdown);
    } else if (mode === 'tables') {
      result.tables = this.extractTables(result.markdown);
    }

    return result;
  }

  /**
   * Extract all fenced code blocks from markdown.
   */
  extractCodeBlocks(markdown) {
    const regex = /```([a-zA-Z0-9_\-]+)?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;
    while ((match = regex.exec(markdown)) !== null) {
      blocks.push({
        language: match[1] || 'text',
        code: match[2].trim()
      });
    }
    return blocks;
  }

  /**
   * Extract markdown tables.
   */
  extractTables(markdown) {
    const lines = markdown.split('\n');
    const tables = [];
    let currentTable = [];
    let inTable = false;

    for (const line of lines) {
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        inTable = true;
        currentTable.push(line);
      } else {
        if (inTable) {
          if (currentTable.length >= 2) {
            tables.push(currentTable.join('\n'));
          }
          currentTable = [];
          inTable = false;
        }
      }
    }
    if (currentTable.length >= 2) {
      tables.push(currentTable.join('\n'));
    }
    return tables;
  }
}
