---
title: Bootstrap workspace AGENTS.md template (with CLAUDE.md alias)
type: feat
status: active
date: 2026-04-20
---

# Bootstrap workspace AGENTS.md template (with CLAUDE.md alias)

## Overview

When `workit new` creates a multi-repo workspace it renders a per-workspace `CLAUDE.md` from a template at `~/.config/workit/templates/workspace-CLAUDE.md`. If that template is missing, the command logs a warning and silently skips — the workspace ends up without any agent-instruction file. This change:

1. **Auto-installs the bundled default template** the first time it is needed, instead of skipping.
2. **Switches the generated file from `CLAUDE.md` to `AGENTS.md`** (the emerging cross-agent convention), and writes a thin `CLAUDE.md` containing only `@AGENTS.md` so Claude Code continues to pick it up via its file-import syntax.
3. **Renames the config key and bundled template** accordingly (`workspaceClaudeMd` → `workspaceAgentsMd`, default path `~/.config/workit/templates/workspace-AGENTS.md`).

## Problem Statement / Motivation

- **Silent skip is a footgun.** New users almost never have `~/.config/workit/templates/workspace-CLAUDE.md` populated — the file is never installed by `workit`. Today they get a `warn(... skipping CLAUDE.md)` line buried in output and end up in a workspace with zero agent guidance. The template only starts working if they manually create the file.
- **`CLAUDE.md` is Claude-specific.** Other agents (Codex, Cursor, Gemini) standardize on `AGENTS.md`. Writing `AGENTS.md` as the primary file and `CLAUDE.md` as a one-line pointer (`@AGENTS.md`, which Claude Code resolves as an import) makes the workspace useful to any agent while preserving Claude Code support.
- **Zero-config principle.** `workit` already auto-creates `~/.config/workit/config.json` with defaults on first run (`config.ts:51-57`). The template install should match that spirit.

Relevant code:
- `src/commands/new.ts:88-108` — the skip branch that this plan fixes.
- `src/core/config.ts:14-45` — config schema / defaults (key rename lives here).
- `src/templates/workspace-CLAUDE.md.default` — the bundled default (renamed and content updated).

## Proposed Solution

**Flow change in `runNewCommand` (multi-repo branch):**

1. If `plan.isWorkspace && plan.workspacePath`:
   - Compute `tplPath = resolved.resolvedWorkspaceAgentsTemplate`.
   - If `tplPath` does not exist **and we're not in `--dry-run`**, ensure its parent directory and write the bundled default template to it (info-log: `installed default workspace template at <path>`).
   - Read, render, and write **two files** into the workspace:
     - `<workspace>/AGENTS.md` — rendered template content.
     - `<workspace>/CLAUDE.md` — the literal two-line file `# Agent instructions\n\n@AGENTS.md\n`.
2. Dry-run behavior: skip both the install and the writes (preview-only semantics), same as today for worktree creation.

