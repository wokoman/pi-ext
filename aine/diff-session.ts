import {
  getChangedFiles,
  getOldNewContents,
  bulkGetAllContents,
  contentHash,
  getRepoName,
  getCurrentBranch,
} from "./git.js";
import {
  SSRWorker,
  stripTrailingWS,
  type ThemeInit,
  type DiffAnnotation,
} from "./ssr-worker-client.js";
import { LRUCache } from "./lru-cache.js";
import { ThreadStore } from "./thread-store.js";
import type {
  ChangedFile,
  RenderOptions,
  SessionEvent,
} from "./types.js";

// ── Constants ─────────────────────────────────────────────────

const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  diffStyle: "split",
  expandUnchanged: true,
  ignoreWhitespace: false,
};

const CACHE_MAX_ENTRIES = 500;
const PRELOAD_WORKERS = 2;

/** Map file extensions → shiki language IDs for syntax highlighting preload. */
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

// ── Helpers ───────────────────────────────────────────────────

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
 * Manages diff cache, threads, and background preloading for one Aine session.
 *
 * Architecture:
 * - **userWorker**: dedicated SSR worker for user-initiated renders (never blocked)
 * - **preloadWorkers[]**: pool of SSR workers for background preloading
 * - **threadStore**: in-memory thread/comment store (delegated)
 * - **eventListeners**: SSE subscribers for live UI updates
 *
 * Preload uses `git cat-file --batch` to bulk-read all file contents (~30× faster
 * than sequential `git show`), then distributes SSR rendering across the worker pool.
 */
export class DiffSession {
  private cache = new LRUCache<string, string>(CACHE_MAX_ENTRIES);
  private userWorker = new SSRWorker();
  private preloadWorkers: SSRWorker[] = [];
  private aborted = false;
  private filesCache: ChangedFile[] | null = null;
  renderOptions: RenderOptions;

  private knownHashes = new Map<string, string>();
  private contentsCache = new Map<string, { oldContent: string | null; newContent: string | null }>();
  private filesByPath = new Map<string, ChangedFile>();

  // ── Threads (delegated to ThreadStore) ──────────────────────

  private threadStore: ThreadStore;

  // ── Event system (SSE) ────────────────────────────────────────

  private eventListeners = new Set<(event: SessionEvent) => void>();

  /** Cached repo metadata. */
  repoName: string;
  branch: string;

  /** Current diff args (can be changed via reload). */
  private diffArgs: string[];
  private cwd: string;
  private description: string = "";

  /** Hint: which file the user is currently viewing. */
  currentFile: string | null = null;

  constructor(diffArgs: string[], cwd: string, themeInit?: ThemeInit) {
    this.diffArgs = diffArgs;
    this.cwd = cwd;
    this.renderOptions = { ...DEFAULT_RENDER_OPTIONS };
    this.repoName = getRepoName(cwd);
    this.branch = getCurrentBranch(cwd);

    // Thread store emits events through our event system and invalidates cache
    this.threadStore = new ThreadStore((event) => {
      // Invalidate cached HTML when threads change on a file
      if (event.type === "thread-created" || event.type === "thread-updated") {
        this.invalidateFile(event.thread.file);
      } else if (event.type === "thread-deleted") {
        // For delete we need to find the file from the event — but id-only.
        // ThreadStore already fired this after removing. We clear all thread-related
        // caches on the next render anyway.
      }
      this.emitEvent(event);
    });

    // Set theme on all workers before starting them
    if (themeInit) {
      this.userWorker.setTheme(themeInit);
    }
    for (let i = 0; i < PRELOAD_WORKERS; i++) {
      const w = new SSRWorker();
      if (themeInit) w.setTheme(themeInit);
      this.preloadWorkers.push(w);
    }

    this.userWorker.ensure().catch(() => {});
    for (const w of this.preloadWorkers) w.ensure().catch(() => {});
  }

  // ── File list ─────────────────────────────────────────────────

  getFiles(): ChangedFile[] {
    if (!this.filesCache) {
      this.filesCache = getChangedFiles(this.diffArgs, this.cwd);
      this.filesByPath.clear();
      for (const f of this.filesCache) this.filesByPath.set(f.path, f);
    }
    return this.filesCache;
  }

