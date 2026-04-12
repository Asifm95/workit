# workit

CLI workflow manager for multi-project git worktrees.

## Install

### From source (Bun)

```bash
bun install
bun run dev -- new
```

### npm (global)

```bash
npm install -g workit
```

### Homebrew (tap)

```bash
brew install <your-tap>/workit
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
