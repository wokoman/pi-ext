# Aine: AI Code Review Workflow — Brainstorm

## Současný stav

Aine je diff viewer s inline komentáři, který AI agent ovládá přes CLI (`aine session *`).

**Umí:** diff rendering, thready s severity/status, file watching, preload cache, themes, vim klávesy, SSE live updates.

**Problém:** Je to viewer, ne review tool. Chybí workflow — kdo co dělá, kdy je hotovo, jak se feedback vrací agentovi.

---

## Cílová vize

Aine = **review loop mezi člověkem a AI agentem**.

```
Agent pracuje → checkpoint → AINE review → feedback → agent fixuje → re-review → approve → done
```

Ne jen "podívej se na diff", ale celý řízený proces s jasným stavem a výstupem.

---

## Klíčové features (seřazeno podle priority)

### P0: Approval workflow + feedback loop

**Problém:** Dnes agent udělá změny, uživatel se podívá, ale není formální "approve / request changes" krok. Agent neví, jestli je review hotové.

**Návrh:**

Review session má globální stav:
```
pending → in_review → changes_requested → approved / rejected
```

UI dole (nebo v toolbaru):
- **"Request Changes"** — uživatel napíše souhrnný feedback, stav → `changes_requested`
- **"Approve"** — stav → `approved`
- **"Reject"** — stav → `rejected` (zahoď všechno)

Agent se dozví přes:
- `aine session status --repo .` → vrátí stav + feedback
- SSE event `review-verdict` → agent čeká na verdict
- Exit code? (aine blokuje dokud uživatel nerozhodne?)

**Otevřené otázky:**
- Má aine blokovat agenta (agent spustí `aine review` a čeká na výsledek)?
- Nebo je to async (agent se pravidelně ptá)?
- Nebo obojí (CLI s `--wait` flag)?

---

### P1: File-level review status

**Problém:** Při 40 souborech nevíš, které jsi reviewoval, které jsou OK, které potřebují práci.

**Návrh:**

Každý soubor má status:
```
unreviewed → viewed → approved | needs_work
```

Sidebar ukazuje stav:
```
☐ auth.ts        (unreviewed)
👁 db.ts          (viewed — otevřel ale neoznačil)
✅ config.ts      (approved)
⚠ api.ts         (needs work — má open komentáře)
```

Automatické přechody:
- `unreviewed → viewed` — když uživatel soubor otevře a stráví tam >2s (nebo scrollne dolů)
- `viewed → needs_work` — automaticky když přidá open komentář
- `needs_work → approved` — když všechny komentáře resolved + uživatel explicitně approves

Klávesová zkratka: `a` = approve current file, `x` = mark needs work

Progress bar v toolbaru: `Review: 7/12 files ████░░░░ 58%`

---

### P2: Review summary / dashboard

**Problém:** Otevřeš aine a vidíš seznam souborů. Nevíš co se dělo, jaký byl intent, jaký je stav.

**Návrh:**

Summary panel (horní část, collapsible, nebo jako první "soubor" v sidebar):

```
┌─────────────────────────────────────────────┐
│ 📋 Review: Fix auth race condition          │
│                                             │
│ 12 files changed  +340 / -520              │
│ Review: 3/12 ██░░░░ │ 2 open comments      │
│                                             │
│ Agent summary:                              │
│ "Refactored auth middleware to use mutex.   │
│  Key changes: auth.ts (new lock), db.ts     │
│  (connection pooling), api.ts (retry logic)"│
│                                             │
│ Checks: ✅ types  ✅ lint  ⚠ tests (1 fail) │
└─────────────────────────────────────────────┘
```

Odkud summary pochází:
- Agent poskytne přes CLI: `aine session meta --repo . --summary "..." --task "..."`
- Nebo automaticky z agent session logu
- Check results: agent pošle přes CLI nebo aine sám spustí configured commands

---

### P3: Agent context (per-file reasoning)

**Problém:** Vidíš CO se změnilo, ale ne PROČ. Agent měl důvod — ale ten je ztracený v session logu.

**Návrh:**

Agent může ke každému souboru přidat "change note":
```bash
aine session annotate --repo . --file auth.ts --note "Added mutex lock to prevent concurrent token refresh. Previous implementation could issue duplicate tokens under load."
```

V UI se zobrazí jako collapsible banner nad diffem:
```
┌─ 🤖 Agent note ───────────────────────────────┐
│ Added mutex lock to prevent concurrent token   │
│ refresh. Previous implementation could issue    │
│ duplicate tokens under load.                    │
└────────────────────────────────────────────────┘
```

