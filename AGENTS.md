# AGENTS.md — AsterovLabs Sovereign Search Instruction Set

## Core Purpose & Authority

This repository is the canonical home and custodian for **AsterovLabs Sovereign Search** (`asterovlabs-sovereign-search` / `@asterov/sovereign-search-mcp`).
It provides 100% in-house web discovery, autonomous deep web crawling, high-density markdown distillation, BM25 semantic passage reranking, and an offline SQLite FTS5 knowledge vault for AI coding agents with zero third-party commercial search API dependencies.

AI assistants operating within or configuring this codebase MUST strictly follow these instructions.

---

## 1. Architectural Rules & Codebase Protocol

1. **CANONICAL MONO-PACKAGE**: All server logic, scrapers, extractors, crawlers, rerankers, and database engines belong under `src/`. Entry point is `index.js`.
2. **THE CONTEXT LOOP**: Before modifying code or adding tools:
   - Read this `AGENTS.md` file first.
   - Read `Context.md` at the repository root to understand module boundaries and the trace index.
   - Inspect existing `@trce-*` tags before touching any source file.
3. **STDIO STREAM INTEGRITY**: MCP servers communicate over standard I/O (JSON-RPC 2.0).
   - **`stdout` is strictly reserved for valid JSON-RPC frames.**
   - NEVER write debugging logs, console messages, or banner strings to `stdout`.
   - All logging, errors, or diagnostics MUST go to `stderr` (`console.error`).
4. **ZERO THIRD-PARTY CREDENTIAL DEPENDENCY**:
   - The engine must NEVER require external API keys (Tavily, Brave, Google Custom Search, etc.).
   - All discovery must route through local meta-search (SearXNG) or privacy scrapers (DuckDuckGo HTML, Mojeek).
   - Dynamic page extraction falls back to local headless Chromium via Playwright.
5. **NO FRAGILE HARDCODED PATHS OR SECRETS**:
   - Vault paths, SearXNG endpoints, and ports must be configurable via environment variables (`SOVEREIGN_VAULT_PATH`, `SOVEREIGN_SEARXNG_URL`, `SEARXNG_PORT`).
   - Default locations must use user home directory (`~/.sovereign-search/vault.db`) or local directory fallback (`.sovereign-vault.db`).
   - NEVER hardcode API tokens, secret keys, or private infrastructure details.
6. **TRCE SCAFFOLDING**: Every tool, server entry point, or major functional block must include inline 6-point TRCE scaffolding:
   - `WHO`: The initiating actor or agent.
   - `WHAT`: The mechanical action being performed.
   - `WHERE`: Position in system architecture and upstream/downstream dependencies.
   - `WHEN`: Specific lifecycle hook or trigger.
   - `WHY`: The architectural intent or real-world problem solved.
   - `HOW`: Structural implementation, parameters, state mutation, and trace routing.
   - Inject `@trce-id` and immediately map it in `Context.md`.
7. **VERIFICATION**:
   - Run `npm test` to ensure 100% test pass rate with zero regressions before committing.

---

## 2. Component Architecture

| Module | Location | Trace ID | Core Functionality |
|---|---|---|---|
| MCP Server Stdio Entry | `index.js` | `trce-mcphub-sovereign-001` | Exposes 6 MCP tools, handles JSON-RPC requests, routes to components. |
| Discovery Router | `src/discovery/router.js` | `trce-mcphub-sovereign-router-001` | Probes SearXNG, falls back to direct scrapers, deduplicates and normalizes URLs. |
| SearXNG Client | `src/discovery/searxng.js` | `trce-mcphub-sovereign-searxng-001` | Queries local SearXNG JSON API endpoint with health checks. |
| Direct Scraper | `src/discovery/direct-scraper.js` | `trce-mcphub-sovereign-scraper-001` | Zero-key HTML scraping for DuckDuckGo and Mojeek with Cheerio parsing. |
| Content Extractor | `src/distiller/extractor.js` | `trce-mcphub-sovereign-distiller-001` | Dual-tier extraction: fast static Readability/Turndown + dynamic Playwright for SPAs. |
| Sovereign Spider | `src/crawler/spider.js` | `trce-mcphub-sovereign-spider-001` | BFS web crawler, sitemap discovery, robots.txt conformance, rate limiting. |
| BM25 Reranker | `src/reranker/bm25.js` | `trce-mcphub-sovereign-bm25-001` | ATX heading markdown chunker and Okapi BM25 passage ranker. |
| Knowledge Vault | `src/vault/database.js` | `trce-mcphub-sovereign-vault-001` | SQLite database with FTS5 virtual tables using Node 22 native `node:sqlite`. |

---

## 3. Tool Reference (6 Tools)

1. `sovereign_search`: Query local meta-search engine and return deduplicated web results.
2. `sovereign_extract`: Fetch any web page or documentation URL and distill clean, readable Markdown.
3. `sovereign_crawl`: Crawl documentation hierarchies with sitemap discovery, `robots.txt` compliance, and rate limiting.
4. `sovereign_ask`: Full in-house RAG pipeline (search -> extract -> BM25 rank top evidence passages).
5. `sovereign_vault_search`: Sub-millisecond full-text search (FTS5) across all previously indexed web and doc content.
6. `sovereign_status`: Telemetry reporting SearXNG backend status, vault index counts, and disk usage.
