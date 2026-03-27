import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  startTestServer,
  api,
  apiPost,
  type TestServer,
} from "../fixtures/test-server.js";

describe("API – basic endpoints", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  }, 15_000);

  afterAll(() => {
    server.cleanup();
  });

  it("GET /api/info returns repo info", async () => {
    const { status, data } = await api(server.base, "/api/info");
    expect(status).toBe(200);
    expect(data.name).toMatch(/aine-test-/);
    expect(typeof data.branch).toBe("string");
    expect(data.fileCount).toBe(3); // modified, added, deleted
    expect(typeof data.description).toBe("string");
  });

  it("GET /api/files returns changed files", async () => {
    const { status, data } = await api(server.base, "/api/files");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(3);

    const paths = data.map((f: any) => f.path).sort();
    expect(paths).toEqual(["hello.ts", "newfile.ts", "utils.ts"]);

    const hello = data.find((f: any) => f.path === "hello.ts");
    expect(hello.status).toBe("modified");

    const newfile = data.find((f: any) => f.path === "newfile.ts");
    expect(newfile.status).toBe("added");

    const utils = data.find((f: any) => f.path === "utils.ts");
    expect(utils.status).toBe("deleted");
  });

  it("GET /api/theme returns theme colors", async () => {
    const { status, data } = await api(server.base, "/api/theme");
    expect(status).toBe(200);
    expect(typeof data.bg).toBe("string");
    expect(typeof data.text).toBe("string");
    expect(typeof data.accent).toBe("string");
  });

  it("GET /api/options returns render options", async () => {
    const { status, data } = await api(server.base, "/api/options");
    expect(status).toBe(200);
    expect(data.diffStyle).toMatch(/^(split|unified)$/);
    expect(typeof data.expandUnchanged).toBe("boolean");
    expect(typeof data.ignoreWhitespace).toBe("boolean");
  });

  it("POST /api/options updates and returns new options", async () => {
    const { status, data } = await apiPost(server.base, "/api/options", {
      diffStyle: "unified",
    });
    expect(status).toBe(200);
    expect(data.diffStyle).toBe("unified");

    // Verify it persisted
    const { data: opts2 } = await api(server.base, "/api/options");
    expect(opts2.diffStyle).toBe("unified");

    // Reset
    await apiPost(server.base, "/api/options", { diffStyle: "split" });
  });

  it("GET /api/diff/:path returns HTML diff for modified file", async () => {
    const { status, data } = await api(
      server.base,
      "/api/diff/" + encodeURIComponent("hello.ts"),
    );
    expect(status).toBe(200);
    expect(data.file.path).toBe("hello.ts");
    expect(typeof data.html).toBe("string");
    expect(data.html.length).toBeGreaterThan(0);
  });

  it("GET /api/diff/:path returns HTML diff for added file", async () => {
    const { status, data } = await api(
      server.base,
      "/api/diff/" + encodeURIComponent("newfile.ts"),
    );
    expect(status).toBe(200);
    expect(data.file.path).toBe("newfile.ts");
    expect(data.html).toContain("newFile");
  });

  it("GET /api/diff/:path returns HTML diff for deleted file", async () => {
    const { status, data } = await api(
      server.base,
      "/api/diff/" + encodeURIComponent("utils.ts"),
    );
    expect(status).toBe(200);
    expect(data.file.path).toBe("utils.ts");
    expect(data.html).toContain("add");
  });

  it("GET /api/diff/:path returns 404 for unknown file", async () => {
    const { status, data } = await api(
      server.base,
      "/api/diff/" + encodeURIComponent("nonexistent.ts"),
    );
    expect(status).toBe(404);
    expect(data.error).toBeDefined();
  });

  it("GET /api/refresh returns ok", async () => {
    const { status, data } = await api(server.base, "/api/refresh");
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it("GET /api/preload-status returns preload info", async () => {
    const { status, data } = await api(server.base, "/api/preload-status");
    expect(status).toBe(200);
    expect(typeof data.cached).toBe("number");
    expect(typeof data.total).toBe("number");
    expect(typeof data.preloading).toBe("boolean");
  });
});
