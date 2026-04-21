import { basename, dirname, join } from 'node:path';
import type { Config } from '../core/config';
import { resolveConfigPaths } from '../core/config';
import { buildNewPlan, formatNewPlan, type NewPlan } from '../core/plan';
import type { Project } from '../core/project-discovery';
import { slugify } from '../core/slug';
import { branchExists, isGitRepo } from '../git/repo';
import { addWorktree } from '../git/worktree';
import { runSetupScripts, type SetupResult } from '../setup/runner';
import { WORKSPACE_AGENTS_MD_DEFAULT, WORKSPACE_CLAUDE_MD_ALIAS } from '../templates/defaults';
import { renderTemplate } from '../templates/render';
import { detectAvailability, dispatchBackend, selectBackend, type BackendName } from '../terminal';
import type { TabSpec } from '../terminal/none';
import { colorFor, hint, info, success, warn } from '../ui/log';
import { ensureDir, pathExists } from '../utils/fs';

export interface RunNewArgs {
  config: Config;
  description: string;
  branchType: string;
  projectPaths: string[];
  terminal?: BackendName;
  assumeYes: boolean;
  dryRun?: boolean;
  syncSetup?: boolean;
}

export interface RunNewResult {
  ok: boolean;
  plan: ReturnType<typeof buildNewPlan>;
  setupResults: SetupResult[];
}

function toTitleCase(input: string): string {
  return input
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ')
    .trim();
}

export function buildDispatchTabs(args: {
  plan: NewPlan;
  slug: string;
  backend: BackendName;
}): TabSpec[] {
  const { plan, slug, backend } = args;
  const projectTabs: TabSpec[] = plan.targets.map((t) => ({
    name: t.project.name,
    cwd: t.targetPath,
  }));
  if (backend === 'none' || !plan.isWorkspace || !plan.workspacePath) {
    return projectTabs;
  }
  return [{ name: slug, cwd: plan.workspacePath }, ...projectTabs];
}

export async function runNewCommand(args: RunNewArgs): Promise<RunNewResult> {
  const resolved = resolveConfigPaths(args.config);
  const slug = slugify(args.description);

  const matched: Project[] = args.projectPaths.map((p) => ({
    name: basename(p),
    path: p,
  }));

  const plan = buildNewPlan({
    description: args.description,
    slug,
    branchType: args.branchType,
    projects: matched,
    workspacesDir: resolved.resolvedWorkspacesDir,
  });

  for (const t of plan.targets) {
    if (!(await isGitRepo(t.project.path))) {
      throw new Error(`${t.project.name} is not a git repo at ${t.project.path}`);
    }
    if (await pathExists(t.targetPath)) {
      throw new Error(`Target already exists: ${t.targetPath}`);
    }
    if (await branchExists(t.project.path, t.branch)) {
      throw new Error(`Branch ${t.branch} already exists in ${t.project.name}`);
    }
  }

  info(formatNewPlan(plan));

  if (args.dryRun) {
    return { ok: true, plan, setupResults: [] };
  }

  const availability = await detectAvailability(args.config);
  const backend = selectBackend({
    flag: args.terminal,
    configDefault: args.config.defaultTerminal,
    insideTmux: availability.insideTmux,
    insideCmux: availability.insideCmux,
    insideWarp: availability.insideWarp,
    tmuxAvailable: availability.tmuxAvailable,
    cmuxAvailable: availability.cmuxAvailable,
    warpAvailable: availability.warpAvailable,
  });

  if (plan.isWorkspace && plan.workspacePath) {
    await ensureDir(plan.workspacePath);
    const tplPath = resolved.resolvedWorkspaceAgentsTemplate;
    if (!(await pathExists(tplPath))) {
      await ensureDir(dirname(tplPath));
      await Bun.write(tplPath, WORKSPACE_AGENTS_MD_DEFAULT);
    }
    const tpl = await Bun.file(tplPath).text();
    const rendered = renderTemplate(tpl, {
      feature_title: toTitleCase(args.description),
      feature_slug: slug,
      branch_type: args.branchType,
      branch_name: plan.targets[0]!.branch,
      projects: plan.targets.map((t) => ({
        name: t.project.name,
        folder: `${t.project.name}.${slug}`,
        branch: t.branch,
      })),
    });
    await Promise.all([
      Bun.write(join(plan.workspacePath, 'AGENTS.md'), rendered),
      Bun.write(join(plan.workspacePath, 'CLAUDE.md'), WORKSPACE_CLAUDE_MD_ALIAS),
    ]);
  }

  await Promise.all(
    plan.targets.map((t) =>
      addWorktree({
        mainRepoPath: t.project.path,
        targetPath: t.targetPath,
        branch: t.branch,
      }),
    ),
  );

  const mode: 'async' | 'sync' = args.syncSetup ? 'sync' : 'async';
  const setupResults = await runSetupScripts({
    targets: plan.targets.map((t) => ({ name: t.project.name, cwd: t.targetPath })),
    scriptPaths: resolved.setupScriptPaths,
    featureSlug: slug,
    mode,
    onLine: (name, line) => {
      const c = colorFor(name);
      console.log(c(`[${name}]`) + ` ${line}`);
    },
  });
  for (const r of setupResults) {
    if (r.status === 'missing') {
      hint(`no setup script found in ${r.name} — create one to automate this step`);
    } else if (r.status === 'failed-to-start') {
      warn(`could not start setup in ${r.name}: ${r.error ?? 'unknown error'}`);
    } else if (r.status === 'failed') {
      warn(`setup failed in ${r.name}: ${r.error ?? 'unknown error'}`);
    } else {
      success(`${r.name} setup complete`);
    }
  }

  await dispatchBackend({
    backend,
    config: args.config,
    workspaceName: plan.workspaceName,
    workspacePath: plan.workspacePath,
    tabs: buildDispatchTabs({ plan, slug, backend }),
  });

  return { ok: true, plan, setupResults };
}
