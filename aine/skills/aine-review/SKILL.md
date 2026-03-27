---
name: aine-review
description: Interacts with live Aine diff review sessions via CLI. Inspects review context, navigates files, reloads sessions, and creates threaded inline review comments with severity levels and replies. Use when the user has an Aine session running or wants to review diffs interactively.
---

# Aine Review

Aine is an agent-agnostic diff viewer and code review tool. The browser UI is for the user — do NOT run `aine`, `aine diff`, or `aine show` directly. Use `aine session *` CLI commands to inspect and control live sessions.

If no session exists, ask the user to launch Aine in their terminal first:
```bash
aine                    # working tree changes
aine diff main          # diff against main
aine show HEAD~1        # last commit
```

## Workflow

```
1. aine session list                     # find live sessions
2. aine session context --repo .         # check what's being reviewed
3. aine session navigate ...             # move to the right place
4. aine session reload -- ...            # swap contents if needed
5. aine session comment add ...          # leave review notes
6. aine session comment reply ...        # reply to existing threads
```

## Session selection

Every command (except `list`) needs a session target:

- `--repo <path>` — match by repo root (most common, use `--repo .`)
- `<id>` — match by exact session ID (when multiple sessions share a repo)
- If only one session exists, it auto-resolves

## Commands

### Inspect

```bash
aine session list [--json]
aine session context (--repo . | <id>) [--json]
```

### Navigate

```bash
aine session navigate --repo . --file src/App.tsx --hunk 2
aine session navigate --repo . --file src/App.tsx --line 372
```

- `--hunk <N>` is 1-based
- `--line <N>` is 1-based (new file side)

### Reload

Swaps what a live session is showing without opening a new browser tab:

```bash
aine session reload --repo . -- diff
aine session reload --repo . -- diff --staged
aine session reload --repo . -- show HEAD~1
```

### Threads (comments)

Aine uses a **thread model** for comments. Each thread has a file location (with optional line range), a status, and a chain of comments (original + replies).

```bash
# Create a new thread (starts a conversation on a line or line range)
aine session comment add --repo . --file README.md --line 103 --summary "Tighten this wording" [--end-line 110] [--severity suggestion] [--author agent]

# Reply to an existing thread
aine session comment reply --repo . <thread-id> --summary "Good point, will fix" [--author agent]

# List threads
aine session comment list --repo . [--file README.md] [--status open] [--json]

# Change thread status
aine session comment resolve --repo . <thread-id>
aine session comment dismiss --repo . <thread-id>

# Delete a thread
aine session comment rm --repo . <thread-id>

# Clear all threads
aine session comment clear --repo . --yes [--file README.md]
```

- `comment add` requires `--file`, `--line`, and `--summary`
- `--end-line` enables multi-line thread (default: same as `--line`)
- `--severity` is one of: `must-fix`, `suggestion`, `nit` (default: none)
- `--author` defaults to `agent`
- `--status` filter for list: `open`, `resolved`, `dismissed`
- Thread IDs support short prefix lookup (min 4 chars)
- Quote `--summary` defensively in the shell

## Thread statuses

| Status | Meaning |
|--------|---------|
| `open` | Active, needs attention |
| `resolved` | Fixed or addressed |
| `dismissed` | Not applicable, won't fix |

## Severity levels

| Level | When to use |
|-------|-------------|
| `must-fix` | Bugs, security issues, logic errors — must be addressed |
| `suggestion` | Improvements, better patterns — worth considering |
| `nit` | Style, naming, minor preferences — optional |

## Guiding a review

When asked to review code, your role is to narrate and leave actionable comments.

Typical flow:

1. `aine session context --repo .` — understand the changeset
2. Navigate to the first interesting file
3. Add a thread explaining what's wrong and why
4. Move to the next point of interest — repeat
5. Summarize findings when done

Guidelines:

- Work in the order that tells the clearest story, not file order
- Navigate before commenting so the user sees the relevant code
- Keep comments focused: bugs, security, performance, clarity
- Use severity levels — don't mark everything as `must-fix`
- Use `--end-line` when the issue spans multiple lines
- Don't comment on every line — highlight what matters
- Use `reply` to respond to user questions on existing threads
- After review, suggest the user run resolve to apply fixes

## Common errors

- **"No active Aine sessions"** — ask the user to open Aine in their terminal
- **"No active session for repo"** — wrong directory, check with `aine session list`
- **"Thread not found"** — wrong ID, check with `aine session comment list --json`
