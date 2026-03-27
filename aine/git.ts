import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FileStatus, ChangedFile } from "./types.js";



const MAX_BUF = 50 * 1024 * 1024;

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd, encoding: "utf8", maxBuffer: MAX_BUF, stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

function gitSafe(args: string[], cwd: string): string {
  try { return git(args, cwd); } catch { return ""; }
}

export function isGitRepo(cwd: string): boolean {
  try { git(["rev-parse", "--is-inside-work-tree"], cwd); return true; } catch { return false; }
}

export function getRepoRoot(cwd: string): string {
  return git(["rev-parse", "--show-toplevel"], cwd);
}

export function getRepoName(cwd: string): string {
  return getRepoRoot(cwd).split("/").pop() || "unknown";
}

export function getCurrentBranch(cwd: string): string {
  try { return git(["branch", "--show-current"], cwd); } catch { return git(["rev-parse", "--short", "HEAD"], cwd); }
}

export function isValidGitRef(ref: string, cwd: string): boolean {
  if (ref.includes("..")) return ref.split("..").every(p => p === "" || isValidGitRef(p, cwd));
  try { git(["rev-parse", "--verify", ref], cwd); return true; } catch { return false; }
}

/**
 * Parse CLI/command refs into diffArgs + description.
 * Returns `{ error }` if any ref is invalid.
 */
export function parseRefs(
  refs: string[],
  cwd: string,
): { diffArgs: string[]; description: string } | { error: string } {
  for (const ref of refs) {
    if (!isValidGitRef(ref, cwd)) return { error: ref };
  }

  if (refs.length === 1) {
    return {
      diffArgs: [refs[0]],
      description: refs[0].includes("..") ? refs[0] : "Changes from " + refs[0],
    };
  }
  if (refs.length === 2) {
    return {
      diffArgs: [refs[0] + ".." + refs[1]],
      description: refs[0] + ".." + refs[1],
    };
  }
  return { diffArgs: [], description: "Working tree changes" };
}

const STATUS_MAP: Record<string, FileStatus> = {
  A: "added", D: "deleted", M: "modified", R: "renamed", C: "copied", T: "modified",
};

function parseNumstat(raw: string): Map<string, { add: number; del: number }> {
  const m = new Map<string, { add: number; del: number }>();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const [a, d, ...rest] = line.split("\t");
    const path = rest.join("\t");
    if (!path) continue;
    m.set(path, { add: a === "-" ? 0 : +a, del: d === "-" ? 0 : +d });
  }
  return m;
}

