// ElevenLabs, a hosted voice. Needs ELEVENLABS_API_KEY and is billed per character.
import type { Clip, Speaker } from './speakers.ts';

export const ELEVENLABS_DEFAULT_VOICE = 'IKne3meq5aSn9XLyUdCD'; // Charlie
export const ELEVENLABS_DEFAULT_MODEL = 'eleven_multilingual_v2';
const OUTPUT_FORMAT = 'mp3_44100_128';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function elevenLabsSpeaker({ voice, model, voiceSettings }: {
  readonly voice: string;
  readonly model: string;
  readonly voiceSettings?: Readonly<Record<string, unknown>>;
}): Speaker {
  if (!/^[A-Za-z0-9_-]+$/.test(voice)) throw new Error('Set an ElevenLabs voice ID in the plan or ELEVENLABS_VOICE_ID');
  if (!model) throw new Error('Invalid ElevenLabs model');
  return {
    provider: 'elevenlabs',
    model,
    voice,
    identity: { voice, model, output_format: OUTPUT_FORMAT, voice_settings: voiceSettings ?? null },
    async speak(text, index): Promise<Clip> {
      if (/eleven_v[34]/.test(model) && /<break\b/.test(text)) throw new Error(`Segment ${index + 1}: v3/v4 use punctuation or audio tags, not SSML breaks`);
      const key = process.env.ELEVENLABS_API_KEY;
      if (!key) throw new Error('ELEVENLABS_API_KEY is missing. Start an interactive zsh that loads ~/.zshrc');
      const request = { text, model_id: model, ...(voiceSettings ? { voice_settings: voiceSettings } : {}) };
      // No automatic retries: ambiguous failures may have consumed credits.
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=${OUTPUT_FORMAT}`, {
        method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        let code = 'request_failed';
        try {
          const body: unknown = await response.json();
          if (isRecord(body) && isRecord(body.detail) && typeof body.detail.status === 'string') code = body.detail.status;
        } catch {}
        throw new Error(`ElevenLabs HTTP ${response.status} (${code}); stopped at segment ${index + 1}`);
      }
      const result: unknown = await response.json();
      if (!isRecord(result) || typeof result.audio_base64 !== 'string' || !result.audio_base64) throw new Error(`No audio returned for segment ${index + 1}`);
      return {
        bytes: Buffer.from(result.audio_base64, 'base64'),
        extension: 'mp3',
        metadata: { request_id: response.headers.get('request-id'), alignment: result.alignment, normalized_alignment: result.normalized_alignment },
      };
    },
    close() {},
  };
}
