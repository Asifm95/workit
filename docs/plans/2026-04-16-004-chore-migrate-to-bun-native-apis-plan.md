---
title: Migrate file I/O to Bun-native APIs, add cross-compiled binary matrix, and switch to Bun-only distribution
type: chore
status: completed
date: 2026-04-16
---

# Migrate file I/O to Bun-native APIs, add cross-compiled binary matrix, and switch to Bun-only distribution

## Overview

Three scoped changes that together push the codebase to fully Bun-native:

1. **File I/O** — replace `node:fs/promises` `readFile`/`writeFile`/`access` with `Bun.file()` / `Bun.write()` / `Bun.file().exists()` (and `Bun.file().json()` for the two JSON read sites). Keep `readdir`, `mkdir`, `rm`, `realpath`, `mkdtemp`, `chmod` on `node:fs/promises` — Bun has no native equivalent and the docs explicitly recommend `node:fs` for those.
2. **Build matrix** — replace the single `build:binary` script (which only produces a binary for the host platform/arch) with explicit cross-compile scripts for the platforms we ship: macOS (x64, arm64), Linux (x64, arm64), and Windows (x64). `bun build --compile --target=bun-<platform>-<arch>` cross-compiles into a self-contained binary that bundles the Bun runtime — one invocation per target.
3. **Distribution** — drop the Node-targeted `build:npm` script. Distribute via three paths instead: (a) **npm registry** for Bun users (`bun install -g workit`); the published `bin/workit` includes a runtime check that errors clearly if launched under Node; (b) **prebuilt binaries** on GitHub Releases for users without Bun; (c) **Homebrew tap** wrapping the binaries.

Out of scope (per user direction): `execa` and `picocolors` stay. `commander`, `@clack/prompts`, `zod`, `node:path`, `node:os`, `node:readline` also stay.

## Problem Statement / Motivation

### File I/O

The codebase reads/writes individual files in eight places using `node:fs/promises`. Bun's first-class file API is faster, integrates with `Bun.write` for atomic-ish writes, and uses Web standard primitives (Blob, ReadableStream). Two of the read sites parse JSON — `Bun.file(p).json()` collapses two operations into one. The change is mechanical: same shape, fewer imports.

### Binary build matrix

The current `build:binary` script:

```bash
bun build src/cli.ts --compile --outfile=dist/workit
```

…produces a binary **only for the host platform and architecture**. A maintainer on Apple Silicon ships an arm64 macOS binary; a CI runner on Linux x64 ships a Linux x64 binary. To distribute precompiled `workit` binaries to all common dev environments we need to invoke `bun build --compile` once per target. Bun supports this cleanly via `--target=bun-<platform>-<arch>` and bundles the matching Bun runtime into each output, so cross-compilation works from any host.

## Proposed Solution

### Part A — File I/O migration

Map each `node:fs/promises` API to its Bun-native equivalent (where one exists), wrap behind the existing helpers in `src/utils/fs.ts`, and update the seven test files that read/write files directly.

### Part B — Multi-platform binary builds

Replace the single `build:binary` script with one script per target plus a `build:binaries` umbrella that runs all of them. Outputs land under `dist/` with predictable names so CI can pick them up.

### Part C — Distribution

Drop the Node bundle (`build:npm`) and adopt a three-track distribution model:

| Track                        | Audience          | Mechanism                                                                                                            |
| ---------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| **npm registry**             | Bun users         | `bun install -g workit`. Same package.json, same `bin` entry, but the binary is a Bun script with a runtime check.   |
| **GitHub Releases binaries** | Users without Bun | Download `workit-<platform>-<arch>` from a release page; chmod and put on PATH. Built by Phase 2's `build:binaries`. |
| **Homebrew tap (future)**    | macOS users       | Tap formula points at the GitHub Release binary for the host arch. Wraps the binary track; no source build.          |

A small shim in `bin/workit` (or in `src/cli.ts` itself) detects when launched under Node and emits a clear "this requires Bun" message before exiting non-zero. This protects the npm-installed-on-Node case from a confusing `ReferenceError: Bun is not defined`.

