/**
 * OpenRouter stats fetcher for the custom footer.
 *
 * Reads the API key from ~/.pi/agent/auth.json, polls /credits and /key
 * on a slow timer, exposes a snapshot for the renderer.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { renderBar, clampPct } from "./renderers.js";


export interface OpenRouterStats {
	totalCredits: number;
	totalUsage: number;
	usageDaily: number;
}

type ThemeFg = { fg: (role: any, text: string) => string };

const AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");
const POLL_MS = 60_000;

function readApiKey(): string | null {
	try {
		const data = JSON.parse(readFileSync(AUTH_PATH, "utf-8"));
		return data?.openrouter?.key ?? null;
	} catch {
		return null;
	}
}

async function fetchJSON(url: string, key: string): Promise<any> {
	const res = await fetch(url, {
		headers: { Authorization: `Bearer ${key}` },
		signal: AbortSignal.timeout(5000),
	});
	if (!res.ok) throw new Error(`${url} → ${res.status}`);
	return res.json();
}

export async function fetchOpenRouterStats(): Promise<OpenRouterStats | null> {
	const key = readApiKey();
if (!key) return null;
	try {
		const [credits, keyInfo] = await Promise.all([
			fetchJSON("https://openrouter.ai/api/v1/credits", key),
			fetchJSON("https://openrouter.ai/api/v1/key", key),
		]);
const totalCredits = Number(credits?.data?.total_credits ?? 0);
		const totalUsage = Number(credits?.data?.total_usage ?? 0);
		const usageDaily = Number(keyInfo?.data?.usage_daily ?? 0);
		return { totalCredits, totalUsage, usageDaily };
	} catch (e) {
return null;
	}
}

export interface OpenRouterPoller {
	get(): OpenRouterStats | null;
	stop(): void;
}

export function startOpenRouterPolling(onUpdate: () => void): OpenRouterPoller {
	let stats: OpenRouterStats | null = null;
	let stopped = false;

	const tick = async () => {
		const next = await fetchOpenRouterStats();
		if (stopped) return;
		// Only re-render if something changed.
		if (
			next?.totalCredits !== stats?.totalCredits ||
			next?.totalUsage !== stats?.totalUsage ||
			next?.usageDaily !== stats?.usageDaily
		) {
			stats = next;
			onUpdate();
		}
	};

	void tick();
	const handle = setInterval(tick, POLL_MS);
	if (typeof handle.unref === "function") handle.unref();

	return {
		get: () => stats,
		stop: () => {
			stopped = true;
			clearInterval(handle);
		},
	};
}

// ── Rendering ──────────────────────────────────────────────────────────

function fmtUSD(n: number): string {
	return `$${n.toFixed(2)}`;
}

export function renderOpenRouterStats(
	stats: OpenRouterStats,
	theme: ThemeFg,
): { text: string; rawWidth: number } {
	const remaining = Math.max(0, stats.totalCredits - stats.totalUsage);
	const usedPct = stats.totalCredits > 0
		? clampPct((stats.totalUsage / stats.totalCredits) * 100)
		: 0;

	const bar = renderBar(usedPct, theme);
	const balance = fmtUSD(remaining);
	const total = fmtUSD(stats.totalCredits);
	const today = fmtUSD(stats.usageDaily);

	// Color the balance by remaining %, not used %.
	const remainingPct = 100 - usedPct;
	const balanceRole =
		remainingPct < 10 ? "error" : remainingPct < 25 ? "warning" : "success";

	const text =
		theme.fg("dim", "◈ ") +
		bar +
		" " +
		theme.fg(balanceRole, balance) +
		theme.fg("muted", `/${total}`) +
		theme.fg("dim", " • ") +
		theme.fg("muted", `${today} today`);

	const rawWidth = `◈ ${"█".repeat(8)} ${balance}/${total} • ${today} today`.length;
	return { text, rawWidth };
}