  getFileByPath(path: string): ChangedFile | undefined {
    this.getFiles();
    return this.filesByPath.get(path);
  }

  // ── Preload status ────────────────────────────────────────────

  private _preloadStatusCache: { cached: number; total: number; preloading: boolean } | null = null;
  private _preloadStatusTs = 0;

  get cachedCount(): number {
    return this.preloadStatus().cached;
  }

  private cacheKey(hash: string): string {
    return hash + "\0" + optionsKey(this.renderOptions);
  }

  private cacheSet(key: string, html: string): void {
    this.cache.set(key, html);
    this._preloadStatusCache = null;
  }

  // ── Annotations from threads ────────────────────────────────

  private getAnnotationsForFile(filePath: string): DiffAnnotation[] {
    return this.threadStore.forFile(filePath).map(thread => ({
      side: (thread.side === "old" ? "deletions" : "additions") as "deletions" | "additions",
      lineNumber: thread.endLine,
    }));
  }

  /** Invalidate cached HTML for a specific file (e.g. after thread change). */
  private invalidateFile(filePath: string) {
    const hash = this.knownHashes.get(filePath);
    if (hash) {
      this.cache.deleteByPrefix(hash + "\0");
    }
    this._preloadStatusCache = null;
  }

  // ── User-facing render ────────────────────────────────────────

  private getContents(file: ChangedFile): { oldContent: string | null; newContent: string | null } {
    const cached = this.contentsCache.get(file.path);
    if (cached) return cached;
    return getOldNewContents(file, this.diffArgs, this.cwd);
  }

  async getDiffHTMLForUser(file: ChangedFile): Promise<string> {
    this.currentFile = file.path;
    let { oldContent, newContent } = this.getContents(file);
    ({ oldContent, newContent } = applyWhitespace(
      oldContent, newContent, this.renderOptions.ignoreWhitespace,
    ));
    const hash = contentHash(oldContent, newContent);
    this.knownHashes.set(file.path, hash);

    const annotations = this.getAnnotationsForFile(file.path);
    const annKey = annotations.length > 0
      ? ":" + annotations.map(a => `${a.side}:${a.lineNumber}`).sort().join(",")
      : "";
    const key = this.cacheKey(hash) + annKey;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const html = await this.userWorker.render(
      file, oldContent, newContent, this.renderOptions, annotations,
    );
    this.cacheSet(key, html);
    return html;
  }

  // ── Background preload ────────────────────────────────────────

  async preloadAll() {
    this.aborted = false;
    const allFiles = this.getFiles();
    if (allFiles.length === 0) return;

    let files = allFiles;
    if (this.currentFile) {
      const idx = allFiles.findIndex((f) => f.path === this.currentFile);
      if (idx > 0) {
        files = [...allFiles.slice(idx), ...allFiles.slice(0, idx)];
      }
    }

    const bulkContents = await bulkGetAllContents(files, this.diffArgs, this.cwd);
    if (this.aborted) return;

    // Preload syntax highlighting for all file extensions
    const extensions = new Set<string>();
    for (const file of files) {
      const ext = file.path.split(".").pop()?.toLowerCase();
      if (ext) extensions.add(ext);
    }
    const langs = [...extensions]
      .map((ext) => EXTENSION_TO_LANG[ext])
      .filter(Boolean);
    if (langs.length > 0) {
      for (const w of this.preloadWorkers) w.preloadLangs(langs);
      this.userWorker.preloadLangs(langs);
    }

    type WorkItem = {
      file: ChangedFile;
      oldContent: string | null;
      newContent: string | null;
      key: string;
      annotations: DiffAnnotation[];
    };
    const queue: WorkItem[] = [];

    for (const file of files) {
      const raw = bulkContents.get(file.path);
      if (!raw) continue;
      this.contentsCache.set(file.path, raw);

      let { oldContent, newContent } = raw;
      ({ oldContent, newContent } = applyWhitespace(
        oldContent, newContent, this.renderOptions.ignoreWhitespace,
      ));
      const hash = contentHash(oldContent, newContent);
      this.knownHashes.set(file.path, hash);

      const annotations = this.getAnnotationsForFile(file.path);
      const annKey = annotations.length > 0
        ? ":" + annotations.map(a => `${a.side}:${a.lineNumber}`).sort().join(",")
        : "";
      const key = this.cacheKey(hash) + annKey;
      if (this.cache.has(key)) continue;
      queue.push({ file, oldContent, newContent, key, annotations });
    }

    if (queue.length === 0 || this.aborted) return;

    let nextIdx = 0;
    const workerLoop = async (worker: SSRWorker) => {
      while (!this.aborted) {
        const idx = nextIdx++;
        if (idx >= queue.length) break;
        const item = queue[idx];
        try {
          const html = await worker.render(
            item.file, item.oldContent, item.newContent, this.renderOptions, item.annotations,
          );
          if (!this.aborted) {
            this.cacheSet(item.key, html);
          }
        } catch {}
      }
    };

    await Promise.all(this.preloadWorkers.map((w) => workerLoop(w)));
  }

