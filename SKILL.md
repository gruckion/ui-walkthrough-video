---
name: ui-walkthrough-video
description: Produce one or more end-to-end UI walkthrough demo videos for a pull request, issue, branch, ticket, local diff, or local feature so reviewers can see the changed application flow. Use when the user asks for a UI walkthrough, PR demo video, feature demo video, screen recording, visual review artifact, or asks to understand what changed in a UI flow.
---

# UI Walkthrough Video

Create short, task-specific UI walkthrough video artifact(s) that show exactly what changed in the real application, from entry point through completion.

## Non-Negotiable Rule

The video(s) must show the real application flow(s) on the changed branch. Do not substitute demo routes, prototype pages, component harnesses, mocked auth, mocked API responses, or hand-written fixture data for the real app experience a reviewer/customer would naturally reach.

Before deciding the flow(s) are blocked, set up the real local environment: changed branch, isolated worktree/checkout when needed, branch-specific database/environment, app-supported seed data, required feature flags, backend services, frontend services, and authenticated seeded/test user session. If the real application flow(s) still cannot be recorded after those setup steps, stop and report the blocker. Do not produce substitute video(s).

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
   - Prefer captions or a short visible narrative when audio narration is unavailable.
   - Show before/entry context, the changed control or display, the interaction flow, and the final confirmation state.
   - Avoid unrelated product tours.

5. **Capture**
   - Authenticate before recording. Do the real seeded login in a setup step, persist that real session (Playwright `storageState`), then open the recording context already logged in and `goto` the changed route. The login screen must not appear in the video. This persists a real login captured out-of-frame — it is not mocked, fabricated, or bypassed auth.
   - Keep auth/session setup invisible and unmentioned in the video. Verify the login screen is absent during review, but do not add captions or callouts explaining that it is absent.
   - Use a deterministic browser automation path with stable selectors.
   - **Determinism gate — the recording is a rehearsed path, not a search.** The script navigates directly to the targets pinned during scouting. No loops over lists, no `if found / else next`, no try-and-retry, no "click until X appears" on screen. If any step is still conditional or searching, it is not ready to record — resolve it off-camera first.
   - **Fail fast — never swallow a failed action in the recording.** Do not wrap recording clicks/navigations in `.catch(() => {})`. A swallowed failure (e.g. a tab click that didn't land) leaves the _next_ action to wait out its full timeout while the screen sits unchanged — recording as a long frozen/dead segment. Let a failed step throw and abort the take. Set a **short** Playwright action/navigation timeout (~8–10s, not the 30s default) so any mistake fails fast instead of producing dead air. After a view change (tab switch, navigation, dialog open), assert the expected element is present before the next action.
   - Prefer Playwright `recordVideo` when available. Use a reliable browser screenshot-to-MP4 path only when Playwright recording is unavailable or impractical in the current environment.
   - Capture at a readable viewport, usually desktop first unless the PR is mobile-specific.
   - Use deliberate pauses after each changed interaction.
   - If the first capture has a wrong click, missed menu, blank page, or unclear caption, recapture rather than handing over a flawed artifact.

6. **Encode and verify**
   - Encode to MP4 unless the user requested another format.
   - Verify duration, resolution, frame count, and file existence.
   - Inspect representative frames from the beginning, middle, and end.
   - **Coverage gate (diff-driven).** List every changed user-facing surface from step 1's diff and assert each one appears in the video, or explicitly log why it was omitted. "Covers the headline feature" is not enough — refactors and secondary states (a toggle's off-state, each call site of a shared component) are in the diff and must be covered.
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

const outDir = path.resolve("artifacts/ui-walkthrough");
const webmPath = path.join(outDir, "<pr-or-ticket>-<flow-slug>.webm");
const authFile = path.join(outDir, "auth-state.json");

const browser = await chromium.launch({ headless: true });

// 1) Authenticate out-of-frame: real login in a throwaway context, persist the real session.
const setup = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
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
  viewport: { width: 1440, height: 1000 },
  storageState: authFile,
  recordVideo: {
    dir: outDir,
    size: { width: 1440, height: 1000 },
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

## Callout Banners

Use short in-video callout banners when they make the walkthrough easier to understand.

- Use 1-5 callouts per video.
- Keep each callout under 120 characters when practical.
- Describe only the visible product behavior, user action, or state transition being demonstrated.
- Do not mention recording mechanics, auth setup, skipped login, seeded sessions, Playwright, test harnesses, implementation details, or anything relevant only to how the video was made.
- Default callouts to the top-right of the viewport, for example `top: 24px; right: 24px`, so they do not sit behind video playback controls or bottom action bars.
- Avoid bottom-left and bottom-right callouts unless the changed UI makes the top-right placement worse.
- Place callouts where they do not cover the changed UI, active menus, dialogs, form fields, table rows, buttons, toasts, or error/success states.
- Before finalizing, inspect at least one frame per callout placement. If callouts cover important UI, re-record with better placement.
- Do not add callouts by modifying app source. Inject them only in the browser session.

## Recording Standards

- Keep each video under 30 seconds unless the workflow truly needs more.
- Prefer a single clean desktop viewport first; add mobile only when the change is responsive/mobile-specific.
- Use visible waits, hover/highlight, and short pauses around the changed UI so reviewers can see it.
- Avoid random navigation. Every action in the video(s) must map to acceptance checks.
- Record the final changed branch, after validation passes.
- Name files predictably: `artifacts/ui-walkthrough/<ticket-or-pr>-<flow-slug>.webm` and `artifacts/ui-walkthrough/<ticket-or-pr>-<flow-slug>.mp4`.
- Verify each video is nonblank and includes the expected UI by extracting preview frames.

Standard MP4 conversion:

```bash
ffmpeg -y \
  -i artifacts/ui-walkthrough/<ticket-or-pr>-<flow-slug>.webm \
  -c:v libx264 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  artifacts/ui-walkthrough/<ticket-or-pr>-<flow-slug>.mp4
```

Preview-frame check:

```bash
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 artifacts/ui-walkthrough/<ticket-or-pr>-<flow-slug>.mp4
ffmpeg -y -ss 00:00:05 -i artifacts/ui-walkthrough/<ticket-or-pr>-<flow-slug>.mp4 -frames:v 1 -update 1 artifacts/ui-walkthrough/<ticket-or-pr>-<flow-slug>-preview.png
```

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
