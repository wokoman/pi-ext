/**
 * fzf-style Fuzzy Scoring Engine
 *
 * Ported from Code Telescope's score-engine.ts with adaptations for terminal.
 * Supports subsequence matching with smart scoring:
 *   - Consecutive character bonus
 *   - Word boundary bonus (/, \, _, -, ., space)
 *   - Filename start bonus (after last /)
 *   - Path start bonus
 *   - camelCase boundary bonus
 */

import type { ScoredItem } from "./types.js";

function isWordBoundary(text: string, idx: number): boolean {
	if (idx === 0) return true;
	const prev = text.charCodeAt(idx - 1);
	return (
		prev === 47 || // /
		prev === 92 || // \
		prev === 95 || // _
		prev === 45 || // -
		prev === 46 || // .
		prev === 32    // space
	);
}

function isUpperCase(text: string, idx: number): boolean {
	const code = text.charCodeAt(idx);
	return code >= 65 && code <= 90;
}

/**
 * Compute the best fuzzy match for a query against text.
 * Returns score and matched character indices.
 *
 * Uses a beam-search approach: for each query character, explore
 * all possible positions in text, keeping the top N candidates.
 */
function computeBestMatch(
	lowerQuery: string,
	text: string,
): { score: number; indices: number[] } {
	const queryLen = lowerQuery.length;
	const textLen = text.length;

	if (queryLen === 0) return { score: 0, indices: [] };
	if (queryLen > textLen) return { score: -Infinity, indices: [] };

	const lowerText = text.toLowerCase();
	const filenameStart = text.lastIndexOf("/") + 1;

	type State = { score: number; lastIdx: number; indices: number[] };

	let beam: State[] = [{ score: 0, lastIdx: -1, indices: [] }];

	for (let qi = 0; qi < queryLen; qi++) {
		const char = lowerQuery[qi];
		const nextBeam: State[] = [];

		for (const state of beam) {
			let searchFrom = state.lastIdx + 1;

			while (searchFrom < textLen) {
				const foundIdx = lowerText.indexOf(char!, searchFrom);
				if (foundIdx === -1) break;

				const distance = foundIdx - state.lastIdx;
				let localScore = 0;

				// Consecutive bonus / gap penalty
				if (qi > 0) {
					if (distance === 1) {
						localScore += 15;
					} else {
						localScore -= Math.min(distance, 15);
					}
				}

				// Position bonuses
				if (foundIdx === 0) localScore += 20;
				if (foundIdx === filenameStart) localScore += 50;
				if (isWordBoundary(text, foundIdx)) localScore += 15;
				if (isUpperCase(text, foundIdx)) localScore += 5;

				nextBeam.push({
					score: state.score + localScore,
					lastIdx: foundIdx,
					indices: [...state.indices, foundIdx],
				});

				searchFrom = foundIdx + 1;
			}
		}

		if (nextBeam.length === 0) return { score: -Infinity, indices: [] };

		// Deduplicate: keep best score per lastIdx
		const bestByIdx = new Map<number, State>();
		for (const s of nextBeam) {
			const existing = bestByIdx.get(s.lastIdx);
			if (!existing || s.score > existing.score) {
				bestByIdx.set(s.lastIdx, s);
			}
		}

		const candidates = Array.from(bestByIdx.values());
		candidates.sort((a, b) => b.score - a.score);
		beam = candidates.slice(0, 30); // beam width
	}

	return beam[0] ?? { score: -Infinity, indices: [] };
}

/**
 * Check if query is a subsequence of text (case-insensitive).
 */
export function isSubsequence(query: string, text: string): boolean {
	if (query.length > text.length) return false;
	const lq = query.toLowerCase();
	const lt = text.toLowerCase();
	let qi = 0;
	for (let i = 0; i < lt.length && qi < lq.length; i++) {
		if (lt[i] === lq[qi]) qi++;
	}
	return qi === lq.length;
}

/**
 * Score and match a query against text.
 * Returns { score, indices } where score is -Infinity for no match.
 */
export function computeMatch(
	query: string,
	text: string,
): { score: number; indices: number[] } {
	if (!query) return { score: 0, indices: [] };
	if (!text) return { score: -Infinity, indices: [] };
	return computeBestMatch(query.toLowerCase(), text);
}

/**
 * Filter and score a list of items against a query.
 * Returns items sorted by score (best first), with match indices.
 */
export function filterAndScore<T>(
	items: T[],
	query: string,
	getText: (item: T) => string,
	limit = 5000,
): ScoredItem<T>[] {
	if (!query) {
		return items.slice(0, limit).map((item) => ({
			item,
			score: 0,
			indices: [],
		}));
	}

	const lowerQuery = query.toLowerCase();
	const results: ScoredItem<T>[] = [];

	// Pre-filter with fast subsequence check, then score matches
	for (const item of items) {
		const text = getText(item);
		if (!isSubsequence(query, text)) continue;

		const { score, indices } = computeBestMatch(lowerQuery, text);
		if (score > -Infinity) {
			results.push({ item, score, indices });
		}

		if (results.length >= limit) break;
	}

	// Sort by score descending
	results.sort((a, b) => b.score - a.score);

	return results;
}
