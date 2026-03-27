/**
 * File tree builder and navigation helpers for the sidebar.
 * Pure functions — no UI state, just data transformation.
 */

import type { ChangedFile } from "../../types.js";

// ── Types ─────────────────────────────────────────────────────

export interface TreeNode {
  name: string;
  kids: Record<string, TreeNode>;
  items: { file: ChangedFile; base: string }[];
}

export interface SidebarItem {
  type: "file" | "folder";
  key: string;
}

// ── Tree building ─────────────────────────────────────────────

/** Build a tree from a flat file list, grouping by directory segments. */
export function buildTree(list: ChangedFile[]): TreeNode {
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

/** Collapse single-child directories (e.g. "src/lib" instead of "src" → "lib"). */
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

// ── Item collection ───────────────────────────────────────────

/**
 * Collect visible sidebar items (folders + files) in DFS visual order.
 * Collapsed folders are included but their children are skipped.
 */
export function collectVisibleItems(
  node: TreeNode,
  prefix: string,
  isFolderOpen: (key: string) => boolean,
): SidebarItem[] {
  const items: SidebarItem[] = [];
  for (const k of Object.keys(node.kids).sort()) {
    const child = node.kids[k];
    const folderKey = prefix + "/" + child.name;
    items.push({ type: "folder", key: folderKey });
    if (isFolderOpen(folderKey)) {
      items.push(...collectVisibleItems(child, folderKey, isFolderOpen));
    }
  }
  for (const item of node.items.slice().sort((a, b) => a.base.localeCompare(b.base))) {
    items.push({ type: "file", key: item.file.path });
  }
  return items;
}

/** Collect all folder keys from the tree (for collapse/expand all). */
export function collectAllFolderKeys(node: TreeNode, prefix: string): string[] {
  const keys: string[] = [];
  for (const k of Object.keys(node.kids).sort()) {
    const child = node.kids[k];
    const folderKey = prefix + "/" + child.name;
    keys.push(folderKey);
    keys.push(...collectAllFolderKeys(child, folderKey));
  }
  return keys;
}

// ── Folder lookup ─────────────────────────────────────────────

/** Find the innermost folder containing the given file path. */
export function findInnermostFolder(node: TreeNode, prefix: string, path: string): string | null {
  for (const k of Object.keys(node.kids).sort()) {
    const child = node.kids[k];
    const folderKey = prefix + "/" + child.name;
    if (path.startsWith(folderKey + "/")) {
      const deeper = findInnermostFolder(child, folderKey, path);
      return deeper ?? folderKey;
    }
  }
  return null;
}

/** Find the outermost collapsed folder containing the given file path. */
export function findOutermostCollapsedFolder(
  node: TreeNode,
  prefix: string,
  path: string,
  isFolderOpen: (key: string) => boolean,
): string | null {
  for (const k of Object.keys(node.kids).sort()) {
    const child = node.kids[k];
    const folderKey = prefix + "/" + child.name;
    if (path.startsWith(folderKey + "/")) {
      if (!isFolderOpen(folderKey)) return folderKey;
      return findOutermostCollapsedFolder(child, folderKey, path, isFolderOpen);
    }
  }
  return null;
}

// ── Display helpers ───────────────────────────────────────────

export function statusGlyph(status: string): string {
  switch (status) {
    case "added": return "+";
    case "deleted": return "−";
    case "modified": return "·";
    case "renamed": return "→";
    case "copied": return "©";
    default: return "?";
  }
}
