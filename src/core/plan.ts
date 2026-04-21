import { join } from 'node:path';
import { branchName, folderName, workspaceFolderName } from './naming';
import type { Project } from './project-discovery';

export interface WorktreeTarget {
  project: Project;
  branch: string;
  targetPath: string;
}

export interface NewPlan {
  description: string;
  slug: string;
  branchType: string;
  isWorkspace: boolean;
  workspaceName: string;
  workspacePath: string | null;
  targets: WorktreeTarget[];
}

export interface BuildNewPlanArgs {
  description: string;
  slug: string;
  branchType: string;
  projects: Project[];
  workspacesDir: string;
}

export function buildNewPlan(args: BuildNewPlanArgs): NewPlan {
  const { description, slug, branchType, projects, workspacesDir } = args;
  const isWorkspace = projects.length > 1;
  const workspacePath = isWorkspace ? join(workspacesDir, workspaceFolderName(slug)) : null;
  const base = workspacePath ?? workspacesDir;
  const branch = branchName(branchType, slug);
  const targets: WorktreeTarget[] = projects.map((project) => ({
    project,
    branch,
    targetPath: join(base, folderName(project.name, slug)),
  }));

  const workspaceName = isWorkspace
    ? workspaceFolderName(slug)
    : folderName(projects[0]!.name, slug);

  return { description, slug, branchType, isWorkspace, workspaceName, workspacePath, targets };
}

export type WorkspaceEntry =
  | {
      kind: 'workspace';
      slug: string;
      path: string;
      worktrees: WorktreeTarget[];
    }
  | {
      kind: 'single';
      path: string;
      target: WorktreeTarget;
    };

export interface RmPlan {
  kind: 'workspace' | 'single';
  workspacePath: string | null;
  targets: WorktreeTarget[];
}

export interface BuildRmPlanArgs {
  name: string;
  workspacesDir: string;
  entries: WorkspaceEntry[];
}

export function buildRmPlan(args: BuildRmPlanArgs): RmPlan {
  const match = args.entries.find((e) => {
    if (e.kind === 'workspace') return e.slug === args.name;
    return e.target.targetPath.endsWith(`/${args.name}`);
  });
  if (!match) {
    throw new Error(
      `No worktree or workspace named "${args.name}" found under ${args.workspacesDir}`,
    );
  }
  if (match.kind === 'workspace') {
    return {
      kind: 'workspace',
      workspacePath: match.path,
      targets: match.worktrees,
    };
  }
  return { kind: 'single', workspacePath: null, targets: [match.target] };
}

export function formatNewPlan(plan: NewPlan): string {
  const lines: string[] = [];
  lines.push(`Description: ${plan.description}`);
  lines.push(`Branch:      ${plan.targets[0]?.branch}`);
  if (plan.isWorkspace) {
    lines.push(`Workspace:   [${plan.workspaceName}] ${plan.workspacePath}`);
  }
  lines.push(`Worktrees:`);
  for (const t of plan.targets) {
    lines.push(`  [${t.project.name}] ${t.targetPath}`);
  }
  return lines.join('\n');
}

export function formatRmPlan(plan: RmPlan): string {
  const lines: string[] = [];
  lines.push(`Removing ${plan.kind}:`);
  if (plan.workspacePath) lines.push(`  folder:  ${plan.workspacePath}`);
  for (const t of plan.targets) {
    lines.push(`  [${t.project.name}] ${t.targetPath}  (branch ${t.branch})`);
  }
  return lines.join('\n');
}
