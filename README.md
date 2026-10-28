# AsterovLabs Sovereign Search (`asterovlabs-sovereign-search`)

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![Protocol](https://img.shields.io/badge/Protocol-MCP_1.30+-orange.svg)](https://modelcontextprotocol.io/)
[![Website](https://img.shields.io/badge/Docs-asterovlabs.com-gold.svg)](https://asterovlabs.com/sovereign-search)

> **100% In-House Web Discovery, Deep Crawler, Markdown Distiller & Offline SQLite Knowledge Vault for Autonomous Agents**

`asterovlabs-sovereign-search` (`@asterov/sovereign-search-mcp`) equips AI coding agents, autonomous swarms, and local developers with comprehensive web research capabilities—with **zero third-party API keys**, zero recurring subscriptions or credit quotas, and complete data privacy.

Official Documentation & Architecture Specs: **[asterovlabs.com/sovereign-search](https://asterovlabs.com/sovereign-search)**

---

## Why Sovereign Search?

Cloud search APIs (Tavily, Brave, Google Custom Search) meter every query, charge steep monthly tiers, truncate technical documentation, and track your agents' research footprint.

**AsterovLabs Sovereign Search** provides a completely independent, local alternative:

1. **Zero External API Keys**: Routes queries through a local meta-search instance (SearXNG) or falls back directly to zero-key DOM scrapers (DuckDuckGo HTML, Mojeek).
2. **Deep Content Distillation**: Strips cookies, cookie consent modals, headers, sidebars, and ads—extracting high-density Markdown with strict preservation of syntax-highlighted code blocks and tables (powered by Mozilla Readability + Turndown, with automatic Playwright Chromium fallback for client-side rendered SPAs).
3. **Okapi BM25 Passage Reranker**: Chunks lengthy documentation by heading hierarchies and reranks passages using Okapi BM25 against the agent's specific technical question, minimizing context window bloat and eliminating hallucination.
4. **Offline SQLite FTS5 Knowledge Vault**: Automatically indexes every extracted article, documentation page, or research snippet into an embedded SQLite database (`~/.sovereign-search/vault.db`) with sub-millisecond full-text search (FTS5). Provides an offline technical memory that persists across chat sessions.
5. **Polite BFS Crawler**: Ingests entire technical documentation hierarchies with automatic `sitemap.xml` parsing, strict `robots.txt` compliance, and per-domain polite rate limiting.

---

## System Architecture

```
[ Agent / MCP Client (Claude / Antigravity / Cursor) ]
                         │
                         ▼ (JSON-RPC over stdio)
       [ Sovereign Search MCP Server (index.js) ]
                         │
       ┌─────────────────┼──────────────────┐
       ▼                 ▼                  ▼
[ Discovery Router ]  [ Content Distiller ] [ Knowledge Vault ]
  ├─ Local SearXNG     ├─ Mozilla Readability  └─ SQLite FTS5
  └─ Direct Scrapers   ├─ Turndown Engine         (node:sqlite)
                       └─ Playwright Chromium
                         │
                         ▼
               [ Okapi BM25 Reranker ]
             (Semantic Heading Chunking)
```

---

## Installation & Quickstart

### Using `npx` (No Installation Required)

```bash
npx -y @asterov/sovereign-search-mcp
```
or
```bash
npx -y asterovlabs-sovereign-search
```

### Global Installation

```bash
npm install -g @asterov/sovereign-search-mcp
asterovlabs-sovereign-search
```

---

## Client Configurations

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "sovereign-search": {
      "command": "npx",
      "args": ["-y", "@asterov/sovereign-search-mcp"],
      "env": {
        "SOVEREIGN_SEARXNG_URL": "http://127.0.0.1:8888"
      }
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "asterovlabs-sovereign-search": {
      "command": "npx",
      "args": ["-y", "@asterov/sovereign-search-mcp"],
      "env": {
        "SOVEREIGN_SEARXNG_URL": "http://127.0.0.1:8888"
      }
    }
  }
}
```

### Google Antigravity / Cline (`mcpSettings.json`)

```json
{
  "mcpServers": {
    "asterovlabs-sovereign-search": {
      "command": "node",
      "args": ["/path/to/sovereign-search/index.js"],
      "env": {
        "SOVEREIGN_SEARXNG_URL": "http://127.0.0.1:8888",
        "SOVEREIGN_VAULT_PATH": "~/.sovereign-search/vault.db"
      }
    }
  }
}
```

---

## Tool Reference

All 6 tools are exposed via standardized Model Context Protocol (MCP) JSON-RPC 2.0 over `stdio`:

| Tool Name | Parameters | Description |
|---|---|---|
| `sovereign_search` | `query` *(string, req)*, `limit` *(num, def: 8)*, `category` *(general, it, science, news)*, `time_range` *(day, week, month, year)*, `engine_mode` *(auto, searxng, scraper)* | Search the open web with 100% in-house discovery and zero commercial API keys. Queries local SearXNG and direct privacy scrapers with automatic deduplication. |
| `sovereign_extract` | `url` *(string, req)*, `force_browser` *(bool, def: false)*, `extract_mode` *(markdown, code, tables)* | Extract pristine, token-dense Markdown from any webpage. Cleans boilerplate and ads while preserving code blocks and tables. Falls back to headless browser for dynamic SPAs. |
| `sovereign_crawl` | `url` *(string, req)*, `max_depth` *(num, def: 2)*, `max_pages` *(num, def: 5)*, `domain_only` *(bool, def: true)*, `path_prefix` *(string)* | Autonomous deep crawler and sitemap walker. Ingests entire technical documentation trees or websites with domain scoping and concurrency controls. |
| `sovereign_ask` | `question` *(string, req)*, `search_depth` *(quick, deep)*, `top_passages` *(num, def: 5)* | Complete in-house RAG pipeline: discovers top web sources, extracts full text, chunks into semantic blocks, and uses local BM25 reranking to return only the densest relevant evidence passages. |
| `sovereign_vault_search` | `query` *(string, req)*, `limit` *(num, def: 5)* | Instant sub-millisecond offline search across the local SQLite FTS5 knowledge vault of previously scraped documentation, research, and technical solutions. |
| `sovereign_status` | _none_ | Inspect operational health and telemetry of the Sovereign Search MCP stack (SearXNG availability, scraper status, and SQLite knowledge vault metrics). |

---

## Optional Local SearXNG Setup

To run a dedicated, private meta-search engine on your machine:

```bash
docker compose -f docker-compose.searxng.yml up -d
```

Sovereign Search automatically auto-detects `http://127.0.0.1:8888` (or `http://localhost:8080`) if running, and gracefully falls back to direct HTML scrapers if SearXNG is unavailable.

---

## Running Tests

```bash
npm test
```

The test suite validates BM25 semantic passage ranking, SQLite FTS5 knowledge vault persistence, Markdown code/table extraction, and spider politeness / robots.txt compliance.

---

## License

Apache-2.0 © AsterovLabs / Samuel Dziekan. See [LICENSE](LICENSE) for terms.
