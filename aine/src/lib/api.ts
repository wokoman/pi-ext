import type { ChangedFile, RepoInfo, RenderOptions, Thread, ThreadStatus, ThreadAuthor, Severity } from "./state";

export async function fetchTheme(): Promise<Record<string, string>> {
  const r = await fetch("/api/theme");
  return r.json();
}

export async function fetchInfo(): Promise<RepoInfo> {
  const r = await fetch("/api/info");
  return r.json();
}

export async function fetchFiles(): Promise<ChangedFile[]> {
  const r = await fetch("/api/files");
  return r.json();
}

export async function fetchDiff(
  path: string,
  signal?: AbortSignal
): Promise<{ file: ChangedFile; html: string } | null> {
  const r = await fetch("/api/diff/" + encodeURIComponent(path), { signal });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error((d as any).error || "HTTP " + r.status);
  }
  return r.json();
}

export async function fetchOptions(): Promise<RenderOptions> {
  const r = await fetch("/api/options");
  return r.json();
}

export async function updateOptions(
  opts: Partial<RenderOptions>
): Promise<RenderOptions> {
  const r = await fetch("/api/options", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  return r.json();
}

export async function refresh(): Promise<void> {
  await fetch("/api/refresh");
}

export async function reloadSession(diffArgs: string[], description: string): Promise<void> {
  await fetch("/api/session/reload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ diffArgs, description }),
  });
}

// ── Threads API ───────────────────────────────────────────────

export async function fetchThreads(file?: string, status?: ThreadStatus): Promise<Thread[]> {
  const params = new URLSearchParams();
  if (file) params.set("file", file);
  if (status) params.set("status", status);
  const query = params.toString() ? `?${params}` : "";
  const r = await fetch(`/api/threads${query}`);
  return r.json();
}

export async function createThread(data: {
  file: string;
  startLine: number;
  endLine?: number;
  side?: "old" | "new";
  body: string;
  severity?: Severity;
  author?: ThreadAuthor;
}): Promise<Thread> {
  const r = await fetch("/api/threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return r.json();
}

export async function editThread(id: string, body: string): Promise<Thread> {
  const r = await fetch(`/api/threads/${id}/edit`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  return r.json();
}

export async function updateThreadStatus(id: string, status: ThreadStatus): Promise<Thread> {
  const r = await fetch(`/api/threads/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return r.json();
}

export async function deleteThread(id: string): Promise<void> {
  await fetch(`/api/threads/${id}`, { method: "DELETE" });
}
