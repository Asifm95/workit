import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, chmod, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { runNewCommand } from "../../src/commands/new";
import { pathExists } from "../../src/utils/fs";
import type { Config } from "../../src/core/config";

async function setupTestRepo(parent: string, name: string) {
  const repo = join(parent, name);
  await mkdir(repo);
  await execa("git", ["init", "-q", "-b", "main", repo]);
  await execa("git", ["config", "user.email", "t@t"], { cwd: repo });
  await execa("git", ["config", "user.name", "t"], { cwd: repo });
  await Bun.write(join(repo, "README.md"), "hi\n");
  await Bun.write(join(repo, "setup.sh"), "#!/bin/bash\necho setup-done\n");
  await chmod(join(repo, "setup.sh"), 0o755);
  await execa("git", ["add", "."], { cwd: repo });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: repo });
  return repo;
}

describe("runNewCommand", () => {
  let root: string;
  let workspacesDir: string;
  let projectsRoot: string;
  let config: Config;
  let templatePath: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "workit-int-"));
    workspacesDir = join(root, "workspaces");
    projectsRoot = join(root, "projects");
    await mkdir(projectsRoot);
    await setupTestRepo(projectsRoot, "alpha");
    await setupTestRepo(projectsRoot, "beta");
    templatePath = join(root, "workspace-CLAUDE.md");
    await Bun.write(
      templatePath,
      "# {{feature_title}}\n\n{{#each projects}}- {{folder}}\n{{/each}}"
    );
    config = {
      workspacesDir,
      defaultBranchType: "feat",
      defaultTerminal: "none",
      terminalCommand: {},
      templates: { workspaceClaudeMd: templatePath },
      setupScriptPaths: ["./setup.sh", ".workit/setup.sh"],
    };
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("single-project: creates worktree, runs setup, no workspace folder", async () => {
    const result = await runNewCommand({
      config,
      description: "First feature",
      branchType: "feat",
      projectPaths: [join(projectsRoot, "alpha")],
      terminal: "none",
      assumeYes: true,
    });
    expect(result.ok).toBe(true);
    const wt = join(workspacesDir, "alpha.first-feature");
    expect(await pathExists(wt)).toBe(true);
    expect(await pathExists(join(wt, ".git"))).toBe(true);
    expect(result.setupResults[0]!.status).toBe("ok");
  });

  test("multi-project: creates workspace + CLAUDE.md + per-project worktrees", async () => {
    const result = await runNewCommand({
      config,
      description: "Big Change",
      branchType: "feat",
      projectPaths: [join(projectsRoot, "alpha"), join(projectsRoot, "beta")],
      terminal: "none",
      assumeYes: true,
    });
    expect(result.ok).toBe(true);
    const ws = join(workspacesDir, "big-change");
    expect(await pathExists(ws)).toBe(true);
    const claudeMd = await Bun.file(join(ws, "CLAUDE.md")).text();
    expect(claudeMd).toContain("Big Change");
    expect(claudeMd).toContain("alpha.big-change");
    expect(claudeMd).toContain("beta.big-change");
    expect(await pathExists(join(ws, "alpha.big-change"))).toBe(true);
    expect(await pathExists(join(ws, "beta.big-change"))).toBe(true);
  });

  test("aborts when target folder already exists", async () => {
    await runNewCommand({
      config,
      description: "Thing",
      branchType: "feat",
      projectPaths: [join(projectsRoot, "alpha")],
      terminal: "none",
      assumeYes: true,
    });
    await expect(
      runNewCommand({
        config,
        description: "Thing",
        branchType: "feat",
        projectPaths: [join(projectsRoot, "alpha")],
        terminal: "none",
        assumeYes: true,
      })
    ).rejects.toThrow(/already exists/);
  });
});
