/**
 * =============================================================================
 * Sovereign Search — In-House SQLite Knowledge Vault & FTS5 Index
 * =============================================================================
 * @trce-id trce-mcphub-sovereign-vault-001
 * @trce-who Sovereign Search MCP Server and local memory engine.
 * @trce-what Embedded SQLite database with FTS5 virtual tables using Node 22 native node:sqlite.
 * @trce-where servers/sovereign-search/src/vault/database.js
 * @trce-when Invoked on every page extraction, crawl, and local vault search.
 * @trce-why Preserves a persistent, offline-capable technical knowledge repository of every
 *          documentation site, technical answer, or bugfix researched by agents.
 * @trce-how Manages .sovereign-vault.db via DatabaseSync; manages FTS5 virtual table indexes;
 *          computes SHA-256 hashes for content deduplication; provides sub-millisecond search.
 * =============================================================================
 */

import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export class KnowledgeVault {
  constructor(dbPath) {
    if (dbPath) {
      this.dbPath = dbPath;
    } else if (process.env.SOVEREIGN_VAULT_PATH) {
      this.dbPath = process.env.SOVEREIGN_VAULT_PATH;
    } else {
      const localPath = path.resolve(process.cwd(), '.sovereign-vault.db');
      const monorepoPath = path.resolve(process.cwd(), 'servers/sovereign-search/.sovereign-vault.db');
      if (fs.existsSync(localPath)) {
        this.dbPath = localPath;
      } else if (fs.existsSync(monorepoPath)) {
        this.dbPath = monorepoPath;
      } else {
        this.dbPath = path.join(os.homedir(), '.sovereign-search', 'vault.db');
      }
    }
    
    // Ensure parent directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE,
        title TEXT,
        excerpt TEXT,
        markdown TEXT,
        content_hash TEXT,
        tag TEXT DEFAULT 'general',
        created_at INTEGER,
        updated_at INTEGER
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
        title,
        markdown,
        url,
        tokenize = 'porter unicode61'
      );

      CREATE TABLE IF NOT EXISTS search_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT UNIQUE,
        results_json TEXT,
        created_at INTEGER
      );
    `);
  }

  /**
   * Compute SHA-256 hash of content.
   */
  hashContent(content) {
    return crypto.createHash('sha256').update(content || '').digest('hex');
  }

  /**
   * Save or update a distilled web page in the vault.
   */
  savePage({ url, title, excerpt = '', markdown = '', tag = 'general' }) {
    if (!url || !markdown) return null;

    const hash = this.hashContent(markdown);
    const now = Date.now();

    // Check if URL exists
    const existing = this.db.prepare('SELECT id, content_hash FROM pages WHERE url = ?').get(url);

    if (existing) {
      if (existing.content_hash === hash) {
        // Content unchanged, update timestamp
        this.db.prepare('UPDATE pages SET updated_at = ? WHERE id = ?').run(now, existing.id);
        return { id: existing.id, status: 'unchanged' };
      }

      // Update existing
      this.db.prepare(`
        UPDATE pages
        SET title = ?, excerpt = ?, markdown = ?, content_hash = ?, tag = ?, updated_at = ?
        WHERE id = ?
      `).run(title, excerpt, markdown, hash, tag, now, existing.id);

      // Re-index FTS
      this.db.prepare('DELETE FROM pages_fts WHERE url = ?').run(url);
      this.db.prepare('INSERT INTO pages_fts (title, markdown, url) VALUES (?, ?, ?)').run(title, markdown, url);

      return { id: existing.id, status: 'updated' };
    }

    // Insert new
    this.db.prepare(`
      INSERT INTO pages (url, title, excerpt, markdown, content_hash, tag, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(url, title, excerpt, markdown, hash, tag, now, now);

    // Index FTS
    this.db.prepare('INSERT INTO pages_fts (title, markdown, url) VALUES (?, ?, ?)').run(title, markdown, url);

    return { status: 'inserted' };
  }

  /**
   * Search local SQLite FTS5 index.
   * @param {string} query Search terms
   * @param {number} limit Max results
   */
  searchVault(query, limit = 5) {
    const cleanQuery = (query || '')
      .replace(/[^a-zA-Z0-9_\-\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .join(' OR ');

    if (!cleanQuery) return [];

    try {
      const rows = this.db.prepare(`
        SELECT p.url, p.title, p.excerpt, p.markdown, p.updated_at, rank
        FROM pages_fts fts
        JOIN pages p ON fts.url = p.url
        WHERE pages_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(cleanQuery, limit);

      return rows.map(r => ({
        url: r.url,
        title: r.title,
        excerpt: r.excerpt || r.markdown.substring(0, 200),
        snippet: r.markdown.substring(0, 400),
        updatedAt: new Date(r.updated_at).toISOString(),
        score: parseFloat((-r.rank).toFixed(2)),
        source: 'local-vault'
      }));
    } catch (err) {
      console.error(`[sovereign-vault] FTS search error: ${err.message}`);
      return [];
    }
  }

  /**
   * Cache search results.
   */
  cacheSearch(query, results) {
    const norm = (query || '').toLowerCase().trim();
    if (!norm || !results || results.length === 0) return;

    try {
      const now = Date.now();
      const json = JSON.stringify(results);
      this.db.prepare(`
        INSERT INTO search_cache (query, results_json, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(query) DO UPDATE SET results_json = excluded.results_json, created_at = excluded.created_at
      `).run(norm, json, now);
    } catch {
      // Ignore cache write errors
    }
  }

  /**
   * Retrieve cached search results if fresher than maxAgeMs (default 24h).
   */
  getCachedSearch(query, maxAgeMs = 86400000) {
    const norm = (query || '').toLowerCase().trim();
    if (!norm) return null;

    try {
      const row = this.db.prepare('SELECT results_json, created_at FROM search_cache WHERE query = ?').get(norm);
      if (!row) return null;

      if (Date.now() - row.created_at < maxAgeMs) {
        return JSON.parse(row.results_json);
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Telemetry and database statistics.
   */
  getStats() {
    try {
      const pageCount = this.db.prepare('SELECT COUNT(*) as count FROM pages').get().count;
      const searchCount = this.db.prepare('SELECT COUNT(*) as count FROM search_cache').get().count;
      let sizeBytes = 0;
      if (fs.existsSync(this.dbPath)) {
        sizeBytes = fs.statSync(this.dbPath).size;
      }
      return {
        vaultPath: this.dbPath,
        totalPagesIndexed: pageCount,
        cachedQueries: searchCount,
        databaseSizeBytes: sizeBytes
      };
    } catch (err) {
      return { error: err.message };
    }
  }

  close() {
    this.db.close();
  }
}
