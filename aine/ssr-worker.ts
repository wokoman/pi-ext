/**
 * Persistent Bun subprocess for SSR diff rendering.
 * Protocol: JSON lines over stdin/stdout.
 *
 * Init:     { "id": 0, "initTheme": { name, shikiTheme, unsafeCSS } }
 * Request:  { "id": 1, "oldFile": {...}, "newFile": {...}, "options": {...} }
 * Response: { "id": 1, "html": "..." }  or  { "id": 1, "error": "..." }
 * Ready:    { "id": 0, "ready": true }
 * Preload:  { "id": -1, "preloadLangs": ["python", "go", ...] }
 */

import { createInterface } from "node:readline";
import { preloadDiffHTML } from "@pierre/diffs/ssr";
import { registerCustomTheme, preloadHighlighter } from "@pierre/diffs";

// Suppress EPIPE errors when parent process kills us
process.on("uncaughtException", (err: any) => {
  if (err?.code === "EPIPE") process.exit(0);
  throw err;
});
process.stdout.on("error", (err: any) => {
  if (err?.code === "EPIPE") process.exit(0);
});

let THEME_NAME = "aine-theme";
let UNSAFE_CSS = "";
let DEFAULT_OPTIONS: Record<string, any> = {
  diffIndicators: "none" as const,
  diffStyle: "split" as const,
  expandUnchanged: true,
};

function buildUnsafeCSS(addBorder: string, deleteBorder: string): string {
  return `
  [data-line-type='change-addition'] {
    box-shadow: inset 0 1px 0 ${addBorder}, inset 0 -1px 0 ${addBorder};
  }
  [data-line-type='change-addition'] + [data-line-type='change-addition'] {
    box-shadow: inset 0 -1px 0 ${addBorder};
  }
  [data-line-type='change-addition']:has(+ [data-line-type='change-addition']) {
    box-shadow: inset 0 1px 0 ${addBorder};
  }
  [data-line-type='change-addition'] + [data-line-type='change-addition']:has(+ [data-line-type='change-addition']) {
    box-shadow: none;
  }
  [data-line-type='change-deletion'] {
    box-shadow: inset 0 1px 0 ${deleteBorder}, inset 0 -1px 0 ${deleteBorder};
  }
  [data-line-type='change-deletion'] + [data-line-type='change-deletion'] {
    box-shadow: inset 0 -1px 0 ${deleteBorder};
  }
  [data-line-type='change-deletion']:has(+ [data-line-type='change-deletion']) {
    box-shadow: inset 0 1px 0 ${deleteBorder};
  }
  [data-line-type='change-deletion'] + [data-line-type='change-deletion']:has(+ [data-line-type='change-deletion']) {
    box-shadow: none;
  }
`;
}

const rl = createInterface({ input: process.stdin });
let initialized = false;

for await (const line of rl) {
  if (!line.trim()) continue;
  let req: any;
  try {
    req = JSON.parse(line);
  } catch {
    continue;
  }

  // Init message with theme data
  if (req.initTheme && !initialized) {
    initialized = true;
    const { name, shikiTheme, addBorder, deleteBorder } = req.initTheme;
    THEME_NAME = name || "aine-theme";
    UNSAFE_CSS = buildUnsafeCSS(
      addBorder || "rgba(166, 227, 161, 0.25)",
      deleteBorder || "rgba(243, 139, 168, 0.25)",
    );
    DEFAULT_OPTIONS = {
      ...DEFAULT_OPTIONS,
      theme: THEME_NAME,
      unsafeCSS: UNSAFE_CSS,
    };

    if (shikiTheme && Object.keys(shikiTheme).length > 0) {
      registerCustomTheme(THEME_NAME, async () => ({
        ...shikiTheme,
        name: THEME_NAME,
      }));
    }

    await preloadHighlighter({
      themes: [THEME_NAME],
      langs: [
        "typescript", "javascript", "tsx", "jsx",
        "json", "yaml", "toml", "markdown",
        "css", "html", "svelte",
        "python", "go", "rust", "bash", "shell",
      ],
    }).catch(() => {});

    // Warmup
    await preloadDiffHTML({
      oldFile: { name: "warmup.ts", contents: "const x = 1;" },
      newFile: { name: "warmup.ts", contents: "const x = 2;" },
      options: DEFAULT_OPTIONS,
    }).catch(() => {});

    try { process.stdout.write(JSON.stringify({ id: 0, ready: true }) + "\n"); } catch {}
    continue;
  }

  // Language preload
  if (req.preloadLangs) {
    preloadHighlighter({ themes: [], langs: req.preloadLangs }).catch(() => {});
    continue;
  }

  // Render request
  (async (r: any) => {
    try {
      const opts = { ...DEFAULT_OPTIONS, ...r.options };
      const html = await preloadDiffHTML({
        oldFile: r.oldFile,
        newFile: r.newFile,
        options: opts,
        annotations: r.annotations,
      });
      try { process.stdout.write(JSON.stringify({ id: r.id, html }) + "\n"); } catch {}
    } catch (e) {
      try { process.stdout.write(JSON.stringify({ id: r.id, error: String(e) }) + "\n"); } catch {}
    }
  })(req);
}
