---
name: narration
description: Generate speech and synchronize it with an existing video, or add a voiceover to a UI walkthrough. Uses Kokoro, a local text-to-speech model, by default, or ElevenLabs when asked. Use for narrated demo videos and timed voiceover requests.
---

# Narration

Add a voiceover to the final edited video, preserving its visual track and saving a separate narrated MP4. Use Node 22.18 or newer, ffmpeg and ffprobe with [scripts/narrate-video.ts](scripts/narrate-video.ts). It speaks each line, checks that it fits its scene, caches it, and muxes AAC audio into the video.

## Voices

Two providers. The plan's `provider` picks one; Kokoro is the default.

- **Kokoro** (`"provider": "kokoro"`): an open 82M-parameter model that runs on this machine through audio.cpp. No account, key or cost. The first run downloads the model, its eSpeak data and the audio.cpp library (about 225 MB on macOS) into `~/.cache/ui-walkthrough-video/kokoro/`, and checks each file's SHA-256. When T3 Code has already installed the same files in `~/.t3/userdata/speech/`, those are used instead. Builds exist for macOS (Apple silicon and Intel), Linux and Windows on x64 and arm64.
  - `voice`: default `af_heart`. The first letter is the accent or language (`a` American English, `b` British English, `e` Spanish, `f` French, `h` Hindi, `i` Italian, `p` Brazilian Portuguese), the second is `f` or `m`. For example `am_michael`, `bf_emma`, `bm_george`. The script lists every voice when given an unknown one.
  - `speed`: default 1, from 0.5 to 2. The model itself speaks faster or slower.
  - `language`: optional; the voice's language is used otherwise.
- **ElevenLabs** (`"provider": "elevenlabs"`): hosted, billed per character, needs `ELEVENLABS_API_KEY`. Use it only when the user asks for it.
  - `voice`: the user's choice, then `ELEVENLABS_VOICE_ID`, then Charlie (`IKne3meq5aSn9XLyUdCD`). `model`: the user's choice, then `ELEVENLABS_MODEL_ID`, then `eleven_multilingual_v2`. `voice_settings` passes through.
  - Read the key only from the environment. If it is missing, open the [API-key dashboard](https://elevenlabs.io/app/developers/api-keys); the user signs in and creates a key with Text to Speech access. When asked to store it in `~/.zshrc`, write `export ELEVENLABS_API_KEY='<key>'`, keep the file's other contents, and check it is present without printing it. Launch an interactive zsh to load it. Keep keys out of transcripts, plans, scripts and repositories.
  - A plan with `voice_id` or `model_id` and no `provider` is an older ElevenLabs plan and still works.

Save the resolved provider, voice and settings in the plan.

## Plan and generate

1. Inspect the existing footage, final caption chapters and duration. For a walkthrough, use the persistent `~/ui-walkthroughs/<ticket-or-pr>/` directory. Read the PR/recording plan for context and describe only behavior visible in the video. Reuse existing footage when the task is narration for an already recorded demo.
2. Write `scripts/<flow>.narration.json` with short spoken lines and nonoverlapping scene windows on the **final MP4 timeline**, including cuts and the title card. Chapter text may round seconds: derive precise boundaries from build pieces or inspect the video. Leave short gaps around scene changes. Expand currency, symbols and abbreviations into spoken words. A voiceover explains what matters; it need not read the caption verbatim.
3. Run `--dry-run` first. It validates timing and reports the provider, how many lines are already cached, and the characters still to generate, without downloading or calling anything. Then generate. Each uncached ElevenLabs line is one paid request; stop on authentication, quota or ambiguous network failures, since the helper does not retry.
4. If a clip exceeds its scene, shorten that line or extend the actual scene deliberately, then rebuild to a fresh output filename. Do not silently truncate speech, overlap scenes or speed the voice beyond intelligibility. The helper replaces an existing audio track, so inspect the source and decide whether intentional original audio needs a separate mix before using it.
5. Verify the narrated MP4 has video and audio, matches source duration, and retains the source visuals. Listen for cut-off words, pronunciation, volume and alignment with each scene. Deliver the MP4 inline or open its preview. Upload or edit PR content only within the user's authorized scope, preserving unrelated description text.

Example plans:

```json
{
  "provider": "kokoro",
  "voice": "af_heart",
  "speed": 1,
  "segments": [
    { "start": 3.15, "end": 6.0, "text": "Every add-on has its own price." },
    {
      "start": 6.3,
      "end": 14.6,
      "text": "Choosing a service fills in its default price."
    }
  ]
}
```

```json
{
  "provider": "elevenlabs",
  "voice": "IKne3meq5aSn9XLyUdCD",
  "model": "eleven_multilingual_v2",
  "segments": [
    { "start": 3.15, "end": 6.0, "text": "Every add-on has its own price." }
  ]
}
```

## Cache

Each clip is named by a hash of its provider, model, voice, settings and text, and kept in `narration-cache/` beside the source video (`--cache <dir>` changes it). A rebuild to a new output name, or another plan that says the same line in the same voice, reuses the clip, so only changed lines are generated again. Keep the cache between rebuilds; delete it to force fresh audio.

## Run

Copy every file in [scripts/](scripts/) into the walkthrough's `scripts/` directory so that future rebuilds stay portable, and add `koffi` 3.3.6 to that directory's `package.json` (Kokoro loads audio.cpp through it). That `package.json` needs `"type": "module"`, or Node warns on every run:

```sh
cd ~/ui-walkthroughs/<ticket-or-pr>/scripts && npm pkg set type=module && npm install --save-exact koffi@3.3.6
node narrate-video.ts --video ../demo.mp4 --plan demo.narration.json --out ../demo-narrated.mp4 --dry-run
node narrate-video.ts --video ../demo.mp4 --plan demo.narration.json --out ../demo-narrated.mp4
```

## Delivery controls

Kokoro reads plain text. Punctuation controls pauses; it has no audio tags or SSML. Write numbers, symbols and abbreviations as words, and respell a word phonetically when it is mispronounced.

For ElevenLabs v3/v4, square-bracket audio tags guide delivery, and punctuation controls pauses; SSML `<break>` is unsupported. Use tags sparingly in product narration. Stability affects expressive range, and response to tags depends on the voice. Multilingual v2 supports SSML breaks but does not use v3 audio tags. Avoid spoken stage directions.

Sources to verify as capabilities change: [Kokoro model card](https://huggingface.co/hexgrad/Kokoro-82M), [audio.cpp releases](https://github.com/pingdotgg/audio.cpp/releases), [ElevenLabs speech best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices), [ElevenLabs models](https://elevenlabs.io/docs/overview/models), [speech with timing API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps), [API keys](https://elevenlabs.io/docs/overview/administration/workspaces/api-keys).
