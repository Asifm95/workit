# workit

A CLI for managing development across multi repo projects. Designed for running AI agents in parallel.

- **v0.x** — surface may change, feedback welcome
- **macOS-first** — Linux works, Windows untested
- **Agent-agnostic** — works with any CLI/GUI agent, or none

## Why

Most coding-agent TUIs and GUIs — Conductor, Superset, Codex app, t3code, etc — all support running parallel agents for a project using worktrees. This works well as long as the feature development is confined to a single repo. But since all these tools assumes one project per workspace, it doesn't work when a feature development spans across multiple repos. Things like planning, context sharing and working for the agents across multiple repos becomes difficult. Muti phased implementation of features across multiple repos becomes even more difficult.

`workit` solves this by scaffolding a multi repo workspace per feature. Inside the workspace, it sets up the worktree per repo that needs to be worked on. `workit` ships with many helpful commands to help simplify working with many parallel repos.

## Install

### Bun (recommended)

```bash
bun install -g @asifm95/workit
```

Requires [Bun](https://bun.sh) ≥ 1.1.

### Homebrew (macos)

```bash
brew tap Asifm95/workit && brew install workit
```

### Prebuilt binary

Download the binary matching your platform from the [latest release](https://github.com/Asifm95/workit/releases/latest).

### From source (Bun)

```bash
bun install
bun run dev -- new
```

## Quickstart

Create your first workspace in three steps:

1. **Describe the feature.**

   ```bash
   workit new "add billing webhooks"
   ```

2. **Pick the projects you want to work in.** workit launches an interactive picker rooted at the current directory. Move with the arrow keys, space to toggle, enter to confirm. You can also pass `--projects api,web` to skip the picker.

3. **Land in your terminal with a tab per project.** workit creates a worktree in each repo on a shared branch (e.g. `feat/add-billing-webhooks`), starts each project's setup script in the background, and opens your terminal (cmux, tmux, or warp — whatever you have) with one tab per worktree.

From there, run whatever you'd normally run — your editor, your agent, your test loop — in each tab.

## CLI

workit ships five commands: `new`, `rm`, `ls`, `config`, and `logs`.

### `workit new`

Create worktrees for a new feature.

```
workit new [description] [options]
```

| Argument / flag        | Default                             | Effect                                                                                                              |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `[description]`        | _prompts_                           | Short feature description. Slugified to form the workspace folder and branch name. Omit to be prompted.             |
| `--type <type>`        | `config.defaultBranchType` (`feat`) | Branch prefix. Prompt offers `feat / fix / chore / ref / docs / test`.                                              |
| `--projects <paths>`   | _interactive picker_                | Comma-separated paths to project repos. Each is resolved relative to the current directory. Omit to use the picker. |
| `--terminal <backend>` | `config.defaultTerminal` (`auto`)   | One of `cmux`, `tmux`, `warp`, `none`. See **Terminal backends** below.                                             |
| `--dry-run`            | `false`                             | Print the plan and exit without creating anything.                                                                  |
| `--sync-setup`         | `false`                             | Wait for setup scripts to finish and stream their output. Default is async (detached).                              |
| `-y, --yes`            | `false`                             | Skip the "Proceed?" confirmation.                                                                                   |

Examples:

```bash
# Interactive: prompts for description, type, and project picker
workit new

# Fully scripted
workit new "fix flaky checkout test" --type fix --projects api,web --terminal tmux -y
```

#### Terminal backends

The `--terminal` flag (and `defaultTerminal` in config) chooses where workit drops you after creating worktrees. This is a convenience layer on top of the workspace itself — the worktrees and setup scripts run the same way regardless.

| Backend | What it does                                                                                                                                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cmux`  | Creates a new cmux workspace named after the feature, with one tab per project, each `cd`'d into its worktree. Requires the cmux binary at `terminalCommand.cmux` (default `/Applications/cmux.app/Contents/Resources/bin/cmux`). |
| `tmux`  | Creates a tmux session named after the feature with one window per project. If you're already inside tmux, switches client; otherwise prints the `tmux attach` command.                                                           |
| `warp`  | Writes a Warp launch configuration with one tab per project, then opens it via `warp://launch/<slug>`. macOS or Linux Warp install required.                                                                                      |
| `none`  | Prints a summary with paths and a `Next: cd <path>` hint. Use this when you'd rather open tabs yourself.                                                                                                                          |

When `defaultTerminal` is `auto` and `--terminal` is omitted, workit picks based on what's installed and where you're running it: if you're already inside cmux/tmux/warp, it stays there; otherwise it prefers tmux, then cmux, then `none`. If both cmux and tmux are available, you'll be prompted.

### `workit rm`

Remove a worktree or workspace.

```
workit rm <name> [options]
```

| Argument / flag   | Default    | Effect                                                                                                   |
| ----------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `<name>`          | _required_ | Workspace slug (multi-repo) or worktree folder name (single-repo). Resolved by scanning `workspacesDir`. |
| `--delete-branch` | `false`    | Also run `git branch -D` on each removed worktree's branch.                                              |
| `--force`         | `false`    | Skip the dirty-working-tree check. Unpushed-commit check still runs but only warns.                      |
| `--dry-run`       | `false`    | Print the plan and exit.                                                                                 |
| `-y, --yes`       | `false`    | Skip the "Remove `<name>`?" confirmation.                                                                |

Examples:

```bash
workit rm add-billing-webhooks
workit rm fix-flaky-checkout-test --delete-branch --force -y
```

### `workit ls`

List every workspace and standalone worktree in `workspacesDir`. Takes no flags today.

```
workit ls
```

Output is alphabetical and tagged: `[workspace]` for multi-repo workspaces, `[worktree]` for single-repo entries.

### `workit config`

Print the active config (creating the default file if it doesn't exist yet). Takes no flags today.

```
workit config
```

On first run, this is the easiest way to bootstrap `~/.config/workit/config.json` — workit writes the defaults and prints them.

### `workit logs`

Tail setup-script logs for a feature. Backfills the last N lines, then follows new output until each project's script finishes (or you hit Ctrl-C).

```
workit logs <slug> [project] [options]
```

| Argument / flag   | Default                   | Effect                                                                                |
| ----------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| `<slug>`          | _required_                | Feature slug. Resolved to `~/.workit/logs/<slug>/`.                                   |
| `[project]`       | _all projects_            | Filter to one project. Must match a `<project>.log` file in the slug's log dir.       |
| `-n, --lines <n>` | `config.logsLines` (`50`) | History lines to backfill per project before tailing. Must be a non-negative integer. |

Examples:

```bash
# Follow every project for this feature
workit logs add-billing-webhooks

# Just one project, with more history
workit logs add-billing-webhooks api -n 200
```

Exit code: when tailing a single project, workit exits with that script's exit code. When tailing multiple, exit code is `1` if any failed, else `0`.

## Configuration

Config lives at `~/.config/workit/config.json`. workit writes the defaults the first time it loads — running `workit config` once is enough to create the file.

| Key                            | Default                                              | Meaning                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `workspacesDir`                | `~/.workit/workspaces`                               | Root directory where workspaces and standalone worktrees are created. `~` is expanded.                                                    |
| `defaultBranchType`            | `feat`                                               | Pre-selected branch type in the prompt. Prompt options are `feat / fix / chore / ref / docs / test`.                                      |
| `defaultTerminal`              | `auto`                                               | Terminal backend strategy. One of `auto`, `cmux`, `tmux`, `warp`, `none`. `auto` picks based on availability — see **Terminal backends**. |
| `terminalCommand.cmux`         | `/Applications/cmux.app/Contents/Resources/bin/cmux` | Path to the cmux binary. Falls back to looking up `cmux` on `PATH` if unset.                                                              |
| `terminalCommand.warp`         | _unset_                                              | Reserved. Declared in the schema but not consumed today; Warp is launched via the `warp://launch/<slug>` deep link.                       |
| `templates.workspaceClaudeMd`  | `~/.config/workit/templates/workspace-CLAUDE.md`     | Path to a template file rendered to `<workspace>/CLAUDE.md` on multi-repo workspace creation. Missing template is logged and skipped.     |
| `setupScriptPaths`             | `["./setup.sh", ".workit/setup.sh"]`                 | Ordered list of paths (relative to each worktree) where workit looks for a setup script. First match wins. See **Setup scripts**.         |
| `directoryPicker.dotAllowlist` | `[".workit"]`                                        | Dotfiles/dotdirs to surface in the interactive project picker (which otherwise hides them). `node_modules` is always excluded.            |
| `logsLines`                    | `50`                                                 | Default history backfill for `workit logs`. Overridable per-call via `--lines`.                                                           |

Complete example `config.json` at defaults:

```json
{
  "workspacesDir": "~/.workit/workspaces",
  "defaultBranchType": "feat",
  "defaultTerminal": "auto",
  "terminalCommand": {
    "cmux": "/Applications/cmux.app/Contents/Resources/bin/cmux"
  },
  "templates": {
    "workspaceClaudeMd": "~/.config/workit/templates/workspace-CLAUDE.md"
  },
  "setupScriptPaths": ["./setup.sh", ".workit/setup.sh"],
  "directoryPicker": {
    "dotAllowlist": [".workit"]
  },
  "logsLines": 50
}
```

## Setup scripts

When workit creates a worktree, it looks for a setup script in that worktree and runs it. This is where you put the per-project bootstrapping that would otherwise be a manual step every time — `bun install`, `bundle install`, copying `.env`, generating local SSL certs, whatever your project needs to be runnable. By default, it looks for `./setup.sh` then `.workit/setup.sh`. This can be configured in `setupScriptPaths`
