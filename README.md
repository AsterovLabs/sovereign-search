# AsterovLabs Sovereign Search (`asterovlabs-sovereign-search`)

> **100% In-House Web Search, Deep Crawler, Markdown Distiller & Offline SQLite Knowledge Vault for Autonomous Agents**

`asterovlabs-sovereign-search` gives AI coding agents, autonomous workflows, and local environments deep web research capabilities with **zero third-party API keys**, zero credit limits, and complete data privacy.

---

## Why Sovereign Search?

Cloud search APIs (Tavily, Brave, Google Custom Search) meter every query, charge steep monthly bills, and often truncate technical documentation or inject advertisements.

**AsterovLabs Sovereign Search** changes this:
- **Zero API Keys**: Connects directly to local meta-search instances (SearXNG) or falls back to direct DOM scrapers.
- **Deep Content Distillation**: Strips cookie banners, navbars, and noise, converting web pages into dense, clean Markdown with preserved code blocks and tables.
- **BM25 Neural-Grade Reranking**: Scores and extracts the most relevant passages for the agent's query, minimizing context window bloat.
- **Persistent Knowledge Vault**: Every extracted page is indexed in an embedded SQLite database using FTS5 (Full-Text Search), creating a reusable, offline technical memory that persists across chat sessions.
- **Polite Crawling**: Deep BFS crawler walks documentation trees, parses sitemaps, obeys `robots.txt`, and enforces per-domain rate limiting.

---

## Installation & Quickstart

### Using `npx` (No Install Required)
```bash
npx @asterov/sovereign-search-mcp
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
        "SOVEREIGN_SEARXNG_URL": "http://localhost:8080"
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
        "SOVEREIGN_SEARXNG_URL": "http://localhost:8080"
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
        "SOVEREIGN_SEARXNG_URL": "http://localhost:8080",
        "SOVEREIGN_VAULT_PATH": "~/.sovereign-search/vault.db"
      }
    }
  }
}
```

---

## Tool Reference

| Tool Name | Parameters | Description |
|---|---|---|
| `sovereign_search` | `query` (string), `maxResults` (number), `engines` (string) | Query local meta-search engine and return deduplicated web results with BM25 passage scoring. |
| `sovereign_extract` | `url` (string), `force_browser` (bool), `save_to_vault` (bool) | Fetch any web page or documentation URL and distill clean, readable Markdown. |
| `sovereign_crawl` | `seedUrl` (string), `maxDepth` (number), `maxPages` (number) | Crawl documentation hierarchies with sitemap discovery, `robots.txt` compliance, and rate limiting. |
| `sovereign_vault_search`| `query` (string), `limit` (number), `tag` (string) | Sub-millisecond full-text search (FTS5) across all previously indexed web and doc content. |
| `sovereign_status` | _none_ | Telemetry reporting SearXNG backend status, vault index counts, and disk usage. |

---

## Optional Local SearXNG Setup

To run a dedicated, private meta-search engine on your machine:
```bash
docker compose -f docker-compose.searxng.yml up -d
```
Sovereign Search automatically auto-detects `http://localhost:8080` (or `http://127.0.0.1:8888`) if running.

---

## License
Apache-2.0 © AsterovLabs
