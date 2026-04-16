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
      templates: { workspaceClaudeMd: "/x" },
      setupScriptPaths: ["./setup.sh"],
    };
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("labels single worktrees and workspaces", async () => {
    await mkdir(join(root, "single.slug"));
    await mkdir(join(root, "single.slug/.git"));
    await Bun.write(join(root, "single.slug/.git/HEAD"), "ref: refs/heads/main\n");
    await mkdir(join(root, "workspace-feat"));
    await mkdir(join(root, "workspace-feat/subA"));

    const entries = await listEntries(config);
    const byName = Object.fromEntries(entries.map((e) => [e.name, e.kind]));
    expect(byName["single.slug"]).toBe("single");
    expect(byName["workspace-feat"]).toBe("workspace");
  });
});
