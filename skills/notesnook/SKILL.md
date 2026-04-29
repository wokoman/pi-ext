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
- Do **not** repeat the title as an `# H1` at the top of the content — Notesnook already renders the title above the body.
- Preserve markdown formatting — it will be rendered correctly in Notesnook.
- For code blocks, keep fenced ``` blocks — they convert to `<pre><code>` in HTML.
- If the user says "save the last response" or "save the output above", use the most recent assistant-generated content.

## Error handling

| Error | Action |
|-------|--------|
| `missing_api_key` | Tell the user to create `~/.pi/notesnook.json` with `{ "apiKey": "<key>" }` and follow the setup steps in the extension README |
| `401 Unauthorized` | Key is wrong or revoked — ask user to check Settings → Inbox → API Keys |
| `403 Forbidden` | Inbox not enabled — ask user to enable it in Settings → Inbox and sync |
| `500 Misformed armored text` | PGP key issue — user needs Notesnook 3.4.x beta, must disable/re-enable Inbox API, choose Auto-generate keys, then sync |
| `429 Rate limit` | Wait 60 s and retry once automatically |

## Setup reminder (only when key is missing)

```
1. Update Notesnook to 3.4.x beta (Settings → About → enable beta updates)
2. Settings → Inbox → Enable Inbox API → choose Auto-generate keys → Save
3. Sync Notesnook (uploads the PGP public key to the server)
4. Settings → Inbox → Create Key → copy the nn__... key
5. Create ~/.pi/notesnook.json:
   { "apiKey": "<your-key>" }

Alternative: export NOTESNOOK_INBOX_API_KEY="<your-key>" (env var overrides the file)
```
