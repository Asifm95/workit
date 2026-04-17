---
date: 2026-04-17
topic: directory-picker-improvements
---

# Directory Picker Improvements

## Problem Frame

Two small UX rough edges remain in the picker shipped via the 2026-04-16 brainstorm:

1. **Cursor loses context on navigation.** The cursor always resets to the top when the listing changes. On startup, when `cwd` is a git repo and we auto-ascend to its parent, the cursor lands on row 0 instead of on the repo we came from. On back navigation (`..` / Left / Backspace from empty search), the cursor lands on row 0 of the parent instead of on the child directory we just left. Users lose spatial orientation.
2. **Dot-directories are invisible.** The listing filters out any entry starting with `.`, so repos living under `.config`, `.workit`, `.dotfiles`, etc. are unreachable through the picker. The only workaround today is `--projects`.

## Requirements

- R1. On initial render, when startup logic ascends from a git-repo `cwd` to its parent, the cursor is placed on the entry that represents the original `cwd` (the repo we came from).
- R2. On back navigation to a parent (`..` entry, Left arrow, Backspace with empty search), the cursor is placed on the entry matching the basename of the directory we just left. If that entry is not present in the new listing (e.g. filtered out), the cursor falls back to row 0.
- R3. Forward navigation (Right arrow, Enter into a subdirectory) continues to place the cursor at row 0 of the new listing — no per-directory memory beyond the immediate back-navigation case.
- R4. Cursor memory is session-only. Nothing persists across picker invocations.
- R5. Dot-directories (names starting with `.`) are visible and navigable in the listing, using the same styling and selectability rules as non-dot directories (git repos selectable, non-git directories navigable-only).
- R6. `.git` is excluded from the listing at every level. `node_modules` remains excluded as today.
- R7. Dot-directories participate in the existing fuzzy-filter search the same way any other entry does.

## Success Criteria

- Launching the picker from inside a repo at `~/a/b` shows `~/a` with the cursor already on `b`.
- Pressing Left (or Backspace on empty search) inside `~/a/b` moves to `~/a` with the cursor on `b`.
- A repo at `~/.config/nvim` is discoverable by navigating into `~/.config` from `~`.
- `.git` never appears in the listing, even after the dot-dir change.

## Scope Boundaries

- No per-directory cursor memory on forward navigation or re-entry — only the immediate "came-from" case (R1, R2).
- No hidden/visible toggle hotkey for dot-dirs — they are simply always shown (minus `.git`).
- No new exclusion config or user-configurable ignore list. The exclusion set stays hardcoded (`node_modules`, `.git`).
- No changes to selection, search, multi-select, or `--projects` behavior.

## Key Decisions

- **Back-only cursor memory.** Covers the stated user pain (startup ascent + back navigation) without introducing a per-path cursor map or extra state. Forward navigation resetting to top is acceptable and matches common file-browser behavior.
- **Always-show dot-dirs, hardcoded `.git` exclusion.** `.git` is pure noise inside every repo and would never be a useful navigation target. A toggle hotkey adds UI surface for no real benefit given the picker is meant for finding repos, not general file browsing.
- **Match by basename, fall back on miss.** Simple, predictable rule. If the target entry vanished (filtered, permission changed), cursor falling to 0 is the obvious safe default.

## Dependencies / Assumptions

- Implementation is confined to `src/ui/directory-picker.ts`. No changes to config, discovery, or command layers.
- The existing `findContainingRepo` + parent-ascent logic on startup is preserved; only the cursor placement changes.
- Tests for the picker in `tests/` should be extended to cover cursor placement on startup and back navigation, and dot-dir visibility including `.git` exclusion.

## Outstanding Questions

None.

## Next Steps

→ `/ce:plan` for structured implementation planning
