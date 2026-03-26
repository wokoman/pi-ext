<script lang="ts">
  import { files, selectedPath } from "../lib/state";
  import type { ChangedFile } from "../lib/state";

  interface TreeNode {
    name: string;
    kids: Record<string, TreeNode>;
    items: { file: ChangedFile; base: string }[];
  }

  interface FolderState {
    open: boolean;
    paths: string[];
  }

  let { visible = true }: { visible: boolean } = $props();

  let folderStates = $state<Map<string, FolderState>>(new Map());
  let fileElements = new Map<string, HTMLElement>();

  let tree = $derived(buildTree($files));

  function buildTree(list: ChangedFile[]): TreeNode {
    const root: TreeNode = { name: "", kids: {}, items: [] };
    for (const f of list) {
      const parts = f.path.split("/");
      let node = root;
      for (let j = 0; j < parts.length - 1; j++) {
        if (!node.kids[parts[j]])
          node.kids[parts[j]] = { name: parts[j], kids: {}, items: [] };
        node = node.kids[parts[j]];
      }
      node.items.push({ file: f, base: parts[parts.length - 1] });
    }
    squash(root);
    return root;
  }

  function squash(n: TreeNode) {
    for (const k of Object.keys(n.kids)) squash(n.kids[k]);
    const keys = Object.keys(n.kids);
    if (keys.length === 1 && n.items.length === 0) {
      const c = n.kids[keys[0]];
      n.name = n.name ? n.name + "/" + c.name : c.name;
      n.kids = c.kids;
      n.items = c.items;
    }
  }

  /** Collect file paths in the same DFS order as the rendered tree. */
  function collectPaths(node: TreeNode): string[] {
    const paths: string[] = [];
    for (const k of Object.keys(node.kids).sort()) {
      paths.push(...collectPaths(node.kids[k]));
    }
    for (const item of node.items.slice().sort((a, b) => a.base.localeCompare(b.base))) {
      paths.push(item.file.path);
    }
    return paths;
  }

  /** Ordered file paths matching the visual sidebar order. */
  export function getOrderedPaths(): string[] {
    return collectPaths(tree);
  }

  function getFolderState(name: string, node: TreeNode): FolderState {
    if (!folderStates.has(name)) {
      folderStates.set(name, { open: true, paths: collectPaths(node) });
    }
    return folderStates.get(name)!;
  }

  function toggleFolder(name: string, node: TreeNode, forceOpen?: boolean) {
    const state = getFolderState(name, node);
    state.open = forceOpen !== undefined ? forceOpen : !state.open;
    folderStates = new Map(folderStates);
  }

  export function collapseAll() {
    for (const [, state] of folderStates) state.open = false;
    folderStates = new Map(folderStates);
  }

  export function expandAll() {
    for (const [, state] of folderStates) state.open = true;
    folderStates = new Map(folderStates);
  }

  export function collapseSelectedFolder() {
    if (!$selectedPath) return;
    for (const [, state] of folderStates) {
      if (state.paths.includes($selectedPath) && state.open) {
        state.open = false;
        folderStates = new Map(folderStates);
        return;
      }
    }
  }

  export function expandSelectedFolder() {
    if (!$selectedPath) return;
    for (const [, state] of folderStates) {
      if (state.paths.includes($selectedPath) && !state.open) {
        state.open = true;
        folderStates = new Map(folderStates);
        return;
      }
    }
  }

  function glyph(status: string): string {
    switch (status) {
      case "added": return "+";
      case "deleted": return "−";
      case "modified": return "·";
      case "renamed": return "→";
      case "copied": return "©";
      default: return "?";
    }
  }

  function selectFile(path: string) {
    $selectedPath = path;
  }

  function trackFileEl(node: HTMLElement, path: string) {
    fileElements.set(path, node);
    return {
      destroy() {
        fileElements.delete(path);
      },
    };
  }

  export function scrollFileIntoView(path: string) {
    const el = fileElements.get(path);
    if (el) el.scrollIntoView({ block: "nearest" });
  }
</script>

<div id="sidebar" class:hidden={!visible}>
  <div id="sidebar-hdr">Changes</div>
  <div id="file-list">
    {#snippet renderNode(node: TreeNode, depth: number, prefix: string)}
      {#each Object.keys(node.kids).sort() as key}
        {@const child = node.kids[key]}
        {@const folderKey = prefix + "/" + child.name}
        {@const state = getFolderState(folderKey, child)}
        <button
          class="item"
          style="padding-left: {depth * 16 + 10}px"
          onclick={() => toggleFolder(folderKey, child)}
        >
          <span class="arrow">{state.open ? "▾" : "▸"}</span>
          <span class="fname fname-dir">{child.name}</span>
        </button>
        {#if state.open}
          <div>
            {@render renderNode(child, depth + 1, folderKey)}
          </div>
        {/if}
      {/each}
      {#each node.items.slice().sort((a, b) => a.base.localeCompare(b.base)) as item}
        <button
          class="item"
          class:sel={$selectedPath === item.file.path}
          style="padding-left: {depth * 16 + 10}px"
          onclick={() => selectFile(item.file.path)}
          use:trackFileEl={item.file.path}
        >
          <span class="st st-{item.file.status}">{glyph(item.file.status)}</span>
          <span
            class="fname"
            class:fname-del={item.file.status === "deleted"}
            title={item.file.path}
          >
            {item.base}
          </span>
          <span class="fst">
            {#if item.file.additions > 0}
              <span class="a">+{item.file.additions}</span>
            {/if}
            {#if item.file.deletions > 0}
              <span class="d">−{item.file.deletions}</span>
            {/if}
          </span>
        </button>
      {/each}
    {/snippet}
    {@render renderNode(tree, 0, "")}
  </div>
</div>

<style>
  #sidebar {
    width: 280px;
    flex-shrink: 0;
    background: var(--sidebar);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    user-select: none;
    transition: width 0.15s, opacity 0.15s;
    overflow: hidden;
  }
  #sidebar.hidden {
    width: 0;
    opacity: 0;
    border-right: none;
  }
  #sidebar-hdr {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
  }
  #file-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }
  .item {
    display: flex;
    align-items: center;
    width: 100%;
    border: none;
    background: none;
    color: var(--text);
    text-align: left;
    font: inherit;
    cursor: pointer;
    line-height: 22px;
    padding: 0 10px;
  }
  .item:hover {
    background: var(--hover);
  }
  .item.sel {
    background: var(--active);
  }
  .st {
    width: 14px;
    flex-shrink: 0;
    text-align: center;
    font-size: 10px;
  }
  .st-added { color: var(--add); }
  .st-deleted { color: var(--del); }
  .st-modified { color: var(--mod); font-size: 14px; }
  .st-renamed, :global(.st-copied) { color: var(--accent); }
  .arrow {
    width: 12px;
    flex-shrink: 0;
    text-align: center;
    font-size: 9px;
    color: var(--muted);
  }
  .fname {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-left: 4px;
    font-size: 12px;
  }
  .fname-del {
    text-decoration: line-through;
    opacity: 0.7;
  }
  .fname-dir {
    color: var(--muted);
  }
  .item:hover :global(.fname-dir) {
    color: var(--text);
  }
  .fst {
    flex-shrink: 0;
    display: flex;
    gap: 3px;
    font-size: 8px;
    margin-left: auto;
    padding-left: 8px;
    font-variant-numeric: tabular-nums;
  }
  .fst .a { color: var(--add); }
  .fst .d { color: var(--del); }
</style>
