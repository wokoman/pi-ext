/**
 * Pi-Telescope Extension
 *
 * A native TUI fuzzy finder for pi, inspired by telescope.nvim and Television.
 *
 * Features:
 *   - Fuzzy search with pattern modifiers ('exact, ^prefix, suffix$, !negate)
 *   - Multi-select with Tab
 *   - Provider switching with Ctrl+R
 *   - Toggle preview with Ctrl+O
 *   - Help panel with Ctrl+G
 *   - Provider-specific actions with Ctrl+E
 *   - Copy to clipboard with Ctrl+Y
 *   - Frecency-aware sorting
 *   - Footer with keybinding hints
 *
 * Keybindings:
 *   Ctrl+X             → open files finder
 *
 * Commands:
 *   /telescope [name]  → open specific provider
 *   /ts [name]         → alias
 *
 * Built-in providers:
 *   files, git-branches, git-log, sessions, skills, commands
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { TelescopeProvider } from "./types.js";
import { openTelescope } from "./telescope.js";

import { createFilesProvider } from "./providers/files.js";

import { createGitBranchesProvider } from "./providers/git-branches.js";
import { createGitLogProvider } from "./providers/git-log.js";
import { createSessionsProvider } from "./providers/sessions.js";
import { createSkillsProvider } from "./providers/skills.js";
import { createCommandsProvider } from "./providers/commands.js";

type ProviderFactory = (cwd: string, pi: ExtensionAPI) => TelescopeProvider;

/** Registry of available providers */
const PROVIDERS: Record<string, ProviderFactory> = {
	"files":        (cwd) => createFilesProvider(cwd),

	"git-branches": (cwd) => createGitBranchesProvider(cwd),
	"git-log":      (cwd) => createGitLogProvider(cwd),
	"sessions":     ()    => createSessionsProvider(),
	"skills":       (cwd) => createSkillsProvider(cwd),
	"commands":     (_cwd, pi) => createCommandsProvider(pi),
};

const PROVIDER_NAMES = Object.keys(PROVIDERS);

/** Build the allProviders map for Ctrl+R switching */
function buildAllProviders(
	cwd: string,
	pi: ExtensionAPI,
): Record<string, () => TelescopeProvider> {
	const result: Record<string, () => TelescopeProvider> = {};
	for (const [name, factory] of Object.entries(PROVIDERS)) {
		result[name] = () => factory(cwd, pi);
	}
	return result;
}

async function runTelescope(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	providerName?: string,
) {
	const name = providerName?.trim().toLowerCase() || "files";
	const factory = PROVIDERS[name];

	if (!factory) {
		ctx.ui.notify(
			`Unknown provider: ${name}. Available: ${PROVIDER_NAMES.join(", ")}`,
			"warning",
		);
		return;
	}

	const provider = factory(ctx.cwd, pi);
	await openTelescope(provider, ctx, {
		allProviders: buildAllProviders(ctx.cwd, pi),
	});
}

export default function (pi: ExtensionAPI) {
	pi.registerShortcut("ctrl+x", {
		description: "Open Telescope fuzzy finder (files)",
		handler: (ctx) => runTelescope(pi, ctx, "files"),
	});

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
