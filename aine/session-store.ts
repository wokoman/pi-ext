/**
 * File-based session store for Aine instances.
 *
 * Each running aine server writes a JSON file to ~/.config/aine/sessions/<id>.json.
 * `aine session list` reads all files. Stale sessions (dead PIDs) are cleaned up.
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface SessionInfo {
  id: string;
  repo: string;
  repoName: string;
  port: number;
  pid: number;
  startedAt: string;
  diffArgs: string[];
  description: string;
}

const SESSIONS_DIR = join(homedir(), ".config", "aine", "sessions");

function ensureDir() {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sessionPath(id: string): string {
  return join(SESSIONS_DIR, `${id}.json`);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function registerSession(info: SessionInfo): SessionInfo {
  ensureDir();
  writeFileSync(sessionPath(info.id), JSON.stringify(info, null, 2));

  // Auto-cleanup on exit
  const cleanup = () => {
    try { unlinkSync(sessionPath(info.id)); } catch {}
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  return info;
}

export function unregisterSession(id: string) {
  try { unlinkSync(sessionPath(id)); } catch {}
}

export function listSessions(): SessionInfo[] {
  ensureDir();
  const sessions: SessionInfo[] = [];
  const stale: string[] = [];

  for (const file of readdirSync(SESSIONS_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const info: SessionInfo = JSON.parse(readFileSync(join(SESSIONS_DIR, file), "utf-8"));
      if (isProcessAlive(info.pid)) {
        sessions.push(info);
      } else {
        stale.push(file);
      }
    } catch {
      stale.push(file);
    }
  }

  // Clean up stale session files
  for (const file of stale) {
    try { unlinkSync(join(SESSIONS_DIR, file)); } catch {}
  }

  return sessions;
}

/** Find a session by repo path (resolved to absolute). */
export function findSessionByRepo(repoPath: string): SessionInfo | null {
  const resolved = repoPath.startsWith("/") ? repoPath : join(process.cwd(), repoPath);
  const sessions = listSessions();
  return sessions.find(s => s.repo === resolved) ?? null;
}

/** Find a session by ID. */
export function findSessionById(id: string): SessionInfo | null {
  const p = sessionPath(id);
  if (!existsSync(p)) return null;
  try {
    const info: SessionInfo = JSON.parse(readFileSync(p, "utf-8"));
    return isProcessAlive(info.pid) ? info : null;
  } catch {
    return null;
  }
}
