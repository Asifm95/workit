import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConfigSchema,
  DEFAULT_CONFIG,
  loadConfig,
  defaultConfigPath,
} from "../../../src/core/config";

describe("ConfigSchema", () => {
  test("accepts the default config", () => {
    expect(() => ConfigSchema.parse(DEFAULT_CONFIG)).not.toThrow();
  });

  test("rejects unknown defaultTerminal", () => {
    expect(() =>
      ConfigSchema.parse({ ...DEFAULT_CONFIG, defaultTerminal: "foo" })
    ).toThrow();
  });

  test("rejects empty projectRoots", () => {
    expect(() =>
      ConfigSchema.parse({ ...DEFAULT_CONFIG, projectRoots: [] })
    ).toThrow();
  });
});

describe("loadConfig", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "workit-cfg-"));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("creates default config when missing", async () => {
    const path = join(tmp, "config.json");
    const { config, created } = await loadConfig(path);
    expect(created).toBe(true);
    expect(config.workspacesDir).toContain(".workit/workspaces");
    expect(config.projectRoots.length).toBeGreaterThan(0);
  });

  test("loads an existing config", async () => {
    const path = join(tmp, "config.json");
    await writeFile(
      path,
      JSON.stringify({
        workspacesDir: "~/w",
        projectRoots: ["~/p"],
        defaultBranchType: "fix",
        defaultTerminal: "tmux",
        terminalCommand: {},
        templates: { workspaceClaudeMd: "~/t" },
        setupScriptPaths: ["./setup.sh"],
      })
    );
    const { config, created } = await loadConfig(path);
    expect(created).toBe(false);
    expect(config.defaultBranchType).toBe("fix");
    expect(config.defaultTerminal).toBe("tmux");
  });

  test("throws on invalid config", async () => {
    const path = join(tmp, "config.json");
    await writeFile(path, JSON.stringify({ workspacesDir: 42 }));
    await expect(loadConfig(path)).rejects.toThrow();
  });
});

describe("defaultConfigPath", () => {
  test("returns ~/.config/workit/config.json expanded", () => {
    const p = defaultConfigPath();
    expect(p).toMatch(/\.config\/workit\/config\.json$/);
    expect(p.startsWith("/")).toBe(true);
  });
});
