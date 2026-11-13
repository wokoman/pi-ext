/**
 * Custom Footer Extension — Two-line compact powerline style
 *
 * One line:  MODE  ~/path (branch) │ 42%/200k │ ⚡ model • thinking │ extension statuses
 *
 * Rendered as a belowEditor widget (not setFooter) so sub-bar appears below us.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { PermissionMode } from "../permissions/permissions.js";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { execSync } from "node:child_process";
import { existsSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import {
	buildPathString,
	fmtTokens,
	modePillWidth,
	renderContextUsage,
	renderModelInfo,
	renderModePill,
	renderPath,
} from "./renderers.js";
import { startOpenRouterPolling, renderOpenRouterStats, type OpenRouterPoller } from "./openrouter.js";



// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Condense pi-automode's "AM ● a:39 d:3 ca:39 cd:2" to what matters at a glance:
 * whether it is on, and how many calls it blocked this session.
 */
function renderAutomodeStatus(text: string, theme: { fg: (role: any, text: string) => string }): string {
	const plain = text.replace(/\x1b\[[0-9;]*m/g, "");
	if (plain.includes("○")) return theme.fg("warning", "🛡 auto off");
	const denied = Number(/\bd:(\d+)/.exec(plain)?.[1] ?? 0);
	return denied > 0
		? theme.fg("accent", "🛡 auto") + theme.fg("error", ` ${denied} blocked`)
		: theme.fg("accent", "🛡 auto");
}

function getGitBranch(cwd: string): string | null {
	try {
		return execSync("git branch --show-current", { cwd, encoding: "utf-8", timeout: 500 }).trim() || null;
	} catch {
		return null;
	}
}

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// Set only while the permissions extension is loaded and announces a mode.
	let currentMode: PermissionMode | null = null;
	let tuiRef: { requestRender(): void } | null = null;
	let gitBranch: string | null = null;
	let gitWatcher: FSWatcher | undefined;
	let orPoller: OpenRouterPoller | undefined;
	let currentModel: { provider?: string; id?: string; contextWindow?: number } | null | undefined = null;
	let footerData: { getExtensionStatuses(): ReadonlyMap<string, string> } | null = null;

	pi.events.on("mode:change", (data: unknown) => {
		currentMode = data as PermissionMode;
		tuiRef?.requestRender();
	});

	pi.on("model_select", async (_event) => {
		currentModel = _event.model;
		tuiRef?.requestRender();
	});

	pi.on("session_start", async (_event, ctx) => {
		// Get initial git branch
		gitBranch = getGitBranch(ctx.cwd);

		// Watch .git/HEAD for branch changes
		const headPath = join(ctx.cwd, ".git", "HEAD");
		if (existsSync(headPath)) {
			gitWatcher = watch(headPath, () => {
				gitBranch = getGitBranch(ctx.cwd);
				tuiRef?.requestRender();
			});
		}

		// Track current model (ctx.model may be stale after model_select).
		currentModel = ctx.model;

		// Start OpenRouter polling (renderer gates display on provider).
		orPoller = startOpenRouterPolling(() => tuiRef?.requestRender());

		// Render as a belowEditor widget — no setFooter, so no divider line
		const setWidgetFn = ctx.ui.setWidget.bind(ctx.ui) as (
			name: string,
			content: unknown,
			options?: { placement?: string },
		) => void;

		setWidgetFn(
			"custom-footer",
			(_widgetTui: { requestRender(): void }, widgetTheme: any) => {
				tuiRef = _widgetTui;
				return {
					render(width: number): string[] {
						return [
							renderLine1(width, widgetTheme, ctx),
						];
					},
					invalidate() {},
				};
			},
			{ placement: "belowEditor" },
		);

		// Suppress pi's footer; keep its data so line 1 can show extension statuses (automode, usage limits).
		ctx.ui.setFooter((_footerTui, _footerTheme, data) => {
			footerData = data;
			return { render() { return []; }, invalidate() {} };
		});
	});

	pi.on("session_shutdown", async () => {
		gitWatcher?.close();
		orPoller?.stop();
	});

	// ── Line 1: Mode │ Path │ Context │ Model ──────────────────────────

	function renderLine1(
		width: number,
		theme: { fg: (role: any, text: string) => string; bold: (text: string) => string; inverse: (text: string) => string; bg: (role: any, text: string) => string },
		ctx: { getContextUsage(): { percent: number | null; contextWindow: number } | null | undefined; model: { provider?: string; id?: string; contextWindow?: number } | null | undefined },
	): string {
		const sep = theme.fg("dim", " │ ");
		const sepW = 3;

		// Mode pill
		const pill = currentMode ? renderModePill(currentMode, theme) : "";
		const pillW = currentMode ? modePillWidth(currentMode) : 0;

		// Path + branch
		const pathRaw = buildPathString(process.cwd(), gitBranch);

		// Model + thinking
		const modelObj = currentModel ?? ctx.model;
		const provider = modelObj?.provider || "unknown";
		const modelName = modelObj?.id || "no-model";
		const thinking = pi.getThinkingLevel();
		const model = renderModelInfo(modelName, provider, thinking, theme);

		// Context usage
		const usage = ctx.getContextUsage();
		const pct = usage?.percent ?? 0;
		const win = usage?.contextWindow ?? modelObj?.contextWindow ?? 0;
		const ctxRaw = `${pct.toFixed(0)}%/${fmtTokens(win)}`;
		const ctxColored = renderContextUsage(pct, win, theme);

		// OpenRouter stats — only when provider matches and stats are loaded.
		const orStats = provider === "openrouter" ? orPoller?.get() ?? null : null;
		const orRendered = orStats ? renderOpenRouterStats(orStats, theme) : null;

		// Extension statuses; ponytail's is noise in the footer.
		const statuses = [...(footerData?.getExtensionStatuses() ?? new Map<string, string>())]
			.filter(([key, text]) => key !== "ponytail" && text)
			.map(([key, text]) => (key === "pi-automode" ? renderAutomodeStatus(text, theme) : text));
		const statusesWidth = statuses.reduce((w, t) => w + sepW + visibleWidth(t), 0);

		// Layout: compute path budget from remaining space
		const orWidth = orRendered ? sepW + orRendered.rawWidth : 0;
		const rightBlockWidth = visibleWidth(ctxRaw) + sepW + model.rawWidth + orWidth + statusesWidth;
		const pathBudget = width - pillW - sepW - rightBlockWidth - sepW;
		const pathDisplay = renderPath(pathRaw, pathBudget, theme);

		// Assemble
		const segments: string[] = pill ? [pill] : [];
		if (pathDisplay) segments.push(pathDisplay);
		segments.push(ctxColored);
		segments.push(model.text);
		if (orRendered) segments.push(orRendered.text);
		segments.push(...statuses);

		return truncateToWidth(segments.join(sep), width);
	}


}
