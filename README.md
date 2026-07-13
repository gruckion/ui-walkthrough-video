# ui-walkthrough-video

A [Claude Code skill](https://docs.claude.com/en/docs/claude-code/skills) that produces short, end-to-end UI walkthrough demo videos of what actually changed in an app — for a PR, issue, branch, ticket, or local diff — so a reviewer can watch the changed flow instead of reconstructing it from the diff.

It drives the **real** application on the changed branch (real local env, seeded user, real backend/DB — no demo routes, mock auth, or fixture pages), records with Playwright, and encodes to MP4.

## What it does

- Derives demo scope mechanically from the diff (committed **and** uncommitted), so nothing user-visible is missed.
- Sets up an isolated local environment (worktree, branch-specific DB, seed data, flags) and runs the app.
- Scouts the live UI off-camera and pins exact records/selectors, so the recording is a rehearsed path, never an on-screen search.
- Captures already-authenticated (login stays out of frame), adds optional callout banners, then verifies frames and duration before handing over.

## Install

Clone into your Claude Code skills directory:

```bash
git clone git@github.com:gruckion/ui-walkthrough-video.git ~/.claude/skills/ui-walkthrough-video
```

Then just ask Claude Code for "a UI walkthrough video of this PR" (or branch/ticket/local diff) and the skill activates.

## Requirements

- [Playwright](https://playwright.dev/) (`recordVideo`) for capture
- `ffmpeg` / `ffprobe` for MP4 encoding and frame verification
- A locally runnable app with seed data and documented test credentials

## The spec

The full workflow, rules, and capture patterns live in [`SKILL.md`](./SKILL.md) — that's the file Claude loads.
