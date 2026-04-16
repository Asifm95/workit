import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import type { Config } from "../core/config";
import { resolveConfigPaths } from "../core/config";
import { slugify } from "../core/slug";
import { buildNewPlan, formatNewPlan } from "../core/plan";
import type { Project } from "../core/project-discovery";
import { ensureDir, pathExists } from "../utils/fs";
import { addWorktree } from "../git/worktree";
import { branchExists, isGitRepo } from "../git/repo";
import { runSetupScripts, type SetupResult } from "../setup/runner";
import { renderTemplate } from "../templates/render";
import {
  detectAvailability,
  dispatchBackend,
  selectBackend,
  type BackendName,
} from "../terminal";
import { colorFor, info, hint, warn, success } from "../ui/log";

export interface RunNewArgs {
  config: Config;
  description: string;
  branchType: string;
  projectPaths: string[];
  terminal?: BackendName;
  assumeYes: boolean;
  dryRun?: boolean;
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
    .join(" ")
    .trim();
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

  if (plan.isWorkspace && plan.workspacePath) {
    await ensureDir(plan.workspacePath);
    const tplPath = resolved.resolvedWorkspaceClaudeTemplate;
    if (await pathExists(tplPath)) {
      const tpl = await readFile(tplPath, "utf8");
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
      await writeFile(join(plan.workspacePath, "CLAUDE.md"), rendered);
    } else {
      warn(`template not found at ${tplPath}; skipping CLAUDE.md`);
    }
  }

  await Promise.all(
    plan.targets.map((t) =>
      addWorktree({
        mainRepoPath: t.project.path,
        targetPath: t.targetPath,
        branch: t.branch,
      })
    )
  );

  const setupResults = await runSetupScripts({
    targets: plan.targets.map((t) => ({ name: t.project.name, cwd: t.targetPath })),
    scriptPaths: resolved.setupScriptPaths,
    onLine: (name, line) => {
      const c = colorFor(name);
      console.log(c(`[${name}]`) + ` ${line}`);
    },
  });
  for (const r of setupResults) {
    if (r.status === "missing") {
      hint(`no setup script in ${r.name} — create one to automate this step`);
    } else if (r.status === "failed") {
      warn(`setup failed in ${r.name}: ${r.error ?? "unknown error"}`);
    } else {
      success(`${r.name} setup complete`);
    }
  }

  const availability = await detectAvailability(args.config);
  const backend = selectBackend({
    flag: args.terminal,
    configDefault: args.config.defaultTerminal,
    insideTmux: availability.insideTmux,
    insideCmux: availability.insideCmux,
    tmuxAvailable: availability.tmuxAvailable,
    cmuxAvailable: availability.cmuxAvailable,
  });
  await dispatchBackend({
    backend,
    config: args.config,
    featureSlug: slug,
    workspacePath: plan.workspacePath,
    tabs: plan.targets.map((t) => ({ name: t.project.name, cwd: t.targetPath })),
  });

  return { ok: true, plan, setupResults };
}
