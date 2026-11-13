/**
 * Compact rendering for tool calls blocked by pi-automode.
 *
 * The model still receives pi-automode's full instruction text; this only shortens what the TUI shows.
 */
import type { Theme } from "@mariozechner/pi-coding-agent";

const PREFIX = "[pi-automode] Action blocked; the tool did not run. ";
const SUFFIX = " Do not claim success";

/** Returns the rendered block line, or undefined when the text is not a pi-automode block. */
export function renderAutomodeBlock(text: string | undefined, theme: Theme): string | undefined {
	if (!text?.startsWith(PREFIX)) return undefined;
	const rest = text.slice(PREFIX.length);
	const end = rest.indexOf(SUFFIX);
	const reason = (end === -1 ? rest : rest.slice(0, end)).trim();
	return `\n${theme.bold(theme.fg("error", "⛔ blocked by auto mode"))} ${theme.fg("muted", reason)}`;
}