## Technical Considerations

### Bun.file / Bun.write reference

| Today (node:fs/promises)                | After (Bun-native)           |
| --------------------------------------- | ---------------------------- |
| `await readFile(p, 'utf8')`             | `await Bun.file(p).text()`   |
| `await writeFile(p, str)`               | `await Bun.write(p, str)`    |
| `await access(p)` (existence check)     | `await Bun.file(p).exists()` |
| `JSON.parse(await readFile(p, 'utf8'))` | `await Bun.file(p).json()`   |

`Bun.file(p).exists()` returns `true` for files **and** directories in current Bun versions, matching the prior `access(p)` semantics used by `pathExists`. Verify against the existing `tests/unit/utils/fs.test.ts` `ensureDir` + `pathExists` test, which passes a directory path. If a future Bun version narrows `.exists()` to files only, fall back to `Bun.file(p).stat()` and check.

`Bun.write` accepts `string | ArrayBuffer | Blob | BunFile | Response | TypedArray` — passing a JSON string is the same shape we use today. The current `writeJsonFile` appends a trailing newline; preserve that.

### What stays on node:fs/promises

Bun's own docs (file-io page) say: _"Using node:fs for directory operations: `import { readdir, mkdir } from "node:fs/promises";`"_. So:

- `readdir` (with `withFileTypes`) — `src/commands/ls.ts`, `src/commands/rm.ts`, `src/ui/directory-picker.ts`, several tests
- `mkdir` (recursive) — `src/utils/fs.ts` `ensureDir`, several tests
- `rm` (recursive) — `src/commands/rm.ts`, all integration/unit test cleanup
- `realpath` — `src/commands/rm.ts`
- `mkdtemp` — all test fixtures and integration tests
- `chmod` — `tests/integration/new.test.ts`, `tests/unit/setup/runner.test.ts`

These imports stay. We just narrow them to only what each file actually needs.

### Bun cross-compile targets

`bun build --compile` supports the following targets relevant to a CLI like workit:

| Target string            | Output platform                         |
| ------------------------ | --------------------------------------- |
| `bun-darwin-arm64`       | macOS Apple Silicon                     |
| `bun-darwin-x64`         | macOS Intel                             |
| `bun-linux-x64`          | Linux x64 (glibc)                       |
| `bun-linux-x64-baseline` | Linux x64, pre-2013 CPUs                |
| `bun-linux-arm64`        | Linux ARM64 (Graviton, Raspberry Pi 4+) |
| `bun-linux-x64-musl`     | Linux x64 musl (Alpine)                 |
| `bun-linux-arm64-musl`   | Linux ARM64 musl (Alpine)               |
| `bun-windows-x64`        | Windows x64                             |

Each invocation produces a single self-contained executable that bundles the Bun runtime; no Bun install required on the target. Cross-compilation works from any host (e.g. macOS arm64 → Linux x64 binary).

**Recommended initial matrix**: macOS arm64, macOS x64, Linux x64, Linux arm64, Windows x64. Add musl variants only if a user reports an Alpine container regression. Skip baseline unless we get a report from a pre-2013 CPU.

## Acceptance Criteria

### File I/O

- [ ] No `import { readFile, writeFile, access }` from `node:fs/promises` anywhere in `src/` or `tests/`
- [ ] `node:fs/promises` imports limited to `readdir`, `mkdir`, `rm`, `realpath`, `mkdtemp`, `chmod`
- [ ] `src/utils/fs.ts` `pathExists`, `readJsonFile`, `writeJsonFile` use `Bun.file` / `Bun.write` internally; signatures unchanged
- [ ] `bun test` passes (all 17 test files)
- [ ] `bun run typecheck` passes

### Build matrix

