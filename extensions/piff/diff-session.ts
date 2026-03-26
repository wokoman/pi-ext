import {
  getChangedFiles,
  getOldNewContents,
  bulkGetAllContents,
  contentHash,
  type ChangedFile,
} from "./git.js";
import {
  SSRWorker,
  stripTrailingWS,
  type RenderOptions,
} from "./ssr-worker-client.js";
import { LRUCache } from "./lru-cache.js";

export type { RenderOptions } from "./ssr-worker-client.js";

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  diffStyle: "split",
  expandUnchanged: true,
  ignoreWhitespace: false,
};

const CACHE_MAX_ENTRIES = 500;

/** Number of SSR worker subprocesses for background preloading. */
const PRELOAD_WORKERS = 2;

function optionsKey(opts: RenderOptions): string {
  return `${opts.diffStyle}:${opts.expandUnchanged}:${opts.ignoreWhitespace}`;
}

function applyWhitespace(
  oldContent: string | null,
  newContent: string | null,
  ignoreWhitespace: boolean,
): { oldContent: string | null; newContent: string | null } {
  if (!ignoreWhitespace) return { oldContent, newContent };
  return {
    oldContent: stripTrailingWS(oldContent),
    newContent: stripTrailingWS(newContent),
  };
}

/**
 * Manages diff cache and background preloading for one piff session.
 *
 * Architecture:
 * - **userWorker**: dedicated SSR worker for user-initiated renders (never blocked)
 * - **preloadWorkers[]**: pool of SSR workers for background preloading
 *
 * Preload uses `git cat-file --batch` to bulk-read all file contents (~30× faster
 * than sequential `git show`), then distributes SSR rendering across the worker pool.
 *
 * Cache keys = content hash + options key, so:
 * - refresh() doesn't clear cache — unchanged files keep their entries
 * - switching split↔unified keeps old entries (LRU evicts coldest)
 */
export class DiffSession {
  private cache = new LRUCache<string, string>(CACHE_MAX_ENTRIES);
  private userWorker = new SSRWorker();
  private preloadWorkers: SSRWorker[] = [];
  private aborted = false;
  private filesCache: ChangedFile[] | null = null;
  renderOptions: RenderOptions;

  private knownHashes = new Map<string, string>();

  /** Hint: which file the user is currently viewing (for preload ordering). */
  currentFile: string | null = null;

  constructor(
    private diffArgs: string[],
    private cwd: string,
  ) {
    this.renderOptions = { ...DEFAULT_RENDER_OPTIONS };
    for (let i = 0; i < PRELOAD_WORKERS; i++) {
      this.preloadWorkers.push(new SSRWorker());
    }
  }

  getFiles(): ChangedFile[] {
    return (this.filesCache ??= getChangedFiles(this.diffArgs, this.cwd));
  }

  get cachedCount(): number {
    return this.preloadStatus().cached;
  }

  private cacheKey(hash: string): string {
    return hash + "\0" + optionsKey(this.renderOptions);
  }

  // ── User-facing render (dedicated worker, never blocked) ──────

  async getDiffHTMLForUser(file: ChangedFile): Promise<string> {
    this.currentFile = file.path;
    let { oldContent, newContent } = getOldNewContents(file, this.diffArgs, this.cwd);
    ({ oldContent, newContent } = applyWhitespace(
      oldContent, newContent, this.renderOptions.ignoreWhitespace,
    ));
    const hash = contentHash(oldContent, newContent);
    this.knownHashes.set(file.path, hash);

    const key = this.cacheKey(hash);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const html = await this.userWorker.render(
      file,
      oldContent,
      newContent,
      this.renderOptions,
    );
    this.cache.set(key, html);
    return html;
  }

  // ── Background preload (bulk git read + worker pool) ───────────

