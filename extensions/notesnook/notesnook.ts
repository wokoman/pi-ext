/**
 * Notesnook Inbox API Extension
 *
 * Registers a `send_to_notesnook` tool so the agent can push notes (markdown or
 * plain text) directly to your Notesnook account via the Inbox API.
 *
 * Setup (one-time): create ~/.pi/notesnook.json:
 *   { "apiKey": "<your-inbox-api-key>" }
 *
 * Alternatively, set NOTESNOOK_INBOX_API_KEY in your environment.
 *
 * The API key is created in Notesnook → Settings → Inbox → Create Key.
 * Content is accepted as Markdown and converted to HTML before sending,
 * because the Notesnook Inbox API only supports HTML content today.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { marked } from "marked";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const CONFIG_FILE = path.join(os.homedir(), ".pi", "notesnook.json");
const NOTESNOOK_INBOX_URL = "https://inbox.notesnook.com/";

interface NotesnookConfig {
	apiKey?: string;
}

interface NotesnookPayload {
	title: string;
	type: "note";
	source: string;
	version: 1;
	content?: {
		type: "html";
		data: string;
	};
	pinned?: boolean;
	favorite?: boolean;
}

// ── Config helpers ────────────────────────────────────────────────────────────

function loadConfig(): NotesnookConfig {
	try {
		if (fs.existsSync(CONFIG_FILE)) {
			return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) as NotesnookConfig;
		}
	} catch {
		// ignore parse errors
	}
	return {};
}

function getApiKey(): string | undefined {
	// Env var takes priority so CI / secrets managers can override
	if (process.env.NOTESNOOK_INBOX_API_KEY) return process.env.NOTESNOOK_INBOX_API_KEY;
	return loadConfig().apiKey;
}

// ── API call ──────────────────────────────────────────────────────────────────

async function sendToNotesnook(
	apiKey: string,
	payload: NotesnookPayload,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
	const res = await fetch(NOTESNOOK_INBOX_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: apiKey,
		},
		body: JSON.stringify(payload),
	});

	if (res.ok) return { ok: true };

	let message = `HTTP ${res.status}`;
	try {
		const body = (await res.json()) as { error?: string; description?: string };
		message = body.description ?? body.error ?? message;
	} catch {
		// ignore
	}
	return { ok: false, status: res.status, message };
}

// ── Extension ─────────────────────────────────────────────────────────────────

export default function notesnookExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "send_to_notesnook",
		label: "Send to Notesnook",
		description:
			"Send a note (markdown or plain text) to the user's Notesnook account via the Inbox API. " +
			"Use this whenever the user says 'save to Notesnook', 'send to Notesnook', 'add to Notesnook', or similar.",
		promptSnippet:
			"Send content to the user's Notesnook Inbox when they ask to save or send something to Notesnook.",
		promptGuidelines: [
			"Use send_to_notesnook when the user explicitly asks to save or send content to Notesnook.",
			"Derive the title from context if not provided (e.g. first heading, conversation topic).",
			"Do NOT repeat the title as an H1 at the top of the content — Notesnook already displays the title above the body.",
			"Pass the full markdown content — it will be converted to HTML automatically.",
			"Set favorite=true only when the user explicitly asks to favourite or star the note.",
			"Set pinned=true only when the user explicitly asks to pin the note.",
		],
		parameters: Type.Object({
			title: Type.String({
				description: "Title for the note. Required.",
				minLength: 1,
			}),
			content: Type.Optional(
				Type.String({
					description:
						"Note body as Markdown (will be converted to HTML). Leave empty for a title-only note.",
				}),
			),
			pinned: Type.Optional(
				Type.Boolean({ description: "Pin the note. Default false.", default: false }),
			),
			favorite: Type.Optional(
				Type.Boolean({ description: "Mark as favourite. Default false.", default: false }),
			),
		}),
		async execute(_toolCallId, params) {
			const apiKey = getApiKey();
			if (!apiKey) {
				return {
					content: [
						{
							type: "text",
							text:
								"❌ Notesnook API key not configured.\n\n" +
								'Create ~/.pi/notesnook.json with: { "apiKey": "<your-key>" }\n\n' +
								"Get the key from Notesnook → Settings → Inbox → Create Key",
						},
					],
					details: { error: "missing_api_key" },
				};
			}

			// Convert markdown → HTML when content is provided
			let htmlContent: string | undefined;
			if (params.content?.trim()) {
				htmlContent = await marked(params.content, { async: true });
			}

			const payload: NotesnookPayload = {
				title: params.title,
				type: "note",
				source: "pi-coding-agent",
				version: 1,
				...(htmlContent ? { content: { type: "html", data: htmlContent } } : {}),
				...(params.pinned ? { pinned: true } : {}),
				...(params.favorite ? { favorite: true } : {}),
			};

			const result = await sendToNotesnook(apiKey, payload);

			if (result.ok) {
				return {
					content: [
						{
							type: "text",
							text: `✅ Note "${params.title}" sent to Notesnook. It will appear after your next sync.`,
						},
					],
					details: { title: params.title },
				};
			}

			let hint = "";
			if (result.status === 401)
				hint = "\n\nCheck your API key in ~/.pi/notesnook.json.";
			else if (result.status === 403)
				hint = "\n\nEnsure Inbox API is enabled: Notesnook → Settings → Inbox.";
			else if (result.status === 429)
				hint = "\n\nRate limit hit (60 req/min). Wait a moment and try again.";

			return {
				content: [
					{
						type: "text",
						text: `❌ Failed to send to Notesnook: ${result.message}${hint}`,
					},
				],
				details: { error: result.message, status: result.status },
			};
		},
	});
}
