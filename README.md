# workit

CLI workflow manager for multi-project git worktrees.

## Install

### Bun (recommended)

```bash
bun install -g workit
```

Requires [Bun](https://bun.sh) ≥ 1.1.

### Prebuilt binary (no Bun required)

Download the binary matching your platform from the [latest release](https://github.com/Asifm95/workit/releases/latest):

- macOS Apple Silicon: `workit-darwin-arm64`
- macOS Intel: `workit-darwin-x64`
- Linux x64: `workit-linux-x64`
- Linux ARM64: `workit-linux-arm64`
- Windows x64: `workit-windows-x64.exe`

Then `chmod +x workit-<your-platform>` and move it onto your `PATH`.

### Homebrew (future)

Planned: `brew install <your-tap>/workit` — wraps the prebuilt binary above.

### From source (Bun)

```bash
bun install
bun run dev -- new
```

## Usage

```bash
workit new "Add DAC7 reporting"
workit new "Fix header bug" --type fix --projects storelink-dashboard
workit ls
workit rm add-dac7-reporting --delete-branch
workit config
```

## Design

See `docs/specs/2026-04-12-workit-design.md` and `docs/plans/2026-04-12-workit-implementation.md`.
