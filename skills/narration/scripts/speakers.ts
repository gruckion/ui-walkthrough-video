// The contract every narration voice meets, so timing, caching and mixing stay provider-free.

export type Provider = 'kokoro' | 'elevenlabs';
export const PROVIDERS: readonly Provider[] = ['kokoro', 'elevenlabs'];
export const isProvider = (value: unknown): value is Provider => PROVIDERS.some((provider) => provider === value);

/** One spoken line, as a file ffmpeg can read. */
export type Clip = {
  readonly bytes: Uint8Array;
  readonly extension: 'wav' | 'mp3';
  /** Saved beside the clip, such as a request ID or word alignment. */
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type Speaker = {
  readonly provider: Provider;
  readonly model: string;
  readonly voice: string;
  /** Everything besides the text that changes the audio. It names the clip in the cache. */
  readonly identity: Readonly<Record<string, unknown>>;
  /** Paid providers throw on failure without retrying, since a failed request may have been charged. */
  readonly speak: (text: string, index: number) => Promise<Clip>;
  readonly close: () => void;
};
