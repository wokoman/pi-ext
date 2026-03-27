/**
 * `aine session` subcommand handler.
 *
 * All session commands communicate with a running aine instance via HTTP.
 * This is the primary integration point for AI agents.
 */

import { listSessions, findSessionByRepo, findSessionById, type SessionInfo } from "./session-store.js";
import { getRepoRoot } from "./git.js";

// ── Help ──────────────────────────────────────────────────────

function printSessionHelp() {
  console.log(`
aine session - Control running Aine instances

COMMANDS
  list [--json]                            List running instances
  context (--repo <path> | <id>)           Show current session state
  navigate (--repo <path> | <id>) --file <path> [--hunk N | --line N]
  reload (--repo <path> | <id>) [-- <diff args>]
  comment add (--repo <path> | <id>) --file <path> --line <N> [--end-line <N>]
              --summary "..." [--severity must-fix|suggestion|nit] [--author <name>]
  comment reply (--repo <path> | <id>) <thread-id> --summary "..."
                [--author <name>]
  comment list (--repo <path> | <id>) [--file <path>] [--status open|resolved|dismissed] [--json]
  comment resolve (--repo <path> | <id>) <thread-id>
  comment dismiss (--repo <path> | <id>) <thread-id>
  comment rm (--repo <path> | <id>) <thread-id>
  comment clear (--repo <path> | <id>) [--file <path>] --yes
`.trim());
}

// ── Arg parsing helpers ───────────────────────────────────────

function resolveSession(args: string[]): { session: SessionInfo; remaining: string[] } | null {
  const sessions = listSessions();

  if (sessions.length === 1 && !args.includes("--repo")) {
    return { session: sessions[0], remaining: args };
  }

  const repoIdx = args.indexOf("--repo");
  if (repoIdx !== -1 && repoIdx + 1 < args.length) {
    const repoPath = args[repoIdx + 1];
    let resolved: string;
    try { resolved = getRepoRoot(repoPath === "." ? process.cwd() : repoPath); }
    catch { resolved = repoPath; }
    const session = findSessionByRepo(resolved);
    if (!session) {
      console.error(`No active session for repo: ${resolved}\nRun 'aine session list' to see running instances.`);
      return null;
    }
    return { session, remaining: [...args.slice(0, repoIdx), ...args.slice(repoIdx + 2)] };
  }

  if (args.length > 0 && !args[0].startsWith("-")) {
    const session = findSessionById(args[0]);
    if (session) return { session, remaining: args.slice(1) };
  }

  console.error("No session specified. Use --repo <path> or pass a session ID.\nRun 'aine session list' to see running instances.");
  return null;
}

function parseNamedArgs(args: string[]): { named: Record<string, string>; positional: string[]; afterDash: string[] } {
  const named: Record<string, string> = {};
  const positional: string[] = [];
  const afterDash: string[] = [];
  let inAfterDash = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--" && !inAfterDash) { inAfterDash = true; continue; }
    if (inAfterDash) { afterDash.push(args[i]); continue; }
    if (args[i] === "--yes" || args[i] === "--json") {
      named[args[i].slice(2)] = "true";
    } else if (args[i].startsWith("--") && i + 1 < args.length && !args[i + 1].startsWith("--")) {
      named[args[i].slice(2)] = args[i + 1];
      i++;
    } else {
      positional.push(args[i]);
    }
  }
  return { named, positional, afterDash };
}

