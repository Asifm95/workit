---
date: 2026-04-18
topic: readme-rewrite
---

# README Rewrite

## Problem Frame

The current README undersells workit. The tagline doesn't explain the product, the Why leans on "Conductor/Superset force single-repo shape" without naming the real pain (no shared workspace for cross-repo planning), and there's no reference for the CLI, config, or setup-script contract — so new users can't discover what the tool actually does without reading the source.

Primary readers to win in the first 10 seconds: coding-agent power users and people who tried single-project agent GUIs (Conductor, Superset, t3code) and hit the cross-repo wall.

## Requirements

- **R1. Tagline.** Replace the current tagline with:
  _"Workit - CLI for managing development across multi repos. Designed for running AI agents in parallel."_

- **R2. Why section.** Replace with the locked three-paragraph version below. Warm, first- and second-person, no rhetorical scaffolding. No "not X, but Y" construction, no "Real features don't fit" flourishes.

  > Most coding-agent TUIs and GUIs — Conductor, Superset, Codex app, t3code, etc — assume one project per workspace. But in real world projects, most feature development can span across multiple repos. Agents can read across repos with enough coaxing, but there's no shared place to _plan_ the work. The brainstorm, the spec, the plan that covers the whole feature has to live somewhere, and a single repo isn't it.
  >
  > Then there's the setup. Each feature means creating a worktree in each repo, running each project's setup script, opening a terminal tab for each. Then doing it all again when you tear down.
  >
  > workit rolls that up into one command. You get a worktree per project on a shared branch, setup scripts running in the background, and a folder at the top level where the docs and plans for the whole feature can actually live.

- **R3. Status line near top.** After the tagline, state: v0.x (surface may change, feedback welcome), macOS-first (Linux works, Windows untested), agent-agnostic (works with any CLI/GUI agent — or none).

- **R4. Quickstart.** Keep a short install block (Bun / Homebrew / prebuilt binary / from source — already in README). Follow with a 3-step "first workspace" walkthrough: `workit new "describe feature"`, pick projects, land in terminal with tabs.

- **R5. CLI reference section.** Dedicated `## CLI` section with a subsection per command (`new`, `rm`, `ls`, `config`). Each subsection lists: purpose, usage line, every flag with default and effect, and 1–2 concrete examples.

  Flags to cover on `new`: `[description]` positional, `--type`, `--projects`, `--terminal`, `--dry-run`, `--sync-setup`, `-y/--yes`.
  Flags on `rm`: `[name]` positional, `--delete-branch`, `--force`, `--dry-run`, `-y/--yes`.
  `ls` and `config` take no flags today — say so explicitly.

- **R6. Configuration reference section.** Dedicated `## Configuration` section. Document location (`~/.config/workit/config.json`, auto-created on first run). Document every key in the schema with default and meaning: `workspacesDir`, `defaultBranchType`, `defaultTerminal` (auto/cmux/tmux/warp/none), `terminalCommand.cmux`, `terminalCommand.warp`, `templates.workspaceClaudeMd`, `setupScriptPaths`, `directoryPicker.dotAllowlist`. Show a complete example `config.json` block.

- **R7. Setup scripts section.** Dedicated `## Setup scripts` section covering the contract:
  - Discovery order (configured `setupScriptPaths`, default `./setup.sh` then `.workit/setup.sh`)
  - Working directory (the new worktree, not the main repo)
  - Async-by-default behavior and `--sync-setup` opt-in
  - Where logs land (`~/.workit/logs/<slug>/<project>.log`)
  - Status reporting (`spawned` / `missing` / `failed-to-start` / `ok` / `failed`)

- **R8. Terminal integrations subsection.** Inside CLI reference or as its own short section. Table or bullet list: cmux, tmux, warp, none — what each does when a workspace is created. Flag this as feature-list, not headline.

- **R9. Keep existing Releasing section.** The release-please paragraph stays as-is.

## Success Criteria

- A reader who has never seen workit can, from the README alone, answer: what it is, who it's for, how to install it, how to create their first workspace, what every flag does, and how to configure setup scripts.
- The Why reads like a person wrote it, not an LLM. No "not X, but Y" construction. No em-dash triads stacked for rhetorical effect. First-line smell-test: a skeptical reader shouldn't roll their eyes.
- The tagline and first paragraph together make a Conductor/Superset user think "oh, this is for me" within 10 seconds.

## Scope Boundaries

- No logo, no badges (build/version/downloads) in this pass. Defer.
- No screenshots or GIFs in this pass. Defer until after the text is right.
- No separate `docs/` site. Everything inline in README for now.
- No comparison table vs. Conductor/Superset/t3code. Why section names them once; that's enough.
- No Contributing / Code of Conduct sections in this pass.

## Key Decisions

- **Tagline goes workspace-led, not terminal-led.** Cross-repo workspace is the wedge; terminal integration is a feature, not the headline.
- **Why is warm and first-/second-person.** Earlier drafts read as slop. The locked version uses "you're on your own," "with enough coaxing," "rolls that up into one command" — conversational, specific, no rhetorical scaffolding.
- **All docs live in the README.** Two-hop structures (README → docs/\*) deferred; discoverability beats cleanliness for a v0.x tool.
- **Adversarial framing toward Conductor/Superset is fine.** Named once, not belabored. No "complementary, not a replacement" disclaimer.

## Dependencies / Assumptions

- The CLI surface (`new`, `rm`, `ls`, `config`) and flag set in `src/cli.ts` at the time of writing are authoritative. If flags change before the README lands, sync before merging.
- The config schema in `src/core/config.ts` is authoritative for R6.

## Outstanding Questions

### Resolve Before Planning

_(none)_

### Deferred to Planning

- [Affects R4] Should the quickstart use an agent-forward example (e.g., "then run `claude` in each tab") or stay agent-agnostic? Decide when drafting.
- [Affects R7] Whether to document the env vars passed to setup scripts (if any) — verify from `src/setup/runner.ts` during drafting.
- [Affects R8] Whether the terminal integrations subsection belongs inside `## CLI` (under `new --terminal`) or as its own top-level section. Judgment call during drafting.

## Next Steps

→ `/ce:plan` for structured implementation planning of the README rewrite.
