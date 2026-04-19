---
title: workit logs command
type: feat
status: completed
date: 2026-04-17
---

# `workit logs` command

## Overview

Add `workit logs <slug> [project]` — a minimal pm2-style viewer for the setup-script logs produced by the async runner (see origin: `docs/plans/2026-04-17-001-feat-run-setup-script-async-plan.md`). Default action: print the last 10 lines of each relevant `.log` file, then follow live until each project's `.status` sentinel appears, then exit with the aggregate exit code.

## Problem Statement

The async-setup change moves failure discoverability off-CLI. Today a user must memorise the log path the `new` command printed, know there is a sibling `.status` file, and shell out to `tail -f`. There is no workit-native way to watch the script finish or see why it failed. The data is already on disk; the CLI just doesn't expose it.

## Proposed Solution

One subcommand, one optional second argument, one flag:

```
workit logs <slug> [project]
  -n, --lines <N>   history lines to backfill per project (default: 10, 0 = none)
```

Behaviour:

- **`workit logs <slug>`** — for every `<project>.log` under `~/.workit/logs/<slug>/`: print the last N lines with a colored `[project]` prefix, then follow all files concurrently. Exit when every project has a sentinel. CLI exit code: `0` if every sentinel is `0`, else `1`.
- **`workit logs <slug> <project>`** — same thing, one file, no prefix. CLI exit code = the project's exit code.
- **Follow always on, self-terminating.** Setup scripts are finite. When the status file appears, the loop flushes any trailing bytes and exits. For already-completed runs, the follow loop sees the sentinel on its first tick and exits immediately — one code path handles "still running", "just finished", and "long done".
- **Unknown slug / project** → `error()` + exit `1`.
- **SIGINT** → exit `130` (node default; no custom wiring needed).

Everything else is intentionally out: no `workit logs` with no args, no `--status`, no `--no-follow`, no `--raw`, no `log` alias. If a user wants the raw file, it's a `cat` away.

## Technical Considerations

- **No new dependencies.** Polling `Bun.file(path).stat().size` every 200ms and reading appended bytes with `.slice(start, end).text()` is sufficient. Avoids `fs.watch` quirks (macOS FSEvents batching) and cross-platform `tail` shelling.
- **Backfill.** Read the whole file once, `split('\n')`, drop a single trailing empty element if present (the `\n` terminator artifact), `slice(-N)`, print. Capture `offset = stat.size` **after** the backfill read so the follow loop doesn't reprint bytes or miss bytes that arrived between `stat` and `text()`.
- **Completion race — flush order.** The bash wrapper writes the status file *after* the script exits, but log bytes may still be flushing. Each poll tick reads the log *first*, then checks the sentinel — so the final chunk is always flushed before exit.
- **Completion race — empty status file.** `echo $? > file` in bash truncates-then-writes, leaving a narrow window where the file exists but is empty. Treat an empty or non-integer status file as "not yet" and keep polling; only accept a parseable integer as terminal.
- **Line buffering.** A chunk may split a line. Keep a per-file `partial` buffer; split on `\n`, keep the trailing partial for next tick; flush it on exit if non-empty.
- **Multiplexed output.** Reuse `prefixLine` + `colorFor` (`src/ui/log.ts:3-15`) — no new UI helpers.
- **Reuse.** `logsDirFor(slug)` is already exported from `src/setup/runner.ts:43`. Import it, don't re-derive.
- **Log truncation guard.** If `next < offset` mid-follow (a concurrent `workit new` with the same slug truncated the file), reset `offset = 0` silently. No warning — it's rare and the output speaks for itself.

## System-Wide Impact

- **Interaction graph.** `cli.ts` → `runLogsCommand` → filesystem only. No touchpoints with git, terminal backends, or `runNewCommand`.
- **Error propagation.** Unknown slug / project: `error()` + exit 1. All other errors: bubble to the CLI's generic try/catch at `src/cli.ts:73-76`.
- **State lifecycle.** Read-only. One open file handle per followed project for the duration of the command.
- **API surface.** Adds one exported function (`runLogsCommand`) and one interface (`RunLogsArgs`) from `src/commands/logs.ts`. Nothing else leaks.
- **Integration test scenarios.**
  1. `workit logs <slug> <project>` on a completed run — backfill printed, final `✓ ok` line, exit 0.
  2. `workit logs <slug>` with 2 completed projects — both backfills printed with `[project]` prefixes, both status lines, exit 0.
  3. `workit logs <slug>` with one running project — live lines appear, then status line when sentinel arrives, exit matches.
  4. Failed script — exit non-zero, `✗ failed (exit N)` printed.
  5. Unknown slug / unknown project — exit 1, clear error.
  6. `-n 0` — no backfill, live lines only.

