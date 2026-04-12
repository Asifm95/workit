# workit — CLI Workflow Management Tool (Design)

**Date:** 2026-04-12
**Status:** Approved, ready for planning

## Purpose

Automate the repetitive steps involved in starting a new feature branch: creating git worktrees (sometimes across multiple projects), wiring up a workspace folder with a `CLAUDE.md`, running each project's setup script, and launching a terminal session preconfigured with tabs pointing at each worktree.

The tool replaces a manual sequence the author does by hand today, and is initially built for a single user.

## Terminology

- **Project** — a git repository discovered under one of the configured `projectRoots`.
- **Main worktree** — the original clone of a project (not a worktree created by this tool). Used as the base for `git worktree add`.
- **Slug** — URL-safe lowercased version of the feature description (e.g. `"Add DAC7 reporting"` → `add-dac7-reporting`).
- **Branch** — the git branch created for the feature, named `<type>/<slug>` (e.g. `feat/add-dac7-reporting`).
- **Worktree folder** — the on-disk directory for a single project's git worktree, named `<project>.<slug>`.
- **Workspace folder** — a parent directory that groups worktrees when a feature spans multiple projects, named `<slug>`.
- **Setup script** — an arbitrary bash script that prepares a freshly-created worktree (copy secrets, install deps, etc). Found at `./setup.sh` or `.workit/setup.sh` in each project.
- **Terminal backend** — cmux, tmux, or `none`. Determines how the tool hands the user off to a working shell at the end of `new`.

## Goals

- Single command (`workit new`) to go from idea → ready-to-work terminal session.
- Work identically for single-project features and multi-project workspaces; no mode switch.
- Respect existing conventions the user already follows manually (naming, folder layout, per-project `setup.sh`).
- Cleanup command (`workit rm`) symmetric to `workit new`.
- Fast for daily use via flags, but usable end-to-end with zero flags via interactive prompts.

## Non-goals

- No template or scaffolding of new project code.
- No integration with issue trackers (Linear, Jira, etc.) — branch names come from a plain description.
- No concurrency control across multiple invocations of workit at the same time.
- No Windows support (macOS/Linux only).

## Commands

### `workit new [description]`

Main flow. Creates worktree(s), workspace folder (if multi-project), runs setup scripts, launches terminal.

**Flags:**
- `--type <feat|fix|chore|ref|...>` — branch type prefix. Default from config.
- `--projects <a,b,c>` — comma-separated project names. Skips the picker.
- `--terminal <cmux|tmux|none>` — force a terminal backend.
- `--dry-run` — print the plan, do nothing.
- `--yes` / `-y` — skip confirmations.

Missing inputs are prompted for interactively (description, type, projects, final confirmation).

### `workit rm [name]`

Cleanup command.

**Flags:**
- `--delete-branch` — also delete the git branch in each project. Off by default.
- `--close-terminal` — also kill the matching tmux session / close the cmux workspace.
- `--force` — skip dirty/unpushed checks.
- `--yes` / `-y` — skip confirmation.

### `workit ls`

List all worktrees and workspaces currently under `~/.workit/workspaces/`. Shows type (single/workspace), branch, dirty state, and backing project(s).

### `workit config`

Print the resolved config path and its current contents. If no config exists, create the default.

## Directory layout

**Single project:**
```
~/.workit/workspaces/<project>.<slug>/
```

**Multi-project (workspace):**
```
~/.workit/workspaces/<slug>/
├── CLAUDE.md                 # rendered from template
├── <projectA>.<slug>/        # git worktree
├── <projectB>.<slug>/        # git worktree
└── ...
```

**Config directory:**
```
~/.config/workit/
├── config.json
├── cache.json                # project discovery cache (auto-managed)
└── templates/
    └── workspace-CLAUDE.md   # user-editable
```

Per decision Q7, the slug is a single value shared by the workspace folder name and every per-project branch/folder. No separate "feature name" vs "branch name" inputs.

## Configuration

`~/.config/workit/config.json`:

