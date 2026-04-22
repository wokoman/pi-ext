---
name: jira
description: "Interact with Jira using the Atlassian CLI (`acli`). Use `acli jira workitem` for issues, transitions, searches, and JQL queries against https://oddingg.atlassian.net/."
---

# Jira Skill

Use the `acli` CLI to interact with Jira. Instance: `https://oddingg.atlassian.net/`.

Docs: https://developer.atlassian.com/cloud/acli/guides/introduction/

For command reference details, use Context7:
- Guides: `context7_get_library_docs` with library ID `/websites/developer_atlassian_cloud_acli`
- Command reference: `context7_get_library_docs` with library ID `/websites/developer_atlassian_cloud_acli_reference_commands`

## Common Commands

Search work items with JQL:
```bash
acli jira workitem search --jql "project = PROJ AND status = 'In Progress'"
```

Create a work item:
```bash
acli jira workitem create --project PROJ --type Task --summary "Title" --description "Details"
```

Transition a work item:
```bash
acli jira workitem transition --key PROJ-123 --status "Done"
```

## Tips

- Use `--jql` for flexible queries — any valid JQL works.
- Use `--yes` to bypass confirmation prompts in transitions.
- When unsure about a subcommand or flag, look it up via Context7 command reference before guessing.