Alternativa: agent to dá jako první komentář typu "context" (ne review komentář, ale vysvětlení).

---

### P4: Smart file ordering

**Problém:** Abecední řazení. Config soubory a testy se míchají s core logic.

**Návrh:**

Výchozí řazení podle "review importance":
1. Core source files s velkými změnami
2. Core source files s malými změnami
3. Test files
4. Config / generated / lock files

Heuristika:
- Velikost změny (additions + deletions)
- Typ souboru (`.ts` > `.json` > `.lock`)
- Path pattern (`src/` > `test/` > `config/`)
- Má open komentáře → boost

Konfigurovatelné přes `.aine.toml` nebo `aine.config.ts`:
```toml
[review.ordering]
boost = ["src/**"]
demote = ["*.lock", "*.generated.*", "test/**"]
```

Sidebar grouping:
```
── Core changes (5) ──
  auth.ts  +42 -18
  db.ts    +15 -8
── Tests (4) ──
  auth.test.ts  +30
── Config (3) ──
  package.json  +2 -1
```

---

### P5: Inline "explain this"

**Problém:** Stojíš na řádku, nerozumíš proč ho agent změnil.

**Návrh:**

Klávesa `?` na řádku (nebo right-click → "Ask agent") → pošle request agentovi:
```bash
# Agent dostane:
aine session event --repo . 
# → { type: "explain-request", file: "auth.ts", line: 42, context: "..." }
```

Agent odpoví komentářem:
```bash
aine session comment reply --repo . <thread-id> --summary "This line..." --author agent
```

V UI: loading indikátor na řádku → agent response se objeví jako inline annotation.

**Otevřená otázka:** Jak agent ví, že má odpovědět? Push (SSE event) vs. pull (polling)?

---

### P6: Automated pre-review

**Problém:** Před review bys chtěl vědět jestli kód aspoň projde základními checky.

**Návrh:**

Configurable checks v `.aine.toml`:
```toml
[[review.checks]]
name = "TypeScript"
command = "npx tsc --noEmit"

[[review.checks]]
name = "Lint"  
command = "npx eslint ."

[[review.checks]]
name = "Tests"
command = "npm test"
```

Aine spustí checks na pozadí, výsledky zobrazí:
- V summary panelu: ✅/❌ per check
- Inline: pokud check output obsahuje file:line, přiřadit k souboru

Optional: "AI pre-review" check — spustí configured AI prompt na diff.

---

### P7: Granular revert

**Problém:** Vidíš problém v jednom souboru/hunku. Chceš vrátit jen to.

**Návrh:**

Per-file akce v sidebar: "Revert file" (git checkout -- file)
Per-hunk akce v diff view: "Revert hunk" (git checkout -p equivalent)

Potvrzovací dialog. Po revertu se diff automaticky refreshne.

---

## Otevřené designové otázky

1. **Jak se review session vytváří?**
   - `aine review` (nový příkaz, implikuje review mode)?
   - `aine diff` + přepnutí do review mode?
   - Agent vytvoří: `aine session review-request --repo . --summary "..."`?

2. **Persistance review stanu?**
   - Dnes je vše in-memory. Když aine restartneš, ztratíš komentáře.
   - Ukládat do `.aine/reviews/` v repo?
   - Nebo do global store `~/.aine/`?

3. **Multi-agent review?**
   - Může víc agentů reviewovat stejný changeset?
   - Agent A udělá změny → Agent B reviewuje → člověk finálně schválí?

4. **Integrace s git workflow?**
   - Po approve: auto-commit? auto-push? create PR?
   - Nebo je to na uživateli?

5. **Review history?**
   - Chceš se vrátit k minulým review sessions?
   - "Minule jsem tohle zamítl, agent to fixnul, chci vidět co se změnilo"

---

## Navržená architektura (high level)

```
┌────────────┐     CLI        ┌──────────────┐     HTTP/SSE    ┌──────────┐
│  AI Agent  │ ◄────────────► │  Aine Server │ ◄──────────────► │  Aine UI │
│  (pi, ...)  │  session cmds  │              │                 │ (browser) │
└────────────┘                │  - DiffSession│                 └──────────┘
                              │  - ReviewState│
                              │  - Checks    │
                              └──────────────┘
```

Nové server-side koncepty:
- **ReviewState** — globální stav review (pending/in_review/approved/...)
- **FileReviewStatus** — per-file stav (unreviewed/viewed/approved/needs_work)
- **ReviewMeta** — task description, agent summary, check results
- **ReviewVerdict** — finální rozhodnutí + feedback message

