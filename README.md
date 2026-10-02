# UI walkthrough videos

Two skills for Codex and Claude Code, installed together:

- [ui-walkthrough-video](skills/ui-walkthrough-video/SKILL.md) records the changed flow in the real application, with a title card, captions and cursor, then verifies the video.
- [elevenlabs-narration](skills/elevenlabs-narration/SKILL.md) adds timed speech to a finished video. The walkthrough skill uses it automatically when `ELEVENLABS_API_KEY` is set; otherwise it delivers a voiceless video. You can also request narration for an existing video independently.

The walkthrough derives its scope from the actual diff, sets up the changed application locally, and records a rehearsed path using real authentication and app-supported data. Recording scripts and outputs live in `~/ui-walkthroughs/<ticket-or-pr>/` so they survive worktree cleanup.

## Install

Clone into a permanent directory **outside** your agent's skills directory:

```bash
git clone git@github.com:gruckion/ui-walkthrough-video.git ~/developer-tools/ui-walkthrough-video
cd ~/developer-tools/ui-walkthrough-video
./install.sh
```

By default, `install.sh` creates links to both skills in `~/.codex/skills` and `~/.claude/skills`. Use `./install.sh --codex` or `./install.sh --claude` to install for only one agent. Codex installations respect `CODEX_HOME` when set.

The installer uses the local checkout and does not download dependencies or edit shell configuration. Keep the checkout where it is: the installed skills link to it. Running the installer again is safe. If another installation occupies a target path, it stops before changing any skill links; `--replace` preserves conflicting installations under `${XDG_STATE_HOME:-$HOME/.local/state}/ui-walkthrough-video/backups/` before replacing them with links.

For an old installation cloned directly into `~/.claude/skills/ui-walkthrough-video`, move the checkout to a permanent directory outside the skills directory before switching to this layout. Then run the installer with `--replace` if existing links or other skill installations conflict.

Both skills are available for your next request. Ask:

> Create a UI walkthrough video for this PR: https://github.com/your-team/your-app/pull/123

Or invoke `ui-walkthrough-video` or `elevenlabs-narration` by name in your agent.

## Requirements

- Node.js 18 or newer for the bundled helpers.
- Playwright with a Chromium browser for recording; use the application's existing installation when available.
- `ffmpeg` and `ffprobe` for encoding, narration and verification.
- A locally runnable app with documented authentication and app-supported seed/test data.
- For PDF scenes, `pdftoppm` or the documented macOS fallback.

Install the required tools separately. API keys and app credentials belong in each developer's local environment.

## Optional voice setup

Create a key in the [ElevenLabs API-key dashboard](https://elevenlabs.io/app/developers/api-keys) with Text to Speech access. Each developer supplies their own key; keys are never part of this repository or installer.

For zsh, add these exports to `~/.zshrc` and open a new shell:

```bash
export ELEVENLABS_API_KEY='your-own-key'
# Optional overrides:
export ELEVENLABS_VOICE_ID='IKne3meq5aSn9XLyUdCD'
export ELEVENLABS_MODEL_ID='eleven_multilingual_v2'
```

Charlie (`IKne3meq5aSn9XLyUdCD`) and `eleven_multilingual_v2` are the defaults. An explicit voice/model request takes priority over environment overrides. Choose a voice your account can use through the API; website previews alone do not establish API access. Narration consumes ElevenLabs credits.

With a key, the walkthrough delivers a separate narrated MP4 and preserves the original visual track. Without a key, it produces the usual voiceless video. Asking for a voiceless video overrides automatic narration. Authentication, quota or generation failures are reported rather than presented as successful narration.

## Update

```bash
git -C ~/developer-tools/ui-walkthrough-video pull --ff-only
```

The links point to the checkout, so pulling updates updates both installed skills. Rerun the installer if you move the checkout or add an installation for another agent.
