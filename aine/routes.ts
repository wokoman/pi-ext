/**
 * API route handlers for the Aine HTTP server.
 * Each handler is a pure function: (req, res, ctx) → void.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { DiffSession } from "./diff-session.js";
import type { ThemeColors } from "./types.js";

// ── HTTP helpers ──────────────────────────────────────────────

export function json(res: ServerResponse, data: unknown) {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

export function error(res: ServerResponse, code: number, msg: string) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: msg }));
}

export function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c: Buffer) => { body += c; });
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error("Invalid JSON")); }
    });
  });
}

// ── Route context ─────────────────────────────────────────────

export interface RouteContext {
  session: DiffSession;
  themeUI: ThemeColors;
  cwd: string;
  diffArgs: string[];
  description: string;
}

// ── Route handler type ────────────────────────────────────────

type Handler = (req: IncomingMessage, res: ServerResponse, ctx: RouteContext) => Promise<void> | void;

// ── Static routes (exact path match) ──────────────────────────

const staticRoutes: Record<string, Record<string, Handler>> = {
  "/api/theme": {
    GET: (_req, res, ctx) => json(res, ctx.themeUI),
  },

  "/api/info": {
    GET: (_req, res, ctx) => {
      const files = ctx.session.getFiles();
      json(res, {
        name: ctx.session.repoName,
        branch: ctx.session.branch,
        description: ctx.description,
        fileCount: files.length,
        cached: ctx.session.cachedCount,
        total: files.length,
      });
    },
  },

  "/api/files": {
    GET: (_req, res, ctx) => json(res, ctx.session.getFiles()),
  },

  "/api/options": {
    GET: (_req, res, ctx) => json(res, ctx.session.renderOptions),
    POST: async (req, res, ctx) => {
      try {
        const opts = await parseBody(req);
        ctx.session.setOptions(opts);
        json(res, ctx.session.renderOptions);
      } catch {
        error(res, 400, "Invalid JSON");
      }
    },
  },

  "/api/refresh": {
    GET: (_req, res, ctx) => { ctx.session.refresh(); json(res, { ok: true }); },
    POST: (_req, res, ctx) => { ctx.session.refresh(); json(res, { ok: true }); },
  },

  "/api/preload-status": {
    GET: (_req, res, ctx) => json(res, ctx.session.preloadStatus()),
  },

  "/api/preload-stream": {
    GET: (req, res, ctx) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      const send = () => {
        const status = ctx.session.preloadStatus();
        res.write(`data: ${JSON.stringify(status)}\n\n`);
        if (!status.preloading) { clearInterval(timer); res.end(); }
      };
      send();
      const timer = setInterval(send, 300);
      req.on("close", () => clearInterval(timer));
    },
  },

  // ── Session control (for agents) ────────────────────────────

  "/api/session/context": {
    GET: (_req, res, ctx) => {
      const files = ctx.session.getFiles();
      json(res, {
        repo: ctx.cwd,
        repoName: ctx.session.repoName,
        branch: ctx.session.branch,
        description: ctx.description,
        diffArgs: ctx.diffArgs,
        selectedFile: ctx.session.currentFile,
        files: files.map(f => ({
          path: f.path, status: f.status,
          additions: f.additions, deletions: f.deletions,
        })),
        renderOptions: ctx.session.renderOptions,
        threadCount: ctx.session.getThreadCount(),
      });
    },
  },

  "/api/session/navigate": {
    POST: async (req, res, ctx) => {
      try {
        const { file, hunk, line } = await parseBody(req);
        ctx.session.currentFile = file;
        ctx.session.emitEvent({ type: "navigate", file, hunk, line });
        json(res, { ok: true });
      } catch {
        error(res, 400, "Invalid JSON");
      }
    },
  },

  "/api/session/reload": {
    POST: async (req, res, ctx) => {
      try {
        const { diffArgs: newDiffArgs, description: newDesc } = await parseBody(req);
        ctx.session.reloadWith(newDiffArgs, newDesc || "");
        json(res, { ok: true });
      } catch {
        error(res, 400, "Invalid JSON");
      }
    },
  },

  // ── Threads (list / create) ─────────────────────────────────

  "/api/threads": {
    GET: (req, res, ctx) => {
      const url = new URL(req.url || "/", "http://localhost");
      const file = url.searchParams.get("file") ?? undefined;
      const status = url.searchParams.get("status") as any ?? undefined;
      json(res, ctx.session.getThreads({ file, status }));
    },
    POST: async (req, res, ctx) => {
      try {
        const data = await parseBody(req);
        json(res, ctx.session.createThread(data));
      } catch (e) {
        error(res, 400, String(e));
      }
    },
  },

  // ── SSE events ──────────────────────────────────────────────

  "/api/events": {
    GET: (req, res, ctx) => {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      const handler = (event: any) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      ctx.session.addEventListener(handler);
      req.on("close", () => ctx.session.removeEventListener(handler));
    },
  },
};

// ── Dynamic routes (regex match) ──────────────────────────────

interface DynamicRoute {
  pattern: RegExp;
  method: string;
  handler: (req: IncomingMessage, res: ServerResponse, ctx: RouteContext, match: RegExpMatchArray) => Promise<void> | void;
}

const dynamicRoutes: DynamicRoute[] = [
  // /api/diff/:path
  {
    pattern: /^\/api\/diff\/(.+)$/,
    method: "GET",
    handler: async (_req, res, ctx, m) => {
      const filePath = decodeURIComponent(m[1]);
      const file = ctx.session.getFileByPath(filePath);
      if (!file) { error(res, 404, "Not found"); return; }
      try {
        const html = await ctx.session.getDiffHTMLForUser(file);
        json(res, { file, html });
      } catch (e) {
        error(res, 500, String(e));
      }
    },
  },

  // /api/threads/:id/reply
  {
    pattern: /^\/api\/threads\/([^/]+)\/reply$/,
    method: "POST",
    handler: async (req, res, ctx, m) => {
      try {
        const data = await parseBody(req);
        const comment = ctx.session.addReply(m[1], data.body, data.author);
        if (!comment) error(res, 404, "Thread not found");
        else json(res, comment);
      } catch (e) { error(res, 400, String(e)); }
    },
  },

  // /api/threads/:id/status
  {
    pattern: /^\/api\/threads\/([^/]+)\/status$/,
    method: "PATCH",
    handler: async (req, res, ctx, m) => {
      try {
        const data = await parseBody(req);
        const thread = ctx.session.updateThreadStatus(m[1], data.status);
        if (!thread) error(res, 404, "Thread not found");
        else json(res, thread);
      } catch (e) { error(res, 400, String(e)); }
    },
  },

  // /api/threads/:id/edit
  {
    pattern: /^\/api\/threads\/([^/]+)\/edit$/,
    method: "PATCH",
    handler: async (req, res, ctx, m) => {
      try {
        const data = await parseBody(req);
        const thread = ctx.session.editThread(m[1], data.body);
        if (!thread) error(res, 404, "Thread not found");
        else json(res, thread);
      } catch (e) { error(res, 400, String(e)); }
    },
  },

  // /api/threads/:id  (GET or DELETE)
  {
    pattern: /^\/api\/threads\/([^/]+)$/,
    method: "GET",
    handler: (_req, res, ctx, m) => {
      const thread = ctx.session.getThread(m[1]);
      if (!thread) error(res, 404, "Thread not found");
      else json(res, thread);
    },
  },
  {
    pattern: /^\/api\/threads\/([^/]+)$/,
    method: "DELETE",
    handler: (_req, res, ctx, m) => {
      const ok = ctx.session.deleteThread(m[1]);
      if (!ok) error(res, 404, "Thread not found");
      else json(res, { ok: true });
    },
  },
];

// ── Router ────────────────────────────────────────────────────

/**
 * Route an API request. Returns true if handled, false if no route matched
 * (caller should serve static HTML).
 */
export function routeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: RouteContext,
): boolean {
  const p = new URL(req.url || "/", "http://localhost").pathname;
  const method = req.method || "GET";

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return true;
  }

  // Static routes
  const handlers = staticRoutes[p];
  if (handlers) {
    const handler = handlers[method];
    if (handler) {
      Promise.resolve(handler(req, res, ctx)).catch(e => {
        if (!res.headersSent) error(res, 500, String(e));
      });
      return true;
    }
  }

  // Dynamic routes
  for (const route of dynamicRoutes) {
    if (route.method !== method) continue;
    const m = p.match(route.pattern);
    if (m) {
      Promise.resolve(route.handler(req, res, ctx, m)).catch(e => {
        if (!res.headersSent) error(res, 500, String(e));
      });
      return true;
    }
  }

  return false;
}
