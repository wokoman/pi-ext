/**
 * Aine configuration loader.
 *
 * Reads from (in order of priority, later wins):
 *   1. ~/.config/aine/config.toml   (global)
 *   2. .aine/config.toml            (per-repo, relative to repo root)
 *   3. CLI flags                    (highest priority, applied by caller)
 *
 * Simple TOML subset parser — no dependencies needed.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface AineConfig {
  mode: "split" | "unified";
  port: number;
  watch: boolean;
  open_browser: boolean;
  theme: string;
  expand_unchanged: boolean;
  ignore_whitespace: boolean;
}

const DEFAULTS: AineConfig = {
  mode: "split",
  port: 5491,
  watch: false,
  open_browser: true,
  theme: "catppuccin-mocha",
  expand_unchanged: true,
  ignore_whitespace: false,
};

const GLOBAL_CONFIG = join(homedir(), ".config", "aine", "config.toml");

/** Minimal TOML parser — handles key = value lines. */
function parseToml(content: string): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("[")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    const commentIdx = val.indexOf(" #");
    if (commentIdx > 0) val = val.slice(0, commentIdx).trim();
    if (val === "true") result[key] = true;
    else if (val === "false") result[key] = false;
    else if (/^-?\d+$/.test(val)) result[key] = parseInt(val, 10);
    else if (/^-?\d+\.\d+$/.test(val)) result[key] = parseFloat(val);
    else result[key] = val.replace(/^["']|["']$/g, "");
  }
  return result;
}

function loadTomlFile(path: string): Record<string, any> {
  try { return parseToml(readFileSync(path, "utf-8")); }
  catch { return {}; }
}

/** Type-safe merge: only applies values that match the type in DEFAULTS. */
function applySource(target: AineConfig, source: Record<string, any>) {
  for (const key of Object.keys(DEFAULTS) as (keyof AineConfig)[]) {
    if (key in source && typeof source[key] === typeof DEFAULTS[key]) {
      (target as any)[key] = source[key];
    }
  }
}

/**
 * Load merged config: defaults ← global ← per-repo.
 * CLI flags are applied by the caller after this.
 */
export function loadConfig(repoRoot?: string): AineConfig {
  const merged = { ...DEFAULTS };
  applySource(merged, loadTomlFile(GLOBAL_CONFIG));
  if (repoRoot) applySource(merged, loadTomlFile(join(repoRoot, ".aine", "config.toml")));
  return merged;
}
