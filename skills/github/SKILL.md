---
name: github
description: "Interact with GitHub using the `gh` CLI. Use `gh issue`, `gh pr`, `gh run`, and `gh api` for issues, PRs, CI runs, and advanced queries."
---

# GitHub Skill

Use the `gh` CLI to interact with GitHub. Always specify `--repo owner/repo` when not in a git directory, or use URLs directly.

## Pull Requests

Check CI status on a PR:
```bash
gh pr checks 55 --repo owner/repo
```

List recent workflow runs:
```bash
gh run list --repo owner/repo --limit 10
```

View a run and see which steps failed:
```bash
gh run view <run-id> --repo owner/repo
```

View logs for failed steps only:
```bash
gh run view <run-id> --repo owner/repo --log-failed
```

## PR Review Comments

### Post an inline comment on a specific line

Uses the REST API. Requires `commit_id` (HEAD SHA of the PR), `path`, `line`, and `side`.

**Step 1 — get the HEAD commit SHA:**
```bash
gh api repos/{owner}/{repo}/pulls/{pr_number} --jq '.head.sha'
```

**Step 2 — post a single-line comment:**
```bash
gh api --method POST repos/{owner}/{repo}/pulls/{pr_number}/comments \
  -f body="Use \`snake_case\` here per naming conventions." \
  -f commit_id="<sha>" \
  -f path="modules/kira/main.tf" \
  -F line=42 \
  -f side="RIGHT" \
  -f subject_type="line"
```

**Post a multi-line comment** (add `start_line` and `start_side`):
```bash
gh api --method POST repos/{owner}/{repo}/pulls/{pr_number}/comments \
  -f body="This entire block should be extracted into a local." \
  -f commit_id="<sha>" \
  -f path="modules/kira/main.tf" \
  -F start_line=10 \
  -f start_side="RIGHT" \
  -F line=18 \
  -f side="RIGHT" \
  -f subject_type="line"
```

Field reference:
- `line` — the ending line number in the diff (required)
- `side` — `RIGHT` for additions/new code, `LEFT` for deletions/old code (required)
- `start_line` / `start_side` — for multi-line comments only
- `subject_type` — `"line"` for line comments, `"file"` for file-level comments
- `commit_id` — must be the PR's HEAD SHA; stale SHAs produce outdated comments
- Use `-F` (not `-f`) for integer fields like `line` and `start_line`

### Reply to an existing review thread

Uses the REST API reply endpoint. Requires the `comment_id` of the **top-level** comment in the thread (not a reply's ID). Replies to replies are not supported.

**Step 1 — find the top-level comment ID:**
```bash
gh api repos/{owner}/{repo}/pulls/{pr_number}/comments \
  --jq '.[] | select(.in_reply_to_id == null) | {id, path, line, body: (.body[:80])}'
```

**Step 2 — post the reply:**
```bash
gh api --method POST repos/{owner}/{repo}/pulls/{pr_number}/comments/{comment_id}/replies \
  -f body="Fixed in abc1234."
```

Key rules:
- `comment_id` in the URL **must** be a top-level comment (`in_reply_to_id == null`)
- Replying to a reply ID returns a 404
- This endpoint triggers notifications and is subject to secondary rate limiting

### Resolve a review thread

Resolving threads requires the GraphQL API — there is no REST endpoint for this.

**Step 1 — get thread IDs:**
```bash
gh api graphql -f query='
query {
  repository(owner: "{owner}", name: "{repo}") {
    pullRequest(number: {pr_number}) {
      reviewThreads(first: 50) {
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes { body }
          }
        }
      }
    }
  }
}' --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false) | {id, body: .comments.nodes[0].body[:80]}'
```

**Step 2 — resolve a thread:**
```bash
gh api graphql -f query='
mutation {
  resolveReviewThread(input: {threadId: "<thread_node_id>"}) {
    thread { id isResolved }
  }
}'
```

The `threadId` is the `id` field from step 1 (looks like `PRRT_kwDOxxxxxx`).

To **unresolve**, use `unresolveReviewThread` with the same input shape.

## API for Advanced Queries

The `gh api` command is useful for accessing data not available through other subcommands.

Get PR with specific fields:
```bash
gh api repos/owner/repo/pulls/55 --jq '.title, .state, .user.login'
```

## JSON Output

Most commands support `--json` for structured output. You can use `--jq` to filter:

```bash
gh issue list --repo owner/repo --json number,title --jq '.[] | "\(.number): \(.title)"'
```
