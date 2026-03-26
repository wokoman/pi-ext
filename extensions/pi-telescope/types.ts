/**
 * Pi-Telescope Types
 *
 * Core interfaces for the fuzzy finder provider system.
 */

import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";

/**
 * A data provider for the telescope fuzzy finder.
 *
 * Each provider supplies a list of items, defines how they're displayed,
 * searched, previewed, and what happens on selection.
 */
export interface TelescopeProvider<T = any> {
	/** Unique identifier */
	name: string;
	/** Display icon (emoji) */
	icon: string;
	/** Short description */
	description: string;

	/** Load all items. Called once when the provider is activated. */
	load(cwd: string): Promise<T[]> | T[];

	/** Extract searchable text from an item (used by fuzzy matcher). */
	getSearchText(item: T): string;

	/** Format item for display in the list. May include ANSI via theme. */
	getDisplayText(item: T, theme: Theme, highlighted?: string): string;

	/** Handle item selection (open file, run command, etc.) */
	onSelect(item: T, ctx: ExtensionContext): void | Promise<void>;

	/** Return preview lines for the selected item. Null = no preview. */
	getPreview?(item: T, maxLines: number): string[] | Promise<string[]> | null;

	/**
	 * If true, telescope calls search() on each keystroke instead of
	 * filtering the pre-loaded list. Used for grep/ripgrep.
	 */
	supportsDynamicSearch?: boolean;

	/** Dynamic search — called when supportsDynamicSearch is true. */
	search?(query: string, cwd: string): Promise<T[]>;
}

/** A scored item after fuzzy matching. */
export interface ScoredItem<T = any> {
	item: T;
	score: number;
	/** Character indices that matched the query (for highlighting). */
	indices: number[];
}
