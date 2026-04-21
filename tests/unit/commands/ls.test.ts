import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listEntries } from "../../../src/commands/ls";
import type { Config } from "../../../src/core/config";

describe("listEntries", () => {
  let root: string;
  let config: Config;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "workit-ls-"));
    config = {
      workspacesDir: root,
      defaultBranchType: "feat",
      defaultTerminal: "none",
      terminalCommand: {},
      templates: { workspaceAgentsMd: "/x" },
      setupScriptPaths: ["./setup.sh"],
      directoryPicker: { dotAllowlist: [".workit"] },
      logsLines: 50,
    };
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("labels single worktrees and workspaces", async () => {
    await mkdir(join(root, "single.slug"));
    await Bun.write(join(root, "single.slug/.git"), "gitdir: /fake/main/.git/worktrees/single.slug\n");
    await mkdir(join(root, "workspace-feat"));
    await mkdir(join(root, "workspace-feat/subA"));

    const entries = await listEntries(config);
    const byName = Object.fromEntries(entries.map((e) => [e.name, e.kind]));
    expect(byName["single.slug"]).toBe("single");
    expect(byName["workspace-feat"]).toBe("workspace");
  });

  test("labels a workspace folder as workspace even when it has its own .git directory", async () => {
    // Simulates a user running `git init` inside a multi-repo workspace folder
    // (e.g. to track the AGENTS.md / CLAUDE.md that `new` writes there).
    await mkdir(join(root, "workspace-feat"));
    await mkdir(join(root, "workspace-feat/.git"));
    await Bun.write(join(root, "workspace-feat/.git/HEAD"), "ref: refs/heads/main\n");
    await mkdir(join(root, "workspace-feat/subA"));

    const entries = await listEntries(config);
    const byName = Object.fromEntries(entries.map((e) => [e.name, e.kind]));
    expect(byName["workspace-feat"]).toBe("workspace");
  });
});
