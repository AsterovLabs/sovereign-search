/**
 * =============================================================================
 * Sovereign Search — Autonomous Deep Crawler & Sitemap Spider
 * =============================================================================
 * @trce-id trce-mcphub-sovereign-spider-001
 * @trce-who Sovereign Search MCP Server and research agents.
 * @trce-what Autonomous BFS crawler and sitemap walker for targeted site ingestion.
 * @trce-where servers/sovereign-search/src/crawler/spider.js
 * @trce-when Invoked during sovereign_crawl workflows (e.g. ingesting documentation trees).
 * @trce-why Allows AI agents to ingest entire library or technical manuals autonomously
 *          without relying on third-party cloud crawl services.
 * @trce-how Discovers sitemaps; executes BFS traversal with domain scoping; extracts hyperlinks;
 *          distills page Markdown; respects concurrency limits and deduplicates URLs.
 * =============================================================================
 */

import * as cheerio from 'cheerio';
import { ContentExtractor } from '../distiller/extractor.js';

export class SovereignSpider {
  constructor(options = {}) {
    this.extractor = new ContentExtractor();
    this.concurrencyLimit = options.concurrency || 2;
    this.delayMs = options.delayMs || 300;
    this.respectRobots = options.respectRobots !== false;
    this.robotsCache = new Map();
    this.lastRequestPerDomain = new Map();
  }

  /**
   * Attempt to fetch and parse sitemap.xml for an origin.
   */
  async tryFetchSitemap(originUrl) {
    const urls = [];
    const origin = new URL(originUrl).origin;
    const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];

    for (const candidate of candidates) {
      try {
        const res = await fetch(candidate, {
          headers: { 'User-Agent': 'Asterov-Sovereign-Spider/1.0' },
          signal: AbortSignal.timeout(4000)
        });
        if (res.ok) {
          const xml = await res.text();
          const matches = xml.matchAll(/<loc>(https?:\/\/[^<]+)<\/loc>/g);
          for (const match of matches) {
            urls.push(match[1]);
          }
          if (urls.length > 0) break;
        }
      } catch {
        // Continue to next candidate
      }
    }

