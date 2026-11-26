// Names each spoken line by everything that shapes its audio, so any plan or rebuild that says
// the same line in the same voice reuses it.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Speaker } from './speakers.ts';

export type CacheEntry = { readonly audio: string; readonly metadata: string; readonly cached: boolean };

export function cacheEntry(cache: string, speaker: Pick<Speaker, 'provider' | 'model' | 'extension' | 'identity'>, text: string): CacheEntry {
  const key = createHash('sha256')
    .update(JSON.stringify({ v: 1, provider: speaker.provider, model: speaker.model, identity: speaker.identity, text }))
    .digest('hex');
  const audio = path.join(cache, `${key}.${speaker.extension}`);
  const metadata = path.join(cache, `${key}.json`);
  return { audio, metadata, cached: fs.existsSync(audio) && fs.existsSync(metadata) };
}
