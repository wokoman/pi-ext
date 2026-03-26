/**
 * Files Provider
 *
 * Lists workspace files using fd (fast) with fallback to find.
 */

import { execSync } from "node:child_process";
import { resolve } from "node:path";
import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import type { TelescopeProvider } from "../types.js";

function hasBinary(name: string): boolean {
	try {
		execSync(`which ${name}`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

const useFd = hasBinary("fd");

function listFiles(cwd: string): string[] {
	try {
		const cmd = useFd
			? "fd --type f --hidden --follow --exclude .git --exclude node_modules --exclude .venv --exclude dist --exclude build --max-results 10000"
			: "find . -type f -not -path '*/.git/*' -not -path '*/node_modules/*' -not -path '*/.venv/*' -not -path '*/dist/*' -not -path '*/build/*' | head -10000";

		const output = execSync(cmd, {
			encoding: "utf-8",
			cwd,
			timeout: 10_000,
			maxBuffer: 10 * 1024 * 1024,
		});

		let lines = output.split("\n").filter(Boolean);

		// Normalize: strip cwd prefix and leading ./
		const prefix = cwd.endsWith("/") ? cwd : cwd + "/";
		lines = lines.map((l) => {
			if (l.startsWith(prefix)) return l.slice(prefix.length);
			if (l.startsWith("./")) return l.slice(2);
			return l;
		});

		return lines.sort();
	} catch {
		return [];
	}
}

export const filesProvider: TelescopeProvider<string> = {
	name: "files",
	icon: "📄",
	description: "Workspace files",

	load(cwd) {
		return listFiles(cwd);
	},

	getSearchText(item) {
		return item;
	},

	getDisplayText(item, theme, highlighted) {
		return highlighted ?? item;
	},

	async onSelect(item, ctx) {
		const fullPath = resolve(ctx.cwd, item);
		ctx.ui.pasteToEditor(fullPath);
	},

	getPreview(item, maxLines) {
		// Preview will be rendered with theme in telescope.ts
		// Return raw path for deferred rendering
		return null; // handled by telescope via filePreview()
	},
};

/** Augmented files provider that stores cwd for preview. */
export function createFilesProvider(cwd: string): TelescopeProvider<string> {
	return {
		...filesProvider,
		load: () => listFiles(cwd),
		getPreview(item, maxLines) {
			// Return a marker — telescope.ts will render with theme
			return [`__FILE__:${resolve(cwd, item)}`];
		},
	};
}
