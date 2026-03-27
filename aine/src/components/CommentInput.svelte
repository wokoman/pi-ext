<script lang="ts">
  interface Props {
    startLine: number;
    endLine: number;
    body: string;
    isEdit: boolean;
    top: number;
    onSubmit: (body: string) => void;
    onCancel: () => void;
  }

  let { startLine, endLine, body = $bindable(""), isEdit, top, onSubmit, onCancel }: Props = $props();

  let textareaEl = $state<HTMLTextAreaElement>();

  let isRange = $derived(startLine !== endLine);

  export function focus() {
    textareaEl?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSubmit(body.trim()); }
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    e.stopPropagation();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="comment-input" style="top:{top}px" onkeydown={handleKeydown} onclick={(e) => e.stopPropagation()}>
  <div class="ci-header">
    <span class="ci-label">
      {#if isEdit && isRange}Editing · Lines {startLine}–{endLine}
      {:else if isEdit}Editing · Line {startLine}
      {:else if isRange}Lines {startLine}–{endLine}
      {:else}Line {startLine}{/if}
    </span>
    {#if !isEdit && !isRange}<span class="ci-label-hint">shift+click for range</span>{/if}
  </div>
  <textarea
    bind:this={textareaEl}
    bind:value={body}
    placeholder={isEdit ? "Edit comment…" : "Add a comment…"}
    rows="2"
  ></textarea>
  <div class="ci-footer">
    <span class="ci-hint">⌘↵ submit · Esc cancel</span>
    <button class="ci-btn" onclick={() => onSubmit(body.trim())} disabled={!body.trim()} type="button">
      {isEdit ? "Save" : "Comment"}
    </button>
  </div>
</div>

<style>
  .comment-input {
    position: absolute; left: 44px; width: min(55%, 520px); min-width: 320px;
    z-index: 20; background: var(--sidebar); border: 1px solid var(--border);
    border-left: 2px solid var(--accent); border-radius: 0;
    padding: 8px 10px; animation: ciSlide 0.1s ease-out;
  }
  @keyframes ciSlide { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
  .ci-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  .ci-label { font-size: 11px; color: var(--accent); font-weight: 600; }
  .ci-label-hint { color: var(--muted); font-size: 10px; }
  textarea {
    width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px; padding: 6px 8px; resize: none; min-height: 40px;
    outline: none; transition: border-color 0.15s; line-height: 1.5;
  }
  textarea:focus { border-color: var(--accent); }
  textarea::placeholder { color: var(--muted); }
  .ci-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 6px; }
  .ci-hint { font-size: 10px; color: var(--muted); }
  .ci-btn {
    background: rgba(203, 166, 247, 0.12); color: var(--accent);
    border: 1px solid var(--accent); border-radius: 4px; padding: 2px 12px;
    font-size: 11px; font-weight: 600; cursor: pointer; font-family: inherit;
    line-height: 18px; transition: color 0.15s, border-color 0.15s, background 0.15s;
  }
  .ci-btn:hover { background: rgba(203, 166, 247, 0.2); }
  .ci-btn:disabled { opacity: 0.2; cursor: default; }
</style>
