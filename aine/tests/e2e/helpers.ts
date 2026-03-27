/**
 * E2E test helpers: manages a real Aine server + fixture repo for Playwright tests.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createFixtureRepo,
  type FixtureRepo,
} from "../fixtures/setup-repo.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "../../cli.ts");

export interface E2EServer {
  port: number;
  url: string;
  repo: FixtureRepo;
  proc: ChildProcess;
  cleanup: () => void;
}

function randomPort(): number {
  return 10000 + Math.floor(Math.random() * 50000);
}

export async function startE2EServer(): Promise<E2EServer> {
  const repo = createFixtureRepo();
  const port = randomPort();
  const url = `http://localhost:${port}`;

  const proc = spawn("bun", ["run", CLI, "--no-open", "--port", String(port)], {
    cwd: repo.dir,
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Wait for server
  const maxWait = 15_000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const r = await fetch(`${url}/api/info`);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }

  const cleanup = () => {
    try { proc.kill(); } catch {}
    setTimeout(() => repo.cleanup(), 500);
  };

  return { port, url, repo, proc, cleanup };
}
