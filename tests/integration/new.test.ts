import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, chmod, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { runNewCommand } from "../../src/commands/new";
import { logsDirFor } from "../../src/setup/runner";
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

async function waitForFile(path: string, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await pathExists(path)) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`timeout waiting for ${path}`);
}

describe("runNewCommand", () => {
  let root: string;
  let workspacesDir: string;
  let projectsRoot: string;
  let config: Config;
  let templatePath: string;
  const slugsToCleanup = new Set<string>();

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "workit-int-"));
    workspacesDir = join(root, "workspaces");
    projectsRoot = join(root, "projects");
    await mkdir(projectsRoot);
    await setupTestRepo(projectsRoot, "alpha");
    await setupTestRepo(projectsRoot, "beta");
    templatePath = join(root, "workspace-AGENTS.md");
    await Bun.write(
      templatePath,
      "# {{feature_title}}\n\n{{#each projects}}- {{folder}}\n{{/each}}"
    );
    config = {
      workspacesDir,
      defaultBranchType: "feat",
      defaultTerminal: "none",
      terminalCommand: {},
      templates: { workspaceAgentsMd: templatePath },
      setupScriptPaths: ["./setup.sh", ".workit/setup.sh"],
      directoryPicker: { dotAllowlist: [".workit"] },
      logsLines: 50,
    };
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    for (const slug of slugsToCleanup) {
      await rm(logsDirFor(slug), { recursive: true, force: true });
    }
    slugsToCleanup.clear();
  });

  test("default (async): spawns setup in background and writes log + status", async () => {
    slugsToCleanup.add("first-feature");
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

    const r = result.setupResults[0]!;
    expect(r.status).toBe("spawned");
    expect(r.logPath).toBe(join(logsDirFor("first-feature"), "alpha.log"));

    await waitForFile(r.statusPath!, 5000);
    const statusText = (await Bun.file(r.statusPath!).text()).trim();
    expect(statusText).toBe("0");
  });

  test("syncSetup: runs setup to completion before returning", async () => {
    const result = await runNewCommand({
      config,
      description: "Sync feature",
      branchType: "feat",
      projectPaths: [join(projectsRoot, "alpha")],
      terminal: "none",
      assumeYes: true,
      syncSetup: true,
    });
    expect(result.ok).toBe(true);
    expect(result.setupResults[0]!.status).toBe("ok");
    expect(result.setupResults[0]!.exitCode).toBe(0);
  });

  test("multi-project: creates workspace + AGENTS.md + CLAUDE.md alias + worktrees", async () => {
    slugsToCleanup.add("big-change");
    const result = await runNewCommand({
      config,
      description: "Big Change",
      branchType: "feat",
      projectPaths: [join(projectsRoot, "alpha"), join(projectsRoot, "beta")],
      terminal: "none",
      assumeYes: true,
      syncSetup: true,
    });
    expect(result.ok).toBe(true);
    const ws = join(workspacesDir, "big-change");
    expect(await pathExists(ws)).toBe(true);
    const agentsMd = await Bun.file(join(ws, "AGENTS.md")).text();
    expect(agentsMd).toContain("Big Change");
    expect(agentsMd).toContain("alpha.big-change");
    expect(agentsMd).toContain("beta.big-change");
    const claudeMd = await Bun.file(join(ws, "CLAUDE.md")).text();
    expect(claudeMd).toContain("@AGENTS.md");
    expect(await pathExists(join(ws, "alpha.big-change"))).toBe(true);
    expect(await pathExists(join(ws, "beta.big-change"))).toBe(true);
  });

  test("multi-project: installs the default template when user path is missing", async () => {
    slugsToCleanup.add("fresh-start");
    const missingTplPath = join(root, "fresh", "workspace-AGENTS.md");
    config.templates = { workspaceAgentsMd: missingTplPath };
    expect(await pathExists(missingTplPath)).toBe(false);

    const result = await runNewCommand({
      config,
      description: "Fresh Start",
      branchType: "feat",
      projectPaths: [join(projectsRoot, "alpha"), join(projectsRoot, "beta")],
      terminal: "none",
      assumeYes: true,
      syncSetup: true,
    });
    expect(result.ok).toBe(true);

    expect(await pathExists(missingTplPath)).toBe(true);
    const installed = await Bun.file(missingTplPath).text();
    expect(installed).toContain("{{feature_title}}");
    expect(installed).toContain("AGENTS.md");

    const ws = join(workspacesDir, "fresh-start");
    const agentsMd = await Bun.file(join(ws, "AGENTS.md")).text();
    expect(agentsMd).toContain("Fresh Start");
    expect(agentsMd).toContain("alpha.fresh-start");
    const claudeMd = await Bun.file(join(ws, "CLAUDE.md")).text();
    expect(claudeMd).toContain("@AGENTS.md");
  });

  test("dry-run: does not install the template or write workspace files", async () => {
    const missingTplPath = join(root, "dry", "workspace-AGENTS.md");
    config.templates = { workspaceAgentsMd: missingTplPath };

    const result = await runNewCommand({
      config,
      description: "Dry Run",
      branchType: "feat",
      projectPaths: [join(projectsRoot, "alpha"), join(projectsRoot, "beta")],
      terminal: "none",
      assumeYes: true,
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    expect(await pathExists(missingTplPath)).toBe(false);
    expect(await pathExists(join(workspacesDir, "dry-run"))).toBe(false);
  });

  test("aborts when target folder already exists", async () => {
    slugsToCleanup.add("thing");
    await runNewCommand({
      config,
      description: "Thing",
      branchType: "feat",
      projectPaths: [join(projectsRoot, "alpha")],
      terminal: "none",
      assumeYes: true,
      syncSetup: true,
    });
    await expect(
      runNewCommand({
        config,
        description: "Thing",
        branchType: "feat",
        projectPaths: [join(projectsRoot, "alpha")],
        terminal: "none",
        assumeYes: true,
        syncSetup: true,
      })
    ).rejects.toThrow(/already exists/);
  });
});
