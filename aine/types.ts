/**
 * Shared types used by both backend (server, CLI) and frontend (Svelte UI).
 * Single source of truth — no duplicates.
 */

// ── File / Diff types ─────────────────────────────────────────

export type FileStatus = "added" | "deleted" | "modified" | "renamed" | "copied";

export interface ChangedFile {
  path: string;
  oldPath?: string;
  status: FileStatus;
  untracked?: boolean;
  additions: number;
  deletions: number;
}

export interface RepoInfo {
  name: string;
  branch: string;
  description: string;
  fileCount: number;
  cached: number;
  total: number;
}

export interface RenderOptions {
  diffStyle: "split" | "unified";
  expandUnchanged: boolean;
  ignoreWhitespace: boolean;
}

// ── Thread / Comment types ────────────────────────────────────

export type Severity = "must-fix" | "suggestion" | "nit";
export type ThreadStatus = "open" | "resolved" | "dismissed";

export interface ThreadAuthor {
  name: string;
  type: "user" | "agent";
}

export interface ThreadComment {
  id: string;
  threadId: string;
  author: ThreadAuthor;
  body: string;
  severity?: Severity;
  createdAt: string;
}

export interface Thread {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  side: "old" | "new";
  status: ThreadStatus;
  anchorContent: string | null;
  createdAt: string;
  updatedAt: string;
  comments: ThreadComment[];
}

// ── Theme types ───────────────────────────────────────────────

export interface ThemeColors {
  bg: string;
  sidebar: string;
  hover: string;
  active: string;
  text: string;
  muted: string;
  accent: string;
  border: string;
  add: string;
  delete: string;
  modified: string;
  addBg: string;
  deleteBg: string;
  addBorder: string;
  deleteBorder: string;
}

// ── SSE event types ───────────────────────────────────────────

export type SessionEvent =
  | { type: "thread-created"; thread: Thread }
  | { type: "thread-updated"; thread: Thread }
  | { type: "thread-deleted"; id: string }
  | { type: "navigate"; file: string; hunk?: number; line?: number }
  | { type: "reload"; diffArgs: string[]; description: string }
  | { type: "refresh" }
  | { type: "stale" };
