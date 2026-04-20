import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
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

  test("accepts config with legacy projectRoots via passthrough", () => {
    expect(() =>
      ConfigSchema.parse({ ...DEFAULT_CONFIG, projectRoots: ["~/Projects"] })
    ).not.toThrow();
  });

  test("fills directoryPicker.dotAllowlist default when missing", () => {
    const { directoryPicker, ...withoutPicker } = DEFAULT_CONFIG;
    void directoryPicker;
    const parsed = ConfigSchema.parse(withoutPicker);
    expect(parsed.directoryPicker.dotAllowlist).toEqual([".workit"]);
  });

  test("preserves a custom directoryPicker.dotAllowlist", () => {
    const parsed = ConfigSchema.parse({
      ...DEFAULT_CONFIG,
      directoryPicker: { dotAllowlist: [".workit", ".dotfiles"] },
    });
    expect(parsed.directoryPicker.dotAllowlist).toEqual([".workit", ".dotfiles"]);
  });

  test("accepts an empty directoryPicker.dotAllowlist", () => {
    const parsed = ConfigSchema.parse({
      ...DEFAULT_CONFIG,
      directoryPicker: { dotAllowlist: [] },
    });
    expect(parsed.directoryPicker.dotAllowlist).toEqual([]);
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
    expect(config.workspacesDir).toBeDefined();
  });

  test("loads an existing config", async () => {
    const path = join(tmp, "config.json");
    await Bun.write(
      path,
      JSON.stringify({
        workspacesDir: "~/w",
        defaultBranchType: "fix",
        defaultTerminal: "tmux",
        terminalCommand: {},
        templates: { workspaceAgentsMd: "~/t" },
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
    await Bun.write(path, JSON.stringify({ workspacesDir: 42 }));
    await expect(loadConfig(path)).rejects.toThrow();
  });

  test("rejects legacy templates.workspaceClaudeMd with migration hint", async () => {
    const path = join(tmp, "config.json");
    await Bun.write(
      path,
      JSON.stringify({
        workspacesDir: "~/w",
        defaultBranchType: "feat",
        defaultTerminal: "none",
        terminalCommand: {},
        templates: { workspaceClaudeMd: "~/t" },
        setupScriptPaths: ["./setup.sh"],
      })
    );
    await expect(loadConfig(path)).rejects.toThrow(/workspaceAgentsMd/);
  });
});

describe("defaultConfigPath", () => {
  test("returns ~/.config/workit/config.json expanded", () => {
    const p = defaultConfigPath();
    expect(p).toMatch(/\.config\/workit\/config\.json$/);
    expect(p.startsWith("/")).toBe(true);
  });
});
