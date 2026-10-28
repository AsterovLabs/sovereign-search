#!/usr/bin/env node
/**
 * =============================================================================
 * Asterov Sovereign Search & Retrieval MCP Server — 100% In-House Architecture
 * =============================================================================
 * @trce-id trce-mcphub-sovereign-001
 * @trce-who Autonomous AI agents, deep research swarms, and sovereign engineering assistants.
 * @trce-what Zero-external-API web search engine, autonomous deep crawler, dual-tier markdown
 *          distiller, in-house BM25 passage ranker, and local SQLite FTS5 knowledge vault.
 * @trce-where servers/sovereign-search/index.js — upstream: MCP clients (Claude/AGY); downstream:
 *          local SearXNG, privacy HTML endpoints, Playwright Chromium, and .sovereign-vault.db.
 * @trce-when Invoked during web discovery, documentation scraping, error troubleshooting, and offline RAG.
 * @trce-why Commercial search APIs (Brave/Tavily) impose recurring costs, restrictive rate limits,
 *          token bloat, privacy tracking, and corporate kill-switch vulnerabilities.
 * @trce-how Exposes 6 high-density JSON-RPC tools over stdio; coordinates local SearXNG/scrapers;
 *          hydrates SPAs via Playwright; ranks passages with BM25; indexes into SQLite FTS5.
 * =============================================================================
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';

import { DiscoveryRouter } from './src/discovery/router.js';
import { ContentExtractor } from './src/distiller/extractor.js';
import { SovereignSpider } from './src/crawler/spider.js';
import { BM25Reranker } from './src/reranker/bm25.js';
import { KnowledgeVault } from './src/vault/database.js';

// Initialize core components
const router = new DiscoveryRouter();
const extractor = new ContentExtractor();
const spider = new SovereignSpider();
const reranker = new BM25Reranker();
const vault = new KnowledgeVault();

const server = new Server(
  { name: 'asterovlabs-sovereign-search', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'sovereign_search',
        description: 'Search the open web with 100% in-house discovery and zero commercial API keys. Queries local SearXNG and direct privacy scrapers with automatic deduplication.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search terms or natural language query' },
            limit: { type: 'number', description: 'Maximum number of results to return (default: 8, max: 20)', default: 8 },
            category: { type: 'string', description: 'Search category: general, it, science, news (default: general)', default: 'general' },
            time_range: { type: 'string', description: 'Time filter: day, week, month, year', enum: ['day', 'week', 'month', 'year'] },
            engine_mode: { type: 'string', description: 'Discovery engine preference: auto, searxng, scraper', enum: ['auto', 'searxng', 'scraper'], default: 'auto' }
          },
          required: ['query']
        }
      },
      {
        name: 'sovereign_extract',
        description: 'Extract pristine, token-dense Markdown from any webpage. Cleans boilerplate, ads, and navbars while preserving code blocks and tables. Falls back to headless browser for dynamic SPAs.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Target URL to extract' },
            force_browser: { type: 'boolean', description: 'Force full Playwright browser execution for dynamic client-side hydrated SPAs', default: false },
            extract_mode: { type: 'string', description: 'Extraction focus: markdown, code, tables', enum: ['markdown', 'code', 'tables'], default: 'markdown' }
          },
          required: ['url']
        }
      },
      {
        name: 'sovereign_crawl',
        description: 'Autonomous deep crawler and sitemap walker. Ingests entire technical documentation trees or websites with domain scoping and concurrency controls.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Seed URL to initiate crawl' },
            max_depth: { type: 'number', description: 'Maximum link traversal depth (default: 2, max: 3)', default: 2 },
            max_pages: { type: 'number', description: 'Maximum pages to ingest (default: 5, max: 20)', default: 5 },
            domain_only: { type: 'boolean', description: 'Restrict crawl strictly to the same domain', default: true },
            path_prefix: { type: 'string', description: 'Optional URL path prefix to scope crawling (e.g. /docs)' }
          },
          required: ['url']
        }
      },
      {
        name: 'sovereign_ask',
        description: 'Complete in-house RAG pipeline: discovers top web sources, extracts full text, chunks into semantic blocks, and uses local BM25 reranking to return only the densest relevant evidence passages.',
        inputSchema: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'The question or technical problem to answer' },
            search_depth: { type: 'string', description: 'Search depth: quick (top 3 sources) or deep (top 6 sources)', enum: ['quick', 'deep'], default: 'quick' },
            top_passages: { type: 'number', description: 'Number of high-density ranked passages to return (default: 5)', default: 5 }
          },
          required: ['question']
        }
      },
      {
        name: 'sovereign_vault_search',
        description: 'Instant sub-millisecond offline search across the local SQLite FTS5 knowledge vault of previously scraped documentation, research, and technical solutions.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Keywords or terms to search across the local offline knowledge base' },
            limit: { type: 'number', description: 'Maximum entries to return (default: 5)', default: 5 }
          },
          required: ['query']
        }
      },
      {
        name: 'sovereign_status',
        description: 'Inspect operational health and telemetry of the Sovereign Search MCP stack (SearXNG availability, scraper status, and SQLite knowledge vault metrics).',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case 'sovereign_search': {
        const { query, limit = 8, category = 'general', time_range = '', engine_mode = 'auto' } = args;
        
        // Check cache first
        const cached = vault.getCachedSearch(query);
        if (cached && cached.length > 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                query,
                source: 'local-cache-instant',
                totalResults: cached.length,
                results: cached.slice(0, limit)
              }, null, 2)
            }]
          };
        }

        const results = await router.search(query, {
          limit,
          category,
          time_range,
          engine_mode
        });

        if (results.length > 0) {
          vault.cacheSearch(query, results);
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query,
              totalResults: results.length,
              results
            }, null, 2)
          }]
        };
      }

      case 'sovereign_extract': {
        const { url, force_browser = false, extract_mode = 'markdown' } = args;
        const result = await extractor.extract(url, { force_browser, mode: extract_mode });

        // Index extracted page into local SQLite knowledge vault
        vault.savePage({
          url,
          title: result.title,
          excerpt: result.excerpt,
          markdown: result.markdown,
          tag: 'extract'
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      }

      case 'sovereign_crawl': {
        const { url, max_depth = 2, max_pages = 5, domain_only = true, path_prefix = '' } = args;
        const crawlResult = await spider.crawl(url, {
          maxDepth: Math.min(max_depth, 3),
          maxPages: Math.min(max_pages, 20),
          domainOnly,
          pathPrefix
        });

        // Index all crawled pages into vault
        for (const page of crawlResult.pages) {
          vault.savePage({
            url: page.url,
            title: page.title,
            excerpt: page.excerpt,
            markdown: page.markdown,
            tag: 'crawl'
          });
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              seedUrl: crawlResult.seedUrl,
              totalPagesCrawled: crawlResult.totalPagesCrawled,
              crawledSummary: crawlResult.pages.map(p => ({
                url: p.url,
                title: p.title,
                depth: p.depth,
                charCount: p.markdown?.length || 0
              }))
            }, null, 2)
          }]
        };
      }

      case 'sovereign_ask': {
        const { question, search_depth = 'quick', top_passages = 5 } = args;
        const sourceCount = search_depth === 'deep' ? 5 : 3;

        // 1. Discover top URLs
        const searchResults = await router.search(question, { limit: sourceCount });
        if (searchResults.length === 0) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                question,
                answer: 'No relevant search results found via sovereign discovery.',
                passages: []
              }, null, 2)
            }]
          };
        }

        // 2. Extract content from top URLs
        const allPassages = [];
        for (const sr of searchResults.slice(0, sourceCount)) {
          try {
            const extracted = await extractor.extract(sr.url, { force_browser: false });
            if (extracted && extracted.markdown) {
              vault.savePage({
                url: sr.url,
                title: extracted.title,
                excerpt: extracted.excerpt,
                markdown: extracted.markdown,
                tag: 'ask-evidence'
              });

              const chunks = reranker.chunkMarkdown(extracted.markdown, sr.url, extracted.title);
              allPassages.push(...chunks);
            }
          } catch (err) {
            console.error(`[sovereign-ask] Extraction failed for ${sr.url}: ${err.message}`);
          }
        }

        // 3. Local BM25 reranking
        const rankedPassages = reranker.rank(question, allPassages, top_passages);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              question,
              sourcesEvaluated: searchResults.slice(0, sourceCount).map(s => ({ title: s.title, url: s.url })),
              totalChunksAnalyzed: allPassages.length,
              topEvidencePassages: rankedPassages
            }, null, 2)
          }]
        };
      }

      case 'sovereign_vault_search': {
        const { query, limit = 5 } = args;
        const matches = vault.searchVault(query, limit);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query,
              vaultResultsCount: matches.length,
              results: matches
            }, null, 2)
          }]
        };
      }

      case 'sovereign_status': {
        const routerStatus = await router.getStatus();
        const vaultStats = vault.getStats();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              server: 'sovereign-search-mcp',
              version: '1.0.0',
              status: 'operational',
              discovery: routerStatus,
              knowledgeVault: vaultStats,
              offlineCapable: true,
              commercialApiDependencies: 0
            }, null, 2)
          }]
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (err) {
    console.error(`[sovereign-search-mcp] Error in ${name}: ${err.stack || err.message}`);
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `Error executing ${name}: ${err.message}`
      }]
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[sovereign-search-mcp] Sovereign Search & Retrieval MCP Server running over stdio (zero external APIs).');
}

main().catch((err) => {
  console.error(`[sovereign-search-mcp] Fatal server startup error: ${err.stack || err.message}`);
  process.exit(1);
});
