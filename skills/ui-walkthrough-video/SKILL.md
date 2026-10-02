---
name: ui-walkthrough-video
description: Produce one or more end-to-end UI walkthrough demo videos for a pull request, issue, branch, ticket, local diff, or local feature so reviewers can see the changed application flow. Use when the user asks for a UI walkthrough, PR demo video, feature demo video, screen recording, visual review artifact, or asks to understand what changed in a UI flow.
---

# UI Walkthrough Video

Create short, task-specific UI walkthrough video artifact(s) that show exactly what changed in the real application, from entry point through completion.

Check narration availability before planning the video: when `ELEVENLABS_API_KEY` is set,
produce a narrated walkthrough by default using the workflow below. When it is absent,
produce the usual voiceless walkthrough. Honor an explicit request for a voiceless video.

## Non-Negotiable Rule

The video(s) must show the real application flow(s) on the changed branch. Do not substitute demo routes, prototype pages, component harnesses, mocked auth, mocked API responses, or hand-written fixture data for the real app experience a reviewer/customer would naturally reach.

Before deciding the flow(s) are blocked, set up the real local environment: changed branch, isolated worktree/checkout when needed, branch-specific database/environment, app-supported seed data, required feature flags, backend services, frontend services, and authenticated seeded/test user session. If the real application flow(s) still cannot be recorded after those setup steps, stop and report the blocker. Do not produce substitute video(s).

## Where Artifacts Live

Recording artifacts go in a persistent, agent-agnostic home directory, **never** the session
scratchpad. A CLI's working temp (`/tmp/...`, `~/.claude`, `~/.codex`, or wherever the current
agent stages temp files) is reaped by the OS and is not portable across Claude Code / Codex /
other CLIs — anything left there is lost.

Base (repo- and agent-independent): `~/ui-walkthroughs/<ticket-or-pr>/`

```
~/ui-walkthroughs/<ticket-or-pr>/
  <ticket-or-pr>-<flow-slug>.mp4 / .webm          # video outputs (regenerable)
  scripts/<ticket-or-pr>-<flow-slug>.record.mjs   # the recording script — the durable source of truth
  scripts/auth-setup.mjs                          # out-of-frame login that persists storageState
  scripts/walkthrough-kit.mjs                     # copied from this skill: cursor, captions, cut marks
  scripts/build-walkthrough.mjs                   # copied from this skill: title card, caption bar, join
  takes/<take>.webm + <take>.marks.json           # raw takes (regenerable)
  scripts/package.json                            # pins playwright
  seed/<ticket-or-pr>.dump                        # demo DB snapshot + a note on how it was made
```

The **script is the durable asset; the video is a regenerable output.** Persist the script,
auth setup, and seed here the moment they work — do not leave them in the scratchpad, even
mid-task. Do NOT hardcode a repo path (e.g. a specific worktree) as the base: worktrees are
temporary and vanish on cleanup, and the path differs per user.

**Re-recording an existing target — check here first.** Before writing any script,
`ls ~/ui-walkthroughs/<ticket-or-pr>/scripts/` and update the existing `.record.mjs` instead
of rewriting from scratch. Use that deterministic listing, never a fuzzy `find` by feature
keyword — a keyword search misses a generically-named script (`record.mjs`, `record1.js`) and
reports a false "no prior script exists", wasting a full rewrite.

## Fast Workflow

Start with a short critical-path plan. Identify what the main agent must do locally now, then delegate independent discovery and verification work to subagents when available. Keep the actual browser recording on the main thread so the final video has one coherent flow.

Useful concurrent lanes:

- **Feature comprehension agent**: Inspect the PR, issue, branch, comments, changed files, and commit messages. Return a demo checklist: user-visible changes, important edge cases, routes, flags, fixtures, and what must not be missed.
- **Local readiness agent**: Inspect repo layout, package scripts, env files, ports, services, seed credentials, setup docs, and likely run commands. Return exact commands and known blockers.
- **UI data scout agent**: After the app is running, inspect the live UI and/or API data. Return the best demo records, labels, selectors, URLs, and any missing data.
- **Capture-plan agent**: Draft the recording sequence, captions, and expected screenshots from the demo checklist. This can start before live selectors are known and be refined later.
- **Verification agent**: After capture, inspect the video metadata and representative frames for incorrect clicks, blank screens, clipped captions, missing feature coverage, or wrong data.

