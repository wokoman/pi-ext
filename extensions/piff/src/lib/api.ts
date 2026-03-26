import type { ChangedFile, RepoInfo, RenderOptions } from "./state";

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


