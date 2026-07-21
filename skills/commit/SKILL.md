---
name: commit
description: "Read this skill before making git commits"
---

Create a focused git commit for the current changes.

## Format

`<type>(<scope>): <summary>`

- `type` REQUIRED. Use `feat` for features, `fix` for bug fixes. Common others: `docs`, `refactor`, `chore`, `test`, `perf`, `ci`, `build`.
- `scope` OPTIONAL. Short noun for the affected area.
- `summary` REQUIRED. Imperative, no trailing period, aim for ~50 chars.

## Body

Default to subject-only. Add a body only when the why is not self-evident.

When a body is needed:
- explain why, not how/what
- keep it terse: a few lines, not paragraphs of narrative
- do not repeat the diff

Never add sign-offs, AI attribution, or breaking-change footers unless the user explicitly asks.

## Safety

- Only commit; do not push.
- Never commit secrets, credentials, `.env`, or generated junk.
- If unrelated or ambiguous files exist, ask which files to include.
- If the user provides paths/globs, stage only those paths unless they explicitly ask otherwise.

## Steps

1. Parse caller guidance: paths/globs and/or subject hints.
2. Run `git status --short` and inspect the relevant diff.
3. Optionally run `git log -n 50 --pretty=format:%s` to match repo scopes/style.
4. Stage only intended files.
5. Run `git commit -m "<subject>"` plus optional `-m "<body>"`.
