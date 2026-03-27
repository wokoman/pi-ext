/**
 * In-memory thread/comment store for one Aine session.
 *
 * Manages CRUD for review threads and their comments.
 * Emits events so the DiffSession can notify SSE subscribers
 * and invalidate cached HTML when annotations change.
 */

import type {
  Thread,
  ThreadComment,
  ThreadStatus,
  ThreadAuthor,
  Severity,
  SessionEvent,
} from "./types.js";

// ── Event callback ────────────────────────────────────────────

export type ThreadChangeCallback = (event: SessionEvent) => void;

// ── ThreadStore ───────────────────────────────────────────────

export class ThreadStore {
  private threads = new Map<string, Thread>();
  private onChange: ThreadChangeCallback;

  constructor(onChange: ThreadChangeCallback) {
    this.onChange = onChange;
  }

  // ── Helpers ─────────────────────────────────────────────────

  private shortId(): string {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }

  /** Find thread by full ID or short prefix (≥4 chars). */
  find(idOrPrefix: string): Thread | null {
    const direct = this.threads.get(idOrPrefix);
    if (direct) return direct;
    if (idOrPrefix.length >= 4) {
      for (const t of this.threads.values()) {
        if (t.id.startsWith(idOrPrefix)) return t;
      }
    }
    return null;
  }

  // ── CRUD ────────────────────────────────────────────────────

  create(data: {
    file: string;
    startLine: number;
    endLine?: number;
    side?: "old" | "new";
    body: string;
    severity?: Severity;
    author?: ThreadAuthor;
    anchorContent?: string;
  }): Thread {
    const threadId = this.shortId();
    const commentId = this.shortId();
    const now = new Date().toISOString();
    const author = data.author || { name: "user", type: "user" as const };

    const thread: Thread = {
      id: threadId,
      file: data.file,
      startLine: data.startLine,
      endLine: data.endLine ?? data.startLine,
      side: data.side || "new",
      status: "open",
      anchorContent: data.anchorContent ?? null,
      createdAt: now,
      updatedAt: now,
      comments: [{
        id: commentId,
        threadId,
        author,
        body: data.body,
        severity: data.severity,
        createdAt: now,
      }],
    };
    this.threads.set(threadId, thread);
    this.onChange({ type: "thread-created", thread });
    return thread;
  }

  addReply(threadId: string, body: string, author?: ThreadAuthor): ThreadComment | null {
    const thread = this.find(threadId);
    if (!thread) return null;
    const comment: ThreadComment = {
      id: this.shortId(),
      threadId: thread.id,
      author: author || { name: "user", type: "user" as const },
      body,
      createdAt: new Date().toISOString(),
    };
    thread.comments.push(comment);
    thread.updatedAt = comment.createdAt;
    this.onChange({ type: "thread-updated", thread });
    return comment;
  }

  updateStatus(id: string, status: ThreadStatus): Thread | null {
    const thread = this.find(id);
    if (!thread) return null;
    thread.status = status;
    thread.updatedAt = new Date().toISOString();
    this.onChange({ type: "thread-updated", thread });
    return thread;
  }

  edit(id: string, body: string): Thread | null {
    const thread = this.find(id);
    if (!thread || thread.comments.length === 0) return null;
    thread.comments[0].body = body;
    thread.updatedAt = new Date().toISOString();
    this.onChange({ type: "thread-updated", thread });
    return thread;
  }

  delete(id: string): boolean {
    const thread = this.find(id);
    if (!thread) return false;
    this.threads.delete(thread.id);
    this.onChange({ type: "thread-deleted", id: thread.id });
    return true;
  }

  // ── Queries ─────────────────────────────────────────────────

  get(id: string): Thread | null {
    return this.find(id);
  }

  list(filter?: { file?: string; status?: ThreadStatus }): Thread[] {
    let all = [...this.threads.values()];
    if (filter?.file) all = all.filter(t => t.file === filter.file);
    if (filter?.status) all = all.filter(t => t.status === filter.status);
    return all;
  }

  get count(): number {
    return this.threads.size;
  }

  /** Get threads for a specific file (used for diff annotations). */
  forFile(filePath: string): Thread[] {
    return [...this.threads.values()].filter(t => t.file === filePath);
  }
}
