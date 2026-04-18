---
title: "chore: Migrate release automation to release-please"
type: chore
status: completed
date: 2026-04-17
---

# chore: Migrate release automation to release-please

## Overview

Replace the current manual, tag-triggered release workflow with [`googleapis/release-please-action@v4`](https://github.com/googleapis/release-please-action). After this change, merging a generated "release PR" on `main` becomes the single step to cut a release — version bumps, `CHANGELOG.md`, git tag, GitHub release, npm publish, cross-platform binaries, and Homebrew tap update all happen automatically. No more hand-crafted tags or hand-written release notes.

## Problem Statement / Motivation

Today releases require: (1) deciding a version, (2) `git tag vX.Y.Z && git push origin vX.Y.Z`, (3) manually rewriting release notes afterward because `--generate-notes` output is empty apart from the "Full Changelog" link. Version numbers in `package.json` and CHANGELOG/release notes drift from reality unless manually reconciled. The repo already uses Conventional Commits (29 of the last 30 `main` commits conform), so the inputs release-please needs are effectively free.

## Proposed Solution

Adopt release-please in **single-workflow, two-job mode**:

- A new `.github/workflows/release.yml` runs on `push: branches: [main]`.
- **Job 1 — `release-please`** (`ubuntu-latest`): runs the release-please action. It opens/updates a "chore(main): release X.Y.Z" PR that bumps `package.json` and regenerates `CHANGELOG.md` from conventional commits. When that PR is merged, the same action on the next run creates the git tag, creates the GitHub Release (with auto-categorized notes), and emits `release_created=true` as an output. Ubuntu is fine here — no platform-specific work.
- **Job 2 — `deploy`** (`macos-latest`): `needs: release-please`, gated once at the **job level** with `if: ${{ needs.release-please.outputs.release_created }}`. Only runs when a release was actually cut. Performs the npm publish, cross-platform binary build, macOS codesign, asset upload, and Homebrew tap update. These steps are a near-verbatim port of the current `release.yml`, minus the "set version from tag" step (release-please already bumped `package.json`).
- The existing `.github/workflows/release.yml` is **overwritten in place** (same filename, new contents).

Why single-workflow instead of "release-please pushes tag → existing tag-triggered workflow takes over": pushes made with `GITHUB_TOKEN` (which release-please uses by default) **do not trigger downstream `on: push` workflows**. That gotcha would silently break the existing tag-triggered setup. Running `deploy` as a `needs:`-dependent job in the same workflow avoids it entirely.

Why two jobs instead of one with per-step `if:` conditions: a single job-level gate reads cleaner than a dozen repeated `if:` lines, and splits the runners — Ubuntu for the per-push release-please check (cheap/fast; runs on every push to `main`), macOS only for the occasional real release (needed for `codesign`).

## Technical Approach

### Files to add

**`release-please-config.json`** (repo root):

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "packages": {
    ".": {
      "release-type": "node",
      "package-name": "workit",
      "changelog-path": "CHANGELOG.md",
      "bump-minor-pre-major": true,
      "bump-patch-for-minor-pre-major": false,
      "include-v-in-tag": true,
      "draft": false,
      "prerelease": false,
      "changelog-sections": [
        { "type": "feat",     "section": "Features" },
        { "type": "fix",      "section": "Bug Fixes" },
        { "type": "perf",     "section": "Performance" },
        { "type": "refactor", "section": "Refactors" },
        { "type": "docs",     "section": "Documentation" },
        { "type": "chore",    "section": "Miscellaneous", "hidden": true },
        { "type": "test",     "section": "Tests",         "hidden": true },
        { "type": "build",    "section": "Build",         "hidden": true },
        { "type": "ci",       "section": "CI",            "hidden": true }
      ]
    }
  }
}
```

Rationale:
- `release-type: node` — bumps `package.json` version automatically.
- `bump-minor-pre-major: true` — on `0.x`, `feat` → minor (`0.3.0 → 0.4.0`) and `feat!`/`BREAKING CHANGE` also only bumps minor until a deliberate `1.0.0`. Matches project's current versioning mood.
- `include-v-in-tag: true` — preserves existing `vX.Y.Z` tag convention (Homebrew formula and historical tags depend on the `v` prefix).
- `chore`/`test`/`build`/`ci` hidden so the changelog stays focused on user-visible changes.

**`.release-please-manifest.json`** (repo root):

```json
{
  ".": "0.3.0"
}
```

This seeds release-please with the last released version. First run after merge will be a no-op until a new conventional commit lands on `main`. (There's no dedicated `initial-version` input — manifest seeding is the idiomatic approach.)

**`CHANGELOG.md`** (repo root): create with a minimal header so release-please has a file to prepend to:

```md
# Changelog

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://www.conventionalcommits.org) for commit guidelines.
```

**`.github/workflows/release.yml`**:

```yaml
name: Release

