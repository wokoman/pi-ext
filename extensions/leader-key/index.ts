/**
 * Leader Key Extension
 *
 * Press Ctrl+Space to open a floating command palette showing all available
 * actions organised into groups (like Vim's which-key or Emacs' leader key).
 *
 * Each group has a single-character chord key. Press the chord to see the
 * group's actions, then press the action key to execute.
 *
 * Navigation:
 *   - Chord keys shown in the palette (e.g. "s" for Session, "m" for Model)
 *   - Backspace / Escape to go back or close
 *   - Direct key press executes the action immediately
 *
 * The palette auto-discovers extension commands and merges them with
 * built-in actions (session, model, etc.).
 */

import type {
	ExtensionAPI,
	ExtensionContext,
	Theme,
} from "@mariozechner/pi-coding-agent";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import { matchesKey, parseKey, Key } from "@mariozechner/pi-tui";
import { runModelSwitcher, runThinkingPicker, searchableSelect } from "./model-switcher";
import { runFavouriteModels } from "./favourite-models";
import { runSessionSwitch } from "../session-switch/index";
import { OverlayFrame } from "../shared/overlay.js";



// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ActionItem {
	key: string; // single character shortcut
	label: string;
	description?: string;
	action: (ctx: ExtensionContext) => void | Promise<void>;
}

interface ActionGroup {
	key: string; // chord key to open this group
	label: string;
	items: ActionItem[];
}

/** Top-level entry: either a group (chord → submenu) or a direct action */
type TopLevelEntry =
	| { type: "group"; group: ActionGroup }
	| { type: "action"; key: string; label: string; description?: string; action: (ctx: ExtensionContext) => void | Promise<void> };

// ─────────────────────────────────────────────────────────────────────────────
// Build top-level entries
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────


