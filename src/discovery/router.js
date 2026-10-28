/**
 * =============================================================================
 * Sovereign Search — Discovery Router & Aggregator
 * =============================================================================
 * @trce-id trce-mcphub-sovereign-router-001
 * @trce-who Sovereign Search MCP Server and query agents.
 * @trce-what Orchestrates discovery requests between local SearXNG and direct scrapers.
 * @trce-where servers/sovereign-search/src/discovery/router.js
 * @trce-when Invoked during sovereign_search or sovereign_ask workflows.
 * @trce-why Provides a seamless, self-healing discovery layer with zero external API dependencies.
 * @trce-how Probes SearXNG availability; executes queries; falls back to DirectScraper;
 *          deduplicates canonical URLs, normalizes text, and formats response objects.
 * =============================================================================
 */

import { SearxngClient } from './searxng.js';
import { DirectScraper } from './direct-scraper.js';

export class DiscoveryRouter {
  constructor(options = {}) {
    this.searxng = new SearxngClient(options.searxngUrl);
    this.scraper = new DirectScraper();
  }

  /**
   * Route search query across available sovereign engines.
   * @param {string} query
   * @param {object} options limit, category, time_range, engine_mode ('auto'|'searxng'|'scraper')
   */
  async search(query, options = {}) {
    const {
      limit = 10,
      category = 'general',
      time_range = '',
      engine_mode = 'auto'
    } = options;

    const trimmedQuery = (query || '').trim();
    if (!trimmedQuery) {
      return [];
    }

    let rawResults = [];
    let usedEngine = 'none';

    if (engine_mode === 'searxng') {
      rawResults = await this.searxng.search(trimmedQuery, { limit, categories: category, time_range });
      usedEngine = 'searxng';
    } else if (engine_mode === 'scraper') {
      rawResults = await this.scraper.search(trimmedQuery, limit);
      usedEngine = 'scraper';
    } else {
      // Auto mode: Check SearXNG first
      const hasSearxng = await this.searxng.isAvailable();
      if (hasSearxng) {
        rawResults = await this.searxng.search(trimmedQuery, { limit, categories: category, time_range });
        usedEngine = 'searxng';
      }

      // If SearXNG returned empty or was unavailable, fallback to direct scraper
      if (!rawResults || rawResults.length === 0) {
        rawResults = await this.scraper.search(trimmedQuery, limit);
        usedEngine = 'direct-scraper-fallback';
      }
    }

    // Deduplicate by normalized URL
    const seenUrls = new Set();
    const cleanResults = [];

    for (const item of rawResults) {
      if (!item.url) continue;

      let normalizedUrl = item.url;
      try {
        const u = new URL(item.url);
        // Remove tracking query params
        u.searchParams.delete('utm_source');
        u.searchParams.delete('utm_medium');
        u.searchParams.delete('utm_campaign');
        u.searchParams.delete('fbclid');
        normalizedUrl = u.toString().replace(/\/+$/, '');
      } catch {
        // Keep as-is
      }

      if (seenUrls.has(normalizedUrl)) continue;
      seenUrls.add(normalizedUrl);

      cleanResults.push({
        title: (item.title || 'Untitled').replace(/\s+/g, ' ').trim(),
        url: item.url,
        snippet: (item.snippet || '').replace(/\s+/g, ' ').trim(),
        engine: item.engine || usedEngine,
        score: item.score || 0.9
      });

      if (cleanResults.length >= limit) break;
    }

    return cleanResults;
  }

  /**
   * Health and capability status report.
   */
  async getStatus() {
    const searxngAvailable = await this.searxng.isAvailable();
    return {
      searxng: {
        configuredUrl: this.searxng.baseUrl,
        available: searxngAvailable
      },
      directScraper: {
        status: 'ready',
        endpoints: ['duckduckgo-html', 'mojeek']
      }
    };
  }
}
