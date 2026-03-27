# Diffity vs. Aine – Analýza

> Datum: 2026-03-26
> Zdroj: https://github.com/kamranahmedse/diffity

## Co aine už má (a dělá dobře)

- ✅ GitHub-style diff viewer (split/unified) s SSR přes `@pierre/diffs`
- ✅ Session management (multi-repo, port discovery, PID tracking)
- ✅ Komentáře s severity (`must-fix`, `suggestion`, `nit`)
- ✅ CLI pro agenty (`aine session comment add/list/resolve/rm/clear`)
- ✅ SSE live updates (komentáře, navigace, reload)
- ✅ Background preloading s worker poolem + `git cat-file --batch`
- ✅ Theme system (shiki-based, TOML config, per-repo override)
- ✅ Keyboard shortcuts (vim-style)
- ✅ File watcher s auto-refresh
- ✅ TOML config (globální + per-repo)

---

## Features z diffity, které by se hodily do aine

### 1. 🔥 Guided Code Tours (nejvyšší přidaná hodnota)

Diffity umí `diffity-tour` — agent projde codebase a vytvoří narativní walkthrough s highlighted code regiony. Aine nic takového nemá. Využití:
- Onboarding nových devů
- Vysvětlení architektury
- Code review s kontextem

**Jak na to:** Přidat tours model (SQLite/JSON), API routes (`/api/tours`), UI panel se step navigací, a `aine session tour` CLI subcommand.

### 2. 🔥 Thread model místo flat comments

Diffity má plnohodnotné **thread** systém:
- Komentáře mají **replies** (vlákna konverzací)
- **Multi-line selection** (startLine + endLine) — aine má jen single line
- **Anchor content** — ukládá obsah řádku pro drift detection
- Status: `open` / `resolved` / `dismissed` (aine nemá `dismissed`)
- **General comments** (diff-level, bez souboru)

**Aine teď:** Flat `Comment` s jedním `line`, bez reply chain, bez anchor content.

### 3. 🔥 `aine agent` CLI (dedikovaný agent subcommand)

Diffity má `diffity agent diff/comment/resolve/dismiss/reply/tour-start/tour-step/tour-done` — čistý CLI interface pro agenty. Aine to dělá přes `aine session comment add`, což je verbose a méně přehledné.

**Lépe:** Přidat `aine agent` s krátkými příkazy:
```
aine agent diff
aine agent comment --file X --line 5 --body "..."
aine agent resolve <id>
aine agent reply <id> --body "..."
aine agent tour-start --topic "..."
```

### 4. ⚡ SQLite persistence (better-sqlite3)

Diffity ukládá review sessions, threads, tours do SQLite s WAL mode. Aine drží vše **in-memory** v `Map<string, Comment>` — ztráta dat po restartu.

**Výhoda SQLite:** Přetrvává restart, lepší querying, funguje i pro tours.

Diffity schema:
```sql
CREATE TABLE review_sessions (id, ref, head_hash, created_at);
CREATE TABLE comment_threads (id, session_id, file_path, side, start_line, end_line, status, anchor_content, ...);
CREATE TABLE comments (id, thread_id, author_name, author_type, body, created_at);
CREATE TABLE tours (id, session_id, topic, body, status, created_at);
CREATE TABLE tour_steps (id, tour_id, sort_order, file_path, start_line, end_line, body, annotation, created_at);
```

### 5. ⚡ Stale diff detection + banner

Diffity polluje fingerprint diffu každé 3s a ukáže banner "diff is stale, refresh" když se soubory změní. Aine má file watcher ale auto-refreshuje — nemá UI indikátor, že se změnil podkladový kód.

### 6. ⚡ Context expansion (expandable gaps)

Diffity umí **expand context** around hunks — klikneš na gap a zobrazí dalších 20 řádků. Aine má jen toggle `expandUnchanged` (vše nebo nic).

Klíčový soubor: `packages/ui/src/lib/context-expansion.ts` — počítá gaps mezi hunky a umožňuje inkrementální expand po 20 řádcích.

### 7. ⚡ File tree browser (`diffity tree`)

Diffity umí `diffity tree` — procházení celého repo, ne jen changed files. Komentáře na jakýkoli soubor. Aine zobrazuje jen soubory v diffu.

### 8. 💡 GitHub PR integrace

Diffity umí:
- Stáhnout PR přes `gh` CLI
- Push/pull komentářů na GitHub
- Obousměrná sync review komentářů

Klíčový soubor: `packages/github/src/pr.ts` — `pullComments()`, `pushComments()`, `getFiles()`.

### 9. 💡 Word-level diff highlighting

Diffity má vlastní `@diffity/parser` s **word-diff** — zvýrazní přesně která slova se změnila v řádku, ne jen celý řádek.

### 10. 💡 Line selection (drag-to-select)

Diffity umí kliknout a táhnout pro výběr **rozsahu řádků** pro komentář (mouse drag s anchor line tracking). Aine má jen single-line.

Klíčový soubor: `packages/ui/src/hooks/use-line-selection.ts`.

---

## Co aine dělá LÍP než diffity

| Oblast | Aine | Diffity |
|--------|------|---------|
| **Tech stack** | Svelte 5 + Bun (lehký, single binary) | React + Node + monorepo (těžší) |
| **SSR rendering** | Worker pool s `@pierre/diffs` | Klientský rendering |
| **Preloading** | `git cat-file --batch` bulk read + background SSR | On-demand |
| **Single file deploy** | `vite-plugin-singlefile` — vše v jednom HTML | Separate build |
| **Config** | TOML config (global + per-repo) | Žádný config soubor |
| **Licence** | MIT | PolyForm Shield (omezující!) |
| **Závislosti** | Minimal (Bun built-in) | better-sqlite3, React, commander, picocolors... |

---

## Prioritní doporučení (co implementovat)

1. **Thread model s replies + multi-line selection** — největší UX improvement
2. **Context expansion** (kliknutí na gap pro zobrazení okolních řádků)
3. **Guided code tours** — unikátní feature, obrovská přidaná hodnota
4. **SQLite persistence** — spolehlivost dat
5. **`aine agent` CLI** — čistší API pro agenty
6. **Stale diff banner** — lepší UX než silent auto-refresh