## Acceptance Criteria

### Functional

- [ ] `workit logs <slug>` backfills the last 10 lines of every project and follows them all until every sentinel is present. Exit 0 if all ok, 1 otherwise.
- [ ] `workit logs <slug> <project>` does the same for a single project; CLI exits with that project's exit code.
- [ ] `-n, --lines <N>` overrides the backfill count. `-n 0` skips backfill entirely.
- [ ] Unknown slug → exit 1, friendly error. Unknown project under a valid slug → exit 1, friendly error.
- [ ] SIGINT during follow exits cleanly (no stack trace).

### Non-functional

- [ ] No new npm dependencies.
- [ ] Idle CPU < 1% during follow (200 ms poll, small stat calls).
- [ ] Already-completed runs return in under one poll interval.

### Quality gates

- [ ] `bun run typecheck` passes.
- [ ] `bun test` passes, with a new `tests/integration/logs.test.ts` covering scenarios 1–6.
- [ ] No regression in existing tests.

## MVP

### src/commands/logs.ts (new — single file, ~120 lines)

```ts
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { logsDirFor } from '../setup/runner';
import { pathExists } from '../utils/fs';
import { error, success, colorFor, prefixLine } from '../ui/log';

export interface RunLogsArgs {
  slug: string;
  project?: string;
  lines: number; // 0 = no backfill
}

export interface RunLogsResult { exitCode: number }

interface Entry {
  project: string;
  logPath: string;
  statusPath: string;
}

const POLL_MS = 200;

async function listProjects(slug: string): Promise<Entry[]> {
  const dir = logsDirFor(slug);
  if (!(await pathExists(dir))) return [];
  const names = await readdir(dir);
  return names
    .filter((n) => n.endsWith('.log'))
    .map((n) => {
      const project = n.slice(0, -'.log'.length);
      return {
        project,
        logPath: join(dir, n),
        statusPath: join(dir, `${project}.status`),
      };
    })
    .sort((a, b) => a.project.localeCompare(b.project));
}

async function readExitCode(statusPath: string): Promise<number | null> {
  if (!(await pathExists(statusPath))) return null;
  const n = Number.parseInt((await Bun.file(statusPath).text()).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

async function tail(
  entry: Entry,
  lines: number,
  emit: (line: string) => void,
): Promise<void> {
  let partial = '';

  if (lines > 0) {
    const text = await Bun.file(entry.logPath).text();
    const all = text.split('\n');
    if (all.length > 0 && all[all.length - 1] === '') all.pop(); // drop trailing-newline artifact
    for (const line of all.slice(-lines)) emit(line);
  }
  let offset = (await Bun.file(entry.logPath).stat()).size;

  while (true) {
    const size = (await Bun.file(entry.logPath).stat()).size;
    if (size < offset) offset = 0; // re-truncated
    if (size > offset) {
      const chunk = await Bun.file(entry.logPath).slice(offset, size).text();
      const combined = partial + chunk;
      const parts = combined.split('\n');
      partial = parts.pop() ?? '';
      for (const line of parts) emit(line);
      offset = size;
    }
    const code = await readExitCode(entry.statusPath);
    if (code !== null) {
      if (partial) { emit(partial); partial = ''; }
      return;
    }
    await Bun.sleep(POLL_MS);
  }
}

export async function runLogsCommand(args: RunLogsArgs): Promise<RunLogsResult> {
  const projects = await listProjects(args.slug);
  if (projects.length === 0) {
    error(`no logs for "${args.slug}"`);
    return { exitCode: 1 };
  }

  let targets = projects;
  if (args.project) {
    const only = projects.find((p) => p.project === args.project);
    if (!only) {
      error(`no log for "${args.project}" under "${args.slug}"`);
      return { exitCode: 1 };
    }
    targets = [only];
  }

  const multi = targets.length > 1;
  const width = Math.max(...targets.map((t) => t.project.length + 2));

  await Promise.all(
    targets.map((t) =>
      tail(t, args.lines, (line) => {
        if (!multi) console.log(line);
        else console.log(colorFor(t.project)(prefixLine(t.project, line, width)));
      }),
    ),
  );

  // tail() only returns once the status file has a parseable integer, so
  // readExitCode here always succeeds. (SIGINT before that exits the process
  // at 130 via Node's default handler — no custom wiring.)
  let anyFailed = false;
  let singleExit = 0;
  for (const t of targets) {
    const code = (await readExitCode(t.statusPath)) ?? 0;
    if (code === 0) {
      success(`${t.project} ok`);
    } else {
      error(`${t.project} failed (exit ${code})`);
      anyFailed = true;
      singleExit = code;
    }
  }

  if (!multi) return { exitCode: singleExit };
  return { exitCode: anyFailed ? 1 : 0 };
}
```

