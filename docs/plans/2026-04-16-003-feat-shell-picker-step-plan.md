---
title: "feat: Interactive shell picker step in `workit new`"
type: feat
status: active
date: 2026-04-16
---

# feat: Interactive shell picker step in `workit new`

Add a dedicated interactive step after directory selection where the user picks the terminal multiplexer (cmux / tmux / none). Default is derived from environment and availability. Skip the step entirely when it would be redundant (flag passed, config pinned, or neither backend installed).

## Overview

Today, `workit new` picks the terminal backend silently inside `runNewCommand` via `selectBackend()` (`src/terminal/index.ts:17`). Users don't see which backend will launch until worktrees are already created. Hiding that decision behind auto-detection also means users who want to opt out of cmux/tmux for a single run must pass `--terminal none`.

This plan surfaces the choice as a dedicated interactive step between directory picking and the "Proceed?" confirmation, with a sensible default pre-selected based on current environment.

## Problem Statement / Motivation

- The terminal backend is currently chosen silently and only revealed when the multiplexer launches (or fails).
- There's no interactive way to say "create the worktrees but don't open any multiplexer" short of remembering the `--terminal none` flag.
- When the user is *inside* cmux or tmux, defaulting to that backend is obvious — but they have no easy way to override it for a single run.

## Proposed Solution

**New step placement:** after `promptProjectPicker` and before `promptConfirm` in `src/cli.ts:43`.

**Selection logic:**

1. If `opts.terminal` flag is set → **skip picker**, use flag.
2. Else if config `defaultTerminal !== 'auto'` → **skip picker**, use config value.
3. Else detect availability (`detectAvailability`) — if **neither** cmux nor tmux is available → **skip picker**, backend is implicitly `'none'`.
4. Otherwise show the picker with options:
   - **cmux** — highlight availability / install status
   - **tmux** — highlight availability / install status
   - **none** — always present, always enabled
5. Default highlighted option:
   - `cmux` if `insideCmux && cmuxAvailable`
   - else `tmux` if `tmuxAvailable`
   - else `none`

**Unavailable options are shown as disabled** with an `(not installed)` dim hint so the user learns which backends exist — they just can't select them. This uses `@clack/prompts` select option `hint` and removes the `value` (or sets disabled flag via our own handling, since clack doesn't natively disable).

**Why this ordering:** showing the picker before `Proceed?` means the confirmation summary can include the chosen terminal, and validation errors (missing repo, existing branch) still surface before any UI execution — those already run inside `runNewCommand`; we do not duplicate that work.

## Technical Approach

### New prompt function — `src/ui/prompts.ts`

```ts
// src/ui/prompts.ts — new export
import type { BackendName } from '../terminal';

export interface PromptShellArgs {
  cmuxAvailable: boolean;
  tmuxAvailable: boolean;
  insideCmux: boolean;
  insideTmux: boolean;
}

export async function promptShell(args: PromptShellArgs): Promise<BackendName> {
  // Compute default
  let initialValue: BackendName = 'none';
  if (args.insideCmux && args.cmuxAvailable) initialValue = 'cmux';
  else if (args.tmuxAvailable) initialValue = 'tmux';
  else if (args.cmuxAvailable) initialValue = 'cmux';

  const options = [
    {
      value: 'cmux' as const,
      label: 'cmux',
      hint: args.cmuxAvailable
        ? args.insideCmux ? 'current session' : undefined
        : 'not installed',
    },
    {
      value: 'tmux' as const,
      label: 'tmux',
      hint: args.tmuxAvailable
        ? args.insideTmux ? 'current session' : undefined
        : 'not installed',
    },
    {
      value: 'none' as const,
      label: 'none',
      hint: 'skip multiplexer; print paths only',
    },
  ];

  const result = await p.select({ message: 'Terminal', initialValue, options });
  if (p.isCancel(result)) {
    p.cancel('Cancelled');
    process.exit(1);
  }
  return result as BackendName;
}
```

**Clack's `select` does not natively support disabled options.** To show unavailable backends as disabled, we wrap the value so re-selecting a disabled option loops back. Two simple options:

- **Option A (preferred):** post-process — if the user selects an unavailable backend, show an inline warning and re-prompt. Keep the code path simple.
- **Option B:** implement a custom TTY picker (similar to `directory-picker.ts`) that renders disabled rows in dim text and skips them on arrow navigation. Higher effort; punt unless Option A feels wrong in practice.

Start with Option A. Revisit if it feels clunky.

### Wire into `src/cli.ts`

```ts
// src/cli.ts — inside the `workit new` action, between dir picker and confirm
import { detectAvailability, selectBackend } from './terminal';
import { promptShell } from './ui/prompts';

// ...after projectPaths is set...

let terminal: BackendName | undefined = opts.terminal as BackendName | undefined;
if (!terminal && config.defaultTerminal === 'auto') {
  const avail = await detectAvailability(config);
  if (avail.cmuxAvailable || avail.tmuxAvailable) {
    terminal = await promptShell({
      cmuxAvailable: avail.cmuxAvailable,
      tmuxAvailable: avail.tmuxAvailable,
      insideCmux: avail.insideCmux,
      insideTmux: avail.insideTmux,
    });
  }
  // else: leave undefined; selectBackend() will return 'none'
}

// Existing confirm prompt runs after, so the user sees the chosen terminal
// reflected in the upcoming plan summary (see Display section below).
```

### Display chosen terminal in confirm flow

Currently, the "Proceed?" confirmation does not include the terminal backend. After the picker runs we should show the choice so the user confirms the full plan. Cheapest touch: include a one-line note before `promptConfirm`:

```ts
if (terminal) info(`Terminal: ${terminal}`);
```

