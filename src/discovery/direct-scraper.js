/**
 * =============================================================================
 * Sovereign Search — Zero-Key Direct HTML Scraper Engine
 * =============================================================================
 * @trce-id trce-mcphub-sovereign-scraper-001
 * @trce-who Sovereign Search MCP Server and Discovery Router.
 * @trce-what Native Node.js web search scraper targeting privacy search endpoints.
 * @trce-where servers/sovereign-search/src/discovery/direct-scraper.js
 * @trce-when Invoked as standalone discovery or when local SearXNG daemon is not running.
 * @trce-why Completely self-contained, requiring zero external API keys, accounts, or services.
 * @trce-how Fetches HTML from DuckDuckGo HTML and Mojeek endpoints, decodes canonical URLs,
 *          parses DOM using Cheerio, and normalizes into standardized search results.
 * =============================================================================
 */

import * as cheerio from 'cheerio';

const USER_AGENTS = [
  'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Decode redirect URLs often used by privacy search engines (e.g. //duckduckgo.com/l/?uddg=...).
 */
function cleanRedirectUrl(rawUrl) {
  if (!rawUrl) return '';

  if (rawUrl.startsWith('//')) {
    rawUrl = 'https:' + rawUrl;
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.searchParams.has('uddg')) {
      return decodeURIComponent(parsed.searchParams.get('uddg'));
    }
  } catch {
    // Fall back to original
  }

  return rawUrl;
}

export class DirectScraper {
  constructor() {
    this.timeoutMs = 7000;
  }

  /**
   * Primary scraper targeting DuckDuckGo HTML endpoint.
   * @param {string} query
   * @param {number} limit
   * @returns {Promise<Array<{ title: string, url: string, snippet: string, engine: string, score: number }>>}
   */
  async searchDuckDuckGo(query, limit = 10) {
    const params = new URLSearchParams({ q: query });
    const targetUrl = 'https://html.duckduckgo.com/html/';

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://html.duckduckgo.com/'
      },
      body: params.toString(),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!res.ok) {
      throw new Error(`DuckDuckGo returned HTTP status ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];

    $('.result').each((idx, element) => {
      if (results.length >= limit) return;

      const titleEl = $(element).find('.result__title a');
      const title = titleEl.text().trim();
      const rawHref = titleEl.attr('href');
      const snippet = $(element).find('.result__snippet').text().trim();

      if (!title || !rawHref) return;

      const cleanUrl = cleanRedirectUrl(rawHref);
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) return;

      results.push({
        title,
        url: cleanUrl,
        snippet: snippet || '',
        engine: 'duckduckgo-html',
        score: parseFloat((1.0 - results.length * 0.04).toFixed(2)),
        source: 'direct-scraper'
      });
    });

    return results;
  }

  /**
   * Fallback scraper targeting Mojeek (independent web search index).
   * @param {string} query
   * @param {number} limit
   * @returns {Promise<Array<{ title: string, url: string, snippet: string, engine: string, score: number }>>}
   */
  async searchMojeek(query, limit = 10) {
    const params = new URLSearchParams({ q: query });
    const targetUrl = `https://www.mojeek.com/search?${params.toString()}`;

    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!res.ok) {
      throw new Error(`Mojeek returned HTTP status ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];

    $('ul.results-standard > li').each((idx, element) => {
      if (results.length >= limit) return;

      const titleEl = $(element).find('h2 a.title');
      const title = titleEl.text().trim();
      const rawHref = titleEl.attr('href');
      const snippet = $(element).find('p.s').text().trim();

      if (!title || !rawHref) return;

      results.push({
        title,
        url: rawHref,
        snippet: snippet || '',
        engine: 'mojeek',
        score: parseFloat((0.9 - results.length * 0.04).toFixed(2)),
        source: 'direct-scraper'
      });
    });

    return results;
  }

  /**
   * Unified search with automatic waterfall across direct privacy endpoints.
   */
  async search(query, limit = 10) {
    try {
      const ddgResults = await this.searchDuckDuckGo(query, limit);
      if (ddgResults.length > 0) {
        return ddgResults;
      }
    } catch (err) {
      console.error(`[sovereign-scraper] DDG search error: ${err.message}. Trying Mojeek...`);
    }

    try {
      const mojeekResults = await this.searchMojeek(query, limit);
      if (mojeekResults.length > 0) {
        return mojeekResults;
      }
    } catch (err) {
      console.error(`[sovereign-scraper] Mojeek search error: ${err.message}`);
    }

    return [];
  }
}
