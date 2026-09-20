---
description: Release readingroom — bump version, update changelog, tag, GitHub release, publish to npm
argument-hint: [patch|minor|major] (optional — will ask if omitted)
---

# Publish readingroom

You are releasing this npm package (`readingroom`). Follow these phases **in order**. Never skip a gate, never batch confirmations silently — this workflow publishes to a public registry and is hard to undo.

## Phase 0 — Pre-flight gates (fail fast, change nothing)

Check each of these; if any fails, STOP and report what to fix. Do not attempt to auto-fix uncommitted user work.

1. Current branch is `main` and working tree is clean (`git status --porcelain` is empty). If there are uncommitted changes, stop and show them to the user.
2. Local `main` is in sync with `origin/main` (fetch first, no behind/ahead).
3. `npm test` passes.
4. `npm run build` passes.
5. The version in `package.json` does NOT already exist on npm (check with `npm view <pkg>@<version>` — if it exists, a previous release half-failed; stop and report).

## Phase 1 — Decide the version bump

- If the user passed `patch`, `minor`, or `major` as an argument, use it.
- Otherwise, infer from commits since the last tag (`git log $(git describe --tags --abbrev=0)..HEAD --oneline`), propose patch/minor/major with one-line reasoning, and **ask the user to confirm** (offer Other).
- Compute and show the resulting version number before proceeding.

## Phase 2 — Changelog

- If `CHANGELOG.md` does not exist, create it in [Keep a Changelog](https://keepachangelog.com) format with an intro noting the format, then the new version section.
- Generate the new version's section from commit history since the last tag: group into Added / Changed / Fixed / Removed. Write clear user-facing entries, not raw commit messages.
- **Show the drafted changelog section to the user and get explicit approval** before committing.
- Commit the changelog (message: `chore: update CHANGELOG for vX.Y.Z`).

## Phase 3 — Version bump, tag, push

1. Run `npm version <patch|minor|major>` (it updates `package.json`, commits, and creates tag `vX.Y.Z`).
2. Push: `git push origin main --follow-tags`.
3. Verify the tag exists on the remote: `git ls-remote --tags origin vX.Y.Z`.

## Phase 4 — GitHub release

- Create the release with the approved changelog section as the body:
  `gh release create vX.Y.Z --title "vX.Y.Z" --notes "<changelog section for this version>"`
- Verify: `gh release view vX.Y.Z` succeeds.

## Phase 5 — npm publish (interactive — user cooperation required)

⚠️ This phase may require the user's 2FA/OTP code. The agent MUST NOT guess or fabricate an OTP.

1. Run `npm publish` in the foreground.
2. If it succeeds → go to Phase 6.
3. If it prompts for OTP or fails with an OTP/E401 2FA error → STOP and tell the user exactly:
   > npm needs your 2FA code. Run this yourself in a terminal:
   > `npm publish --otp=<your 6-digit code>`
   > or paste the current code here and I'll run it with `--otp`.
4. If the user pastes a code, run `npm publish --otp=<code>`. If it still fails, show the exact error and stop.

## Phase 6 — Verification & report

Run and report all of:

- `npm view <pkg> version` → must equal the new version.
- `npm view <pkg> dist-tags` → `latest` points at the new version.
- `gh release view vX.Y.Z` → release exists with notes.

Finish with a short release summary: version, tag, release URL (`https://github.com/saif71/readingroom/releases/tag/vX.Y.Z`), npm URL (`https://www.npmjs.com/package/<pkg>`), and the changelog highlights.

## Failure handling

Failures mid-flow must be reported with recovery guidance, never silently retried:

- **Tag pushed but GitHub release failed** → safe to retry `gh release create` with the same tag.
- **Tag pushed but npm publish failed** → the version can never be re-published to npm. Options to present to the user: (a) fix the issue and bump to a new patch version, then delete the orphan tag/release (`git push origin :refs/tags/vX.Y.Z` + `gh release delete vX.Y.Z`) and redo from Phase 2; or (b) if publishing was never attempted and the version must be abandoned, same cleanup.
- **Never** delete a tag, force-push `main`, or `npm unpublish` without explicit user confirmation.
