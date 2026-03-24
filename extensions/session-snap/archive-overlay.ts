/**
 * Archive overlay — TUI for browsing archived sessions.
 *
 * Split panel: session list on left, preview on right.
 * Supports search, restore, and permanent delete.
 */

import type { Component, Focusable } from "@mariozechner/pi-tui";
import { Input, truncateToWidth, visibleWidth, CURSOR_MARKER } from "@mariozechner/pi-tui";
import type { ArchivedSession } from "./types.js";
import { formatBytes, formatDuration, projectName } from "./scanner.js";

export type ArchiveAction = { type: "restore"; sessionId: string } | { type: "delete"; sessionId: string } | { type: "close" };

interface ArchiveOverlayOptions {
  sessions: ArchivedSession[];
  theme: any;
  getTermRows: () => number;
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

  private sessions: ArchivedSession[];
  private selectedIndex = 0;
  private scrollOffset = 0;
  private searchInput: Input;
  private searchMode = false;
  private confirmDelete = false;
  private theme: any;
  private getTermRows: () => number;
  private requestRender: () => void;
  private onDone: (action: ArchiveAction) => void;
  private onSearch: (query: string) => ArchivedSession[];
  private previewScroll = 0;

  constructor(opts: ArchiveOverlayOptions) {
    this.sessions = opts.sessions;
    this.theme = opts.theme;
    this.getTermRows = opts.getTermRows;
    this.requestRender = opts.requestRender;
    this.onDone = opts.onDone;
    this.onSearch = opts.onSearch;

    this.searchInput = new Input();
    this.searchInput.onSubmit = () => {
      const query = this.searchInput.getValue();
      this.sessions = this.onSearch(query);
      this.selectedIndex = 0;
      this.scrollOffset = 0;
      this.searchMode = false;
      this.requestRender();
    };
    this.searchInput.onEscape = () => {
      this.searchMode = false;
      this.searchInput.setValue("");
      this.sessions = this.onSearch("");
      this.selectedIndex = 0;
      this.scrollOffset = 0;
      this.requestRender();
    };
  }

