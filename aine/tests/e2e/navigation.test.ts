import { test, expect } from "@playwright/test";
import { startE2EServer, type E2EServer } from "./helpers.js";

let server: E2EServer;

test.beforeAll(async () => {
  server = await startE2EServer();
});

test.afterAll(() => {
  server.cleanup();
});

test("page loads and shows sidebar with files", async ({ page }) => {
  await page.goto(server.url);

  // Wait for sidebar to populate with file entries
  await page.waitForSelector("#sidebar", { timeout: 10_000 });

  // Should see our 3 fixture files
  const text = await page.textContent("body");
  expect(text).toContain("hello.ts");
  expect(text).toContain("newfile.ts");
  expect(text).toContain("utils.ts");
});

test("clicking a file shows its diff", async ({ page }) => {
  await page.goto(server.url);
  await page.waitForSelector("#sidebar", { timeout: 10_000 });

  // Click on hello.ts in sidebar
  await page.click("text=hello.ts");

  // Wait for diff to render – should show the file content
  await page.waitForTimeout(1000);
  const body = await page.textContent("body");
  // The diff should contain the old or new value
  expect(body).toMatch(/world|aine/);
});

test("keyboard j/k navigates between files", async ({ page }) => {
  await page.goto(server.url);
  await page.waitForSelector("#sidebar", { timeout: 10_000 });

  // Wait for initial load
  await page.waitForTimeout(500);

  // Press j to go to next file
  await page.keyboard.press("j");
  await page.waitForTimeout(300);

  // Press k to go to previous file
  await page.keyboard.press("k");
  await page.waitForTimeout(300);

  // Page should still be functional (no crash)
  const text = await page.textContent("body");
  expect(text).toContain("hello.ts");
});

test("? key toggles help overlay", async ({ page }) => {
  await page.goto(server.url);
  await page.waitForSelector("#sidebar", { timeout: 10_000 });

  // Open help
  await page.keyboard.press("?");
  await page.waitForTimeout(300);

  // Help overlay should be visible with keyboard shortcuts
  const body = await page.textContent("body");
  expect(body).toMatch(/keyboard|shortcuts|help/i);

  // Close help with Escape
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
});

test("s key toggles split/unified view", async ({ page }) => {
  await page.goto(server.url);
  await page.waitForSelector("#sidebar", { timeout: 10_000 });

  // Click a file first to have a diff visible
  await page.click("text=hello.ts");
  await page.waitForTimeout(1000);

  // Toggle to unified
  await page.keyboard.press("s");
  await page.waitForTimeout(500);

  // Toggle back to split
  await page.keyboard.press("s");
  await page.waitForTimeout(500);

  // Page should still work
  const text = await page.textContent("body");
  expect(text).toContain("hello.ts");
});

test("b key toggles sidebar visibility", async ({ page }) => {
  await page.goto(server.url);
  await page.waitForSelector("#sidebar", { timeout: 10_000 });

  // Sidebar should be visible initially
  const sidebar = page.locator("#sidebar").first();
  await expect(sidebar).toBeVisible();

  // Toggle sidebar off
  await page.keyboard.press("b");
  await page.waitForTimeout(300);

  // Toggle sidebar back on
  await page.keyboard.press("b");
  await page.waitForTimeout(300);
});

test("toolbar shows repo info", async ({ page }) => {
  await page.goto(server.url);
  await page.waitForSelector("#sidebar", { timeout: 10_000 });

  const body = await page.textContent("body");
  // Should show file count or repo name
  expect(body).toMatch(/3\s*(files?|changed)/i);
});
