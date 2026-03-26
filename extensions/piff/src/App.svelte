<script lang="ts">
  import { onMount } from "svelte";
  import Toolbar from "./components/Toolbar.svelte";
  import Sidebar from "./components/Sidebar.svelte";
  import DiffView from "./components/DiffView.svelte";
  import HelpOverlay from "./components/HelpOverlay.svelte";
  import Toast from "./components/Toast.svelte";
  import {
    files,
    repoInfo,
    selectedPath,
    renderOptions,
    helpVisible,
    sidebarVisible,
    toastMessage,
    preloadStatus,
  } from "./lib/state";
  import {
    fetchInfo,
    fetchFiles,
    fetchOptions,
    updateOptions,
    refresh,
  } from "./lib/api";
  import { handleKeydown } from "./lib/keyboard";

  let sidebar: Sidebar;
  let diffView: DiffView;

  // Use sidebar's visual DFS order for j/k navigation
  function getFilePaths(): string[] {
    return sidebar?.getOrderedPaths() ?? $files.map((f) => f.path);
  }

  async function handleRefresh() {
    await refresh();
    diffView?.clearCache();
    const [info, fl] = await Promise.all([fetchInfo(), fetchFiles()]);
    $repoInfo = info;
    $files = fl;
    if ($selectedPath) {
      // Re-select current file to reload diff
      const path = $selectedPath;
      $selectedPath = null;
      await new Promise((r) => requestAnimationFrame(r));
      $selectedPath = path;
    } else if (fl.length > 0) {
      $selectedPath = fl[0].path;
    }
    startPreloadStream();
  }

  function navigateFile(dir: "next" | "prev" | "first" | "last") {
    const paths = getFilePaths();
    if (!paths.length) return;
    const idx = $selectedPath ? paths.indexOf($selectedPath) : -1;
    let next: number;
    switch (dir) {
      case "next":
        next = idx < paths.length - 1 ? idx + 1 : 0;
        break;
      case "prev":
        next = idx > 0 ? idx - 1 : paths.length - 1;
        break;
      case "first":
        next = 0;
        break;
      case "last":
        next = paths.length - 1;
        break;
    }
    $selectedPath = paths[next];
    sidebar?.scrollFileIntoView(paths[next]);
  }

  /** Apply a render option change and re-render current diff.
   *  No need to clear client cache — keys include options, so old entries
   *  stay around for instant switching back. */
  function applyOption(patch: Partial<typeof $renderOptions>) {
    $renderOptions = { ...$renderOptions, ...patch };
    updateOptions(patch);
    const p = $selectedPath;
    if (p) {
      $selectedPath = null;
      requestAnimationFrame(() => ($selectedPath = p));
    }
    startPreloadStream();
  }

  function handleToggleStyle() {
    applyOption({ diffStyle: $renderOptions.diffStyle === "split" ? "unified" : "split" });
  }

  function handleToggleWhitespace() {
    applyOption({ ignoreWhitespace: !$renderOptions.ignoreWhitespace });
  }

  function handleToggleExpand() {
    applyOption({ expandUnchanged: !$renderOptions.expandUnchanged });
  }

  function onKeydown(e: KeyboardEvent) {
    const action = handleKeydown(e);
    if (!action) return;

    // If help is visible, only handle close actions
    if ($helpVisible && action.type !== "toggleHelp") return;

    switch (action.type) {
      case "toggleHelp":
        if (e.key === "Escape" && !$helpVisible) return;
        $helpVisible = !$helpVisible;
        break;
      case "nextFile":        navigateFile("next"); break;
      case "prevFile":        navigateFile("prev"); break;
      case "firstFile":       navigateFile("first"); break;
      case "lastFile":        navigateFile("last"); break;
      case "copyPath":
        if ($selectedPath) {
          navigator.clipboard.writeText($selectedPath).then(() => {
            $toastMessage = "Copied: " + $selectedPath;
          });
        }
        break;
      case "toggleSidebar":   $sidebarVisible = !$sidebarVisible; break;
      case "collapseFolder":  sidebar?.collapseSelectedFolder(); break;
      case "expandFolder":    sidebar?.expandSelectedFolder(); break;
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
    }
  }

  let preloadEventSource: EventSource | null = null;

  function startPreloadStream() {
    stopPreloadStream();
    const es = new EventSource("/api/preload-stream");
    preloadEventSource = es;
    es.onmessage = (e) => {
      try {
        $preloadStatus = JSON.parse(e.data);
      } catch {}
    };
    es.onerror = () => {
      es.close();
      preloadEventSource = null;
    };
  }

  function stopPreloadStream() {
    if (preloadEventSource) {
      preloadEventSource.close();
      preloadEventSource = null;
    }
  }

  onMount(async () => {
    try {
      // Fetch render options from server
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
      }

      startPreloadStream();
    } catch (e: any) {
      // Error will show in DiffView
    }

    return () => stopPreloadStream();
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div id="app">
  <Toolbar
    onRefresh={handleRefresh}
    onToggleStyle={handleToggleStyle}
    onToggleWhitespace={handleToggleWhitespace}
    onToggleExpand={handleToggleExpand}
  />
  <div id="main">
    <Sidebar bind:this={sidebar} visible={$sidebarVisible} />
    <DiffView bind:this={diffView} />
  </div>
</div>

<Toast />
<HelpOverlay />

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(:root) {
    --bg: #15131e;
    --sidebar: #15131e;
    --hover: #2a2440;
    --active: #45475a;
    --text: #cdd6f4;
    --muted: #7f849c;
    --accent: #cba6f7;
    --border: #313244;
    --add: #a6e3a1;
    --del: #f38ba8;
    --mod: #f9e2af;
    --diffs-font-family: "JetBrains Mono", "JetBrainsMono NF", monospace;
    --diffs-font-size: 11px;
    --diffs-line-height: 1.6;
    --diffs-font-features: "calt" 1, "liga" 1;
    --diffs-fg-number-override: #45475a;
    --diffs-fg-number-addition-override: #45475a;
    --diffs-fg-number-deletion-override: #45475a;
    --diffs-bg-addition-override: rgba(166, 227, 161, 0.07);
    --diffs-bg-addition-number-override: rgba(166, 227, 161, 0.07);
    --diffs-bg-deletion-override: rgba(243, 139, 168, 0.07);
    --diffs-bg-deletion-number-override: rgba(243, 139, 168, 0.07);
  }

  :global(html),
  :global(body) {
    height: 100%;
    overflow: hidden;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      sans-serif;
    font-size: 13px;
  }

  :global(::-webkit-scrollbar) {
    width: 7px;
    height: 7px;
  }
  :global(::-webkit-scrollbar-track) {
    background: transparent;
  }
  :global(::-webkit-scrollbar-thumb) {
    background: var(--border);
    border-radius: 4px;
  }

  #app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  #main {
    display: flex;
    flex: 1;
    min-height: 0;
  }
</style>
