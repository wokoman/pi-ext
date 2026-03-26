/**
 * Keyboard handler - dispatches actions based on key presses.
 * Returns an action descriptor so the caller (App.svelte) can handle side effects.
 */

export type Action =
  | { type: "nextFile" }
  | { type: "prevFile" }
  | { type: "firstFile" }
  | { type: "lastFile" }
  | { type: "copyPath" }
  | { type: "toggleSidebar" }
  | { type: "collapseFolder" }
  | { type: "expandFolder" }
  | { type: "collapseAll" }
  | { type: "expandAll" }
  | { type: "nextHunk" }
  | { type: "prevHunk" }
  | { type: "scrollTop" }
  | { type: "scrollBottom" }
  | { type: "scrollHalfDown" }
  | { type: "scrollHalfUp" }
  | { type: "scrollPageDown" }
  | { type: "scrollPageUp" }
  | { type: "toggleStyle" }
  | { type: "toggleWhitespace" }
  | { type: "toggleExpand" }
  | { type: "toggleHelp" }
  | null;

let pendingG = false;

export function handleKeydown(e: KeyboardEvent): Action {
  if (
    (e.target as HTMLElement).tagName === "INPUT" ||
    (e.target as HTMLElement).tagName === "TEXTAREA"
  )
    return null;

  if (e.key === "?") {
    e.preventDefault();
    return { type: "toggleHelp" };
  }

  if (e.key === "Escape") {
    e.preventDefault();
    return { type: "toggleHelp" }; // App will check if help is visible
  }

  if (e.ctrlKey) {
    switch (e.key) {
      case "d": e.preventDefault(); return { type: "scrollHalfDown" };
      case "u": e.preventDefault(); return { type: "scrollHalfUp" };
      case "f": e.preventDefault(); return { type: "scrollPageDown" };
      case "b": e.preventDefault(); return { type: "scrollPageUp" };
    }
    return null;
  }

  // gg sequence
  if (e.key === "g" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
    if (pendingG) {
      e.preventDefault();
      pendingG = false;
      return { type: "scrollTop" };
    }
    pendingG = true;
    setTimeout(() => { pendingG = false; }, 500);
    return null;
  }
  pendingG = false;

  switch (e.key) {
    case "G": e.preventDefault(); return { type: "scrollBottom" };
    case "n": e.preventDefault(); return { type: "nextHunk" };
    case "N": e.preventDefault(); return { type: "prevHunk" };
    case "s": e.preventDefault(); return { type: "toggleStyle" };
    case "w": e.preventDefault(); return { type: "toggleWhitespace" };
    case "e": e.preventDefault(); return { type: "toggleExpand" };
    case "y": e.preventDefault(); return { type: "copyPath" };
    case "b": e.preventDefault(); return { type: "toggleSidebar" };
    case "h": e.preventDefault(); return { type: "collapseFolder" };
    case "l": e.preventDefault(); return { type: "expandFolder" };
    case "H": e.preventDefault(); return { type: "collapseAll" };
    case "L": e.preventDefault(); return { type: "expandAll" };
    case "j": case "ArrowDown": e.preventDefault(); return { type: "nextFile" };
    case "k": case "ArrowUp": e.preventDefault(); return { type: "prevFile" };
    case "K": e.preventDefault(); return { type: "firstFile" };
    case "J": e.preventDefault(); return { type: "lastFile" };
  }

  return null;
}
