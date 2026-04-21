---
date: 2026-04-21
topic: workspace-detection-git-kind
---

# Workspace Detection by `.git` Kind

## Problem Frame
`ls` and `rm` classify each child of `workspacesDir` by the mere presence of a `.git` entry: present → single worktree, absent → descend and treat children as a multi-repo workspace. workit only ever creates worktrees inside `workspacesDir`, and `new` writes shared files (`AGENTS.md`, `CLAUDE.md`) at the workspace-folder level. If a user runs `git init` in a multi-repo workspace folder — a reasonable thing to do to track those shared files — the folder gains a real `.git` *directory* and is misclassified as a single worktree, silently breaking `rm` (and the `ls` tag) for that workspace.

## Requirements
- R1. A folder directly under `workspacesDir` is treated as a **single worktree** only when its `.git` entry exists and is a **file** (git worktree pointer). A `.git` *directory* (user-initialized repo) or no `.git` means the folder is treated as a **multi-repo workspace** and its children are scanned for worktrees.
- R2. `ls` reports the correct kind (`[worktree]` vs. `[workspace]`) for a multi-repo workspace folder even when the folder itself has been `git init`-ed.
- R3. `rm <slug>` correctly resolves and removes every worktree inside a multi-repo workspace folder even when the folder itself has been `git init`-ed, and still removes the workspace folder at the end as it does today.
- R4. Detection stays correct for the existing cases: a real single worktree (`.git` is a worktree pointer file) and a multi-repo workspace with no top-level `.git`.

## Success Criteria
- Reproducing the bug: creating a multi-repo workspace with `workit new`, running `git init` inside the workspace folder, then running `workit ls` and `workit rm <slug>` — both behave identically to the case without `git init`.
- Existing `ls`/`rm` behavior for single worktrees and untouched multi-repo workspaces is unchanged (covered by existing unit + integration tests).

## Scope Boundaries
- No marker/sentinel file is introduced in this change.
- No changes to `new`, config, or project discovery.
- No migration step — existing folders on disk work unchanged because workit-created worktrees always have `.git` as a pointer file.
- Not trying to detect or refuse user-initialized repos elsewhere in `workspacesDir`; only changing classification.

## Key Decisions
- **Detect by `.git` kind, not presence** (`stat().isFile()` vs. `.isDirectory()`): matches the real invariant that workit creates worktrees, requires no new on-disk state, and directly distinguishes the two observed cases.
- **Strictness = simple stat check**, no extra `git rev-parse` guard: `rm.ts` already validates the worktree via `git rev-parse --git-common-dir` in `resolveWorktreeTarget`, so a redundant pre-check would add cost without changing outcomes.
- **No marker file (option B/C rejected for now)**: adds migration burden and another on-disk artifact to solve a problem that kind-detection already solves. Revisit only if a second reason for a marker emerges.

## Dependencies / Assumptions
- Assumption: workit only creates worktrees inside `workspacesDir` (confirmed — `new` uses `git worktree add`), so a `.git` directory at the top level is always user-introduced, never workit-introduced.
- Assumption: git's worktree representation (`.git` as a file containing `gitdir: …`) is stable across supported git versions.

## Outstanding Questions

### Resolve Before Planning
_(none)_

### Deferred to Planning
- [Affects R1][Technical] Exact call sites to update — at minimum `src/commands/ls.ts:23` and `src/commands/rm.ts:51` (the `pathExists(join(full, '.git'))` checks). Consider extracting a small helper (e.g., `isWorktreePointer(path)`) in `src/utils/fs.ts` or `src/git/` so both commands share one definition.
- [Affects R2, R3][Technical] Test additions: a unit test per command covering the "workspace folder has its own `.git` directory" case, plus ensure existing tests still pass.

## Next Steps
→ `/ce:plan` for structured implementation planning
