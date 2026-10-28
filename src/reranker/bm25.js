/**
 * =============================================================================
 * Sovereign Search — In-House BM25 Semantic Chunker & Passage Reranker
 * =============================================================================
 * @trce-id trce-mcphub-sovereign-bm25-001
 * @trce-who Sovereign Search MCP Server and context-optimization pipeline.
 * @trce-what Splits Markdown documents into semantic blocks and ranks passages via BM25.
 * @trce-where servers/sovereign-search/src/reranker/bm25.js
 * @trce-when Invoked during sovereign_ask workflows to compress long documents into top passages.
 * @trce-why LLMs suffer from context bloating, high costs, and lost-in-the-middle errors when
 *          dumped with raw multi-thousand token documents.
 * @trce-how Chunks by ATX headings and fenced code blocks; computes token frequencies; calculates
 *          Okapi BM25 scores (k1=1.2, b=0.75); returns top-K densest relevant passages.
 * =============================================================================
 */

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can',
  'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have',
  'haven\'t', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'if',
  'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t',
  'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'should', 'shouldn\'t', 'so', 'some',
  'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'were',
  'weren\'t', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'won\'t', 'would',
  'wouldn\'t', 'you', 'your', 'yours', 'yourself', 'yourselves'
]);

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-\.\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

export class BM25Reranker {
  constructor(options = {}) {
    this.k1 = options.k1 || 1.2;
    this.b = options.b || 0.75;
  }

  /**
   * Chunk markdown document into structural passages by headings and paragraph boundaries.
   * @param {string} markdown
   * @param {string} sourceUrl
   * @param {string} title
   */
  chunkMarkdown(markdown, sourceUrl = '', title = '') {
    if (!markdown) return [];

    const lines = markdown.split('\n');
    const chunks = [];
    let currentHeading = title || 'Document';
    let currentBuffer = [];

    const flushBuffer = () => {
      const text = currentBuffer.join('\n').trim();
      if (text.length > 50) {
        chunks.push({
          sourceUrl,
          heading: currentHeading,
          text,
          tokens: tokenize(text)
        });
      }
      currentBuffer = [];
    };

    let insideCodeBlock = false;

    for (const line of lines) {
      if (line.trim().startsWith('```')) {
        insideCodeBlock = !insideCodeBlock;
        currentBuffer.push(line);
        continue;
      }

      if (!insideCodeBlock && /^#{1,4}\s+(.+)$/.test(line)) {
        flushBuffer();
        const match = line.match(/^#{1,4}\s+(.+)$/);
        currentHeading = match ? match[1].trim() : currentHeading;
        currentBuffer.push(line);
      } else {
        currentBuffer.push(line);
        // If buffer gets too large without a heading break, split naturally
        if (!insideCodeBlock && currentBuffer.join('\n').length > 1200) {
          flushBuffer();
        }
      }
    }

    flushBuffer();
    return chunks;
  }

  /**
   * Rank passages against a query using Okapi BM25 scoring.
   * @param {string} query Search query or question
   * @param {Array<object>} passages Array of chunks from chunkMarkdown
   * @param {number} topK Number of top passages to return
   */
  rank(query, passages, topK = 5) {
    if (!passages || passages.length === 0) return [];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
      return passages.slice(0, topK).map(p => ({ ...p, score: 0 }));
    }

    const N = passages.length;
    const avgdl = passages.reduce((acc, p) => acc + p.tokens.length, 0) / (N || 1);

    // Compute Document Frequency for each query token
    const df = {};
    for (const q of queryTokens) {
      let count = 0;
      for (const p of passages) {
        if (p.tokens.includes(q)) {
          count++;
        }
      }
      df[q] = count;
    }

    // Compute scores for each passage
    const scoredPassages = passages.map(passage => {
      let score = 0;
      const D_len = passage.tokens.length;

      // Count term frequencies in this passage
      const tf = {};
      for (const t of passage.tokens) {
        tf[t] = (tf[t] || 0) + 1;
      }

      for (const q of queryTokens) {
        const n_q = df[q] || 0;
        if (n_q === 0) continue;

        // Okapi BM25 IDF with Laplace smoothing
        const idf = Math.log(1 + (N - n_q + 0.5) / (n_q + 0.5));
        const f_q = tf[q] || 0;

        const numerator = f_q * (this.k1 + 1);
        const denominator = f_q + this.k1 * (1 - this.b + this.b * (D_len / (avgdl || 1)));

        score += idf * (numerator / (denominator || 1));
      }

      return {
        sourceUrl: passage.sourceUrl,
        heading: passage.heading,
        text: passage.text,
        score: parseFloat(score.toFixed(4))
      };
    });

    // Sort descending by score
    scoredPassages.sort((a, b) => b.score - a.score);

    return scoredPassages.slice(0, topK);
  }
}
