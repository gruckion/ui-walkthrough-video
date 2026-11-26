// The contract every narration voice meets, so timing, caching and mixing stay provider-free.

export type Provider = 'kokoro' | 'elevenlabs';
export const PROVIDERS: readonly Provider[] = ['kokoro', 'elevenlabs'];
export const isProvider = (value: unknown): value is Provider => PROVIDERS.some((provider) => provider === value);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One spoken line. */
export type Clip = {
  readonly bytes: Uint8Array;
  /** Saved beside the clip, such as a request ID or word alignment. */
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type Speaker = {
  readonly provider: Provider;
  readonly model: string;
  readonly voice: string;
  /** The file type of every clip this speaker returns, known before it speaks so the cache can be checked. */
  readonly extension: 'wav' | 'mp3';
  /** Everything besides the text that changes the audio. It names the clip in the cache. */
  readonly identity: Readonly<Record<string, unknown>>;
  /** Paid providers throw on failure without retrying, since a failed request may have been charged. */
  readonly speak: (text: string, index: number) => Promise<Clip>;
  readonly close: () => void;
};
