import { describe, expect, test } from "bun:test";
import { planCmuxCommands } from "../../../src/terminal/cmux";

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
