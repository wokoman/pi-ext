/**
 * Shadow DOM highlight operations for the diff view.
 * Pure functions — no component state, just DOM manipulation.
 */

import type { Thread } from "../../types.js";

/** Get the ShadowRoot from the diff output container. */
export function getShadow(diffOutEl: HTMLElement | null): ShadowRoot | null {
  const wrapper = diffOutEl?.firstChild as HTMLElement | null;
  return wrapper?.shadowRoot ?? null;
}

// ── Gutter selection highlight (comment line range) ───────────

export function updateGutterHighlights(
  shadow: ShadowRoot,
  range: { start: number; end: number } | null,
) {
  shadow.querySelectorAll(".aine-gutter-sel").forEach(el =>
    el.classList.remove("aine-gutter-sel"),
  );
  if (!range) return;

  for (const el of shadow.querySelectorAll("[data-line-number-content]")) {
    const text = el.textContent?.trim();
    if (!text || !/^\d+$/.test(text)) continue;
    const n = parseInt(text);
    if (n >= range.start && n <= range.end) {
      (el as HTMLElement).classList.add("aine-gutter-sel");
    }
  }
}

// ── Commented lines: gutter stripe per thread ─────────────────

export function highlightCommentedLines(
  shadow: ShadowRoot,
  threads: Thread[],
) {
  // Clear old
  for (const el of shadow.querySelectorAll("[data-aine-comment-line]")) {
    (el as HTMLElement).style.boxShadow = "";
    (el as HTMLElement).style.background = "";
    el.removeAttribute("data-aine-comment-line");
  }

  // Build line → color map (agent=blue, user=purple)
  const lineColors = new Map<number, string>();
  for (const thread of threads) {
    const isAgent = thread.comments[0]?.author.type === "agent";
    const color = isAgent ? "#89b4fa" : "#cba6f7";
    for (let ln = thread.startLine; ln <= thread.endLine; ln++) {
      if (!lineColors.has(ln) || isAgent) lineColors.set(ln, color);
    }
  }
  if (lineColors.size === 0) return;

  // Gutter cells: left stripe
  for (const el of shadow.querySelectorAll("[data-line-type][data-column-number]")) {
    const ln = parseInt(el.getAttribute("data-column-number") || "0");
    const color = lineColors.get(ln);
    if (!color) continue;
    (el as HTMLElement).style.boxShadow = `inset 3px 0 0 0 ${color}`;
    el.setAttribute("data-aine-comment-line", "");
  }

  // Kill hunk separator box-shadow on commented + adjacent lines
  const killShadow = new Set<number>(lineColors.keys());
  for (const thread of threads) {
    killShadow.add(thread.startLine - 1);
    killShadow.add(thread.endLine + 1);
  }

  for (const el of shadow.querySelectorAll("[data-content] > [data-line]")) {
    const ln = parseInt(el.getAttribute("data-line") || "0");
    if (!killShadow.has(ln)) continue;
    (el as HTMLElement).style.boxShadow = "none";
    el.setAttribute("data-aine-comment-line", "");
  }

  for (const el of shadow.querySelectorAll("[data-line-type][data-column-number]")) {
    const ln = parseInt(el.getAttribute("data-column-number") || "0");
    if (lineColors.has(ln)) continue; // already styled with stripe
    if (!killShadow.has(ln)) continue;
    (el as HTMLElement).style.boxShadow = "none";
    el.setAttribute("data-aine-comment-line", "");
  }
}

// ── Hover highlight (from CommentsPanel card hover) ───────────

export function applyHoverHighlight(
  shadow: ShadowRoot,
  diffViewEl: HTMLElement,
  range: { start: number; end: number } | null,
  threads: Thread[],
) {
  // Clear previous
  for (const el of shadow.querySelectorAll("[data-aine-hover-hl]")) {
    (el as HTMLElement).style.background = "";
    (el as HTMLElement).style.outline = "";
    (el as HTMLElement).style.outlineOffset = "";
    (el as HTMLElement).style.boxShadow = "";
    el.removeAttribute("data-aine-hover-hl");
  }

  if (!range) {
    highlightCommentedLines(shadow, threads);
    return;
  }

  const { start, end } = range;
  const hoverBg = "rgba(203, 166, 247, 0.15)";
  const hoverStripe = "inset 3px 0 0 0 #cba6f7";

  for (const el of shadow.querySelectorAll("[data-line-type][data-column-number]")) {
    const ln = parseInt(el.getAttribute("data-column-number") || "0");
    if (ln >= start && ln <= end) {
      const s = (el as HTMLElement).style;
      s.background = hoverBg;
      s.boxShadow = hoverStripe;
      el.setAttribute("data-aine-hover-hl", "");
    }
  }

  for (const el of shadow.querySelectorAll("[data-content] > [data-line]")) {
    const ln = parseInt(el.getAttribute("data-line") || "0");
    if (ln >= start && ln <= end) {
      const s = (el as HTMLElement).style;
      s.background = hoverBg;
      s.boxShadow = "none";
      el.setAttribute("data-aine-hover-hl", "");
    }
  }

  // Scroll first highlighted line into view
  const firstEl = shadow.querySelector(`[data-content] > [data-line="${start}"]`);
  if (firstEl && diffViewEl) {
    const viewRect = diffViewEl.getBoundingClientRect();
    const elRect = firstEl.getBoundingClientRect();
    if (elRect.top < viewRect.top || elRect.bottom > viewRect.bottom) {
      firstEl.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
}

// ── Line position helpers ─────────────────────────────────────

/** Measure bottom Y of a line (relative to scroll container). */
export function measureLineBottom(
  shadow: ShadowRoot,
  diffViewEl: HTMLElement,
  lineNumber: number,
): number | null {
  for (const el of shadow.querySelectorAll("[data-column-number]")) {
    if (parseInt(el.getAttribute("data-column-number") || "0") === lineNumber) {
      const viewRect = diffViewEl.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return rect.bottom - viewRect.top + diffViewEl.scrollTop;
    }
  }
  return null;
}

/** Get top Y of a line (for CommentsPanel card alignment). */
export function getLineTopInScroll(
  shadow: ShadowRoot,
  diffViewEl: HTMLElement,
  lineNumber: number,
): number | null {
  const el = shadow.querySelector(`[data-content] > [data-line="${lineNumber}"]`);
  if (!el) return null;
  const viewRect = diffViewEl.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return elRect.top - viewRect.top + diffViewEl.scrollTop;
}
