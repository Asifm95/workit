import { readdir, rm as rmFs, realpath } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Config } from "../core/config";
import { resolveConfigPaths } from "../core/config";
import {
  buildRmPlan,
  formatRmPlan,
  type WorkspaceEntry,
  type WorktreeTarget,
} from "../core/plan";
import { discoverProjects, type Project } from "../core/project-discovery";
import { ensureDir, pathExists } from "../utils/fs";
import { removeWorktree } from "../git/worktree";
import {
  deleteBranch,
  isDirty,
  hasUnpushedCommits,
} from "../git/repo";
import { info, warn, success } from "../ui/log";

export interface RunRmArgs {
  config: Config;
  name: string;
  deleteBranch: boolean;
  force: boolean;
  assumeYes: boolean;
  dryRun?: boolean;
}

export interface RunRmResult {
  ok: boolean;
}

async function resolveWorktreeTarget(
  path: string,
  projects: Project[]
): Promise<WorktreeTarget | null> {
  if (!(await pathExists(join(path, ".git")))) return null;
  const { execa } = await import("execa");
  const commonDir = await execa(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: path, reject: false }
  );
  if (commonDir.exitCode !== 0) return null;
  const mainRepo = resolve(String(commonDir.stdout ?? "").trim(), "..");
  const mainRepoReal = await realpath(mainRepo).catch(() => mainRepo);
  const project = await (async () => {
    for (const p of projects) {
      const pReal = await realpath(p.path).catch(() => p.path);
      if (pReal === mainRepoReal || resolve(p.path) === mainRepo) return p;
    }
    return undefined;
  })();
  if (!project) return null;
  const branchRes = await execa(
    "git",
    ["rev-parse", "--abbrev-ref", "HEAD"],
    { cwd: path, reject: false }
  );
  const branch = branchRes.exitCode === 0 ? String(branchRes.stdout ?? "").trim() : "HEAD";
  return { project, branch, targetPath: path };
}

async function loadEntries(
  workspacesDir: string,
  projects: Project[]
): Promise<WorkspaceEntry[]> {
  if (!(await pathExists(workspacesDir))) return [];
  const entries: WorkspaceEntry[] = [];
  const children = await readdir(workspacesDir, { withFileTypes: true });
  for (const c of children) {
    if (!c.isDirectory()) continue;
    const full = join(workspacesDir, c.name);
    if (await pathExists(join(full, ".git"))) {
      const target = await resolveWorktreeTarget(full, projects);
      if (target) entries.push({ kind: "single", path: full, target });
      continue;
    }
    const subs = await readdir(full, { withFileTypes: true });
    const worktrees: WorktreeTarget[] = [];
    for (const s of subs) {
      if (!s.isDirectory()) continue;
      const sub = join(full, s.name);
      const target = await resolveWorktreeTarget(sub, projects);
      if (target) worktrees.push(target);
    }
    if (worktrees.length > 0) {
      entries.push({ kind: "workspace", slug: c.name, path: full, worktrees });
    }
  }
  return entries;
}

export async function runRmCommand(args: RunRmArgs): Promise<RunRmResult> {
  const resolved = resolveConfigPaths(args.config);
  await ensureDir(resolved.resolvedWorkspacesDir);
  const projects = await discoverProjects(resolved.resolvedProjectRoots);
  const entries = await loadEntries(resolved.resolvedWorkspacesDir, projects);
  const plan = buildRmPlan({
    name: args.name,
    workspacesDir: resolved.resolvedWorkspacesDir,
    entries,
  });

  info(formatRmPlan(plan));

  if (args.dryRun) return { ok: true };

  if (!args.force) {
    for (const t of plan.targets) {
      if (await isDirty(t.targetPath)) {
        throw new Error(
          `${t.project.name} worktree is dirty — commit/stash or pass --force`
        );
      }
      if (await hasUnpushedCommits(t.targetPath, t.branch)) {
        warn(`${t.project.name} has unpushed commits on ${t.branch}`);
      }
    }
  }

  for (const t of plan.targets) {
    await removeWorktree({
      mainRepoPath: t.project.path,
      targetPath: t.targetPath,
      force: args.force,
    });
    success(`removed ${t.targetPath}`);
  }

  if (args.deleteBranch) {
    for (const t of plan.targets) {
      try {
        await deleteBranch(t.project.path, t.branch);
        success(`deleted branch ${t.branch} in ${t.project.name}`);
      } catch (err: any) {
        warn(`could not delete ${t.branch}: ${err.shortMessage ?? err}`);
      }
    }
  }

  if (plan.kind === "workspace" && plan.workspacePath) {
    await rmFs(plan.workspacePath, { recursive: true, force: true });
    success(`removed workspace folder ${plan.workspacePath}`);
  }

  return { ok: true };
}
