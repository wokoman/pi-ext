#!/usr/bin/env bun
/**
 * Aine – Agent-agnostic diff viewer and code review tool.
 *
 * Usage:
 *   aine                             → working tree changes
 *   aine diff                        → working tree changes
 *   aine diff --staged               → staged changes only
 *   aine diff main                   → diff against main
 *   aine diff main..feature          → compare two branches
 *   aine show                        → last commit
 *   aine show HEAD~3                 → specific commit
 *   aine session list                → list running instances
 *   aine session context --repo .    → current session state
 */

import { isGitRepo, parseRefs, getRepoRoot } from "./git.js";
import { startServer, stopServer } from "./server.js";
import { sessionCommand } from "./session-cli.js";
import { loadConfig } from "./config.js";

const DEFAULT_PORT = 5491;

interface CliOptions {
  command: "diff" | "show" | "session" | "help" | "version";
  refs: string[];
  port: number;
  portExplicit: boolean;
  noOpen: boolean;
  staged: boolean;
  watch: boolean;
  unified: boolean;
  forceNew: boolean;
  sessionArgs: string[];
}

function printHelp() {
  console.log(`
aine - Agent-agnostic diff viewer and code review tool

USAGE
  aine                          Review working tree changes
  aine diff [options] [refs]    Review diffs
  aine show [ref]               Review a commit
  aine session <command>        Control running instances
  aine help                     Show this help
  aine version                  Show version

DIFF OPTIONS
  --staged         Show staged changes only
  --watch          Auto-reload on file changes
  --port <port>    Custom port (default: auto-assigned)
  --no-open        Don't open browser
  --unified        Start in unified view (default: split)
  --new            Stop existing instance and start fresh

DIFF EXAMPLES
  aine                          Working tree changes (staged + unstaged + untracked)
  aine diff --staged            Staged changes only
  aine diff main                Compare current branch against main
  aine diff main..feature       Compare two branches
  aine diff HEAD~3              Last 3 commits
  aine show                     Review last commit
  aine show HEAD~2              Review specific commit

SESSION COMMANDS
  aine session list [--json]
  aine session context --repo <path>
  aine session navigate --repo <path> --file <path> [--hunk N | --line N]
  aine session reload --repo <path> [-- diff --staged]
  aine session comment add --repo <path> --file <path> --line <N> --summary "..."
  aine session comment list --repo <path> [--json]
  aine session comment resolve --repo <path> <id>
  aine session comment rm --repo <path> <id>
  aine session comment clear --repo <path> --yes
`.trim());
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    command: "diff",
    refs: [],
    port: DEFAULT_PORT,
    portExplicit: false,
    noOpen: false,
    staged: false,
    watch: false,
    unified: false,
    forceNew: false,
    sessionArgs: [],
  };

  const args = argv.slice(2);
  if (args.length === 0) return opts;

  let i = 0;

  // Parse command
  const first = args[0];
  if (first === "help" || first === "--help" || first === "-h") {
    opts.command = "help";
    return opts;
  }
  if (first === "version" || first === "--version" || first === "-v") {
    opts.command = "version";
    return opts;
  }
  if (first === "session") {
    opts.command = "session";
    opts.sessionArgs = args.slice(1);
    return opts;
  }
  if (first === "show") {
    opts.command = "show";
    i = 1;
  } else if (first === "diff") {
    opts.command = "diff";
    i = 1;
  }
  // else: no subcommand, treat remaining as diff refs

  // Parse remaining args
  for (; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--staged":
        opts.staged = true;
        break;
      case "--watch":
        opts.watch = true;
        break;
      case "--no-open":
        opts.noOpen = true;
        break;
      case "--unified":
        opts.unified = true;
        break;
      case "--new":
        opts.forceNew = true;
        break;
      case "--port":
        i++;
        opts.port = parseInt(args[i], 10);
        opts.portExplicit = true;
        if (isNaN(opts.port)) {
          console.error("Error: --port requires a number");
          process.exit(1);
        }
        break;
      default:
        if (arg.startsWith("-")) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        opts.refs.push(arg);
        break;
    }
  }

  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.command === "help") {
    printHelp();
    process.exit(0);
  }

  if (opts.command === "version") {
    const pkg = await import("./package.json");
    console.log(`aine v${pkg.version}`);
    process.exit(0);
  }

  if (opts.command === "session") {
    await sessionCommand(opts.sessionArgs);
    process.exit(0);
  }

  // diff or show
  const cwd = process.cwd();

  if (!isGitRepo(cwd)) {
    console.error("Error: not a git repository");
    process.exit(1);
  }

  const repoRoot = getRepoRoot(cwd);

  // Load config (global ← per-repo ← CLI flags)
  const config = loadConfig(repoRoot);

  // Apply config defaults where CLI didn't set explicit values
  if (!opts.portExplicit) opts.port = config.port;
  if (!opts.unified && config.mode === "unified") opts.unified = true;
  if (!opts.watch && config.watch) opts.watch = true;
  if (opts.noOpen === false && !config.open_browser) opts.noOpen = true;

  // Check for existing session for this repo
  const { listSessions, findSessionByRepo } = await import("./session-store.js");
  const existing = findSessionByRepo(repoRoot);

  if (existing && !opts.forceNew) {
    // Reuse existing session — just open the browser
    console.log(`aine already running → http://localhost:${existing.port}`);
    if (!opts.noOpen) {
      try {
        Bun.spawn(["open", `http://localhost:${existing.port}`], { stdout: "ignore", stderr: "ignore" });
      } catch {}
    }
    process.exit(0);
  }

  if (existing && opts.forceNew) {
    // Kill existing session
    try { process.kill(existing.pid, "SIGTERM"); } catch {}
    await new Promise(r => setTimeout(r, 500));
  }

  // Build diffArgs based on command
  let diffArgs: string[];
  let description: string;

  if (opts.command === "show") {
    const ref = opts.refs[0] || "HEAD";
    diffArgs = [`${ref}~1..${ref}`];
    description = `Commit ${ref}`;
  } else if (opts.staged) {
    diffArgs = ["--staged"];
    description = "Staged changes";
  } else {
    const refs = opts.refs;
    const parsed = parseRefs(refs, repoRoot);
    if ("error" in parsed) {
      console.error(`Error: invalid git ref '${parsed.error}'`);
      process.exit(1);
    }
    diffArgs = parsed.diffArgs;
    description = parsed.description;
  }

  // Auto-assign port if not explicitly set
  let port = opts.port;
  if (!opts.portExplicit) {
    const sessions = listSessions();
    const usedPorts = new Set(sessions.map(s => s.port));
    const basePort = config.port;
    for (let p = basePort; p < basePort + 100; p++) {
      if (!usedPorts.has(p)) {
        port = p;
        break;
      }
    }
  }

  try {
    await startServer({
      port,
      diffArgs,
      description,
      cwd: repoRoot,
      unified: opts.unified,
      noOpen: opts.noOpen,
      watch: opts.watch,
      theme: config.theme,
      expandUnchanged: config.expand_unchanged,
      ignoreWhitespace: config.ignore_whitespace,
    });
    console.log(`aine → http://localhost:${port}${opts.watch ? " (watching)" : ""}`);
    console.log("Press Ctrl+C to stop");
  } catch (err) {
    console.error("Failed to start aine:", err);
    process.exit(1);
  }
}

main();
