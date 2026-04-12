import { describe, expect, test } from "bun:test";
import { formatNoneBackendOutput } from "../../../src/terminal/none";

describe("formatNoneBackendOutput", () => {
  test("prints paths and a cd hint for workspace", () => {
    const out = formatNoneBackendOutput({
      workspacePath: "/w/feat",
      tabs: [
        { name: "a", cwd: "/w/feat/a.feat" },
        { name: "b", cwd: "/w/feat/b.feat" },
      ],
    });
    expect(out).toContain("[a]");
    expect(out).toContain("/w/feat/a.feat");
    expect(out).toContain("cd /w/feat");
  });

  test("single worktree prints just its cd hint", () => {
    const out = formatNoneBackendOutput({
      workspacePath: null,
      tabs: [{ name: "only", cwd: "/w/only.slug" }],
    });
    expect(out).toContain("cd /w/only.slug");
  });
});
