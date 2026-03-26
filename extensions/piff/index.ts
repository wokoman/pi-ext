/**
 * Piff – Git diff viewer extension for pi.
 *
 * Opens a diff viewer in the browser (plain HTML, no build step).
 *
 * Commands:
 *   /piff              → working tree changes (staged + unstaged + untracked)
 *   /piff main         → compare current branch against main
 *   /piff HEAD~1       → review last commit
 *   /piff main..feat   → compare two branches
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isGitRepo, parseRefs, getRepoRoot } from "./git.js";
import { startServer, stopServer } from "./server.js";

const PORT = 5491;

export default function (pi: ExtensionAPI) {
  pi.registerCommand("piff", {
    description: "Open git diff viewer (/piff [ref] [ref2])",
    handler: async (args, ctx) => {
      if (!isGitRepo(ctx.cwd)) {
        ctx.ui.notify("Not a git repository", "error");
        return;
      }

      const refs = args ? args.trim().split(/\s+/).filter(Boolean) : [];
      const parsed = parseRefs(refs, ctx.cwd);
      if ("error" in parsed) {
        ctx.ui.notify("Invalid git ref: '" + parsed.error + "'", "error");
        return;
      }

      const { diffArgs, description } = parsed;

      stopServer();

      try {
        await startServer({
          port: PORT,
          diffArgs,
          description,
          cwd: getRepoRoot(ctx.cwd),
        });
        ctx.ui.notify("piff → http://localhost:" + PORT);
      } catch (err) {
        ctx.ui.notify("Failed to start piff: " + err, "error");
      }
    },
  });

  pi.on("session_shutdown", stopServer);
}
