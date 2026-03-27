# Aine Refactoring Plan

**Cíl:** Maximální udržitelnost a budoucí rozšiřitelnost kódu.

## Analýza

| Soubor | Řádky | Problém |
|--------|-------|---------|
| `DiffView.svelte` | 581 | God component — cache, hunks, komentáře, gutter eventy |
| `diff-session.ts` | 504 | Míchá diff cache, thread CRUD, event system, preload |
| `CommentsPanel.svelte` | 482 | Scroll sync polluje `setInterval(500ms)` |
| `Sidebar.svelte` | 386 | OK, ale tree logika patří do lib/ |
| `git.ts` | 363 | Mrtvé re-exporty typů |
| `routes.ts` | 340 | OK |
| `session-cli.ts` | 299 | OK |
| `cli.ts` | 279 | OK |

## 1. Odstranit mrtvý kód a zbytečné re-exporty

**Problém:** Typy se re-exportují přes 3 soubory místo přímého importu z `types.ts`.

- `diff-session.ts` — `export type { RenderOptions, Severity, ... } from "./types.js"` → nikdo neimportuje typy z diff-session
- `ssr-worker-client.ts` — `export type { RenderOptions } from "./types.js"` → nepoužito
- `git.ts` — `export type { FileStatus, ChangedFile } from "./types.js"` → nepoužito
- `theme.ts` — `export type { ThemeColors as AineUIColors }` → alias nikdy nepoužit

## 2. Extrahovat ThreadStore z DiffSession

**Problém:** `DiffSession` (504 řádků) dělá příliš mnoho — diff cache + thread CRUD + eventy + preload.

**Řešení:** Nový `thread-store.ts` (~120 řádků):
- `createThread()`, `addReply()`, `updateThreadStatus()`, `editThread()`, `deleteThread()`
- `getThreads()`, `getThread()`, `findThread()`, `getThreadCount()`
- Vlastní event emitter pro thread změny
- DiffSession deleguje na ThreadStore

## 3. Extrahovat CommentInput z DiffView

**Problém:** `DiffView.svelte` (581 řádků) — comment input logika zabírá ~150 řádků.

**Řešení:** Nový `CommentInput.svelte`:
- Comment form (textarea, submit, cancel)
- Positioning logic (`positionInputAtLine`)
- Edit mode handling
- DiffView jen předává props

## 4. Extrahovat tree-building logiku ze Sidebar

**Problém:** Sidebar obsahuje ~100 řádků pure tree-building logiky vmíchaného s UI.

**Řešení:** Nový `src/lib/file-tree.ts`:
- `buildTree()`, `squash()`, `collectVisibleItems()`, `collectAllFolderKeys()`
- `findFolderForPath()`, `findCollapsedFolderForPath()`
- Sidebar se zjednoduší na čistý UI

## 5. Extrahovat EXTENSION_TO_LANG constant

**Problém:** Hardcoded mapping v preloadAll() uprostřed business logiky.

**Řešení:** Přesunout do `types.ts` nebo nový `constants.ts` — sdílené mezi diff-session a ssr-worker.

## 6. Vyčistit CommentsPanel scroll sync

**Problém:** `setInterval(500ms)` polling pro detekci scroll elementu.

**Řešení:** Předat scrollEl jako prop z App.svelte (je vždy dostupný) nebo použít `$effect` na `selectedPath`.

## 7. Zjednodušit DiffView client cache

**Problém:** DiffView má vlastní inline LRU cache (~30 řádků) duplikující backend pattern.

**Řešení:** Reuse `LRUCache` class — přesunout do `src/lib/lru-cache.ts` (symlink/copy pro frontend).

## Pořadí provedení

1. Mrtvý kód (bezpečné, žádné dependencies)
2. `thread-store.ts` extrakce
3. `src/lib/file-tree.ts` extrakce
4. `CommentInput.svelte` extrakce
5. CommentsPanel scroll sync cleanup
6. Constants extrakce
7. Client LRU cache reuse

## Rizika

- Testy musí projít po každém kroku
- Svelte 5 `bind:this` a `$props()` mají specifické patterny
- SSR worker komunikace nesmí být narušena
