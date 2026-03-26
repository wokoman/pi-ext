import { writable, derived } from "svelte/store";

export interface ChangedFile {
  path: string;
  oldPath?: string;
  status: "added" | "deleted" | "modified" | "renamed" | "copied";
  untracked?: boolean;
  additions: number;
  deletions: number;
}

export interface RepoInfo {
  name: string;
  branch: string;
  description: string;
  fileCount: number;
  cached: number;
  total: number;
}

export interface RenderOptions {
  diffStyle: "split" | "unified";
  expandUnchanged: boolean;
  ignoreWhitespace: boolean;
}

export const files = writable<ChangedFile[]>([]);
export const repoInfo = writable<RepoInfo | null>(null);
export const selectedPath = writable<string | null>(null);
export const renderOptions = writable<RenderOptions>({
  diffStyle: "split",
  expandUnchanged: true,
  ignoreWhitespace: false,
});
export const helpVisible = writable(false);
export const sidebarVisible = writable(true);
export const toastMessage = writable<string | null>(null);
export const preloadStatus = writable<{ cached: number; total: number; preloading: boolean }>({
  cached: 0,
  total: 0,
  preloading: false,
});

export const totalAdditions = derived(files, ($files) =>
  $files.reduce((sum, f) => sum + f.additions, 0)
);
export const totalDeletions = derived(files, ($files) =>
  $files.reduce((sum, f) => sum + f.deletions, 0)
);
