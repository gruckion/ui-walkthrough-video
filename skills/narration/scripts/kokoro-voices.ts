// Kokoro's names and voices, kept apart from kokoro.ts so that plans can be checked, and
// ElevenLabs can run, without loading koffi or the audio.cpp library.

export const KOKORO_MODEL_ID = 'kokoro-82m';
export const KOKORO_DEFAULT_VOICE = 'am_liam';
// The first letter is the accent or language (a: American English, b: British English, e: Spanish,
// f: French, h: Hindi, i: Italian, p: Brazilian Portuguese); the second is f (female) or m (male).
export const KOKORO_VOICES: readonly string[] = [
  ...['heart', 'alloy', 'aoede', 'bella', 'jessica', 'kore', 'nicole', 'nova', 'river', 'sarah', 'sky'].map((name) => `af_${name}`),
  ...['adam', 'echo', 'eric', 'fenrir', 'liam', 'michael', 'onyx', 'puck', 'santa'].map((name) => `am_${name}`),
  'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
  'ef_dora', 'em_alex', 'em_santa', 'ff_siwis', 'hf_alpha', 'hf_beta', 'hm_omega', 'hm_psi',
  'if_sara', 'im_nicola', 'pf_dora', 'pm_alex', 'pm_santa',
];
export const KOKORO_MIN_SPEED = 0.5;
export const KOKORO_MAX_SPEED = 2;

/** Why these settings cannot be spoken, or undefined when they can. Checked before any download. */
export function kokoroSettingsProblem(voice: string, speed: number): string | undefined {
  if (!KOKORO_VOICES.includes(voice)) return `Unknown Kokoro voice "${voice}". Choose one of: ${KOKORO_VOICES.join(', ')}`;
  if (!(speed >= KOKORO_MIN_SPEED && speed <= KOKORO_MAX_SPEED)) return `Kokoro speed must be between ${KOKORO_MIN_SPEED} and ${KOKORO_MAX_SPEED}`;
  return undefined;
}
