---
title: Run setup scripts async (background)
type: feat
status: completed
date: 2026-04-17
---

# Run setup scripts async (background)

## Overview

`workit new` currently runs each project's setup script to completion before dispatching the terminal backend. On large repos, `bun install` / `npm i` can take minutes — the user stares at a pre-existing shell while the new workspace tabs wait to open. Make setup a detached background process so the terminal opens immediately and the CLI exits. The user is told where logs live and can tail them.

## Problem Statement

`src/commands/new.ts:118` awaits `runSetupScripts(...)` before calling `dispatchBackend`. Because setup is serialized before terminal launch, the full latency of setup (often dominated by dependency installation) blocks the moment of value — having a working terminal open. The setup itself is already parallel across projects (`src/setup/runner.ts:72` uses `Promise.all`) so the bottleneck is the awaited serialization between setup and dispatch, not parallelism.

## Proposed Solution

Switch setup to Option B1: detached child-per-target, logs redirected to a file, parent CLI `unref()`s and exits normally.

- For each target with a discoverable setup script, spawn a detached child that runs a small bash wrapper: `bash <script>; echo $? > <status-path>`.
- Child stdio: stdin ignored, stdout+stderr redirected to an opened log fd.
- Log location: `~/.workit/logs/<feature-slug>/<project>.log` with a matching `<project>.status` sentinel alongside it.
- CLI prints, per target: `setup started in <project> → tail -f <log-path>` (and `setup script missing in <project>` for misses, as today).
- All backends (including `--terminal none`) use the async path by default. A `--sync-setup` flag opts into the old behavior for users who want to wait.
- The `runSetupScripts` signature changes: it no longer has an `onLine` callback, and returns `{ name, status: 'spawned' | 'missing' | 'failed-to-start', logPath, pid }` per target.

## Technical Considerations

- **execa vs. Bun.spawn.** The codebase currently uses `execa` everywhere (`src/setup/runner.ts:44`). A separate plan (`docs/plans/2026-04-16-004-chore-migrate-to-bun-native-apis-plan.md`) tracks a Bun-native migration. Stay on execa here to keep the diff focused. When the Bun migration lands, detach + `unref` + log-fd stdio needs re-verification under `Bun.spawn`.
- **POSIX detach.** `detached: true` + `.unref()` + `stdio: ['ignore', logFd, logFd]` gives us process-group isolation on macOS/Linux. The child will not receive SIGINT/SIGHUP from the CLI's terminal once unreffed. There is a narrow window between `spawn()` returning and `.unref()` where a Ctrl-C on the CLI could still propagate; the flow spawns all targets then unrefs them synchronously, minimizing this.
- **Windows.** `detached: true` on Windows is semantically different (new console group, not a new session). We set `windowsHide: true` and accept best-effort behavior. Documented as a known limitation; follow-up can add a Windows-specific path if real users surface issues.
- **Log location is user-global, not per-worktree.** Writing to `<targetPath>/.workit/setup.log` inside the git worktree would dirty the working tree. `~/.workit/logs/<slug>/<project>.log` is outside any repo, survives `workit rm --delete-branch`, and aligns with the existing `~/.workit/workspaces` convention (`src/core/config.ts:25`).
- **Log freshness.** Truncate on spawn (`openSync(path, 'w')`). Each worktree path is already unique per invocation (`src/commands/new.ts:60` rejects existing target paths), so re-runs for the same slug imply the user deleted the old worktree first — a fresh log is the right behavior.
- **Status sentinel.** The status file is cheap (one line, one number) and unlocks a future `workit logs` / `workit status <slug>` command without refactoring. Writing `$?` via the bash wrapper captures non-zero exits, OOM kills, and signal deaths uniformly.

## System-Wide Impact

