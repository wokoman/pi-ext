/**
 * prompt-history — Persistent input history across pi sessions
 *
 * Problem: pi's editor history lives only in memory. When you restart pi
 * (without /resume), ↑/↓ arrow history is empty.
 *
 * Solution: save prompts to ~/.pi/agent/prompt-history.jsonl and pre-populate
 * the editor on startup. Uses setEditorComponent with CustomEditor (the same
 * class pi uses internally) — the only way to call addToHistory() on the editor.
 *
 * Startup order (verified in interactive-mode.js):
 *   1. initExtensions() → session_start → we install editor with disk history
 *   2. renderInitialMessages() → populateHistory → adds session history on top
 * So both disk history (cross-session) and session history (current) coexist.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { writeFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";

const HISTORY_FILE = `${process.env.HOME}/.pi/agent/prompt-history.jsonl`;
const MAX_HISTORY = 500;

/** Load prompt history from disk. Returns oldest-first. */
function loadHistory(): string[] {
  try {
    if (!existsSync(HISTORY_FILE)) return [];
    const raw = readFileSync(HISTORY_FILE, "utf-8");
    const items: string[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.t?.trim()) items.push(entry.t);
      } catch { /* skip */ }
    }
    // Deduplicate keeping last occurrence
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (let i = items.length - 1; i >= 0; i--) {
      if (!seen.has(items[i])) {
        seen.add(items[i]);
        deduped.unshift(items[i]);
      }
    }
    return deduped.slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

/** Track entries written this session to know when to compact */
let entriesWrittenThisSession = 0;

/** Append a prompt to history file (async, fire-and-forget) */
function savePrompt(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  // Skip slash commands
  if (trimmed.startsWith("/")) return;

  mkdirSync(dirname(HISTORY_FILE), { recursive: true });
  appendFile(HISTORY_FILE, JSON.stringify({ t: trimmed }) + "\n", "utf-8").catch(() => {});

  entriesWrittenThisSession++;
  // Compact once per session if the file has grown a lot
  if (entriesWrittenThisSession === 100) {
    compactHistory();
  }
}

/** Rewrite history file keeping only last MAX_HISTORY unique entries */
function compactHistory(): void {
  const items = loadHistory(); // already deduped and sliced
  const lines = items.map((t) => JSON.stringify({ t }));
  writeFile(HISTORY_FILE, lines.join("\n") + "\n", "utf-8").catch(() => {});
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    const diskHistory = loadHistory();
    if (diskHistory.length === 0) return; // Nothing to inject, keep default editor

    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor = new CustomEditor(tui, theme, keybindings);

      // Populate: oldest first so most recent ends up at ↑ position 0
      for (const text of diskHistory) {
        editor.addToHistory(text);
      }

      // After this, pi calls renderInitialMessages() which adds
      // current session's history on top via the same addToHistory()
      return editor;
    });
  });

  // Capture user prompts
  pi.on("input", async (event) => {
    if (event.text?.trim()) {
      savePrompt(event.text);
    }
    return { action: "continue" as const };
  });
}