Nové CLI příkazy:
```bash
aine session meta --repo . --summary "..." --task "..."
aine session annotate --repo . --file auth.ts --note "..."
aine session status --repo .                          # → { state, feedback, files }
aine session await-verdict --repo .                   # blocks until user decides
aine session checks --repo . --name "Tests" --status pass|fail --output "..."
```

Nové API endpoints:
```
POST   /api/review/verdict    { action: "approve"|"request_changes"|"reject", feedback: "..." }
GET    /api/review/status     → { state, feedback, fileSummary, checks }
PATCH  /api/files/:path/status  { status: "approved"|"needs_work" }
POST   /api/review/meta       { summary, task, context }
POST   /api/review/checks     { name, status, output }
```

---

## Experimentální / netypické nápady

### 🎬 Replay mode — přehrání agentova procesu

Ne jen finální diff, ale timeline celého agentova workflow. Agent udělal 47 kroků — vidíš:
- Krok 12: přečetl auth.ts, rozhodl se refaktorovat
- Krok 15: první pokus, napsal to s Promise.all
- Krok 22: testy spadly, přepsal na mutex
- Krok 31: opravil edge case

Klikneš na kterýkoliv krok → vidíš diff *v tom momentě*. Jako git bisect, ale na úrovni agentovy práce. Pochopíš PROČ je finální kód takový — vidíš slepé uličky, které agent zkusil a zahodil. Pochopíš reasoning skrz proces, ne jen výsledek.

Zdroj dat: agent session log (pi sessions mají JSONL s každým krokem).

---

### 🔬 Semantic diff — ne řádky, ale záměr

Normální diff: "+3 -5 řádků v auth.ts". Semantic diff:
- "Přidána nová funkce `acquireLock()`"
- "Změněn return type `getUser()` z `User` na `User | null`"
- "Odstraněn dead code: nepoužívaný import a helper"

Strukturální pohled na to co se *sémanticky* změnilo. Tree-sitter AST diff místo line diff. Reviewer vidí intent, ne textové šumy (přeformátování, přesuny, importy).

Implementace: tree-sitter parse old + new → AST diff → human-readable summary per file.

---

### 🧪 "What if" sandbox

Stojíš na změně, říkáš si "co kdyby to agent udělal jinak?" Klikneš "What if..." → napíšeš alternativní přístup → aine pošle agentovi kontext + tvůj návrh → agent vygeneruje alternativní implementaci → vidíš side-by-side: agentova verze vs. alternativa.

Review se změní z "approve/reject" na **"choose the best approach"**. Kolaborativní design, ne jednosměrný gate.

---

### 🕸️ Impact graph — blast radius změny

Změnil se interface v `types.ts`. Aine ukáže graf závislostí:
- Které soubory ten interface importují
- Které z nich agent taky změnil (✅ consistent)
- Které NE (⚠️ potenciální breaking change)

Vizuální "blast radius" každé změny. Reviewer okamžitě vidí jestli agent zapomněl updatnout nějakého consumera.

Implementace: statická analýza importů + cross-reference s changesetem.

---

### 🎯 Confidence heatmap

Agent při generování kódu vnitřně "ví" kde si je jistý a kde hádá. Aine to vizualizuje přímo v diffu:
- Řádky s vysokou confidence = normální zobrazení
- Řádky s nízkou confidence = žluté zvýraznění, "⚠ agent uncertain"

Reviewer ví kde soustředit pozornost — nemusí číst 500 řádků, koukne na 20 žlutých.

Zdroj: agent by musel poskytnout confidence metadata per-line/per-hunk (nový protocol).

---

### ⏪ Regression anchor — kvantitativní srovnání

Před review Aine automaticky spustí testy/checks na *původním* i *novém* kódu. Ne jen "testy prošly" ale:
- "Test X předtím trval 50ms, teď 800ms" → perf regression
- "Coverage klesla z 85% na 72% v auth module"
- "Bundle size: 142KB → 158KB (+11%)"

Kvantitativní before/after, ne jen pass/fail. Čísla, ne jen zelená/červená.

---

### 🗣️ Conversational review

Místo komentářů na řádcích — chat panel přímo v Aine. "Vysvětli mi proč jsi přidal ten mutex" → agent odpoví s odkazem na konkrétní řádky (`auth.ts:42-48`) → klikneš na odkaz → skočíš tam v diffu → pokračuješ v konverzaci.

Review jako dialog, ne jako formulář s komentáři. Přirozenější pro interakci s AI.

Hybridní model: chat pro diskuzi + komentáře pro tracking (z chatu se dají "pinovat" formální review komentáře).

