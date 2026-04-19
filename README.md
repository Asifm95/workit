# workit

A CLI for managing development across multi repo projects. Designed for running AI agents in parallel.

## Context

Most coding-agent TUIs and GUIs — Conductor, Superset, Codex app, t3code, etc — all support running parallel agents for a project using worktrees. This works well as long as the feature development is confined to a single repo. But since all these tools assumes one project per workspace, it doesn't work when a feature development spans across multiple repos. Things like planning, context sharing and working for the agents across multiple repos becomes difficult. Muti phased implementation of features across multiple repos becomes even more difficult.

`workit` solves this by scaffolding a multi repo workspace per feature. Inside the workspace, it sets up the worktree per repo that needs to be worked on. `workit` ships with many helpful commands to help simplify working with many parallel repos.

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
