# pi-notesnook

Sends notes from your [pi coding agent](https://github.com/mariozechner/pi-coding-agent) conversations straight to your [Notesnook](https://notesnook.com) account via the [Inbox API](https://help.notesnook.com/inbox-api/getting-started).

Just say **"save this to Notesnook"** or **"send to Notesnook"** and pi will do the rest.

## Requirements

- Notesnook **3.4.x beta or later** — earlier versions do not generate a valid PGP keypair for the Inbox API and will fail with a `500 Misformed armored text` error.
  Enable beta updates in Notesnook → Settings → About.

## Setup

### 1. Enable the Inbox API and generate PGP keys

1. Open Notesnook → **Settings → Inbox**
2. Toggle **Enable Inbox API** on
3. When prompted, choose **Auto-generate keys** — this creates the PGP keypair the server uses to encrypt incoming notes
4. Click **Save**
5. **Sync Notesnook** so the public key is uploaded to the server

### 2. Create an API key

1. Still in Settings → Inbox, click **Create Key**
2. Give it a name (e.g. `pi`) and set an expiry
3. Copy the key — it looks like `nn__xxxx...`

### 3. Save the key to pi config

Create `~/.pi/notesnook.json`:

```bash
echo '{ "apiKey": "nn__your-key-here" }' > ~/.pi/notesnook.json
```

The file is read-only to you (`600`) and never leaves your machine.

Alternatively, set an environment variable (takes priority over the file):

```bash
export NOTESNOOK_INBOX_API_KEY="nn__your-key-here"
```

### 4. Reload pi

Run `/reload` in pi to activate the extension.

## Usage

Just ask pi naturally:

- _"Save this to my Notesnook"_
- _"Send the output above to Notesnook"_
- _"Add this to Notesnook, pin it"_
- _"Save to Notesnook and mark as favourite"_

Pi will pick a title from context, convert the content from Markdown to HTML (the only format the Inbox API currently supports), and send it. The note appears in Notesnook after your next sync.

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Misformed armored text` (500) | Notesnook version too old or PGP keys not generated | Update to 3.4.x beta, disable and re-enable Inbox API, choose Auto-generate keys, sync |
| `unauthorized` (401) | API key wrong or revoked | Check `~/.pi/notesnook.json`, generate a new key in Settings → Inbox |
| `inbox public key not found` (403) | Inbox API not enabled | Enable it in Settings → Inbox and sync |
| `Too Many Requests` (429) | Rate limit hit (60 req/min) | Wait a minute and try again |
| Note not appearing | Not synced yet | Trigger a sync in Notesnook |
