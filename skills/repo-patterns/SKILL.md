---
name: repo-patterns
description: Use before non-trivial edits or reviews in established repositories, especially when the user asks to follow existing repo patterns, match conventions, avoid reminders about style, or make changes consistent with the repository.
---

# Repo Patterns

Before editing, discover the local pattern instead of relying on memory.

## Workflow

1. Read loaded/global instructions first; they are policy.
2. Read repo-local guidance when present:
   - `AGENTS.md`
   - `CLAUDE.md`
   - `README.md`
   - `docs/conventions.md`
   - `.github/pull_request_template.md` for PR text
   - `.github/CODEOWNERS` when ownership/review scope matters
3. Find the nearest analogous implementation with `find`, `grep`, `git log`, or `gh pr`.
4. Match naming, layout, comments, task runner, and verification style from the analogous code.
5. Prefer the newest current-repo pattern over legacy code. Mention legacy differences only when they are load-bearing.

## Output discipline

Do not narrate all discovered conventions. Apply them. Mention only the convention that materially changed the implementation or review finding.
