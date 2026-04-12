import { execa } from "execa";
import { pathExists } from "../utils/fs";
import type { TabSpec } from "./none";

export interface CmuxPlanStep {
  kind: "new-workspace" | "rename-first-tab" | "new-surface" | "send-cd" | "rename-tab";
  args: string[];
  tab?: TabSpec;
}

export interface PlanCmuxArgs {
  workspaceName: string;
  tabs: TabSpec[];
}

export function planCmuxCommands(args: PlanCmuxArgs): CmuxPlanStep[] {
  const { workspaceName, tabs } = args;
  const plan: CmuxPlanStep[] = [];
  const [first, ...rest] = tabs;
  if (!first) return plan;

  plan.push({
    kind: "new-workspace",
    args: [
      "new-workspace",
      "--name", workspaceName,
      "--cwd", first.cwd,
      "--id-format", "refs",
    ],
  });
  plan.push({
    kind: "rename-first-tab",
    args: [
      "rename-tab",
      "--workspace", "{{workspace}}",
      "--surface", "{{first}}",
      first.name,
    ],
  });
  for (const tab of rest) {
    plan.push({
      kind: "new-surface",
      args: ["new-surface", "--type", "terminal", "--workspace", "{{workspace}}"],
      tab,
    });
  }
  return plan;
}

export async function cmuxInstalled(binary: string): Promise<boolean> {
  if (!(await pathExists(binary))) return false;
  try {
    await execa(binary, ["--help"], { reject: false });
    return true;
  } catch {
    return false;
  }
}

export function insideCmux(): boolean {
  return (
    typeof process.env.CMUX_WORKSPACE_ID === "string" &&
    process.env.CMUX_WORKSPACE_ID.length > 0
  );
}

export interface RunCmuxArgs {
  binary: string;
  featureSlug: string;
  tabs: TabSpec[];
}

function parseRef(stdout: string): string {
  return stdout.trim().split(/\s+/)[0] ?? stdout.trim();
}

export async function runCmuxBackend(args: RunCmuxArgs): Promise<void> {
  const { binary, featureSlug, tabs } = args;
  const [first, ...rest] = tabs;
  if (!first) return;

  const createRes = await execa(
    binary,
    [
      "new-workspace",
      "--name", featureSlug,
      "--cwd", first.cwd,
      "--id-format", "refs",
    ],
    { reject: true }
  );
  const workspace = parseRef(String(createRes.stdout ?? ""));

  const firstSurfaceRes = await execa(
    binary,
    [
      "list-surfaces",
      "--workspace", workspace,
      "--id-format", "refs",
    ],
    { reject: false }
  );
  const firstSurface = firstSurfaceRes.exitCode === 0
    ? parseRef(String(firstSurfaceRes.stdout ?? ""))
    : "surface:1";

  await execa(
    binary,
    ["rename-tab", "--workspace", workspace, "--surface", firstSurface, first.name],
    { reject: false }
  );

  for (const tab of rest) {
    const surfRes = await execa(
      binary,
      ["new-surface", "--type", "terminal", "--workspace", workspace],
      { reject: true }
    );
    const surface = parseRef(String(surfRes.stdout ?? ""));
    await execa(
      binary,
      ["send", "--workspace", workspace, "--surface", surface, `cd ${tab.cwd}\n`],
      { reject: true }
    );
    await execa(
      binary,
      ["rename-tab", "--workspace", workspace, "--surface", surface, tab.name],
      { reject: false }
    );
  }
}