function buildEntries(pi: ExtensionAPI, ctx: ExtensionContext): TopLevelEntry[] {
	const entries: TopLevelEntry[] = [];

	// ── Session ─────────────────────────────────────────────────────────
	entries.push({
		type: "group",
		group: {
			key: "s",
			label: "Session",
			items: [
				{
					key: "n",
					label: "New session",
					description: "start fresh",
					action: (ctx) => {
						ctx.ui.setEditorText("/new");
						setTimeout(() => process.stdin.emit("data", "\r"), 0);
					},
				},
				{
					key: "r",
					label: "Resume session",
					description: "/resume",
					action: (ctx) => {
						ctx.ui.setEditorText("/resume");
						setTimeout(() => process.stdin.emit("data", "\r"), 0);
					},
				},
				{
					key: "s",
					label: "Switch session",
					description: "split panel picker",
					action: (ctx) => runSessionSwitch(pi, ctx),
				},
				{
					key: "t",
					label: "Session tree",
					description: "/tree",
					action: (ctx) => {
						ctx.ui.setEditorText("/tree");
						setTimeout(() => process.stdin.emit("data", "\r"), 0);
					},
				},
				{
					key: "f",
					label: "Fork session",
					description: "/fork",
					action: (ctx) => {
						ctx.ui.setEditorText("/fork");
						setTimeout(() => process.stdin.emit("data", "\r"), 0);
					},
				},
				{
					key: "p",
					label: "Split-fork",
					description: "fork into cmux split pane",
					action: (ctx) => {
						ctx.ui.setEditorText("/split-fork");
						setTimeout(() => process.stdin.emit("data", "\r"), 0);
					},
				},
				{
					key: "c",
					label: "Compact context",
					description: "compact now",
					action: (ctx) => {
						ctx.compact({});
						ctx.ui.notify("Compaction started", "info");
					},
				},
			],
		},
	});

	// ── Model (direct action → opens model switcher wizard) ─────────────
	const currentModel = ctx.model;
	entries.push({
		type: "action",
		key: "m",
		label: "Model",
		description: currentModel ? `${currentModel.provider}/${currentModel.id}` : "switch model",
		action: (ctx) => runModelSwitcher(pi, ctx),
	});

	// ── Favourite models (direct action → quick-switch picker) ──────────
	entries.push({
		type: "action",
		key: "f",
		label: "Favourites",
		description: "quick-switch favourite models",
		action: (ctx) => runFavouriteModels(pi, ctx),
	});

	// ── Thinking (direct action → opens thinking level picker) ──────────
	const currentThinking = pi.getThinkingLevel();
	entries.push({
		type: "action",
		key: "t",
		label: "Thinking",
		description: `current: ${currentThinking}`,
		action: (ctx) => runThinkingPicker(pi, ctx),
	});

	// ── Permissions mode (direct action → overlay picker) ───────────────
	entries.push({
		type: "action",
		key: "p",
		label: "Permissions",
		description: "switch permission mode",
		action: async (ctx) => {
			const ALL_MODES = ["yolo", "safe", "plan", "read-only"] as const;
			const MODE_DESCRIPTIONS: Record<string, string> = {
				yolo: "all commands allowed, no checks",
				safe: "permission rules active",
				plan: "plannotator planning mode",
				"read-only": "read-only, no writes allowed",
			};

			const items = ALL_MODES.map((m) => ({
				value: m,
				label: m,
				description: MODE_DESCRIPTIONS[m],
			}));

			const selected = await searchableSelect<string>(
				ctx,
				"Select Permission Mode",
				items,
			);

			if (selected) {
				ctx.ui.setEditorText(`/mode ${selected}`);
				setTimeout(() => process.stdin.emit("data", "\r"), 0);
			}
		},
	});

	// ── Extension commands (auto-discovered, searchable picker) ─────────
	const commands = pi.getCommands();
	const extCommands = commands.filter((c) => c.source === "extension");

	// Filter out commands that are already represented in built-in entries
	const builtinCommandNames = new Set([
		"new", "resume", "tree", "fork", "compact",
		"model", "thinking", "tools", "reload",
		"switch", "lk", "leader-key",
		"mode", "permissions",
	]);

	const customCommands = extCommands.filter((c) => !builtinCommandNames.has(c.name));

	if (customCommands.length > 0) {
		entries.push({
			type: "action",
			key: "e",
			label: "Extensions",
			description: `${customCommands.length} command${customCommands.length !== 1 ? "s" : ""}`,
			action: async (ctx) => {
				const items = customCommands.map((cmd) => ({
					value: cmd.name,
					label: cmd.name,
					description: cmd.description || "extension",
				}));

				const selected = await searchableSelect<string>(
					ctx,
					"Select Extension Command",
					items,
				);

				if (selected) {
					pi.sendUserMessage(`/${selected}`);
				}
			},
		});
	}

	// ── Skills (direct action → searchable picker) ─────────────────────
	const skillCommands = commands.filter((c) => c.source === "skill");

	if (skillCommands.length > 0) {
		entries.push({
			type: "action",
			key: "k",
			label: "Skills",
			description: `${skillCommands.length} skill${skillCommands.length !== 1 ? "s" : ""}`,
			action: async (ctx) => {
				const items = skillCommands.map((cmd) => ({
					value: cmd.name,
					label: cmd.name,
					description: cmd.description || "skill",
				}));

				const selected = await searchableSelect<string>(
					ctx,
					"Select Skill",
					items,
				);

				if (selected) {
					ctx.ui.setEditorText(`/${selected} `);
					ctx.ui.notify(`Type your prompt after /${selected}`, "info");
				}
			},
		});
	}

	// ── Exit ─────────────────────────────────────────────────────────────
	entries.push({
		type: "action",
		key: "r",
		label: "Review",
		description: "code review UI",
		action: (ctx) => {
			ctx.ui.setEditorText("/plannotator-review");
			setTimeout(() => process.stdin.emit("data", "\r"), 0);
		},
	});

	entries.push({
		type: "action",
		key: "a",
		label: "Annotate last",
		description: "annotate last assistant message",
		action: (ctx) => {
			ctx.ui.setEditorText("/plannotator-last");
			setTimeout(() => process.stdin.emit("data", "\r"), 0);
		},
	});

	entries.push({
		type: "action",
		key: "q",
		label: "Exit",
		description: "quit pi",
		action: (ctx) => {
			ctx.ui.setEditorText("/quit");
			setTimeout(() => process.stdin.emit("data", "\r"), 0);
		},
	});

	return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlay component
// ─────────────────────────────────────────────────────────────────────────────

type View = { type: "root" } | { type: "group"; group: ActionGroup };

class LeaderKeyOverlay {
	private view: View = { type: "root" };
	private entries: TopLevelEntry[];
	private theme: Theme;
	private done: (result: ActionItem | null) => void;
	private highlightedIndex = 0;

	constructor(
		entries: TopLevelEntry[],
		theme: Theme,
		done: (result: ActionItem | null) => void,
	) {
		this.entries = entries;
		this.theme = theme;
		this.done = done;
	}

	private get currentItems(): Array<{ key: string; label: string; description?: string }> {
		if (this.view.type === "root") {
			return this.entries.map((e) => {
				if (e.type === "group") {
					return {
						key: e.group.key,
						label: e.group.label,
						description: `${e.group.items.length} action${e.group.items.length !== 1 ? "s" : ""}`,
					};
				}
				return {
					key: e.key,
					label: e.label,
					description: e.description,
				};
			});
		}
		return this.view.group.items;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, Key.ctrl("c"))) {
			if (this.view.type === "group") {
				this.view = { type: "root" };
				this.highlightedIndex = 0;
			} else {
				this.done(null);
			}
			return;
		}

		if (matchesKey(data, "backspace")) {
			if (this.view.type === "group") {
				this.view = { type: "root" };
				this.highlightedIndex = 0;
			} else {
				this.done(null);
			}
			return;
		}

		// Arrow keys for highlighting
		if (matchesKey(data, "up")) {
			this.highlightedIndex = Math.max(0, this.highlightedIndex - 1);
			return;
		}
		if (matchesKey(data, "down")) {
			const items = this.currentItems;
			this.highlightedIndex = Math.min(items.length - 1, this.highlightedIndex + 1);
			return;
		}

		// Enter to select highlighted item
		if (matchesKey(data, "enter") || matchesKey(data, "return")) {
			const items = this.currentItems;
			if (this.highlightedIndex >= 0 && this.highlightedIndex < items.length) {
				const item = items[this.highlightedIndex];
				if (this.view.type === "root") {
					this.handleRootSelection(item.key);
				} else {
					const action = this.view.group.items.find((a) => a.key === item.key);
					if (action) {
						this.done(action);
					}
				}
			}
			return;
		}

		// Direct key press — use parseKey to handle both raw chars and Kitty protocol sequences
		const parsed = parseKey(data);
		if (parsed && parsed.length === 1 && parsed >= "a" && parsed <= "z") {
			const key = parsed.toLowerCase();

			if (this.view.type === "root") {
				this.handleRootSelection(key);
			} else {
				const action = this.view.group.items.find((a) => a.key === key);
				if (action) {
					this.done(action);
				}
			}
		} else if (data.length === 1 && data >= " " && data <= "~") {
			// Fallback for raw printable characters (legacy terminals)
			const key = data.toLowerCase();

			if (this.view.type === "root") {
				this.handleRootSelection(key);
			} else {
				const action = this.view.group.items.find((a) => a.key === key);
				if (action) {
					this.done(action);
				}
			}
		}
	}

	private handleRootSelection(key: string): void {
		const entry = this.entries.find((e) => {
			if (e.type === "group") return e.group.key === key;
			return e.key === key;
		});
		if (!entry) return;

		if (entry.type === "group") {
			this.view = { type: "group", group: entry.group };
			this.highlightedIndex = 0;
		} else {
			// Direct action — wrap it as an ActionItem and fire
			this.done({
				key: entry.key,
				label: entry.label,
				description: entry.description,
				action: entry.action,
			});
		}
	}

	render(width: number): string[] {
		const th = this.theme;
		const f = new OverlayFrame(width, th);
		const lines: string[] = [];

		// Header
		lines.push(f.top());

		if (this.view.type === "root") {
			lines.push(f.row(th.fg("accent", th.bold("Leader Key"))));
		} else {
			const g = this.view.group;
			const breadcrumb = th.fg("dim", "< ") + th.fg("accent", th.bold(g.label));
			lines.push(f.row(breadcrumb));
		}

		lines.push(f.separator());

		// Items
		const items = this.currentItems;
		if (items.length === 0) {
			lines.push(f.row(th.fg("muted", "  (no items)")));
		} else {
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				const isHighlighted = i === this.highlightedIndex;

				const keyBadge = th.fg("warning", th.bold(`[${item.key}]`));
				const label = isHighlighted
					? th.fg("accent", th.bold(item.label))
					: th.fg("text", item.label);

				// Show a chevron for groups in root view
				let suffix = "";
				if (this.view.type === "root") {
					const entry = this.entries.find((e) => {
						if (e.type === "group") return e.group.key === item.key;
						return e.key === item.key;
					});
					if (entry?.type === "group") {
						suffix = " " + th.fg("dim", ">");
					}
				}

				let line = `${isHighlighted ? "> " : "  "}${keyBadge} ${label}${suffix}`;

				if (item.description) {
					line += "  " + th.fg("dim", item.description);
				}

				lines.push(f.rowTruncated(line));
			}
		}

		// Footer
		lines.push(f.separator());

		if (this.view.type === "root") {
			lines.push(f.row(th.fg("dim", "press key to select | esc close")));
		} else {
			lines.push(f.row(th.fg("dim", "press key to run | bksp back | esc close")));
		}

		lines.push(f.bottom());

		return lines;
	}

	invalidate(): void {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Extension
// ─────────────────────────────────────────────────────────────────────────────

export default function leaderKeyExtension(pi: ExtensionAPI) {
	async function openLeaderKey(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;

		const entries = buildEntries(pi, ctx);

		const selected = await ctx.ui.custom<ActionItem | null>(
			(tui, theme, _kb, done) => {
				const overlay = new LeaderKeyOverlay(entries, theme, done);
				return {
					render: (w: number) => overlay.render(w),
					invalidate: () => overlay.invalidate(),
					handleInput: (data: string) => {
						overlay.handleInput(data);
						tui.requestRender();
					},
				};
			},
			{
				overlay: true,
				overlayOptions: {
					anchor: "center",
					width: 80,
					minWidth: 50,
					maxHeight: "80%",
				},
			},
		);

		if (selected) {
			try {
				await selected.action(ctx);
			} catch (err) {
				ctx.ui.notify(`Action failed: ${err}`, "error");
			}
		}
	}

	// ── Model-switcher commands (previously standalone extension) ────────
	pi.registerCommand("switch", {
		description: "Switch model (provider → model → thinking level)",
		handler: async (_args, ctx) => {
			await runModelSwitcher(pi, ctx);
		},
	});

	pi.registerShortcut(Key.ctrlShift("m"), {
		description: "Switch model (provider → model → thinking level)",
		handler: async (ctx) => {
			await runModelSwitcher(pi, ctx);
		},
	});

	// Register as a command
	pi.registerCommand("lk", {
		description: "Open Leader Key palette",
		handler: async (_args, ctx) => {
			await openLeaderKey(ctx);
		},
	});

	// Register shortcut: Ctrl+Space
	pi.registerShortcut(Key.ctrl("space"), {
		description: "Open Leader Key",
		handler: async (ctx) => {
			await openLeaderKey(ctx);
		},
	});
}
