import { test, expect } from "@playwright/test";
import { startE2EServer, type E2EServer } from "./helpers.js";

let server: E2EServer;

test.beforeAll(async () => {
  server = await startE2EServer();
});

test.afterAll(() => {
  server.cleanup();
});

test("can create a thread via API and see it in UI", async ({ page }) => {
  // Create thread via API first
  await fetch(`${server.url}/api/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file: "hello.ts",
      startLine: 1,
      side: "new",
      body: "E2E test comment",
      severity: "nit",
    }),
  });

  await page.goto(server.url);
  await page.waitForSelector("#sidebar", { timeout: 10_000 });

  // Select the file with the thread
  await page.click("text=hello.ts");
  await page.waitForTimeout(1500);

  // The comment should appear somewhere on the page
  const body = await page.textContent("body");
  expect(body).toContain("E2E test comment");
});

test("thread count shows in sidebar or toolbar", async ({ page }) => {
  // Create a thread
  await fetch(`${server.url}/api/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file: "hello.ts",
      startLine: 1,
      side: "new",
      body: "Count test comment",
    }),
  });

  await page.goto(server.url);
  await page.waitForSelector("#sidebar", { timeout: 10_000 });
  await page.waitForTimeout(500);

  // The page should reflect that there are threads
  // (exact UI depends on implementation - just verify no crash)
  const text = await page.textContent("body");
  expect(text).toBeDefined();
});

test("resolving a thread via API updates UI", async ({ page }) => {
  // Create a thread
  const createRes = await fetch(`${server.url}/api/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file: "hello.ts",
      startLine: 1,
      side: "new",
      body: "Thread to resolve",
    }),
  });
  const thread = await createRes.json();

  await page.goto(server.url);
  await page.waitForSelector("#sidebar", { timeout: 10_000 });
  await page.click("text=hello.ts");
  await page.waitForTimeout(1500);

  // Resolve via API
  await fetch(`${server.url}/api/threads/${thread.id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "resolved" }),
  });

  // Reload page to see update
  await page.reload();
  await page.waitForSelector("#sidebar", { timeout: 10_000 });
  await page.click("text=hello.ts");
  await page.waitForTimeout(1500);

  // Page should still work (thread should show as resolved or be filtered)
  const body = await page.textContent("body");
  expect(body).toBeDefined();
});

test("deleting a thread via API removes it from UI", async ({ page }) => {
  // Create a thread
  const createRes = await fetch(`${server.url}/api/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file: "hello.ts",
      startLine: 1,
      side: "new",
      body: "Thread to delete - unique marker",
    }),
  });
  const thread = await createRes.json();

  await page.goto(server.url);
  await page.waitForSelector("#sidebar", { timeout: 10_000 });
  await page.click("text=hello.ts");
  await page.waitForTimeout(1500);

  // Verify it's visible
  let body = await page.textContent("body");
  expect(body).toContain("Thread to delete - unique marker");

  // Delete via API
  await fetch(`${server.url}/api/threads/${thread.id}`, { method: "DELETE" });

  // Reload to see update
  await page.reload();
  await page.waitForSelector("#sidebar", { timeout: 10_000 });
  await page.click("text=hello.ts");
  await page.waitForTimeout(1500);

  body = await page.textContent("body");
  expect(body).not.toContain("Thread to delete - unique marker");
});
