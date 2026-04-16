---
title: Warp Terminal Backend
type: feat
status: completed
date: 2026-04-16
origin: docs/brainstorms/2026-04-16-warp-terminal-backend-requirements.md
---

# ✨ Warp Terminal Backend

## Overview

Add a fourth terminal backend, `warp`, that opens a single Warp window with one native tab per worktree by (1) writing a Launch Configuration YAML keyed to the feature slug and (2) firing the `warp://launch/<slug>` deep-link. Sits alongside `tmux`, `cmux`, `none` with the same pluggable contract — selection is conservative so non-Warp users are never surprised.

## Problem Statement / Motivation

workit's value is "N parallel feature branches in one place". Users who live in Warp today fall through to `none` or are forced into tmux, losing Warp's native tabs, workspace state, and AI workflow. Warp ships a declarative Launch Configuration schema that maps 1:1 onto workit's upfront-tabs contract, so this is a low-impedance native integration rather than a shim.

See origin: `docs/brainstorms/2026-04-16-warp-terminal-backend-requirements.md` for the full product framing.

## Proposed Solution

Mirror the existing `cmux.ts` / `tmux.ts` module shape. Add a single new file `src/terminal/warp.ts` exposing four pure helpers and one runner:

- `insideWarp(): boolean` — `process.env.TERM_PROGRAM === 'WarpTerminal'`
- `warpInstalled(): Promise<boolean>` — OS-aware probe
- `launchConfigurationsDir(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string` — pure, OS-aware
- `buildWarpLaunchConfig({ configName, tabs }): string` — pure YAML emitter
- `runWarpBackend({ featureSlug, tabs }): Promise<void>` — writes YAML + deep-links

Then thread `'warp'` through `BackendName`, `selectBackend`, `detectAvailability`, `dispatchBackend`, the zod config enum, the shell picker, and the `--terminal` CLI help.

**No new runtime dependencies.** The required YAML subset is shallow (one window, N tabs, each with `title` + `layout.cwd`); hand-emit a small, quoting-safe string rather than adding `js-yaml` / `yaml`. Aligns with the project's deliberately tiny dependency list (`package.json` has 5 runtime deps).

## Technical Considerations

### YAML schema (authoritative)

The launch configuration must be shaped exactly as Warp's 2026 docs specify:

```yaml
---
name: <featureSlug>
windows:
  - tabs:
      - title: <tab.name>
        layout:
          cwd: <tab.cwd>
      - title: <tab.name>
        layout:
          cwd: <tab.cwd>
```

Hard rules from Warp:

