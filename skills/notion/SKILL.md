---
name: notion
description: "Interact with the Notion workspace using `notion-cli`. Use for searching knowledge base pages, fetching page content, creating/editing pages, managing comments, and working with databases."
---

# Notion Skill

Use `notion-cli` to interact with the Notion workspace. Auth is handled via `notion-cli auth`.

## Search

```bash
notion-cli search "query"
```

## Fetch Page Content

Accepts a page URL or ID:
```bash
notion-cli fetch <page-url-or-id>
notion-cli fetch https://www.notion.so/Some-Page-abc123
```

## Pages

Create a page:
```bash
notion-cli page create --parent <parent-id> --title "Page Title" --content "Markdown body"
```

Update entire page body (replaces content):
```bash
notion-cli page update <page-id> --title "New Title" --content "New markdown"
# Use --allow-deleting-content when the replacement removes existing content
```

Edit page with find/replace (exact match):
```bash
notion-cli page edit <page-id> --find "old text" --replace "new text"
notion-cli page edit <page-id> --find "old text" --replace "new text" --all
```

Batch edits from a JSON file:
```bash
notion-cli page edit <page-id> --edits-file edits.json
```

Move, duplicate, remove child:
```bash
notion-cli page move <page-id> --parent <new-parent-id>
notion-cli page duplicate <page-id>
notion-cli page remove-child <parent-id> --child <child-id> --force
```

## Comments

```bash
notion-cli comment list <page-id>
notion-cli comment list <page-id> --all-blocks --include-resolved
notion-cli comment add <page-id> "Comment text"
```

## Databases

Create with SQL-like schema:
```bash
notion-cli db create --parent <id> --schema "CREATE TABLE tasks (Name TEXT, Status SELECT('Todo','Done'))" --title "My DB"
```

Update schema:
```bash
notion-cli db update <data-source-id> --schema "ALTER TABLE ..."
```

## Tips

- Use `--format json` (`-f json`) for structured output when parsing results.
- When a user pastes a `notion.so` URL, use `notion-cli fetch` to read the page.
- Prefer `page edit` with find/replace for targeted changes; use `page update --content` only for full rewrites.
- Use `--allow-deleting-content` when update/edit would remove existing content.
