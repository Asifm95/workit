import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeRepo } from "../../fixtures/make-repo";
import { addWorktree, removeWorktree } from "../../../src/git/worktree";
import { branchExists } from "../../../src/git/repo";
import { pathExists } from "../../../src/utils/fs";

describe("addWorktree / removeWorktree", () => {
  let repo: Awaited<ReturnType<typeof makeRepo>>;
  let workdir: string;
  beforeEach(async () => {
    repo = await makeRepo();
    workdir = await mkdtemp(join(tmpdir(), "workit-wt-"));
  });
  afterEach(async () => {
    await repo.cleanup();
    await rm(workdir, { recursive: true, force: true });
  });

  test("addWorktree creates a new branch and directory", async () => {
    const target = join(workdir, "feature");
    await addWorktree({
      mainRepoPath: repo.path,
      targetPath: target,
      branch: "feat/thing",
    });
    expect(await pathExists(target)).toBe(true);
    expect(await branchExists(repo.path, "feat/thing")).toBe(true);
  });

  test("removeWorktree removes the directory", async () => {
    const target = join(workdir, "feature");
    await addWorktree({
      mainRepoPath: repo.path,
      targetPath: target,
      branch: "feat/thing",
    });
    await removeWorktree({ mainRepoPath: repo.path, targetPath: target });
    expect(await pathExists(target)).toBe(false);
  });
});