  handleInput(data: string): void {
    if (this.searchMode) {
      this.searchInput.handleInput(data);
      // Live search as user types
      const query = this.searchInput.getValue();
      this.sessions = this.onSearch(query);
      this.selectedIndex = 0;
      this.scrollOffset = 0;
      this.requestRender();
      return;
    }

    if (this.confirmDelete) {
      if (data === "y" || data === "Y") {
        const session = this.sessions[this.selectedIndex];
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

    if (data === "\x1b" || data === "\x1b[" || data === "q") {
      this.onDone({ type: "close" });
      return;
    }

    if (data === "/" || data === "s") {
      this.searchMode = true;
      this.searchInput.focused = true;
      this.requestRender();
      return;
    }

    if (data === "\x1b[A" || data === "k") {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        this.previewScroll = 0;
        if (this.selectedIndex < this.scrollOffset) {
          this.scrollOffset = this.selectedIndex;
        }
      }
      this.requestRender();
      return;
    }

    if (data === "\x1b[B" || data === "j") {
      if (this.selectedIndex < this.sessions.length - 1) {
        this.selectedIndex++;
        this.previewScroll = 0;
        const visH = this.getListHeight();
        if (this.selectedIndex >= this.scrollOffset + visH) {
          this.scrollOffset = this.selectedIndex - visH + 1;
        }
      }
      this.requestRender();
      return;
    }

    // Scroll preview
    if (data === "\x1b[6~" || data === "l") {
      // Page Down / l → scroll preview down
      this.previewScroll += 5;
      this.requestRender();
      return;
    }
    if (data === "\x1b[5~" || data === "h") {
      // Page Up / h → scroll preview up
      this.previewScroll = Math.max(0, this.previewScroll - 5);
      this.requestRender();
      return;
    }

    if (data === "\r" || data === "\n") {
      const session = this.sessions[this.selectedIndex];
      if (session) {
        this.onDone({ type: "restore", sessionId: session.id });
      }
      return;
    }

    if (data === "d" || data === "D") {
      if (this.sessions[this.selectedIndex]) {
        this.confirmDelete = true;
        this.requestRender();
      }
      return;
    }
  }

  private getListHeight(): number {
    return Math.max(5, this.getTermRows() - 10);
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
    const count = th.fg("dim", `(${this.sessions.length} sessions)`);
    lines.push(`  ${title}  ${count}`);
    lines.push("");

    // ── Search bar ──
    if (this.searchMode) {
      const searchLines = this.searchInput.render(leftW - 4);
      lines.push("  " + th.fg("accent", "🔍 ") + (searchLines[0] ?? ""));
    } else {
      const query = this.searchInput.getValue();
      if (query) {
        lines.push("  " + th.fg("dim", `🔍 "${query}"`));
      } else {
        lines.push("  " + th.fg("dim", "/ to search"));
      }
    }
    lines.push("  " + th.fg("border", "─".repeat(innerW)));

    // ── Split panel ──
    const listH = this.getListHeight();
    const leftLines = this.renderList(leftW, listH);
    const rightLines = this.renderPreview(rightW, listH);

    // Combine
    for (let i = 0; i < listH; i++) {
      const left = i < leftLines.length ? leftLines[i] : "";
      const right = i < rightLines.length ? rightLines[i] : "";
      lines.push("  " + padToWidth(left, leftW) + sep + padToWidth(right, rightW));
    }

    // ── Footer ──
    lines.push("  " + th.fg("border", "─".repeat(innerW)));

    if (this.confirmDelete) {
      lines.push("  " + th.fg("error", th.bold("Delete permanently? (y/n)")));
    } else {
      lines.push(
        "  " +
          th.fg("dim", "Enter") +
          th.fg("muted", ": restore  ") +
          th.fg("dim", "d") +
          th.fg("muted", ": delete  ") +
          th.fg("dim", "/") +
          th.fg("muted", ": search  ") +
          th.fg("dim", "h/l") +
          th.fg("muted", ": scroll preview  ") +
          th.fg("dim", "Esc") +
          th.fg("muted", ": close"),
      );
    }
    lines.push("");

    return lines;
  }

  private renderList(w: number, h: number): string[] {
    const th = this.theme;
    const lines: string[] = [];

    if (this.sessions.length === 0) {
      for (let i = 0; i < h; i++) {
        if (i === Math.floor(h / 2)) {
          lines.push(th.fg("dim", "  (no archived sessions)"));
        } else {
          lines.push("");
        }
      }
      return lines;
    }

    const end = Math.min(this.sessions.length, this.scrollOffset + h);
    for (let i = this.scrollOffset; i < end; i++) {
      const s = this.sessions[i];
      const isSel = i === this.selectedIndex;

      const date = new Date(s.lastActivityAt).toISOString().slice(0, 10);
      const proj = padRight(projectName(s.cwd), 12);
      const msgs = `${s.userMessageCount}msg`;
      const dur = formatDuration(s.durationSeconds);

      let line: string;
      if (isSel) {
        line = th.fg("accent", "▸ ") + th.fg("accent", date) + " " + th.bold(proj);
      } else {
        line = "  " + th.fg("dim", date) + " " + th.fg("muted", proj);
      }
      line += th.fg("dim", ` ${dur} ${msgs}`);

      lines.push(truncateToWidth(line, w));

      // Show first message preview under selected
      if (isSel && i < end) {
        const preview = s.name || s.firstMessage.replace(/\n/g, " ");
        const truncated = truncateToWidth(preview, w - 6);
        lines.push("    " + th.fg("dim", `"${truncated}"`));
      }
    }

    // Pad remaining
    while (lines.length < h) {
      lines.push("");
    }

    return lines.slice(0, h);
  }

  private renderPreview(w: number, h: number): string[] {
    const th = this.theme;
    const lines: string[] = [];

    const session = this.sessions[this.selectedIndex];
    if (!session) {
      for (let i = 0; i < h; i++) {
        lines.push(i === Math.floor(h / 2) ? th.fg("dim", " (select a session)") : "");
      }
      return lines;
    }

    // Header
    const name = session.name || projectName(session.cwd);
    lines.push(" " + th.bold(th.fg("accent", name)));
    lines.push(" " + th.fg("dim", new Date(session.createdAt).toISOString().replace("T", " ").slice(0, 16)));
    lines.push(
      " " +
        th.fg("muted", `Duration: ${formatDuration(session.durationSeconds)}`) +
        th.fg("dim", ` · ${session.userMessageCount + session.assistantMessageCount} messages`),
    );
    lines.push(" " + th.fg("dim", `Size: ${formatBytes(session.fileSizeBytes)} · CWD: ${session.cwd}`));
    lines.push(" " + th.fg("border", "─".repeat(w - 2)));

    // Conversation text
    const contentH = h - lines.length;
    const textLines = (session.fullText || "(no content)")
      .split("\n")
      .flatMap((line) => {
        // Wrap long lines
        const wrapped: string[] = [];
        let remaining = line;
        while (remaining.length > w - 2) {
          wrapped.push(remaining.slice(0, w - 2));
          remaining = remaining.slice(w - 2);
        }
        wrapped.push(remaining);
        return wrapped;
      });

    // Apply scroll
    const scrolled = textLines.slice(this.previewScroll);
    for (let i = 0; i < contentH; i++) {
      if (i < scrolled.length) {
        lines.push(" " + truncateToWidth(scrolled[i], w - 2));
      } else {
        lines.push("");
      }
    }

    return lines.slice(0, h);
  }

  invalidate(): void {}
}

function padRight(s: string, w: number): string {
  return s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
}

function padToWidth(s: string, w: number): string {
  const vis = visibleWidth(s);
  if (vis >= w) return truncateToWidth(s, w);
  return s + " ".repeat(w - vis);
}
