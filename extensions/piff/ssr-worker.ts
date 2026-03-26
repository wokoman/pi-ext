/**
 * Persistent Bun subprocess for SSR diff rendering.
 * Protocol: JSON lines over stdin/stdout.
 *
 * Request:  { "id": 1, "oldFile": { "name": "...", "contents": "..." }, "newFile": { ... }, "options": { ... } }
 * Response: { "id": 1, "html": "..." }  or  { "id": 1, "error": "..." }
 * Ready:    { "id": 0, "ready": true }
 * Preload:  { "id": -1, "preloadLangs": ["python", "go", ...] }
 */

import { createInterface } from "node:readline";
import { preloadDiffHTML } from "@pierre/diffs/ssr";
import { registerCustomTheme, preloadHighlighter } from "@pierre/diffs";
import altCatppuccinMocha from "./alt-catppuccin-mocha.json";

const THEME_NAME = "alt-catppuccin-mocha";
registerCustomTheme(THEME_NAME, async () => ({
  ...(altCatppuccinMocha as any),
  name: THEME_NAME,
  colors: {
    ...(altCatppuccinMocha as any).colors,
    "editor.background": "#15131E",
  },
}));

const UNSAFE_CSS = `
  [data-line-type='change-addition'] {
    box-shadow: inset 0 1px 0 rgba(166, 227, 161, 0.25), inset 0 -1px 0 rgba(166, 227, 161, 0.25);
  }
  [data-line-type='change-addition'] + [data-line-type='change-addition'] {
    box-shadow: inset 0 -1px 0 rgba(166, 227, 161, 0.25);
  }
  [data-line-type='change-addition']:has(+ [data-line-type='change-addition']) {
    box-shadow: inset 0 1px 0 rgba(166, 227, 161, 0.25);
  }
  [data-line-type='change-addition'] + [data-line-type='change-addition']:has(+ [data-line-type='change-addition']) {
    box-shadow: none;
  }

  [data-line-type='change-deletion'] {
    box-shadow: inset 0 1px 0 rgba(243, 139, 168, 0.25), inset 0 -1px 0 rgba(243, 139, 168, 0.25);
  }
  [data-line-type='change-deletion'] + [data-line-type='change-deletion'] {
    box-shadow: inset 0 -1px 0 rgba(243, 139, 168, 0.25);
  }
  [data-line-type='change-deletion']:has(+ [data-line-type='change-deletion']) {
    box-shadow: inset 0 1px 0 rgba(243, 139, 168, 0.25);
  }
  [data-line-type='change-deletion'] + [data-line-type='change-deletion']:has(+ [data-line-type='change-deletion']) {
    box-shadow: none;
  }
`;

const DEFAULT_OPTIONS = {
  theme: THEME_NAME,
  diffIndicators: "none" as const,
  diffStyle: "split" as const,
  expandUnchanged: true,
  unsafeCSS: UNSAFE_CSS,
};

// Preload common languages to avoid lazy-load delays during rendering
await preloadHighlighter({
  themes: [THEME_NAME],
  langs: [
    "typescript", "javascript", "tsx", "jsx",
    "json", "yaml", "toml", "markdown",
    "css", "html", "svelte",
    "python", "go", "rust", "bash", "shell",
  ],
}).catch(() => {});

// Warmup with a tiny diff to initialize rendering pipeline
await preloadDiffHTML({
  oldFile: { name: "warmup.ts", contents: "const x = 1;" },
  newFile: { name: "warmup.ts", contents: "const x = 2;" },
  options: DEFAULT_OPTIONS,
}).catch(() => {});

process.stdout.write(JSON.stringify({ id: 0, ready: true }) + "\n");

const rl = createInterface({ input: process.stdin });

for await (const line of rl) {
  if (!line.trim()) continue;
  let req: any;
  try {
    req = JSON.parse(line);
  } catch {
    continue;
  }

  // Handle language preload requests
  if (req.preloadLangs) {
    preloadHighlighter({ themes: [], langs: req.preloadLangs }).catch(() => {});
    continue;
  }

  (async (r: any) => {
    try {
      const opts = { ...DEFAULT_OPTIONS, ...r.options };
      const html = await preloadDiffHTML({
        oldFile: r.oldFile,
        newFile: r.newFile,
        options: opts,
      });
      process.stdout.write(JSON.stringify({ id: r.id, html }) + "\n");
    } catch (e) {
      process.stdout.write(JSON.stringify({ id: r.id, error: String(e) }) + "\n");
    }
  })(req);
}