- **Interaction graph.** `runNewCommand` → `runSetupScripts` (now returns immediately) → `dispatchBackend` (unchanged) → CLI process exits. Children continue running in their own process groups writing to `~/.workit/logs/<slug>/<project>.{log,status}`. No callback/event bridge between CLI and child once spawned.
- **Error propagation.** Two distinct failure modes to keep separate:
  1. *Spawn-time* failures (permissions on log dir, `bash` not found, script not executable) — surface synchronously as a `warn()` with a clear message; do not abort other targets.
  2. *Runtime* failures (script exits non-zero, `bun install` fails) — captured in the sentinel file. CLI has exited by then; discovery is user-driven (log path, future `workit logs`).
- **State lifecycle risks.** The log directory `~/.workit/logs/<slug>/` accumulates across invocations. If a user creates `feat/foo`, deletes the worktree, creates `feat/foo` again, both runs share the slug and the log gets truncated. Acceptable: the sentinel reflects the *latest* run. A follow-up can add cleanup in `workit rm`.
- **API surface parity.** `RunNewResult.setupResults` is exported from `src/commands/new.ts:25` and used only by `tests/integration/new.test.ts:69`. Shape change is contained. `cli.ts` does not inspect `setupResults`.
- **Integration test scenarios.**
  1. `--terminal none` with a present setup script — setup returns `'spawned'` immediately, log path populated, child writes sentinel asynchronously.
  2. `--terminal none --sync-setup` — awaited execution; `setupResults[0].status === 'ok'`.
  3. `--terminal warp` (mocked) with a present setup script — same async contract as case 1.
  4. `--terminal warp --sync-setup` — awaited execution for that run.
  5. Missing setup script — `status === 'missing'`, no log file created, no spawn.

## Acceptance Criteria

### Functional

- [ ] `runNewCommand` no longer awaits setup completion by default, for any backend (including `none`).
- [ ] `--sync-setup` CLI flag opts into the old synchronous behavior for any backend.
- [ ] For async runs, each project's log is at `~/.workit/logs/<slug>/<project>.log` and a `<project>.status` file is written on exit containing the integer exit code.
- [ ] CLI output includes a line per target with the absolute log path a user can `tail -f`.
- [ ] Missing setup scripts are reported synchronously via `hint()` as today.
- [ ] Spawn-time failures (e.g. log dir unwritable) surface a `warn()` with the error and do not abort the rest of the flow.

### Non-functional

- [ ] Child survives CLI exit on macOS and Linux (verified by test that kills the CLI and waits for the sentinel file to appear).
- [ ] Windows path works best-effort: `detached: true` + `windowsHide: true`. Not required to pass integration tests on Windows.
- [ ] No regression in `--dry-run` (setup still skipped entirely).

### Quality gates

- [ ] `bun run typecheck` passes.
- [ ] `bun test` passes, with updated assertions in `tests/integration/new.test.ts` and `tests/unit/setup/runner.test.ts`.
- [ ] A new unit test verifies the sentinel file contains `0` for success and a non-zero value for a failing script.

## MVP

### src/setup/runner.ts

