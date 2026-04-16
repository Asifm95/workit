---
title: "feat: Navigable fzf-style directory picker"
type: feat
status: completed
date: 2026-04-16
origin: docs/brainstorms/2026-04-16-directory-picker-requirements.md
---

# feat: Navigable fzf-style directory picker

## Overview

Replace the flat `@clack/prompts` multiselect project picker with a custom fzf-style interactive directory browser built on `@clack/core`. The picker starts from cwd, lets users navigate the filesystem freely, fuzzy-filter directories by typing, toggle git repos for multi-select, and confirm selections -- all without pre-configured project roots.

## Problem Statement / Motivation

The current picker scans one level deep under configured `projectRoots` and presents a flat list. Repos nested deeper than one level are invisible, cwd pre-selection fails when the repo isn't discovered, and there's no way to browse or search. Users must configure `projectRoots` before the tool works at all. (see origin: `docs/brainstorms/2026-04-16-directory-picker-requirements.md`)

## Proposed Solution

Build a custom `DirectoryPicker` prompt class extending `@clack/core`'s base `Prompt`. The prompt manages its own state: current directory, search term, cursor position, selected paths, and `.git` detection cache. Navigation happens via keyboard (arrow keys to move cursor / enter directories, typing to fuzzy-filter, Tab to toggle selection, Enter to confirm). The `projectRoots` config field is removed entirely and `--projects` switches to accepting paths.

## Technical Approach

### Architecture

The new picker is a single custom prompt class (`src/ui/directory-picker.ts`) that extends `@clack/core`'s `Prompt`. It replaces `promptProjectPicker()` in `src/ui/prompts.ts`. The existing `@clack/prompts` functions for text, select, and confirm remain unchanged.

**State model:**

```
{
  cwd: string              // Current directory being listed
  entries: DirEntry[]      // Subdirectories of cwd (cached per cwd)
  filtered: DirEntry[]     // entries filtered by search term
  search: string           // Current fuzzy search input
  cursor: number           // Index into filtered list
  selected: Set<string>    // Absolute paths of toggled git repos
  preSelected: string[]    // Repos auto-selected on init (cwd's repo)
  gitCache: Map<string, boolean>  // path -> has .git (avoids re-checking)
}
```

**Key bindings:**

| Key | Action |
|-----|--------|
| Up/Down (or j/k) | Move cursor in filtered list |
| Right (or Enter on non-git dir) | Navigate into highlighted directory |
| Left (or Backspace when search empty) | Navigate to parent directory |
| Tab | Toggle selection on highlighted item (git repos only) |
| Enter | Confirm all selections and return |
| Typing | Append to search term, re-filter current directory |
| Backspace (when search non-empty) | Delete last char from search |
| Ctrl+C | Cancel and exit |

**Rendering:**

Each render frame shows:
```
  Select git repos (Tab to toggle, Enter to confirm)
  ~/Projects/work                          2 selected
  
  > search term_
  
    ..                                     (parent)
    api/                                   [x] git
    backend-service/                       [ ] git
    frontend/                                  dir
    shared-libs/                               dir
    tools/                                     dir
```

- Git repos: bright text + `[x]`/`[ ]` toggle indicator
- Non-git dirs: dimmed text + `dir` label (navigable only)
- Cursor line highlighted
- Header shows current path and selection count
- `..` entry always present (navigates to parent)

**Directory filtering defaults:**

Exclude from listing: `node_modules`, directories starting with `.` (dotfiles). These clutter navigation and can contain thousands of entries or nested `.git` dirs.

### Implementation Phases

#### Phase 1: Config schema cleanup

Remove `projectRoots` from the config schema and all consumers. Make existing configs forward-compatible.

**Files:**

