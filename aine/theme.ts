/**
 * Theme loader for Aine.
 *
 * Theme search order:
 *   1. .aine/themes/<name>.json       (per-repo)
 *   2. ~/.config/aine/themes/<name>.json  (user custom)
 *   3. <aine>/themes/<name>.json      (built-in)
 *
 * A theme file is a shiki-compatible JSON theme with an optional "aine" section
 * for UI chrome colors. Minimal theme (just UI colors):
 *
 *   {
 *     "name": "my-theme",
 *     "type": "dark",
 *     "aine": {
 *       "bg": "#1e1e2e",
 *       "sidebar": "#1e1e2e",
 *       "text": "#cdd6f4",
 *       "muted": "#7f849c",
 *       "accent": "#89b4fa",
 *       "border": "#313244",
 *       "add": "#a6e3a1",
 *       "delete": "#f38ba8",
 *       "modified": "#f9e2af"
 *     }
 *   }
 *
 * Full themes include shiki tokenColors for syntax highlighting.
 * If no tokenColors are present, the built-in catppuccin-mocha is used as fallback.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { ThemeColors } from "./types.js";



const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILTIN_THEMES_DIR = join(__dirname, "themes");
const USER_THEMES_DIR = join(homedir(), ".config", "aine", "themes");

export interface LoadedTheme {
  name: string;
  type: "dark" | "light";
  /** Full shiki theme data (for SSR worker). */
  shikiTheme: Record<string, any>;
  /** UI chrome colors. */
  ui: ThemeColors;
}

const DEFAULT_UI: ThemeColors = {
  bg: "#15131e",
  sidebar: "#15131e",
  hover: "#2a2440",
  active: "#45475a",
  text: "#cdd6f4",
  muted: "#7f849c",
  accent: "#cba6f7",
  border: "#313244",
  add: "#a6e3a1",
  delete: "#f38ba8",
  modified: "#f9e2af",
  addBg: "rgba(166, 227, 161, 0.07)",
  deleteBg: "rgba(243, 139, 168, 0.07)",
  addBorder: "rgba(166, 227, 161, 0.25)",
  deleteBorder: "rgba(243, 139, 168, 0.25)",
};

function tryLoadJson(path: string): any | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Load a theme by name. Searches repo → user → built-in directories.
 * Falls back to catppuccin-mocha if not found.
 */
export function loadTheme(name: string, repoRoot?: string): LoadedTheme {
  const filename = name.endsWith(".json") ? name : `${name}.json`;

  // Search order
  const candidates: string[] = [];
  if (repoRoot) candidates.push(join(repoRoot, ".aine", "themes", filename));
  candidates.push(join(USER_THEMES_DIR, filename));
  candidates.push(join(BUILTIN_THEMES_DIR, filename));

  let themeData: any = null;
  for (const path of candidates) {
    themeData = tryLoadJson(path);
    if (themeData) break;
  }

  // Fallback to built-in catppuccin
  if (!themeData) {
    themeData = tryLoadJson(join(BUILTIN_THEMES_DIR, "catppuccin-mocha.json"));
  }

  if (!themeData) {
    // Absolute fallback — return defaults with no shiki theme
    return {
      name: "catppuccin-mocha",
      type: "dark",
      shikiTheme: {},
      ui: { ...DEFAULT_UI },
    };
  }

  // Extract aine UI colors
  const aineSection = themeData.aine || {};
  const ui: ThemeColors = { ...DEFAULT_UI };
  for (const key of Object.keys(DEFAULT_UI) as (keyof ThemeColors)[]) {
    if (typeof aineSection[key] === "string") {
      ui[key] = aineSection[key];
    }
  }

  // Build shiki theme (everything except aine section)
  const { aine: _, ...shikiTheme } = themeData;

  // If theme has no tokenColors (UI-only theme), load catppuccin as shiki base
  if (!shikiTheme.tokenColors && !shikiTheme.settings) {
    const base = tryLoadJson(join(BUILTIN_THEMES_DIR, "catppuccin-mocha.json"));
    if (base) {
      const { aine: __, ...baseShiki } = base;
      shikiTheme.tokenColors = baseShiki.tokenColors;
      shikiTheme.semanticHighlighting = baseShiki.semanticHighlighting;
      shikiTheme.semanticTokenColors = baseShiki.semanticTokenColors;
      if (!shikiTheme.colors) shikiTheme.colors = baseShiki.colors;
    }
  }

  // Override editor.background with aine.bg
  if (!shikiTheme.colors) shikiTheme.colors = {};
  shikiTheme.colors["editor.background"] = ui.bg;

  return {
    name: themeData.name || name,
    type: themeData.type || "dark",
    shikiTheme,
    ui,
  };
}


