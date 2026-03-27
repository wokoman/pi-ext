import { writable, derived } from "svelte/store";
import type {
  ChangedFile,
  RepoInfo,
  RenderOptions,
  Thread,
} from "../../types.js";

export type {
  ChangedFile,
  RepoInfo,
  RenderOptions,
  Severity,
  ThreadStatus,
  ThreadAuthor,
  ThreadComment,
  Thread,
} from "../../types.js";

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
export const threads = writable<Thread[]>([]);
export const commentsPanelVisible = writable(true);

export const totalAdditions = derived(files, ($files) =>
  $files.reduce((sum, f) => sum + f.additions, 0)
);
export const totalDeletions = derived(files, ($files) =>
  $files.reduce((sum, f) => sum + f.deletions, 0)
);

/** Threads for the currently selected file. */
export const fileThreads = derived(
  [threads, selectedPath],
  ([$threads, $selectedPath]) => {
    if (!$selectedPath) return [];
    return $threads.filter(t => t.file === $selectedPath);
  }
);