  async preloadAll() {
    this.aborted = false;
    const allFiles = this.getFiles();
    if (allFiles.length === 0) return;

    // Reorder: start from current file position, then wrap around
    let files = allFiles;
    if (this.currentFile) {
      const idx = allFiles.findIndex((f) => f.path === this.currentFile);
      if (idx > 0) {
        files = [...allFiles.slice(idx), ...allFiles.slice(0, idx)];
      }
    }

    // Bulk-read all file contents via git cat-file --batch (~30× faster)
    const bulkContents = await bulkGetAllContents(files, this.diffArgs, this.cwd);
    if (this.aborted) return;

    // Preload languages in all workers based on file extensions in the diff
    const extensions = new Set<string>();
    for (const file of files) {
      const ext = file.path.split(".").pop()?.toLowerCase();
      if (ext) extensions.add(ext);
    }
    const EXTENSION_TO_LANG: Record<string, string> = {
      ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
      py: "python", rs: "rust", go: "go", rb: "ruby",
      java: "java", kt: "kotlin", swift: "swift", c: "c", cpp: "cpp",
      h: "c", hpp: "cpp", cs: "csharp", php: "php",
      sh: "bash", zsh: "bash", bash: "bash",
      json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
      md: "markdown", mdx: "mdx",
      css: "css", scss: "scss", html: "html", svelte: "svelte", vue: "vue",
      sql: "sql", graphql: "graphql", proto: "protobuf",
      dockerfile: "dockerfile", tf: "hcl",
    };
    const langs = [...extensions]
      .map((ext) => EXTENSION_TO_LANG[ext])
      .filter(Boolean);
    if (langs.length > 0) {
      for (const w of this.preloadWorkers) w.preloadLangs(langs);
      this.userWorker.preloadLangs(langs);
    }

    // Build work queue
    type WorkItem = {
      file: ChangedFile;
      oldContent: string | null;
      newContent: string | null;
      key: string;
    };
    const queue: WorkItem[] = [];

    for (const file of files) {
      const raw = bulkContents.get(file.path);
      if (!raw) continue;

      let { oldContent, newContent } = raw;
      ({ oldContent, newContent } = applyWhitespace(
        oldContent, newContent, this.renderOptions.ignoreWhitespace,
      ));
      const hash = contentHash(oldContent, newContent);
      this.knownHashes.set(file.path, hash);

      const key = this.cacheKey(hash);
      if (this.cache.has(key)) continue;

      queue.push({ file, oldContent, newContent, key });
    }

    if (queue.length === 0 || this.aborted) return;

    // Distribute work across the worker pool using a shared index
    let nextIdx = 0;

    const workerLoop = async (worker: SSRWorker) => {
      while (!this.aborted) {
        const idx = nextIdx++;
        if (idx >= queue.length) break;

        const item = queue[idx];
        try {
          const html = await worker.render(
            item.file,
            item.oldContent,
            item.newContent,
            this.renderOptions,
          );
          if (!this.aborted) {
            this.cache.set(item.key, html);
          }
        } catch {
          // Worker error — skip this file
        }
      }
    };

    await Promise.all(this.preloadWorkers.map((w) => workerLoop(w)));
  }

  // ── Options / refresh ─────────────────────────────────────────

  setOptions(opts: Partial<RenderOptions>) {
    const prev = optionsKey(this.renderOptions);
    Object.assign(this.renderOptions, opts);
    if (optionsKey(this.renderOptions) !== prev) {
      this.aborted = true;
      setTimeout(() => this.preloadAll().catch(() => {}), 50);
    }
  }

  refresh() {
    this.aborted = true;
    this.filesCache = null;
    this.knownHashes.clear();
    setTimeout(() => this.preloadAll().catch(() => {}), 50);
  }

  preloadStatus(): { cached: number; total: number; preloading: boolean } {
    const files = this.getFiles();
    const optsKey = optionsKey(this.renderOptions);
    let cached = 0;
    for (const file of files) {
      const hash = this.knownHashes.get(file.path);
      if (hash && this.cache.has(hash + "\0" + optsKey)) cached++;
    }
    return {
      cached,
      total: files.length,
      preloading: !this.aborted && cached < files.length,
    };
  }

  destroy() {
    this.aborted = true;
    this.userWorker.kill();
    for (const w of this.preloadWorkers) w.kill();
  }
}