---

### 📸 Snapshot review — velké změny po kouscích

Agent dělá velkou změnu (100+ souborů). Místo jednoho mamutího review — agent po každém logickém kroku udělá "snapshot":

1. "Snapshot 1: Extracted shared types" (5 files) → ✅ approved
2. "Snapshot 2: Migrated auth module" (12 files) → ⚠ needs work
3. "Snapshot 3: Updated tests" (8 files) → ☐ not reviewed

Reviewuješ po stravitelných kouscích. Každý snapshot má vlastní diff, summary, komentáře. Approve jde po snapshots — partial approve je OK.

Agent řídí granularitu: `aine session snapshot --repo . --name "Extracted types" --files src/types/*.ts`

---

### 🛡️ Trust levels — ne všechno potřebuje review

Opak klasického review. Definuješ pravidla co agent smí dělat *bez review*:

```toml
[trust]
auto_approve = ["*.md", "*.json", "test/**"]
always_review = ["**/auth/**", "**/payment/**", "*.sql"]
flag_if = "new_dependency"      # nový import/package → vždy flagni
```

Aine auto-approves low-risk soubory, zvýrazní jen ty, které opravdu potřebují lidské oči. Místo 40 souborů reviewuješ 8. Zbytek je transparentně schválený s logem proč.

Postupně se trust model učí: "za poslední měsíc jsi nikdy neměl problém s test soubory → navrhuju auto-approve."

---

### 🧬 Behavioral diff — co se změnilo v chování, ne v textu

Textový diff říká "řádek 42 se změnil". Behavioral diff říká:
- "Funkce `getUser()` teď throwuje místo return null"
- "API endpoint `/auth` teď přijímá nový query param `force`"
- "Timeout se změnil z 5s na 30s"

Extrahované z AST + runtime analýzy. Jako changelog, ale automaticky a přesně.

Bonusový level: "Tady jsou 3 callery `getUser()` — žádný z nich nehandluje throw. 💥"

---

### 🎰 Adversarial mode — zkus to rozbít

Před review Aine automaticky:
1. Vezme nový kód
2. Nechá jiný AI model, aby se ho pokusil rozbít — edge cases, weird inputs, race conditions
3. Výsledky ukáže inline: "Tohle spadne když `userId` je empty string"

Reviewer nemusí vymýšlet edge cases — dostane je předžvýkané. Pokud adversarial model nic nenajde, máš vyšší confidence.

---

### 📉 Review budget — máš 10 minut

Realita: nemáš čas reviewovat 500 řádků pečlivě. Aine to ví.

Nastavíš si "review budget" (čas nebo effort level). Aine spočítá risk score per soubor a navrhne:
```
⏱ 10-minute review plan:
1. auth.ts (5 min) — security-critical, large change
2. db.ts (3 min) — new connection pooling logic
3. api.ts (2 min) — skim, mostly mechanical
── auto-approved (low risk) ──
4-12. config, tests, types — agent handled correctly
```

Review jako triage, ne jako čtení románu.

---

### 🔁 Pattern consistency checker

Agent použil pattern X na 3 místech, ale na 4. místě pattern Y. Proč? Buď je to bug, nebo má důvod — ale reviewer by to měl vidět:

```
⚠ Inconsistency detected:
  src/handlers/auth.ts:15    → uses try/catch
  src/handlers/users.ts:22   → uses try/catch
  src/handlers/orders.ts:18  → uses try/catch
  src/handlers/billing.ts:31 → uses .catch() ← different pattern
```

Cross-file pattern analýza. Najde inkonsistence, které lidské oko snadno přehlédne.

---

### 📦 Dependency audit — co agent přitáhl

Agent přidal `npm install cool-lib`. Aine automaticky:
- Velikost: +340KB minified
- Maintainer: 1 osoba, last commit 8 months ago
- Known CVEs: 0
- License: MIT ✅
- Alternativy: `better-lib` (smaller, more maintained)
- Opravdu to potřebuje? Použil z toho 1 funkci, dá se nahradit 5 řádky

Supply chain review zabudovaný do code review.

---

### 🧠 Review memory — Aine se učí co tě zajímá

Aine si pamatuje tvoje minulé review komentáře. Vzorce:
- "Vždy komentuje chybějící error handling"
- "Vždy flaguje any type v TypeScriptu"
- "Nikdy nekomentuje import ordering"

Příště automaticky: "Na základě tvých minulých review — tady jsou 4 místa kde pravděpodobně budeš chtít komentovat" — a rovnou ti je předpřipraví.

Personalizovaný review assistant, ne generic linter.
