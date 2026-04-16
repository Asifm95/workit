import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { makeRepo } from "../../fixtures/make-repo";
import {
  isGitRepo,
  currentBranch,
  branchExists,
  isDirty,
  hasUnpushedCommits,
} from "../../../src/git/repo";

describe("isGitRepo", () => {
  let repo: Awaited<ReturnType<typeof makeRepo>>;
  beforeEach(async () => { repo = await makeRepo(); });
  afterEach(async () => { await repo.cleanup(); });

  test("returns true for a git repo", async () => {
    expect(await isGitRepo(repo.path)).toBe(true);
  });
  test("returns false for a non-repo", async () => {
    expect(await isGitRepo("/tmp")).toBe(false);
  });
});

describe("currentBranch", () => {
  let repo: Awaited<ReturnType<typeof makeRepo>>;
  beforeEach(async () => { repo = await makeRepo(); });
  afterEach(async () => { await repo.cleanup(); });

  test("returns the initial branch name", async () => {
    expect(await currentBranch(repo.path)).toBe("main");
  });
});

describe("branchExists", () => {
  let repo: Awaited<ReturnType<typeof makeRepo>>;
  beforeEach(async () => { repo = await makeRepo(); });
  afterEach(async () => { await repo.cleanup(); });

  test("returns true for main", async () => {
    expect(await branchExists(repo.path, "main")).toBe(true);
  });
  test("returns false for unknown branch", async () => {
    expect(await branchExists(repo.path, "nope")).toBe(false);
  });
});

describe("isDirty", () => {
  let repo: Awaited<ReturnType<typeof makeRepo>>;
  beforeEach(async () => { repo = await makeRepo(); });
  afterEach(async () => { await repo.cleanup(); });

  test("returns false for a clean repo", async () => {
    expect(await isDirty(repo.path)).toBe(false);
  });
  test("returns true when there is an uncommitted change", async () => {
    await Bun.write(join(repo.path, "README.md"), "changed\n");
    expect(await isDirty(repo.path)).toBe(true);
  });
});

describe("hasUnpushedCommits", () => {
  let repo: Awaited<ReturnType<typeof makeRepo>>;
  beforeEach(async () => { repo = await makeRepo(); });
  afterEach(async () => { await repo.cleanup(); });

  test("returns false when no upstream is configured", async () => {
    expect(await hasUnpushedCommits(repo.path, "main")).toBe(false);
  });
});