Do not delegate the immediate blocker. For example, if no one can inspect the UI until the dev server starts, start the server locally first while other agents read the PR and setup docs.

If subagents are unavailable, follow the same lane structure yourself without stopping to ask the user unless a risky assumption would change the feature being demonstrated.

## Core Workflow

1. **Understand the requested target**
   - Resolve the PR/issue/branch/link.
   - Confirm the local checkout that corresponds to the target.
   - **Derive scope mechanically from the diff, not from memory or the PR text.** Compute the actual change set: `git diff <base>...HEAD` **plus uncommitted work** (`git status --short`, `git diff`, `git diff --staged`) — work is often not committed yet. Every changed user-visible file is a candidate surface.
   - Read enough changed code to know the user-visible feature surface.
   - Decide whether one video is enough. Create multiple videos only when the feature has distinct flows that would make one video confusing.
   - **If re-recording an existing target, `ls ~/ui-walkthroughs/<ticket-or-pr>/scripts/` and reuse/update the prior `.record.mjs`** rather than rewriting (see "Where Artifacts Live"). Re-derive the demo scope from the diff, but start from the existing script.

2. **Run the app**
   - Start required backend/frontend services using existing repo scripts.
   - Prefer local seed data and documented seed credentials.
   - Use the expected local port for CORS/auth when the backend is strict.
   - Keep long-running server sessions open until recording and verification are complete, then stop only sessions you started.

3. **Scout the UI**
   - Load the relevant route.
   - Verify authentication, feature flags, data presence, and the expected changed UI.
   - Identify stable selectors or accessibility nodes for every interaction.
   - Record the best data examples, such as records showing each new state or edge case.
   - **All discovery happens here, off-camera — never in the recording.** Pin the _exact_ target before recording: which record, route, row, or selector qualifies (e.g. _which_ invoice actually has the button). Use a DB query, API call, or a throwaway probe run to resolve it. The recording must never search, iterate a list, or try-and-retry on screen — a reviewer watching the agent figure things out wastes their attention and reads as a bug ("is the modal not staying open?").

4. **Write the walkthrough plan**
   - Make the script feature-led, not test-led.
   - Use the title card, caption bar and orange cursor from "Standard Look" in every video.
   - Show before/entry context, the changed control or display, the interaction flow, and the final confirmation state.
   - Avoid unrelated product tours.

5. **Capture**
   - Authenticate before recording. Do the real seeded login in a setup step, persist that real session (Playwright `storageState`), then open the recording context already logged in and `goto` the changed route. The login screen must not appear in the video. This persists a real login captured out-of-frame — it is not mocked, fabricated, or bypassed auth.
   - Keep auth/session setup invisible and unmentioned in the video. Verify the login screen is absent during review, but do not add captions or callouts explaining that it is absent.
   - Use a deterministic browser automation path with stable selectors.
   - **Determinism gate — the recording is a rehearsed path, not a search.** The script navigates directly to the targets pinned during scouting. No loops over lists, no `if found / else next`, no try-and-retry, no "click until X appears" on screen. If any step is still conditional or searching, it is not ready to record — resolve it off-camera first.
   - **Fail fast — never swallow a failed action in the recording.** Do not wrap recording clicks/navigations in `.catch(() => {})`. A swallowed failure (e.g. a tab click that didn't land) leaves the _next_ action to wait out its full timeout while the screen sits unchanged — recording as a long frozen/dead segment. Let a failed step throw and abort the take. Set a **short** Playwright action/navigation timeout (~8–10s, not the 30s default) so any mistake fails fast instead of producing dead air. After a view change (tab switch, navigation, dialog open), assert the expected element is present before the next action.
   - Prefer Playwright `recordVideo` when available. Use a reliable browser screenshot-to-MP4 path only when Playwright recording is unavailable or impractical in the current environment.
   - Capture at a readable viewport, usually desktop first unless the PR is mobile-specific. Default to 1440x1240: a shorter window puts the last block of the page under any fixed bottom bar, and scrolling cannot clear it.
   - Use deliberate pauses after each changed interaction.
   - If the first capture has a wrong click, missed menu, blank page, or unclear caption, recapture rather than handing over a flawed artifact.

6. **Encode and verify**
   - Encode to MP4 unless the user requested another format.
   - Verify duration, resolution, frame count, and file existence.
   - Inspect representative frames from the beginning, middle, and end.
   - **Coverage gate (diff-driven).** List every changed user-facing surface from step 1's diff and assert each one appears in the video, or explicitly log why it was omitted. "Covers the headline feature" is not enough — refactors and secondary states (a toggle's off-state, each call site of a shared component) are in the diff and must be covered. Generated documents count as surfaces: a changed PDF template/generator/export must appear as an interstitial (see "Documents and PDFs in the flow").
   - **Interstitial frame check.** Extract at least one frame per document interstitial and confirm the artifact is legible and the title/callout text renders cleanly (mojibake in the title bar means the viewer page is missing its charset declaration).
   - Verify the _real_ duration — frozen-frame padding can inflate the reported duration; trim or normalise so playback has no dead tail.
   - **Dead-air check.** Scan mid-flow for any stretch where the UI does not change for more than ~3s. That almost always means a step silently failed and the next one timed out (see the fail-fast rule). Find the broken step, fix it, and re-record — never ship a video with a frozen stretch sitting on a static screen.

