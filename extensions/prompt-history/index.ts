/**
 * prompt-history — Persistent input history across sessions
 *
 * Saves user prompts to ~/.pi/agent/prompt-history.jsonl so they
 * survive pi restarts. On session start, loads history into the
 * editor so ↑/↓ arrow navigation works immediately.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { readFileSync, appendFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const HISTORY_FILE = `${process.env.HOME}/.pi/agent/prompt-history.jsonl`;
const MAX_HISTORY = 500;

interface HistoryEntry {
  text: string;
  timestamp: number;
}

/** Load history from disk */
function loadHistory(): string[] {
  try {
    if (!existsSync(HISTORY_FILE)) return [];
    const raw = readFileSync(HISTORY_FILE, "utf-8");
    const entries: string[] = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as HistoryEntry;
        if (entry.text?.trim()) {
          entries.push(entry.text);
        }
      } catch {
        // Skip malformed lines
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/** Append a prompt to history file */
function savePrompt(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  // Don't save slash commands (except /skill: which may contain useful context)
  if (trimmed.startsWith("/") && !trimmed.startsWith("/skill:")) return;

  const entry: HistoryEntry = { text: trimmed, timestamp: Date.now() };

  try {
    mkdirSync(dirname(HISTORY_FILE), { recursive: true });
    appendFileSync(HISTORY_FILE, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Silently fail
  }

  // Compact if too large (keep last MAX_HISTORY entries)
  try {
    const all = loadHistory();
    if (all.length > MAX_HISTORY * 1.5) {
      const kept = all.slice(all.length - MAX_HISTORY);
      const lines = kept.map((text) => JSON.stringify({ text, timestamp: 0 }));
      writeFileSync(HISTORY_FILE, lines.join("\n") + "\n", "utf-8");
    }
  } catch {
    // Silently fail
  }
}

/** Deduplicate while preserving order (last occurrence wins) */
function dedup(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  // Walk backwards so last occurrence is kept
  for (let i = items.length - 1; i >= 0; i--) {
    if (!seen.has(items[i])) {
      seen.add(items[i]);
      result.unshift(items[i]);
    }
  }
  return result;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    // Load persisted history
    const diskHistory = dedup(loadHistory());

    // Install custom editor that includes persisted history
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const editor = new CustomEditor(tui, theme, keybindings);

      // Populate editor history from disk (oldest first, so most recent is at top)
      for (const text of diskHistory) {
        editor.addToHistory(text);
      }

      return editor;
    });
  });

  // Save prompts on submission via input event
  pi.on("input", async (event) => {
    if (event.text?.trim()) {
      savePrompt(event.text);
    }
    return { action: "continue" as const };
  });
}
