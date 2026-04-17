---
title: feat: Directory picker cursor memory and dot-dir support
type: feat
status: completed
date: 2026-04-17
origin: docs/brainstorms/2026-04-17-directory-picker-improvements-requirements.md
---

# feat: Directory picker cursor memory and dot-dir support

## Overview

Two UX improvements to the interactive directory picker: (1) the cursor highlight remembers "where we came from" on startup ascent and back-navigation, and (2) dot-directories are hidden by default, with a **user-configurable allowlist** at `directoryPicker.dotAllowlist` naming the dot-dirs that remain visible — default is `[".workit"]`. `.git` is excluded implicitly (it's a dot-dir and not on the allowlist); `node_modules` stays in the hardcoded `EXCLUDED` set. Spans `src/ui/directory-picker.ts`, `src/ui/prompts.ts`, `src/cli.ts`, and `src/core/config.ts` plus test updates.

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

### Dot-directory support (configurable allowlist)

Keep dot-dirs hidden by default. Keep the `isDotfile` helper. Add a new config field `directoryPicker.dotAllowlist: string[]` (zod schema, default `['.workit']`). Thread the allowlist from `Config` → `promptProjectPicker` → `directoryPicker` → `listDir` as a `Set<string>` parameter. Update the `listDir` filter to include an entry when it is a directory, not in `EXCLUDED`, and either not a dotfile or present in the passed-in allowlist. `.git` is excluded naturally as a dot-dir not on the allowlist, so `EXCLUDED` remains `{ 'node_modules' }`. Filtering-by-typing continues to work unchanged. Existing user configs without the new field continue to load because the zod schema supplies a default.

### Key design choices

- **Back-only memory, no per-directory map.** A single `cameFromBasename` field covers the user-visible pain. A full path→cursor map across a session is deferred; YAGNI per origin decision.
- **Allowlist over exclusion list for dot-dirs.** Safer default — `~` is full of dot-dirs that are either noise (`.cache`, `.Trash`) or sensitive (`.ssh`, `.aws`). Starting from "hidden by default, allow by name" scales as new legitimate dot-dirs appear. `.git` falls out for free without adding to `EXCLUDED`.
- **Allowlist configured via the config file, not hardcoded.** A one-field addition to `Config` (`directoryPicker.dotAllowlist`) lets users accommodate their own tree (e.g. `.dotfiles`, `.local/src`) without a code change. Namespaced under `directoryPicker` to leave room for future picker settings. Zod `.default()` preserves backward compatibility for existing config files.
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
- [ ] **R5**: Dot-dirs are hidden by default. The set of visible dot-dirs is driven by `config.directoryPicker.dotAllowlist` (default `['.workit']`). Allowlisted dot-dirs appear with identical styling to non-dot directories; git-repo dot-dirs show the `[x]`/`[ ]` checkbox and are selectable; plain dot-dirs are dimmed and navigable-only.
- [ ] **R6**: `.git` never appears in the listing at any level under a default config (dot-dir, not on allowlist). `node_modules` continues to be excluded via `EXCLUDED`.
- [ ] **R7**: Typing into the search filter matches allowlisted dot-dir names character-for-character — e.g. typing `.work` narrows to `.workit`.
- [ ] Config field `directoryPicker.dotAllowlist` round-trips through the schema: accepts default, accepts a custom array, accepts an empty array, and fills the default when the field is missing from the user's config file.

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

### Step 1 — Add config field `directoryPicker.dotAllowlist`

File: `src/core/config.ts`

- Add nested `directoryPicker` object to `ConfigSchema` with a zod `.default()` so the whole block — and its inner `dotAllowlist` array — fills in when missing.
- Mirror the same shape in `DEFAULT_CONFIG`.

```ts
// src/core/config.ts (excerpt)
directoryPicker: z
  .object({
    dotAllowlist: z.array(z.string().min(1)).default(['.workit']),
  })
  .default({ dotAllowlist: ['.workit'] }),
```

### Step 2 — Thread allowlist through picker

File: `src/ui/directory-picker.ts`

- Remove the module-level `DOT_ALLOWLIST` constant.
- Change `listDir(dir, cache)` → `listDir(dir, cache, dotAllowlist: Set<string>)` and use the parameter in the filter.
- Change `directoryPicker({ cwd })` → `directoryPicker({ cwd, dotAllowlist })`. Capture the set and pass it to each internal `listDir` call (startup, `navigateInto`, `navigateToParent`).

File: `src/ui/prompts.ts`

- `promptProjectPicker(cwd: string, config: Config)` — build `new Set(config.directoryPicker.dotAllowlist)` and pass it through.

File: `src/cli.ts`

- Update the one call site: `promptProjectPicker(process.cwd(), config)`.

### Step 3 — Add a pure cursor-resolution helper

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

### Step 4 — Apply cursor memory on startup ascent

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

entries = await listDir(cwd, gitCache, dotAllowlist);
filtered = entries;
cursor = resolveCursor(filtered, cameFromBasename);
```

Note: `basename` is already imported from `node:path`.

### Step 5 — Apply cursor memory on back-nav

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
  entries = await listDir(cwd, gitCache, dotAllowlist);
  filtered = entries;
  cursor = resolveCursor(filtered, cameFrom);
}
```

Leave `navigateInto` untouched — forward nav continues to reset cursor to 0.

### Step 6 — Update and add tests

File: `tests/unit/ui/directory-picker.test.ts`

- **Fixture change**: add `.workit/` (allowlisted), `.config/` (non-allowlisted), `.git/` (non-allowlisted) directly under `root`. Keep the existing `.hidden` dir as a second non-allowlisted case.
- **Replace** the old `"excludes dotfile directories"` test with:
   - `"includes allowlisted dot-directories (.workit)"` — asserts `.workit` is present under the default allowlist.
   - `"hides non-allowlisted dot-directories"` — asserts `.config` and `.hidden` are absent.
   - `"hides .git"` — asserts `.git` is absent (covered by the allowlist rule, not an explicit `EXCLUDED` entry).
- **Update** `"lists directories with git repo detection"` to expect `[".workit", "api", "frontend", "shared-libs"]`.
- **Pass** a `defaultAllowlist = new Set([".workit"])` to every `listDir` call in the fixture-driven tests.
- **Add** `"honors a custom allowlist"` — `listDir(root, cache, new Set([".config"]))` shows `.config` and hides `.workit`.
- **Add** `"hides all dot-dirs when allowlist is empty"` — `listDir(root, cache, new Set())` returns only the non-dot dirs.
- **Add** a `describe("resolveCursor")` block with four cases:
  - Name present → correct index.
  - Name missing → 0.
  - Empty entries list → 0.
  - `null` `cameFromName` → 0.
- **Config tests** (`tests/unit/core/config.test.ts`):
  - Default fills when `directoryPicker` is missing from input.
  - Custom allowlist round-trips.
  - Empty allowlist is accepted.
- **Fixture updates** for three existing tests that build `Config` literals (`tests/integration/new.test.ts`, `tests/integration/rm.test.ts`, `tests/unit/commands/ls.test.ts`) — add `directoryPicker: { dotAllowlist: [".workit"] }` to satisfy the schema output type.

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

### Step 7 — Manual verification

Before calling done, run:
- `bun run typecheck`
- `bun test`
- `bun run dev new` (or however the picker is entered) from inside a nested git repo to verify cursor placement on startup and after Left.
- Navigate into `~/.workit` to verify allowlisted dot-dir visibility; confirm non-allowlisted dot-dirs (e.g. `.cache`, `.ssh`) and `.git` do not appear.

## Dependencies & Risks

- **No new dependencies.** Change spans `src/ui/directory-picker.ts`, `src/ui/prompts.ts`, `src/cli.ts`, `src/core/config.ts`, and matching test files.
- **Risk: cursor index = `-1`.** Not a real risk here — `resolveCursor` never returns `-1`; falling back to `0` is defensive. The existing `-1` sentinel for the `..` row is only produced in the existing arrow-key handler and is untouched.
- **Risk: user sets a footgun allowlist.** Users who deliberately add `.git` or `.ssh` to their allowlist will see those directories. That is the explicit contract of a configurable value — documented in the config's key-decisions section of this plan and the origin brainstorm.
- **Risk: existing configs on disk lack `directoryPicker`.** Zod `.default()` fills the field on load, so legacy configs keep working without user action. The first subsequent `workit config` save (if any) will write the new field.

## System-Wide Impact (detail)

### Interaction graph

1. `workit new` — unchanged at the CLI level; internally now forwards `config` to `promptProjectPicker`.
2. `promptProjectPicker(cwd, config)` — signature grew by one parameter; the only caller is `src/cli.ts`.
3. `directoryPicker({ cwd, dotAllowlist })` — signature grew by one option; returned shape unchanged.
4. `listDir(dir, cache, dotAllowlist)` — signature grew by one parameter; all call sites updated.
5. Integration tests in `tests/integration/` don't exercise the interactive TTY path, but their `Config` literals were updated to include the new `directoryPicker` field so the schema output type validates.

### State lifecycle

`cameFromBasename` is a local variable inside a single `Promise` scope. Set once on ascent (or on parent-nav), consumed immediately by `resolveCursor`, reset to `null`. No persistence, no cross-session leakage.

### API surface parity

- `listDir(dir, cache, dotAllowlist)` — new required third parameter.
- `directoryPicker({ cwd, dotAllowlist })` — new required option on the options object.
- `promptProjectPicker(cwd, config)` — new required second parameter.
- `findContainingRepo` — unchanged.
- `abbreviatePath` — unchanged.
- `resolveCursor` — new export, pure.
- `ConfigSchema` / `Config` / `DEFAULT_CONFIG` — grew by one nested field `directoryPicker.dotAllowlist: string[]` with a zod default.

## Outstanding Questions

None. All product decisions resolved in origin brainstorm.

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-04-17-directory-picker-improvements-requirements.md](../brainstorms/2026-04-17-directory-picker-improvements-requirements.md) — Key carried-forward decisions: back-only cursor memory (no per-directory map); dot-dirs hidden by default, governed by a user-configurable allowlist at `directoryPicker.dotAllowlist` (default `[".workit"]`); no new hotkey/toggle; session-scoped cursor state only.

### Internal references

- `src/core/config.ts` — `ConfigSchema` + `DEFAULT_CONFIG` (target of Step 1).
- `src/ui/directory-picker.ts` — `EXCLUDED`, `isDotfile`, `listDir` filter, `directoryPicker` signature, internal `listDir` calls (targets of Steps 2, 4, 5).
- `src/ui/prompts.ts` — `promptProjectPicker` signature (target of Step 2).
- `src/cli.ts` — call site of `promptProjectPicker` (target of Step 2).
- Previous plan: [docs/plans/2026-04-16-001-feat-navigable-directory-picker-plan.md](2026-04-16-001-feat-navigable-directory-picker-plan.md) — context for the shipped picker.

### Related work

- Origin brainstorm (2026-04-16): [docs/brainstorms/2026-04-16-directory-picker-requirements.md](../brainstorms/2026-04-16-directory-picker-requirements.md)
