---
name: jira
description: "Interact with Jira using the Atlassian CLI (`acli`). Use for looking up, searching, creating, commenting on, editing, or transitioning Jira work items on oddingg.atlassian.net."
---

# Jira Skill

Use `acli`, never web scraping or raw API calls when `acli` can do it. Instance: `https://oddingg.atlassian.net/`.

If the user wants to create an INFRA ticket, also use the `filing-jira-tickets` skill for project defaults and body conventions.

## Verify before guessing

Run `acli <subcommand> --help` before using unfamiliar flags. Current verified baseline: `acli version 1.3.22-stable`.

Context7 docs, when CLI help is not enough:
- Guides: `/websites/developer_atlassian_cloud_acli`
- Command reference: `/websites/developer_atlassian_cloud_acli_reference_commands`

## Common commands

Look up one issue:

```bash
acli jira workitem view INFRA-123 --json
```

Search with JQL:

```bash
acli jira workitem search --jql "project = INFRA ORDER BY updated DESC" --fields "key,status,summary,assignee" --limit 20 --json
```

Create from flags for simple tickets:

```bash
acli jira workitem create --project INFRA --type Task --summary "Title" --description "Details" --assignee @me --json
```

Create from JSON for components, ADF descriptions, or checkboxes:

```bash
acli jira workitem create --from-json /tmp/workitem.json --json
```

Comment. For anything longer than one sentence, write ADF to a temp file and use `--body-file`; it avoids ugly plain-text blobs and shell quoting bugs:

```bash
acli jira workitem comment create --key INFRA-123 --body-file /tmp/jira-comment.json --json
```

Transition:

```bash
acli jira workitem transition INFRA-123 --status "Done" --yes
```

Edit:

```bash
acli jira workitem edit INFRA-123 --summary "New summary"
```

## Atlassian formatting

Use Atlassian Document Format (ADF) for comments and descriptions that need structure. Prefer `--body-file` / `--description-file` / `--from-json` over inline flags.

Keep Jira content human-scannable:
- honor project templates when known; INFRA Task descriptions use `Task Summary`, `Details`, `Acceptance Criteria (if applicable)`, optional `Attachments`, optional `Notes`
- headings for sections (`Details`, `Impact`, `Next steps`, `Acceptance Criteria`)
- bullet lists for grouped facts
- task lists for acceptance criteria or todos
- code marks for file paths, commands, identifiers, and field names
- links as ADF link marks; do not paste bare noisy URLs when link text is clear
- short paragraphs; no wall of text

Minimal comment ADF:

```json
{
  "version": 1,
  "type": "doc",
  "content": [
    {"type": "paragraph", "content": [{"type": "text", "text": "Summary of the update."}]},
    {"type": "bulletList", "content": [
      {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Important point."}]}]}
    ]}
  ]
}
```

## Output discipline

- For lookups, return the key, title, status, assignee, and URL first.
- For searches, keep fields minimal; descriptions are expensive and usually unnecessary.
- For creates/comments, confirm final wording before posting unless the user explicitly told you to post/create now.
