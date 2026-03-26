/**
 * Telescope UI Component
 *
 * The main overlay component rendering:
 *   - Header with provider name and result count
 *   - Split panel: results list (left) | preview (right)
 *   - Input prompt at the bottom
 *
 * Rendered via ctx.ui.custom() as a fullscreen overlay.
 */

import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
// highlightCode used in preview.ts
import {
	matchesKey,
	Key,
	visibleWidth,
	truncateToWidth,
} from "@mariozechner/pi-tui";
import type { TelescopeProvider, ScoredItem } from "./types.js";
import { filterAndScore } from "./scoring.js";
import { filePreview } from "./preview.js";

// ── Types ──────────────────────────────────────────

interface TelescopeState<T> {
	query: string;
	cursorPos: number;
	allItems: T[];
	filtered: ScoredItem<T>[];
	selectedIndex: number;
	scrollOffset: number;
	previewScrollOffset: number;
	previewLines: string[];
	loading: boolean;
}

// ── Drawing helpers ────────────────────────────────

function hLine(ch: string, len: number): string {
	return ch.repeat(Math.max(0, len));
}

function padRight(s: string, len: number): string {
	const vis = visibleWidth(s);
	return vis >= len ? s : s + " ".repeat(len - vis);
}

// ── Main ───────────────────────────────────────────