on:
  push:
    branches: [main]

jobs:
  release-please:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
      tag_name: ${{ steps.release.outputs.tag_name }}
      version: ${{ steps.release.outputs.version }}
    steps:
      - uses: googleapis/release-please-action@v4
        id: release
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json

  deploy:
    needs: release-please
    if: ${{ needs.release-please.outputs.release_created }}
    runs-on: macos-latest  # required for codesign of darwin binaries
    permissions:
      contents: write   # gh release upload
      id-token: write   # npm provenance
    steps:
      - uses: actions/checkout@v6

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - uses: actions/setup-node@v6
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'

      - name: Upgrade npm for trusted publishing
        run: npm install -g npm@latest

      - name: Install dependencies
        run: bun install --frozen-lockfile

      # NOTE: no "Set version from tag" step — release-please already bumped package.json

      - name: Publish to npm
        run: npm publish --provenance

      - name: Build binaries
        run: bun run build:binaries

      - name: Ad-hoc sign macOS binaries
        run: |
          for f in dist/workit-darwin-arm64 dist/workit-darwin-x64; do
            codesign --remove-signature "$f" || true
            codesign --sign - --force --deep --timestamp=none "$f"
            codesign -dv "$f"
          done

      - name: Compute SHA256
        id: sha
        run: |
          cd dist
          echo "darwin_arm64=$(shasum -a 256 workit-darwin-arm64 | cut -d' ' -f1)" >> "$GITHUB_OUTPUT"
          echo "darwin_x64=$(shasum -a 256 workit-darwin-x64 | cut -d' ' -f1)" >> "$GITHUB_OUTPUT"

      - name: Upload release assets
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAG: ${{ needs.release-please.outputs.tag_name }}
        run: |
          gh release upload "$TAG" \
            dist/workit-darwin-arm64 \
            dist/workit-darwin-x64 \
            dist/workit-linux-x64 \
            dist/workit-linux-arm64 \
            dist/workit-windows-x64.exe

      - name: Update Homebrew tap
        env:
          GH_TOKEN: ${{ secrets.HOMEBREW_TAP_TOKEN }}
          VERSION: ${{ needs.release-please.outputs.version }}
          SHA_DARWIN_ARM64: ${{ steps.sha.outputs.darwin_arm64 }}
          SHA_DARWIN_X64: ${{ steps.sha.outputs.darwin_x64 }}
        run: |
          git clone "https://x-access-token:${GH_TOKEN}@github.com/Asifm95/homebrew-workit.git" tap
          cd tap
          cat > Formula/workit.rb <<EOF
          class Workit < Formula
            desc "CLI workflow manager for multi-project git worktrees"
            homepage "https://github.com/Asifm95/workit"
            version "${VERSION}"
            license "MIT"

            on_macos do
              on_arm do
                url "https://github.com/Asifm95/workit/releases/download/v${VERSION}/workit-darwin-arm64"
                sha256 "${SHA_DARWIN_ARM64}"
              end
              on_intel do
                url "https://github.com/Asifm95/workit/releases/download/v${VERSION}/workit-darwin-x64"
                sha256 "${SHA_DARWIN_X64}"
              end
            end

            def install
              binary_name = Hardware::CPU.arm? ? "workit-darwin-arm64" : "workit-darwin-x64"
              bin.install binary_name => "workit"
            end

            test do
              assert_match "workit", shell_output("#{bin}/workit --help")
            end
          end
          EOF

          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add Formula/workit.rb
          git commit -m "chore: bump workit to ${VERSION}"
          git push
