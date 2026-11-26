import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { cacheEntry } from '../skills/narration/scripts/cache.ts';

const kokoro: Parameters<typeof cacheEntry>[1] = { provider: 'kokoro', model: 'kokoro-82m', extension: 'wav', identity: { voice: 'am_liam', speed: 1 } };
const dir = path.join(os.tmpdir(), 'unused-cache');

test('the same speaker and text name the same clip', () => {
  assert.equal(cacheEntry(dir, kokoro, 'Hello.').audio, cacheEntry(dir, { ...kokoro, identity: { ...kokoro.identity } }, 'Hello.').audio);
});

test('anything that changes the audio names a different clip', () => {
  const base = cacheEntry(dir, kokoro, 'Hello.').audio;
  const variants = [
    cacheEntry(dir, kokoro, 'Hello!').audio,
    cacheEntry(dir, { ...kokoro, identity: { voice: 'af_heart', speed: 1 } }, 'Hello.').audio,
    cacheEntry(dir, { ...kokoro, identity: { voice: 'am_liam', speed: 1.1 } }, 'Hello.').audio,
    cacheEntry(dir, { ...kokoro, identity: { voice: 'am_liam', speed: 1, language: 'en-gb' } }, 'Hello.').audio,
    cacheEntry(dir, { ...kokoro, model: 'kokoro-other' }, 'Hello.').audio,
    cacheEntry(dir, { ...kokoro, provider: 'elevenlabs' }, 'Hello.').audio,
  ];
  for (const variant of variants) assert.notEqual(variant, base);
  assert.equal(new Set(variants).size, variants.length);
});

test("a clip takes its speaker's file type", () => {
  assert.match(cacheEntry(dir, kokoro, 'Hi.').audio, /\.wav$/);
  assert.match(cacheEntry(dir, { ...kokoro, provider: 'elevenlabs', extension: 'mp3' }, 'Hi.').audio, /\.mp3$/);
});

test('a clip counts as cached only when its audio and its metadata both exist', () => {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-test-'));
  try {
    const entry = cacheEntry(cache, kokoro, 'Hello.');
    assert.equal(entry.cached, false);
    fs.writeFileSync(entry.audio, 'audio');
    assert.equal(cacheEntry(cache, kokoro, 'Hello.').cached, false);
    fs.writeFileSync(entry.metadata, '{}');
    assert.equal(cacheEntry(cache, kokoro, 'Hello.').cached, true);
  } finally {
    fs.rmSync(cache, { recursive: true, force: true });
  }
});
