---
name: elevenlabs-narration
description: Generate ElevenLabs speech and synchronize it with an existing video, or add a voiceover to a UI walkthrough. Use for narrated demo videos and timed voiceover requests.
---

# ElevenLabs narration

Add a voiceover to the final edited video, preserving its visual track and saving a separate narrated MP4. Use Node, ffmpeg and ffprobe with [scripts/narrate-video.mjs](scripts/narrate-video.mjs); it caches speech, checks scene fit and muxes AAC audio into the video.

## Credentials and voice

Read `ELEVENLABS_API_KEY` from the environment. If missing, open the [API-key dashboard](https://elevenlabs.io/app/developers/api-keys). The user handles sign-in. Create a named key for this use with Text to Speech access; add Voices read only if browsing voices via API. When asked to store it in `~/.zshrc`, write `export ELEVENLABS_API_KEY='<key>'` directly, preserve other contents, and verify presence without printing its value. Keep keys out of transcripts, plans, scripts and repositories. Launch an interactive zsh to load that file for generation.

Use the user's chosen voice/model when supplied, then `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL_ID` when set. Otherwise use Charlie (`IKne3meq5aSn9XLyUdCD`) with `eleven_multilingual_v2`. Save the resolved choices in the JSON plan; plan values take priority over environment values in the helper. Confirm current model availability from official docs or the API when choosing a different model.

## Plan and generate

1. Inspect the existing footage, final caption chapters and duration. For a walkthrough, use the persistent `~/ui-walkthroughs/<ticket-or-pr>/` directory. Read the PR/recording plan for context and describe only behavior visible in the video. Reuse existing footage when the task is narration for an already recorded demo.
2. Write `scripts/<flow>.narration.json` with short spoken lines and nonoverlapping scene windows on the **final MP4 timeline**, including cuts and the title card. Chapter text may round seconds: derive precise boundaries from build pieces or inspect the video. Leave short gaps around scene changes. Expand currency, symbols and abbreviations into spoken words. A voiceover explains what matters; it need not read the caption verbatim.
3. Run `--dry-run` to validate timing and report the character count before any paid calls, then generate. Each uncached segment uses one API request. Stop on authentication, quota or ambiguous network failures; the helper does not retry automatically.
4. If a clip exceeds its scene, shorten that line or extend the actual scene deliberately, then rebuild to a fresh output filename. Keep cached clips; do not silently truncate speech, overlap scenes or speed the voice beyond intelligibility. The helper replaces an existing audio track, so inspect the source and decide whether intentional original audio needs a separate mix before using it.
5. Verify the narrated MP4 has video and audio, matches source duration, and retains the source visuals. Listen for cut-off words, pronunciation, volume and alignment with each scene. Deliver the MP4 inline or open its preview. Upload or edit PR content only within the user's authorized scope, preserving unrelated description text.

Example plan:

```json
{
  "voice_id": "IKne3meq5aSn9XLyUdCD",
  "model_id": "eleven_multilingual_v2",
  "segments": [
    {"start": 3.15, "end": 6.0, "text": "Every add-on has its own price."},
    {"start": 6.3, "end": 14.6, "text": "Choosing a service fills in its default price."}
  ]
}
```

Copy the helper into the walkthrough's `scripts/` directory so that future rebuilds remain portable:

```sh
node scripts/narrate-video.mjs --video demo.mp4 --plan scripts/demo.narration.json --out demo-narrated.mp4 --dry-run
node scripts/narrate-video.mjs --video demo.mp4 --plan scripts/demo.narration.json --out demo-narrated.mp4
```

## Delivery controls

For v3/v4, square-bracket audio tags guide delivery, and punctuation controls pauses; SSML `<break>` is unsupported. Use tags sparingly in product narration. Stability affects expressive range, and response to tags depends on the voice. Multilingual v2 supports SSML breaks but does not use v3 audio tags. Avoid spoken stage directions. Normalize important amounts and abbreviations yourself and listen to the result. When pronunciation is wrong, revise that word with a phonetic spelling or a model-supported dictionary.

Sources to verify as capabilities change: [speech best practices](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices), [models](https://elevenlabs.io/docs/overview/models), [speech with timing API](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps), [API keys](https://elevenlabs.io/docs/overview/administration/workspaces/api-keys).
