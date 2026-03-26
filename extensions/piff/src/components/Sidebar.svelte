<script lang="ts">
  import { files, selectedPath } from "../lib/state";
  import type { ChangedFile } from "../lib/state";

  export interface SidebarItem {
    type: "file" | "folder";
    key: string;
  }

  interface TreeNode {
    name: string;
    kids: Record<string, TreeNode>;
    items: { file: ChangedFile; base: string }[];
  }

  let { visible = true }: { visible: boolean } = $props();

  // Track which folders are open. Key = folder path, value = open.
  // Folders not in the record are open by default.
  let folderOpen: Record<string, boolean> = $state({});
  // Currently focused sidebar item (file path or folder key)
  let focusedKey: string | null = $state(null);
  let itemElements = new Map<string, HTMLElement>();

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

  /** Collect visible sidebar items (folders + files) in DFS visual order.
   *  Collapsed folders are included but their children are skipped. */
  function collectVisibleItems(node: TreeNode, prefix: string): SidebarItem[] {
    const items: SidebarItem[] = [];
    for (const k of Object.keys(node.kids).sort()) {
      const child = node.kids[k];
      const folderKey = prefix + "/" + child.name;
      items.push({ type: "folder", key: folderKey });
      if (isFolderOpen(folderKey)) {
        items.push(...collectVisibleItems(child, folderKey));
      }
    }
    for (const item of node.items.slice().sort((a, b) => a.base.localeCompare(b.base))) {
      items.push({ type: "file", key: item.file.path });
    }
    return items;
  }

  /** Ordered sidebar items in visual order (respects collapsed folders). */
  export function getOrderedItems(): SidebarItem[] {
    return collectVisibleItems(tree, "");
  }

  export function getFocusedKey(): string | null {
    return focusedKey;
  }

  export function setFocusedKey(key: string | null) {
    focusedKey = key;
  }

  function isFolderOpen(folderKey: string): boolean {
    return folderOpen[folderKey] !== false;
  }

  function isFolderKey(key: string): boolean {
    return key.startsWith("/");
  }

  function toggleFolder(folderKey: string) {
    folderOpen[folderKey] = !isFolderOpen(folderKey);
  }

  /** Collect all folder keys from the tree. */
  function collectAllFolderKeys(node: TreeNode, prefix: string): string[] {
    const keys: string[] = [];
    for (const k of Object.keys(node.kids).sort()) {
      const child = node.kids[k];
      const folderKey = prefix + "/" + child.name;
      keys.push(folderKey);
      keys.push(...collectAllFolderKeys(child, folderKey));
    }
    return keys;
  }

  export function collapseAll() {
    for (const key of collectAllFolderKeys(tree, "")) {
      folderOpen[key] = false;
    }
  }

  export function expandAll() {
    for (const key of collectAllFolderKeys(tree, "")) {
      folderOpen[key] = true;
    }
  }

  /** Collapse the focused folder (or the folder containing the focused file). */
  export function collapseFocused() {
    const key = focusedKey;
    if (!key) return;
    if (isFolderKey(key)) {
      // Focused on a folder – collapse it if open, otherwise collapse parent
      if (isFolderOpen(key)) {
        folderOpen[key] = false;
      } else {
        // Go to parent folder
        const parentKey = key.substring(0, key.lastIndexOf("/"));
        if (parentKey) {
          folderOpen[parentKey] = false;
          focusedKey = parentKey;
        }
      }
    } else {
      // Focused on a file – collapse innermost folder containing it
      const folderKey = findFolderForPath(tree, "", key);
      if (folderKey && isFolderOpen(folderKey)) {
        folderOpen[folderKey] = false;
        focusedKey = folderKey;
      }
    }
  }

  /** Expand the focused folder (or the folder containing the focused file). */
  export function expandFocused() {
    const key = focusedKey;
    if (!key) return;
    if (isFolderKey(key)) {
      if (!isFolderOpen(key)) {
        folderOpen[key] = true;
      }
    } else {
      // Focused on a file – expand outermost collapsed folder containing it
      const folderKey = findCollapsedFolderForPath(tree, "", key);
      if (folderKey) {
        folderOpen[folderKey] = true;
      }
    }
  }

  /** Find the innermost folder containing the given path. */
  function findFolderForPath(node: TreeNode, prefix: string, path: string): string | null {
    for (const k of Object.keys(node.kids).sort()) {
      const child = node.kids[k];
      const folderKey = prefix + "/" + child.name;
      if (path.startsWith(folderKey + "/")) {
        const deeper = findFolderForPath(child, folderKey, path);
        return deeper ?? folderKey;
      }
    }
    return null;
  }

  /** Find the outermost collapsed folder containing the given path. */
  function findCollapsedFolderForPath(node: TreeNode, prefix: string, path: string): string | null {
    for (const k of Object.keys(node.kids).sort()) {
      const child = node.kids[k];
      const folderKey = prefix + "/" + child.name;
      if (path.startsWith(folderKey + "/")) {
        if (!isFolderOpen(folderKey)) return folderKey;
        return findCollapsedFolderForPath(child, folderKey, path);
      }
    }
    return null;
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
    focusedKey = path;
    $selectedPath = path;
  }

  function handleFolderClick(folderKey: string) {
    focusedKey = folderKey;
    toggleFolder(folderKey);
  }

  function trackItemEl(node: HTMLElement, key: string) {
    itemElements.set(key, node);
    return {
      destroy() {
        itemElements.delete(key);
      },
    };
  }

  export function scrollItemIntoView(key: string) {
    const el = itemElements.get(key);
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
        <button
          class="item"
          class:sel={focusedKey === folderKey}
          style="padding-left: {depth * 16 + 10}px"
          onclick={() => handleFolderClick(folderKey)}
          use:trackItemEl={folderKey}
        >
          <svg class="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            {#if isFolderOpen(folderKey)}
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>
              <path d="M2 10h20"/>
            {:else}
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>
            {/if}
          </svg>
          <span class="fname fname-dir">{child.name}</span>
        </button>
        {#if isFolderOpen(folderKey)}
          <div>
            {@render renderNode(child, depth + 1, folderKey)}
          </div>
        {/if}
      {/each}
      {#each node.items.slice().sort((a, b) => a.base.localeCompare(b.base)) as item}
        <button
          class="item"
          class:sel={focusedKey === item.file.path}
          style="padding-left: {depth * 16 + 10}px"
          onclick={() => selectFile(item.file.path)}
          use:trackItemEl={item.file.path}
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
  .folder-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    color: var(--muted);
    opacity: 0.5;
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
