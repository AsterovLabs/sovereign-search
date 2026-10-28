/**
 * =============================================================================
 * Sovereign Search — SearXNG Local Discovery Client
 * =============================================================================
 * @trce-id trce-mcphub-sovereign-searxng-001
 * @trce-who Sovereign Search MCP Server and Discovery Router.
 * @trce-what Client for local self-hosted SearXNG metasearch instance.
 * @trce-where servers/sovereign-search/src/discovery/searxng.js
 * @trce-when Invoked when SearXNG instance is active on the configured host port.
 * @trce-why Aggregates 70+ search engines locally with zero API keys or external accounts.
 * @trce-how Issues HTTP GET to /search?format=json, parses standard results into normalized objects.
 * =============================================================================
 */

export class SearxngClient {
  constructor(baseUrl = process.env.SEARXNG_URL || 'http://127.0.0.1:8888') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeoutMs = 6000;
  }

  /**
   * Check if the local SearXNG service is reachable and responsive.
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${this.baseUrl}/healthz`, {
        signal: controller.signal
      }).catch(() => null);
      clearTimeout(id);

      if (res && (res.status === 200 || res.status === 404)) {
        return true;
      }

      // Fallback probe to root
      const rootRes = await fetch(`${this.baseUrl}/`, {
        signal: AbortSignal.timeout(1500)
      }).catch(() => null);

      return !!(rootRes && rootRes.ok);
    } catch {
      return false;
    }
  }

  /**
   * Execute an anonymous search query against local SearXNG.
   * @param {string} query Search terms
   * @param {object} options Category, engines, time_range, limit
   * @returns {Promise<Array<{ title: string, url: string, snippet: string, engine: string, score: number }>>}
   */
  async search(query, options = {}) {
    const {
      limit = 10,
      categories = 'general',
      time_range = '',
      language = 'en'
    } = options;

    const params = new URLSearchParams({
      q: query,
      format: 'json',
      categories,
      language
    });

    if (time_range) {
      params.set('time_range', time_range);
    }

    const targetUrl = `${this.baseUrl}/search?${params.toString()}`;

    try {
      const res = await fetch(targetUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Asterov-Sovereign-Search/1.0'
        },
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (!res.ok) {
        throw new Error(`SearXNG HTTP error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const rawResults = Array.isArray(data.results) ? data.results : [];

      return rawResults.slice(0, limit).map((item, idx) => ({
        title: item.title || 'Untitled',
        url: item.url,
        snippet: item.content || item.snippet || '',
        engine: item.engine || 'searxng',
        score: item.score || (1 - idx * 0.05),
        source: 'searxng'
      }));
    } catch (err) {
      console.error(`[sovereign-searxng] Query error: ${err.message}`);
      return [];
    }
  }
}