export function getChangedFiles(diffArgs: string[], cwd: string): ChangedFile[] {
  const files: ChangedFile[] = [];

  if (diffArgs.length === 0) {
    const staged = gitSafe(["diff", "--cached", "--name-status", "--no-renames"], cwd);
    const unstaged = gitSafe(["diff", "--name-status", "--no-renames"], cwd);
    const untracked = gitSafe(["ls-files", "--others", "--exclude-standard"], cwd);
    const stagedNum = parseNumstat(gitSafe(["diff", "--cached", "--numstat", "--no-renames"], cwd));
    const unstagedNum = parseNumstat(gitSafe(["diff", "--numstat", "--no-renames"], cwd));

    const seen = new Set<string>();
    for (const line of [...staged.split("\n"), ...unstaged.split("\n")]) {
      if (!line.trim()) continue;
      const [code, ...rest] = line.split("\t");
      const path = rest[rest.length - 1];
      if (!path || seen.has(path)) continue;
      seen.add(path);
      const sn = stagedNum.get(path);
      const un = unstagedNum.get(path);
      files.push({
        path,
        status: STATUS_MAP[code[0]] || "modified",
        additions: (sn?.add || 0) + (un?.add || 0),
        deletions: (sn?.del || 0) + (un?.del || 0),
      });
    }

    for (const p of untracked.split("\n")) {
      if (!p.trim() || seen.has(p)) continue;
      seen.add(p);
      let lines = 0;
      try {
        const content = readFileSync(join(cwd, p), "utf-8");
        lines = content.split("\n").length;
        if (content.endsWith("\n")) lines--;
      } catch {}
      files.push({ path: p, status: "added", untracked: true, additions: lines, deletions: 0 });
    }
  } else {
    const out = gitSafe(["diff", "--name-status", ...diffArgs], cwd);
    const numstat = parseNumstat(gitSafe(["diff", "--numstat", ...diffArgs], cwd));

    for (const line of out.split("\n")) {
      if (!line.trim()) continue;
      const [code, ...rest] = line.split("\t");
      const path = rest[rest.length - 1];
      const oldPath = rest.length > 1 ? rest[0] : undefined;
      if (!path) continue;
      const ns = numstat.get(path);
      files.push({
        path, oldPath,
        status: STATUS_MAP[code[0]] || "modified",
        additions: ns?.add || 0,
        deletions: ns?.del || 0,
      });
    }
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function getFileAtRef(ref: string, filePath: string, cwd: string): string | null {
  try {
    return execFileSync("git", ["show", `${ref}:${filePath}`], {
      cwd, encoding: "utf8", maxBuffer: MAX_BUF,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

export function readWorkingFile(filePath: string, cwd: string): string | null {
  try {
    return readFileSync(join(cwd, filePath), "utf-8");
  } catch {
    return null;
  }
}

/** Parse diffArgs into old/new refs. null newRef means working tree. */
export function parseDiffRefs(diffArgs: string[]): { oldRef: string; newRef: string | null } {
  if (diffArgs.length === 0) return { oldRef: "HEAD", newRef: null };
  const arg = diffArgs[0];
  if (arg.includes("..")) {
    const [a, b] = arg.split("..");
    return { oldRef: a || "HEAD", newRef: b || "HEAD" };
  }
  return { oldRef: arg, newRef: null };
}

export function getOldNewContents(
  file: ChangedFile,
  diffArgs: string[],
  cwd: string,
): { oldContent: string | null; newContent: string | null } {
  const { oldRef, newRef } = parseDiffRefs(diffArgs);

  let oldContent: string | null = null;
  let newContent: string | null = null;

  if (file.status !== "added" || !file.untracked) {
    oldContent = getFileAtRef(oldRef, file.oldPath || file.path, cwd);
  }

  if (file.status !== "deleted") {
    newContent = newRef
      ? getFileAtRef(newRef, file.path, cwd)
      : readWorkingFile(file.path, cwd);
  }

  return { oldContent, newContent };
}

/** Fast hash of old+new content pair, used as cache key. Uses Bun.hash (wyhash). */
export function contentHash(
  oldContent: string | null,
  newContent: string | null,
): string {
  // Hash each part separately to avoid concatenating large strings.
  // Mix h1 into h2's seed so collisions require both parts to collide simultaneously.
  const h1 = Bun.hash(oldContent ?? "\0NULL\0");
  const h2 = Bun.hash(newContent ?? "\0NULL\0", Number(h1 & 0xFFFFFFFFn));
  return h1.toString(36) + "_" + h2.toString(36);
}

/**
 * Bulk-read file contents at a given ref using `git cat-file --batch`.
 * Returns a Map from "ref:path" → content string (missing entries = file not found).
 * ~30× faster than sequential `git show` for many files.
 */
export function bulkGetFilesAtRef(
  ref: string,
  paths: string[],
  cwd: string,
): Promise<Map<string, string | null>> {
  return new Promise((resolve) => {
    if (paths.length === 0) {
      resolve(new Map());
      return;
    }

    const proc = spawn("git", ["cat-file", "--batch"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const results = new Map<string, string | null>();
    let buf = Buffer.alloc(0);
    let bufOffset = 0; // track consumed bytes to avoid repeated subarray
    let pendingIdx = 0;

    // Each response from cat-file --batch is:
    //   <sha> <type> <size>\n<content>\n   (for found objects)
    //   <query> missing\n                   (for missing objects)
    const processBuffer = () => {
      while (pendingIdx < paths.length) {
        // Need at least one line (header)
        const nlIdx = buf.indexOf(10, bufOffset); // \n
        if (nlIdx === -1) break;

        const headerLine = buf.subarray(bufOffset, nlIdx).toString("utf8");
        const query = `${ref}:${paths[pendingIdx]}`;

        if (headerLine.endsWith(" missing")) {
          results.set(query, null);
          bufOffset = nlIdx + 1;
          pendingIdx++;
          continue;
        }

        // Parse: "<sha> blob <size>"
        const sizeMatch = headerLine.match(/\s(\d+)$/);
        if (!sizeMatch) {
          // Unexpected format, skip
          results.set(query, null);
          bufOffset = nlIdx + 1;
          pendingIdx++;
          continue;
        }

        const size = parseInt(sizeMatch[1], 10);
        const contentStart = nlIdx + 1;
        const contentEnd = contentStart + size;
        // Need size bytes + trailing \n
        if (buf.length < contentEnd + 1) break;

        results.set(query, buf.subarray(contentStart, contentEnd).toString("utf8"));
        bufOffset = contentEnd + 1;
        pendingIdx++;
      }
      // Compact buffer when we've consumed a lot
      if (bufOffset > 65536) {
        buf = buf.subarray(bufOffset);
        bufOffset = 0;
      }
    };

    proc.stdout.on("data", (chunk: Buffer) => {
      buf = bufOffset > 0
        ? Buffer.concat([buf.subarray(bufOffset), chunk])
        : Buffer.concat([buf, chunk]);
      bufOffset = 0;
      processBuffer();
    });

    proc.on("close", () => {
      processBuffer();
      // Mark any remaining as null
      for (let i = pendingIdx; i < paths.length; i++) {
        results.set(`${ref}:${paths[i]}`, null);
      }
      resolve(results);
    });

    proc.stderr.on("data", () => {});

    for (const p of paths) {
      proc.stdin.write(`${ref}:${p}\n`);
    }
    proc.stdin.end();
  });
}

/**
 * Bulk-read old+new contents for all changed files.
 * Uses `git cat-file --batch` for ref-based reads (30× faster than sequential git show).
 */
export async function bulkGetAllContents(
  files: ChangedFile[],
  diffArgs: string[],
  cwd: string,
): Promise<Map<string, { oldContent: string | null; newContent: string | null }>> {
  const { oldRef, newRef } = parseDiffRefs(diffArgs);

  // Collect paths to read from each ref
  const oldPaths: string[] = [];
  const newRefPaths: string[] = [];
  for (const file of files) {
    if (file.status !== "added" || !file.untracked) {
      oldPaths.push(file.oldPath || file.path);
    }
    if (file.status !== "deleted" && newRef) {
      newRefPaths.push(file.path);
    }
  }

  // Bulk-read from git refs in parallel
  const [oldResults, newRefResults] = await Promise.all([
    bulkGetFilesAtRef(oldRef, oldPaths, cwd),
    newRef ? bulkGetFilesAtRef(newRef, newRefPaths, cwd) : Promise.resolve(new Map<string, string | null>()),
  ]);

  // Assemble results
  const result = new Map<string, { oldContent: string | null; newContent: string | null }>();
  for (const file of files) {
    let oldContent: string | null = null;
    let newContent: string | null = null;

    if (file.status !== "added" || !file.untracked) {
      const key = `${oldRef}:${file.oldPath || file.path}`;
      oldContent = oldResults.get(key) ?? null;
    }

    if (file.status !== "deleted") {
      if (newRef) {
        const key = `${newRef}:${file.path}`;
        newContent = newRefResults.get(key) ?? null;
      } else {
        newContent = readWorkingFile(file.path, cwd);
      }
    }

    result.set(file.path, { oldContent, newContent });
  }

  return result;
}