7. **Final response**
   - Include the walkthrough plan.
   - Link the generated video with an absolute local path.
   - Briefly list what the video proves.
   - Mention setup caveats, such as seeded user, seed script, isolated database name, backend/frontend ports, feature flag override, or unavailable branch.

## How To Know What To Demo

Build a `Walkthrough Plan` before recording:

- Read the PR title/body, ticket, and changed files (the diff from step 1, including uncommitted changes).
- Identify changed routes, components, labels, buttons, dialogs, feature flags, and data states.
- Map each changed user-facing file to a surface and a demo beat. **For a refactored shared component, demo every call site that imports it** (parity), not just the headline one — a reviewer needs to see the other surfaces still look right.
- Tag each surface **new-behaviour** (demo the full flow) or **refactor/parity** (show briefly, confirm it looks unchanged). Both must appear in the video.
- Turn that into 1-3 reviewer-visible acceptance checks.
- Prefer the shortest end-to-end path(s) a reviewer would manually use.
- If all checks belong to one continuous reviewer flow, record one video.
- If checks touch unrelated routes/pages/workflows, record one video per distinct flow.
- If the diff adds a gated feature, include both the enabled path(s) and, when cheap, the disabled/non-regression path(s).
- **List the documents the flow produces or the diff touches** — PDF templates, generators, exports, receipts. Each one is a demo beat: show the real artifact at the point in the flow where it is produced (see "Documents and PDFs in the flow").
- Use only real app-supported setup: existing local fixtures, documented seed scripts, documented test credentials, existing storage state, or a real backend/dev API environment.
- Prefer a real seeded user. Do not fabricate localStorage sessions, bypass auth, mock accounts, or patch app code to skip permissions.
- Do not invent happy path(s) that the app cannot actually show.
- Do not add new app routes or pages to make the recording easy.

Use this plan shape:

```md
Walkthrough Plan

- Video 1: <short name>
- Route(s): <real app routes>
- User/data: <seeded user, seed source, important records>
- Demonstrates:
  - <acceptance check 1>
  - <acceptance check 2>
```

## Environment Setup

Protect the user's other work:

- Prefer a separate Git worktree or cloned checkout for the PR branch.
- Reuse an existing branch-specific checkout/environment when it is already present and appropriate.
- Do not switch branches, mutate env files, run migrations, seed data, or start/stop services in a worktree the user may be actively using unless the user explicitly permits it.
- Start frontend/backend services on available ports that do not conflict with existing sessions.
- Prefer separate database names, schemas, containers, volumes, or Supabase projects for walkthrough setup.
- Record the app connected to that isolated backend/database, not a mock server.

## Capture Guidance

Use Playwright’s `recordVideo` browser-context option when it is installed and compatible with the app. Videos are written only after the page or context closes, so always close both before expecting the file to exist.

Two gotchas that waste a lot of time:

