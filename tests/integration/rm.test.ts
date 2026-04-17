import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { runNewCommand } from "../../src/commands/new";
import { runRmCommand } from "../../src/commands/rm";
import { pathExists } from "../../src/utils/fs";
import { branchExists } from "../../src/git/repo";
import type { Config } from "../../src/core/config";

async function makeRepo(parent: string, name: string) {
  const p = join(parent, name);
  await mkdir(p);
  await execa("git", ["init", "-q", "-b", "main", p]);
  await execa("git", ["config", "user.email", "t@t"], { cwd: p });
  await execa("git", ["config", "user.name", "t"], { cwd: p });
  await Bun.write(join(p, "README.md"), "hi\n");
  await execa("git", ["add", "."], { cwd: p });
  await execa("git", ["commit", "-q", "-m", "init"], { cwd: p });
  return p;
}

describe("runRmCommand", () => {
  let root: string;
  let config: Config;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "workit-rm-int-"));
    const projectsRoot = join(root, "projects");
    await mkdir(projectsRoot);
    await makeRepo(projectsRoot, "alpha");
    await makeRepo(projectsRoot, "beta");
    const tpl = join(root, "tpl.md");
    await Bun.write(tpl, "# {{feature_title}}\n");
    config = {
      workspacesDir: join(root, "ws"),
      defaultBranchType: "feat",
      defaultTerminal: "none",
      terminalCommand: {},
      templates: { workspaceClaudeMd: tpl },
      setupScriptPaths: ["./setup.sh"],
      directoryPicker: { dotAllowlist: [".workit"] },
    };
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("removes a single-project worktree by name", async () => {
    await runNewCommand({
      config,
      description: "Only Me",
      branchType: "feat",
      projectPaths: [join(root, "projects", "alpha")],
      terminal: "none",
      assumeYes: true,
    });
    const wt = join(config.workspacesDir, "alpha.only-me");
    expect(await pathExists(wt)).toBe(true);

    const result = await runRmCommand({
      config,
      name: "alpha.only-me",
      deleteBranch: false,
      force: false,
      assumeYes: true,
    });
    expect(result.ok).toBe(true);
    expect(await pathExists(wt)).toBe(false);
    const projAlpha = join(root, "projects", "alpha");
    expect(await branchExists(projAlpha, "feat/only-me")).toBe(true);
  });

  test("removes an entire workspace and its worktrees", async () => {
    await runNewCommand({
      config,
      description: "Big Thing",
      branchType: "feat",
      projectPaths: [join(root, "projects", "alpha"), join(root, "projects", "beta")],
      terminal: "none",
      assumeYes: true,
    });
    const ws = join(config.workspacesDir, "big-thing");
    expect(await pathExists(ws)).toBe(true);

    const result = await runRmCommand({
      config,
      name: "big-thing",
      deleteBranch: true,
      force: false,
      assumeYes: true,
    });
    expect(result.ok).toBe(true);
    expect(await pathExists(ws)).toBe(false);
    const projAlpha = join(root, "projects", "alpha");
    const projBeta = join(root, "projects", "beta");
    expect(await branchExists(projAlpha, "feat/big-thing")).toBe(false);
    expect(await branchExists(projBeta, "feat/big-thing")).toBe(false);
  });
});
