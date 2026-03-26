/**
 * Favourite Models Picker
 *
 * Quick-switch to a favourite model using a single key press (1-6, a-z).
 * Favourites are configured in favourite-models.json (max 6 entries).
 *
 * Each entry specifies:
 *   - key:       single character shortcut (number or letter)
 *   - label:     display name shown in the picker
 *   - provider:  provider name (e.g. "anthropic", "google", "openai")
 *   - model:     model id
 *   - thinking:  (optional) thinking level to set after switching
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import { matchesKey, parseKey, Key } from "@mariozechner/pi-tui";
import { OverlayFrame } from "../shared/overlay.js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { ALL_THINKING_LEVELS, searchableSelect, getThinkingDescription } from "./model-switcher";

// ─────────────────────────────────────────────────────────────────────────────
// Config types
// ─────────────────────────────────────────────────────────────────────────────

interface FavouriteModelEntry {
	key: string;
	label: string;
	provider: string;
	model: string;
	thinking?: string;
}

const MAX_FAVOURITES = 8;

// ─────────────────────────────────────────────────────────────────────────────
// Load config
// ─────────────────────────────────────────────────────────────────────────────

function loadFavourites(): FavouriteModelEntry[] {
	const configPath = join(dirname(new URL(import.meta.url).pathname), "favourite-models.json");
	try {
		const raw = readFileSync(configPath, "utf-8");
		const parsed = JSON.parse(raw) as FavouriteModelEntry[];
		if (!Array.isArray(parsed)) {
			return [];
		}
		// Enforce max and validate
		return parsed
			.filter(
				(e) =>
					typeof e.key === "string" &&
					e.key.length === 1 &&
					typeof e.label === "string" &&
					typeof e.provider === "string" &&
					typeof e.model === "string",
			)
			.slice(0, MAX_FAVOURITES);
	} catch {
		return [];
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Favourite Models Picker UI
// ─────────────────────────────────────────────────────────────────────────────

export async function runFavouriteModels(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	if (!ctx.hasUI) return;

	const favourites = loadFavourites();
	if (favourites.length === 0) {
		ctx.ui.notify("No favourite models configured. Edit favourite-models.json", "warning");
		return;
	}

	const currentModel = ctx.model;
	const currentThinking = pi.getThinkingLevel();

	const selected = await ctx.ui.custom<FavouriteModelEntry | null>(
		(tui, theme, _kb, done) => {
			let highlightedIndex = 0;
			const th = theme;

			return {
				render: (width: number) => {
					const f = new OverlayFrame(width, th);
					const lines: string[] = [];

					// Header
					lines.push(f.top());
					lines.push(f.row(th.fg("accent", th.bold("Favourite Models"))));
					lines.push(f.separator());

					// Items
					for (let i = 0; i < favourites.length; i++) {
						const fav = favourites[i];
						const isHighlighted = i === highlightedIndex;

						// Check if this is the current model
						const isCurrent =
							currentModel?.provider === fav.provider &&
							currentModel?.id === fav.model &&
							(!fav.thinking || currentThinking === fav.thinking);

						const keyBadge = th.fg("warning", th.bold(`[${fav.key}]`));
						const label = isHighlighted
							? th.fg("accent", th.bold(fav.label))
							: th.fg("text", fav.label);

						const currentBadge = isCurrent ? " " + th.fg("success", "●") : "";

						let desc = th.fg("dim", `${fav.provider}/${fav.model}`);
						if (fav.thinking) {
							desc += th.fg("dim", ` (${fav.thinking})`);
						}

						let line = `${isHighlighted ? "> " : "  "}${keyBadge} ${label}${currentBadge}  ${desc}`;
						lines.push(f.rowTruncated(line));
					}

					// Footer
					lines.push(f.separator());
					lines.push(f.row(th.fg("dim", "press key to switch | ↑↓ navigate | enter select | esc cancel")));
					lines.push(f.bottom());

					return lines;
				},
				invalidate: () => {},
				handleInput: (data: string) => {
					// Escape / Ctrl+C: cancel
					if (matchesKey(data, "escape") || matchesKey(data, Key.ctrl("c"))) {
						done(null);
						return;
					}

					// Backspace: cancel
					if (matchesKey(data, "backspace")) {
						done(null);
						return;
					}

					// Arrow keys
					if (matchesKey(data, "up") || matchesKey(data, Key.ctrl("p"))) {
						highlightedIndex = Math.max(0, highlightedIndex - 1);
						tui.requestRender();
						return;
					}
					if (matchesKey(data, "down") || matchesKey(data, Key.ctrl("n"))) {
						highlightedIndex = Math.min(favourites.length - 1, highlightedIndex + 1);
						tui.requestRender();
						return;
					}

					// Enter: select highlighted
					if (matchesKey(data, "enter")) {
						if (highlightedIndex >= 0 && highlightedIndex < favourites.length) {
							done(favourites[highlightedIndex]);
						}
						return;
					}

					// Direct key press — match favourite key
					const parsed = parseKey(data);
					const keyChar = parsed && parsed.length === 1 ? parsed.toLowerCase() : null;
					const rawChar = data.length === 1 && data >= " " && data <= "~" ? data.toLowerCase() : null;
					const pressedKey = keyChar || rawChar;

					if (pressedKey) {
						const match = favourites.find((f) => f.key.toLowerCase() === pressedKey);
						if (match) {
							done(match);
						}
					}
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

	if (!selected) return;

	// ── Validate model before showing thinking picker ─────────────────────
	const modelInfo = ctx.modelRegistry.find(selected.provider, selected.model);
	if (!modelInfo) {
		ctx.ui.notify(`Model ${selected.provider}/${selected.model} not found in registry`, "error");
		return;
	}

	// ── Step 2: Pick thinking level (before applying model → no delay) ──
	const supportsReasoning = modelInfo.reasoning;
	let selectedThinking: ThinkingLevel = pi.getThinkingLevel();

	if (supportsReasoning) {
		const defaultThinking = selected.thinking && ALL_THINKING_LEVELS.includes(selected.thinking as ThinkingLevel)
			? (selected.thinking as ThinkingLevel)
			: pi.getThinkingLevel();

		const thinkingItems = ALL_THINKING_LEVELS.map((level) => ({
			value: level,
			label: level === defaultThinking ? `${level} (default)` : level,
			description: getThinkingDescription(level),
		}));

		const thinkingChoice = await searchableSelect<ThinkingLevel>(
			ctx,
			`Thinking Level (${selected.label})`,
			thinkingItems,
			undefined,
			defaultThinking,
		);

		if (!thinkingChoice) return;
		selectedThinking = thinkingChoice;
	} else {
		selectedThinking = "off";
	}

	// ── Apply model + thinking together ───────────────────────────────────
	const ok = await pi.setModel(modelInfo);
	if (!ok) {
		ctx.ui.notify(`No API key available for ${selected.provider}/${selected.model}`, "warning");
		return;
	}
	pi.setThinkingLevel(selectedThinking);

	ctx.ui.notify(
		`Switched to ${selected.label}${supportsReasoning ? ` (thinking: ${selectedThinking})` : ""}`,
		"info",
	);
}
