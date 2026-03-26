import { createServer, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getRepoName, getCurrentBranch } from "./git.js";
import { DiffSession } from "./diff-session.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadPageHTML(): string {
  // Try built Svelte app first, fall back to legacy page.html
  const distPath = join(__dirname, "dist", "index.html");
  if (existsSync(distPath)) return readFileSync(distPath, "utf-8");
  return readFileSync(join(__dirname, "page.html"), "utf-8");
}

const PAGE_HTML = loadPageHTML();

export interface ServerOptions {
  port: number;
  diffArgs: string[];
  description: string;
  cwd: string;
}

let activeServer: ReturnType<typeof createServer> | null = null;
let activeSession: DiffSession | null = null;

export function stopServer() {
  activeSession?.destroy();
  activeSession = null;
  if (activeServer) {
    try {
      activeServer.close();
    } catch {}
    activeServer = null;
  }
}

export function startServer(opts: ServerOptions): Promise<number> {
  const { port, diffArgs, description, cwd } = opts;
  stopServer();

  const session = new DiffSession(diffArgs, cwd);
  activeSession = session;
  session.preloadAll().catch(() => {});

  const json = (res: ServerResponse, data: unknown) => {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(data));
  };

  const error = (res: ServerResponse, code: number, msg: string) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: msg }));
  };

  return new Promise((resolve, reject) => {
    const s = createServer(async (req, res) => {
      try {
        const p = new URL(req.url || "/", "http://x").pathname;

        if (req.method === "OPTIONS") {
          res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
          res.end();
          return;
        }

        if (p === "/api/info") {
          const files = session.getFiles();
          json(res, {
            name: getRepoName(cwd),
            branch: getCurrentBranch(cwd),
            description,
            fileCount: files.length,
            cached: session.cachedCount,
            total: files.length,
          });
          return;
        }

        if (p === "/api/files") {
          json(res, session.getFiles());
          return;
        }

        if (p === "/api/options") {
          if (req.method === "GET") {
            json(res, session.renderOptions);
            return;
          }
          let body = "";
          req.on("data", (c: Buffer) => {
            body += c;
          });
          req.on("end", () => {
            try {
              const opts = JSON.parse(body);
              session.setOptions(opts);
              json(res, session.renderOptions);
            } catch {
              error(res, 400, "Invalid JSON");
            }
          });
          return;
        }

        if (p === "/api/refresh") {
          session.refresh();
          json(res, { ok: true });
          return;
        }

        if (p === "/api/preload-status") {
          json(res, session.preloadStatus());
          return;
        }

        if (p === "/api/preload-stream") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
          });

          const send = () => {
            const status = session.preloadStatus();
            res.write(`data: ${JSON.stringify(status)}\n\n`);
            if (!status.preloading) {
              clearInterval(timer);
              res.end();
            }
          };

          send();
          const timer = setInterval(send, 300);

          req.on("close", () => clearInterval(timer));
          return;
        }

        if (p.startsWith("/api/diff/")) {
          const filePath = decodeURIComponent(p.slice(10));
          const file = session.getFiles().find((f) => f.path === filePath);
          if (!file) {
            error(res, 404, "Not found");
            return;
          }
          try {
            const html = await session.getDiffHTMLForUser(file);
            json(res, { file, html });
          } catch (e) {
            error(res, 500, String(e));
          }
          return;
        }

        // Serve the SPA
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
        });
        res.end(PAGE_HTML);
      } catch (e) {
        error(res, 500, String(e));
      }
    });

    activeServer = s;
    s.on("error", (e: NodeJS.ErrnoException) =>
      reject(
        e.code === "EADDRINUSE"
          ? new Error("Port " + port + " in use")
          : e,
      ),
    );
    s.listen(port, "127.0.0.1", () => resolve(port));
  });
}
