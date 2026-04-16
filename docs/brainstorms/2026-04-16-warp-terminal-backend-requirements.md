---
date: 2026-04-16
topic: warp-terminal-backend
---

# Warp Terminal Backend

## Problem Frame

workit today ships three backends (`tmux`, `cmux`, `none`). Users who live in Warp get bounced to `none` (printed paths) or forced into tmux — losing Warp's native workspace/tabs UX and its AI-native workflow. A Warp backend closes that gap by emitting a native Warp Launch Configuration per feature slug, so a single `workit <feature>` call opens one Warp window with a named tab per worktree.

## Requirements

- R1. Add a new backend `warp` to `BackendName` and wire it through `selectBackend`, `detectAvailability`, and `dispatchBackend`.
- R2. The backend generates `~/.warp/launch_configurations/<featureSlug>.yaml` with a single window containing one tab per `TabSpec` (`title = tab.name`, `layout.cwd = tab.cwd`, no `commands:` preamble), then triggers Warp to open it via the `warp://launch/<featureSlug>` deep-link.
- R3. On re-run with the same slug, overwrite the YAML and fire the deep-link again. No diffing, no "already running" detection.
- R4. Detect "inside Warp" via Warp's shell-session env var and expose `insideWarp()` analogous to `insideTmux()` / `insideCmux()`.
- R5. Detect Warp availability by probing the platform-appropriate Warp app/binary location.
- R6. Extend `config.defaultTerminal` enum to include `'warp'`.

## Success Criteria

- Running `workit <feature>` from a Warp session opens a new Warp window with one tab per worktree, each already `cd`'d to its worktree path, with the worktree name shown as the tab title.
- Running `workit <feature>` from a non-Warp shell **when** `defaultTerminal: 'warp'` or `--backend warp` is set launches Warp (if installed) and produces the same result.
- Running `workit <feature>` from a non-Warp shell with default config continues to pick `tmux` (or existing fallback order) — Warp never silently displaces tmux.
- Re-running the same feature slug produces the same window layout without user-visible errors.

## Scope Boundaries

- **Not** fixing the existing cmux "outside cmux" launch-failure bug (separate brainstorm/plan). This work must not regress cmux, but won't change cmux selection or invocation logic.
- **Not** adding per-tab `commands[]` preambles (no setup-script execution, no agent-mode launch). Tab preamble is `cd` only via `layout.cwd`, matching tmux/cmux parity.
- **Not** adding a workit-managed cleanup of stale launch configs — configs persist in `~/.warp/launch_configurations/` and are the user's to prune.
- **Not** changing the availability-based fallback order (tmux > cmux > none). Warp is reachable only via `insideWarp` auto-detect, explicit `defaultTerminal: 'warp'`, or `--backend warp`.
- **Not** composing with the agent-runner overlay (idea #8). That's a separate cross-cutting feature that will layer on top of every backend including this one.

## Key Decisions

- **Persistent launch configs over ephemeral**: Matches Warp's design intent — the `.yaml` is the reusable artifact. User can re-fire the same workspace later from Warp's launcher without re-running workit.
- **Overwrite on re-run (no idempotency detection)**: Mirrors cmux's "always recreate" behavior. Cheap and predictable; avoids a diffing layer that adds cost for no user-visible gain.
- **Conservative selection priority**: Warp is inserted as a peer of tmux/cmux at the `insideXxx` detection tier and as an opt-in `defaultTerminal` choice, but is excluded from the availability-based fallback. Non-Warp users who happen to have it installed are never surprised by a new window.
- **cd-only preamble**: Workspace-level setup already runs before the backend dispatch; per-tab commands are out of scope for all existing backends and stay out of scope here.

## Dependencies / Assumptions

- Warp supports the documented Launch Configuration YAML schema with `windows[].tabs[].layout.cwd` and `windows[].tabs[].title`.
- Warp's `warp://launch/<name>` deep-link triggers a new window from a named launch config when invoked via `open` on macOS.
- Warp exposes a stable env var for inside-session detection (e.g., `TERM_PROGRAM=WarpTerminal` or Warp-specific equivalent).

## Outstanding Questions

### Resolve Before Planning

_(none)_

### Deferred to Planning

- [Affects R4][Needs research] Exact env var and value to check for `insideWarp()` across macOS and Linux Warp builds.
- [Affects R5][Needs research] Canonical availability probe per OS (macOS: `/Applications/Warp.app`; Linux: binary on `$PATH` or flatpak?; Windows: support level in 2026).
- [Affects R2][Needs research] Exact YAML top-level schema keys and whether `layout.cwd` or a sibling field is correct in the current Warp schema version.
- [Affects R2][Technical] Non-macOS deep-link invocation (`xdg-open` on Linux, `start` on Windows) — confirm the `warp://launch/<name>` handler is registered per-platform.
- [Affects R1][Technical] Where to place `insideWarp()` / `warpInstalled()` / `runWarpBackend()` — new `src/terminal/warp.ts` mirroring `cmux.ts` shape is the obvious placement; confirm during planning.

## Next Steps

→ `/ce:plan` for structured implementation planning.