```json
{
  "workspacesDir": "~/.workit/workspaces",
  "projectRoots": [
    "~/Projects/personal",
    "~/Projects/micro-company"
  ],
  "defaultBranchType": "feat",
  "defaultTerminal": "auto",
  "terminalCommand": {
    "cmux": "/Applications/cmux.app/Contents/Resources/bin/cmux"
  },
  "templates": {
    "workspaceClaudeMd": "~/.config/workit/templates/workspace-CLAUDE.md"
  },
  "setupScriptPaths": ["./setup.sh", ".workit/setup.sh"]
}
```

Validated with Zod on load. Missing config → write defaults and print the path.

### Workspace CLAUDE.md template

Default template, stored at `~/.config/workit/templates/workspace-CLAUDE.md`:

```markdown
# {{feature_title}} — Workspace

This is the workspace folder for developing the **{{feature_title}}** feature.

## Structure

The parent directory contains subdirectories, each of which is a separate git project (repository) required to implement this feature. Each subdirectory is already set up as a git worktree and is checked out on the relevant feature branch — do not create new worktrees or switch branches inside them.

Current subprojects:

{{#each projects}}
- [`{{folder}}/`](./{{folder}}/CLAUDE.md) — see its `CLAUDE.md` for project-specific instructions.
{{/each}}

## Working in this workspace

When working inside a subdirectory, follow the instructions in that subdirectory's own `CLAUDE.md`. Those files are authoritative for their respective projects.
```

Placeholders supported:
- `{{feature_title}}` — title-cased version of the description
- `{{feature_slug}}` — the slug
- `{{branch_type}}`, `{{branch_name}}` (= `<type>/<slug>`)
- `{{#each projects}}` loop with `{{folder}}`, `{{name}}`, `{{branch}}` per project

Template engine: a tiny hand-rolled one is sufficient — no Handlebars dep needed. `{{key}}` substitution plus a single `{{#each projects}}…{{/each}}` block.

## Project discovery

At first use in a session (and after cache TTL expires), workit walks each `projectRoots` entry looking for directories that contain a `.git` file or folder. Results are cached in `~/.config/workit/cache.json`:

```json
{
  "version": 1,
  "refreshedAt": "2026-04-12T10:00:00Z",
  "projects": [
    { "name": "storelink-dashboard", "path": "~/Projects/micro-company/storelink-dashboard" },
    ...
  ]
}
```

**TTL:** 10 minutes. `--refresh` flag forces a fresh walk. Cache auto-refreshes when a flagged project path no longer resolves.

**Pre-selection:** if `workit new` is invoked from inside a directory that is (or is under) a discovered project, that project is pre-checked in the fuzzy picker.

**Picker:** fuzzy, searchable, multi-select. Selection order is preserved (first-picked → first tab in terminal).

## The `new` flow

```
1. Resolve inputs (flags > prompts > defaults):
   a. Feature description       (free text)
   b. Branch type               (feat/fix/chore/ref/...)
   c. Selected projects         (multi-select, pre-checked if invoked inside one)

2. Compute names:
   - slug           = slugify(description)
   - branchName     = `${type}/${slug}`
   - folderName(p)  = `${p.name}.${slug}`
   - isWorkspace    = selected.length > 1
   - workspaceDir   = isWorkspace ? `${workspacesDir}/${slug}` : null
   - targetPath(p)  = isWorkspace
                        ? `${workspaceDir}/${folderName(p)}`
                        : `${workspacesDir}/${folderName(p)}`

3. Pre-flight checks (abort on first failure with a clear message):
   - each project's main worktree resolves and is a git repo
   - each targetPath(p) does not exist
   - each branchName does not already exist in project p (unless --reuse-branch)

4. Print the plan and confirm. Skipped with --yes. With --dry-run, the plan
   is still printed (it's the point of the command) but execution exits here.

5. Create workspaceDir (mkdir -p) and render its CLAUDE.md from the template.
   Skip this step when !isWorkspace.

6. Create worktrees in parallel:
     git -C <project-main-worktree> worktree add <targetPath> -b <branchName>
   Branches from whatever is checked out in the main worktree (Q11 decision).
   Collect results; any failure short-circuits subsequent steps but leaves
   already-created state on disk (Q13: no rollback).

7. Run setup scripts in parallel, one per newly-created worktree:
     - find first of [./setup.sh, .workit/setup.sh] (ordered per config.setupScriptPaths)
     - execute with cwd = targetPath
     - stream stdout/stderr line-by-line, each line prefixed with `[<project>]`
     - if no script found: print `💡 no setup script in <project> — create one to automate this step`, continue

8. Launch terminal (Section below).

9. If backend is `none`, print paths and a cd hint.
```

