/**
 * Creates a temporary git repo with known files for deterministic testing.
 *
 * Initial commit:
 *   hello.ts  → "export const hello = 'world';\n"
 *   readme.md → "# Test Repo\n\nThis is a test.\n"
 *   utils.ts  → "export function add(a: number, b: number) { return a + b; }\n"
 *
 * Working tree changes (unstaged):
 *   hello.ts  → modified ('world' → 'aine')
 *   newfile.ts → added
 *   utils.ts  → deleted
 */
import { mkdtempSync, writeFileSync, unlinkSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface FixtureRepo {
  dir: string;
  cleanup: () => void;
}

function git(args: string[], cwd: string) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

/**
 * Create a fixture repo with an initial commit and working tree changes.
 * Returns the repo directory and a cleanup function.
 */
export function createFixtureRepo(): FixtureRepo {
  const dir = mkdtempSync(join(tmpdir(), "aine-test-"));

  // Init repo
  git(["init"], dir);
  git(["config", "user.email", "test@test.com"], dir);
  git(["config", "user.name", "Test"], dir);

  // Initial commit with 3 files
  writeFileSync(join(dir, "hello.ts"), "export const hello = 'world';\n");
  writeFileSync(join(dir, "readme.md"), "# Test Repo\n\nThis is a test.\n");
  writeFileSync(
    join(dir, "utils.ts"),
    "export function add(a: number, b: number) { return a + b; }\n",
  );
  git(["add", "."], dir);
  git(["commit", "-m", "initial"], dir);

  // Working tree changes (unstaged)
  writeFileSync(join(dir, "hello.ts"), "export const hello = 'aine';\n");
  writeFileSync(join(dir, "newfile.ts"), "export const newFile = true;\n");
  unlinkSync(join(dir, "utils.ts"));

  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    },
  };
}

/**
 * Create a fixture repo with staged changes (for --staged tests).
 */
export function createStagedFixtureRepo(): FixtureRepo {
  const repo = createFixtureRepo();
  // Stage the hello.ts modification
  git(["add", "hello.ts"], repo.dir);
  return repo;
}

/**
 * Create a fixture repo with two commits (for HEAD~1..HEAD tests).
 */
export function createTwoCommitRepo(): FixtureRepo {
  const dir = mkdtempSync(join(tmpdir(), "aine-test-"));

  git(["init"], dir);
  git(["config", "user.email", "test@test.com"], dir);
  git(["config", "user.name", "Test"], dir);

  // First commit
  writeFileSync(join(dir, "hello.ts"), "export const hello = 'world';\n");
  writeFileSync(join(dir, "readme.md"), "# Test Repo\n");
  git(["add", "."], dir);
  git(["commit", "-m", "first"], dir);

  // Second commit: modify hello.ts, add config.ts
  writeFileSync(join(dir, "hello.ts"), "export const hello = 'aine';\nexport const version = 2;\n");
  writeFileSync(join(dir, "config.ts"), "export default { debug: true };\n");
  git(["add", "."], dir);
  git(["commit", "-m", "second"], dir);

  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    },
  };
}
