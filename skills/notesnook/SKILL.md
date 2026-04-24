---
name: notesnook
description: >
  Save content to the user's Notesnook account via the Inbox API.
  Use when the user says "save to Notesnook", "send to Notesnook",
  "add to Notesnook", "store in Notesnook", or any similar phrasing.
---

# Notesnook Inbox Skill

## When to activate

Load and follow this skill whenever the user:
- Says "save it to my Notesnook" / "send to Notesnook" / "add to Notesnook"
- Asks to archive, store, or clip something into Notesnook
- References Notesnook as a destination for any content

## How to send a note

Use the **`send_to_notesnook`** tool. It accepts:

| Parameter | Required | Notes |
|-----------|----------|-------|
| `title`   | ✅ Yes   | Derive from context if not given (e.g. first heading, topic) |
| `content` | No       | Markdown — converted to HTML automatically |
| `pinned`  | No       | Only if user explicitly asks to pin |
| `favorite`| No       | Only if user explicitly asks to favourite/star |

## Title derivation

If the user does not specify a title, derive one:
1. Use the first `#` heading in the content, or
2. Use the main topic of the conversation (e.g. "VPC Module Design", "Q4 Roadmap Notes"), or
3. Use "Note from pi — `<ISO date>`" as a fallback.

## Content guidelines

- Send the **full** content the user wants saved (do not truncate).
- Preserve markdown formatting — it will be rendered correctly in Notesnook.
- For code blocks, keep fenced ``` blocks — they convert to `<pre><code>` in HTML.
- If the user says "save the last response" or "save the output above", use the most recent assistant-generated content.

## Error handling

| Error | Action |
|-------|--------|
| `NOTESNOOK_INBOX_API_KEY not set` | Tell the user to set the env var and explain the 3-step setup |
| `401 Unauthorized` | Key is wrong or revoked — ask user to check Settings → Inbox → API Keys |
| `403 Forbidden` | Inbox not enabled — ask user to enable it in Settings → Inbox |
| `429 Rate limit` | Wait 60 s and retry once automatically |

## Setup reminder (only when key is missing)

```
1. Open Notesnook → Settings → Inbox → Enable Inbox API
2. Click "Create Key", give it a name (e.g. "pi"), set expiry
3. Create ~/.pi/notesnook.json:
   { "apiKey": "<your-key>" }

Alternative: export NOTESNOOK_INBOX_API_KEY="<your-key>" (env var overrides the file)
```