- **Do not `waitForLoadState('networkidle')` on an SPA.** Polling/websockets mean it never settles, so it burns the full timeout (~30s of dead air) on every navigation. Wait for a specific element (`waitFor` on the route's key node) or a short fixed sleep instead.
- **`recordVideo` writes the file on context close with an auto-generated name.** `video.saveAs()` called _after_ `browser.close()` can throw — either save before closing the browser, or just rename the newest `page@*.webm` from the output dir. Confirm the **real** duration after encoding (frozen-frame padding can inflate it and leave a dead frozen tail); trim/normalise before delivering.

Authenticate in a throwaway context first and reuse the session via `storageState`, so the recorded context starts already logged in (no login screen in the video). `storageState` persists cookies **and** localStorage, so token-based sessions (e.g. Supabase) carry over.

Minimal pattern:

```ts
import { chromium } from "@playwright/test";
import path from "node:path";

// Persistent, agent-agnostic base — see "Where Artifacts Live". Never the scratchpad.
const baseDir = path.join(
  process.env.HOME,
  "ui-walkthroughs",
  "<pr-or-ticket>",
);
const webmPath = path.join(baseDir, "<pr-or-ticket>-<flow-slug>.webm");
const authFile = path.join(baseDir, "scripts", "auth-state.json");
const outDir = baseDir;

const browser = await chromium.launch({ headless: true });

// 1) Authenticate out-of-frame: real login in a throwaway context, persist the real session.
const setup = await browser.newContext({
  viewport: { width: 1440, height: 1240 },
});
const setupPage = await setup.newPage();
await setupPage.goto(process.env.LOGIN_URL ?? "http://localhost:3000/login");
await setupPage.getByLabel("Email").fill(process.env.SEED_EMAIL!);
await setupPage.getByLabel("Password").fill(process.env.SEED_PASSWORD!);
await setupPage.getByRole("button", { name: "Sign in" }).click();
await setupPage.waitForURL(
  process.env.POST_LOGIN_URL ?? "http://localhost:3000/",
);
await setup.storageState({ path: authFile });
await setup.close();

// 2) Record already authenticated — the login screen never appears in the video.
const context = await browser.newContext({
  viewport: { width: 1440, height: 1240 },
  storageState: authFile,
  recordVideo: {
    dir: outDir,
    size: { width: 1440, height: 1240 },
  },
});

const page = await context.newPage();
await page.goto(
  process.env.WALKTHROUGH_URL ?? "http://localhost:3000/actual/changed/route",
);

// Perform only the task-specific real application user path here.
// Use role/text/label locators so the script matches what reviewers see.

const video = page.video();
await page.close();
await context.close();
await browser.close();

if (!video) throw new Error("No Playwright video was created");
await video.saveAs(webmPath);
console.log(webmPath);
```

## Documents and PDFs in the Flow

When the flow generates or serves a document — an invoice PDF, a report, a receipt, an
export — that artifact is part of the real application flow, and the walkthrough must show
it at the point it is produced. Interleave: app scenes → the real document → back into the
app. This is not a "substitute page" (see the Non-Negotiable Rule): the artifact shown is
the flow's genuine output, fetched the same way the app fetches it.

Why it needs special handling: **headless Chromium cannot render a PDF in-page**, and apps
usually `window.open` PDFs into a popup the recorded page never shows (keep a
`context.on('page', p => p.close())` popup-closer so those tabs don't linger). Displaying
the artifact therefore takes three steps, all encapsulated in the bundled helper:

1. **Fetch the real artifact mid-take**, after the app step that generates it, using the
   same API the app calls (reuse the session/token captured during auth setup). Never show
   a pre-generated stand-in whose content couldn't include this take's data.
2. **Convert a page to PNG** (`pdftoppm -png -singlefile`, `sips` fallback on macOS).
3. **Navigate the recorded page to a minimal local viewer page** showing the image with a
   title bar and optional callout, dwell ~5s, then `goto` back into the app. The viewer
   must declare `<meta charset="utf-8">` — without it, em dashes and curly quotes in the
   title render as mojibake on `file://` pages (a real retake cause).

**Use the bundled helper instead of hand-writing this.** Copy
[scripts/pdf-interstitial.mjs](./scripts/pdf-interstitial.mjs) into the walkthrough's
`scripts/` dir next to the record script, then:

```ts
import { showPdfInterstitial } from "./pdf-interstitial.mjs";

// after the app step that generated the document, fetch the real bytes:
fs.writeFileSync(
  pdfPath,
  Buffer.from(await (await fetch(signedUrl)).arrayBuffer()),
);
await showPdfInterstitial(page, {
  pdfPath,
  title: "Invoice PDF — as the customer receives it",
  callout: "Add-ons appear as ordinary lines; totals include them",
  workDir: scriptsDir,
});
await page.goto(nextAppRoute); // continue the app flow
```

**Slow generators: pre-warm asynchronously.** If producing the document is slow (a
server-side render, a Python/reporting pipeline), kick the generation off in the
background _right after the app step that makes it possible_ and `await` the promise only
when its scene arrives — earlier scenes play while it renders, so the recording never sits
in dead air waiting for it.

## Standard Look

Every walkthrough video has these three elements. They are the house style, not options.
The reference video is `~/ui-walkthroughs/SOL-4224/`.

1. **Title card.** The first 3 seconds are a dark card: the ticket or PR id in orange, the
   change as a heading, and 2 to 3 lines that say what the change is and what the viewer
   will see. Name a feature flag here if the flow depends on one.
2. **Caption bar.** A dark 64px bar sits above the app frame for the whole video and says
   what is happening now. It is stacked on top of the frame, so it never covers the UI.
   Caption text is `<step> · <what is on screen>`, for example
   `3. Boost module ON · Boost is now a payment type`. The step part is drawn in orange.
   Change the caption each time the viewer should look at something new.
3. **Orange cursor.** A semi-transparent orange dot shows where the pointer is and shrinks
   on a click. Playwright video has no OS cursor, so without it the viewer cannot see where
   a click lands. Move the pointer to the target before each click.

Two scripts in this skill's `scripts/` folder produce all three. Copy both into the
walkthrough's `scripts/` dir and use them; do not write new ones.

- `walkthrough-kit.mjs` (record side): `installCursor(context)` draws the cursor.
  `startTake(page)` gives `caption(text)`, `cutStart()` / `cutEnd()` for ranges to trim
  (page loads, setup clicks), `click` and `type` helpers that move the cursor first, and
  `finish({ takesDir, name })`, which writes `<name>.webm` and `<name>.marks.json`.
- `build-walkthrough.mjs` (build side): joins the takes, removes the cut ranges, stacks the
  caption bar, prepends the title card, and writes the mp4 and a `.chapters.txt` file.

```bash
node build-walkthrough.mjs --base ~/ui-walkthroughs/<ticket-or-pr> --out <ticket-or-pr>-<flow-slug>.mp4 \
  --viewport 1440x1240 --kicker <ticket-or-pr> --title "<the change>" \
  --summary "<what it is>|<what the viewer will see>" <take> [<take> ...]
```

The output is `--viewport` plus 64px of height for the bar, so record at the same viewport
you pass here. Record in more than one take when state must change between scenes (a flag,
a fresh page load); the build joins them in the order given.

Rules for caption and title text:

- Keep each caption under 120 characters. It must fit on one line of the bar.
- Describe only the visible product behavior, user action, or state transition being demonstrated.
- Do not mention recording mechanics, auth setup, skipped login, seeded sessions, Playwright, test harnesses, implementation details, or anything relevant only to how the video was made.
- Do not add captions or the cursor by modifying app source. The cursor is injected only in the browser session, and the bar and title card are added at build time.
- Before finalizing, inspect the title card and at least one frame per caption. Re-record if a caption is clipped or does not match what is on screen.

## Narrated walkthroughs

Check for a nonempty `ELEVENLABS_API_KEY` in the generation process environment. For zsh
setups, load `~/.zshrc` through an interactive zsh before checking, without printing the
key. If no key is set, finish and deliver the voiceless video without opening credential
setup or asking for a key. If a key is set and the user has not requested a voiceless video,
use [elevenlabs-narration](../elevenlabs-narration/SKILL.md) after building the final MP4.

Use Charlie (`IKne3meq5aSn9XLyUdCD`) by default. An explicit user voice/model choice takes
priority, then `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL_ID`, then the narration skill's
defaults. Save the resolved voice and model in the timed narration plan.

For an existing demo, reuse its local video and chapter/build timings. Save the timed
narration plan and copied helper beside the recording script, and produce a separate
`*-narrated.mp4`. Check every spoken line against the visible scene and listen to the
result before delivering or attaching the narrated output. Keep the title, captions and
cursor. If generation fails, retain the voiceless source and report the actual blocker;
do not describe or attach it as a successfully narrated video.

## Recording Standards

- Keep each video under 30 seconds unless the workflow truly needs more.
- Prefer a single clean desktop viewport first; add mobile only when the change is responsive/mobile-specific.
- Use visible waits, hover/highlight, and short pauses around the changed UI so reviewers can see it.
- Avoid random navigation. Every action in the video(s) must map to acceptance checks.
- Record the final changed branch, after validation passes.
- Name files predictably under the persistent base (see "Where Artifacts Live"): videos `~/ui-walkthroughs/<ticket-or-pr>/<ticket-or-pr>-<flow-slug>.webm` / `.mp4`, and the script `~/ui-walkthroughs/<ticket-or-pr>/scripts/<ticket-or-pr>-<flow-slug>.record.mjs`.
- Verify each video is nonblank and includes the expected UI by extracting preview frames.

Build the final mp4 with `build-walkthrough.mjs` (see "Standard Look"). For a raw take without the standard look, the plain conversion is:

```bash
ffmpeg -y \
  -i ~/ui-walkthroughs/<ticket-or-pr>/<ticket-or-pr>-<flow-slug>.webm \
  -c:v libx264 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  ~/ui-walkthroughs/<ticket-or-pr>/<ticket-or-pr>-<flow-slug>.mp4
```

Preview-frame check:

```bash
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 ~/ui-walkthroughs/<ticket-or-pr>/<ticket-or-pr>-<flow-slug>.mp4
ffmpeg -y -ss 00:00:05 -i ~/ui-walkthroughs/<ticket-or-pr>/<ticket-or-pr>-<flow-slug>.mp4 -frames:v 1 -update 1 ~/ui-walkthroughs/<ticket-or-pr>/<ticket-or-pr>-<flow-slug>-preview.png
```

## Attach the Video to the PR

The usual home for the video is the PR description. The GitHub CLI uploads it natively with
`--attach`; do not use a browser to upload it.

1. Attach the mp4. With no body flag, `gh` keeps the existing body and appends the video:

   ```bash
   gh pr edit <pr-url> --attach ~/ui-walkthroughs/<ticket-or-pr>/<ticket-or-pr>-<flow-slug>.mp4
   ```

   Do not add `#<alt text>` after the path. `gh` accepts alt text for images only, and a video
   with alt text fails with `cannot set alt text on video`.

2. Read the uploaded URL back from the body:

   ```bash
   gh pr view <pr-url> --json body -q .body | grep -o -E 'https://github.com/user-attachments/assets/[a-f0-9-]+' | tail -n 1
   ```

3. Move it under a `## Demo` heading with one line on what the video shows, then write the
   body back with `gh pr edit <pr-url> --body-file <file>`. A bare asset URL on its own line
   renders as an inline player.
4. For a paired PR (for example a backend and a frontend PR), put the same URL in the other
   PR's description. Upload once.

## Delegation Prompts

Use concise, bounded prompts. Tell worker agents they are not alone in the codebase and should not revert unrelated changes.

**Feature comprehension**

```text
Inspect <target> and the local checkout, working from the diff (git diff incl. uncommitted changes). Do not edit files. Return a concise UI demo checklist: EVERY changed user-visible surface (and each call site of any refactored shared component), routes/components involved, feature states/edge cases to show (including secondary states like a toggle's off-state), and any setup notes implied by the target.
```

**Local readiness**

```text
Inspect this repo for how to run the app for <target>. Do not edit files. Return exact commands, required services, ports, env/auth/seed credentials, and likely blockers for a local UI recording.
```

**UI data scout**

```text
The app is running at <url>. Inspect the relevant feature UI for <target>. Do not edit files. Pin the EXACT target so the recording needs zero on-camera search: the precise record/route/row/selector that qualifies (e.g. which specific invoice has the button), resolved via DB/API/probe. Return the best demo route, the exact records/data to use, stable labels/selectors, and any missing state needed for the walkthrough.
```

**Capture plan**

```text
Using this demo checklist, draft a short recording plan with captions. Return ordered scenes, interactions, expected visible confirmations, and whether this should be one video or multiple videos.
```

**Verification**

```text
Inspect the generated video and representative frames at <paths>. Return whether the walkthrough matches the demo checklist, and call out any wrong clicks, missing steps, unreadable captions, blank screens, or visual issues.
```

## Blockers

If the actual app flow(s) are blocked, do not generate video(s). Report:

- the exact route(s)/flow(s) attempted
- what was missing, such as auth, seed invoice, backend API, feature flag, account access, or test credentials
- the smallest concrete action needed to unblock recording
- any safe existing setup path(s) found in repo docs
- whether an isolated worktree/database could not be created and why

## Time Tracking

Track rough elapsed time by lane when practical:

- Feature comprehension
- Local readiness / server startup
- UI scouting
- Capture script / recording
- Recapture or debugging
- Encoding and verification

If the user asks about speed, report wall-clock time and where concurrent work reduced or failed to reduce the critical path.
