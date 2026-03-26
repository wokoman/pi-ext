/**
 * /split-fork — Fork this session into a new pi process in a cmux split.
 *
 * Inspired by mitsuhiko's Ghostty split-fork extension.
 * Uses the cmux socket API instead of AppleScript, so it works on any platform.
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { existsSync, promises as fs } from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { CmuxClient } from "./cmux-client.js";

function shellQuote(value: string): string {
	if (value.length === 0) return "''";
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function getPiInvocationParts(): string[] {
	const currentScript = process.argv[1];
	if (currentScript && existsSync(currentScript)) {
		return [process.execPath, currentScript];
	}

	const execName = path.basename(process.execPath).toLowerCase();
	const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
	if (!isGenericRuntime) {
		return [process.execPath];
	}

	return ["pi"];
}

function buildPiCommand(sessionFile: string | undefined, prompt: string): string {
	const parts = [...getPiInvocationParts()];

	if (sessionFile) {
		parts.push("--session", sessionFile);
	}

	if (prompt.length > 0) {
		parts.push("--", prompt);
	}

	return parts.map(shellQuote).join(" ");
}

async function createForkedSession(ctx: ExtensionCommandContext): Promise<string | undefined> {
	const sessionFile = ctx.sessionManager.getSessionFile();
	if (!sessionFile) return undefined;

	const sessionDir = path.dirname(sessionFile);
	const branchEntries = ctx.sessionManager.getBranch();
	const currentHeader = ctx.sessionManager.getHeader();

	const timestamp = new Date().toISOString();
	const fileTimestamp = timestamp.replace(/[:.]/g, "-");
	const newSessionId = randomUUID();
	const newSessionFile = path.join(sessionDir, `${fileTimestamp}_${newSessionId}.jsonl`);

	const newHeader = {
		type: "session",
		version: currentHeader?.version ?? 3,
		id: newSessionId,
		timestamp,
		cwd: currentHeader?.cwd ?? ctx.cwd,
		parentSession: sessionFile,
	};

	const lines =
		[JSON.stringify(newHeader), ...branchEntries.map((entry) => JSON.stringify(entry))].join("\n") + "\n";

	await fs.mkdir(sessionDir, { recursive: true });
	await fs.writeFile(newSessionFile, lines, "utf8");

	return newSessionFile;
}

export function wireSplitFork(pi: ExtensionAPI, client: CmuxClient): void {
	pi.registerCommand("split-fork", {
		description: "Fork this session into a new pi process in a cmux split pane. Usage: /split-fork [optional prompt]",
		handler: async (args, ctx) => {
			if (!client.isConnected()) {
				const ok = await client.connect();
				if (!ok) {
					ctx.ui.notify("cmux is not connected.", "warning");
					return;
				}
			}

			const wasBusy = !ctx.isIdle();
			const prompt = args.trim();

			// 1. Fork the session
			const forkedSessionFile = await createForkedSession(ctx);

			// 2. Split current surface to the right
			const splitResult = await client.request("surface.split", { direction: "right" });
			if (!splitResult || splitResult.error) {
				const reason = splitResult?.error ?? "unknown cmux error";
				ctx.ui.notify(`Failed to create cmux split: ${reason}`, "error");
				if (forkedSessionFile) {
					ctx.ui.notify(`Forked session was created: ${forkedSessionFile}`, "info");
				}
				return;
			}

			// 3. Get the new surface ID from the split result
			const newSurfaceId = splitResult.new_surface_id ?? splitResult.surface_id;
			if (!newSurfaceId) {
				ctx.ui.notify("Split succeeded but no surface ID returned.", "error");
				return;
			}

			// 4. Small delay to let the new shell initialize
			await new Promise((r) => setTimeout(r, 500));

			// 5. Send the pi command to the new split
			const command = buildPiCommand(forkedSessionFile, prompt) + "\n";
			await client.request("surface.send_text", {
				surface_id: newSurfaceId,
				text: command,
			});

			// 6. Notify the user
			if (forkedSessionFile) {
				const fileName = path.basename(forkedSessionFile);
				const suffix = prompt ? " and sent prompt" : "";
				ctx.ui.notify(`Forked to ${fileName} in a new cmux split${suffix}.`, "info");
				if (wasBusy) {
					ctx.ui.notify(
						"Forked from current committed state (in-flight turn continues in original session).",
						"info",
					);
				}
			} else {
				ctx.ui.notify("Opened a new cmux split (no persisted session to fork).", "warning");
			}
		},
	});
}
