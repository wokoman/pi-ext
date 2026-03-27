import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  startTestServer,
  api,
  apiPost,
  apiPatch,
  apiDelete,
  type TestServer,
} from "../fixtures/test-server.js";

describe("API – threads CRUD", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  }, 15_000);

  afterAll(() => {
    server.cleanup();
  });

  it("GET /api/threads returns empty array initially", async () => {
    const { status, data } = await api(server.base, "/api/threads");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(0);
  });

  it("POST /api/threads creates a thread", async () => {
    const { status, data } = await apiPost(server.base, "/api/threads", {
      file: "hello.ts",
      startLine: 1,
      side: "new",
      body: "This should use a constant",
      severity: "suggestion",
    });
    expect(status).toBe(200);
    expect(data.id).toBeDefined();
    expect(data.file).toBe("hello.ts");
    expect(data.startLine).toBe(1);
    expect(data.status).toBe("open");
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0].body).toBe("This should use a constant");
    expect(data.comments[0].severity).toBe("suggestion");
  });

  it("GET /api/threads lists created threads", async () => {
    const { data } = await api(server.base, "/api/threads");
    expect(data.length).toBeGreaterThanOrEqual(1);
    expect(data[0].file).toBe("hello.ts");
  });

  it("GET /api/threads?file=hello.ts filters by file", async () => {
    // Create a thread on another file
    await apiPost(server.base, "/api/threads", {
      file: "newfile.ts",
      startLine: 1,
      side: "new",
      body: "Another comment",
    });

    const { data: all } = await api(server.base, "/api/threads");
    expect(all.length).toBeGreaterThanOrEqual(2);

    const { data: filtered } = await api(
      server.base,
      "/api/threads?file=hello.ts",
    );
    expect(filtered.every((t: any) => t.file === "hello.ts")).toBe(true);
  });

  it("GET /api/threads/:id returns single thread", async () => {
    const { data: threads } = await api(server.base, "/api/threads");
    const id = threads[0].id;

    const { status, data } = await api(server.base, `/api/threads/${id}`);
    expect(status).toBe(200);
    expect(data.id).toBe(id);
    expect(data.comments).toBeDefined();
  });

  it("GET /api/threads/:id returns 404 for unknown id", async () => {
    const { status, data } = await api(
      server.base,
      "/api/threads/nonexistent",
    );
    expect(status).toBe(404);
    expect(data.error).toBeDefined();
  });

  it("PATCH /api/threads/:id/status resolves a thread", async () => {
    const { data: threads } = await api(server.base, "/api/threads");
    const id = threads[0].id;

    const { status, data } = await apiPatch(
      server.base,
      `/api/threads/${id}/status`,
      { status: "resolved" },
    );
    expect(status).toBe(200);
    expect(data.status).toBe("resolved");
  });

  it("GET /api/threads?status=open filters by status", async () => {
    const { data } = await api(server.base, "/api/threads?status=open");
    expect(data.every((t: any) => t.status === "open")).toBe(true);
  });

  it("PATCH /api/threads/:id/edit edits thread body", async () => {
    const { data: threads } = await api(server.base, "/api/threads");
    const id = threads[0].id;

    const { status, data } = await apiPatch(
      server.base,
      `/api/threads/${id}/edit`,
      { body: "Updated comment text" },
    );
    expect(status).toBe(200);
    // Verify the edit took effect
    const { data: thread } = await api(server.base, `/api/threads/${id}`);
    const lastComment = thread.comments[thread.comments.length - 1];
    expect(lastComment.body).toBe("Updated comment text");
  });

  it("PATCH /api/threads/:id/status returns 404 for unknown id", async () => {
    const { status } = await apiPatch(
      server.base,
      "/api/threads/nonexistent/status",
      { status: "resolved" },
    );
    expect(status).toBe(404);
  });

  it("DELETE /api/threads/:id deletes a thread", async () => {
    // Create a throwaway thread
    const { data: created } = await apiPost(server.base, "/api/threads", {
      file: "hello.ts",
      startLine: 1,
      side: "new",
      body: "To be deleted",
    });

    const { status } = await apiDelete(
      server.base,
      `/api/threads/${created.id}`,
    );
    expect(status).toBe(200);

    // Verify it's gone
    const { status: getStatus } = await api(
      server.base,
      `/api/threads/${created.id}`,
    );
    expect(getStatus).toBe(404);
  });

  it("DELETE /api/threads/:id returns 404 for unknown id", async () => {
    const { status } = await apiDelete(
      server.base,
      "/api/threads/nonexistent",
    );
    expect(status).toBe(404);
  });
});
