/**
 * Custom Footer Extension — Two-line compact powerline style
 *
 * Line 1:  MODE  ~/path (branch) │ 42%/200k │ ⚡ model • thinking
 * Line 2: Provider  S ████████ 23%  ⟳ 2h 14m  W ██████░░ 67%  ⟳ 3d 5h
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

function getGitBranch(cwd: string): string | null {
	try {
		return execSync("git branch --show-current", { cwd, encoding: "utf-8", timeout: 500 }).trim() || null;
	} catch {
		return null;
	}
}

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let currentMode: PermissionMode = "safe";
	let tuiRef: { requestRender(): void } | null = null;
	let gitBranch: string | null = null;
	let gitWatcher: FSWatcher | undefined;
	let orPoller: OpenRouterPoller | undefined;
	let currentModel: { provider?: string; id?: string; contextWindow?: number } | null | undefined = null;

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

		// Suppress default pi footer (empty render)
		ctx.ui.setFooter(() => ({
			render() { return []; },
			invalidate() {},
		}));
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
		const pill = renderModePill(currentMode, theme);
		const pillW = modePillWidth(currentMode);

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

		// Layout: compute path budget from remaining space
		const orWidth = orRendered ? sepW + orRendered.rawWidth : 0;
		const rightBlockWidth = visibleWidth(ctxRaw) + sepW + model.rawWidth + orWidth;
		const pathBudget = width - pillW - sepW - rightBlockWidth - sepW;
		const pathDisplay = renderPath(pathRaw, pathBudget, theme);

		// Assemble
		const segments: string[] = [pill];
		if (pathDisplay) segments.push(pathDisplay);
		segments.push(ctxColored);
		segments.push(model.text);
		if (orRendered) segments.push(orRendered.text);

		return truncateToWidth(segments.join(sep), width);
	}


}
