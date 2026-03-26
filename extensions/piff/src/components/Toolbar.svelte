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
  <span class="t-repo">{$repoInfo?.name ?? ""}</span>
  <span class="t-branch">{$repoInfo?.branch ?? ""}</span>
  <span class="t-desc">{$repoInfo?.description ?? ""}</span>
  <span class="t-stats">
    <span>{$files.length} file{$files.length !== 1 ? "s" : ""}</span>
    {#if $totalAdditions > 0}
      <span class="a">+{$totalAdditions}</span>
    {/if}
    {#if $totalDeletions > 0}
      <span class="d">−{$totalDeletions}</span>
    {/if}
  </span>
  {#if $preloadStatus.total > 0}
    <span class="t-preload" class:done={!$preloadStatus.preloading}>
      {#if $preloadStatus.preloading}
        <span class="preload-spinner"></span>
      {/if}
      {$preloadStatus.cached}/{$preloadStatus.total}
    </span>
  {/if}
  <span class="t-controls">
    <button
      class="toggle"
      class:on={$renderOptions.diffStyle === "unified"}
      title="Toggle split/unified (s)"
      onclick={onToggleStyle}
    >
      {$renderOptions.diffStyle}
    </button>
    <button
      class="toggle"
      class:on={$renderOptions.ignoreWhitespace}
      title="Toggle ignore whitespace (w)"
      onclick={onToggleWhitespace}
    >
      ws
    </button>
    <button
      class="toggle"
      class:on={!$renderOptions.expandUnchanged}
      title="Toggle expand unchanged (e)"
      onclick={onToggleExpand}
    >
      exp
    </button>
    <button id="btn-refresh" title="Refresh diffs" onclick={onRefresh}>↻</button>
    <button
      id="btn-help"
      title="Keyboard shortcuts (?)"
      onclick={() => ($helpVisible = !$helpVisible)}
    >
      ?
    </button>
  </span>
</div>

<style>
  #toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 16px;
    background: var(--sidebar);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    font-size: 12px;
    user-select: none;
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
  .t-desc {
    font-size: 11px;
    color: var(--muted);
    font-style: italic;
  }
  .t-stats {
    margin-left: auto;
    display: flex;
    gap: 6px;
    align-items: center;
    color: var(--muted);
    font-size: 11px;
  }
  .t-stats .a {
    color: var(--add);
  }
  .t-stats .d {
    color: var(--del);
  }
  .t-preload {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    font-family: "JetBrains Mono", "SF Mono", monospace;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    opacity: 0.7;
    transition: opacity 0.3s;
  }
  .t-preload.done {
    opacity: 0.35;
  }
  .preload-spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .t-controls {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  #btn-refresh,
  #btn-help {
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
  #btn-refresh:hover,
  #btn-help:hover {
    color: var(--text);
    border-color: var(--muted);
  }
  #btn-help {
    font-weight: 600;
  }
  .toggle {
    background: none;
    border: 1px solid var(--border);
    color: var(--muted);
    cursor: pointer;
    border-radius: 3px;
    padding: 0 5px;
    font-size: 10px;
    line-height: 18px;
    font-family: "JetBrains Mono", "SF Mono", monospace;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .toggle:hover {
    color: var(--text);
    border-color: var(--muted);
  }
  .toggle.on {
    color: var(--accent);
    border-color: var(--accent);
    background: rgba(203, 166, 247, 0.1);
  }
</style>
