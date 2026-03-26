/**
 * Pi-Telescope Extension
 *
 * A native TUI fuzzy finder for pi, inspired by telescope.nvim and Code Telescope.
 *
 * Keybindings:
 *   Ctrl+Q             → open files finder
 *
 * Commands:
 *   /telescope [name]  → open specific provider
 *   /ts [name]         → alias
 *
 * Built-in providers:
 *   files, grep, git-branches, git-log, sessions, skills, commands
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { TelescopeProvider } from "./types.js";
import { openTelescope } from "./telescope.js";

// Providers
import { createFilesProvider } from "./providers/files.js";
import { createGrepProvider } from "./providers/grep.js";
import { createGitBranchesProvider } from "./providers/git-branches.js";
import { createGitLogProvider } from "./providers/git-log.js";
import { createSessionsProvider } from "./providers/sessions.js";
import { createSkillsProvider } from "./providers/skills.js";
import { createCommandsProvider } from "./providers/commands.js";

type ProviderFactory = (cwd: string, pi: ExtensionAPI) => TelescopeProvider;

/** Registry of available providers */
const PROVIDERS: Record<string, ProviderFactory> = {
	"files":        (cwd) => createFilesProvider(cwd),
	"grep":         (cwd) => createGrepProvider(cwd),
	"git-branches": (cwd) => createGitBranchesProvider(cwd),
	"git-log":      (cwd) => createGitLogProvider(cwd),
	"sessions":     ()    => createSessionsProvider(),
	"skills":       (cwd) => createSkillsProvider(cwd),
	"commands":     (_cwd, pi) => createCommandsProvider(pi),
};

const PROVIDER_NAMES = Object.keys(PROVIDERS);

async function runTelescope(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	providerName?: string,
) {
	const name = providerName?.trim().toLowerCase() || "files";
	const factory = PROVIDERS[name];

	if (!factory) {
		ctx.ui.notify(`Unknown provider: ${name}. Available: ${PROVIDER_NAMES.join(", ")}`, "warning");
		return;
	}

	const provider = factory(ctx.cwd, pi);
	await openTelescope(provider, ctx);
}

export default function (pi: ExtensionAPI) {
	// Main shortcut: Ctrl+T → files
	pi.registerShortcut("ctrl+x", {
		description: "Open Telescope fuzzy finder (files)",
		handler: (ctx) => runTelescope(pi, ctx, "files"),
	});

	// Command with autocomplete
	pi.registerCommand("telescope", {
		description: "Open Telescope fuzzy finder (optional: provider name)",
		getArgumentCompletions: (prefix) => {
			const items = PROVIDER_NAMES
				.filter((n) => n.startsWith(prefix))
				.map((n) => ({ value: n, label: n }));
			return items.length > 0 ? items : null;
		},
		handler: (args, ctx) => runTelescope(pi, ctx, args?.trim() || undefined),
	});

	// Short alias
	pi.registerCommand("ts", {
		description: "Telescope (alias)",
		getArgumentCompletions: (prefix) => {
			const items = PROVIDER_NAMES
				.filter((n) => n.startsWith(prefix))
				.map((n) => ({ value: n, label: n }));
			return items.length > 0 ? items : null;
		},
		handler: (args, ctx) => runTelescope(pi, ctx, args?.trim() || undefined),
	});
}