  // ── Options / refresh / reload ────────────────────────────────

  setOptions(opts: Partial<RenderOptions>) {
    const prev = optionsKey(this.renderOptions);
    Object.assign(this.renderOptions, opts);
    if (optionsKey(this.renderOptions) !== prev) {
      this.aborted = true;
      setTimeout(() => this.preloadAll().catch(() => {}), 50);
    }
  }

  /** Signal that files on disk changed — UI shows a banner instead of auto-refreshing. */
  markStale() {
    this.emitEvent({ type: "stale" });
  }

  refresh() {
    this.aborted = true;
    this.filesCache = null;
    this.filesByPath.clear();
    this.knownHashes.clear();
    this.contentsCache.clear();
    this.repoName = getRepoName(this.cwd);
    this.branch = getCurrentBranch(this.cwd);
    setTimeout(() => this.preloadAll().catch(() => {}), 50);
    this.emitEvent({ type: "refresh" });
  }

  /** Swap what this session is showing without restarting the server. */
  reloadWith(newDiffArgs: string[], newDescription: string) {
    this.diffArgs = newDiffArgs;
    this.description = newDescription;
    this.refresh();
    this.emitEvent({ type: "reload", diffArgs: newDiffArgs, description: newDescription });
  }

  preloadStatus(): { cached: number; total: number; preloading: boolean } {
    const now = Date.now();
    if (this._preloadStatusCache && now - this._preloadStatusTs < 100) {
      return this._preloadStatusCache;
    }
    const files = this.getFiles();
    const optsKey = optionsKey(this.renderOptions);
    let cached = 0;
    for (const file of files) {
      const hash = this.knownHashes.get(file.path);
      if (hash && this.cache.has(hash + "\0" + optsKey)) cached++;
    }
    this._preloadStatusCache = {
      cached,
      total: files.length,
      preloading: !this.aborted && cached < files.length,
    };
    this._preloadStatusTs = now;
    return this._preloadStatusCache;
  }

  // ── Thread API (delegates to ThreadStore) ─────────────────────

  createThread(data: Parameters<ThreadStore["create"]>[0]) { return this.threadStore.create(data); }
  addReply(threadId: string, body: string, author?: Parameters<ThreadStore["addReply"]>[2]) { return this.threadStore.addReply(threadId, body, author); }
  updateThreadStatus(id: string, status: Parameters<ThreadStore["updateStatus"]>[1]) { return this.threadStore.updateStatus(id, status); }
  editThread(id: string, body: string) { return this.threadStore.edit(id, body); }
  deleteThread(id: string) { return this.threadStore.delete(id); }
  getThreads(filter?: Parameters<ThreadStore["list"]>[0]) { return this.threadStore.list(filter); }
  getThread(id: string) { return this.threadStore.get(id); }
  getThreadCount() { return this.threadStore.count; }

  // ── Event system ──────────────────────────────────────────────

  addEventListener(handler: (event: SessionEvent) => void) {
    this.eventListeners.add(handler);
  }

  removeEventListener(handler: (event: SessionEvent) => void) {
    this.eventListeners.delete(handler);
  }

  emitEvent(event: SessionEvent) {
    for (const handler of this.eventListeners) {
      try { handler(event); } catch {}
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────

  destroy() {
    this.aborted = true;
    this.userWorker.kill();
    for (const w of this.preloadWorkers) w.kill();
  }
}
