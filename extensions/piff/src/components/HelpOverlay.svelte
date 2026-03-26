<script lang="ts">
  import { helpVisible } from "../lib/state";

  function close() {
    $helpVisible = false;
  }

  function onOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).id === "help-overlay") close();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div id="help-overlay" class:visible={$helpVisible} onclick={onOverlayClick}>
  <div id="help-box">
    <h2>Keyboard Shortcuts</h2>

    <div class="help-section">
      <h3>Files</h3>
      <div class="help-row"><span class="help-key">j / ↓</span><span class="help-desc">Next file</span></div>
      <div class="help-row"><span class="help-key">k / ↑</span><span class="help-desc">Previous file</span></div>
      <div class="help-row"><span class="help-key">J</span><span class="help-desc">Last file</span></div>
      <div class="help-row"><span class="help-key">K</span><span class="help-desc">First file</span></div>
      <div class="help-row"><span class="help-key">y</span><span class="help-desc">Copy file path</span></div>
      <div class="help-row"><span class="help-key">b</span><span class="help-desc">Toggle sidebar</span></div>
      <div class="help-row"><span class="help-key">h / l</span><span class="help-desc">Collapse / expand folder</span></div>
      <div class="help-row"><span class="help-key">H / L</span><span class="help-desc">Collapse / expand all</span></div>
    </div>

    <div class="help-section">
      <h3>Diff navigation</h3>
      <div class="help-row"><span class="help-key">n</span><span class="help-desc">Next changed hunk</span></div>
      <div class="help-row"><span class="help-key">N</span><span class="help-desc">Previous changed hunk</span></div>
      <div class="help-row"><span class="help-key">gg</span><span class="help-desc">Scroll to top</span></div>
      <div class="help-row"><span class="help-key">G</span><span class="help-desc">Scroll to bottom</span></div>
      <div class="help-row"><span class="help-key">Ctrl+d / u</span><span class="help-desc">Scroll ½ page down / up</span></div>
      <div class="help-row"><span class="help-key">Ctrl+f / b</span><span class="help-desc">Scroll full page down / up</span></div>
    </div>

    <div class="help-section">
      <h3>Display</h3>
      <div class="help-row"><span class="help-key">s</span><span class="help-desc">Toggle split / unified</span></div>
      <div class="help-row"><span class="help-key">w</span><span class="help-desc">Toggle ignore whitespace</span></div>
      <div class="help-row"><span class="help-key">e</span><span class="help-desc">Toggle expand unchanged</span></div>
    </div>

    <div class="help-section">
      <h3>General</h3>
      <div class="help-row"><span class="help-key">?</span><span class="help-desc">Toggle this help</span></div>
    </div>

    <div class="help-hint">Press <strong>?</strong> or <strong>Esc</strong> to close</div>
  </div>
</div>

<style>
  #help-overlay {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.6);
    align-items: center;
    justify-content: center;
  }
  #help-overlay.visible {
    display: flex;
  }
  #help-box {
    background: var(--sidebar);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px 28px;
    max-width: 420px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  }
  #help-box h2 {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 14px;
    color: var(--accent);
    letter-spacing: 0.03em;
  }
  .help-section {
    margin-bottom: 12px;
  }
  .help-section h3 {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .help-row {
    display: flex;
    align-items: center;
    padding: 2px 0;
    font-size: 12px;
    line-height: 1.7;
  }
  .help-key {
    min-width: 80px;
    flex-shrink: 0;
    font-family: "JetBrains Mono", "SF Mono", monospace;
    font-size: 11px;
    color: var(--accent);
  }
  .help-desc {
    color: var(--text);
  }
  .help-hint {
    margin-top: 14px;
    text-align: center;
    font-size: 11px;
    color: var(--muted);
  }
</style>