async function apiCall(port: number, method: string, path: string, body?: unknown): Promise<any> {
  const url = `http://127.0.0.1:${port}${path}`;
  const opts: RequestInit = {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(url, opts);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as any).error || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Common pattern: resolve session from args at given offset,
 * parse named args, call handler.
 */
function withSession(
  args: string[],
  offset: number,
  handler: (api: (m: string, p: string, b?: unknown) => Promise<any>, named: Record<string, string>, positional: string[], afterDash: string[]) => Promise<void>,
) {
  const resolved = resolveSession(args.slice(offset));
  if (!resolved) process.exit(1);
  const { named, positional, afterDash } = parseNamedArgs(resolved.remaining);
  const api = (m: string, p: string, b?: unknown) => apiCall(resolved.session.port, m, p, b);
  return handler(api, named, positional, afterDash);
}

function requireArg(named: Record<string, string>, ...keys: string[]): void {
  const missing = keys.filter(k => !named[k]);
  if (missing.length > 0) {
    console.error(`Error: ${missing.map(k => `--${k}`).join(", ")} required`);
    process.exit(1);
  }
}

function requirePositional(positional: string[], label: string): string {
  if (!positional[0]) { console.error(`Error: ${label} required`); process.exit(1); }
  return positional[0];
}

function makeAuthor(name?: string) {
  const authorName = name || "agent";
  return { name: authorName, type: authorName === "user" ? "user" as const : "agent" as const };
}

// ── Subcommands ───────────────────────────────────────────────

export async function sessionCommand(args: string[]) {
  if (args.length === 0 || args[0] === "help" || args[0] === "--help") {
    printSessionHelp();
    return;
  }

  const sub = args[0];

  if (sub === "list") {
    const sessions = listSessions();
    if (args.includes("--json")) {
      console.log(JSON.stringify(sessions, null, 2));
    } else if (sessions.length === 0) {
      console.log("No active Aine sessions.");
    } else {
      for (const s of sessions)
        console.log(`  ${s.repoName} → http://127.0.0.1:${s.port}  (pid: ${s.pid}, ${s.description})`);
    }
    return;
  }

  if (sub === "context") {
    return withSession(args, 1, async (api, named) => {
      const data = await api("GET", "/api/session/context");
      if (named.json === "true" || args.includes("--json")) {
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(`Repo: ${data.repoName} (${data.branch})`);
        console.log(`Diff: ${data.description}`);
        console.log(`Files: ${data.files.length}`);
        if (data.selectedFile) console.log(`Selected: ${data.selectedFile}`);
        if (data.threadCount > 0) console.log(`Threads: ${data.threadCount}`);
        console.log(`View: ${data.renderOptions.diffStyle}\n`);
        for (const f of data.files) {
          const stat = f.status === "added" ? "+" : f.status === "deleted" ? "-" : "~";
          const adds = f.additions > 0 ? ` +${f.additions}` : "";
          const dels = f.deletions > 0 ? ` -${f.deletions}` : "";
          console.log(`  ${stat} ${f.path}${adds}${dels}`);
        }
      }
    });
  }

  if (sub === "navigate") {
    return withSession(args, 1, async (api, named) => {
      requireArg(named, "file");
      await api("POST", "/api/session/navigate", {
        file: named.file,
        hunk: named.hunk ? parseInt(named.hunk) : undefined,
        line: named.line ? parseInt(named.line) : undefined,
      });
      console.log(`Navigated to ${named.file}${named.line ? `:${named.line}` : ""}${named.hunk ? ` hunk ${named.hunk}` : ""}`);
    });
  }

  if (sub === "reload") {
    return withSession(args, 1, async (api, _named, _pos, afterDash) => {
      await api("POST", "/api/session/reload", {
        diffArgs: afterDash,
        description: afterDash.join(" ") || "Reloaded",
      });
      console.log("Session reloaded");
    });
  }

  // ── comment subcommands ─────────────────────────────────────

  if (sub === "comment") {
    const commentSub = args[1];
    if (!commentSub || commentSub === "help") { printSessionHelp(); return; }

    if (commentSub === "add") {
      return withSession(args, 2, async (api, named) => {
        requireArg(named, "file", "line", "summary");
        const thread = await api("POST", "/api/threads", {
          file: named.file,
          startLine: parseInt(named.line),
          endLine: named["end-line"] ? parseInt(named["end-line"]) : parseInt(named.line),
          body: named.summary,
          severity: named.severity,
          author: makeAuthor(named.author),
        });
        const range = thread.startLine === thread.endLine ? `${thread.startLine}` : `${thread.startLine}-${thread.endLine}`;
        console.log(`Thread ${thread.id} created on ${named.file}:${range}`);
      });
    }

    if (commentSub === "reply") {
      return withSession(args, 2, async (api, named, positional) => {
        const id = requirePositional(positional, "thread ID");
        requireArg(named, "summary");
        const comment = await api("POST", `/api/threads/${id}/reply`, {
          body: named.summary,
          author: makeAuthor(named.author),
        });
        console.log(`Reply ${comment.id} added to thread ${id}`);
      });
    }

    if (commentSub === "list") {
      return withSession(args, 2, async (api, named) => {
        const params = new URLSearchParams();
        if (named.file) params.set("file", named.file);
        if (named.status) params.set("status", named.status);
        const query = params.toString() ? `?${params}` : "";
        const threads = await api("GET", `/api/threads${query}`);
        if (named.json === "true" || args.includes("--json")) {
          console.log(JSON.stringify(threads, null, 2));
        } else if (threads.length === 0) {
          console.log("No threads.");
        } else {
          for (const t of threads) {
            const first = t.comments[0];
            const severity = first?.severity ? ` [${first.severity}]` : "";
            const statusIcon = t.status === "resolved" ? " ✓" : t.status === "dismissed" ? " ✗" : "";
            const range = t.startLine === t.endLine ? `${t.startLine}` : `${t.startLine}-${t.endLine}`;
            const replies = t.comments.length > 1 ? ` (${t.comments.length} comments)` : "";
            const body = first?.body || "";
            const truncated = body.length > 60 ? body.slice(0, 57) + "..." : body;
            console.log(`  ${t.id} ${t.file}:${range}${severity}${statusIcon}${replies} — ${truncated}`);
          }
        }
      });
    }

    if (commentSub === "resolve" || commentSub === "dismiss") {
      return withSession(args, 2, async (api, _named, positional) => {
        const id = requirePositional(positional, "thread ID");
        const status = commentSub === "resolve" ? "resolved" : "dismissed";
        await api("PATCH", `/api/threads/${id}/status`, { status });
        console.log(`Thread ${id} ${commentSub}${commentSub.endsWith("e") ? "d" : "ed"}`);
      });
    }

    if (commentSub === "rm") {
      return withSession(args, 2, async (api, _named, positional) => {
        const id = requirePositional(positional, "thread ID");
        await api("DELETE", `/api/threads/${id}`);
        console.log(`Thread ${id} deleted`);
      });
    }

    if (commentSub === "clear") {
      return withSession(args, 2, async (api, named) => {
        if (named.yes !== "true") { console.error("Error: --yes required to confirm"); process.exit(1); }
        const params = new URLSearchParams();
        if (named.file) params.set("file", named.file);
        const query = params.toString() ? `?${params}` : "";
        const threads = await api("GET", `/api/threads${query}`);
        for (const t of threads) await api("DELETE", `/api/threads/${t.id}`);
        console.log(`Cleared ${threads.length} thread(s)`);
      });
    }

    console.error(`Unknown comment subcommand: ${commentSub}`);
    process.exit(1);
  }

  console.error(`Unknown session command: ${sub}`);
  printSessionHelp();
  process.exit(1);
}
