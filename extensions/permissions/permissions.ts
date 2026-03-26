/**
 * Permissions Extension — 4-mode system
 *
 * Modes:
 *   yolo      — All commands allowed without checks
 *   safe      — Permission rules active (ask for unknown bash commands)
 *   plan      — Plannotator planning mode
 *   read-only — No writes, bash restricted to safe read-only commands
 *
 * Commands:
 *   /mode [yolo|safe|plan|read-only]  — Switch mode
 *
 * Settings:
 *   ~/.pi/agent/permissions.json       (global: mode + rules)
 *   .agents/permissions.json           (project: rules only)
 *
 * Rule evaluation (safe mode):
 *   project rules → global user rules → built-in rules
 *   First match wins. See rules.ts to add new permissions.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

import type { BashRule, PermissionMode } from "./types.js";
import { ALL_MODES, MODE_DESCRIPTIONS } from "./types.js";
import { BUILTIN_RULES } from "./rules.js";
import { CD_PREFIX_RE, findMatchingRule, isReadSafeBash } from "./matching.js";
import { loadProjectRules, loadSettings, normalizeMode, saveSettings } from "./settings.js";

// Re-export for consumers (e.g. custom-footer)
export type { PermissionMode } from "./types.js";

// ── The Single Permission Gate ─────────────────────────────────────────

/**
 * Evaluate whether a tool call should be allowed, blocked, or needs confirmation.
 *
 * This is the ONE place all permission decisions flow through.
 */
async function evaluateToolCall(
	toolName: string,
	input: Record<string, unknown>,
	mode: PermissionMode,
	ctx: ExtensionContext,
): Promise<undefined | { block: true; reason: string }> {
	// ── Read-only: block writes, restrict bash to safe commands ────
	if (mode === "read-only") {
		if (toolName === "write" || toolName === "edit") {
			return { block: true, reason: "Read-only mode: file writes are blocked. Use /mode to change." };
		}
		if (toolName === "bash") {
			const command = input.command as string;
			if (!isReadSafeBash(command)) {
				return {
					block: true,
					reason: `Read-only mode: command not in safe list. Use /mode to change.\nCommand: ${command}`,
				};
			}
		}
		return undefined;
	}

	// ── Plan / yolo: no restrictions ──────────────────────────────
	if (mode === "plan" || mode === "yolo") return undefined;

	// ── Safe mode: evaluate rules (bash only) ─────────────────────
	if (toolName !== "bash") return undefined;

	const command = input.command as string;
	const stripped = command.trim().replace(CD_PREFIX_RE, "").trim();

	// Merge: project rules → global user rules → built-in rules
	const settings = loadSettings();
	const projectRules = loadProjectRules(ctx.cwd);
	const allRules: BashRule[] = [...projectRules, ...(settings.rules ?? []), ...BUILTIN_RULES];

	const match = findMatchingRule(allRules, stripped);
	if (!match) return undefined;

	switch (match.action) {
		case "allow":
			return undefined;
		case "deny":
			return { block: true, reason: "Denied by permission rules" };
		case "ask": {
			if (!ctx.hasUI) {
				return { block: true, reason: "Command requires confirmation (no UI available)" };
			}
			const choice = await ctx.ui.select(
				`⚠️  Permission required:\n\n  ${command}\n\nAllow? (Use /mode to switch modes)`,
				["Yes", "No"],
			);
			if (choice !== "Yes") {
				ctx.abort();
				return { block: true, reason: "Blocked by user" };
			}
			return undefined;
		}
	}
}

// ── Extension ──────────────────────────────────────────────────────────

let permissionMode: PermissionMode = normalizeMode(loadSettings().mode);

export default function (pi: ExtensionAPI) {
	/** Whether we activated plannotator (so we know to deactivate on mode switch). */
	let plannotatorActivatedByUs = false;

	function triggerPlannotator(ctx: ExtensionContext, entering: boolean): void {
		// When entering plan mode, pass a timestamped path so plannotator
		// skips the interactive file-name prompt.  When exiting (toggle off),
		// no path is needed — plannotator just disables.
		if (entering) {
			const now = new Date();
			const pad = (n: number, w = 2) => String(n).padStart(w, "0");
			const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
			ctx.ui.setEditorText(`/plannotator .plan/${ts}.md`);
		} else {
			ctx.ui.setEditorText("/plannotator");
		}
		setTimeout(() => process.stdin.emit("data", "\r"), 0);
	}

	function setMode(mode: PermissionMode, ctx: ExtensionContext): void {
		const previousMode = permissionMode;
		permissionMode = mode;
		const current = loadSettings();
		saveSettings({ ...current, mode });
		pi.events.emit("mode:change", mode);
		ctx.ui.notify(`Mode: ${mode.toUpperCase()} — ${MODE_DESCRIPTIONS[mode]}`);

		// Auto-activate plannotator when entering plan mode
		if (mode === "plan" && previousMode !== "plan") {
			plannotatorActivatedByUs = true;
			triggerPlannotator(ctx, true);
		}

		// Auto-deactivate plannotator when leaving plan mode (if we activated it)
		if (mode !== "plan" && previousMode === "plan" && plannotatorActivatedByUs) {
			plannotatorActivatedByUs = false;
			triggerPlannotator(ctx, false);
		}
	}

	async function modeHandler(args: string | undefined, ctx: ExtensionContext): Promise<void> {
		const arg = args?.trim().toLowerCase();
		if (arg && ALL_MODES.includes(arg as PermissionMode)) {
			setMode(arg as PermissionMode, ctx);
			return;
		}

		const labels = ALL_MODES.map(
			(m) => `${m === permissionMode ? "● " : "  "}${m.toUpperCase()} — ${MODE_DESCRIPTIONS[m]}`,
		);
		const choice = await ctx.ui.select("Select mode:", labels);
		if (!choice) return;

		const selected = ALL_MODES.find((m) => choice.includes(m.toUpperCase()));
		if (selected) setMode(selected, ctx);
	}

	// ── Commands & Shortcuts ──

	pi.registerCommand("mode", {
		description: "Switch permission mode (yolo/safe/plan/read-only)",
		getArgumentCompletions: (prefix: string) => {
			const items = ALL_MODES.map((m) => ({
				value: m,
				label: `${m.toUpperCase()} — ${MODE_DESCRIPTIONS[m]}`,
			}));
			const filtered = items.filter((i) => i.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : null;
		},
		handler: async (args, ctx) => modeHandler(args, ctx),
	});

	pi.registerCommand("permissions", {
		description: "Switch permission mode (alias for /mode)",
		handler: async (args, ctx) => modeHandler(args, ctx),
	});

	// ── Session Start ──

	pi.on("session_start", async (_event, _ctx) => {
		pi.events.emit("mode:change", permissionMode);
	});

	// ── Tool Call Interception (single gate) ──

	pi.on("tool_call", async (event, ctx) => {
		return evaluateToolCall(event.toolName, event.input, permissionMode, ctx);
	});
}
