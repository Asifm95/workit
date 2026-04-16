---
date: 2026-04-16
topic: terminal-backends
focus: alternative terminal backends beyond tmux and cmux
---

# Ideation: Alternative Terminal Backends for workit

## Codebase Context

workit is a CLI workflow manager for multi-project git worktrees. After creating worktrees, it dispatches to a pluggable terminal backend that opens N "tabs" (each with `{name, cwd}`) under a workspace name.

**Existing backends** (`src/terminal/`):
- `tmux.ts` — CLI multiplexer; `new-session` + `new-window` per tab
- `cmux.ts` — macOS GUI multiplexer via its CLI; `new-workspace` + `new-surface` + `send`
- `none.ts` — fallback that prints worktree paths

**Backend contract** (`src/terminal/index.ts`): `dispatchBackend({ backend, config, featureSlug, workspacePath, tabs })` where every new backend only needs to consume `featureSlug` + `TabSpec[]`. Selection honors `--flag`, in-session env detection, `config.defaultTerminal`, then availability.

Any new backend is additive — the interface is stable and every survivor below maps cleanly onto it. 36 raw candidates were generated across four ideation frames (native GUI terminals, multiplexers/TUI, IDE/editor, novel/cross-cutting); 21 were rejected for duplication, scope mismatch, or poor leverage.

## Ranked Ideas

### 1. Zellij — declarative Rust multiplexer
**Description:** Generate a per-workspace `.kdl` layout (one `tab` block per `TabSpec` with `cwd`) and invoke `zellij --session workit-<slug> --layout <file>`. Incremental tabs via `zellij action new-tab --cwd … --name …`. Attach later with `zellij attach`.
**Rationale:** Modern tmux replacement with declarative layouts, permanent keybind status bar, floating panes, session resurrection. Single static binary (same footprint as tmux) but dramatically better defaults. KDL layout file is commit-able — worktree layouts can live in-repo.
**Downsides:** Smaller ecosystem than tmux; new prefix to learn. KDL less common than YAML.
**Confidence:** 85%
**Complexity:** Low (mirrors tmux backend shape)
**Status:** Unexplored

### 2. WezTerm — `wezterm cli` with native `--workspace`
**Description:** `wezterm cli spawn --cwd <path> --workspace <slug> --new-window` for first tab; `--workspace <slug>` for subsequent; `wezterm cli set-tab-title` for naming. Cross-platform GUI.
**Rationale:** WezTerm already ships a `--workspace` primitive that maps 1:1 onto workit's concept — lowest-impedance GUI integration available. No multiplexer server required. Session restore automatic.
**Downsides:** Requires users to run WezTerm as daily terminal.
**Confidence:** 90%
**Complexity:** Low
**Status:** Unexplored

### 3. Kitty — `kitten @` remote control + `--session` file
**Description:** Two paths: (a) write a kitty session file (`new_tab`, `cd`, `launch` directives per TabSpec) and invoke `kitty --session <file>`; (b) runtime via `kitten @ launch --type=tab --cwd=… --tab-title=…` against `--listen-on unix:@workit-<slug>`.
**Rationale:** Arguably the cleanest remote-control protocol of any terminal — JSON over unix socket, no language runtime needed. Session-file model is a near-perfect fit for workit's all-upfront-tabs contract.
**Downsides:** Requires `allow_remote_control` in kitty config. No native Windows support.
**Confidence:** 90%
**Complexity:** Low
**Status:** Unexplored

### 4. iTerm2 — dynamic profiles + AppleScript/Python API
**Description:** Drop a JSON per worktree into `~/Library/Application Support/iTerm2/DynamicProfiles/` (with `Working Directory`, `Name`), then `osascript` to open a window and create tabs using those profiles. Or use iTerm2's Python API (`iterm2` package over WebSocket) for richer control.
**Rationale:** Dominant macOS power-user terminal. Feels fully native — named tabs in a single workspace window matching the worktree layout.
**Downsides:** macOS-only. Two-step flow (profile write + AppleScript) is noisier than single CLI.
**Confidence:** 85%
**Complexity:** Medium
**Status:** Unexplored

### 5. Ghostty — CLI + macOS AppleScript / Linux D-Bus
**Description:** `ghostty +new-window --working-directory=<path> --title=<name>` for first tab; AppleScript `make new tab at end of tabs of window 1` on macOS or D-Bus `ActivateAction("new-tab", …)` on Linux.
**Rationale:** Ghostty's adoption trajectory is steep in 2026 (Hashimoto ecosystem pull, native rendering, zero-config). Early workit support lands ahead of the crowd.
**Downsides:** Tab-scripting APIs newer/less stable than iTerm2. Linux D-Bus path wordier.
**Confidence:** 75%
**Complexity:** Medium
**Status:** Unexplored

