# workit

Spin up cross-project git worktrees ready for coding agents — one command.

## Why

Most coding-agent CLIs and GUIs (Conductor, Superset, t3code, …) are built around a single project per workspace. That breaks the moment a feature touches two or three repos — the agent can't see across them, and you're back to wiring worktrees, setup scripts, and terminal tabs by hand for every feature and every teardown.

`workit` scaffolds a cross-project workspace in one command: a worktree per repo, per-project setup scripts executed, and a terminal session with tabs ready. Have native terminal integrations with `cmux`, `tmux` and `warp`.

## Install

### Bun (recommended)

```bash
bun install -g workit
```

Requires [Bun](https://bun.sh) ≥ 1.1.

### Homebrew (macos)

```bash
brew tap Asifm95/workit && brew install workit
```

### Prebuilt binary

Download the binary matching your platform from the [latest release](https://github.com/Asifm95/workit/releases/latest):

### From source (Bun)

```bash
bun install
bun run dev -- new
```

## Usage

```bash
# Create a new feature
workit new "Add an awesome feature"

# Create a new feature for a specific project
workit new "Fix that annoying bug" --type fix --projects my-project

# List all worktrees
workit ls

# Remove a worktree
workit rm my-feature --delete-branch

# Print the config
workit config
```