- [ ] `package.json` exposes one `build:binary:<target>` script per platform we ship plus an umbrella `build:binaries` that runs all of them
- [ ] Each target produces a binary at a predictable path under `dist/` (e.g. `dist/workit-darwin-arm64`, `dist/workit-windows-x64.exe`)
- [ ] `dist/` is in `.gitignore` (already is)
- [ ] At least one binary verified by running `./dist/workit-<host>-<arch> ls` after build (smoke check)

### Distribution

- [ ] `build:npm` script removed from `package.json`
- [ ] `package.json` `bin` entry points to a Bun shebang script (e.g. `bin/workit` with `#!/usr/bin/env bun`) — or `src/cli.ts` directly if simpler
- [ ] Runtime check at the top of the entry: if `typeof Bun === 'undefined'`, print "workit requires the Bun runtime — install from https://bun.sh" and `process.exit(1)`
- [ ] `package.json` keeps `engines.bun` and adds `engines.node: false` (or omits `node` entirely) so engine-strict installers warn early
- [ ] README "Install" section rewritten with three sections: Bun (npm registry), Prebuilt binary (GitHub Releases), Homebrew (future)
- [ ] `npm install -g workit` followed by running `workit` under Node prints the runtime-check message (not a stack trace) — manually verified

## Implementation Plan

### Phase 1 — File I/O migration

#### 1.1 — Rewrite `src/utils/fs.ts`

```typescript
// src/utils/fs.ts
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export function expandUser(p: string): string {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

export async function pathExists(p: string): Promise<boolean> {
  return Bun.file(p).exists();
}

export async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

export async function readJsonFile<T = unknown>(p: string): Promise<T> {
  return (await Bun.file(p).json()) as T;
}

export async function writeJsonFile(p: string, data: unknown): Promise<void> {
  await ensureDir(dirname(p));
  await Bun.write(p, JSON.stringify(data, null, 2) + '\n');
}
```

Drops `readFile`, `writeFile`, `access` from the import list.

#### 1.2 — Migrate `src/commands/new.ts`

Lines 1, 79, 91 currently use `readFile` and `writeFile`:

```typescript
// src/commands/new.ts (header)
// Remove:
//   import { readFile, writeFile } from 'node:fs/promises';
// (the basename, join imports stay)

// Inside runNewCommand:
if (await pathExists(tplPath)) {
  const tpl = await Bun.file(tplPath).text();
  const rendered = renderTemplate(tpl, {
    /* unchanged */
  });
  await Bun.write(join(plan.workspacePath, 'CLAUDE.md'), rendered);
}
```

#### 1.3 — Migrate test files

Each test currently writes fixture files via `writeFile` and reads them back via `readFile`. Mechanical swap; no behavioral change. Files:

- `tests/integration/new.test.ts` — `readFile` (1 site) + `writeFile` (multiple). Keep `mkdtemp`, `rm`, `chmod`, `mkdir` from `node:fs/promises`.
- `tests/integration/rm.test.ts` — `writeFile` only.
- `tests/unit/git/repo.test.ts` — `writeFile` only (no `node:fs/promises` import survives).
- `tests/unit/utils/fs.test.ts` — `writeFile` + `readFile`.
- `tests/unit/commands/ls.test.ts` — `writeFile`.
- `tests/unit/core/config.test.ts` — `writeFile`.
- `tests/unit/setup/runner.test.ts` — `writeFile` (keep `chmod`, `mkdir`, `mkdtemp`, `rm`).
- `tests/fixtures/make-repo.ts` — `writeFile` (keep `mkdtemp`, `rm`).

Pattern for each:

```typescript
// before
import { writeFile } from 'node:fs/promises';
await writeFile(join(dir, 'README.md'), 'hi\n');

// after — remove writeFile from the import line, then:
await Bun.write(join(dir, 'README.md'), 'hi\n');
```

For reads:

```typescript
// before
import { readFile } from 'node:fs/promises';
const content = await readFile(p, 'utf8');

// after — remove readFile from the import line, then:
const content = await Bun.file(p).text();
```

After this phase, `grep -rE "from 'node:fs/promises'" src tests` should only show imports of `{ readdir, mkdir, rm, realpath, mkdtemp, chmod }` (in some subset per file).