(Fancier: extend `formatNewPlan` in `src/core/plan.ts` to include the terminal — but that function also prints inside `runNewCommand`, which would duplicate. Keep it a separate log line for now.)

### `selectBackend` unchanged

`src/terminal/index.ts:17` already handles `flag`, `configDefault`, and auto-detect. The picker's selected value flows in as `flag` (since at that point it's an explicit user choice). **No changes to `selectBackend`.** The only difference is that `runNewCommand` now frequently receives a non-undefined `terminal` — this was already the `--terminal` flag path and is well-tested.

### Tests

**New tests in `tests/unit/ui/prompt-shell.test.ts`** (if we extract default-computation into a pure helper):

```ts
// tests/unit/ui/prompt-shell.test.ts
describe('computeShellDefault', () => {
  test('insideCmux + cmux available → cmux', () => {
    expect(computeShellDefault({
      cmuxAvailable: true, tmuxAvailable: true,
      insideCmux: true, insideTmux: false,
    })).toBe('cmux');
  });

  test('insideTmux (not cmux) + tmux available → tmux', () => {
    expect(computeShellDefault({
      cmuxAvailable: true, tmuxAvailable: true,
      insideCmux: false, insideTmux: true,
    })).toBe('tmux');
  });

  test('only cmux available → cmux', () => {
    expect(computeShellDefault({
      cmuxAvailable: true, tmuxAvailable: false,
      insideCmux: false, insideTmux: false,
    })).toBe('cmux');
  });

  test('only tmux available → tmux', () => {
    expect(computeShellDefault({
      cmuxAvailable: false, tmuxAvailable: true,
      insideCmux: false, insideTmux: false,
    })).toBe('tmux');
  });

  test('neither available → none', () => {
    expect(computeShellDefault({
      cmuxAvailable: false, tmuxAvailable: false,
      insideCmux: false, insideTmux: false,
    })).toBe('none');
  });
});
```

Interactive prompt behavior cannot be unit tested without a TTY harness — this matches the existing pattern (see `tests/unit/ui/directory-picker.test.ts` which tests pure helpers only).

**Existing `selectBackend` tests remain unchanged** since that function isn't modified.

## Acceptance Criteria

- [ ] `workit new` shows a "Terminal" select step after directory picking, only when `opts.terminal` is unset AND `config.defaultTerminal === 'auto'` AND at least one of cmux/tmux is available
- [ ] Default highlight is `cmux` when `insideCmux && cmuxAvailable`
- [ ] Default highlight falls back to `tmux` when `tmuxAvailable` and not inside cmux
- [ ] Default highlight falls back to `none` when neither available (but in that case the picker is skipped entirely)
- [ ] Unavailable backends appear in the list with `(not installed)` hint and cannot be selected (selecting them re-prompts with a warning)
- [ ] Passing `--terminal none` (or cmux/tmux) skips the picker
- [ ] Setting `defaultTerminal` to `cmux` / `tmux` / `none` in config skips the picker
- [ ] When neither cmux nor tmux is installed, picker is skipped and backend silently resolves to `none`
- [ ] Chosen terminal is visible to the user (log line or included in plan summary) before the "Proceed?" confirmation
- [ ] `workit new --dry-run` prints the chosen terminal and exits without creating worktrees
- [ ] `workit new --yes` skips the confirm but the picker still runs (unless skipped per above rules)
- [ ] Cancelling (Ctrl+C / Esc) during the shell picker exits with code 1 and no side effects
- [ ] `computeShellDefault` unit tests cover all 5 branches of the default logic
- [ ] `bun test` and `bun run typecheck` both pass

## Dependencies & Risks

- **Clack `select` has no built-in disabled option.** Option A (re-prompt on invalid selection) is a small UX compromise. If the re-prompt feels bad in practice, we may need a custom picker (high-effort) or to fall back to hiding unavailable options.
- **`--yes` semantics.** `-y` currently skips *confirm* but the picker is a *selection*, not a confirmation. Confirm that `--yes` alone without `--terminal` should still interactively prompt for shell. This plan assumes it should — users who want fully non-interactive flows should pair `--yes` with `--terminal`.
- **Discoverability of `defaultTerminal`.** Users who pin `defaultTerminal: cmux` but are running outside cmux today will never see the picker again. Document this in the config help or `README`.
- **Availability detection cost.** `detectAvailability` spawns `tmux -V` and `cmux --help` via `execa`. It's already called in `runNewCommand` — this plan adds one more call earlier in the flow (only when the picker would show). Acceptable; roughly 10–30ms on a warm machine. If it becomes annoying, hoist the detection once and pass results down.

## Out of Scope

- Changing `selectBackend` logic or the `defaultTerminal` config schema.
- Adding a `workit config set defaultTerminal <name>` command (separate plan if desired).
- Remembering the user's previous choice across runs (no persistent per-project preference).
- A picker for the `workit rm` flow (rm does not launch a multiplexer).

## Files Touched

- `src/ui/prompts.ts` — add `promptShell` and `computeShellDefault` (pure helper).
- `src/cli.ts` — call `promptShell` between directory picker and confirm; pass result into `runNewCommand`.
- `tests/unit/ui/prompt-shell.test.ts` — new file, tests `computeShellDefault`.
- `README.md` (optional) — mention the new step.

## Sources & References

- Current backend selection: `src/terminal/index.ts:17` (`selectBackend`)
- Current CLI flow: `src/cli.ts:43` (directory picker → confirm → `runNewCommand`)
- Backend dispatch: `src/commands/new.ts:125-140`
- Availability detection: `src/terminal/index.ts:64` (`detectAvailability`)
- Clack `select` usage pattern: `src/ui/prompts.ts:24` (`promptBranchType`)
- Existing backend tests: `tests/unit/terminal/index.test.ts`