```

### Files to update

- `.github/workflows/release.yml` — overwritten with the new two-job workflow above. Keeping the same filename avoids a delete/create churn and keeps the workflow named after its purpose (releasing) rather than its implementation (release-please).
- `package.json` — sync `version` field to `0.3.0` so it matches the just-cut tag and the manifest seed. Currently shows `0.2.1`; the tag-triggered workflow used to overwrite it in-CI so the committed value drifted. release-please reads `package.json` as the source of truth going forward, so it must be correct in the tree.
- `README.md` — add a short "Releasing" section pointing maintainers at the release PR workflow (merge to release; no manual tagging).

### Repo settings to verify (GitHub UI — outside this PR)

1. **Settings → Actions → General → Workflow permissions**: "Read and write permissions" enabled (already required for current workflow).
2. **Settings → Actions → General**: "Allow GitHub Actions to create and approve pull requests" — **must be ON**. Without this, release-please cannot open the release PR.
3. If `main` has branch protection requiring reviews: either allow the `github-actions[bot]` identity to bypass, or commit to manually approving the release PR. Using a PAT or GitHub App token via the `token:` input is the escape hatch if protection becomes stricter later.

## Acceptance Criteria

- [ ] `release-please-config.json`, `.release-please-manifest.json`, and `CHANGELOG.md` exist at repo root with the contents above.
- [ ] `package.json` `version` is `0.3.0`.
- [ ] `.github/workflows/release.yml` now contains two jobs (`release-please` on ubuntu-latest, `deploy` on macos-latest), the `deploy` job is gated by `needs.release-please.outputs.release_created` at the job level, and it is the only workflow that runs on `push: main`.
- [ ] The GitHub UI setting "Allow GitHub Actions to create and approve pull requests" is confirmed enabled.
- [ ] After the first `feat:` or `fix:` commit merges to `main` post-migration, a PR titled `chore(main): release X.Y.Z` appears, owned by `github-actions[bot]`, with a CHANGELOG diff and a `package.json` version bump.
- [ ] Merging that PR results in: a new `vX.Y.Z` tag, a GitHub Release with auto-categorized notes (Features / Bug Fixes sections), a successful npm publish with provenance, five binary artifacts attached to the release, and a corresponding formula bump commit in the `Asifm95/homebrew-workit` repo.
- [ ] `npm install -g @asifm95/workit@latest` installs the newly-released version.
- [ ] `brew upgrade asifm95/workit/workit` pulls the new binary (smoke test).

## Rollout Plan

1. **Land this change on a branch** (no release cut yet — first run is a no-op because commit messages on the branch-merge itself will be `chore:`).
2. Merge the branch. Confirm release-please action runs successfully (logs show "no release needed" or opens an empty/trivial PR — either is fine). Dismiss/close any accidentally-opened release PR if its content doesn't make sense.
3. Flip the repo setting "Allow GitHub Actions to create and approve pull requests" if not already on.
4. Make one small `fix:` or `feat:` commit on `main` (e.g. a README typo fixed via `fix: correct typo in README`) to trigger the first real release PR.
5. Review the opened release PR — verify CHANGELOG diff, version bump (`0.3.0 → 0.3.1` or `0.4.0`).
6. Merge; watch the workflow; verify npm + binaries + Homebrew all update.

## Non-Goals

- Enforcing conventional-commit format on PR titles via a linter (e.g. `amannn/action-semantic-pull-request`). Worth doing later; not blocking.
- Switching from OIDC trusted-publishing to `NPM_TOKEN`. Keep OIDC.
- Changing the version scheme (staying on 0.x until an explicit 1.0 decision).
- Migrating the Homebrew tap formula itself (`Asifm95/homebrew-workit`) to a different update mechanism.

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| "Allow GitHub Actions to create and approve PRs" is off — action silently fails to open a release PR | Acceptance criterion explicitly requires confirming the setting; rollout step 3 flips it |
| `GITHUB_TOKEN`-authored tag/release doesn't trigger anything downstream, confusing future contributors expecting tag-based CI | Single-workflow design: no downstream workflow depends on the tag push; all post-release work is in the gated steps of the same workflow |
| A non-conventional commit lands on `main` (e.g. a raw `Merge branch ...` commit) | release-please ignores it silently — no action needed. Optional: add a PR-title linter later |
| Branch protection on `main` requires reviews and blocks the bot from merging the release PR | A human (maintainer) still merges the release PR manually — this is the intended workflow, not a bug |
| First run opens a PR that wants to "release 0.3.0" again (thinks nothing has been released) | Manifest seeded with `0.3.0` prevents this; if it still happens, close the PR and check `include-v-in-tag` setting plus that the existing `v0.3.0` tag is pushed to `origin` |
| Homebrew tap update continues to use `HOMEBREW_TAP_TOKEN` (a classic PAT) which may expire | No change vs. today — out of scope, but worth a calendar reminder |

## Sources & References

### Internal

- Current workflow: `.github/workflows/release.yml` (to be overwritten in place)
- `package.json` — `version` (line 3), build scripts (lines 31–36), `files` whitelist (lines 21–26), `publishConfig.access` (lines 18–20)
- `src/cli.ts:21` — reads version dynamically from `pkg.version`; no hardcoded string to bump
- Homebrew tap target: `github.com/Asifm95/homebrew-workit`
- Historical design note on releases: `docs/specs/2026-04-12-workit-design.md:386-390`

### External

- release-please-action (v4): https://github.com/googleapis/release-please-action
- release-please tool docs: https://github.com/googleapis/release-please/tree/main/docs
- Config schema: https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json
- Conventional Commits spec: https://www.conventionalcommits.org/