export async function openTelescope<T>(
	provider: TelescopeProvider<T>,
	ctx: ExtensionContext,
): Promise<void> {
	let tuiRef: { requestRender(): void } | undefined;
	const result = await ctx.ui.custom<T | null>((tui, theme, _kb, done) => {
		tuiRef = tui;
		const state: TelescopeState<T> = {
			query: "",
			cursorPos: 0,
			allItems: [],
			filtered: [],
			selectedIndex: 0,
			scrollOffset: 0,
			previewScrollOffset: 0,
			previewLines: [],
			loading: true,
		};

		// Dynamic search debounce
		let dynamicTimer: ReturnType<typeof setTimeout> | null = null;

		// ── Data loading ─────────────────────────────

		const loadItems = async () => {
			try {
				state.allItems = await provider.load(ctx.cwd);
				state.filtered = filterAndScore(
					state.allItems,
					state.query,
					(item) => provider.getSearchText(item),
				);
				state.loading = false;
				state.selectedIndex = 0;
				state.scrollOffset = 0;
				updatePreview();
				tui.requestRender();
			} catch (err) {
				state.loading = false;
				tui.requestRender();
			}
		};

		const applyFilter = () => {
			if (provider.supportsDynamicSearch && provider.search) {
				// Debounced dynamic search
				if (dynamicTimer) clearTimeout(dynamicTimer);
				dynamicTimer = setTimeout(async () => {
					if (state.query.length >= 2) {
						state.loading = true;
						tui.requestRender();
						try {
							const results = await provider.search!(state.query, ctx.cwd);
							state.allItems = results;
							state.filtered = results.map((item) => ({
								item,
								score: 0,
								indices: [],
							}));
						} catch {}
						state.loading = false;
					} else {
						state.filtered = [];
					}
					state.selectedIndex = 0;
					state.scrollOffset = 0;
					updatePreview();
					tui.requestRender();
				}, 150);
				return;
			}

			state.filtered = filterAndScore(
				state.allItems,
				state.query,
				(item) => provider.getSearchText(item),
			);
			state.selectedIndex = 0;
			state.scrollOffset = 0;
			updatePreview();
		};

		const updatePreview = () => {
			state.previewScrollOffset = 0;
			const scored = state.filtered[state.selectedIndex];
			if (!scored || !provider.getPreview) {
				state.previewLines = [];
				return;
			}
			try {
				const result = provider.getPreview(scored.item, 100);
				if (result && Array.isArray(result)) {
					// Check for special markers
					if (result.length === 1 && typeof result[0] === "string") {
						const marker = result[0];
						if (marker.startsWith("__FILE__:")) {
							const path = marker.slice(9);
							state.previewLines = filePreview(path, theme, 100);
							return;
						}
						if (marker.startsWith("__FILE_LINE__:")) {
							const rest = marker.slice(14);
							const lastColon = rest.lastIndexOf(":");
							const path = rest.slice(0, lastColon);
							const line = parseInt(rest.slice(lastColon + 1), 10);
							state.previewLines = filePreview(path, theme, 100, line);
							return;
						}
					}
					state.previewLines = result as string[];
				} else if (result instanceof Promise) {
					result.then((lines) => {
						state.previewLines = lines ?? [];
						tui.requestRender();
					});
					state.previewLines = [theme.fg("dim", "Loading preview...")];
				} else {
					state.previewLines = [];
				}
			} catch {
				state.previewLines = [theme.fg("dim", "(preview error)")];
			}
		};

		const ensureVisible = () => {
			// Will be computed in render based on listHeight
		};

		// ── Input handling ───────────────────────────

		const handleInput = (data: string) => {
			if (matchesKey(data, Key.escape)) {
				done(null);
				return;
			}

			if (matchesKey(data, Key.enter)) {
				const scored = state.filtered[state.selectedIndex];
				if (scored) done(scored.item);
				else done(null);
				return;
			}

			// Navigation
			if (matchesKey(data, Key.up) || matchesKey(data, Key.ctrl("k"))) {
				if (state.selectedIndex > 0) {
					state.selectedIndex--;
					updatePreview();
				}
				tui.requestRender();
				return;
			}

			if (matchesKey(data, Key.down) || matchesKey(data, Key.ctrl("j"))) {
				if (state.selectedIndex < state.filtered.length - 1) {
					state.selectedIndex++;
					updatePreview();
				}
				tui.requestRender();
				return;
			}

			// Preview scroll (Ctrl+P up, Ctrl+N down)
			if (matchesKey(data, Key.ctrl("p"))) {
				state.previewScrollOffset = Math.max(0, state.previewScrollOffset - 5);
				tui.requestRender();
				return;
			}
			if (matchesKey(data, Key.ctrl("n"))) {
				state.previewScrollOffset += 5;
				tui.requestRender();
				return;
			}

			// Page up/down in list
			if (matchesKey(data, Key.ctrl("u"))) {
				state.selectedIndex = Math.max(0, state.selectedIndex - 10);
				updatePreview();
				tui.requestRender();
				return;
			}
			if (matchesKey(data, Key.ctrl("d"))) {
				state.selectedIndex = Math.min(state.filtered.length - 1, state.selectedIndex + 10);
				updatePreview();
				tui.requestRender();
				return;
			}

			// Backspace
			if (matchesKey(data, Key.backspace)) {
				if (state.cursorPos > 0) {
					state.query =
						state.query.slice(0, state.cursorPos - 1) +
						state.query.slice(state.cursorPos);
					state.cursorPos--;
					applyFilter();
				}
				tui.requestRender();
				return;
			}

			// Ctrl+W — delete word
			if (matchesKey(data, Key.ctrl("w"))) {
				const before = state.query.slice(0, state.cursorPos);
				const after = state.query.slice(state.cursorPos);
				const trimmed = before.replace(/\S+\s*$/, "");
				state.query = trimmed + after;
				state.cursorPos = trimmed.length;
				applyFilter();
				tui.requestRender();
				return;
			}

			// Printable character
			if (data.length === 1 && data.charCodeAt(0) >= 32) {
				state.query =
					state.query.slice(0, state.cursorPos) +
					data +
					state.query.slice(state.cursorPos);
				state.cursorPos++;
				applyFilter();
				tui.requestRender();
				return;
			}
		};

		// ── Render ───────────────────────────────────

		const render = (width: number): string[] => {
			// Use process.stdout for terminal dimensions
			const termHeight = process.stdout.rows ?? 24;
			const totalHeight = Math.min(Math.max(10, termHeight - 4), 40);
			const innerWidth = width - 2; // borders

			const hasPreview = state.previewLines.length > 0 && innerWidth > 60;
			const listWidth = hasPreview ? Math.floor(innerWidth * 0.45) : innerWidth;
			const previewWidth = hasPreview ? innerWidth - listWidth - 1 : 0; // -1 for separator

			const headerHeight = 1; // title row
			const inputHeight = 1; // input row
			const listHeight = totalHeight - headerHeight - inputHeight - 2; // -2 for top/bottom borders

			// Ensure selectedIndex is visible
			if (state.selectedIndex < state.scrollOffset) {
				state.scrollOffset = state.selectedIndex;
			}
			if (state.selectedIndex >= state.scrollOffset + listHeight) {
				state.scrollOffset = state.selectedIndex - listHeight + 1;
			}

			const th = theme;
			const lines: string[] = [];
			const bdr = (s: string) => th.fg("border", s);
			const hBar = hLine("─", innerWidth);

			// ── Top border ──
			lines.push(bdr(`╭${hBar}╮`));

			// ── Header ──
			const title = `${provider.icon} ${provider.name}`;
			const count = state.loading
				? th.fg("dim", "loading…")
				: th.fg("dim", `${state.filtered.length}/${state.allItems.length}`);
			const headerContent = `${th.fg("accent", th.bold(title))}  ${count}`;
			lines.push(bdr("│") + " " + padRight(headerContent, innerWidth - 2) + " " + bdr("│"));

			// ── Separator ──
			if (hasPreview) {
				const leftBar = hLine("─", listWidth);
				const rightBar = hLine("─", previewWidth);
				lines.push(bdr(`├${leftBar}┬${rightBar}┤`));
			} else {
				lines.push(bdr(`├${hBar}┤`));
			}

			// ── List + Preview rows ──
			for (let row = 0; row < listHeight; row++) {
				const itemIdx = state.scrollOffset + row;
				let leftCell = "";

				if (itemIdx < state.filtered.length) {
					const scored = state.filtered[itemIdx]!;
					const isSelected = itemIdx === state.selectedIndex;

					// Build display text with fuzzy highlights
					const searchText = provider.getSearchText(scored.item);
					const highlighted = highlightMatches(searchText, scored.indices, th);
					const displayText = provider.getDisplayText(scored.item, th, highlighted);

					const prefix = isSelected ? th.fg("accent", "> ") : "  ";
					const styledText = isSelected ? th.bold(displayText) : displayText;
					leftCell = prefix + styledText;
				}

				leftCell = " " + truncateToWidth(leftCell, listWidth - 2) + " ";
				leftCell = padRight(leftCell, listWidth);

				if (hasPreview) {
					const previewIdx = state.previewScrollOffset + row;
					let rightCell = "";
					if (previewIdx < state.previewLines.length) {
						rightCell = state.previewLines[previewIdx] ?? "";
					}
					rightCell = " " + truncateToWidth(rightCell, previewWidth - 2) + " ";
					rightCell = padRight(rightCell, previewWidth);

					lines.push(bdr("│") + leftCell + bdr("│") + rightCell + bdr("│"));
				} else {
					lines.push(bdr("│") + leftCell + padRight("", innerWidth - listWidth) + bdr("│"));
				}
			}

			// ── Input separator ──
			if (hasPreview) {
				const leftBar = hLine("─", listWidth);
				const rightBar = hLine("─", previewWidth);
				lines.push(bdr(`├${leftBar}┴${rightBar}┤`));
			} else {
				lines.push(bdr(`├${hBar}┤`));
			}

			// ── Input row ──
			const promptChar = th.fg("accent", "> ");
			const beforeCursor = state.query.slice(0, state.cursorPos);
			const cursorChar = state.query[state.cursorPos] ?? " ";
			const afterCursor = state.query.slice(state.cursorPos + 1);
			const inputText = `${promptChar}${beforeCursor}\x1b[7m${cursorChar}\x1b[27m${afterCursor}`;
			const inputContent = " " + truncateToWidth(inputText, innerWidth - 2) + " ";
			lines.push(bdr("│") + padRight(inputContent, innerWidth) + bdr("│"));

			// ── Bottom border ──
			// hint not rendered inline (keeping it clean), but available via border
			const bottomBar = hLine("─", innerWidth);
			lines.push(bdr(`╰${bottomBar}╯`));

			return lines;
		};

		// Start loading
		if (!provider.supportsDynamicSearch) {
			loadItems();
		} else {
			state.loading = false;
		}

		return {
			render,
			invalidate: () => {},
			handleInput,
		};
	}, {
		overlay: true,
		overlayOptions: {
			anchor: "top-center" as const,
			offsetY: 3,
			width: "90%",
			minWidth: 80,
			maxHeight: "85%",
		},
	});

	// Handle selection
	if (result !== null && result !== undefined) {
		await provider.onSelect(result, ctx);
		// Explicitly request render to ensure the editor shows
		// the new text after the overlay closed
		tuiRef?.requestRender();
	}
}

// ── Highlight helpers ──────────────────────────────

/**
 * Highlight matched characters in text using theme accent color.
 */
function highlightMatches(text: string, indices: number[], theme: Theme): string {
	if (indices.length === 0) return text;

	const indexSet = new Set(indices);
	let result = "";
	let inHighlight = false;

	for (let i = 0; i < text.length; i++) {
		const shouldHighlight = indexSet.has(i);
		if (shouldHighlight && !inHighlight) {
			result += theme.fg("warning", "");
			inHighlight = true;
		} else if (!shouldHighlight && inHighlight) {
			inHighlight = false;
		}

		if (shouldHighlight) {
			result += theme.fg("warning", text[i]!);
		} else {
			result += text[i];
		}
	}

	return result;
}