```ts
// Replaces the existing file. Removes onLine and the awaited stream.
import { execa } from 'execa';
import { openSync, closeSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathExists } from '../utils/fs';

export type SetupStatus = 'spawned' | 'missing' | 'failed-to-start' | 'ok' | 'failed';

export interface SetupResult {
  name: string;
  status: SetupStatus;
  scriptPath: string | null;
  logPath: string | null;
  statusPath: string | null;
  pid: number | null;
  exitCode: number | null;
  error?: string;
}

export interface SetupTarget {
  name: string;
  cwd: string;
}

export interface RunSetupOptions {
  targets: SetupTarget[];
  scriptPaths: string[];
  featureSlug: string;
  mode: 'async' | 'sync';
}

export async function findSetupScript(
  cwd: string,
  candidates: string[],
): Promise<string | null> {
  for (const rel of candidates) {
    const normalized = rel.startsWith('./') ? rel.slice(2) : rel;
    const full = join(cwd, normalized);
    if (await pathExists(full)) return full;
  }
  return null;
}

function logsDirFor(slug: string): string {
  return join(homedir(), '.workit', 'logs', slug);
}

async function spawnDetached(
  target: SetupTarget,
  script: string,
  slug: string,
): Promise<SetupResult> {
  const dir = logsDirFor(slug);
  await mkdir(dir, { recursive: true });
  const logPath = join(dir, `${target.name}.log`);
  const statusPath = join(dir, `${target.name}.status`);
  let fd: number | null = null;
  try {
    fd = openSync(logPath, 'w');
    const wrapper = `bash ${shellEscape(script)}; echo $? > ${shellEscape(statusPath)}`;
    const child = execa('bash', ['-c', wrapper], {
      cwd: target.cwd,
      detached: true,
      stdio: ['ignore', fd, fd],
      windowsHide: true,
    });
    child.unref();
    return {
      name: target.name,
      status: 'spawned',
      scriptPath: script,
      logPath,
      statusPath,
      pid: child.pid ?? null,
      exitCode: null,
    };
  } catch (err) {
    return {
      name: target.name,
      status: 'failed-to-start',
      scriptPath: script,
      logPath: null,
      statusPath: null,
      pid: null,
      exitCode: null,
      error: (err as Error).message,
    };
  } finally {
    if (fd !== null) {
      // The child has dup'd the fd; the parent can close.
      try { closeSync(fd); } catch {}
    }
  }
}

async function runSync(
  target: SetupTarget,
  script: string,
): Promise<SetupResult> {
  try {
    const result = await execa('bash', [script], { cwd: target.cwd, all: true, stdio: 'inherit' });
    return {
      name: target.name, status: 'ok', scriptPath: script,
      logPath: null, statusPath: null, pid: null,
      exitCode: result.exitCode ?? 0,
    };
  } catch (err: any) {
    return {
      name: target.name, status: 'failed', scriptPath: script,
      logPath: null, statusPath: null, pid: null,
      exitCode: err.exitCode ?? null,
      error: err.shortMessage ?? String(err),
    };
  }
}

export async function runSetupScripts(options: RunSetupOptions): Promise<SetupResult[]> {
  return Promise.all(
    options.targets.map(async (t) => {
      const script = await findSetupScript(t.cwd, options.scriptPaths);
      if (!script) {
        return {
          name: t.name, status: 'missing' as const,
          scriptPath: null, logPath: null, statusPath: null,
          pid: null, exitCode: null,
        };
      }
      return options.mode === 'async'
        ? spawnDetached(t, script, options.featureSlug)
        : runSync(t, script);
    }),
  );
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
```

### src/commands/new.ts (changes)

```ts
// Existing RunNewArgs gets a new optional flag:
export interface RunNewArgs {
  // ...existing fields
  syncSetup?: boolean;
}

// Replace the current runSetupScripts call block:
const mode: 'async' | 'sync' = args.syncSetup ? 'sync' : 'async';
const setupResults = await runSetupScripts({
  targets: plan.targets.map((t) => ({ name: t.project.name, cwd: t.targetPath })),
  scriptPaths: resolved.setupScriptPaths,
  featureSlug: slug,
  mode,
});
for (const r of setupResults) {
  if (r.status === 'missing') {
    hint(`no setup script in ${r.name} — create one to automate this step`);
  } else if (r.status === 'failed-to-start') {
    warn(`could not start setup in ${r.name}: ${r.error ?? 'unknown error'}`);
  } else if (r.status === 'spawned') {
    info(`setup started in ${r.name} → tail -f ${r.logPath}`);
  } else if (r.status === 'failed') {
    warn(`setup failed in ${r.name}: ${r.error ?? 'unknown error'}`);
  } else {
    success(`${r.name} setup complete`);
  }
}
```

### src/cli.ts (changes)

```ts
// Add to the `new` command definition:
.option('--sync-setup', 'wait for setup scripts to finish before dispatching the terminal')
// Thread through to runNewCommand:
syncSetup: Boolean(opts.syncSetup),
```

### tests/unit/setup/runner.test.ts (changes)