## Terminal backends

### Backend selection order

1. Explicit `--terminal <name>` flag
2. If running inside cmux (`CMUX_WORKSPACE_ID` set) → `cmux`
3. Else if running inside tmux (`TMUX` set) → `tmux`
4. Else `config.defaultTerminal` (if not `"auto"`)
5. Else first available: `cmux` binary present → cmux; else `tmux` binary present → tmux; else `none`
6. If chosen backend is unavailable at runtime → print a warning, fall back to `none`.

### tmux backend

Commands (all via `execFile`, args as arrays):

- **Detect installed:** `tmux -V`
- **Detect inside:** `process.env.TMUX` non-empty
- **Sanitize name:** replace `.` and `:` with `-` in the slug
- **Check session:** `tmux has-session -t=<slug>` — if it exists, skip create and just attach/switch
- **Create session (detached), first window in first project dir:**
  `tmux new-session -d -s <slug> -n <project1> -c <targetPath1>`
- **Add windows for remaining projects:**
  `tmux new-window -t <slug>: -n <projectN> -c <targetPathN>`
- **Attach/switch:**
  - outside tmux: `execFileSync('tmux', ['attach-session', '-t', slug], { stdio: 'inherit' })`
  - inside tmux: `tmux switch-client -t <slug>`
- **Non-TTY (`!process.stdin.isTTY`):** skip attach, print the attach command instead.

### cmux backend

Binary path from `config.terminalCommand.cmux` (default `/Applications/cmux.app/Contents/Resources/bin/cmux`).

- **Detect installed:** `execFile(binary, ['--version'])` or check file exists
- **Detect inside:** `process.env.CMUX_WORKSPACE_ID` set
- **Create workspace in first project dir:**
  `cmux new-workspace --name <slug> --cwd <targetPath1> --id-format refs`
  (capture stdout → `$WS`; if parsing is unreliable, use `cmux rpc` for structured output)
- **Add a tab per remaining project:**
  ```
  S = cmux new-surface --type terminal --workspace $WS
  cmux send --workspace $WS --surface $S "cd <targetPath>\n"
  cmux rename-tab --workspace $WS --surface $S "<project>"
  ```
  The initial tab also gets renamed (`rename-tab` on the implicit first surface) to match project 1.
- **Gotcha:** when invoked from inside cmux, `CMUX_WORKSPACE_ID`/`CMUX_SURFACE_ID` are preset in env. Always pass `--workspace` explicitly; do not rely on implicits.
- **Auth:** propagate `CMUX_SOCKET_PASSWORD` from the parent env if set.

### none backend

Prints a block like:
```
Created worktrees:
  [storelink-dashboard]  ~/.workit/workspaces/add-dac7-reporting/storelink-dashboard.add-dac7-reporting
  [storelink-links]      ~/.workit/workspaces/add-dac7-reporting/storelink-links.add-dac7-reporting

Next: cd ~/.workit/workspaces/add-dac7-reporting
```

## The `rm` flow

```
1. Target resolution:
   - `workit rm` (no arg)     → fuzzy picker over ~/.workit/workspaces/ entries
   - `workit rm <name>`       → direct match

2. Detect target type (single worktree vs workspace with subdirs).

3. Pre-check each worktree:
   - uncommitted changes  → warn, require --force
   - unpushed commits     → warn, require --force

4. Print the removal plan. List:
   - worktrees to remove (paths)
   - branches to delete (if --delete-branch)
   - workspace folder to remove (if multi)
   - terminal session/workspace to close (if --close-terminal)
   Confirm unless --yes.

5. Remove worktrees:
     git -C <project-main-worktree> worktree remove <targetPath> [--force]

6. If --delete-branch:
     git -C <project-main-worktree> branch -D <branchName>

7. If workspace: rm -rf the <slug>/ folder.

8. If --close-terminal:
     - tmux: `tmux kill-session -t=<slug>` (if exists)
     - cmux: close the workspace named <slug> via the cmux CLI
```

