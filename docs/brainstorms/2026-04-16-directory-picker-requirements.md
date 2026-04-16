---
date: 2026-04-16
topic: directory-picker
---

# Navigable Directory Picker

## Problem Frame

The current project picker scans one level deep under configured `projectRoots` and presents a flat multiselect list. This means repos nested more than one level deep (e.g. `~/Projects/work/backend-api`) are invisible, the picker can't find them, and pre-selection of cwd fails when the current repo isn't discovered. Users have no way to browse, search, or navigate to arbitrary directories.

## Requirements

- R1. Replace the flat multiselect project picker with an fzf-style interactive directory browser
- R2. The picker starts from the current working directory by default
- R3. Users can navigate forward into subdirectories and backward to parent directories
- R4. Users can fuzzy-search/filter the visible directory list by typing
- R5. Only directories containing `.git` are selectable (i.e. can be confirmed as a pick); all directories remain visible and navigable
- R6. If cwd is itself a git repo, it should be highlighted/pre-selected on init
- R7. Multi-select within a single picker session (fzf --multi style): users toggle selections with a key (e.g. Tab), then confirm all at once with Enter
- R8. Remove `projectRoots` from the config schema entirely -- the picker navigates freely from cwd
- R9. The `--projects` flag continues to work as a non-interactive escape hatch for scripting/CI

## Success Criteria

- Users can discover and select any git repo on their filesystem without prior configuration
- Navigating to a repo 3+ levels deep from cwd feels fast and intuitive (comparable to fzf)
- Pre-selection of cwd works reliably when cwd is a git repo
- Existing `--projects` flag workflows are unaffected

## Scope Boundaries

- No tree/hierarchy visualization needed -- a flat filtered list (like fzf) is sufficient
- No persistent "favorites" or "recent" list in this iteration
- No changes to `workit ls` or `workit rm` in this scope
- Project discovery caching is removed along with `projectRoots`

## Key Decisions

- **fzf-style over tree browser**: A flat filterable list with parent/child navigation is simpler and faster than a visual tree. Users type to narrow, arrow keys to navigate levels.
- **fzf --multi style multi-select**: Tab to toggle repos on/off while navigating, Enter to confirm all selections. Familiar UX, fewer steps than a single-select loop.
- **Remove projectRoots entirely**: The free-navigation model makes pre-configured scan roots unnecessary. One less thing to configure, and the picker works immediately without setup.
- **Git-only selection, all-directory navigation**: Users see the full directory structure for orientation but can only commit a selection on actual git repos. Non-git directories are navigable but not selectable.

## Outstanding Questions

### Deferred to Planning

- [Affects R5][Technical] How to efficiently detect `.git` presence during navigation without blocking the UI on slow filesystems or very large directories?

### Resolved During Planning

- [Affects R1] TUI approach: Build a custom prompt by extending `@clack/core`'s base Prompt class. Zero new dependencies (already in the dep tree via @clack/prompts). Provides raw mode, keystroke capture, render diffing, cancel handling. Alternatives evaluated: OpenTUI (overkill + Zig dep), shelling to fzf (requires fzf installed), @inquirer/search (single-select only), raw terminal mode (more plumbing for no benefit).
- [Affects R8] projectRoots dependency map: config.ts, cli.ts, commands/new.ts, commands/rm.ts, plus 5 test files. Full map documented in plan.

## Next Steps

-> `/ce:plan` for structured implementation planning
