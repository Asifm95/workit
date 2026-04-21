import { describe, expect, test } from "bun:test";
import { buildDispatchTabs } from "../../../src/commands/new";
import type { NewPlan } from "../../../src/core/plan";

function makePlan(overrides: Partial<NewPlan> = {}): NewPlan {
  return {
    description: "Big Change",
    slug: "big-change",
    branchType: "feat",
    isWorkspace: true,
    workspacePath: "/w/big-change",
    targets: [
      {
        project: { name: "alpha", path: "/p/alpha" },
        branch: "feat/big-change",
        targetPath: "/w/big-change/alpha.big-change",
      },
      {
        project: { name: "beta", path: "/p/beta" },
        branch: "feat/big-change",
        targetPath: "/w/big-change/beta.big-change",
      },
    ],
    ...overrides,
  };
}

describe("buildDispatchTabs", () => {
  test("prepends workspace root tab for terminal backends in multi-repo mode", () => {
    for (const backend of ["cmux", "tmux", "warp"] as const) {
      const tabs = buildDispatchTabs({
        plan: makePlan(),
        slug: "big-change",
        backend,
      });
      expect(tabs).toEqual([
        { name: "big-change", cwd: "/w/big-change" },
        { name: "alpha", cwd: "/w/big-change/alpha.big-change" },
        { name: "beta", cwd: "/w/big-change/beta.big-change" },
      ]);
    }
  });

  test("omits workspace root tab for the 'none' backend", () => {
    const tabs = buildDispatchTabs({
      plan: makePlan(),
      slug: "big-change",
      backend: "none",
    });
    expect(tabs).toEqual([
      { name: "alpha", cwd: "/w/big-change/alpha.big-change" },
      { name: "beta", cwd: "/w/big-change/beta.big-change" },
    ]);
  });

  test("single-project (non-workspace) emits only the project tab", () => {
    const plan = makePlan({
      isWorkspace: false,
      workspacePath: null,
      targets: [
        {
          project: { name: "alpha", path: "/p/alpha" },
          branch: "feat/big-change",
          targetPath: "/w/alpha.big-change",
        },
      ],
    });
    for (const backend of ["cmux", "tmux", "warp", "none"] as const) {
      const tabs = buildDispatchTabs({ plan, slug: "big-change", backend });
      expect(tabs).toEqual([
        { name: "alpha", cwd: "/w/alpha.big-change" },
      ]);
    }
  });
});
