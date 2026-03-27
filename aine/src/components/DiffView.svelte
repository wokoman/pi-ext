<script lang="ts">
  import { selectedPath, renderOptions, fileThreads, threads, commentsPanelVisible } from "../lib/state";
  import type { RenderOptions, Thread } from "../lib/state";
  import { fetchDiff, createThread, editThread, fetchThreads, updateThreadStatus, deleteThread } from "../lib/api";
  import {
    getShadow,
    updateGutterHighlights,
    highlightCommentedLines,
    applyHoverHighlight,
    measureLineBottom,
    getLineTopInScroll,
  } from "../lib/diff-highlights";
  import CommentInput from "./CommentInput.svelte";

  let diffViewEl: HTMLDivElement;
  let diffOutEl: HTMLDivElement;

  let loading = $state(false);
  let showSpinner = $state(false);
  let spinnerTimer: ReturnType<typeof setTimeout> | null = null;
  let errorMsg = $state<string | null>(null);
  let currentHtml = $state<string | null>(null);

  // Comment state
  let commentStartLine = $state<number | null>(null);
  let commentEndLine = $state<number | null>(null);
  let commentSide = $state<"old" | "new">("new");
  let commentBody = $state("");
  let editingThreadId = $state<string | null>(null);
  let commentInputTop = $state<number | null>(null);
  let commentInputEl = $state<CommentInput>();

  let shadowHost: HTMLDivElement | null = null;

  // ── Client-side LRU cache ──────────────────────────────────

  const CLIENT_CACHE_MAX = 100;
  let clientCache = new Map<string, string>();

  function cacheKey(path: string, opts: RenderOptions): string {
    return `${path}\0${opts.diffStyle}:${opts.expandUnchanged}:${opts.ignoreWhitespace}`;
  }

  function cacheGet(path: string): string | undefined {
    const key = cacheKey(path, $renderOptions);
    const val = clientCache.get(key);
    if (val === undefined) return undefined;
    clientCache.delete(key);
    clientCache.set(key, val);
    return val;
  }

  function cacheSet(path: string, html: string) {
    const key = cacheKey(path, $renderOptions);
    if (clientCache.has(key)) clientCache.delete(key);
    clientCache.set(key, html);
    while (clientCache.size > CLIENT_CACHE_MAX) {
      const first = clientCache.keys().next().value!;
      clientCache.delete(first);
    }
  }

  export function clearCache() { clientCache.clear(); }

  let abortController: AbortController | null = null;
  let pickRaf: number | null = null;
  let retried = false;

  // ── Hunk navigation ────────────────────────────────────────

  interface Hunk { y: number; height: number; }
  let hunkCache: Hunk[] | null = null;
  let hunkIdx = -1;
  let hunkMarkerY = $state(0);
  let hunkBadgeText = $state("");
  let hunkVisible = $state(false);
  let hunkFadeTimer: ReturnType<typeof setTimeout> | null = null;

  function resetHunks() {
    hunkCache = null;
    hunkIdx = -1;
    hunkVisible = false;
    if (hunkFadeTimer) clearTimeout(hunkFadeTimer);
  }

  function buildHunkCache(): Hunk[] {
    const shadow = getShadow(diffOutEl);
    if (!shadow) return [];
    const all = shadow.querySelectorAll(
      '[data-line-type="change-addition"], [data-line-type="change-deletion"]',
    );
    if (!all.length) return [];

    const viewRect = diffViewEl.getBoundingClientRect();
    const scrollTop = diffViewEl.scrollTop;
    const seen = new Set<number>();
    const rows: { y: number; h: number }[] = [];
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      const absY = rect.top - viewRect.top + scrollTop;
      const bucket = Math.round(absY / 4) * 4;
      if (!seen.has(bucket)) {
        seen.add(bucket);
        rows.push({ y: absY, h: rect.height });
      }
    }
    rows.sort((a, b) => a.y - b.y);

    const hunks: Hunk[] = [];
    let hy = rows[0].y;
    let hEnd = rows[0].y + rows[0].h;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].y - hEnd > 30) {
        hunks.push({ y: hy, height: hEnd - hy });
        hy = rows[i].y;
      }
      hEnd = rows[i].y + rows[i].h;
    }
    hunks.push({ y: hy, height: hEnd - hy });
    return hunks;
  }

  // ── Public API (called from App.svelte) ─────────────────────

  export function scrollTo(position: "top" | "bottom") {
    if (!diffViewEl) return;
    diffViewEl.scrollTo({ top: position === "top" ? 0 : diffViewEl.scrollHeight });
  }

  export function scrollBy(amount: number, smooth = true) {
    if (!diffViewEl) return;
    diffViewEl.scrollBy({ top: amount, behavior: smooth ? "smooth" : "auto" });
  }

  export function getScrollHeight(): number {
    return diffViewEl?.clientHeight ?? 0;
  }

  export function navigateHunk(dir: 1 | -1) {
    if (!hunkCache) hunkCache = buildHunkCache();
    const hunks = hunkCache;
    if (!hunks.length) return;
    let next = hunkIdx + dir;
    if (next < 0) next = 0;
    if (next >= hunks.length) next = hunks.length - 1;
    if (next === hunkIdx && hunkIdx >= 0) return;
    hunkIdx = next;
    const hunk = hunks[hunkIdx];
    diffViewEl.scrollTo({ top: Math.max(0, hunk.y - 60) });
    hunkMarkerY = hunk.y;
    hunkBadgeText = `${hunkIdx + 1} / ${hunks.length}`;
    hunkVisible = true;
    if (hunkFadeTimer) clearTimeout(hunkFadeTimer);
    hunkFadeTimer = setTimeout(() => { hunkVisible = false; }, 2000);
  }

  export function getLineTop(lineNumber: number): number | null {
    const shadow = getShadow(diffOutEl);
    if (!shadow || !diffViewEl) return null;
    return getLineTopInScroll(shadow, diffViewEl, lineNumber);
  }

  export function getScrollEl(): HTMLElement | null {
    return diffViewEl ?? null;
  }

  export function highlightLines(startLine: number, endLine: number) {
    hoverHighlightLines = { start: startLine, end: endLine };
    const shadow = getShadow(diffOutEl);
    if (shadow) applyHoverHighlight(shadow, diffViewEl, hoverHighlightLines, $fileThreads);
  }

  export function clearHighlightLines() {
    hoverHighlightLines = null;
    const shadow = getShadow(diffOutEl);
    if (shadow) applyHoverHighlight(shadow, diffViewEl, null, $fileThreads);
  }

  // ── Comment helpers ────────────────────────────────────────

  function commentLineRange(): { start: number; end: number } | null {
    if (commentStartLine === null) return null;
    const a = commentStartLine;
    const b = commentEndLine ?? a;
    return { start: Math.min(a, b), end: Math.max(a, b) };
  }

  export function openCommentAtLine(line: number, side: "old" | "new" = "new", shift = false) {
    if (shift && commentStartLine !== null && editingThreadId === null) {
      commentEndLine = line;
    } else {
      commentStartLine = line;
      commentEndLine = line;
      commentSide = side;
      commentBody = "";
      editingThreadId = null;
    }
    requestAnimationFrame(() => {
      positionInputAtLine();
      const shadow = getShadow(diffOutEl);
      if (shadow) updateGutterHighlights(shadow, commentLineRange());
      commentInputEl?.focus();
    });
  }

  function positionInputAtLine() {
    const range = commentLineRange();
    if (!range) { commentInputTop = null; return; }
    const shadow = getShadow(diffOutEl);
    if (!shadow || !diffViewEl) { commentInputTop = null; return; }
    const y = measureLineBottom(shadow, diffViewEl, range.end);
    commentInputTop = y ?? null;
    if (commentInputTop !== null) {
      requestAnimationFrame(() => {
        const viewH = diffViewEl.clientHeight;
        const scrollTop = diffViewEl.scrollTop;
        const inputBottom = (commentInputTop ?? 0) + 140;
        if (inputBottom > scrollTop + viewH) {
          diffViewEl.scrollTo({ top: inputBottom - viewH + 20, behavior: "smooth" });
        }
      });
    }
  }

  async function handleSubmitComment(text: string) {
    const range = commentLineRange();
    if (!text || !$selectedPath || !range) return;

    if (editingThreadId) {
      await editThread(editingThreadId, text);
    } else {
      await createThread({
        file: $selectedPath,
        startLine: range.start, endLine: range.end,
        side: commentSide, body: text,
        author: { name: "user", type: "user" },
      });
    }

    resetComment();
    $threads = await fetchThreads();
    invalidateAndReload();
  }

  function resetComment() {
    commentStartLine = null;
    commentEndLine = null;
    commentBody = "";
    editingThreadId = null;
    commentInputTop = null;
    const shadow = getShadow(diffOutEl);
    if (shadow) updateGutterHighlights(shadow, null);
  }

  export function startEdit(threadId: string) {
    const thread = $fileThreads.find(t => t.id === threadId);
    if (!thread) return;
    editingThreadId = threadId;
    commentStartLine = thread.startLine;
    commentEndLine = thread.endLine;
    commentSide = thread.side;
    commentBody = thread.comments[0]?.body ?? "";
    requestAnimationFrame(() => {
      positionInputAtLine();
      const shadow = getShadow(diffOutEl);
      if (shadow) updateGutterHighlights(shadow, commentLineRange());
      commentInputEl?.focus();
    });
  }

  // ── Gutter click / hover ───────────────────────────────────

  function handleDiffClick(e: MouseEvent) {
    const shadow = getShadow(diffOutEl);
    if (!shadow) return;
    for (const el of e.composedPath()) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.hasAttribute("data-line-number-content")) {
        const text = el.textContent?.trim();
        if (text && /^\d+$/.test(text)) {
          e.preventDefault();
          openCommentAtLine(parseInt(text), "new", e.shiftKey);
          return;
        }
      }
      const colNum = el.getAttribute("data-column-number");
      if (colNum && el.closest("[data-gutter]")) {
        const line = parseInt(colNum);
        if (line > 0) { e.preventDefault(); openCommentAtLine(line, "new", e.shiftKey); return; }
      }
    }
  }

  // Legacy props (kept for API compat, no longer wired)
  let { onThreadHover, onThreadLeave }: {
    onThreadHover?: (threadId: string) => void;
    onThreadLeave?: () => void;
  } = $props();

  let hoverHighlightLines: { start: number; end: number } | null = null;
  let lastHoveredThreadId: string | null = null;

  function handleDiffMouseOver(e: MouseEvent) {
    if (!onThreadHover) return;
    const shadow = getShadow(diffOutEl);
    if (!shadow) return;
    let lineNum: number | null = null;
    for (const el of e.composedPath()) {
      if (!(el instanceof HTMLElement)) continue;
      const colNum = el.getAttribute("data-column-number");
      if (colNum) { lineNum = parseInt(colNum); break; }
      const dataLine = el.getAttribute("data-line");
      if (dataLine) { lineNum = parseInt(dataLine); break; }
    }
    if (lineNum && lineNum > 0) {
      const thread = $fileThreads.find(t => lineNum! >= t.startLine && lineNum! <= t.endLine);
      if (thread) {
        if (lastHoveredThreadId !== thread.id) { lastHoveredThreadId = thread.id; onThreadHover(thread.id); }
        return;
      }
    }
    if (lastHoveredThreadId !== null) { lastHoveredThreadId = null; onThreadLeave?.(); }
  }

  // ── Thread annotation / invalidation ───────────────────────

  function invalidateAndReload() {
    if (!$selectedPath) return;
    clientCache.delete(cacheKey($selectedPath, $renderOptions));
    loadDiff($selectedPath);
  }

  function getAvatarColor(author: { name: string; type: string }): string {
    if (author.type === "agent") return "#89b4fa";
    const colors = ["#cba6f7", "#f9e2af", "#a6e3a1", "#f38ba8", "#89dceb", "#fab387"];
    let hash = 0;
    for (let i = 0; i < author.name.length; i++) {
      hash = author.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  function relativeTime(iso: string): string {
    const now = Date.now();
    const then = new Date(iso).getTime();
    const diffMs = now - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "1d ago";
    return `${days}d ago`;
  }

  function lineLabel(thread: Thread): string {
    return thread.startLine === thread.endLine
      ? `L${thread.startLine}`
      : `L${thread.startLine}–${thread.endLine}`;
  }

  function createInlineCard(thread: Thread): HTMLElement {
    const comment = thread.comments[0];
    const author = comment?.author ?? { name: "user", type: "user" };
    const accentColor = getAvatarColor(author);
    const isResolved = thread.status === "resolved";
    const bodyText = (comment?.body ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const replyCount = thread.comments.length - 1;

    const card = document.createElement("div");
    card.setAttribute("data-thread-card", "");
    card.setAttribute("slot", `annotation-additions-${thread.endLine}`);

    // ── Consistent layout for ALL comments ──
    // [3px accent] [author(colored)]  [body text]  ... [time] [actions]
    // Body wraps naturally. Max 4 lines, expand on hover.
    card.style.cssText = `
      display:flex; align-items:stretch;
      background:#1a1825;
      border-top:1px solid #262335; border-bottom:1px solid #262335;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
      cursor:default;
      ${isResolved ? "opacity:0.35;" : ""}
      transition: background 0.1s, opacity 0.1s;
    `;

    card.innerHTML = `
      <div style="width:3px;flex-shrink:0;background:${accentColor};border-radius:2px 0 0 2px;"></div>
      <div style="flex:1;min-width:0;padding:3px 10px;">
        <div style="display:flex;align-items:baseline;gap:0;line-height:1.4;">
          <span style="color:${accentColor};font-size:11px;font-weight:600;white-space:nowrap;flex-shrink:0;">${author.name}</span>
          ${replyCount > 0 ? `<span style="color:#585b70;font-size:10px;margin-left:5px;flex-shrink:0;">+${replyCount}</span>` : ''}
          <span style="flex:1;"></span>
          <span style="color:#45475a;font-size:10px;white-space:nowrap;flex-shrink:0;">${relativeTime(thread.createdAt)}</span>
          ${isResolved ? '<span style="color:#a6e3a1;font-size:10px;margin-left:5px;flex-shrink:0;">✓</span>' : ''}
          <span class="aic-actions" style="display:inline-flex;align-items:center;gap:1px;margin-left:4px;opacity:0;transition:opacity 0.1s;">
            ${!isResolved ? `<button style="background:none;border:none;color:#45475a;cursor:pointer;font-size:11px;padding:1px 3px;border-radius:2px;" data-action="edit" title="Edit"
              onmouseover="this.style.color='#cdd6f4'" onmouseout="this.style.color='#45475a'">✎</button>` : ''}
            <button style="background:none;border:none;color:#45475a;cursor:pointer;font-size:11px;padding:1px 3px;border-radius:2px;" data-action="resolve" title="${isResolved ? 'Reopen' : 'Resolve'}"
              onmouseover="this.style.color='#a6e3a1'" onmouseout="this.style.color='#45475a'">${isResolved ? '↩' : '✓'}</button>
            <button style="background:none;border:none;color:#45475a;cursor:pointer;font-size:11px;padding:1px 3px;border-radius:2px;" data-action="delete" title="Delete"
              onmouseover="this.style.color='#f38ba8'" onmouseout="this.style.color='#45475a'">×</button>
          </span>
        </div>
        <div class="aic-body" style="
          font-size:12px; color:#bac2de; line-height:1.45;
          word-break:break-word; white-space:pre-wrap;
          max-height:calc(1.45em * 3); overflow:hidden;
          transition: max-height 0.15s ease;
        ">${bodyText}</div>
      </div>
    `;

    // Hover: reveal actions, expand long body
    card.addEventListener("mouseenter", () => {
      card.style.background = "#1e1b2e";
      if (isResolved) card.style.opacity = "0.7";
      const acts = card.querySelector(".aic-actions") as HTMLElement;
      if (acts) acts.style.opacity = "1";
      const body = card.querySelector(".aic-body") as HTMLElement;
      if (body) body.style.maxHeight = "none";
    });
    card.addEventListener("mouseleave", () => {
      card.style.background = "#1a1825";
      if (isResolved) card.style.opacity = "0.35";
      const acts = card.querySelector(".aic-actions") as HTMLElement;
      if (acts) acts.style.opacity = "0";
      const body = card.querySelector(".aic-body") as HTMLElement;
      if (body) body.style.maxHeight = "calc(1.5em * 3)";
    });

    card.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("[data-action]");
      if (!btn) return;
      e.stopPropagation();
      const action = btn.getAttribute("data-action");
      if (action === "edit") startEdit(thread.id);
      else if (action === "resolve") handleResolveInline(thread.id);
      else if (action === "delete") handleDeleteInline(thread.id);
    });

    return card;
  }

  async function handleResolveInline(threadId: string) {
    const thread = $fileThreads.find(t => t.id === threadId);
    if (!thread) return;
    const next = thread.status === "resolved" ? "open" : "resolved";
    await updateThreadStatus(threadId, next);
    $threads = await fetchThreads();
    invalidateAndReload();
  }

  async function handleDeleteInline(threadId: string) {
    await deleteThread(threadId);
    $threads = await fetchThreads();
    invalidateAndReload();
  }

  function slotThreadCards() {
    if (!shadowHost) return;
    // Remove old cards
    for (const el of [...shadowHost.children]) {
      if (el.hasAttribute("data-thread-card")) el.remove();
    }
    const shadow = getShadow(diffOutEl);
    if (shadow) highlightCommentedLines(shadow, $fileThreads);

    // Insert inline comment cards if visible
    if (!$commentsPanelVisible) return;
    for (const thread of $fileThreads) {
      shadowHost.appendChild(createInlineCard(thread));
    }
  }

  $effect(() => {
    const _ = [$fileThreads, $commentsPanelVisible];
    if (currentHtml && shadowHost) requestAnimationFrame(() => slotThreadCards());
  });

  // ── Render ────────────────────────────────────────────────────

  function clearSpinnerTimer() {
    if (spinnerTimer) { clearTimeout(spinnerTimer); spinnerTimer = null; }
  }

  function renderHtml(html: string) {
    resetHunks();
    clearSpinnerTimer();
    showSpinner = false;
    resetComment();

    const wrapper = document.createElement("div");
    wrapper.style.colorScheme = "dark";
    const shadow = wrapper.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>
      .aine-highlighted-line { background: rgba(203, 166, 247, 0.05) !important; }
      .aine-gutter-sel {
        color: #cba6f7 !important;
        background: rgba(203, 166, 247, 0.15) !important;
        border-radius: 2px;
      }
      slot[name^="annotation-"] { display: block; margin: 0; padding: 0; }
      ::slotted([data-thread-card]) { display: block; margin: 0; padding: 0; }
      ::slotted(.aine-inline-comment) {
        display: block;
        margin: 0;
        padding: 4px 8px 4px 12px;
        background: var(--sidebar, #15131e);
        border-top: 1px solid var(--border, #313244);
        border-bottom: 1px solid var(--border, #313244);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        cursor: default;
        transition: background 0.12s;
      }
      ::slotted(.aine-inline-comment:hover) {
        background: var(--hover, #2a2440);
      }
      ::slotted(.aine-resolved) {
        opacity: 0.4;
      }
      ::slotted(.aine-resolved:hover) {
        opacity: 0.7;
      }
    </style>` + html;

    diffOutEl.style.opacity = "0";
    diffOutEl.innerHTML = "";
    diffOutEl.appendChild(wrapper);
    shadowHost = wrapper;
    diffViewEl.scrollTop = 0;

    void diffOutEl.offsetWidth;
    diffOutEl.style.transition = "opacity 80ms ease-out";
    diffOutEl.style.opacity = "1";
    const cleanup = () => { diffOutEl.style.transition = ""; diffOutEl.style.opacity = ""; diffOutEl.removeEventListener("transitionend", cleanup); };
    diffOutEl.addEventListener("transitionend", cleanup);

    requestAnimationFrame(() => slotThreadCards());
  }

  async function loadDiff(path: string) {
    const cached = cacheGet(path);
    if (cached) {
      currentHtml = path;
      loading = false;
      showSpinner = false;
      clearSpinnerTimer();
      errorMsg = null;
      renderHtml(cached);
      return;
    }

    resetHunks();
    loading = true;
    errorMsg = null;
    clearSpinnerTimer();
    showSpinner = false;

    if (currentHtml && diffOutEl) {
      diffOutEl.style.transition = "opacity 100ms ease-out";
      diffOutEl.style.opacity = "0.4";
    }

    spinnerTimer = setTimeout(() => {
      if (loading) { showSpinner = true; currentHtml = null; }
    }, 200);

    if (abortController) abortController.abort();
    const abort = new AbortController();
    abortController = abort;

    try {
      if ($threads.length === 0) $threads = await fetchThreads();
      const data = await fetchDiff(path, abort.signal);
      if ($selectedPath !== path) return;
      if (data?.html) {
        cacheSet(path, data.html);
        currentHtml = path;
        loading = false;
        renderHtml(data.html);
      } else {
        loading = false; showSpinner = false; clearSpinnerTimer();
        currentHtml = null; errorMsg = "No changes";
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      if ($selectedPath !== path) return;
      if (!retried) {
        retried = true;
        setTimeout(() => { retried = false; if ($selectedPath === path) loadDiff(path); }, 400);
        return;
      }
      retried = false; loading = false; showSpinner = false; clearSpinnerTimer();
      currentHtml = null; errorMsg = e.message;
    }
  }

  $effect(() => {
    const path = $selectedPath;
    if (!path) {
      loading = false; showSpinner = false; clearSpinnerTimer();
      errorMsg = null; currentHtml = null;
      resetComment();
      return;
    }
    if (pickRaf) cancelAnimationFrame(pickRaf);
    pickRaf = requestAnimationFrame(() => {
      pickRaf = null;
      if ($selectedPath === path) loadDiff(path);
    });
    return () => {
      clearSpinnerTimer();
      if (pickRaf) cancelAnimationFrame(pickRaf);
      if (abortController) abortController.abort();
    };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_mouse_events_have_key_events -->
<div id="diff-view" bind:this={diffViewEl} onclick={handleDiffClick} onmouseover={handleDiffMouseOver}>
  <div id="hunk-marker" class:visible={hunkVisible} style="top:{hunkMarkerY}px"></div>
  <div id="hunk-badge" class:visible={hunkVisible}>{hunkBadgeText}</div>

  {#if showSpinner}
    <div class="empty spinner-fade"><span class="loading-spinner"></span> Loading…</div>
  {:else if errorMsg}
    <div class="empty err">{errorMsg}</div>
  {:else if !currentHtml && !$selectedPath}
    <div class="empty">Select a file</div>
  {/if}

  <div id="diff-out" bind:this={diffOutEl} style:display={currentHtml ? "" : "none"}></div>

  {#if commentStartLine !== null && $selectedPath && commentInputTop !== null}
    {@const range = commentLineRange()}
    {#if range}
      <CommentInput
        bind:this={commentInputEl}
        startLine={range.start}
        endLine={range.end}
        bind:body={commentBody}
        isEdit={editingThreadId !== null}
        top={commentInputTop}
        onSubmit={handleSubmitComment}
        onCancel={resetComment}
      />
    {/if}
  {/if}
</div>

<style>
  #diff-view { flex: 1; overflow: auto; background: var(--bg); position: relative; }
  #diff-out { min-height: 100%; }
  .spinner-fade { animation: fadeIn 0.15s ease-out; }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
  .empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--muted); font-size: 13px; }
  .empty.err { color: var(--del); }
  .loading-spinner {
    display: inline-block; width: 16px; height: 16px;
    border: 2px solid var(--border); border-top-color: var(--accent);
    border-radius: 50%; animation: spin 0.6s linear infinite; margin-right: 8px;
  }
  @keyframes spin { to { transform: rotate(360deg) } }
  #hunk-marker {
    position: absolute; left: 0; right: 0; height: 2px;
    background: #fab387; pointer-events: none; z-index: 10;
    opacity: 0; transition: opacity 0.4s;
  }
  #hunk-marker.visible { opacity: 1; }
  #hunk-badge {
    position: absolute; top: 8px; right: 14px;
    background: var(--sidebar); border: 1px solid var(--border);
    color: var(--accent); padding: 2px 8px; border-radius: 4px;
    font-size: 11px; font-family: "JetBrains Mono", "SF Mono", monospace;
    pointer-events: none; z-index: 10; opacity: 0; transition: opacity 0.3s;
  }
  #hunk-badge.visible { opacity: 1; }
</style>
