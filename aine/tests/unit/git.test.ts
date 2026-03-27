import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createFixtureRepo,
  createTwoCommitRepo,
  type FixtureRepo,
} from "../fixtures/setup-repo.js";
import {
  isGitRepo,
  getRepoName,
  getCurrentBranch,
  getChangedFiles,
  getOldNewContents,
  parseDiffRefs,
  parseRefs,
  contentHash,
} from "../../git.js";

describe("git helpers – pure functions", () => {
  it("parseDiffRefs: no args → HEAD vs working tree", () => {
    const r = parseDiffRefs([]);
    expect(r).toEqual({ oldRef: "HEAD", newRef: null });
  });

  it("parseDiffRefs: single ref", () => {
    const r = parseDiffRefs(["main"]);
    expect(r).toEqual({ oldRef: "main", newRef: null });
  });

  it("parseDiffRefs: range ref", () => {
    const r = parseDiffRefs(["main..feature"]);
    expect(r).toEqual({ oldRef: "main", newRef: "feature" });
  });

  it("parseDiffRefs: range with empty left", () => {
    const r = parseDiffRefs(["..feature"]);
    expect(r).toEqual({ oldRef: "HEAD", newRef: "feature" });
  });

  it("contentHash: same input → same hash", () => {
    const h1 = contentHash("hello", "world");
    const h2 = contentHash("hello", "world");
    expect(h1).toBe(h2);
  });

  it("contentHash: different input → different hash", () => {
    const h1 = contentHash("hello", "world");
    const h2 = contentHash("hello", "other");
    expect(h1).not.toBe(h2);
  });

  it("contentHash: null handling", () => {
    const h1 = contentHash(null, "world");
    const h2 = contentHash("hello", null);
    const h3 = contentHash(null, null);
    expect(h1).not.toBe(h2);
    expect(h1).not.toBe(h3);
  });
});

describe("git helpers – fixture repo", () => {
  let repo: FixtureRepo;

  beforeAll(() => {
    repo = createFixtureRepo();
  });

  afterAll(() => {
    repo.cleanup();
  });

  it("isGitRepo returns true for git repos", () => {
    expect(isGitRepo(repo.dir)).toBe(true);
  });

  it("isGitRepo returns false for non-repos", () => {
    expect(isGitRepo("/tmp")).toBe(false);
  });

  it("getRepoName returns directory name", () => {
    const name = getRepoName(repo.dir);
    expect(name).toMatch(/^aine-test-/);
  });

  it("getCurrentBranch returns a branch name", () => {
    const branch = getCurrentBranch(repo.dir);
    expect(typeof branch).toBe("string");
    expect(branch.length).toBeGreaterThan(0);
  });

  it("getChangedFiles: working tree shows 3 changes", () => {
    const files = getChangedFiles([], repo.dir);
    expect(files.length).toBe(3);

    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual(["hello.ts", "newfile.ts", "utils.ts"]);

    const hello = files.find((f) => f.path === "hello.ts")!;
    expect(hello.status).toBe("modified");
    expect(hello.additions).toBeGreaterThan(0);

    const newfile = files.find((f) => f.path === "newfile.ts")!;
    expect(newfile.status).toBe("added");
    expect(newfile.untracked).toBe(true);

    const utils = files.find((f) => f.path === "utils.ts")!;
    expect(utils.status).toBe("deleted");
  });

  it("getOldNewContents: modified file has both old and new", () => {
    const files = getChangedFiles([], repo.dir);
    const hello = files.find((f) => f.path === "hello.ts")!;
    const { oldContent, newContent } = getOldNewContents(hello, [], repo.dir);

    expect(oldContent).toContain("world");
    expect(newContent).toContain("aine");
  });

  it("getOldNewContents: added untracked file has null old", () => {
    const files = getChangedFiles([], repo.dir);
    const nf = files.find((f) => f.path === "newfile.ts")!;
    const { oldContent, newContent } = getOldNewContents(nf, [], repo.dir);

    expect(oldContent).toBeNull();
    expect(newContent).toContain("newFile");
  });

  it("getOldNewContents: deleted file has null new", () => {
    const files = getChangedFiles([], repo.dir);
    const utils = files.find((f) => f.path === "utils.ts")!;
    const { oldContent, newContent } = getOldNewContents(utils, [], repo.dir);

    expect(oldContent).toContain("add");
    expect(newContent).toBeNull();
  });

  it("parseRefs: valid ref", () => {
    const r = parseRefs(["HEAD"], repo.dir);
    expect("diffArgs" in r).toBe(true);
  });

  it("parseRefs: invalid ref returns error", () => {
    const r = parseRefs(["nonexistent-branch-xyz"], repo.dir);
    expect("error" in r).toBe(true);
  });
});

describe("git helpers – two-commit repo", () => {
  let repo: FixtureRepo;

  beforeAll(() => {
    repo = createTwoCommitRepo();
  });

  afterAll(() => {
    repo.cleanup();
  });

  it("getChangedFiles with HEAD~1..HEAD shows inter-commit changes", () => {
    const files = getChangedFiles(["HEAD~1..HEAD"], repo.dir);
    expect(files.length).toBe(2);

    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual(["config.ts", "hello.ts"]);
  });

  it("getOldNewContents with ref range reads from git objects", () => {
    const files = getChangedFiles(["HEAD~1..HEAD"], repo.dir);
    const hello = files.find((f) => f.path === "hello.ts")!;
    const { oldContent, newContent } = getOldNewContents(
      hello,
      ["HEAD~1..HEAD"],
      repo.dir,
    );

    expect(oldContent).toContain("world");
    expect(newContent).toContain("aine");
    expect(newContent).toContain("version");
  });
});
