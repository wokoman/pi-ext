import { createServer } from "node:http";
import { readFileSync, watch, type FSWatcher } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DiffSession } from "./diff-session.js";
import { registerSession, unregisterSession, type SessionInfo } from "./session-store.js";
import { loadTheme } from "./theme.js";
import { routeRequest, error, type RouteContext } from "./routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PAGE_HTML = readFileSync(join(__dirname, "dist", "index.html"), "utf-8");
const PAGE_HTML_BUF = Buffer.from(PAGE_HTML, "utf-8");
const PAGE_ETAG = `"${Bun.hash(PAGE_HTML).toString(36)}"`;

export interface ServerOptions {
  port: number;
  diffArgs: string[];
  description: string;
  cwd: string;
  unified?: boolean;
  noOpen?: boolean;
  watch?: boolean;
  theme?: string;
  expandUnchanged?: boolean;
  ignoreWhitespace?: boolean;
}

// ── Server lifecycle ──────────────────────────────────────────

let activeServer: ReturnType<typeof createServer> | null = null;
let activeSession: DiffSession | null = null;
let activeSessionInfo: SessionInfo | null = null;
let activeWatcher: FSWatcher | null = null;

export function stopServer() {
  if (activeWatcher) {
    try { activeWatcher.close(); } catch {}
    activeWatcher = null;
  }
  activeSession?.destroy();
  activeSession = null;
  if (activeSessionInfo) {
    unregisterSession(activeSessionInfo.id);
    activeSessionInfo = null;
  }
  if (activeServer) {
    try { activeServer.close(); } catch {}
    activeServer = null;
  }
}

function startWatcher(cwd: string, session: DiffSession) {
  if (activeWatcher) {
    try { activeWatcher.close(); } catch {}
  }
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  activeWatcher = watch(cwd, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    if (filename.startsWith(".git/") || filename.startsWith(".git\\")) return;
    if (filename.includes("node_modules/")) return;
    if (filename.endsWith(".swp") || filename.endsWith("~")) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => session.markStale(), 300);
  });
}

async function killPort(port: number) {
  try {
    const proc = Bun.spawn(["lsof", "-ti:" + port], { stdout: "pipe", stderr: "ignore" });
    const text = await new Response(proc.stdout).text();
    for (const pid of text.trim().split("\n").filter(Boolean)) {
      try { process.kill(+pid, "SIGKILL"); } catch {}
    }
  } catch {}
}

// ── Start server ──────────────────────────────────────────────

export async function startServer(opts: ServerOptions): Promise<number> {
  const { port, diffArgs, description, cwd, unified, noOpen } = opts;
  stopServer();
  await killPort(port);

  const theme = loadTheme(opts.theme || "catppuccin-mocha", cwd);
  const themeInit = {
    name: theme.name,
    shikiTheme: theme.shikiTheme,
    addBorder: theme.ui.addBorder,
    deleteBorder: theme.ui.deleteBorder,
  };

  const session = new DiffSession(diffArgs, cwd, themeInit);
  activeSession = session;

  // Apply initial render options from config
  const initOpts: Record<string, any> = {};
  if (unified) initOpts.diffStyle = "unified";
  if (opts.expandUnchanged !== undefined) initOpts.expandUnchanged = opts.expandUnchanged;
  if (opts.ignoreWhitespace !== undefined) initOpts.ignoreWhitespace = opts.ignoreWhitespace;
  if (Object.keys(initOpts).length > 0) session.setOptions(initOpts);

  session.preloadAll().catch(() => {});
  if (opts.watch) startWatcher(cwd, session);

  const routeCtx: RouteContext = { session, themeUI: theme.ui, cwd, diffArgs, description };

  return new Promise((resolve, reject) => {
    const s = createServer(async (req, res) => {
      try {
        // Try API routes first
        if (routeRequest(req, res, routeCtx)) return;

        // Static: serve the SPA
        if (req.headers["if-none-match"] === PAGE_ETAG) {
          res.writeHead(304);
          res.end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "ETag": PAGE_ETAG,
          "Cache-Control": "no-cache",
        });
        res.end(PAGE_HTML_BUF);
      } catch (e) {
        if (!res.headersSent) error(res, 500, String(e));
      }
    });

    activeServer = s;
    s.on("error", (e: NodeJS.ErrnoException) =>
      reject(e.code === "EADDRINUSE" ? new Error("Port " + port + " in use") : e),
    );
    s.listen(port, "127.0.0.1", () => {
      activeSessionInfo = registerSession({
        id: crypto.randomUUID(),
        repo: cwd,
        repoName: session.repoName,
        port,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        diffArgs,
        description,
      });
      if (!noOpen) {
        try { Bun.spawn(["open", `http://localhost:${port}`], { stdout: "ignore", stderr: "ignore" }); } catch {}
      }
      resolve(port);
    });
  });
}
