<script lang="ts">
  import { selectedPath, renderOptions } from "../lib/state";
  import type { RenderOptions } from "../lib/state";
  import { fetchDiff } from "../lib/api";

  let diffViewEl: HTMLDivElement;
  let diffOutEl: HTMLDivElement;

  let loading = $state(false);
  let errorMsg = $state<string | null>(null);
  let currentHtml = $state<string | null>(null);

  // Client-side LRU cache: (path + options) → html
  const CLIENT_CACHE_MAX = 100;
  let clientCache = new Map<string, string>();

  function cacheKey(path: string, opts: RenderOptions): string {
    return `${path}\0${opts.diffStyle}:${opts.expandUnchanged}:${opts.ignoreWhitespace}`;
  }

  function cacheGet(path: string): string | undefined {
    const key = cacheKey(path, $renderOptions);
    const val = clientCache.get(key);
    if (val === undefined) return undefined;
    // Move to end (most recently used)
    clientCache.delete(key);
    clientCache.set(key, val);
    return val;
  }

  function cacheSet(path: string, html: string) {
    const key = cacheKey(path, $renderOptions);
    if (clientCache.has(key)) clientCache.delete(key);
    clientCache.set(key, html);
    // Evict oldest entries over limit
    while (clientCache.size > CLIENT_CACHE_MAX) {
      const first = clientCache.keys().next().value!;
      clientCache.delete(first);
    }
  }

  let abortController: AbortController | null = null;
  let pickRaf: number | null = null;
  let retried = false;

  // Hunk navigation state
  interface Hunk {
    y: number;
    height: number;
  }
  let hunkCache: Hunk[] | null = null;
  let hunkIdx = -1;
  let hunkMarkerY = $state(0);
  let hunkBadgeText = $state("");
  let hunkVisible = $state(false);
  let hunkFadeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Clear all cached entries (used on refresh when file contents may have changed). */
  export function clearCache() {
    clientCache.clear();
  }

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
    const hunks = getHunks();
    if (!hunks.length) return;

    let next = hunkIdx + dir;
    if (next < 0) next = 0;
    if (next >= hunks.length) next = hunks.length - 1;
    if (next === hunkIdx && hunkIdx >= 0) return;

    hunkIdx = next;
    const hunk = hunks[hunkIdx];
    diffViewEl.scrollTo({ top: Math.max(0, hunk.y - 60) });
    showHunkUI(hunkIdx, hunks.length, hunk);
  }

  function resetHunks() {
    hunkCache = null;
    hunkIdx = -1;
    hunkVisible = false;
    if (hunkFadeTimer) clearTimeout(hunkFadeTimer);
  }

  function getHunks(): Hunk[] {
    if (!hunkCache) hunkCache = buildHunkCache();
    return hunkCache;
  }

  function buildHunkCache(): Hunk[] {
    const wrapper = diffOutEl?.firstChild as HTMLElement | null;
    if (!wrapper?.shadowRoot) return [];
    const all = wrapper.shadowRoot.querySelectorAll(
      '[data-line-type="change-addition"], [data-line-type="change-deletion"]'
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

  function showHunkUI(idx: number, total: number, hunk: Hunk) {
    hunkMarkerY = hunk.y;
    hunkBadgeText = `${idx + 1} / ${total}`;
    hunkVisible = true;
    if (hunkFadeTimer) clearTimeout(hunkFadeTimer);
    hunkFadeTimer = setTimeout(() => {
      hunkVisible = false;
    }, 2000);
  }

  function renderHtml(html: string) {
    resetHunks();
    const wrapper = document.createElement("div");
    wrapper.style.colorScheme = "dark";
    const shadow = wrapper.attachShadow({ mode: "open" });
    shadow.innerHTML = html;
    diffOutEl.innerHTML = "";
    diffOutEl.appendChild(wrapper);
    diffOutEl.classList.remove("fade-in");
    void diffOutEl.offsetWidth;
    diffOutEl.classList.add("fade-in");
    diffViewEl.scrollTop = 0;
  }

  async function loadDiff(path: string) {
    // Check client cache first (keyed by path + current render options)
    const cached = cacheGet(path);
    if (cached) {
      currentHtml = path;
      loading = false;
      errorMsg = null;
      renderHtml(cached);
      return;
    }

    resetHunks();
    loading = true;
    errorMsg = null;
    currentHtml = null;

    if (abortController) abortController.abort();
    const abort = new AbortController();
    abortController = abort;

    try {
      const data = await fetchDiff(path, abort.signal);
      if ($selectedPath !== path) return;
      if (data?.html) {
        cacheSet(path, data.html);
        currentHtml = path;
        loading = false;
        renderHtml(data.html);
      } else {
        loading = false;
        errorMsg = "No changes";
      }
    } catch (e: any) {
      if (e.name === "AbortError") return;
      if ($selectedPath !== path) return;
      if (!retried) {
        retried = true;
        setTimeout(() => {
          retried = false;
          if ($selectedPath === path) loadDiff(path);
        }, 400);
        return;
      }
      retried = false;
      loading = false;
      errorMsg = e.message;
    }
  }

  // React to selection changes
  $effect(() => {
    const path = $selectedPath;
    if (!path) {
      loading = false;
      errorMsg = null;
      currentHtml = null;
      return;
    }

    // Defer heavy work to next frame for rapid j/k navigation
    if (pickRaf) cancelAnimationFrame(pickRaf);
    pickRaf = requestAnimationFrame(() => {
      pickRaf = null;
      if ($selectedPath === path) loadDiff(path);
    });
  });
</script>

<div id="diff-view" bind:this={diffViewEl}>
  <div
    id="hunk-marker"
    class:visible={hunkVisible}
    style="top:{hunkMarkerY}px"
  ></div>
  <div id="hunk-badge" class:visible={hunkVisible}>
    {hunkBadgeText}
  </div>

  {#if loading}
    <div class="empty">
      <span class="loading-spinner"></span> Loading…
    </div>
  {:else if errorMsg}
    <div class="empty err">{errorMsg}</div>
  {:else if !currentHtml && !$selectedPath}
    <div class="empty">Select a file</div>
  {/if}

  <div
    id="diff-out"
    bind:this={diffOutEl}
    style:display={currentHtml ? "" : "none"}
  ></div>
</div>

<style>
  #diff-view {
    flex: 1;
    overflow: auto;
    background: var(--bg);
    position: relative;
  }
  #diff-out {
    min-height: 100%;
  }
  :global(#diff-out.fade-in) {
    animation: fadeIn 0.1s ease;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted);
    font-size: 13px;
  }
  .empty.err {
    color: var(--del);
  }
  .loading-spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    margin-right: 8px;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  #hunk-marker {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: #fab387;
    pointer-events: none;
    z-index: 10;
    opacity: 0;
    transition: opacity 0.4s;
  }
  #hunk-marker.visible {
    opacity: 1;
  }
  #hunk-badge {
    position: absolute;
    top: 8px;
    right: 14px;
    background: var(--sidebar);
    border: 1px solid var(--border);
    color: var(--accent);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-family: "JetBrains Mono", "SF Mono", monospace;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
    z-index: 10;
    opacity: 0;
    transition: opacity 0.3s;
  }
  #hunk-badge.visible {
    opacity: 1;
  }
</style>
