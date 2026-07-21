---
name: pr-body
description: Use when creating, opening, drafting, or updating a GitHub pull request body. Reads the repo PR template and writes concise PR text that follows Michal's PR conventions.
---

# PR Body

Use `gh` for GitHub operations. Do not use web scraping or raw API calls when `gh` can do it.

## Workflow

1. Inspect the branch and diff:
   - `git status --short`
   - `git diff --stat <base>...HEAD` or the PR's base branch
   - recent commits with `git log --oneline <base>..HEAD`
2. Read `.github/pull_request_template.md` if present.
3. Read repo docs only when needed to avoid inventing context: `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/conventions.md`.
4. Draft the PR body to fit the template. If opening the PR, use `gh pr create`; if updating, use `gh pr edit`.

## Style

- Each paragraph is one long unwrapped line.
- Describe what the change does, not the meta-story.
- No phase labels, no external inspiration name-drops, no "trimmed from MVP" framing.
- Point at canonical docs/READMEs for context instead of re-narrating them.
- When referencing Oddin repos, use neutral factual terms.
- Keep it short; bullets only where the template asks for them.

## Commands

Create:

```bash
gh pr create --base <base> --title "<title>" --body-file /tmp/pr-body.md
```

Update body:

```bash
gh pr edit <number-or-url> --body-file /tmp/pr-body.md
```

Preview first when the body may be contentious; ask before creating/updating if the user did not clearly authorize it.
