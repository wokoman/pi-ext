/**
 * Tool Pills — Colored inverted-text pill labels for built-in tool calls.
 *
 * Re-registers each built-in tool with a custom `renderCall` that shows
 * a compact colored pill + contextual arguments, and a `renderResult`
 * that truncates long output when collapsed (Ctrl+O to expand).
 */

import type { ExtensionAPI, AgentToolResult, Theme } from "@mariozechner/pi-coding-agent";
import {
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	highlightCode,
	keyHint,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

/* ── constants ──────────────────────────────────────────────────── */

/** Max lines shown in collapsed (non-expanded) result view */
const COLLAPSED_MAX_LINES = 15;

/* ── Tool pill theme roles ───────────────────────────────────────── */

const TOOL_ROLES: Record<string, string> = {
	ls:    "success",    // green
	read:  "success",    // green
	find:  "mdCode",     // teal
	grep:  "mdCode",     // teal
	edit:  "warning",    // yellow
	write: "bashMode",   // peach
	bash:  "error",      // red
};

/** Render an inverted-colour pill badge: ` name ` using theme colors. */
function pill(name: string, theme: Theme): string {
	const role = TOOL_ROLES[name] ?? "dim";
	return theme.bold(theme.inverse(theme.fg(role as any, ` ${name} `)));
}

/* ── result rendering helpers ───────────────────────────────────── */

/** Extract the first text content from a tool result */
function getText(result: AgentToolResult<unknown>): string | undefined {
	const c = result.content.find((c) => c.type === "text");
	return c?.type === "text" ? c.text : undefined;
}

/**
 * Render tool output text with collapsed truncation.
 * - Collapsed: shows first COLLAPSED_MAX_LINES, with a hint to expand.
 * - Expanded: shows everything.
 * For "tail" mode (e.g. bash), shows the *last* N lines when collapsed.
 */
function renderTextResult(
	text: string | undefined,
	expanded: boolean,
	theme: Theme,
	mode: "head" | "tail" = "head",
): Text {
	if (!text || !text.trim()) return new Text("", 0, 0);

	const lines = text.split("\n");

	if (expanded || lines.length <= COLLAPSED_MAX_LINES) {
		const output = lines.map((l) => theme.fg("toolOutput", l)).join("\n");
		return new Text(`\n${output}`, 0, 0);
	}

	// Truncate
	const hidden = lines.length - COLLAPSED_MAX_LINES;
	const hint = theme.fg("dim", `… ${hidden} more lines (${keyHint("app.tools.expand", "to expand")})`);

	if (mode === "tail") {
		const visible = lines.slice(-COLLAPSED_MAX_LINES);
		const output = visible.map((l) => theme.fg("toolOutput", l)).join("\n");
		return new Text(`\n${hint}\n${output}`, 0, 0);
	}

	// head (default)
	const visible = lines.slice(0, COLLAPSED_MAX_LINES);
	const output = visible.map((l) => theme.fg("toolOutput", l)).join("\n");
	return new Text(`\n${output}\n${hint}`, 0, 0);
}

/* ── extension entry point ──────────────────────────────────────── */

export default function (pi: ExtensionAPI) {
	const cwd = process.cwd();

	/* ls */
	const origLs = createLsToolDefinition(cwd);
	pi.registerTool({
		...origLs,
		parameters: { ...origLs.parameters },
		renderCall(args, theme, _ctx) {
			return new Text(pill("ls", theme) + " " + theme.fg("accent", args.path || "."), 0, 0);
		},
		renderResult(result, { expanded }, theme, _ctx) {
			return renderTextResult(getText(result), expanded, theme);
		},
	});

	/* read */
	const origRead = createReadToolDefinition(cwd);
	pi.registerTool({
		...origRead,
		parameters: { ...origRead.parameters },
		renderCall(args, theme, _ctx) {
			let t = pill("read", theme) + " " + theme.fg("accent", args.path);
			if (args.offset || args.limit) {
				const parts: string[] = [];
				if (args.offset) parts.push(`L${args.offset}`);
				if (args.limit) parts.push(`${args.limit}L`);
				t += theme.fg("dim", ` ${parts.join(", ")}`);
			}
			return new Text(t, 0, 0);
		},
		renderResult(result, { expanded }, theme, _ctx) {
			return renderTextResult(getText(result), expanded, theme);
		},
	});

	/* find */
	const origFind = createFindToolDefinition(cwd);
	pi.registerTool({
		...origFind,
		parameters: { ...origFind.parameters },
		renderCall(args, theme, _ctx) {
			let t = pill("find", theme) + " " + theme.fg("accent", `"${args.pattern}"`);
			if (args.path) t += theme.fg("dim", ` in ${args.path}`);
			return new Text(t, 0, 0);
		},
		renderResult(result, { expanded }, theme, _ctx) {
			return renderTextResult(getText(result), expanded, theme);
		},
	});

	/* grep */
	const origGrep = createGrepToolDefinition(cwd);
	pi.registerTool({
		...origGrep,
		parameters: { ...origGrep.parameters },
		renderCall(args, theme, _ctx) {
			let t = pill("grep", theme) + " " + theme.fg("accent", `"${args.pattern}"`);
			if (args.path) t += theme.fg("dim", ` in ${args.path}`);
			if (args.glob) t += theme.fg("dim", ` ${args.glob}`);
			return new Text(t, 0, 0);
		},
		renderResult(result, { expanded }, theme, _ctx) {
			return renderTextResult(getText(result), expanded, theme);
		},
	});

	/* edit */
	const origEdit = createEditToolDefinition(cwd);
	pi.registerTool({
		...origEdit,
		parameters: { ...origEdit.parameters },
		renderCall(args, theme, _ctx) {
			return new Text(pill("edit", theme) + " " + theme.fg("accent", args.path), 0, 0);
		},
		renderResult(result, { expanded }, theme, _ctx) {
			return renderTextResult(getText(result), expanded, theme);
		},
	});

	/* write */
	const origWrite = createWriteToolDefinition(cwd);
	pi.registerTool({
		...origWrite,
		parameters: { ...origWrite.parameters },
		renderCall(args, theme, _ctx) {
			return new Text(pill("write", theme) + " " + theme.fg("accent", args.path), 0, 0);
		},
		renderResult(result, { expanded }, theme, _ctx) {
			return renderTextResult(getText(result), expanded, theme);
		},
	});

	/* bash */
	const origBash = createBashToolDefinition(cwd);
	pi.registerTool({
		...origBash,
		parameters: { ...origBash.parameters },
		renderCall(args, theme, _ctx) {
			const cmd = args.command;
			const highlighted = highlightCode(cmd, "bash").join("\n");
			const isMultiLine = cmd.includes("\n") || cmd.length > 80;
			if (isMultiLine) {
				return new Text(pill("bash", theme) + "\n" + highlighted, 0, 0);
			}
			return new Text(pill("bash", theme) + " " + highlighted, 0, 0);
		},
		renderResult(result, { expanded }, theme, _ctx) {
			// Bash output: show tail when collapsed (most recent output is most useful)
			return renderTextResult(getText(result), expanded, theme, "tail");
		},
	});
}
