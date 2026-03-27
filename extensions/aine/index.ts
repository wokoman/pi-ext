/**
 * Aine – Pi extension (thin wrapper around standalone aine CLI).
 *
 * Commands:
 *   /aine              → open diff viewer
 *   /aine main         → compare current branch against main
 *   /aine-review       → AI reviews current diff and leaves comments
 *   /aine-resolve      → resolve open comments by making code changes
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STANDALONE_CLI = join(__dirname, "..", "..", "aine", "cli.ts");
const PORT = 5491;

let aineProcess: ChildProcess | null = null;

function stopAine() {
  if (aineProcess) {
    try { aineProcess.kill(); } catch {}
    aineProcess = null;
  }
}

function aineCli(args: string[]): string[] {
  if (existsSync(STANDALONE_CLI)) {
    return ["bun", STANDALONE_CLI, ...args];
  }
  return ["aine", ...args];
}

function aineExec(args: string[], cwd: string): string {
  const [cmd, ...cmdArgs] = aineCli(args);
  return execFileSync(cmd, cmdArgs, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 10000,
  }).trim();
}

function startAine(args: string[], cwd: string): Promise<void> {
  stopAine();

  return new Promise((resolve, reject) => {
    const [cmd, ...cmdArgs] = aineCli(args);
    const proc = spawn(cmd, cmdArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    aineProcess = proc;
    let started = false;

    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      if (!started && text.includes("aine →")) {
        started = true;
        resolve();
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      if (!started) reject(new Error(data.toString().trim()));
    });

    proc.on("error", (err) => {
      if (!started) reject(err);
    });

    proc.on("exit", () => { aineProcess = null; });

    setTimeout(() => {
      if (!started) reject(new Error("Timeout starting aine"));
    }, 10000);
  });
}

/** Ensure an aine session is running, start one if needed. */
async function ensureSession(cwd: string): Promise<boolean> {
  try {
    const out = aineExec(["session", "list", "--json"], cwd);
    const sessions = JSON.parse(out);
    if (sessions.length > 0) return true;
  } catch {}

  // No session running — start one
  try {
    await startAine(["--port", String(PORT), "--no-open"], cwd);
    return true;
  } catch {
    return false;
  }
}

export default function (pi: ExtensionAPI) {
  // ── /aine – open diff viewer ──────────────────────────────────

  pi.registerCommand("aine", {
    description: "Open diff viewer (/aine [ref] [ref2])",
    handler: async (args, ctx) => {
      const cliArgs: string[] = ["--port", String(PORT)];

      if (args?.trim()) {
        const refs = args.trim().split(/\s+/).filter(Boolean);
        cliArgs.push(...refs);
      }

      try {
        await startAine(cliArgs, ctx.cwd);
        ctx.ui.notify(`aine → http://localhost:${PORT}`, "info");
      } catch (err) {
        ctx.ui.notify("Failed to start aine: " + err, "error");
      }
    },
  });

  // ── /aine-review – AI reviews diff and leaves comments ────────

  pi.registerCommand("aine-review", {
    description: "AI reviews current diff and leaves inline comments",
    handler: async (args, ctx) => {
      if (!await ensureSession(ctx.cwd)) {
        ctx.ui.notify("Failed to start aine session", "error");
        return;
      }

      // Get the context
      let context: any;
      try {
        const out = aineExec(["session", "context", "--repo", ".", "--json"], ctx.cwd);
        context = JSON.parse(out);
      } catch (e) {
        ctx.ui.notify("Failed to get aine session context: " + e, "error");
        return;
      }

      // Build review prompt with file list and focus area
      const focus = args?.trim() || "";
      const fileList = context.files
        .map((f: any) => {
          const stat = f.status === "added" ? "+" : f.status === "deleted" ? "-" : "~";
          return `  ${stat} ${f.path} (+${f.additions} -${f.deletions})`;
        })
        .join("\n");

      const reviewPrompt = `Review the following code changes and leave inline comments using \`aine session comment add\`.

Repository: ${context.repoName} (${context.branch})
Diff: ${context.description}
Files:
${fileList}
${focus ? `\nFocus: ${focus}` : ""}

For each issue found, run:
  aine session comment add --repo . --file <path> --line <N> --summary "<description>" --severity <must-fix|suggestion|nit>

Guidelines:
- Use severity levels: must-fix (bugs, security), suggestion (improvements), nit (style/minor)
- Be specific: reference the actual code, explain why it's a problem and how to fix it
- Don't comment on everything — focus on what matters
- After reviewing, summarize your findings

Read each changed file to understand the full context before commenting.`;

      // Send as assistant message for the agent to execute
      ctx.appendMessage("user", reviewPrompt);
    },
  });

  // ── /aine-resolve – resolve open comments ─────────────────────

  pi.registerCommand("aine-resolve", {
    description: "Read open comments and make code changes to resolve them",
    handler: async (args, ctx) => {
      // Get comments
      let commentsJson: string;
      try {
        commentsJson = aineExec(["session", "comment", "list", "--repo", ".", "--json"], ctx.cwd);
      } catch (e) {
        ctx.ui.notify("Failed to get comments: " + e, "error");
        return;
      }

      let allComments: any[];
      try {
        allComments = JSON.parse(commentsJson);
      } catch {
        ctx.ui.notify("No active aine session", "error");
        return;
      }

      // Filter: only unresolved, or specific ID
      const targetId = args?.trim();
      const toResolve = targetId
        ? allComments.filter(c => c.id === targetId)
        : allComments.filter(c => !c.resolved);

      if (toResolve.length === 0) {
        ctx.ui.notify("No comments to resolve", "info");
        return;
      }

      const commentList = toResolve
        .map((c: any) => {
          const sev = c.severity ? ` [${c.severity}]` : "";
          return `- ${c.id} ${c.file}:${c.line}${sev} — ${c.summary}`;
        })
        .join("\n");

      const resolvePrompt = `Resolve the following code review comments by making the necessary code changes.

Comments to resolve:
${commentList}

For each comment:
1. Read the file to understand the context
2. Make the code change to address the feedback
3. After fixing, mark as resolved: \`aine session comment resolve --repo . <comment-id>\`

Work through them one by one. If a comment is unclear or you disagree, explain why instead of blindly applying it.`;

      ctx.appendMessage("user", resolvePrompt);
    },
  });

  pi.on("session_shutdown", stopAine);
}
