<script lang="ts">
  import {
    repoInfo,
    files,
    renderOptions,
    totalAdditions,
    totalDeletions,
    helpVisible,
    preloadStatus,
  } from "../lib/state";

  interface Props {
    onRefresh: () => void;
    onToggleStyle: () => void;
    onToggleWhitespace: () => void;
    onToggleExpand: () => void;
  }

  let { onRefresh, onToggleStyle, onToggleWhitespace, onToggleExpand }: Props = $props();
</script>

<div id="toolbar">
  <!-- Section 1: Repo info -->
  <div class="t-section t-info">
    <span class="t-repo">{$repoInfo?.name ?? ""}</span>
    <span class="t-branch">{$repoInfo?.branch ?? ""}</span>
  </div>

  <span class="t-sep">│</span>

  <!-- Section 2: File stats -->
  <div class="t-section t-stats">
    <span>{$files.length} file{$files.length !== 1 ? "s" : ""}{#if $totalAdditions > 0}{"  "}<span class="a">+{$totalAdditions}</span>{/if}{#if $totalDeletions > 0}{" "}<span class="d">−{$totalDeletions}</span>{/if}</span>
  </div>

  {#if $preloadStatus.total > 0}
    <span class="t-sep">│</span>

    <!-- Section 2b: Cache status -->
    <span class="t-cache" class:done={!$preloadStatus.preloading}>
      {#if $preloadStatus.preloading}
        <span class="preload-spinner"></span>
      {:else}
        <span class="cache-check">✓</span>
      {/if}
      cache {$preloadStatus.cached}/{$preloadStatus.total}
    </span>
  {/if}

  <span class="t-sep">│</span>

  <!-- Section 3: View controls -->
  <div class="t-section t-controls">
    <button
      class="toggle"
      class:on={$renderOptions.diffStyle === "unified"}
      title="Toggle split/unified (s)"
      onclick={onToggleStyle}
    >
      {$renderOptions.diffStyle === "split" ? "Split" : "Unified"}
      <span class="kbd">S</span>
    </button>
    <button
      class="toggle"
      class:on={$renderOptions.ignoreWhitespace}
      title="Toggle ignore whitespace (w)"
      onclick={onToggleWhitespace}
    >
      Whitespace
      <span class="kbd">W</span>
    </button>
    <button
      class="toggle"
      class:on={!$renderOptions.expandUnchanged}
      title="Toggle expand unchanged lines (e)"
      onclick={onToggleExpand}
    >
      Expand
      <span class="kbd">E</span>
    </button>
  </div>

  <span class="t-sep">│</span>

  <!-- Section 4: Actions -->
  <div class="t-section t-actions">
    <button class="icon-btn" title="Refresh diffs (r)" onclick={onRefresh}>↻</button>
    <button
      class="icon-btn"
      title="Keyboard shortcuts (?)"
      onclick={() => ($helpVisible = !$helpVisible)}
    >
      ?
    </button>
  </div>
</div>

<style>
  #toolbar {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 6px 16px;
    background: var(--sidebar);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    font-size: 12px;
    user-select: none;
  }

  .t-section {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .t-sep {
    color: var(--border);
    margin: 0 10px;
    font-size: 11px;
  }

  /* Section 1: Repo info */
  .t-info {
    gap: 8px;
  }
  .t-repo {
    font-weight: 600;
  }
  .t-branch {
    font-size: 11px;
    color: var(--accent);
    background: rgba(203, 166, 247, 0.12);
    padding: 1px 6px;
    border-radius: 3px;
    font-family: "JetBrains Mono", "SF Mono", "Fira Code", monospace;
  }
  /* Section 2: Stats */
  .t-stats {
    margin-left: auto;
    gap: 6px;
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .t-stats .a {
    color: var(--add);
  }
  .t-stats .d {
    color: var(--del);
  }
  .t-cache {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-family: "JetBrains Mono", "SF Mono", monospace;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    opacity: 0.7;

    transition: opacity 0.3s;
  }
  .t-cache.done {
    opacity: 0.45;
  }
  .cache-check {
    color: var(--add);
    font-size: 11px;
  }
  .preload-spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Section 3: View controls */
  .t-controls {
    gap: 4px;
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 1px solid var(--border);
    color: var(--muted);
    cursor: pointer;
    border-radius: 4px;
    padding: 1px 8px;
    font-size: 11px;
    line-height: 18px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .toggle:hover {
    color: var(--text);
    border-color: var(--muted);
  }
  .toggle.on {
    color: var(--accent);
    border-color: var(--accent);
    background: rgba(203, 166, 247, 0.12);
  }
  .kbd {
    font-size: 9px;
    font-family: "JetBrains Mono", "SF Mono", monospace;
    color: var(--border);
    margin-left: 2px;
  }
  .toggle:hover .kbd,
  .toggle.on .kbd {
    color: var(--muted);
  }

  /* Section 4: Actions */
  .t-actions {
    gap: 4px;
  }
  .icon-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--muted);
    cursor: pointer;
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 11px;
    line-height: 18px;
    transition: color 0.15s, border-color 0.15s;
  }
  .icon-btn:hover {
    color: var(--text);
    border-color: var(--muted);
  }
</style>
