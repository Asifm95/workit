---
title: feat: Directory picker cursor memory and dot-dir support
type: feat
status: completed
date: 2026-04-17
origin: docs/brainstorms/2026-04-17-directory-picker-improvements-requirements.md
---

# feat: Directory picker cursor memory and dot-dir support

## Overview

Two small UX improvements to the interactive directory picker shipped in `src/ui/directory-picker.ts`: (1) the cursor highlight remembers "where we came from" on startup ascent and back-navigation, and (2) dot-directories are hidden by default, with an allowlist naming the dot-dirs that remain visible — `.workit` is the initial member. `.git` is excluded implicitly (it's a dot-dir and not on the allowlist); `node_modules` stays in the existing `EXCLUDED` set. Single-file implementation plus test updates. No config, command-layer, or discovery changes.

## Problem Statement / Motivation

Shipped in the 2026-04-16 picker rewrite, two rough edges remain (see origin: `docs/brainstorms/2026-04-17-directory-picker-improvements-requirements.md`):

1. **Cursor loses spatial context.** On startup, when `cwd` is a git repo and the picker auto-ascends to its parent (`src/ui/directory-picker.ts:88-94`), the cursor lands on row 0 instead of the repo we started in. On back-navigation via Left/Backspace/`..`, the cursor lands on row 0 of the parent instead of the child just left. Users lose orientation when navigating up the tree.

2. **Dot-directories are unreachable.** `listDir` filters out any entry starting with `.` (`src/ui/directory-picker.ts:44`), so repos living under `.workit` (workit's own workspace root) can't be discovered through the picker. The only workaround is the non-interactive `--projects` flag. Unconditionally showing every dot-dir would flood the listing with noise (`.cache`, `.Trash`, `.npm`) and sensitive paths (`.ssh`, `.aws`), so we introduce an allowlist instead.

## Proposed Solution

### Cursor memory

Introduce **back-only cursor memory**. When a listing is loaded following either (a) the startup auto-ascent, or (b) a `navigateToParent()` call, resolve the initial cursor by name-matching the "came-from" basename against `filtered[]`. If there's no match (shouldn't normally happen, but defensive for filters/permission edge cases), fall back to 0. Forward navigation (`navigateInto`, Right/Enter) keeps today's "reset to 0" behavior.

Two minimal changes inside the existing closure:

- Capture `cameFromBasename: string | null` as a scoped variable passed to the entry-loading step on startup and on parent-nav only.
- Extract a tiny pure helper `resolveCursor(entries, cameFromName)` returning the index or 0. Export it from the module so it can be unit-tested without a TTY.

### Dot-directory support (allowlist)

Keep dot-dirs hidden by default. Keep the `isDotfile` helper. Introduce a new hardcoded `DOT_ALLOWLIST = new Set(['.workit'])`. Update the `listDir` filter to include an entry when it is a directory, not in `EXCLUDED`, and either not a dotfile or present in `DOT_ALLOWLIST`. `.git` is excluded naturally as a dot-dir not on the allowlist, so `EXCLUDED` remains `{ 'node_modules' }`. Filtering-by-typing continues to work unchanged — the allowlist only affects what ends up in `entries[]`.

### Key design choices

- **Back-only memory, no per-directory map.** A single `cameFromBasename` field covers the user-visible pain. A full path→cursor map across a session is deferred; YAGNI per origin decision.
- **Allowlist over exclusion list for dot-dirs.** Safer default — `~` is full of dot-dirs that are either noise (`.cache`, `.Trash`) or sensitive (`.ssh`, `.aws`). Starting from "hidden by default, allow by name" scales as new legitimate dot-dirs appear. `.git` falls out for free without adding to `EXCLUDED`.
- **Pure helper extraction.** Pulling cursor resolution into a small exported function is the cheapest way to get real test coverage for the new logic without building a TTY-driving harness.

## Technical Considerations

### Cursor semantics recap

The existing loop uses integer `cursor` where `-1` represents the `..` parent row and `0..filtered.length - 1` are real entries. Cursor memory should only set non-negative values — the `..` row is never a back-nav target. `Math.min(cursor, Math.max(0, filtered.length - 1))` guards in `applyFilter` stay untouched.

### Entry-loading call sites

Three places load entries today:
- Initial load at `src/ui/directory-picker.ts:96-97` — set cursor to index of `basename(containingRepo)` when we auto-ascended.
- `navigateInto` at `src/ui/directory-picker.ts:187-193` — keep `cursor = 0` (forward nav).
- `navigateToParent` at `src/ui/directory-picker.ts:195-203` — set cursor to index of the basename we just left.

No need to touch the search-filter path (`applyFilter`) — cursor memory is a one-shot placement on listing change, not a recomputation during filtering.

### Back-nav basename source

The basename to match is `basename(cwdBeforeAscent)`, captured **before** reassigning `cwd = parent`. Use `node:path` `basename` (already imported).

## System-Wide Impact

- **Interaction graph**: `directoryPicker()` is called from `src/commands/new.ts` (per origin 2026-04-16 plan) when no `--projects` flag is given. The return type and signature are unchanged; only internal cursor placement and listing contents change.
- **Error propagation**: None. No new I/O paths. `listDir` continues to swallow `readdir` errors as `[]`. Cursor helper is pure.
- **State lifecycle risks**: None. `cameFromBasename` is a closure-local variable, lifecycle bounded by a single picker session.
- **API surface parity**: `listDir`, `findContainingRepo`, `abbreviatePath` keep their signatures. New export `resolveCursor` is additive.
- **Integration test scenarios**: Manual verification covers the TTY-interactive paths; automated coverage is at the helper level.

## Acceptance Criteria

### Functional (maps 1:1 to origin requirements)

- [ ] **R1**: Launching the picker with `cwd = ~/a/b` where `~/a/b` is a git repo renders `~/a` with the cursor on the `b` entry (not on the `..` row, not on row 0 if `b` isn't first alphabetically).
- [ ] **R2**: From `~/a/b`, pressing Left (or Backspace with empty search, or Enter on the `..` row if `..` is ever made selectable — it isn't today) navigates to `~/a` with the cursor on `b`. If `b` is not present in the new listing, cursor falls back to 0.
- [ ] **R3**: Pressing Right (or Enter on a directory entry) into any subdirectory continues to place cursor at 0 of the new listing. No memory.
- [ ] **R4**: Cursor memory lives only inside the closure of a single `directoryPicker()` call; it does not persist across invocations.
- [ ] **R5**: Dot-dirs are hidden by default. Allowlisted dot-dirs (`.workit` initially) appear in the listing with identical styling to non-dot directories. Git-repo dot-dirs show the `[x]`/`[ ]` checkbox and are selectable; plain dot-dirs are dimmed and navigable-only, matching the existing rule.
- [ ] **R6**: `.git` never appears in the listing at any level (as a consequence of the allowlist rule). `node_modules` continues to be excluded via `EXCLUDED`.
- [ ] **R7**: Typing into the search filter matches allowlisted dot-dir names character-for-character — e.g. typing `.work` narrows to `.workit`.

### Non-functional

- [ ] No new dependencies.
- [ ] `bun run typecheck` passes.
- [ ] `bun test` passes, including updated picker tests.
- [ ] No visible regressions in the existing picker behavior (selection, multi-select, search, navigation keys).

### Quality gates

- [ ] Existing test `excludes dotfile directories` is replaced by two tests: `includes allowlisted dot-directories (.workit)` and `hides non-allowlisted dot-directories`.
- [ ] New test asserts `.git` is excluded from `listDir` output when present as a direct child.
- [ ] New unit tests for `resolveCursor` cover: name present → correct index; name missing → 0; empty list → 0; `null` came-from → 0.
- [ ] Manual smoke test against a real repo tree:
   - [ ] Start picker from inside a nested git repo → cursor on repo name in parent listing.
   - [ ] Left into parent of parent → cursor on the directory we left.
   - [ ] Right into a subdir → cursor on row 0.
   - [ ] Navigate into `~/.workit` → listing renders, workit workspace repos visible.
- [ ] Verify `~` listing does not expose `.cache`, `.ssh`, `.Trash`, etc.

## Implementation Plan

Implementation is a single focused pass. Below is the step-by-step.

### Step 1 — Introduce `DOT_ALLOWLIST` and update `listDir` filter

File: `src/ui/directory-picker.ts`

- Keep `EXCLUDED = new Set(['node_modules'])` as-is.
- Add `const DOT_ALLOWLIST = new Set(['.workit']);`
- Keep the `isDotfile` helper.
- Update the `listDir` filter so dot-dirs are hidden unless allowlisted.

```ts
// src/ui/directory-picker.ts (excerpt — illustrative)
const EXCLUDED = new Set(['node_modules']);
const DOT_ALLOWLIST = new Set(['.workit']);

function isDotfile(name: string): boolean {
  return name.startsWith('.');
}

export async function listDir(dir: string, cache: Map<string, boolean>): Promise<DirEntry[]> {
  try {
    const raw = await readdir(dir, { withFileTypes: true });
    const dirs = raw
      .filter(
        (e) =>
          e.isDirectory() &&
          !EXCLUDED.has(e.name) &&
          (!isDotfile(e.name) || DOT_ALLOWLIST.has(e.name)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    // ...rest unchanged
  } catch {
    return [];
  }
}
```

### Step 2 — Add a pure cursor-resolution helper

File: `src/ui/directory-picker.ts`

Add an exported helper near `abbreviatePath`:

```ts
// src/ui/directory-picker.ts (new export)
export function resolveCursor(entries: DirEntry[], cameFromName: string | null): number {
  if (!cameFromName) return 0;
  const idx = entries.findIndex((e) => e.name === cameFromName);
  return idx >= 0 ? idx : 0;
}
```

Rationale: keeps cursor placement logic testable without mocking stdin/stdout. Pure, side-effect-free.

### Step 3 — Apply cursor memory on startup ascent

File: `src/ui/directory-picker.ts`

Inside `directoryPicker()`, update the startup block:

```ts
// src/ui/directory-picker.ts (excerpt)
let cameFromBasename: string | null = null;

const containingRepo = await findContainingRepo(cwd, gitCache);
if (containingRepo) {
  selected.add(containingRepo);
  const parent = dirname(containingRepo);
  if (parent !== containingRepo) {
    cameFromBasename = basename(containingRepo);
    cwd = parent;
  }
}

entries = await listDir(cwd, gitCache);
filtered = entries;
cursor = resolveCursor(filtered, cameFromBasename);
cameFromBasename = null; // consume
```

Note: `basename` is already imported from `node:path`.

### Step 4 — Apply cursor memory on back-nav

File: `src/ui/directory-picker.ts`

Update `navigateToParent` to capture the basename before reassigning `cwd`:

```ts
// src/ui/directory-picker.ts
async function navigateToParent() {
  const parent = dirname(cwd);
  if (parent === cwd) return;
  const cameFrom = basename(cwd);
  cwd = parent;
  search = '';
  entries = await listDir(cwd, gitCache);
  filtered = entries;
  cursor = resolveCursor(filtered, cameFrom);
}
```

Leave `navigateInto` untouched — forward nav continues to reset cursor to 0.

### Step 5 — Update and add tests

File: `tests/unit/ui/directory-picker.test.ts`

- **Fixture change**: add `.workit/` (allowlisted), `.config/` (non-allowlisted), `.git/` (non-allowlisted) directly under `root`. Keep the existing `.hidden` dir as a second non-allowlisted case.
- **Replace** the old `"excludes dotfile directories"` test with:
   - `"includes allowlisted dot-directories (.workit)"` — asserts `.workit` is present.
   - `"hides non-allowlisted dot-directories"` — asserts `.config` and `.hidden` are absent.
   - `"hides .git"` — asserts `.git` is absent (covered by the allowlist rule, not an explicit `EXCLUDED` entry).
- **Update** `"lists directories with git repo detection"` to expect `[".workit", "api", "frontend", "shared-libs"]`.
- **Add** a `describe("resolveCursor")` block with four cases:
  - Name present → correct index.
  - Name missing → 0.
  - Empty entries list → 0.
  - `null` `cameFromName` → 0.

```ts
// tests/unit/ui/directory-picker.test.ts (excerpt — new cases)
import { listDir, resolveCursor } from "../../../src/ui/directory-picker";

describe("resolveCursor", () => {
  const entries = [
    { name: "api", path: "/x/api", isGitRepo: true },
    { name: "frontend", path: "/x/frontend", isGitRepo: true },
    { name: "shared-libs", path: "/x/shared-libs", isGitRepo: false },
  ];

  test("returns index of matching name", () => {
    expect(resolveCursor(entries, "frontend")).toBe(1);
  });
  test("falls back to 0 when name is missing", () => {
    expect(resolveCursor(entries, "ghost")).toBe(0);
  });
  test("returns 0 for null came-from", () => {
    expect(resolveCursor(entries, null)).toBe(0);
  });
  test("returns 0 for empty list", () => {
    expect(resolveCursor([], "anything")).toBe(0);
  });
});
```

### Step 6 — Manual verification

Before calling done, run:
- `bun run typecheck`
- `bun test`
- `bun run dev new` (or however the picker is entered) from inside a nested git repo to verify cursor placement on startup and after Left.
- Navigate into `~/.workit` to verify allowlisted dot-dir visibility; confirm non-allowlisted dot-dirs (e.g. `.cache`, `.ssh`) and `.git` do not appear.

## Dependencies & Risks

- **No new dependencies.** Change is confined to logic inside `src/ui/directory-picker.ts` + its test file.
- **Risk: cursor index = `-1`.** Not a real risk here — `resolveCursor` never returns `-1`; falling back to `0` is defensive. The existing `-1` sentinel for the `..` row is only produced in the existing arrow-key handler and is untouched.
- **Risk: allowlist too restrictive.** If users have other legitimate dot-dirs containing repos (uncommon for this tool), they won't appear until the allowlist is extended. Mitigation: extending the allowlist is a one-line code change and can be surfaced as a follow-up if real use cases appear.
- **Risk: the existing test suite depended on the old dotfile-exclusion behavior.** Only the one test at `tests/unit/ui/directory-picker.test.ts:46-49` is affected. No other tests reference dotfile filtering.

## System-Wide Impact (detail)

### Interaction graph

1. `workit new` (or whatever invokes the picker) — unchanged.
2. `directoryPicker({ cwd })` — internal behavior changes; return value unchanged.
3. Tests in `tests/integration/new.test.ts` don't exercise the interactive TTY path, so they are not affected.

### State lifecycle

`cameFromBasename` is a local variable inside a single `Promise` scope. Set once on ascent (or on parent-nav), consumed immediately by `resolveCursor`, reset to `null`. No persistence, no cross-session leakage.

### API surface parity

- `listDir` — signature unchanged, exclusion set grows by one (`.git`) and the dot-dir filter is removed.
- `findContainingRepo` — unchanged.
- `abbreviatePath` — unchanged.
- `resolveCursor` — new export, pure.

## Outstanding Questions

None. All product decisions resolved in origin brainstorm.

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-04-17-directory-picker-improvements-requirements.md](../brainstorms/2026-04-17-directory-picker-improvements-requirements.md) — Key carried-forward decisions: back-only cursor memory (no per-directory map); dot-dirs hidden by default with a hardcoded allowlist (`.workit`); no new hotkey/toggle; session-scoped state only.

### Internal references

- `src/ui/directory-picker.ts:15-20` — `EXCLUDED` + `DOT_ALLOWLIST` + `isDotfile` helper (target of Step 1).
- `src/ui/directory-picker.ts:44-51` — filter line in `listDir` (target of Step 1).
- `src/ui/directory-picker.ts:88-97` — startup ascent + initial listing (target of Step 3).
- `src/ui/directory-picker.ts:195-203` — `navigateToParent` (target of Step 4).
- `tests/unit/ui/directory-picker.test.ts:46-49` — dotfile-exclusion test (to be inverted in Step 5).
- Previous plan: [docs/plans/2026-04-16-001-feat-navigable-directory-picker-plan.md](2026-04-16-001-feat-navigable-directory-picker-plan.md) — context for the shipped picker.

### Related work

- Origin brainstorm (2026-04-16): [docs/brainstorms/2026-04-16-directory-picker-requirements.md](../brainstorms/2026-04-16-directory-picker-requirements.md)
