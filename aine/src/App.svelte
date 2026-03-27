<script lang="ts">
  import { onMount } from "svelte";
  import Toolbar from "./components/Toolbar.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import DiffView from "./components/DiffView.svelte";
  import HelpOverlay from "./components/HelpOverlay.svelte";
  import Toast from "./components/Toast.svelte";
  import {
    files, repoInfo, selectedPath, renderOptions,
    helpVisible, sidebarVisible, commentsPanelVisible,
    toastMessage, preloadStatus,
  } from "./lib/state";
  import {
    fetchTheme, fetchInfo, fetchFiles, fetchOptions,
    updateOptions, refresh, reloadSession,
  } from "./lib/api";
  import { handleKeydown } from "./lib/keyboard";
  import { createPreloadStream, createEventStream } from "./lib/events";
  import { applyTheme } from "./lib/theme-apply";

  let sidebar: Sidebar;
  let diffView: DiffView;
  let currentDiffType = $state("working");
  let stale = $state(false);
  let cleanupPreload: (() => void) | null = null;
  let cleanupEvents: (() => void) | null = null;

  // ── Refresh / reload ────────────────────────────────────────

  async function handleRefresh() {
    stale = false;
    await refresh();
    diffView?.clearCache();
    const [info, fl] = await Promise.all([fetchInfo(), fetchFiles()]);
    $repoInfo = info;
    $files = fl;
    if ($selectedPath) {
      const path = $selectedPath;
      $selectedPath = null;
      await new Promise((r) => requestAnimationFrame(r));
      $selectedPath = path;
    } else if (fl.length > 0) {
      $selectedPath = fl[0].path;
    }
    startPreload();
  }

  function startPreload() {
    cleanupPreload?.();
    cleanupPreload = createPreloadStream((s) => { $preloadStatus = s; });
  }

  // ── Render option toggling ──────────────────────────────────

  function applyOption(patch: Partial<typeof $renderOptions>) {
    $renderOptions = { ...$renderOptions, ...patch };
    updateOptions(patch);
    const p = $selectedPath;
    if (p) { $selectedPath = null; requestAnimationFrame(() => ($selectedPath = p)); }
    startPreload();
  }

  function handleToggleStyle() {
    applyOption({ diffStyle: $renderOptions.diffStyle === "split" ? "unified" : "split" });
  }
  function handleToggleWhitespace() { applyOption({ ignoreWhitespace: !$renderOptions.ignoreWhitespace }); }
  function handleToggleExpand() { applyOption({ expandUnchanged: !$renderOptions.expandUnchanged }); }

  async function handleDiffTypeChange(type: string) {
    currentDiffType = type;
    const map: Record<string, [string[], string]> = {
      staged:   [["--staged"], "Staged changes"],
      unstaged: [[], "Unstaged changes"],
      last:     [["HEAD~1..HEAD"], "Last commit"],
      working:  [[], "Working tree changes"],
    };
    const [diffArgs, description] = map[type] ?? map.working;
    await reloadSession(diffArgs, description);
    await handleRefresh();
  }

  // ── File navigation ─────────────────────────────────────────

  function navigateFile(dir: "next" | "prev" | "first" | "last") {
    const items = sidebar?.getOrderedItems() ?? [];
    if (!items.length) return;
    const currentKey = sidebar?.getFocusedKey();
    const idx = currentKey ? items.findIndex(i => i.key === currentKey) : -1;
    let next: number;
    switch (dir) {
      case "next":  next = idx < items.length - 1 ? idx + 1 : 0; break;
      case "prev":  next = idx > 0 ? idx - 1 : items.length - 1; break;
      case "first": next = 0; break;
      case "last":  next = items.length - 1; break;
    }
    const item = items[next];
    sidebar?.setFocusedKey(item.key);
    sidebar?.scrollItemIntoView(item.key);
    if (item.type === "file") $selectedPath = item.key;
  }

  // ── Keyboard handler ────────────────────────────────────────

  function onKeydown(e: KeyboardEvent) {
    const action = handleKeydown(e);
    if (!action) return;
    if ($helpVisible && action.type !== "toggleHelp") return;

    switch (action.type) {
      case "toggleHelp":
        if (e.key === "Escape" && !$helpVisible) return;
        $helpVisible = !$helpVisible; break;
      case "nextFile":        navigateFile("next"); break;
      case "prevFile":        navigateFile("prev"); break;
      case "firstFile":       navigateFile("first"); break;
      case "lastFile":        navigateFile("last"); break;
      case "copyPath":
        if ($selectedPath) navigator.clipboard.writeText($selectedPath).then(() => { $toastMessage = "Copied: " + $selectedPath; });
        break;
      case "toggleSidebar":   $sidebarVisible = !$sidebarVisible; break;
      case "collapseFolder":  sidebar?.collapseFocused(); break;
      case "expandFolder":    sidebar?.expandFocused(); break;
      case "collapseAll":     sidebar?.collapseAll(); break;
      case "expandAll":       sidebar?.expandAll(); break;
      case "nextHunk":        diffView?.navigateHunk(1); break;
      case "prevHunk":        diffView?.navigateHunk(-1); break;
      case "scrollTop":       diffView?.scrollTo("top"); break;
      case "scrollBottom":    diffView?.scrollTo("bottom"); break;
      case "scrollHalfDown":  diffView?.scrollBy(diffView.getScrollHeight() / 2); break;
      case "scrollHalfUp":    diffView?.scrollBy(-diffView.getScrollHeight() / 2); break;
      case "scrollPageDown":  diffView?.scrollBy(diffView.getScrollHeight()); break;
      case "scrollPageUp":    diffView?.scrollBy(-diffView.getScrollHeight()); break;
      case "toggleStyle":     handleToggleStyle(); break;
      case "toggleWhitespace": handleToggleWhitespace(); break;
      case "toggleExpand":    handleToggleExpand(); break;
      case "toggleComments":  $commentsPanelVisible = !$commentsPanelVisible; break;
      case "refresh":         handleRefresh(); break;
    }
  }

  // ── Cross-component communication ───────────────────────────

  // ── Init ────────────────────────────────────────────────────

  onMount(async () => {
    try {
      try { applyTheme(await fetchTheme()); } catch {}

      const opts = await fetchOptions();
      $renderOptions = {
        diffStyle: opts.diffStyle || "split",
        expandUnchanged: opts.expandUnchanged !== false,
        ignoreWhitespace: !!opts.ignoreWhitespace,
      };

      const [info, fl] = await Promise.all([fetchInfo(), fetchFiles()]);
      $repoInfo = info;
      $files = fl;

      if (fl.length > 0) {
        $selectedPath = fl[0].path;
        sidebar?.setFocusedKey(fl[0].path);
      }

      startPreload();
      cleanupEvents = createEventStream({
        onNavigate: (file) => {
          $selectedPath = file;
          sidebar?.setFocusedKey(file);
          sidebar?.scrollItemIntoView(file);
        },
        onStale: () => { stale = true; },
        onRefresh: () => handleRefresh(),
      });
    } catch {}

    return () => { cleanupPreload?.(); cleanupEvents?.(); };
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div id="app">
  <Toolbar
    onRefresh={handleRefresh}
    onToggleStyle={handleToggleStyle}
    onToggleWhitespace={handleToggleWhitespace}
    onToggleExpand={handleToggleExpand}
    onDiffTypeChange={handleDiffTypeChange}
    {currentDiffType}
  />
  {#if stale}
    <button class="stale-banner" onclick={() => handleRefresh()}>
      <span class="stale-icon">⚠</span>
      Files changed on disk
      <span class="stale-action">Refresh <kbd>r</kbd></span>
    </button>
  {/if}
  <div id="main">
    <Sidebar bind:this={sidebar} visible={$sidebarVisible} />
    <DiffView bind:this={diffView} />
  </div>
</div>

<Toast />
<HelpOverlay />

<style>
  :global(*) { margin: 0; padding: 0; box-sizing: border-box; }
  :global(:root) {
    --bg: #15131e; --sidebar: #15131e; --hover: #2a2440; --active: #45475a;
    --text: #cdd6f4; --muted: #7f849c; --accent: #cba6f7; --border: #313244;
    --add: #a6e3a1; --del: #f38ba8; --mod: #f9e2af;
    --diffs-font-family: "JetBrains Mono", "JetBrainsMono NF", monospace;
    --diffs-font-size: 11px; --diffs-line-height: 1.6;
    --diffs-font-features: "calt" 1, "liga" 1;
    --diffs-fg-number-override: #45475a;
    --diffs-fg-number-addition-override: #45475a;
    --diffs-fg-number-deletion-override: #45475a;
    --diffs-bg-addition-override: rgba(166, 227, 161, 0.07);
    --diffs-bg-addition-number-override: rgba(166, 227, 161, 0.07);
    --diffs-bg-deletion-override: rgba(243, 139, 168, 0.07);
    --diffs-bg-deletion-number-override: rgba(243, 139, 168, 0.07);
  }
  :global(html), :global(body) {
    height: 100%; overflow: hidden; background: var(--bg); color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px;
  }
  :global(::-webkit-scrollbar) { width: 7px; height: 7px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) { background: var(--border); border-radius: 4px; }
  #app { display: flex; flex-direction: column; height: 100vh; }
  #main { display: flex; flex: 1; min-height: 0; }
  .stale-banner {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    width: 100%; padding: 6px 16px; background: rgba(249, 226, 175, 0.08);
    border: none; border-bottom: 1px solid rgba(249, 226, 175, 0.15);
    color: #f9e2af; font-family: inherit; font-size: 12px; cursor: pointer;
    transition: background 0.15s; animation: stale-slide-in 0.2s ease-out;
  }
  .stale-banner:hover { background: rgba(249, 226, 175, 0.12); }
  .stale-icon { font-size: 14px; }
  .stale-action { color: rgba(249, 226, 175, 0.5); font-size: 11px; }
  .stale-action kbd {
    display: inline-block; background: rgba(249, 226, 175, 0.1);
    border: 1px solid rgba(249, 226, 175, 0.2); border-radius: 3px;
    padding: 0 4px; font-family: "JetBrains Mono", "SF Mono", monospace;
    font-size: 10px; line-height: 1.6;
  }
  @keyframes stale-slide-in { from { opacity: 0; transform: translateY(-100%); } to { opacity: 1; transform: translateY(0); } }
</style>