**Config rename (breaking, v0.x):**
- `templates.workspaceClaudeMd` → `templates.workspaceAgentsMd`
- Default value: `~/.config/workit/templates/workspace-AGENTS.md`
- Zod schema: reject configs that still carry the old key with a clear error pointing to the new name (don't silently map — we want users to notice once so they can clean up any customized template).

**Bundled default template:**
- Rename `src/templates/workspace-CLAUDE.md.default` → `src/templates/workspace-AGENTS.md.default`.
- Update body to reference `AGENTS.md` inside subprojects (AGENTS.md is now the convention; sub-repos using only CLAUDE.md typically import AGENTS.md, and vice versa):
  ```
  {{#each projects}}
  - [`{{folder}}/`](./{{folder}}/AGENTS.md) — see its `AGENTS.md` for project-specific instructions.
  {{/each}}
  ```
- Embed the default content as a TS string constant (e.g. `src/templates/defaults.ts` exporting `WORKSPACE_AGENTS_MD_DEFAULT`) so the Bun-bundled binary can write it without relying on file-system lookups relative to the source tree.

## Technical Considerations

- **Template resolution in bundled binaries.** `workit` ships as a Bun single-file binary. Reading files relative to `import.meta.url` is fragile after bundling; embedding the default as a string literal (or using `import defaultTpl from './workspace-AGENTS.md.default' with { type: 'text' }` if Bun supports it in all target modes) is the safer option. The plan favors a string constant because it is trivially portable.
- **`ensureDir` before write.** `~/.config/workit/templates/` may not exist on first run. Use the existing `ensureDir` helper from `src/utils/fs.ts`.
- **No sub-repo writes.** We never touch a sub-project's own `CLAUDE.md`/`AGENTS.md`. Only the workspace folder gets files.
- **Idempotency.** If the user deletes `~/.config/workit/templates/workspace-AGENTS.md`, the next `new` re-installs the default. If they edit it, we respect their edits (existence check short-circuits install).
- **`@AGENTS.md` is Claude Code's import syntax.** Claude Code resolves `@<path>` inside `CLAUDE.md` (and other project-memory files) as a file import at session load. A `CLAUDE.md` consisting of a heading and `@AGENTS.md` is a standard idiom.

## System-Wide Impact

- **Interaction graph**: `runNewCommand` → (new) `ensureWorkspaceTemplate` → `pathExists` / `ensureDir` / `Bun.write` → `renderTemplate` → two `Bun.write` calls (AGENTS.md, CLAUDE.md) → `addWorktree` (unchanged) → `runSetupScripts` (unchanged) → `dispatchBackend` (unchanged). No new async races: template install is awaited before worktree creation, same ordering as today.
- **Error propagation**: Template-install write failures currently throw and abort `new` (Bun.write rejects on EACCES/ENOSPC). That's acceptable — the workspace is not yet created. Existing behavior for worktree-creation failures is unchanged.
- **State lifecycle risks**: If the user's template path is inside an unwritable dir, install fails before any worktree is created → no orphaned state. If AGENTS.md writes succeed but CLAUDE.md write fails (unlikely — same directory, created moments earlier), the workspace has AGENTS.md only and later worktree creation still proceeds. Acceptable; both writes are in the same `await Promise.all([...])` so a failure aborts cleanly.
- **API surface parity**: Only `runNewCommand` writes workspace-level agent files. No other command generates them. Nothing to keep in sync.
- **Integration test scenarios**:
  1. Fresh user: template path missing → `new` installs the default → AGENTS.md + CLAUDE.md written → CLAUDE.md contains `@AGENTS.md`.
  2. Returning user: custom template present → install is skipped, user's template is used verbatim.
  3. Dry-run with missing template: no install, no workspace writes.
  4. Config with legacy `workspaceClaudeMd` key: `loadConfig` throws a descriptive error naming the new key.

## Acceptance Criteria

- [ ] `src/core/config.ts` renames `templates.workspaceClaudeMd` → `templates.workspaceAgentsMd`; `DEFAULT_CONFIG` and `resolveConfigPaths` updated; `resolvedWorkspaceClaudeTemplate` → `resolvedWorkspaceAgentsTemplate`.
- [ ] Legacy `workspaceClaudeMd` key in config produces a Zod validation error that names the new key and the default path.
- [ ] `src/templates/workspace-CLAUDE.md.default` renamed to `src/templates/workspace-AGENTS.md.default` and its sub-repo links point to `AGENTS.md`.
- [ ] New `src/templates/defaults.ts` (or equivalent) exports `WORKSPACE_AGENTS_MD_DEFAULT` as a string constant mirroring the `.default` file.
- [ ] `src/commands/new.ts` multi-repo branch:
  - Ensures the template directory exists and installs `WORKSPACE_AGENTS_MD_DEFAULT` when the configured template path is missing (non-dry-run only); logs an info line.
  - Writes the rendered template to `<workspace>/AGENTS.md`.
  - Writes `<workspace>/CLAUDE.md` with body `# Agent instructions\n\n@AGENTS.md\n`.
  - No more `warn("skipping CLAUDE.md")` branch.
- [ ] `tests/integration/new.test.ts` `multi-project`: assert both `AGENTS.md` (with rendered content) and `CLAUDE.md` (containing `@AGENTS.md`) exist; update template-fixture filename/key.
- [ ] New test: `multi-project, missing user template → installs default` — config points at a path that does not exist; after `new`, that path contains the default template, and `AGENTS.md`/`CLAUDE.md` are written in the workspace.
- [ ] New test: `--dry-run` does not install the template or write workspace files.
- [ ] New test: `config.test.ts` rejects legacy `workspaceClaudeMd` key with a message naming `workspaceAgentsMd`.
- [ ] `README.md` — update the `Configuration` table and JSON example (`templates.workspaceAgentsMd`), and any prose that mentions `CLAUDE.md` in the context of the workspace-level file.
- [ ] All existing tests pass (`bun test`).

## Success Metrics

- A user running `workit new "demo"` against two projects on a fresh machine ends up with `<workspace>/AGENTS.md` and `<workspace>/CLAUDE.md` both populated, and `~/.config/workit/templates/workspace-AGENTS.md` installed — no manual setup, no warning lines.
- CI remains green.
- No regressions in single-repo `new`, `rm`, `ls`, `logs`, `config`.

## Dependencies & Risks

- **Breaking config change.** Existing users with `workspaceClaudeMd` in `~/.config/workit/config.json` will see an error on next run. Mitigation: clear error message with migration hint; call it out in the next release notes (release-please will pick up `feat!:`).
- **Orphaned user template.** If a user customized `~/.config/workit/templates/workspace-CLAUDE.md`, the new flow never reads it. They'll need to rename/port it to `workspace-AGENTS.md`. Mitigation: release note explaining the rename.
- **`@AGENTS.md` import semantics.** Claude Code's import of `@AGENTS.md` resolves relative to the CLAUDE.md that contains it. Because CLAUDE.md and AGENTS.md live side by side in the workspace root, resolution is straightforward.
- **Bundled-binary template access.** Using a string constant avoids FS-lookup risks in the Bun compiled binary — no change to the build pipeline required.
- **Low-impact scope.** The feature is additive + rename; no migrations, no cross-command coupling.

## Implementation Sketch (for `/ce:work`)

```
src/templates/defaults.ts                (new) export WORKSPACE_AGENTS_MD_DEFAULT
src/templates/workspace-AGENTS.md.default (rename from *-CLAUDE.md.default; update body)
src/core/config.ts                       rename key + resolved field
src/commands/new.ts                      install-if-missing, write AGENTS.md + CLAUDE.md
tests/integration/new.test.ts            update + 2 new cases
tests/unit/core/config.test.ts           legacy-key rejection case
README.md                                config table + JSON example
```

### `src/commands/new.ts` (pseudo-diff of the multi-repo branch)

```ts
if (plan.isWorkspace && plan.workspacePath) {
  await ensureDir(plan.workspacePath);
  const tplPath = resolved.resolvedWorkspaceAgentsTemplate;

  if (!(await pathExists(tplPath))) {
    await ensureDir(dirname(tplPath));
    await Bun.write(tplPath, WORKSPACE_AGENTS_MD_DEFAULT);
    info(`installed default workspace template at ${tplPath}`);
  }

  const tpl = await Bun.file(tplPath).text();
  const rendered = renderTemplate(tpl, { /* unchanged ctx */ });

  await Promise.all([
    Bun.write(join(plan.workspacePath, 'AGENTS.md'), rendered),
    Bun.write(join(plan.workspacePath, 'CLAUDE.md'), '# Agent instructions\n\n@AGENTS.md\n'),
  ]);
}
```

### `src/templates/workspace-AGENTS.md.default` (updated body)

```
# {{feature_title}} — Workspace

This is the workspace folder for developing the **{{feature_title}}** feature.

## Structure

The parent directory contains subdirectories, each of which is a separate git project
(repository) required to implement this feature. Each subdirectory is already set up as
a git worktree and is checked out on the relevant feature branch — do not create new
worktrees or switch branches inside them.

Current subprojects:

{{#each projects}}
- [`{{folder}}/`](./{{folder}}/AGENTS.md) — see its `AGENTS.md` for project-specific instructions.
{{/each}}

## Working in this workspace

When working inside a subdirectory, follow the instructions in that subdirectory's own
`AGENTS.md`. Those files are authoritative for their respective projects.
```

## Sources & References

- `src/commands/new.ts:88-108` — current skip-if-missing branch
- `src/core/config.ts:14-45, 74-83` — config schema / defaults / resolve
- `src/templates/render.ts` — the existing `{{var}}` / `{{#each}}` renderer (unchanged)
- `src/templates/workspace-CLAUDE.md.default` — template being renamed
- `tests/integration/new.test.ts:112-132` — `multi-project` test being extended
- Claude Code import syntax (`@<path>` inside CLAUDE.md) — used to alias AGENTS.md
- AGENTS.md emerging multi-agent convention (Codex, Cursor, Gemini)