- The YAML filename stem **must equal** the inner `name:` field for `warp://launch/<stem>` to resolve. (Warp GitHub issue #6303.)
- `cwd` **must be absolute**; `~` or empty string silently removes the config from Warp's picker. `TabSpec.cwd` is already absolute by construction (worktree paths under `config.workspacesDir`), so no transformation needed.
- No `commands:` preamble per R-brainstorm decision — `cd`-only via `layout.cwd`, matching tmux/cmux parity.

### Platform matrix

| OS      | Launch configs dir                                              | Deep-link invocation                | Availability probe                                     |
|---------|-----------------------------------------------------------------|-------------------------------------|--------------------------------------------------------|
| macOS   | `~/.warp/launch_configurations/`                                | `execa('open', [url])`              | `pathExists('/Applications/Warp.app')`                 |
| Linux   | `${XDG_DATA_HOME:-$HOME/.local/share}/warp-terminal/launch_configurations/` | `execa('xdg-open', [url])` | `command -v warp-terminal` (probe via `execa('which', ['warp-terminal'], { reject: false })`) |
| Windows | `%APPDATA%\warp\Warp\data\launch_configurations\`               | `execa('cmd', ['/c', 'start', '', url])` | Out of scope for this plan (see Scope Boundaries) |

### Selection priority (updated)

`src/terminal/index.ts :: selectBackend` becomes:

```ts
1. args.flag                                                  // explicit --terminal
2. insideCmux  && cmuxAvailable  → 'cmux'                     // unchanged
3. insideTmux  && tmuxAvailable  → 'tmux'                     // unchanged
4. insideWarp  && warpAvailable  → 'warp'                     // NEW
5. configDefault !== 'auto'      → configDefault if available // now also honors 'warp'
6. tmuxAvailable → 'tmux'                                     // fallback unchanged
7. cmuxAvailable → 'cmux'                                     // fallback unchanged
8. 'none'
```

Warp is **deliberately absent from the availability fallback** (step 6–7 intentionally omit warp). Non-Warp users who merely have Warp installed never see a new Warp window spawn — opt-in is via `--terminal warp`, `defaultTerminal: 'warp'`, or being inside a Warp session already.

### Runner semantics

`runWarpBackend`:

1. Compute `dir = launchConfigurationsDir(process.platform, process.env)`.
2. Ensure directory exists (recursive `mkdir`).
3. Write `dir/<featureSlug>.yaml` with `buildWarpLaunchConfig({ configName: featureSlug, tabs })`. **Overwrite unconditionally** (R3 from origin — no diffing, no skip-if-same).
4. Fire the OS-appropriate deep-link `warp://launch/<featureSlug>` via `execa(..., { reject: false })`. If the invocation fails, print a clear fallback message pointing the user at Warp's launcher and the file path — do not throw. Rationale: the YAML is the durable artifact; a missing URL handler shouldn't abort the whole workit run.

### YAML hand-emitter

Tiny, typed function. String quoting strategy: always double-quote string values and escape `\` and `"`. No special handling for multi-line since titles and cwds are single-line. Pseudo:

```ts
// src/terminal/warp.ts
export interface BuildWarpArgs {
  configName: string;
  tabs: TabSpec[];
}

export function buildWarpLaunchConfig(args: BuildWarpArgs): string {
  const lines: string[] = ['---', `name: ${yamlString(args.configName)}`, 'windows:', '  - tabs:'];
  for (const tab of args.tabs) {
    lines.push(`      - title: ${yamlString(tab.name)}`);
    lines.push('        layout:');
    lines.push(`          cwd: ${yamlString(tab.cwd)}`);
  }
  lines.push(''); // trailing newline
  return lines.join('\n');
}

function yamlString(v: string): string {
  return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
```

## System-Wide Impact

- **Interaction graph**: `src/cli.ts:28` (flag) → `src/commands/new.ts:125-140` (dispatch site) → `selectBackend` → `dispatchBackend` → `runWarpBackend` → filesystem write + `open`/`xdg-open`. The chain is identical in shape to the cmux path; adding warp doesn't introduce new layers.
- **Error propagation**: YAML write errors (permission denied, disk full) propagate up — consistent with how `cmux.ts` treats required state changes as `reject: true`. Deep-link invocation uses `reject: false` so a misconfigured URL handler prints a fallback message but doesn't abort workit.
- **State lifecycle risks**: The only persisted state is the YAML file. Overwriting is safe; Warp reads the file on every launch. No cleanup path — consistent with the origin decision to leave pruning to the user.
- **API surface parity**: New surfaces to update in lockstep with `BackendName`:
  - `src/terminal/index.ts` — type + `selectBackend` + `detectAvailability` + `dispatchBackend`
  - `src/core/config.ts:10-11` — `defaultTerminal` enum + optional `terminalCommand.warp`
  - `src/ui/prompts.ts` — `ShellAvailability`, `computeShellDefault`, `promptShell` options
  - `src/cli.ts:28` — `--terminal` help string
  Missing any of these will produce either a type error or a silently absent picker option. The `promptShell` extension is the one most at risk of being forgotten (origin brainstorm learning from shell-picker plan).
- **Integration test scenarios** (cross-layer, unit-mocks won't catch):
  1. `--terminal warp` from a plain shell on a machine where Warp is not installed → should error with a clear "warp not available" message before touching disk.
  2. Inside a Warp session, default config, all other backends uninstalled → should auto-select warp, not `none`.
  3. Inside tmux session with Warp also installed → should still pick tmux (inside-session detection precedence).
  4. Re-run same slug → YAML overwritten, deep-link fires, no duplicate or error.
  5. On Linux with `XDG_DATA_HOME` unset → file lands at `~/.local/share/warp-terminal/launch_configurations/<slug>.yaml`.

## Acceptance Criteria

### Functional

- [ ] `src/terminal/warp.ts` exists with `insideWarp`, `warpInstalled`, `launchConfigurationsDir`, `buildWarpLaunchConfig`, `runWarpBackend`, matching the module shape of `cmux.ts` / `tmux.ts`.
- [ ] `BackendName` in `src/terminal/index.ts` includes `'warp'`.
- [ ] `selectBackend` precedence updated exactly as documented above; Warp excluded from availability fallback.
- [ ] `detectAvailability` returns `warpAvailable` and `insideWarp` alongside existing fields.
- [ ] `dispatchBackend` routes `'warp'` to `runWarpBackend`.
- [ ] `config.defaultTerminal` zod enum includes `'warp'`; existing configs continue to validate (enum is non-breaking add).
- [ ] `config.terminalCommand` accepts optional `warp?: string` (unused today but symmetric with cmux; allows future override).
- [ ] `src/ui/prompts.ts` picker exposes Warp as an option when available, greys/hides it when not, and the default-selection heuristic accounts for `insideWarp`.
- [ ] `src/cli.ts:28` `--terminal` help string lists `warp` as a valid value.
- [ ] Running `workit <feature>` inside a Warp session opens a new Warp window with one tab per worktree, each already in the worktree cwd, with the worktree name as the tab title.
- [ ] Running `workit <feature> --terminal warp` from any shell (with Warp installed) opens the same window via deep-link.
- [ ] Re-running the same slug overwrites the YAML and opens a fresh window without error.
- [ ] Deep-link invocation failure prints a fallback message pointing at the YAML file and does not throw.

### Non-functional

- [ ] No new runtime dependencies added to `package.json`.
- [ ] `bun run typecheck` passes (the only configured gate; no linter in this repo).

### Quality Gates

- [ ] New unit tests in `tests/unit/terminal/warp.test.ts`:
  - `buildWarpLaunchConfig` snapshot-style: one tab, many tabs, names/cwds with quotes and backslashes (escaping correctness), exact YAML string match.
  - `launchConfigurationsDir`: macOS → `~/.warp/...`; Linux with `XDG_DATA_HOME` set → uses it; Linux without → `$HOME/.local/share/...`; Windows → `%APPDATA%\...`.
  - `insideWarp`: true when `TERM_PROGRAM=WarpTerminal`; false otherwise (inject env in-test — mirror `insideTmux` test approach if one exists, otherwise add).
- [ ] `tests/unit/terminal/index.test.ts` extended with `selectBackend` cases for: inside-warp-priority, `configDefault='warp'`, `configDefault='warp'` but Warp unavailable (falls through), Warp present but user inside tmux (tmux still wins), Warp absent from fallback.
- [ ] No unit tests for the `runWarpBackend` shell-out path (matches existing convention — shell-out runners are not unit-tested; only pure helpers).
- [ ] Manual verification: exercise scenarios 1–5 from "Integration test scenarios" above on macOS before merge. Linux XDG path variant verified via test fixture; Linux deep-link manually sanity-checked if a Linux box is reachable, otherwise noted explicitly as untested.

## Success Metrics

- Warp users can run `workit <feature>` end-to-end without falling through to `none` or being forced into tmux.
- Zero new dependency entries in `package.json`.
- No regression in tmux / cmux / none backend behavior (existing unit + integration tests remain green).

## Dependencies & Risks

**Dependencies**
- None new. Uses existing `execa`, `node:fs/promises`, `node:path`, `node:os`.
- Assumes Warp 2026-current Launch Configuration schema. Two doc pages (legacy + current) describe the same schema; no breaking schema change surveyed in 2025–2026.

**Risks**
- **Deep-link resolver quirks**: Warp matches `warp://launch/<stem>` against the filename stem and the inner `name:` field — these must be equal. Mitigation: single source of truth — `featureSlug` is used for both.
- **Linux URL-handler registration**: `.deb`/`.rpm`/`pacman`/AUR installs register the handler; **Flatpak is uncertain** (no official Flatpak from warp.dev as of 2026). Mitigation: fallback message on non-zero `xdg-open` exit directs the user to the written YAML, preserving the ability to launch manually from Warp's UI.
- **Windows support gap**: Windows deep-link invocation + availability probe are described here but **left unimplemented in this plan** (see Scope Boundaries). Mitigation: explicit `os.platform() === 'win32'` branch returns `warpInstalled: false` so Warp is never selected on Windows until a follow-up implements the branch.
- **Flag-vs-reality mismatch** (cmux precedent, commit `bfe9c25`): Warp docs and actual binary behavior have diverged before. Mitigation: before merge, write the generated YAML to disk and invoke `warp://launch/` against a real Warp install on macOS to catch any schema drift.
- **Non-Warp users startled**: Addressed by design — Warp is never in the availability-fallback chain. `insideWarp` detection is the only silent trigger; elsewhere requires explicit opt-in.

## Scope Boundaries (carried from origin)

- **No cmux "outside cmux" fix.** The origin brainstorm explicitly deferred this to a separate round; must not regress.
- **No per-tab `commands:` preamble.** `cd`-only via `layout.cwd`; no setup-script execution, no agent-mode launch.
- **No cleanup of stale YAMLs.** User-owned; workit writes and moves on.
- **No Windows implementation** in this plan. The `launchConfigurationsDir` helper documents the Windows path, but `warpInstalled` returns `false` on `win32` so Warp is never selected. A follow-up plan can flip this on once someone has a Windows/Warp test bench.
- **No agent-runner overlay** (ideation idea #8). Separate cross-cutting feature.
- **No idempotency detection.** Every re-run overwrites + relaunches.

## Implementation Steps (suggested order, tight scope)

1. `src/terminal/warp.ts` — add the five exports with no wiring yet. Include the hand-emitter.
2. `tests/unit/terminal/warp.test.ts` — TDD the pure helpers (`buildWarpLaunchConfig`, `launchConfigurationsDir`, `insideWarp`).
3. Wire `BackendName`, `selectBackend`, `detectAvailability`, `dispatchBackend` in `src/terminal/index.ts`.
4. Extend `tests/unit/terminal/index.test.ts` with the 5 `selectBackend` cases.
5. Update `src/core/config.ts` (`defaultTerminal` enum + optional `terminalCommand.warp`).
6. Update `src/ui/prompts.ts` picker + default heuristic + hint logic.
7. Update `src/cli.ts:28` help string.
8. Manual exercise: run `bun run dev feat/warp-test-1` from inside and outside Warp on macOS; verify YAML contents and that the deep-link opens a new window with tabs.
9. `bun run typecheck && bun test` — all green.

## Sources & References

### Origin

- **Origin document:** [docs/brainstorms/2026-04-16-warp-terminal-backend-requirements.md](docs/brainstorms/2026-04-16-warp-terminal-backend-requirements.md)
  Key decisions carried forward: (a) persist YAML in `~/.warp/launch_configurations/` and overwrite on re-run; (b) cd-only tab preamble, no setup script or agent overlay; (c) Warp excluded from availability fallback — only auto-selects when inside Warp or via explicit opt-in.

### Internal references

- `src/terminal/index.ts:6-30` — `BackendName` + `selectBackend` precedence
- `src/terminal/index.ts:40-73` — `dispatchBackend` + `detectAvailability`
- `src/terminal/cmux.ts:16-108` — canonical module shape to mirror (pure planner + runner)
- `src/terminal/tmux.ts:13-69` — second reference shape
- `src/core/config.ts:10-11,27-29` — `defaultTerminal` zod enum + `terminalCommand` overrides
- `src/ui/prompts.ts:49-99` — shell picker (hardcoded options today — must extend)
- `src/cli.ts:28,48` — `--terminal` flag help + pass-through
- `src/commands/new.ts:125-140` — dispatch site
- `tests/unit/terminal/{tmux,cmux,index,none}.test.ts` — test patterns to replicate
- `src/utils/fs.ts` — `pathExists` helper used by install probes
- `docs/specs/2026-04-12-workit-design.md:227-267` — canonical selection-priority doc and the "always pass `--workspace` explicitly" cmux gotcha

### External references

- [Warp Launch Configurations (current docs)](https://docs.warp.dev/features/session-management/launch-configurations)
- [Warp URI Scheme](https://docs.warp.dev/terminal/more-features/uri-scheme)
- [Warp Installation](https://docs.warp.dev/getting-started/readme-1/installation-and-setup)
- [Warp for Linux](https://www.warp.dev/linux-terminal)
- [Warp issue #6303 — URI scheme resolution with filenames](https://github.com/warpdotdev/Warp/issues/6303)
- [Warp issue #6990 — `TERM_PROGRAM` on Windows SSH](https://github.com/warpdotdev/warp/issues/6990)
- [Warp issue #4662 — Flatpak packaging request](https://github.com/warpdotdev/Warp/issues/4662)

### Related prior work

- `docs/plans/2026-04-16-003-feat-shell-picker-step-plan.md` — shell picker extension pattern; adding a new `BackendName` means touching the picker, not just `selectBackend`.
- Commit `bfe9c25` — "fix: cmux workspace incorrect flags"; precedent that real binaries drift from their docs. Enforces the manual-verify step before merge.
