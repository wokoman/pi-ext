```text
______________________________________________________________________________        
 ______________________________________________________________________________       
  ___/\\\\\\\\\___/\\\________________________________________________/\\\______      
   __/\\\/////\\\_\///___/\\\\\\\\\\\_____/\\\\\\\\___/\\\____/\\\__/\\\\\\\\\\\_     
    _\/\\\\\\\\\\___/\\\_\///////////____/\\\/////\\\_\///\\\/\\\/__\////\\\////__    
     _\/\\\//////___\/\\\________________/\\\\\\\\\\\____\///\\\/_______\/\\\______   
      _\/\\\_________\/\\\_______________\//\\///////______/\\\/\\\______\/\\\_/\\__  
       _\/\\\_________\/\\\________________\//\\\\\\\\\\__/\\\/\///\\\____\//\\\\\___ 
        _\///__________\///__________________\//////////__\///____\///______\/////____
```

Personal collection of extensions and skills for [Pi](https://github.com/badlogic/pi). Forked from [tomsej/pi-ext](https://github.com/tomsej/pi-ext).

## Install

```bash
pi install git:github.com/wokoman/pi-ext
```

## Extensions

### [Leader Key](extensions/leader-key/)

Press `Ctrl+X` to open a floating command palette — like Vim's which-key or Emacs' leader key. Actions are organized into single-character groups (`s` for Session, `m` for Model, `f` for Favourites, `t` for Thinking level, `l` for Labels). Auto-discovers extension commands and merges them with built-in actions.

Includes sub-modules:
- **Model Switcher** — searchable provider → model → thinking level picker
- **Favourite Models** — quick-switch to preset model+thinking combos via `favourite-models.json`
- **Session / Label Actions** — rename, archive, label, and jump between sessions

### [Custom Footer](extensions/custom-footer/)

Compact powerline-style status bar showing working directory, git branch, token usage, cost, context window utilization, and active model.

### [Tool Pills](extensions/tool-pills/)

Compact colored pill labels for built-in tools with collapsed output, plus Shiki-powered syntax-highlighted diffs for `write` and `edit`.

### [Code Review](extensions/review/)

`/review` command with multiple modes: review a GitHub PR, diff against a base branch, review uncommitted changes, review a specific commit, or provide custom review instructions. When `pi-sem` is also loaded, `/review` nudges the agent toward a semantic workflow.

### [pi-sem](extensions/pi-sem/)

Semantic git tooling powered by [sem](https://github.com/Ataraxy-Labs/sem). Entity-aware tools — `sem_diff`, `sem_impact`, `sem_context`, `sem_log`, `sem_entities`, `sem_blame`, and `sem_eval`.

### [Session Snap](extensions/session-snap/)

Session archiver and cleaner. `/snap` scans all sessions, classifies them, and lets you review before executing. `/archive` browses archived sessions with search, restore, and permanent delete.

### [Session Query](extensions/session-query/)

Tool for querying previous pi sessions for context, decisions, or code changes.

### [Permissions](extensions/permissions/)

Three-mode permission system: `yolo`, `safe`, `read-only`. `/mode` to switch. Rules merge project → global → built-ins.

### [Ask User Question](extensions/ask-user-question/)

Registers an `ask_user_question` tool for structured clarifying questions with interactive UI.

## Skills

| Skill | Description |
|-------|-------------|
| [commit](skills/commit/) | Conventional Commits-style `git commit` — infers type, scope, and summary from the diff |
| [github](skills/github/) | Recipes for the `gh` CLI — PR checks, CI runs, issue queries, JSON output |
| [jira](skills/jira/) | Interact with Jira via `acli` — work item search, create, transition |
| [notion](skills/notion/) | Interact with Notion via `notion-cli` — search, fetch, page CRUD, comments, databases |
| [sem](skills/sem/) | Entity-aware change analysis workflow |
| [session-query](skills/session-query/) | Guide for querying past pi sessions |
| [visit-webpage](skills/visit-webpage/) | Fetch and extract content from a URL as markdown |
| [web-search](skills/web-search/) | Lightweight web search via Jina Search API |

## Configuration

- **Leader Key** — edit `extensions/leader-key/favourite-models.json` for model presets
- **Permissions** — edit `~/.pi/agent/permissions.json` (global) or `.agents/permissions.json` (project)
- **pi-sem** — `npm install` fetches `@ataraxy-labs/sem` automatically

## License

[MIT](LICENSE)
