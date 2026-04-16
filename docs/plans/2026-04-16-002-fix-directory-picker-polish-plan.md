---
title: "fix: Directory picker title shift, backspace nav, and proceed summary"
type: fix
status: active
date: 2026-04-16
origin: docs/brainstorms/2026-04-16-directory-picker-requirements.md
---

# fix: Directory picker title shift, backspace nav, and proceed summary

Three polish issues with the directory picker and `workit new` flow.

## Issue 1: Title shifts right after input

The "Select git repos" title drifts rightward after any keypress because the render cycle moves the cursor up N lines (`\x1B[${prevLineCount}A\x1B[J`) without resetting the column to 0. After a keypress in raw mode the cursor column may not be at 0, so the erase-from-cursor and subsequent write start at an offset.

**Fix in `src/ui/directory-picker.ts`:**

Add `\x1B[G` (cursor to column 0) between the move-up and erase sequences at line 104:

```typescript
// Before
stdout.write(`\x1B[${prevLineCount}A\x1B[J`);

// After
stdout.write(`\x1B[${prevLineCount}A\x1B[G\x1B[J`);
```

Single-line change. First render (`prevLineCount === 0`) skips the block entirely so no special case needed.

## Issue 2: Disable backspace for directory navigation

Backspace currently navigates to the parent directory when the search string is empty (`src/ui/directory-picker.ts:273-274`). The left arrow already handles parent navigation (`src/ui/directory-picker.ts:260-265`). Backspace should only delete search characters.

**Fix in `src/ui/directory-picker.ts`:**

Remove the `else { await navigateToParent(); }` branch from the backspace handler. Add an early return when search is empty to avoid a no-op render:

```typescript
// Before
if (key.name === 'backspace') {
  if (search.length > 0) {
    search = search.slice(0, -1);
    applyFilter();
  } else {
    await navigateToParent();
  }
  render();
  return;
}

// After
if (key.name === 'backspace') {
  if (search.length > 0) {
    search = search.slice(0, -1);
    applyFilter();
    render();
  }
  return;
}
```

**Update help text** at line 153 — change `←/ backward` to `← parent` since left arrow is now the only backward navigation:

```typescript
// Before
lines.push(pc.dim('  ↑↓ navigate · →/ forward  · ←/ backward · Tab select · Enter confirm'));

// After
lines.push(pc.dim('  ↑↓ navigate · → enter dir · ← parent · Tab select · Enter confirm'));
```

Note: left arrow is gated on `search.length === 0`, so users must clear their filter before navigating up. This is intentional — mixing filter state with directory navigation would be surprising.

## Issue 3: Show summary before "Proceed?" confirmation

Currently the user confirms blind — the plan summary (branch, worktree paths, workspace folder) only appears inside `runNewCommand` after confirmation. The fix moves plan building and validation before the confirmation prompt.

**Refactor `src/commands/new.ts`:**

Extract a `prepareNewPlan` function that builds the plan and runs validation (repo existence, branch conflicts, target path conflicts). This function returns the validated plan or throws.

```typescript
// src/commands/new.ts — new export
export async function prepareNewPlan(args: RunNewArgs): Promise<NewPlan> {
  const resolved = resolveConfigPaths(args.config);
  const slug = slugify(args.description);
  const matched: Project[] = args.projectPaths.map((p) => ({
    name: basename(p),
    path: p,
  }));
  const plan = buildNewPlan({
    description: args.description,
    slug,
    branchType: args.branchType,
    projects: matched,
    workspacesDir: resolved.resolvedWorkspacesDir,
  });

  // Validate
  for (const t of plan.targets) {
    if (!(await isGitRepo(t.project.path))) {
      throw new Error(`${t.project.name} is not a git repo at ${t.project.path}`);
    }
    if (await pathExists(t.targetPath)) {
      throw new Error(`Target already exists: ${t.targetPath}`);
    }
    if (await branchExists(t.project.path, t.branch)) {
      throw new Error(`Branch ${t.branch} already exists in ${t.project.name}`);
    }
  }

  return plan;
}
```

Then `runNewCommand` accepts an optional `plan` and skips rebuilding/revalidation if provided. Remove the `info(formatNewPlan(plan))` from `runNewCommand` since the caller shows it.

**Update `src/cli.ts`:**

Between the project picker and the confirm prompt, call `prepareNewPlan`, display the formatted plan, then confirm:

```typescript
import { prepareNewPlan } from './commands/new';
import { formatNewPlan } from './core/plan';

// After collecting projectPaths...
const plan = await prepareNewPlan({ config, description: desc, branchType, projectPaths, ... });
info('\n' + formatNewPlan(plan));

if (!opts.yes && !opts.dryRun) {
  const go = await promptConfirm('Proceed?', true);
  if (!go) return;
}

if (opts.dryRun) return; // Plan already shown, no need to enter runNewCommand

await runNewCommand({ ..., plan }); // Pass pre-built plan
```

This means:
- Validation errors surface **before** the user is asked to confirm
- `--dry-run` shows the plan and exits without entering `runNewCommand`
- No duplicate plan display

## Acceptance Criteria

- [ ] Title "Select git repos" stays left-aligned after typing filter characters
- [ ] Backspace only deletes search characters, never navigates to parent
- [ ] Help text shows `← parent` instead of `←/ backward`
- [ ] "Proceed?" prompt shows the full plan summary (description, branch, worktree paths)
- [ ] Validation errors (branch exists, path exists) appear before the confirm prompt
- [ ] `--dry-run` prints the plan once and exits
- [ ] `--yes` skips confirmation but still shows the plan summary

## Sources

- **Origin document:** [docs/brainstorms/2026-04-16-directory-picker-requirements.md](docs/brainstorms/2026-04-16-directory-picker-requirements.md)
- Key files: `src/ui/directory-picker.ts`, `src/cli.ts`, `src/commands/new.ts`, `src/core/plan.ts`