### Phase 2 — Multi-platform binary build

#### 2.1 — Update `package.json` scripts

```jsonc
{
  "scripts": {
    "dev": "bun run src/cli.ts",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "build:binary:darwin-arm64": "bun build src/cli.ts --compile --target=bun-darwin-arm64 --outfile=dist/workit-darwin-arm64",
    "build:binary:darwin-x64": "bun build src/cli.ts --compile --target=bun-darwin-x64   --outfile=dist/workit-darwin-x64",
    "build:binary:linux-x64": "bun build src/cli.ts --compile --target=bun-linux-x64    --outfile=dist/workit-linux-x64",
    "build:binary:linux-arm64": "bun build src/cli.ts --compile --target=bun-linux-arm64  --outfile=dist/workit-linux-arm64",
    "build:binary:windows-x64": "bun build src/cli.ts --compile --target=bun-windows-x64  --outfile=dist/workit-windows-x64.exe",
    "build:binaries": "bun run build:binary:darwin-arm64 && bun run build:binary:darwin-x64 && bun run build:binary:linux-x64 && bun run build:binary:linux-arm64 && bun run build:binary:windows-x64",
    "typecheck": "tsc --noEmit",
  },
}
```

Notes:

- `build:npm` removed (Phase 3.1 covers the rationale and replacement distribution paths).
- Keep `build:binary:<target>` granular so CI matrices and release pipelines can fan out one target per job.
- The umbrella `build:binaries` is sequential; switch to `&` (background) or a small `Bun.spawn` script if parallel builds become useful. Sequential is safer because each `bun build --compile` is CPU-intensive.
- Output filenames embed platform+arch so a release pipeline can upload them as-is.

### Phase 3 — Distribution

#### 3.1 — Drop `build:npm` and `dist/cli.js`

`Bun.file`, `Bun.write`, etc. are Bun globals. After Phase 1, the bundle calls them; `bun build --target=node` would emit those calls verbatim and Node would throw `ReferenceError: Bun is not defined` at runtime. The Node bundle would be permanently broken — there's no point producing it.

**Action**: remove the `build:npm` script. Anyone who needs Node compatibility uses a prebuilt binary instead.

#### 3.2 — Update `package.json` `bin` and engines

```jsonc
{
  "bin": {
    "workit": "./bin/workit",
  },
  "engines": {
    "bun": ">=1.1.0",
  },
}
```

The `bin` entry points at a tiny launcher (Phase 3.3) instead of `dist/cli.js`. This way `bun install -g workit` (which pulls from the npm registry) installs a working CLI without any prebuild step — Bun executes `src/cli.ts` directly via the launcher.

Drop the `engines.node` field entirely (or set it to a value that no Node version satisfies, like `"node": "x"`) so `npm install` with engine-strict mode warns. We can't fully prevent `npm install -g workit` under Node, but the runtime check (Phase 3.3) catches the rest.

#### 3.3 — Add `bin/workit` runtime-check launcher

```typescript
#!/usr/bin/env bun
// bin/workit
if (typeof (globalThis as any).Bun === 'undefined') {
  process.stderr.write(
    'workit requires the Bun runtime.\n' +
      'Install Bun: https://bun.sh\n' +
      'Or download a prebuilt binary: https://github.com/<owner>/workit/releases\n',
  );
  process.exit(1);
}
import('../src/cli.ts');
```

Two reasons this is a separate file rather than a check inside `src/cli.ts`:

- Keeps `src/cli.ts` clean for `bun build --compile` (the binary doesn't need the check; `Bun` is always defined inside it).
- The shebang `#!/usr/bin/env bun` only fires when Bun is on PATH. If a user installs under Node and `bun` isn't on PATH, the shebang fails immediately with a clearer error than a stack trace.

Make sure to `chmod +x bin/workit` and include `bin/` in the npm package via the `files` field:

```jsonc
{
  "files": ["src/", "bin/", "bunfig.toml", "tsconfig.json"],
}
```

#### 3.4 — Update README install section

````markdown
## Install

### Bun (recommended)

```bash
bun install -g workit
```
````

Requires [Bun](https://bun.sh) ≥ 1.1.

### Prebuilt binary (no Bun required)

Download the binary matching your platform from the [latest release](https://github.com/<owner>/workit/releases/latest):

- macOS Apple Silicon: `workit-darwin-arm64`
- macOS Intel: `workit-darwin-x64`
- Linux x64: `workit-linux-x64`
- Linux ARM64: `workit-linux-arm64`
- Windows x64: `workit-windows-x64.exe`

Then `chmod +x workit-<your-platform>` and move it onto your `PATH`.

### Homebrew (future)

Planned: `brew install <your-tap>/workit` — wraps the prebuilt binary above.

```

The current README's "npm install -g workit" line goes away; "From source (Bun)" stays.

### Phase 4 — Verification

- [ ] `bun test` passes locally
- [ ] `bun run typecheck` passes
- [ ] `bun run dev -- ls` runs (sanity)
- [ ] `bun run build:binary:<host>-<arch>` produces a binary; run `./dist/workit-<host>-<arch> ls` to confirm
- [ ] Run `bun run build:binaries` end-to-end on a developer machine; confirm all five outputs land in `dist/`
- [ ] In a Node-only environment: simulate `node bin/workit` (or `npm install` then run with Bun absent from PATH) and confirm the runtime-check message prints, not a stack trace

## Files Touched

### Source

- `src/utils/fs.ts` — drop `readFile`, `writeFile`, `access` imports; switch `pathExists`, `readJsonFile`, `writeJsonFile` to Bun-native (Phase 1.1)
- `src/commands/new.ts` — drop `readFile`, `writeFile` imports; switch the two call sites (Phase 1.2)

### Tests

- `tests/integration/new.test.ts` (Phase 1.3)
- `tests/integration/rm.test.ts` (Phase 1.3)
- `tests/unit/git/repo.test.ts` (Phase 1.3)
- `tests/unit/utils/fs.test.ts` (Phase 1.3)
- `tests/unit/commands/ls.test.ts` (Phase 1.3)
- `tests/unit/core/config.test.ts` (Phase 1.3)
- `tests/unit/setup/runner.test.ts` (Phase 1.3)
- `tests/fixtures/make-repo.ts` (Phase 1.3)

### Config

- `package.json` — drop `build:npm`; replace `build:binary` with the five `build:binary:<target>` scripts plus `build:binaries`; update `bin` to point at `bin/workit`; add `files` array (Phase 2.1, 3.1, 3.2)
- `bin/workit` — **new** runtime-check launcher (Phase 3.3)
- `README.md` — install section rewrite (Phase 3.4)

## Alternative Approaches Considered

### File I/O

- **Use `Bun.file().writer()` (`FileSink`) for all writes.** Useful for incremental/streaming writes; we only do one-shot writes. **Rejected** — `Bun.write` is the simpler primitive for our use case.
- **Skip the migration; `node:fs/promises` works fine on Bun.** True, but the user explicitly asked to make the repo Bun-native, and the migration is mechanical with no behavioral risk. **Rejected.**

### Build matrix

- **Single `build:binary` that detects the host and only builds for that.** Forces every release to come from a per-platform CI runner. **Rejected** — Bun's cross-compile is the explicit reason to use a single host.
- **Drop the umbrella `build:binaries` and rely on CI matrix only.** Convenient locally to build all five with one command; the umbrella adds no maintenance cost. **Kept.**
- **Include musl + baseline variants up front.** Doubles the matrix; no demand yet. **Defer until reported.**

### Distribution

- **Keep `build:npm` and a Node-targeted bundle.** Would require shimming every `Bun.*` call back to `node:fs/promises` — defeats the point of Phase 1. **Rejected.**
- **Drop npm publishing entirely; binaries only.** Bun users lose the `bun install -g workit` ergonomics. The npm registry is the most discoverable channel. **Rejected.**
- **Publish a separate `workit-bin` npm package that downloads the right binary in `postinstall`.** Common pattern (esbuild, swc) but adds complexity and a download step. The binary-from-Releases path covers the same audience without the registry detour. **Defer until requested.**
- **Use `bunx workit` as the primary install path.** `bunx` works without global install but doesn't replace a globally-installed CLI for daily use. **Documented as a "try without installing" option only.**
- **Custom `curl | sh` installer script.** Same audience as the binary download path; nice-to-have, not blocking. **Defer.**

## Dependencies & Risks

### File I/O

- **`Bun.file().exists()` semantics drift**: if a future Bun version narrows it to files only, `pathExists` regresses for directory paths. Watch the existing `pathExists` test.
- **Trailing-newline preservation**: `writeJsonFile` appends `'\n'` today; the new implementation must too. The `Bun.write(p, str + '\n')` call preserves it.
- **`Bun.file(p).json()` on missing file**: throws. The current `readJsonFile` also throws via `JSON.parse`. Same behavior.
- **`Bun.file(p).json()` on invalid JSON**: throws a `SyntaxError`. The existing code throws a wrapped `Error` with the JSON parse message at `src/core/config.ts:51`. The catch site already calls `(err as Error).message`, so the user-facing message will still include the parse failure detail — slightly different wording but no behavioral regression.

### Build matrix

- **Cross-compile failures on host**: rare but possible (e.g. corrupt Bun install). Each `bun build --compile` runs independently; the umbrella script's `&&` chain stops on first failure, surfacing the bad target.
- **Binary size**: each output bundles the Bun runtime (~50-90 MB depending on target). Five binaries × ~70 MB ≈ ~350 MB in `dist/`. `dist/` is gitignored, so this only matters for release artifact storage.
- **Windows path quoting**: the `--outfile=dist/workit-windows-x64.exe` script runs on macOS/Linux; the forward slashes in the path resolve correctly. Should not be an issue for local dev.

### Distribution

- **`npm install -g workit` under a Node-only environment**: the runtime check in `bin/workit` prints a clear message and exits non-zero. Users get a pointer to Bun or the prebuilt binary. Bigger risk: if Bun isn't on PATH at all, the `#!/usr/bin/env bun` shebang fails before the script runs — that error (`env: bun: No such file or directory`) is slightly less friendly. Acceptable tradeoff; the binary path exists specifically for this audience.
- **`bin` points at source (`src/cli.ts` via `bin/workit`) rather than a built artifact**: means the published npm package must include `src/`. Confirm the `files` field in `package.json` includes `src/`, `bin/`, `bunfig.toml`, `tsconfig.json` — anything Bun needs to resolve imports at runtime. `node_modules` of transitive deps is pulled in by Bun's installer as usual.
- **Binary release pipeline not in scope**: this plan stops at "scripts produce the binaries locally." A GitHub Actions workflow to build-and-upload on tag is a follow-up.
- **Homebrew tap**: mentioned in README as planned; actual tap setup is a follow-up.

## Sources & References

### Bun documentation (consulted via Context7)

- File I/O — `Bun.file`, `Bun.write`, `BunFile.exists()`, `BunFile.json()`: <https://bun.com/docs/runtime/file-io>
- Single-file executables — `bun build --compile`, `--target` matrix: <https://bun.com/docs/bundler/executables>
- Package binaries — `package.json` `bin` field, `bun install -g`: <https://bun.com/docs/cli/install>

### Internal references

- `src/utils/fs.ts:1` — current `node:fs/promises` imports (target of Phase 1.1)
- `src/commands/new.ts:1` — `readFile`/`writeFile` for template (target of Phase 1.2)
- `src/core/config.ts:51` — current JSON-parse error wrapping (verify behavior unchanged)
- `package.json:13-14` — current `build:npm` and `build:binary` scripts (target of Phase 2)
- `README.md:5-24` — install section (target of Phase 3)
```
