#!/usr/bin/env bun
import { resolve } from "node:path";
import { Command } from "commander";
import { loadConfig } from "./core/config";
import { runNewCommand } from "./commands/new";
import { runRmCommand } from "./commands/rm";
import { runLsCommand } from "./commands/ls";
import { runConfigCommand } from "./commands/config";
import {
  promptDescription,
  promptBranchType,
  promptProjectPicker,
  promptConfirm,
} from "./ui/prompts";
import { error } from "./ui/log";
import type { BackendName } from "./terminal";

const program = new Command();
program
  .name("workit")
  .description("Multi-project git worktree workflow manager")
  .version("0.1.0");

program
  .command("new")
  .description("Create worktree(s) for a new feature")
  .argument("[description]", "feature description")
  .option("--type <type>", "branch type (feat/fix/chore/...)")
  .option("--projects <paths>", "comma-separated project paths")
  .option("--terminal <backend>", "cmux|tmux|none")
  .option("--dry-run", "print the plan without executing", false)
  .option("-y, --yes", "skip confirmations", false)
  .action(async (description: string | undefined, opts) => {
    try {
      const { config } = await loadConfig();
      const desc = await promptDescription(description);
      const branchType = await promptBranchType(
        opts.type,
        config.defaultBranchType,
      );

      let projectPaths: string[];
      if (opts.projects) {
        projectPaths = String(opts.projects)
          .split(",")
          .map((s) => resolve(s.trim()))
          .filter(Boolean);
      } else {
        const picked = await promptProjectPicker(process.cwd());
        projectPaths = picked.map((p) => p.path);
      }

      if (!opts.yes && !opts.dryRun) {
        const go = await promptConfirm("Proceed?", true);
        if (!go) return;
      }

      await runNewCommand({
        config,
        description: desc,
        branchType,
        projectPaths,
        terminal: opts.terminal as BackendName | undefined,
        assumeYes: Boolean(opts.yes),
        dryRun: Boolean(opts.dryRun),
      });
    } catch (e: any) {
      error(e.message ?? String(e));
      process.exit(1);
    }
  });

program
  .command("rm")
  .description("Remove a worktree or workspace")
  .argument("[name]", "workspace or worktree name")
  .option("--delete-branch", "also delete the git branch", false)
  .option("--force", "skip dirty/unpushed checks", false)
  .option("--dry-run", "print the plan without executing", false)
  .option("-y, --yes", "skip confirmation", false)
  .action(async (name: string | undefined, opts) => {
    try {
      if (!name) {
        error("missing name argument (interactive picker not yet implemented)");
        process.exit(1);
      }
      const { config } = await loadConfig();
      if (!opts.yes && !opts.dryRun) {
        const ok = await promptConfirm(`Remove "${name}"?`, false);
        if (!ok) return;
      }
      await runRmCommand({
        config,
        name,
        deleteBranch: Boolean(opts.deleteBranch),
        force: Boolean(opts.force),
        assumeYes: Boolean(opts.yes),
        dryRun: Boolean(opts.dryRun),
      });
    } catch (e: any) {
      error(e.message ?? String(e));
      process.exit(1);
    }
  });

program
  .command("ls")
  .description("List worktrees and workspaces")
  .action(async () => {
    const { config } = await loadConfig();
    await runLsCommand(config);
  });

program
  .command("config")
  .description("Print config (creates default if missing)")
  .action(async () => {
    await runConfigCommand();
  });

program.parseAsync(process.argv);