### src/cli.ts (changes)

```ts
program
  .command('logs <slug> [project]')
  .description('View and follow setup-script logs (pm2-style)')
  .option('-n, --lines <n>', 'history lines to backfill per project', '10')
  .action(async (slug: string, project: string | undefined, opts) => {
    try {
      const lines = Number.parseInt(opts.lines, 10);
      if (!Number.isFinite(lines) || lines < 0) throw new Error(`invalid --lines: ${opts.lines}`);
      const { exitCode } = await runLogsCommand({ slug, project, lines });
      if (exitCode !== 0) process.exit(exitCode);
    } catch (e: any) {
      error(e.message ?? String(e));
      process.exit(1);
    }
  });
```

### tests/integration/logs.test.ts (new)

- Seed `~/.workit/logs/<slug>/` via a tmp `HOME` override (already patterned in `tests/integration/new.test.ts:11-32`).
- Cover the six integration scenarios.

### tests/unit/logs.test.ts (new)

- `listProjects` returns empty for missing dir, sorts by project name.
- `readExitCode` parses `0`, `2`, and returns `null` for missing file.
- `tail` with `lines=0` emits nothing from backfill.
- `tail` emits buffered partial line only after trailing newline or sentinel.
- `tail` resets offset when file is re-truncated mid-follow.

## Success Metrics

- Users can investigate a setup failure with one command and no path memorisation.
- No new runtime dependencies.

## Dependencies & Risks

- **Dependency:** parent plan landed (`docs/plans/2026-04-17-001-feat-run-setup-script-async-plan.md`, status `completed`). This command reads the files that plan produces.
- **Risk:** path traversal via user-supplied `slug` / `project` (`../etc/passwd`). Mitigation: `logsDirFor(slug)` uses `path.join` which does not strip `..`, so guard by checking `entry.logPath.startsWith(logsDirFor(args.slug))` before reading. One line, one unit test.
- **Risk:** huge log files could blow memory on backfill (`.text()` reads it all). Mitigation: setup scripts are bounded (`bun install` output is O(MB), not O(GB)); revisit if a user hits this.
- **Risk — follow hangs on orphan processes.** If the setup script is killed abnormally (SIGKILL, OOM, host reboot, unreffed child severed from the bash wrapper) before the wrapper writes the sentinel, the status file is never produced and the follow loop polls forever. Mitigation for this PR: Ctrl-C exits cleanly (130) — document this in `--help` as the escape. Deferred follow-up: a stale-heartbeat detector (e.g. "no log growth AND no sentinel for 5 min → give up with a warning") or persisting pid alongside the status file for `kill -0` liveness checks. Tracked in "Follow-ups".

## Alternatives Considered

- **Shelling out to `tail -F`.** No Windows support, no hook for the final status line, leaks a child on SIGINT. Rejected.
- **Adding `chokidar` / `tail-file` deps.** Overkill for a 200ms poll loop on a bounded file. Rejected.
- **`workit logs` with no args (list all slugs) + `--status` / `--no-follow` / `--raw` flags.** All cuttable: listing slugs is a `ls ~/.workit/logs/` away, `--no-follow` is subsumed by the self-terminating follow on completed runs, `--status` can wait for the follow-up `workit status` command, `--raw` is only useful for single-project (already unprefixed) or complex piping (rare). Deferred.
- **`log` alias for `logs`.** One line of code, but every extra alias is another surface users must learn. Deferred.

## Follow-ups (out of scope)

- `workit status <slug>` — scriptable machine-readable summary (already listed in parent plan's follow-ups).
- Cleanup of `~/.workit/logs/<slug>/` inside `workit rm`.
- Listing all slugs (`workit logs` with no args) if users ask for it.
- Stale-heartbeat detection / pid-liveness checks so `workit logs` gives up on orphaned processes instead of polling forever.

## Sources & References

### Internal

- Origin (produces the files this command reads): `docs/plans/2026-04-17-001-feat-run-setup-script-async-plan.md`
- Log path helper to reuse: `src/setup/runner.ts:43` (`logsDirFor`)
- Log / status file writer: `src/setup/runner.ts:51-98` (`spawnDetached`)
- CLI command registration pattern: `src/cli.ts:23-77`
- Simplest existing command to mirror: `src/commands/ls.ts:30-40`
- UI helpers: `src/ui/log.ts` (`info`, `error`, `success`, `warn`, `prefixLine`, `colorFor`)
- Test fixture pattern: `tests/integration/new.test.ts:11-32` (HOME override + `waitForFile`)

### External

- `Bun.file().slice().text()` and `Bun.file().stat()` — Bun v1.2 docs.
- pm2 logs behaviour reference: default 15 lines of history then follow (we use 10 as the default).
