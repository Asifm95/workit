import { describe, expect, test } from "bun:test";
import {
  buildWarpLaunchConfig,
  insideWarp,
  launchConfigurationsDir,
} from "../../../src/terminal/warp";

describe("buildWarpLaunchConfig", () => {
  test("emits expected YAML for a single tab", () => {
    const yaml = buildWarpLaunchConfig({
      configName: "add-dac7",
      tabs: [{ name: "api", cwd: "/w/api" }],
    });
    expect(yaml).toBe(
      [
        "---",
        'name: "add-dac7"',
        "windows:",
        "  - tabs:",
        '      - title: "api"',
        "        layout:",
        '          cwd: "/w/api"',
        "",
      ].join("\n"),
    );
  });

  test("emits one tab entry per TabSpec for many tabs", () => {
    const yaml = buildWarpLaunchConfig({
      configName: "feat-x",
      tabs: [
        { name: "a", cwd: "/w/a" },
        { name: "b", cwd: "/w/b" },
        { name: "c", cwd: "/w/c" },
      ],
    });
    expect(yaml).toBe(
      [
        "---",
        'name: "feat-x"',
        "windows:",
        "  - tabs:",
        '      - title: "a"',
        "        layout:",
        '          cwd: "/w/a"',
        '      - title: "b"',
        "        layout:",
        '          cwd: "/w/b"',
        '      - title: "c"',
        "        layout:",
        '          cwd: "/w/c"',
        "",
      ].join("\n"),
    );
  });

  test("escapes double quotes and backslashes in names and cwds", () => {
    const yaml = buildWarpLaunchConfig({
      configName: 'weird"slug',
      tabs: [{ name: 'has"quote', cwd: "/w/with\\back" }],
    });
    expect(yaml).toBe(
      [
        "---",
        'name: "weird\\"slug"',
        "windows:",
        "  - tabs:",
        '      - title: "has\\"quote"',
        "        layout:",
        '          cwd: "/w/with\\\\back"',
        "",
      ].join("\n"),
    );
  });
});

describe("launchConfigurationsDir", () => {
  test("macOS uses ~/.warp/launch_configurations", () => {
    expect(launchConfigurationsDir("darwin", { HOME: "/Users/me" })).toBe(
      "/Users/me/.warp/launch_configurations",
    );
  });

  test("Linux with XDG_DATA_HOME set honors it", () => {
    expect(
      launchConfigurationsDir("linux", {
        HOME: "/home/me",
        XDG_DATA_HOME: "/xdg/data",
      }),
    ).toBe("/xdg/data/warp-terminal/launch_configurations");
  });

  test("Linux without XDG_DATA_HOME falls back to ~/.local/share", () => {
    expect(launchConfigurationsDir("linux", { HOME: "/home/me" })).toBe(
      "/home/me/.local/share/warp-terminal/launch_configurations",
    );
  });

  test("Linux with empty XDG_DATA_HOME falls back to ~/.local/share", () => {
    expect(
      launchConfigurationsDir("linux", { HOME: "/home/me", XDG_DATA_HOME: "" }),
    ).toBe("/home/me/.local/share/warp-terminal/launch_configurations");
  });

  test("Windows uses %APPDATA%\\warp\\Warp\\data\\launch_configurations", () => {
    expect(
      launchConfigurationsDir("win32", {
        APPDATA: "C:\\Users\\me\\AppData\\Roaming",
      }),
    ).toBe("C:\\Users\\me\\AppData\\Roaming\\warp\\Warp\\data\\launch_configurations");
  });
});

describe("insideWarp", () => {
  test("true when TERM_PROGRAM=WarpTerminal", () => {
    expect(insideWarp({ TERM_PROGRAM: "WarpTerminal" })).toBe(true);
  });

  test("false when TERM_PROGRAM is something else", () => {
    expect(insideWarp({ TERM_PROGRAM: "iTerm.app" })).toBe(false);
  });

  test("false when TERM_PROGRAM is unset", () => {
    expect(insideWarp({})).toBe(false);
  });
});
