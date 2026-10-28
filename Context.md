# Context — AsterovLabs Sovereign Search

Canonical repository for **AsterovLabs Sovereign Search** (`asterovlabs-sovereign-search` / `@asterov/sovereign-search-mcp`).
100% in-house web search, deep crawler, markdown distiller, BM25 passage ranker, and local SQLite knowledge vault.

---

## 1. Project Layout

```
sovereign-search/
├── AGENTS.md                  # Authoritative instructions and architectural rules for agents
├── Context.md                 # Project architecture, component map, and TRCE trace index
├── README.md                  # Human-facing installation and usage instructions
├── LICENSE                    # Apache License 2.0
├── package.json               # Package definition and dependencies
├── .env.example               # Environment variables example
├── .gitignore                 # Node, database, and credential ignore rules
├── docker-compose.searxng.yml # Local SearXNG meta-search standalone container configuration
├── searxng-settings.yml       # SearXNG service settings
├── index.js                   # MCP Server entry point over stdio
├── src/
│   ├── crawler/
│   │   └── spider.js          # BFS crawler, sitemap walker, robots.txt conformance
│   ├── discovery/
│   │   ├── direct-scraper.js  # Zero-key HTML scraping for DuckDuckGo and Mojeek
│   │   ├── router.js          # Orchestrator between SearXNG and direct scrapers
│   │   └── searxng.js         # Client for local SearXNG JSON API endpoint
│   ├── distiller/
│   │   └── extractor.js       # Fast Readability/Turndown + dynamic Playwright for SPAs
│   ├── reranker/
│   │   └── bm25.js            # Semantic markdown chunker & Okapi BM25 passage ranker
│   └── vault/
│       └── database.js        # SQLite FTS5 knowledge vault using Node 22 native node:sqlite
└── test/
    └── sovereign-search.test.js # Unit tests for BM25, Vault, Distiller, and Spider
```

---

## 2. Trace Index

<!-- TRACE_INDEX_START -->
| Trace ID | Description | Location |
|---|---|---|
| `trce-mcphub-sovereign-001` | Zero-external-API web search engine, autonomous deep crawler, dual-tier markdown distiller, in-house BM25 passage ranker, and local SQLite FTS5 knowledge vault. | index.js |
| `trce-mcphub-sovereign-bm25-001` | Splits Markdown documents into semantic blocks and ranks passages via BM25. | src/reranker/bm25.js |
| `trce-mcphub-sovereign-distiller-001` | Transforms raw HTML into clean, token-dense Markdown with code/table fidelity. | src/distiller/extractor.js |
| `trce-mcphub-sovereign-router-001` | Orchestrates discovery requests between local SearXNG and direct scrapers. | src/discovery/router.js |
| `trce-mcphub-sovereign-scraper-001` | Native Node.js web search scraper targeting privacy search endpoints. | src/discovery/direct-scraper.js |
| `trce-mcphub-sovereign-searxng-001` | Client for local self-hosted SearXNG metasearch instance. | src/discovery/searxng.js |
| `trce-mcphub-sovereign-spider-001` | Autonomous BFS crawler and sitemap walker for targeted site ingestion. | src/crawler/spider.js |
| `trce-mcphub-sovereign-vault-001` | Embedded SQLite database with FTS5 virtual tables using Node 22 native node:sqlite. | src/vault/database.js |
<!-- TRACE_INDEX_END -->
