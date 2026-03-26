import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import type { ChangedFile } from "./git.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RenderOptions {
  diffStyle: "split" | "unified";
  expandUnchanged: boolean;
  ignoreWhitespace: boolean;
}

/**
 * Combined line count above which we auto-optimize rendering:
 * - force split view (unified is very slow for large files)
 * - disable expandUnchanged (render only changed hunks)
 */
const LARGE_FILE_THRESHOLD = 3000;

function countLines(s: string | null): number {
  if (!s) return 0;
  let count = 1;
  let pos = 0;
  while ((pos = s.indexOf("\n", pos)) !== -1) { count++; pos++; }
  return count;
}

export function stripTrailingWS(s: string | null): string | null {
  if (s == null) return s;
  return s.replace(/[^\S\n]+$/gm, "");
}

/**
 * Manages a Bun subprocess that renders diffs via @pierre/diffs SSR.
 * Communicates via JSON lines over stdin/stdout.
 */
export class SSRWorker {
  private proc: ChildProcess | null = null;
  private ready = false;
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (html: string) => void; reject: (err: Error) => void }
  >();
  private buf = "";
  private starting: Promise<void> | null = null;

  async ensure(): Promise<void> {
    if (this.proc && this.ready) return;
    if (this.starting) return this.starting;
    this.starting = new Promise<void>((resolve, reject) => {
      this.proc = spawn("bun", ["run", join(__dirname, "ssr-worker.ts")], {
        stdio: ["pipe", "pipe", "inherit"],
        cwd: __dirname,
      });

      this.proc.stdin!.on("error", () => {});

      this.proc.on("exit", (code) => {
        this.proc = null;
        this.ready = false;
        this.starting = null;
        this.rejectAll("SSR worker exited: " + code);
      });

      this.proc.stdout!.on("data", (chunk: Buffer) => {
        this.buf += chunk.toString();
        let nl: number;
        while ((nl = this.buf.indexOf("\n")) !== -1) {
          const line = this.buf.slice(0, nl);
          this.buf = this.buf.slice(nl + 1);
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.id === 0 && msg.ready) {
              this.ready = true;
              this.starting = null;
              resolve();
              continue;
            }
            const cb = this.pending.get(msg.id);
            if (cb) {
              this.pending.delete(msg.id);
              msg.error
                ? cb.reject(new Error(msg.error))
                : cb.resolve(msg.html);
            }
          } catch {}
        }
      });

      setTimeout(() => {
        if (!this.ready) {
          this.starting = null;
          reject(new Error("SSR worker timeout"));
        }
      }, 15_000);
    });
    return this.starting;
  }

  /**
   * Render a diff to HTML. Caller provides file contents (so it can
   * compute content hashes and manage caching externally).
   */
  /**
   * Send a language preload hint to the worker (fire-and-forget).
   */
  preloadLangs(langs: string[]) {
    if (!this.proc || !this.ready || langs.length === 0) return;
    try {
      this.proc.stdin!.write(
        JSON.stringify({ id: -1, preloadLangs: langs }) + "\n",
      );
    } catch {}
  }

  async render(
    file: ChangedFile,
    oldContent: string | null,
    newContent: string | null,
    renderOpts?: RenderOptions,
  ): Promise<string> {
    await this.ensure();
    const id = ++this.nextId;

    // Count combined lines to detect large files (without allocating arrays)
    const lineCount = countLines(oldContent) + countLines(newContent);
    const isLarge = lineCount > LARGE_FILE_THRESHOLD;

    const options: Record<string, unknown> = {};
    if (renderOpts?.diffStyle) {
      // Force split for large files (unified rendering is much slower)
      options.diffStyle = isLarge ? "split" : renderOpts.diffStyle;
    }
    if (renderOpts?.expandUnchanged !== undefined) {
      // Disable expand for large files (render only changed hunks)
      options.expandUnchanged = isLarge ? false : renderOpts.expandUnchanged;
    }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.proc!.stdin!.write(
          JSON.stringify({
            id,
            oldFile: {
              name: file.oldPath || file.path,
              contents: oldContent ?? "",
            },
            newFile: { name: file.path, contents: newContent ?? "" },
            options,
          }) + "\n",
        );
      } catch (e) {
        this.pending.delete(id);
        reject(new Error("Failed to write to worker: " + e));
      }
    });
  }

  kill() {
    if (this.proc) {
      try {
        this.proc.kill();
      } catch {}
      this.proc = null;
      this.ready = false;
    }
    this.rejectAll("Worker killed");
  }

  private rejectAll(msg: string) {
    for (const [, cb] of this.pending) cb.reject(new Error(msg));
    this.pending.clear();
  }
}
