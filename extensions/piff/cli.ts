#!/usr/bin/env bun
/**
 * CLI entry point for piff.
 *
 * Usage:
 *   bun extensions/piff/cli.ts              → working tree changes
 *   bun extensions/piff/cli.ts main         → diff against main
 *   bun extensions/piff/cli.ts HEAD~1       → last commit
 *   bun extensions/piff/cli.ts main..feat   → compare two branches
 */

import { isGitRepo, parseRefs, getRepoRoot } from "./git.js";
import { startServer } from "./server.js";

const PORT = 5491;
const cwd = process.cwd();

if (!isGitRepo(cwd)) {
  console.error("Error: not a git repository");
  process.exit(1);
}

const refs = process.argv.slice(2).filter(Boolean);
const parsed = parseRefs(refs, cwd);
if ("error" in parsed) {
  console.error(`Error: invalid git ref '${parsed.error}'`);
  process.exit(1);
}

const { diffArgs, description } = parsed;

try {
  await startServer({
    port: PORT,
    diffArgs,
    description,
    cwd: getRepoRoot(cwd),
  });
  console.log(`piff → http://localhost:${PORT}  (${description})`);
  console.log("Press Ctrl+C to stop");
} catch (err) {
  console.error("Failed to start piff:", err);
  process.exit(1);
}