    return urls;
  }

  /**
   * Check if a URL is allowed under the origin's robots.txt.
   */
  async checkRobotsAllowed(targetUrl) {
    if (!this.respectRobots) return true;
    try {
      const parsed = new URL(targetUrl);
      const origin = parsed.origin;
      const pathname = parsed.pathname || '/';

      if (!this.robotsCache.has(origin)) {
        const disallowList = [];
        try {
          const res = await fetch(`${origin}/robots.txt`, {
            headers: { 'User-Agent': 'Asterov-Sovereign-Spider/1.0' },
            signal: AbortSignal.timeout(3000)
          });
          if (res.ok) {
            const txt = await res.text();
            let appliesToMe = false;
            for (const rawLine of txt.split('\n')) {
              const line = rawLine.trim();
              if (!line || line.startsWith('#')) continue;
              const matchAgent = line.match(/^User-agent:\s*(.*)$/i);
              if (matchAgent) {
                const agent = matchAgent[1].trim().toLowerCase();
                appliesToMe = agent === '*' || agent.includes('asterov') || agent.includes('spider');
                continue;
              }
              if (appliesToMe) {
                const matchDisallow = line.match(/^Disallow:\s*(.*)$/i);
                if (matchDisallow) {
                  const rule = matchDisallow[1].trim();
                  if (rule) disallowList.push(rule);
                }
              }
            }
          }
        } catch {
          // If robots.txt cannot be reached, default to permissive
        }
        this.robotsCache.set(origin, disallowList);
      }

      const disallowed = this.robotsCache.get(origin) || [];
      for (const rule of disallowed) {
        if (rule === '/') return false;
        if (pathname.startsWith(rule)) return false;
      }
      return true;
    } catch {
      return true;
    }
  }

  /**
   * Throttle requests to respect per-domain crawl politeness.
   */
  async throttleDomain(hostname) {
    const now = Date.now();
    const lastTime = this.lastRequestPerDomain.get(hostname) || 0;
    const elapsed = now - lastTime;
    if (elapsed < this.delayMs) {
      await new Promise((r) => setTimeout(r, this.delayMs - elapsed));
    }
    this.lastRequestPerDomain.set(hostname, Date.now());
  }

  /**
   * Extract internal hyperlinks from an HTML string.
   */
  extractLinks(html, baseUrl, originOnly = true) {
    const links = new Set();
    const $ = cheerio.load(html);
    const base = new URL(baseUrl);

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) return;

      try {
        const resolved = new URL(href, baseUrl);
        if (originOnly && resolved.origin !== base.origin) return;
        // Strip hash fragment
        resolved.hash = '';
        links.add(resolved.toString());
      } catch {
        // Invalid URL
      }
    });

    return Array.from(links);
  }

  /**
   * Run targeted crawl from a seed URL.
   * @param {string} seedUrl
   * @param {object} options maxDepth, maxPages, domainOnly, pathPrefix
   */
  async crawl(seedUrl, options = {}) {
    const {
      maxDepth = 2,
      maxPages = 10,
      domainOnly = true,
      pathPrefix = ''
    } = options;

    const seed = new URL(seedUrl);
    const visited = new Set();
    const queue = [{ url: seed.toString(), depth: 0 }];
    const crawledResults = [];

    // First check sitemap if deep crawl is requested
    if (maxPages > 5) {
      const sitemapLinks = await this.tryFetchSitemap(seed.origin);
      for (const link of sitemapLinks) {
        if (pathPrefix && !link.includes(pathPrefix)) continue;
        if (!visited.has(link) && queue.length < maxPages * 2) {
          queue.push({ url: link, depth: 1 });
        }
      }
    }

    while (queue.length > 0 && crawledResults.length < maxPages) {
      const item = queue.shift();
      const currentUrl = item.url;

      if (visited.has(currentUrl)) continue;
      visited.add(currentUrl);
      if (pathPrefix && !currentUrl.includes(pathPrefix)) continue;

      if (this.respectRobots) {
        const allowed = await this.checkRobotsAllowed(currentUrl);
        if (!allowed) {
          console.error(`[sovereign-spider] Skipped ${currentUrl} (disallowed by robots.txt)`);
          continue;
        }
      }

      await this.throttleDomain(new URL(currentUrl).hostname);

      try {
        // Extract page content
        const extracted = await this.extractor.extract(currentUrl, { force_browser: false });
        crawledResults.push({
          url: currentUrl,
          title: extracted.title,
          excerpt: extracted.excerpt,
          markdown: extracted.markdown,
          depth: item.depth
        });

        // Expand links if depth allows
        if (item.depth < maxDepth && queue.length < maxPages * 3) {
          // Fetch raw HTML for link extraction
          const rawRes = await fetch(currentUrl, {
            headers: { 'User-Agent': 'Asterov-Sovereign-Spider/1.0' },
            signal: AbortSignal.timeout(5000)
          }).catch(() => null);

          if (rawRes && rawRes.ok) {
            const rawHtml = await rawRes.text();
            const childLinks = this.extractLinks(rawHtml, currentUrl, domainOnly);
            for (const link of childLinks) {
              if (!visited.has(link) && !queue.some(q => q.url === link)) {
                queue.push({ url: link, depth: item.depth + 1 });
              }
            }
          }
        }

        // Polite delay
        if (this.delayMs > 0) {
          await new Promise(r => setTimeout(r, this.delayMs));
        }
      } catch (err) {
        console.error(`[sovereign-spider] Failed to crawl ${currentUrl}: ${err.message}`);
      }
    }

    return {
      seedUrl,
      totalPagesCrawled: crawledResults.length,
      pages: crawledResults
    };
  }
}
