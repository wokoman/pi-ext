/**
 * Archive overlay — TUI for browsing archived sessions.
 *
 * Always-visible search bar at top (like session-switch).
 * Split panel: session list on left, preview on right.
 * Arrow keys navigate list, typing filters, Enter restores.
 */

import type { Component, Focusable } from "@mariozechner/pi-tui";
import { Input, truncateToWidth, visibleWidth, CURSOR_MARKER, matchesKey } from "@mariozechner/pi-tui";
import type { ArchivedSession } from "./types.js";
import { formatBytes, formatDuration, projectName } from "./scanner.js";

export type ArchiveAction = { type: "restore"; sessionId: string } | { type: "delete"; sessionId: string } | { type: "close" };

interface ArchiveOverlayOptions {
  sessions: ArchivedSession[];
  theme: any;
  getTermRows: () => number;
  getTermCols: () => number;
  requestRender: () => void;
  onDone: (action: ArchiveAction) => void;
  onSearch: (query: string) => ArchivedSession[];
}

export class ArchiveOverlay implements Component, Focusable {
  private _focused = false;
  get focused(): boolean {
    return this._focused;
  }
  set focused(value: boolean) {
    this._focused = value;
    this.searchInput.focused = value;
  }

  private allSessions: ArchivedSession[];
  private filteredSessions: ArchivedSession[];
  private selectedIndex = 0;
  private scrollOffset = 0;
  private searchInput: Input;
  private confirmDelete = false;
  private theme: any;
  private getTermRows: () => number;
  private getTermCols: () => number;
  private requestRender: () => void;
  private onDone: (action: ArchiveAction) => void;
  private onSearch: (query: string) => ArchivedSession[];
  private previewScroll = 0;

  constructor(opts: ArchiveOverlayOptions) {
    this.allSessions = opts.sessions;
    this.filteredSessions = opts.sessions;
    this.theme = opts.theme;
    this.getTermRows = opts.getTermRows;
    this.getTermCols = opts.getTermCols;
    this.requestRender = opts.requestRender;
    this.onDone = opts.onDone;
    this.onSearch = opts.onSearch;

    this.searchInput = new Input();
  }