## Error handling

- Any failure mid-flow stops execution (no rollback).
- Print a summary: what succeeded (still on disk), what failed, the underlying error message, and a hint for recovery (usually "inspect and `workit rm <slug>`").
- Pre-flight validation (Section: flow step 3) catches the common cases before any side effects.
- Existing slug collisions (folder already present) abort before anything is created.
- Branch already exists: offer a one-key prompt to reuse the existing branch instead of creating it, or abort.

## Dry-run

`workit new --dry-run` performs steps 1–4 of the new flow (resolve inputs, compute names, pre-flight, print plan) and exits 0. No mkdirs, no git calls, no setup script runs, no terminal commands.

`workit rm --dry-run` performs steps 1–4 of the rm flow and exits 0.

## Code layout

```
src/
├── cli.ts                         # entry: parse argv, route
├── commands/
│   ├── new.ts                     # orchestrates the new flow
│   ├── rm.ts                      # orchestrates the rm flow
│   ├── ls.ts
│   └── config.ts
├── core/
│   ├── config.ts                  # load/validate ~/.config/workit/config.json
│   ├── slug.ts                    # description → slug
│   ├── project-discovery.ts       # walk roots, cache
│   ├── naming.ts                  # branch, folder, workspace names
│   └── plan.ts                    # build + print plans (new + rm)
├── git/
│   ├── repo.ts                    # detect repo, main worktree, branches, dirty check
│   └── worktree.ts                # add/remove wrappers around `git worktree`
├── setup/
│   └── runner.ts                  # find + run setup scripts, parallel, prefixed output
├── terminal/
│   ├── index.ts                   # detect + dispatch
│   ├── tmux.ts
│   ├── cmux.ts
│   └── none.ts
├── templates/
│   └── render.ts                  # {{key}} + {{#each projects}}…{{/each}}
├── ui/
│   ├── prompts.ts                 # @clack/prompts wrappers
│   └── log.ts                     # colored, prefixed output
└── utils/
    ├── fs.ts                      # expanduser, path helpers
    └── exec.ts                    # execa wrappers
```

### Dependencies

- **Runtime:** Bun (dev + execution)
- **@clack/prompts** — interactive prompts
- **commander** — arg parsing
- **execa** — child_process ergonomics
- **zod** — config schema
- **picocolors** — terminal color (small, no-dep)
- No Handlebars — tiny in-house template engine (saves a dep, the template is simple).

### Testing

- Bun's built-in test runner (`bun test`).
- Unit tests: `slug`, `naming`, config schema, template rendering, plan builder, project discovery walker.
- Integration test for `new` against a tmp directory with fake git repos; forces `--terminal none`. Runs the full flow end-to-end.
- Integration test for `rm` covering single-project and workspace cases, dirty detection, and `--delete-branch`.
- Terminal backends have their own unit tests (mocked `execa`) verifying the exact commands emitted. No live tmux/cmux in CI.

## Distribution

Primary: **Bun** source project. User runs via `bun run src/cli.ts` during development.

Release channels:

1. **npm** — `bun build src/cli.ts --target=node --outfile=dist/workit.js`, publish with a `bin` entry so `npm install -g workit` works on plain Node installs.
2. **Homebrew** — `bun build --compile` produces a standalone macOS binary; published via a tap formula that downloads the binary release from GitHub.

Both channels built from the same source; version bumps automated via a release script (out of scope for v1).

## Open questions (deferred, not blocking)

- None. All design-level questions resolved during brainstorming.

## Out of scope for v1

- Linear/Jira integration
- Automatic base-branch update (`git pull` before branching)
- Windows support
- Non-git project support
- Parallel invocations of `workit new` for the same slug
- `workit open <name>` (could be added later — re-launch the terminal session for an existing workspace)
- `workit sync` (pull all worktrees, could be added later)
