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
brew tap Asifm95/workit && brew install workit`
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
workit new "Add DAC7 reporting"
workit new "Fix header bug" --type fix --projects storelink-dashboard
workit ls
workit rm add-dac7-reporting --delete-branch
workit config
```