- `src/core/config.ts` -- Remove `projectRoots` from `ConfigSchema` (line 8), `DEFAULT_CONFIG` (line 24), `resolveConfigPaths` return type and body (lines 63-73). Add `.passthrough()` to the Zod schema so existing config files with `projectRoots` don't fail validation.
- `src/core/project-discovery.ts` -- Remove `discoverProjects()`, `findProjectContaining()`, `loadProjectsCached()`, and the cache types. Keep only the `Project` interface (it's used throughout). Add a `isGitRepo(path)` helper if not already available elsewhere (check `src/git/repo.ts` -- it already has `isGitRepo`).
- `src/cli.ts` -- Remove imports of `discoverProjects`, `findProjectContaining` (lines 9-11). Remove `const all = await discoverProjects(...)` (line 40) and the debug `console.log` (line 41).

**Tests to update:**
- `tests/unit/core/config.test.ts` -- Remove "rejects empty projectRoots" test, update fixtures
- `tests/unit/core/project-discovery.test.ts` -- Remove or rewrite (most tests are for `discoverProjects`)
- `tests/integration/new.test.ts` -- Remove `projectRoots` from config fixtures
- `tests/integration/rm.test.ts` -- Remove `projectRoots` from config fixtures
- `tests/unit/commands/ls.test.ts` -- Remove `projectRoots` from config fixture

**Acceptance criteria:**
- [ ] `projectRoots` absent from schema, defaults, and `resolveConfigPaths`
- [ ] Existing config files with `projectRoots` key don't cause validation errors (passthrough)
- [ ] All tests pass with updated fixtures
- [ ] `discoverProjects` and related functions removed from `project-discovery.ts`
- [ ] `Project` interface remains exported for downstream use

#### Phase 2: Build the DirectoryPicker prompt

New file: `src/ui/directory-picker.ts`

Build a custom prompt class extending `@clack/core`'s `Prompt` that implements the fzf-style directory browser.

**Core implementation:**

1. **Constructor** -- Accept `{ message, cwd, preSelected? }`. Set initial state: list subdirs of cwd, detect `.git` for each, set cursor to 0.

2. **Directory listing** -- `async listDir(path)`: call `readdir(path, { withFileTypes: true })`, filter to directories, exclude `node_modules` and dotfiles, sort alphabetically. For each entry, check `.git` presence (async, cache results in `gitCache`). Return `DirEntry[]` where `DirEntry = { name, path, isGitRepo }`.

3. **Fuzzy filtering** -- Simple substring match on entry names against the search term. Consider using a lightweight fuzzy scorer (case-insensitive, match highlighting) but start with substring -- upgrade to fuzzy if it feels limiting.

4. **Key handling** -- Override or listen to `key` and `cursor` events:
   - Intercept Tab via `on('key', ...)` for multi-select toggle
   - Use cursor up/down for list navigation
   - Intercept right-arrow / Enter-on-non-git-dir for directory descent
   - Intercept left-arrow / Backspace-when-search-empty for parent navigation

5. **Pre-selection on init** -- Walk up from cwd checking for `.git` to find the containing repo (if any). Add its path to `selected` set. Show in the status line even if the repo root isn't in the current listing.

6. **Render function** -- Return a string with: header (message + current path + selection count), search input line, filtered directory list with cursor, selection indicators, and git/dir labels. Use `picocolors` for styling (already a dependency).

7. **Submit** -- On Enter, resolve the promise with `Array.from(selected)` as absolute paths. Return `Project[]` (map paths to `{ name: basename, path }`).

**Acceptance criteria:**
- [ ] `DirectoryPicker` class extends `@clack/core` Prompt
- [ ] Lists directories of cwd on init, excluding `node_modules` and dotfiles
- [ ] Arrow keys move cursor, Right/Enter descends into dirs, Left goes to parent
- [ ] Typing filters the list, Backspace removes chars
- [ ] Tab toggles selection on git repos only (no-op on non-git dirs)
- [ ] Enter confirms and returns selected `Project[]`
- [ ] Ctrl+C cancels (consistent with other clack prompts)
- [ ] Git repos visually distinct from non-git directories
- [ ] Pre-selects containing repo when cwd is inside one
- [ ] `.git` checks are cached per path

#### Phase 3: Wire up the picker in cli.ts and commands

Replace the old project picker flow with the new `DirectoryPicker`.

**Files:**

- `src/ui/prompts.ts` -- Replace `promptProjectPicker()` implementation. New signature: `promptProjectPicker(cwd: string): Promise<Project[]>`. Internally instantiates `DirectoryPicker` and runs it.

- `src/cli.ts` -- Simplify the `new` command handler:
  ```
  // Before (remove):
  const all = await discoverProjects(resolved.resolvedProjectRoots);
  const pre = findProjectContaining(all, process.cwd());
  const picked = await promptProjectPicker(all, pre ? [pre] : []);
  
  // After:
  const picked = await promptProjectPicker(process.cwd());
  ```

- `src/commands/new.ts` -- Change `runNewCommand` to accept `projectPaths: string[]` instead of `projectNames: string[]`. Remove the `discoverProjects` call (line 49) and name-matching loop (lines 50-55). Build `Project[]` directly from the paths: `{ name: basename(path), path }`. Update `RunNewArgs` interface.

- `src/cli.ts` (--projects flag path) -- Change `--projects` to accept paths (relative or absolute). Resolve relative paths against cwd. Pass as `projectPaths` to `runNewCommand`.

**Acceptance criteria:**
- [ ] `workit new` opens the directory picker at cwd
- [ ] Selected repos flow through to worktree creation correctly
- [ ] `--projects ./api,~/Projects/web` works (paths, not names)
- [ ] Pre-selection works when running from inside a git repo
- [ ] Integration test for the full `new` command flow passes

#### Phase 4: Fix rm command's project resolution

Make `resolveWorktreeTarget` self-sufficient using `git rev-parse --git-common-dir` without needing a project list.

**Files:**

- `src/commands/rm.ts`:
  - `resolveWorktreeTarget(path, projects)` -> `resolveWorktreeTarget(path)`. Remove the `projects` parameter.
  - Instead of matching `mainRepo` against the projects list (lines 48-54), synthesize a `Project` directly: `{ name: basename(mainRepoReal), path: mainRepoReal }`.
  - Remove the `discoverProjects` call in `runRmCommand` (line 98).
  - Update `loadEntries` to not require a projects list.

**Acceptance criteria:**
- [ ] `workit rm` works without `projectRoots` in config
- [ ] `resolveWorktreeTarget` derives the parent project from git metadata alone
- [ ] `loadEntries` no longer requires a pre-discovered project list
- [ ] Integration test for rm passes

#### Phase 5: Tests

- [ ] **Unit tests for DirectoryPicker** (`tests/unit/ui/directory-picker.test.ts`): Test against a temp directory tree with mixed git/non-git dirs. Verify listing, filtering, `.git` detection, `node_modules` exclusion, dotfile exclusion.
- [ ] **Unit tests for updated config** (`tests/unit/core/config.test.ts`): Verify schema accepts configs without `projectRoots`, and configs with `projectRoots` (passthrough) don't error.
- [ ] **Unit tests for rm resolution** (`tests/unit/commands/rm.test.ts` or update existing): Verify `resolveWorktreeTarget` works with git-based resolution only.
- [ ] **Integration test for new command** (`tests/integration/new.test.ts`): Update to pass `projectPaths` instead of `projectNames`.
- [ ] **Integration test for rm command** (`tests/integration/rm.test.ts`): Update config fixtures, verify end-to-end rm without `projectRoots`.

## System-Wide Impact

- **Config migration**: Existing `config.json` files may contain `projectRoots`. Using Zod `.passthrough()` ensures they don't fail validation. The field is simply ignored.
- **`--projects` flag contract change**: Breaking change -- now accepts paths instead of names. Users with scripts using `--projects api,web` need to update to `--projects ./api,./web`. This is acceptable for a v0.x tool.
- **`Project` interface unchanged**: `{ name: string, path: string }` continues to flow through `plan.ts`, terminal backends, setup scripts. No downstream changes needed.

## Acceptance Criteria

- [ ] Directory picker opens at cwd with fzf-style interaction (R1, R2)
- [ ] Can navigate into subdirectories and back to parent (R3)
- [ ] Typing fuzzy-filters the current directory listing (R4)
- [ ] Only git repos are selectable; non-git dirs are navigable but dimmed (R5)
- [ ] cwd's containing repo is pre-selected on init (R6)
- [ ] Multi-select via Tab toggle, confirm all with Enter (R7)
- [ ] `projectRoots` removed from config schema (R8)
- [ ] `--projects` flag works with paths (R9)
- [ ] `workit rm` works without `projectRoots`
- [ ] All existing tests updated and passing
- [ ] `node_modules` and dotfile directories excluded from listing

## Dependencies & Risks

- **`@clack/core` internals**: The Prompt class API is not as well-documented as `@clack/prompts`. Key handling (especially Tab interception) may need experimentation. Mitigation: build a minimal PoC of the key handling first.
- **Async .git detection**: Checking `.git` for every listed directory on each navigation action could lag on slow filesystems. Mitigation: cache results in a `Map`, check async with a loading state if needed.
- **Breaking `--projects` flag**: Scripts using bare names will break. Mitigation: acceptable for v0.x; document in changelog.

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-04-16-directory-picker-requirements.md](docs/brainstorms/2026-04-16-directory-picker-requirements.md) -- Key decisions: fzf-style over tree browser, multi-select via Tab toggle, remove projectRoots entirely, @clack/core as foundation.

### Internal References

- Config schema: `src/core/config.ts:6-18`
- Current picker: `src/ui/prompts.ts:44-62`
- Project discovery (to be removed): `src/core/project-discovery.ts:25-41`
- rm worktree resolution: `src/commands/rm.ts:34-63`
- new command orchestration: `src/cli.ts:36-78`
- Existing isGitRepo: `src/git/repo.ts`
- @clack/core Prompt base class: `node_modules/@clack/core/dist/index.mjs`
