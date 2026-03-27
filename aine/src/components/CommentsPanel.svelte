<script lang="ts">
  import { onMount } from "svelte";
  import { fileThreads, threads, selectedPath } from "../lib/state";
  import type { Thread } from "../lib/state";
  import { fetchThreads, updateThreadStatus, deleteThread } from "../lib/api";

  interface Props {
    visible: boolean;
    onEditThread: (threadId: string) => void;
    onScrollToLine: (line: number) => void;
    onHighlightLines: (startLine: number, endLine: number) => void;
    onClearHighlight: () => void;
    getLineTop: (line: number) => number | null;
    getDiffScrollEl: () => HTMLElement | null;
  }

  let {
    visible,
    onEditThread,
    onScrollToLine,
    onHighlightLines,
    onClearHighlight,
    getLineTop,
    getDiffScrollEl,
  }: Props = $props();

  let openThreads = $derived($fileThreads.filter(t => t.status === "open"));
  let resolvedThreads = $derived($fileThreads.filter(t => t.status === "resolved"));
  let unresolvedCount = $derived(openThreads.length);

  /** Which thread id is currently "focused" (hovered in panel, or highlighted from diff) */
  let focusedThreadId = $state<string | null>(null);

  // Track card elements for scrolling into view
  let cardElements = new Map<string, HTMLElement>();

  // Computed card positions (top in px, keyed by thread id)
  let cardPositions = $state<Map<string, number>>(new Map());
  let panelListEl = $state<HTMLElement>();
  let totalHeight = $state(0);

  function getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
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

  function getAccentColor(author: { name: string; type: string }): string {
    if (author.type === "agent") return "#89b4fa";
    return "#cba6f7";
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
    if (days === 1) return "1 day ago";
    return `${days} days ago`;
  }

  function lineLabel(thread: Thread): string {
    return thread.startLine === thread.endLine
      ? `L${thread.startLine}`
      : `L${thread.startLine}–${thread.endLine}`;
  }

  async function handleResolve(threadId: string) {
    const thread = $fileThreads.find(t => t.id === threadId);
    if (!thread) return;
    const next = thread.status === "resolved" ? "open" : "resolved";
    await updateThreadStatus(threadId, next);
    $threads = await fetchThreads();
  }

  async function handleDelete(threadId: string) {
    await deleteThread(threadId);
    $threads = await fetchThreads();
  }

  function handleCardClick(thread: Thread) {
    onScrollToLine(thread.startLine);
  }

  function handleCardEnter(thread: Thread) {
    focusedThreadId = thread.id;
    onHighlightLines(thread.startLine, thread.endLine);
  }

  function handleCardLeave() {
    focusedThreadId = null;
    onClearHighlight();
  }

  export function highlightThread(threadId: string) {
    focusedThreadId = threadId;
    const el = cardElements.get(threadId);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  export function clearHighlight() {
    focusedThreadId = null;
  }

  function trackCard(node: HTMLElement, threadId: string) {
    cardElements.set(threadId, node);
    return { destroy() { cardElements.delete(threadId); } };
  }

  // ── Position cards aligned to diff lines ──────────────────

  let headerEl = $state<HTMLElement>();

  function recalcPositions() {
    const allThreads = [...openThreads, ...resolvedThreads];
    if (allThreads.length === 0) { cardPositions = new Map(); totalHeight = 0; return; }

    // The panel header sits above the scroll area, offsetting it vs the diff-view.
    // Subtract header height so cards align with diff lines.
    const headerOffset = headerEl?.offsetHeight ?? 0;

    const MIN_GAP = 4;
    const positions = new Map<string, number>();
    let lastBottom = 0;

    // Sort threads by startLine
    const sorted = allThreads.slice().sort((a, b) => a.startLine - b.startLine);

    for (const thread of sorted) {
      let idealTop = getLineTop(thread.startLine);
      if (idealTop === null) idealTop = lastBottom + headerOffset;

      // Compensate for panel header
      idealTop = Math.max(0, idealTop - headerOffset);

      // Ensure cards don't overlap — push down if too close
      const top = Math.max(idealTop, lastBottom + MIN_GAP);
      positions.set(thread.id, top);

      // Estimate card height (~36px collapsed, will refine after render)
      const cardEl = cardElements.get(thread.id);
      const cardH = cardEl ? cardEl.offsetHeight : 36;
      lastBottom = top + cardH;
    }

    cardPositions = positions;
    totalHeight = lastBottom + 40;
  }

  // Sync scroll: panel follows diff
  function onDiffScroll() {
    const diffEl = getDiffScrollEl();
    if (!diffEl || !panelListEl) return;
    panelListEl.scrollTop = diffEl.scrollTop;
  }

  // Track the current scroll element to properly remove/add listeners
  let boundScrollEl: HTMLElement | null = null;

  function bindScrollSync() {
    const diffEl = getDiffScrollEl();
    if (diffEl === boundScrollEl) return; // already bound
    if (boundScrollEl) boundScrollEl.removeEventListener("scroll", onDiffScroll);
    boundScrollEl = diffEl;
    if (diffEl) diffEl.addEventListener("scroll", onDiffScroll, { passive: true });
  }

  // Recalc positions + rebind scroll on thread or file changes
  $effect(() => {
    const _ = [$fileThreads, $selectedPath];
    requestAnimationFrame(() => {
      bindScrollSync();
      requestAnimationFrame(() => recalcPositions());
    });
  });

  onMount(() => {
    bindScrollSync();
    setTimeout(() => recalcPositions(), 300);
    return () => {
      if (boundScrollEl) boundScrollEl.removeEventListener("scroll", onDiffScroll);
    };
  });
</script>

<div class="comments-panel" class:hidden={!visible}>
  <div class="cp-header" bind:this={headerEl}>
    <span class="cp-title">Comments</span>
    {#if unresolvedCount > 0}
      <span class="cp-unresolved">{unresolvedCount}</span>
    {/if}
  </div>

  <div class="cp-list" bind:this={panelListEl}>
    {#if $fileThreads.length === 0}
      <div class="cp-empty">
        <span class="cp-empty-hint">Click a line number to comment</span>
      </div>
    {:else}
      <div class="cp-canvas" style="height: {totalHeight}px">
        {#each [...openThreads, ...resolvedThreads] as thread (thread.id)}
          {@const comment = thread.comments[0]}
          {@const author = comment?.author ?? { name: "user", type: "user" }}
          {@const avatarColor = getAvatarColor(author)}
          {@const accent = getAccentColor(author)}
          {@const isFocused = focusedThreadId === thread.id}
          {@const isResolved = thread.status === "resolved"}
          {@const top = cardPositions.get(thread.id) ?? 0}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="cp-card"
            class:cp-card-focused={isFocused}
            class:cp-card-resolved={isResolved}
            style="--card-accent: {accent}; top: {top}px"
            onmouseenter={() => handleCardEnter(thread)}
            onmouseleave={handleCardLeave}
            onclick={() => handleCardClick(thread)}
            use:trackCard={thread.id}
          >
            <div class="cp-card-row">
              <span class="cp-dot" style="background: {avatarColor}"></span>
              <span class="cp-author">{author.name}</span>
              {#if isResolved}
                <span class="cp-resolved-badge">✓</span>
              {/if}
              <span class="cp-time">{relativeTime(thread.createdAt)}</span>
              <button class="cp-line-btn" title="Go to line {thread.startLine}">{lineLabel(thread)}</button>
            </div>
            <div class="cp-body">{comment?.body ?? ""}</div>
            <div class="cp-actions">
              {#if !isResolved}
                <button class="cp-action-btn" title="Edit" onclick={(e) => { e.stopPropagation(); onEditThread(thread.id); }}>✎</button>
              {/if}
              <button class="cp-action-btn" title={isResolved ? "Reopen" : "Resolve"} onclick={(e) => { e.stopPropagation(); handleResolve(thread.id); }}>{isResolved ? "↩" : "✓"}</button>
              <button class="cp-action-btn cp-action-del" title="Delete" onclick={(e) => { e.stopPropagation(); handleDelete(thread.id); }}>×</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .comments-panel {
    width: 260px;
    flex-shrink: 0;
    background: var(--sidebar);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: width 0.15s, opacity 0.15s;
  }
  .comments-panel.hidden {
    width: 0;
    opacity: 0;
    border-left: none;
  }

  .cp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .cp-title { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
  .cp-unresolved {
    font-size: 10px; color: #fab387; font-weight: 600;
    background: rgba(250, 179, 135, 0.1); border-radius: 8px; padding: 0 6px; line-height: 18px;
  }

  .cp-list {
    flex: 1;
    overflow-y: auto;
    position: relative;
  }

  .cp-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 12px;
    color: var(--muted);
    font-size: 11px;
  }
  .cp-empty-hint { opacity: 0.6; }

  .cp-canvas {
    position: relative;
    min-height: 100%;
  }

  /* ── Compact card ── */
  .cp-card {
    position: absolute;
    left: 4px;
    right: 4px;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
    padding: 4px 8px;
    transition: border-color 0.12s, background 0.12s, opacity 0.12s;
  }
  .cp-card:hover {
    border-color: var(--border);
    background: var(--hover);
  }
  .cp-card-focused {
    border-color: var(--card-accent, var(--accent)) !important;
    background: color-mix(in srgb, var(--card-accent, var(--accent)) 6%, var(--bg)) !important;
  }
  .cp-card-resolved { opacity: 0.4; }
  .cp-card-resolved:hover { opacity: 0.7; }

  /* ── Header row: dot · author · time · line ── */
  .cp-card-row {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .cp-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .cp-author {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 1;
    min-width: 0;
  }

  .cp-time {
    font-size: 10px;
    color: var(--muted);
    flex-shrink: 0;
    margin-left: auto;
  }

  .cp-line-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font-size: 9px;
    font-family: "JetBrains Mono", "SF Mono", monospace;
    padding: 0 3px;
    border-radius: 2px;
    line-height: 16px;
    opacity: 0.7;
    transition: opacity 0.12s, background 0.12s;
  }
  .cp-card:hover .cp-line-btn { opacity: 1; }
  .cp-line-btn:hover { background: rgba(203, 166, 247, 0.12); }

  .cp-resolved-badge {
    font-size: 9px;
    color: #a6e3a1;
    flex-shrink: 0;
    opacity: 0.8;
  }

  /* ── Body: collapsed to 1 line, expands on hover ── */
  .cp-body {
    font-size: 11px;
    color: var(--text);
    opacity: 0.8;
    line-height: 1.4;
    word-break: break-word;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-left: 11px;
    margin-top: 1px;
    transition: opacity 0.12s;
  }
  .cp-card:hover .cp-body {
    white-space: pre-wrap;
    overflow: visible;
    text-overflow: unset;
    opacity: 1;
  }

  /* ── Actions: only visible on hover ── */
  .cp-actions {
    display: flex;
    align-items: center;
    gap: 1px;
    padding-left: 11px;
    margin-top: 2px;
    height: 0;
    opacity: 0;
    overflow: hidden;
    transition: height 0.12s, opacity 0.12s, margin 0.12s;
  }
  .cp-card:hover .cp-actions {
    height: 18px;
    opacity: 1;
    margin-top: 2px;
  }

  .cp-action-btn {
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 11px;
    padding: 1px 4px;
    line-height: 1;
    border-radius: 2px;
    transition: color 0.12s, background 0.12s;
  }
  .cp-action-btn:hover { color: var(--text); background: var(--hover); }
  .cp-action-del:hover { color: var(--del); }
</style>
