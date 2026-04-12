import { describe, expect, test } from "bun:test";
import {
  sanitizeSessionName,
  buildTmuxCommands,
} from "../../../src/terminal/tmux";

describe("sanitizeSessionName", () => {
  test("replaces dots and colons", () => {
    expect(sanitizeSessionName("feat.x:y")).toBe("feat-x-y");
  });
  test("leaves valid names alone", () => {
    expect(sanitizeSessionName("add-dac7")).toBe("add-dac7");
  });
});

describe("buildTmuxCommands", () => {
  test("emits new-session and new-window for each tab", () => {
    const cmds = buildTmuxCommands({
      sessionName: "add-dac7",
      tabs: [
        { name: "a", cwd: "/w/a" },
        { name: "b", cwd: "/w/b" },
        { name: "c", cwd: "/w/c" },
      ],
    });
    expect(cmds).toEqual([
      ["new-session", "-d", "-s", "add-dac7", "-n", "a", "-c", "/w/a"],
      ["new-window", "-t", "add-dac7:", "-n", "b", "-c", "/w/b"],
      ["new-window", "-t", "add-dac7:", "-n", "c", "-c", "/w/c"],
    ]);
  });

  test("handles single tab", () => {
    const cmds = buildTmuxCommands({
      sessionName: "x",
      tabs: [{ name: "only", cwd: "/w/only" }],
    });
    expect(cmds).toEqual([
      ["new-session", "-d", "-s", "x", "-n", "only", "-c", "/w/only"],
    ]);
  });
});
