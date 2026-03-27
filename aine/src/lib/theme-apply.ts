/**
 * Apply theme colors to CSS custom properties.
 */
export function applyTheme(t: Record<string, string>) {
  const root = document.documentElement;
  root.style.setProperty("--bg", t.bg);
  root.style.setProperty("--sidebar", t.sidebar);
  root.style.setProperty("--hover", t.hover);
  root.style.setProperty("--active", t.active);
  root.style.setProperty("--text", t.text);
  root.style.setProperty("--muted", t.muted);
  root.style.setProperty("--accent", t.accent);
  root.style.setProperty("--border", t.border);
  root.style.setProperty("--add", t.add);
  root.style.setProperty("--del", t.delete);
  root.style.setProperty("--mod", t.modified);
  root.style.setProperty("--diffs-bg-addition-override", t.addBg);
  root.style.setProperty("--diffs-bg-addition-number-override", t.addBg);
  root.style.setProperty("--diffs-bg-deletion-override", t.deleteBg);
  root.style.setProperty("--diffs-bg-deletion-number-override", t.deleteBg);
}