```ts
test('async mode spawns detached and writes log + status', async () => {
  const slug = `test-${Date.now()}`;
  const results = await runSetupScripts({
    targets: [{ name: 'A', cwd: a }],
    scriptPaths: ['./setup.sh'],
    featureSlug: slug,
    mode: 'async',
  });
  expect(results[0]!.status).toBe('spawned');
  expect(results[0]!.logPath).toContain(`.workit/logs/${slug}/A.log`);

  // Poll for sentinel (child runs asynchronously).
  const statusPath = results[0]!.statusPath!;
  await waitForFile(statusPath, 5000);
  expect(await Bun.file(statusPath).text()).toMatch(/^0\s*$/);
});

test('sync mode preserves ok/failed semantics', async () => { /* ... */ });
test('async path works for --terminal none (no backend dependency)', async () => { /* ... */ });
```

### tests/integration/new.test.ts (changes)

- Default (async) path with `terminal: 'none'`: assert `status === 'spawned'`, `logPath` populated, then poll the sentinel and assert exit code `0`.
- `terminal: 'none'` + `syncSetup: true`: assert `status === 'ok'` (preserves the old contract for users who opt in).

## Success Metrics

- Perceived time from `workit new <description>` to a ready terminal tab drops by the duration of the slowest project's setup (typically seconds to minutes).
- No regression in `--terminal none` or `--dry-run` flows.
- Zero orphan-process issues reported in the follow-up week.

## Dependencies & Risks

- **Dependency:** this lands before the Bun-native migration (`docs/plans/2026-04-16-004-chore-migrate-to-bun-native-apis-plan.md`). The migration plan needs to preserve detached + log-fd semantics. Flag as a cross-cutting concern in that plan.
- **Risk:** Windows detach behavior is best-effort. Mitigation: explicit note in the README and a follow-up issue if users report it.
- **Risk:** Users will initially find it surprising that the CLI exits while setup is still running. Mitigation: clear log-path line in the CLI output, and a follow-up `workit logs <slug>` subcommand.
- **Risk:** Failure discoverability. Mitigation: sentinel file enables future status checks; for this PR, users see failures when their first command in the new tab (`bun run dev`, etc.) fails because deps are missing.

## Alternatives Considered

- **In-tab execution (run `bash setup.sh` as the tab's startup command).** Better failure visibility and no log files, but requires backend-specific command plumbing (tmux `new-session [cmd]`, cmux `send`, Warp launch-config `commands:`) and has no sensible equivalent for `--terminal none`. Rejected in favor of the simpler, uniform B1.
- **In-shell background (`bash setup.sh & disown`) inside the tab.** Combines in-tab visibility with async. Still requires per-backend plumbing and has SIGHUP quirks on tab close. Rejected.
- **Auto-tail wrapper in the tab.** Start detached from CLI, `tail -F` the log in the tab until the child exits, then drop to shell. Best UX but adds a helper binary/script and tail-cleanup logic. Deferred.

## Follow-ups (out of scope)

- `workit logs <slug> [project]` subcommand to `tail -F` the log file, printing the sentinel when done.
- `workit status <slug>` that reads sentinel files and reports success/failure.
- Cleanup of `~/.workit/logs/<slug>/` inside `workit rm`.
- Windows-native background path if real users hit the `detached: true` console-window quirk.

## Sources & References

### Internal

- Current setup runner: `src/setup/runner.ts:44` (awaited, streams via `onLine`)
- Current caller / blocking point: `src/commands/new.ts:118`
- `RunNewResult.setupResults` shape: `src/commands/new.ts:25`
- Test asserting on setupResults: `tests/integration/new.test.ts:69`
- Existing workit-managed home dir convention: `src/core/config.ts:25` (`~/.workit/workspaces`)
- UI helpers (info/warn/hint/success): `src/ui/log.ts`
- Related plan (cross-cutting concern): `docs/plans/2026-04-16-004-chore-migrate-to-bun-native-apis-plan.md`
- Prior implementation reference: `docs/plans/2026-04-12-workit-implementation.md`

### External

- Node `child_process.spawn` `detached` and `stdio` docs — the pattern this relies on (not fetched; well-established).
- execa options reference — `detached`, `stdio`, `windowsHide`.