  private doSearch(): void {
    const query = this.searchInput.getValue().trim();
    if (query) {
      this.filteredSessions = this.onSearch(query);
    } else {
      this.filteredSessions = this.allSessions;
    }
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filteredSessions.length - 1));
    this.scrollOffset = 0;
    this.previewScroll = 0;
  }

  handleInput(data: string): void {
    // ── Confirm delete mode ──
    if (this.confirmDelete) {
      if (data === "y" || data === "Y") {
        const session = this.filteredSessions[this.selectedIndex];
        if (session) {
          this.confirmDelete = false;
          this.onDone({ type: "delete", sessionId: session.id });
        }
      } else {
        this.confirmDelete = false;
        this.requestRender();
      }
      return;
    }

    // ── Escape → close ──
    if (matchesKey(data, "escape")) {
      // If there's a search query, clear it first
      if (this.searchInput.getValue()) {
        this.searchInput.setValue("");
        this.doSearch();
        this.requestRender();
        return;
      }
      this.onDone({ type: "close" });
      return;
    }

    // ── Navigation keys (always work, even while typing) ──
    if (matchesKey(data, "up")) {
      this.moveSelection(-1);
      this.requestRender();
      return;
    }

    if (matchesKey(data, "down")) {
      this.moveSelection(1);
      this.requestRender();
      return;
    }

    // ── Enter → restore selected session ──
    if (matchesKey(data, "return")) {
      const session = this.filteredSessions[this.selectedIndex];
      if (session) {
        this.onDone({ type: "restore", sessionId: session.id });
      }
      return;
    }

    // ── Ctrl+D → delete selected session ──
    if (matchesKey(data, "ctrl+d")) {
      if (this.filteredSessions[this.selectedIndex]) {
        this.confirmDelete = true;
        this.requestRender();
      }
      return;
    }

    // ── Ctrl+U → clear search ──
    if (matchesKey(data, "ctrl+u")) {
      this.searchInput.setValue("");
      this.doSearch();
      this.requestRender();
      return;
    }

    // ── Page Up/Down → scroll preview ──
    if (matchesKey(data, "pageDown") || matchesKey(data, "ctrl+f")) {
      this.previewScroll += 10;
      this.requestRender();
      return;
    }
    if (matchesKey(data, "pageUp") || matchesKey(data, "ctrl+b")) {
      this.previewScroll = Math.max(0, this.previewScroll - 10);
      this.requestRender();
      return;
    }

    // ── Tab → cycle through sessions (quick nav) ──
    if (matchesKey(data, "tab")) {
      this.moveSelection(1);
      this.requestRender();
      return;
    }
    if (matchesKey(data, "shift+tab")) {
      this.moveSelection(-1);
      this.requestRender();
      return;
    }

    // ── Everything else → search input (typing filters the list) ──
    this.searchInput.handleInput(data);
    this.doSearch();
    this.requestRender();
  }

  private moveSelection(delta: number): void {
    const len = this.filteredSessions.length;
    if (len === 0) return;

    this.selectedIndex = Math.max(0, Math.min(len - 1, this.selectedIndex + delta));
    this.previewScroll = 0;

    // Adjust scroll to keep selection visible
    const visH = this.getListVisibleCount();
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.scrollOffset + visH) {
      this.scrollOffset = this.selectedIndex - visH + 1;
    }
  }

  /** How many list items fit in the panel */
  private getListVisibleCount(): number {
    return Math.max(3, this.getTermRows() - 12);
  }

  render(width: number): string[] {
    const th = this.theme;
    const lines: string[] = [];
    const innerW = width - 4;
    const leftW = Math.max(30, Math.floor(innerW * 0.45));
    const rightW = innerW - leftW - 1;
    const sep = th.fg("border", "│");

    // ── Title ──
    lines.push("");
    const title = th.bold(th.fg("accent", "📦 Session Archive"));
    const count = th.fg("dim", `(${this.filteredSessions.length}${this.filteredSessions.length !== this.allSessions.length ? "/" + this.allSessions.length : ""} sessions)`);
    lines.push(`  ${title}  ${count}`);
    lines.push("");

    // ── Search bar (always visible, always editable) ──
    const searchLabel = th.fg("accent", "🔍 ");
    const inputLines = this.searchInput.render(innerW - 4);
    lines.push("  " + searchLabel + (inputLines[0] ?? ""));
    lines.push("  " + th.fg("border", "─".repeat(innerW)));

    // ── Split panel ──
    const panelH = this.getListVisibleCount();
    const leftLines = this.renderList(leftW, panelH);
    const rightLines = this.renderPreview(rightW, panelH);

    for (let i = 0; i < panelH; i++) {
      const left = i < leftLines.length ? leftLines[i] : "";
      const right = i < rightLines.length ? rightLines[i] : "";
      lines.push("  " + padToWidth(left, leftW) + sep + padToWidth(right, rightW));
    }

    // ── Footer ──
    lines.push("  " + th.fg("border", "─".repeat(innerW)));

    if (this.confirmDelete) {
      lines.push("  " + th.fg("error", th.bold("⚠ Delete permanently? ")) + th.fg("muted", "(y/n)"));
    } else {
      const hints = [
        [th.fg("dim", "↑↓"), th.fg("muted", "navigate")],
        [th.fg("dim", "Enter"), th.fg("muted", "restore")],
        [th.fg("dim", "^D"), th.fg("muted", "delete")],
        [th.fg("dim", "PgUp/Dn"), th.fg("muted", "scroll preview")],
        [th.fg("dim", "^U"), th.fg("muted", "clear search")],
        [th.fg("dim", "Esc"), th.fg("muted", "close")],
      ];
      lines.push("  " + hints.map(([k, d]) => `${k} ${d}`).join("  "));
    }
    lines.push("");

    return lines;
  }

  private renderList(w: number, h: number): string[] {
    const th = this.theme;
    const lines: string[] = [];
    const sessions = this.filteredSessions;

    if (sessions.length === 0) {
      const msg = this.searchInput.getValue()
        ? "(no matches)"
        : "(no archived sessions)";
      for (let i = 0; i < h; i++) {
        if (i === Math.floor(h / 2)) {
          lines.push(th.fg("dim", "  " + msg));
        } else {
          lines.push("");
        }
      }
      return lines;
    }

    const end = Math.min(sessions.length, this.scrollOffset + h);
    for (let i = this.scrollOffset; i < end; i++) {
      const s = sessions[i];
      const isSel = i === this.selectedIndex;

      const date = new Date(s.lastActivityAt).toISOString().slice(0, 10);
      const proj = padRight(projectName(s.cwd), 12);
      const dur = padLeft(formatDuration(s.durationSeconds), 5);
      const msgs = `${s.userMessageCount}msg`;

      // First line: cursor + date + project + metadata
      let line: string;
      if (isSel) {
        line = th.fg("accent", "▸ ") + th.bold(th.fg("accent", date)) + " " + th.bold(proj);
        line += th.fg("muted", ` ${dur} ${msgs}`);
      } else {
        line = "  " + th.fg("dim", date) + " " + th.fg("muted", proj);
        line += th.fg("dim", ` ${dur} ${msgs}`);
      }
      lines.push(truncateToWidth(line, w));

      // Second line: session name or first message (only for selected)
      if (isSel) {
        const preview = s.name || s.firstMessage.replace(/\n/g, " ") || "(empty)";
        lines.push("  " + th.fg("dim", "  " + truncateToWidth(preview, w - 5)));
      }
    }

    // Scroll indicator if needed
    if (sessions.length > h) {
      while (lines.length < h - 1) lines.push("");
      const pct = Math.round(((this.scrollOffset + 1) / Math.max(1, sessions.length - h + 1)) * 100);
      lines.push(th.fg("dim", `  ${this.scrollOffset + 1}-${end} of ${sessions.length} (${pct}%)`));
    }

    // Pad to height
    while (lines.length < h) lines.push("");
    return lines.slice(0, h);
  }

  private renderPreview(w: number, h: number): string[] {
    const th = this.theme;
    const lines: string[] = [];

    const session = this.filteredSessions[this.selectedIndex];
    if (!session) {
      for (let i = 0; i < h; i++) {
        lines.push(i === Math.floor(h / 2) ? th.fg("dim", " (no session selected)") : "");
      }
      return lines;
    }

    // ── Header ──
    const name = session.name || projectName(session.cwd);
    lines.push(" " + th.bold(th.fg("accent", name)));

    const dateStr = new Date(session.createdAt).toISOString().replace("T", " ").slice(0, 16);
    lines.push(" " + th.fg("dim", dateStr));

    const durStr = formatDuration(session.durationSeconds);
    const msgCount = session.userMessageCount + session.assistantMessageCount;
    lines.push(" " + th.fg("muted", `${durStr} · ${msgCount} msgs · ${formatBytes(session.fileSizeBytes)}`));

    // CWD (truncated)
    const cwdLine = " " + th.fg("dim", truncateToWidth(session.cwd, w - 2));
    lines.push(cwdLine);
    lines.push(" " + th.fg("border", "─".repeat(Math.max(1, w - 2))));

    // ── Conversation text ──
    const headerH = lines.length;
    const contentH = h - headerH;
    if (contentH <= 0) return lines.slice(0, h);

    const rawText = session.fullText || "(no content)";
    const textLines: string[] = [];

    for (const rawLine of rawText.split("\n")) {
      if (rawLine.length <= w - 2) {
        textLines.push(rawLine);
      } else {
        // Word-wrap long lines
        let remaining = rawLine;
        while (remaining.length > w - 2) {
          // Try to break at space
          let breakAt = remaining.lastIndexOf(" ", w - 2);
          if (breakAt <= 0) breakAt = w - 2;
          textLines.push(remaining.slice(0, breakAt));
          remaining = remaining.slice(breakAt).trimStart();
        }
        if (remaining) textLines.push(remaining);
      }
    }

    // Clamp preview scroll
    const maxScroll = Math.max(0, textLines.length - contentH);
    if (this.previewScroll > maxScroll) this.previewScroll = maxScroll;

    const scrolled = textLines.slice(this.previewScroll, this.previewScroll + contentH);
    for (let i = 0; i < contentH; i++) {
      if (i < scrolled.length) {
        lines.push(" " + truncateToWidth(scrolled[i], w - 2));
      } else {
        lines.push("");
      }
    }

    // Preview scroll indicator
    if (textLines.length > contentH && lines.length > 0) {
      const pct = Math.round((this.previewScroll / Math.max(1, maxScroll)) * 100);
      const indicator = th.fg("dim", ` ↕ ${pct}%`);
      lines[lines.length - 1] = indicator;
    }

    return lines.slice(0, h);
  }

  invalidate(): void {}
}

function padRight(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
}

function padLeft(s: string, w: number): string {
  return s.length >= w ? s : " ".repeat(w - s.length) + s;
}

function padToWidth(s: string, w: number): string {
  const vis = visibleWidth(s);
  if (vis >= w) return truncateToWidth(s, w);
  return s + " ".repeat(w - vis);
}