### 6. Windows Terminal — `wt.exe` with chained tabs
**Description:** Single `wt.exe` invocation chaining tabs: `wt -w workit-<slug> new-tab --title "api" -d <cwd> \; new-tab --title "web" -d <cwd> \; …`. Optionally emit a JSON fragment under `Fragments/workit/` for persistent profiles.
**Rationale:** Only meaningful unlock for Windows + WSL users. workit is currently implicitly macOS/Linux-first; this closes the gap. `wt -w <name>` already models workspaces.
**Downsides:** Requires modern Windows Terminal. Workit must handle WSL path translation.
**Confidence:** 80%
**Complexity:** Low-Medium
**Status:** Unexplored

### 7. Warp — Launch Configuration YAML + deep-link
**Description:** Emit `~/.warp/launch_configurations/<slug>.yaml` with `windows[0].tabs[]` (title, `layout.cwd`, optional `commands` preamble), then `open warp://launch/<slug>`.
**Rationale:** Warp is the de-facto "AI terminal" for many devs in 2026. Declarative YAML launch configs map exactly onto workit's upfront-tabs contract. Composes naturally with Warp Agent Mode (each tab can auto-start an agent).
**Downsides:** Warp-specific. YAML lives out-of-repo by default.
**Confidence:** 80%
**Complexity:** Low
**Status:** Unexplored

### 8. Agent-runner per-tab overlay (cross-cutting)
**Description:** Not a new backend — a per-tab command override. Config knob `agent: "claude" | "cursor-agent" | "opencode"` replaces each tab's entry from `$SHELL` to `claude` (or `claude --resume`) in the worktree cwd. Composes with tmux, cmux, Zellij, Warp, Kitty, anything.
**Rationale:** workit's value is "N parallel feature branches at once"; pairing that with "N parallel agents at once" is the natural 2026 workflow. Highest leverage per line of code because it ships on top of every existing and future backend.
**Downsides:** Semantics (session resume, cost, prompt seeding) need care.
**Confidence:** 90%
**Complexity:** Very Low
**Status:** Unexplored

### 9. VS Code / Cursor / Windsurf — multi-root `.code-workspace`
**Description:** Generate `<slug>.code-workspace` with each worktree as a `folders[]` entry, plus `.vscode/tasks.json` with `runOn: folderOpen` shell tasks per worktree (named, `options.cwd`). Invoke `code --new-window <file>.code-workspace`. Cursor / Windsurf ship compatible CLIs.
**Rationale:** For VS Code / Cursor natives, IDE-integrated replacement for a multiplexer — source control, LSP, file search, one named integrated terminal per worktree, all in one window.
**Downsides:** `runOn: folderOpen` tasks prompt for permission on first open. Not a "terminal" strictly.
**Confidence:** 80%
**Complexity:** Medium
**Status:** Unexplored

## Rejection Summary

| # | Idea | Reason Rejected |
|---|------|-----------------|
| 1 | GNU Screen | Duplicate of tmux, worse UX |
| 2 | Byobu | Wrapper on tmux — not standalone |
| 3 | abduco + dvtm | Too niche, no stable named-tab primitive |
| 4 | dtach | Per-process sockets invert "tabs in one workspace" model |
| 5 | Mosh alone | Not a multiplexer; must pair with tmux |
| 6 | teamocil / Smug | Superseded by tmuxinator / tmuxp |
| 7 | Terminal.app | Low leverage; AppleScript tab scripting fragile |
| 8 | Tabby | Electron, niche, weak CLI surface |
| 9 | Blink Shell / mobile | Huge lift, niche audience, needs remote infra |
| 10 | ttyd browser dashboard | Essentially building a separate product |
| 11 | launchd / systemd services | Scope mismatch — new product direction |
| 12 | lazygit-style Dashboard TUI | Not a backend; separate feature (`workit dash`) |
| 13 | Devcontainer per worktree | Valid but heavy; better post-MVP |
| 14 | JetBrains IDE fan-out | IDE-specific, one-window-per-worktree breaks workspace concept |
| 15 | mprocs / Overmind | Process-manager model fits less than "named tabs in a workspace" |
| 16 | Zed multi-path | Similar shape to VS Code; less mature tasks story |
| 17 | tmuxinator / tmuxp / teamocil | Layer on tmux — belongs as tmux-backend variant |
| 18 | Neovim + tmux combo | Subsumed by #8 (per-tab command override) |
| 19 | Generic `$EDITOR`-per-tab | Subsumed by #8 |
| 20 | tmate (share) | Strong but orthogonal — punt to separate `workit share` feature |
| 21 | Remote dev box via Coder/Gitpod | Separate product direction |

## Session Log

- 2026-04-16: Initial ideation — 36 raw candidates generated across 4 frames (native GUI terminals, multiplexers/TUI, IDE/editor, novel/cross-cutting); 9 survived after adversarial filtering.
