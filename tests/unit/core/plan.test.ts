import { describe, expect, test } from "bun:test";
import { buildNewPlan, buildRmPlan } from "../../../src/core/plan";
import type { Project } from "../../../src/core/project-discovery";

const projA: Project = { name: "proj-a", path: "/main/proj-a" };
const projB: Project = { name: "proj-b", path: "/main/proj-b" };

describe("buildNewPlan", () => {
  test("single-project plan has no workspace", () => {
    const plan = buildNewPlan({
      description: "Add DAC7",
      slug: "add-dac7",
      branchType: "feat",
      projects: [projA],
      workspacesDir: "/w",
    });
    expect(plan.isWorkspace).toBe(false);
    expect(plan.workspacePath).toBeNull();
    expect(plan.targets).toEqual([
      {
        project: projA,
        branch: "feat/add-dac7",
        targetPath: "/w/proj-a.add-dac7",
      },
    ]);
  });

  test("multi-project plan creates workspace folder", () => {
    const plan = buildNewPlan({
      description: "Add DAC7",
      slug: "add-dac7",
      branchType: "feat",
      projects: [projA, projB],
      workspacesDir: "/w",
    });
    expect(plan.isWorkspace).toBe(true);
    expect(plan.workspacePath).toBe("/w/add-dac7");
    expect(plan.targets[0]!.targetPath).toBe("/w/add-dac7/proj-a.add-dac7");
    expect(plan.targets[1]!.targetPath).toBe("/w/add-dac7/proj-b.add-dac7");
  });
});

describe("buildRmPlan", () => {
  test("resolves a workspace folder with subdirs to a multi-plan", () => {
    const plan = buildRmPlan({
      name: "add-dac7",
      workspacesDir: "/w",
      entries: [
        {
          kind: "workspace",
          slug: "add-dac7",
          path: "/w/add-dac7",
          worktrees: [
            { project: projA, targetPath: "/w/add-dac7/proj-a.add-dac7", branch: "feat/add-dac7" },
            { project: projB, targetPath: "/w/add-dac7/proj-b.add-dac7", branch: "feat/add-dac7" },
          ],
        },
      ],
    });
    expect(plan.kind).toBe("workspace");
    expect(plan.targets.length).toBe(2);
    expect(plan.workspacePath).toBe("/w/add-dac7");
  });

  test("resolves a single worktree name", () => {
    const plan = buildRmPlan({
      name: "proj-a.add-dac7",
      workspacesDir: "/w",
      entries: [
        {
          kind: "single",
          path: "/w/proj-a.add-dac7",
          target: { project: projA, targetPath: "/w/proj-a.add-dac7", branch: "feat/add-dac7" },
        },
      ],
    });
    expect(plan.kind).toBe("single");
    expect(plan.targets.length).toBe(1);
    expect(plan.workspacePath).toBeNull();
  });
});
