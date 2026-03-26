<script lang="ts">
  import { toastMessage } from "../lib/state";

  let visible = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if ($toastMessage) {
      visible = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        visible = false;
        $toastMessage = null;
      }, 1500);
    }
  });
</script>

<div id="toast" class:show={visible}>
  {$toastMessage ?? ""}
</div>

<style>
  #toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    background: var(--sidebar);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    opacity: 0;
    transition: opacity 0.2s, transform 0.2s;
    pointer-events: none;
    z-index: 999;
  }
  #toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
</style>
