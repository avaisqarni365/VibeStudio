/**
 * Local AI Memory Search (roadmap A2 / Local AI Layer #9).
 *
 * Retrieval-augmented memory over the studio's own context corpus: memory.md,
 * the root context docs, everything under .claude/{sessions,prompts,bug-history,
 * sprint,cost-tracking}/, and a project's pack under projects/<slug>/.
 *
 * Embeddings run LOCALLY via Ollama (privacy rule — nothing goes to the cloud).
 * The index is a plain JSON file (.claude/.memory-index.json) scored with cosine
 * similarity — no vector-DB dependency, fully bundleable. If Ollama is
 * unavailable, search degrades to a lexical (token-overlap) fallback so the
 * feature still works.
 */
import { embedTexts } from "./ai-provider-service";

const fs = require("fs");
const path = require("path");

function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"));
      if (pkg.workspaces || fs.existsSync(path.join(dir, "turbo.json"))) return dir;
    } catch {}
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const ROOT_DOCS = [
  "memory.md", "PROJECT_PLAN.md", "PRD.md", "ARCHITECTURE.md", "DESIGN_SYSTEM.md",
  "DATABASE_DESIGN.md", "API_CONTRACT.md", "TASKS.md", "SPRINT_BOARD.md",
  "PROMPTS.md", "BUGFIX_HISTORY.md", "AGENTS.md", "CLAUDE.md",
];
const CLAUDE_DIRS = ["sessions", "prompts", "bug-history", "sprint", "cost-tracking"];
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "dist-electron", "dist-bundle", "release"]);
const INDEX_FILE = ".claude/.memory-index.json";

function collectMarkdown(dir: string, root: string, out: { source: string; text: string }[], depth = 0) {
  if (depth > 4 || !fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) collectMarkdown(full, root, out, depth + 1);
    else if (/\.(md|mdx)$/i.test(name)) {
      try {
        const text = fs.readFileSync(full, "utf-8");
        if (text.trim()) out.push({ source: path.relative(root, full).replace(/\\/g, "/"), text });
      } catch {}
    }
  }
}

/** Gather the corpus: root docs + .claude module folders + (optional) a project pack. */
function collectCorpus(projectSlug?: string): { source: string; text: string }[] {
  const root = repoRoot();
  const docs: { source: string; text: string }[] = [];
  for (const f of ROOT_DOCS) {
    const full = path.join(root, f);
    try { if (fs.existsSync(full)) docs.push({ source: f, text: fs.readFileSync(full, "utf-8") }); } catch {}
  }
  for (const d of CLAUDE_DIRS) collectMarkdown(path.join(root, ".claude", d), root, docs);
  collectMarkdown(path.join(root, ".claude", "skills"), root, docs);
  if (projectSlug) collectMarkdown(path.join(root, "projects", projectSlug), root, docs);
  return docs;
}

/** Split a document into ~1.2k-char chunks on heading/paragraph boundaries. */
function chunk(source: string, text: string): { id: string; source: string; text: string }[] {
  const parts: string[] = [];
  let buf = "";
  for (const block of text.split(/\n(?=#{1,3}\s)|\n\n+/)) {
    if ((buf + "\n\n" + block).length > 1200 && buf) { parts.push(buf); buf = block; }
    else buf = buf ? buf + "\n\n" + block : block;
  }
  if (buf.trim()) parts.push(buf);
  return parts.map((t, i) => ({ id: `${source}#${i}`, source, text: t.trim() })).filter(c => c.text.length > 20);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9_]{3,}/g) || []);
}
function lexicalScore(queryTokens: Set<string>, text: string): number {
  const t = tokens(text);
  if (!t.length) return 0;
  let hits = 0;
  for (const tok of t) if (queryTokens.has(tok)) hits++;
  return hits / Math.sqrt(t.length); // overlap, length-normalized
}

export const memorySearchService = {
  /** Build (or rebuild) the local embedding index. Falls back to a lexical-only index if Ollama is down. */
  async buildIndex(opts: { projectSlug?: string } = {}) {
    const root = repoRoot();
    const corpus = collectCorpus(opts.projectSlug);
    const chunks = corpus.flatMap(d => chunk(d.source, d.text));
    let embedded = 0;
    let mode: "embeddings" | "lexical" = "lexical";
    const records: any[] = chunks.map(c => ({ ...c }));

    try {
      // Embed in batches to keep request bodies sane.
      for (let i = 0; i < records.length; i += 32) {
        const batch = records.slice(i, i + 32);
        const vectors = await embedTexts(batch.map(r => r.text));
        batch.forEach((r, j) => { r.vector = vectors[j]; });
        embedded += batch.length;
      }
      mode = "embeddings";
    } catch (e: any) {
      // Ollama unavailable — keep the chunk text so search can still run lexically.
      for (const r of records) delete r.vector;
    }

    const index = { mode, model: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text", projectSlug: opts.projectSlug || null, count: records.length, embedded, chunks: records };
    fs.writeFileSync(path.join(root, INDEX_FILE), JSON.stringify(index));
    return { mode, files: corpus.length, chunks: records.length, embedded };
  },

  /** Semantic search over the index. Auto-builds if missing; lexical fallback if no embeddings. */
  async search(query: string, opts: { k?: number; projectSlug?: string } = {}) {
    if (!query || !query.trim()) throw new Error("query is required");
    const root = repoRoot();
    const indexPath = path.join(root, INDEX_FILE);

    let index: any;
    if (fs.existsSync(indexPath)) {
      try { index = JSON.parse(fs.readFileSync(indexPath, "utf-8")); } catch { index = null; }
    }
    if (!index) index = await memorySearchService.buildIndex({ projectSlug: opts.projectSlug });

    const k = Math.min(Math.max(Number(opts.k) || 6, 1), 25);
    let scored: { source: string; score: number; snippet: string }[];

    const haveVectors = index.mode === "embeddings" && index.chunks.some((c: any) => Array.isArray(c.vector));
    if (haveVectors) {
      let qvec: number[] | null = null;
      try { qvec = (await embedTexts([query]))[0]; } catch { qvec = null; }
      if (qvec) {
        scored = index.chunks
          .filter((c: any) => Array.isArray(c.vector))
          .map((c: any) => ({ source: c.source, score: cosine(qvec as number[], c.vector), snippet: c.text }));
      } else {
        scored = lexical(index.chunks, query);
      }
    } else {
      scored = lexical(index.chunks, query);
    }

    scored.sort((a, b) => b.score - a.score);
    return {
      mode: haveVectors ? "embeddings" : "lexical",
      query,
      results: scored.slice(0, k).map(r => ({ source: r.source, score: Number(r.score.toFixed(4)), snippet: r.snippet.slice(0, 600) })),
    };

    function lexical(chunks: any[], q: string) {
      const qt = new Set(tokens(q));
      return chunks.map((c: any) => ({ source: c.source, score: lexicalScore(qt, c.text), snippet: c.text }));
    }
  },
};
