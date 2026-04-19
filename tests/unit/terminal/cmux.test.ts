import { describe, expect, test } from "bun:test";
import { parseRef, planCmuxCommands } from "../../../src/terminal/cmux";

describe("planCmuxCommands", () => {
  test("first tab becomes the workspace cwd, subsequent tabs are new surfaces with cd sends", () => {
    const plan = planCmuxCommands({
      workspaceName: "add-dac7",
      tabs: [
        { name: "a", cwd: "/w/a" },
        { name: "b", cwd: "/w/b" },
      ],
    });
    expect(plan[0]).toEqual({
      kind: "new-workspace",
      args: [
        "new-workspace",
        "--name", "add-dac7",
        "--cwd", "/w/a",
      ],
    });
    expect(plan[1]).toEqual({
      kind: "rename-first-tab",
      args: ["rename-tab", "--workspace", "{{workspace}}", "--surface", "{{first}}", "a"],
    });
    expect(plan[2]).toEqual({
      kind: "new-surface",
      args: ["new-surface", "--type", "terminal", "--workspace", "{{workspace}}"],
      tab: { name: "b", cwd: "/w/b" },
    });
  });

  test("single-tab case still renames first tab", () => {
    const plan = planCmuxCommands({
      workspaceName: "x",
      tabs: [{ name: "only", cwd: "/w/only" }],
    });
    expect(plan.length).toBe(2);
    expect(plan[0]?.kind).toBe("new-workspace");
    expect(plan[1]?.kind).toBe("rename-first-tab");
  });
});

describe("parseRef", () => {
  test("extracts workspace ref from 'OK workspace:9' output", () => {
    expect(parseRef("OK workspace:9\n", "workspace")).toBe("workspace:9");
  });

  test("extracts surface ref from multi-ref new-surface output", () => {
    expect(parseRef("OK surface:28 pane:11 workspace:9\n", "surface")).toBe("surface:28");
  });

  test("extracts surface ref from list-pane-surfaces output with selected marker", () => {
    expect(parseRef("* surface:30  debug3  [selected]\n", "surface")).toBe("surface:30");
  });

  test("returns undefined when no matching ref is present", () => {
    expect(parseRef("OK\n", "workspace")).toBeUndefined();
  });
});
