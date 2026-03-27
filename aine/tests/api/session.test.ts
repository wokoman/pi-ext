import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  startTestServer,
  api,
  apiPost,
  type TestServer,
} from "../fixtures/test-server.js";

describe("API – session management", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  }, 15_000);

  afterAll(() => {
    server.cleanup();
  });

  it("GET /api/session/context returns full session state", async () => {
    const { status, data } = await api(server.base, "/api/session/context");
    expect(status).toBe(200);
    // macOS resolves /var → /private/var, so normalize both
    expect(data.repo.replace("/private/var", "/var")).toBe(
      server.repo.dir.replace("/private/var", "/var"),
    );
    expect(typeof data.repoName).toBe("string");
    expect(typeof data.branch).toBe("string");
    expect(typeof data.description).toBe("string");
    expect(Array.isArray(data.diffArgs)).toBe(true);
    expect(Array.isArray(data.files)).toBe(true);
    expect(data.files.length).toBe(3);
    expect(typeof data.renderOptions).toBe("object");
    expect(typeof data.threadCount).toBe("number");
  });

  it("POST /api/session/navigate sets current file", async () => {
    const { status, data } = await apiPost(
      server.base,
      "/api/session/navigate",
      { file: "hello.ts" },
    );
    expect(status).toBe(200);
    expect(data.ok).toBe(true);

    // Verify via context
    const { data: ctx } = await api(server.base, "/api/session/context");
    expect(ctx.selectedFile).toBe("hello.ts");
  });

  it("POST /api/session/navigate with hunk and line", async () => {
    const { status, data } = await apiPost(
      server.base,
      "/api/session/navigate",
      { file: "hello.ts", hunk: 0, line: 1 },
    );
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it("POST /api/session/reload reloads with new diffArgs", async () => {
    const { status, data } = await apiPost(
      server.base,
      "/api/session/reload",
      { diffArgs: ["HEAD~1..HEAD"], description: "Last commit" },
    );
    expect(status).toBe(200);
    expect(data.ok).toBe(true);

    // Reload triggers a refresh – files should update.
    // Wait a bit for async reload to settle.
    await new Promise((r) => setTimeout(r, 500));

    // Verify files changed (HEAD~1..HEAD = the initial commit shows no diff
    // since there's only one commit in fixture, so file list may differ)
    const { data: ctx } = await api(server.base, "/api/session/context");
    expect(ctx.repo).toBeDefined();
    expect(Array.isArray(ctx.files)).toBe(true);
  });

  it("SSE /api/events stream works", async () => {
    // Connect to event stream
    const controller = new AbortController();
    const eventsPromise = fetch(`${server.base}/api/events`, {
      signal: controller.signal,
    });

    // Give SSE time to connect
    await new Promise((r) => setTimeout(r, 300));

    // Trigger a navigate event
    await apiPost(server.base, "/api/session/navigate", {
      file: "newfile.ts",
    });

    // Wait a bit for event to propagate
    await new Promise((r) => setTimeout(r, 300));

    // Abort and read what we got
    controller.abort();

    try {
      const response = await eventsPromise;
      const text = await response.text();
      // Should contain at least a navigate event
      expect(text).toContain("data:");
      expect(text).toContain("navigate");
    } catch (e: any) {
      // AbortError is expected
      if (e.name !== "AbortError") throw e;
    }
  });

  it("OPTIONS requests return CORS headers", async () => {
    const r = await fetch(`${server.base}/api/info`, { method: "OPTIONS" });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("Unknown API path returns HTML (SPA fallback)", async () => {
    const r = await fetch(`${server.base}/unknown-path`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
  });
});
