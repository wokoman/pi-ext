/**
 * Test helper: starts a real Aine server against a fixture git repo.
 *
 * Uses Bun subprocess (since the server requires Bun runtime),
 * waits for it to be ready, returns base URL + cleanup.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import { createFixtureRepo, type FixtureRepo } from "./setup-repo.js";

const SERVER_SCRIPT = resolve(__dirname, "../../cli.ts");

export interface TestServer {
  port: number;
  base: string;
  repo: FixtureRepo;
  cleanup: () => void;
}

/** Find a random available port */
function randomPort(): number {
  return 10000 + Math.floor(Math.random() * 50000);
}

/**
 * Start a test server. Spawns `bun cli.ts` with --no-open and --port.
 * Waits until the server responds to /api/info.
 */
export async function startTestServer(
  repoFactory: () => FixtureRepo = createFixtureRepo,
): Promise<TestServer> {
  const repo = repoFactory();
  const port = randomPort();
  const base = `http://localhost:${port}`;

  const proc = spawn("bun", ["run", SERVER_SCRIPT, "--no-open", "--port", String(port)], {
    cwd: repo.dir,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "test" },
  });

  // Collect stderr for debugging
  let stderr = "";
  proc.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  // Wait for server to be ready (poll /api/info)
  const maxWait = 10_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const r = await fetch(`${base}/api/info`);
      if (r.ok) break;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  // Verify it's actually up
  try {
    const r = await fetch(`${base}/api/info`);
    if (!r.ok) throw new Error(`Server not ready: ${r.status}`);
  } catch (e) {
    proc.kill();
    repo.cleanup();
    throw new Error(`Server failed to start on port ${port}. stderr: ${stderr}\n${e}`);
  }

  const cleanup = () => {
    try { proc.kill(); } catch {}
    // Give process time to die before cleaning up repo
    setTimeout(() => repo.cleanup(), 500);
  };

  return { port, base, repo, cleanup };
}

/** Simple fetch helper that returns parsed JSON */
export async function api<T = any>(base: string, path: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const r = await fetch(`${base}${path}`, init);
  const data = await r.json() as T;
  return { status: r.status, data };
}

/** POST JSON helper */
export async function apiPost<T = any>(base: string, path: string, body: unknown): Promise<{ status: number; data: T }> {
  return api<T>(base, path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** PATCH JSON helper */
export async function apiPatch<T = any>(base: string, path: string, body: unknown): Promise<{ status: number; data: T }> {
  return api<T>(base, path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** DELETE helper */
export async function apiDelete<T = any>(base: string, path: string): Promise<{ status: number; data: T }> {
  return api<T>(base, path, { method: "DELETE" });
}
