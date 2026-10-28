import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BM25Reranker } from '../src/reranker/bm25.js';
import { KnowledgeVault } from '../src/vault/database.js';
import { ContentExtractor } from '../src/distiller/extractor.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Sovereign Search — BM25 Reranker', () => {
  const reranker = new BM25Reranker();

  it('should chunk markdown by headers and paragraphs correctly', () => {
    const md = `
# Getting Started

This is the introductory paragraph about sovereign search and local databases.

## Configuration

Set the environment variable SOVEREIGN_VAULT_PATH to customize the database file.

\`\`\`bash
export SOVEREIGN_VAULT_PATH=/var/data/vault.db
\`\`\`

## Advanced Usage

For high-throughput crawlers, configure concurrency limits and delays.
    `;

    const chunks = reranker.chunkMarkdown(md, 'https://example.com/docs', 'Sample Doc');
    assert.ok(chunks.length >= 2, 'Should produce multiple chunks');
    assert.ok(chunks.some(c => c.heading.includes('Configuration')), 'Should capture Configuration heading');
  });

  it('should score and rank relevant passages higher with BM25', () => {
    const passages = [
      {
        sourceUrl: 'https://example.com/1',
        heading: 'Bananas and Apples',
        text: 'Bananas and apples are popular fruits grown in tropical and temperate regions.',
        tokens: ['bananas', 'apples', 'popular', 'fruits', 'grown', 'tropical']
      },
      {
        sourceUrl: 'https://example.com/2',
        heading: 'SQLite Configuration',
        text: 'Configure SQLite FTS5 full-text indexing to enable rapid sub-millisecond retrieval.',
        tokens: ['configure', 'sqlite', 'fts5', 'full-text', 'indexing', 'enable', 'rapid', 'retrieval']
      }
    ];

    const results = reranker.rank('sqlite full-text indexing', passages, 2);
    assert.equal(results.length, 2);
    assert.equal(results[0].heading, 'SQLite Configuration', 'SQLite passage should rank #1');
    assert.ok(results[0].score > results[1].score, 'Top score must be strictly greater');
  });
});

describe('Sovereign Search — Knowledge Vault (SQLite FTS5)', () => {
  const testDir = path.dirname(new URL(import.meta.url).pathname);
  const testDbPath = path.resolve(testDir, 'test-vault.db');
  let vault;

  it('should initialize schema and insert/search distilled pages', () => {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    vault = new KnowledgeVault(testDbPath);

    vault.savePage({
      url: 'https://example.com/playwright-guide',
      title: 'Playwright Automation Guide',
      excerpt: 'Guide to headless browser testing on Ubuntu Linux',
      markdown: 'To run Playwright on Linux headlessly, pass the --no-sandbox flag and configure viewport.',
      tag: 'test'
    });

    const results = vault.searchVault('Playwright Linux headless');
    assert.ok(results.length > 0, 'FTS5 should find the matching page');
    assert.equal(results[0].url, 'https://example.com/playwright-guide');

    const stats = vault.getStats();
    assert.equal(stats.totalPagesIndexed, 1);

    vault.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });
});

describe('Sovereign Search — Distiller Extractor', () => {
  const extractor = new ContentExtractor();

  it('should extract fenced code blocks and markdown tables', () => {
    const md = `
Here is a table:

| Feature | Support |
|---|---|
| Offline FTS5 | Yes |
| Zero API Keys | Yes |

And some code:

\`\`\`typescript
const client = new SovereignClient();
await client.search("test");
\`\`\`
    `;

    const codeBlocks = extractor.extractCodeBlocks(md);
    assert.equal(codeBlocks.length, 1);
    assert.equal(codeBlocks[0].language, 'typescript');
    assert.ok(codeBlocks[0].code.includes('new SovereignClient()'));

    const tables = extractor.extractTables(md);
    assert.equal(tables.length, 1);
    assert.ok(tables[0].includes('Offline FTS5'));
  });
});

describe('Sovereign Search — Spider Politeness & Robots.txt', () => {
  it('should parse robots.txt rules and disallow matching paths', async () => {
    const { SovereignSpider } = await import('../src/crawler/spider.js');
    const spider = new SovereignSpider({ delayMs: 10 });
    
    // Seed the cache directly to test matching logic without network call
    spider.robotsCache.set('https://example.com', ['/private', '/admin/']);

    const allowed = await spider.checkRobotsAllowed('https://example.com/docs/intro');
    assert.equal(allowed, true, '/docs/intro should be allowed');

    const blocked = await spider.checkRobotsAllowed('https://example.com/private/secret');
    assert.equal(blocked, false, '/private/secret should be blocked');

    const blockedAdmin = await spider.checkRobotsAllowed('https://example.com/admin/settings');
    assert.equal(blockedAdmin, false, '/admin/settings should be blocked');
  });

  it('should throttle domain requests based on delayMs', async () => {
    const { SovereignSpider } = await import('../src/crawler/spider.js');
    const spider = new SovereignSpider({ delayMs: 50 });

    const t0 = Date.now();
    await spider.throttleDomain('example.org');
    await spider.throttleDomain('example.org');
    const elapsed = Date.now() - t0;

    assert.ok(elapsed >= 45, `Elapsed (${elapsed}ms) should reflect at least ~50ms throttle delay`);
  });
});

