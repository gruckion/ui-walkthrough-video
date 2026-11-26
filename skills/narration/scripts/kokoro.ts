// Kokoro 82M, a local text-to-speech model, run through audio.cpp. No account or API key.
// The model, its eSpeak data and the audio.cpp library download once (about 225 MB on macOS)
// into the user's cache, and are checked against the same SHA-256 sums T3 Code uses. When
// T3 Code has already installed them, those copies are used instead.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { loadSpeechModel, type Audio, type SpeechModel } from './audio-cpp.ts';
import type { Clip, Speaker } from './speakers.ts';

// A release of github.com/pingdotgg/audio.cpp, the build T3 Code ships.
const AUDIO_CPP_VERSION = 't3-2026.11.17';
const RELEASE = `https://github.com/pingdotgg/audio.cpp/releases/download/${AUDIO_CPP_VERSION}`;
const GGUF_REVISION = '7a103b33f04120535bdfe97b5f65b79d3c90d708';

type Asset = { readonly filename: string; readonly url: string; readonly size: number; readonly sha256: string };
type Runtime = Asset & { readonly library: string; readonly backend: 'metal' | 'vulkan' | 'cpu' };

const runtime = (name: string, size: number, sha256: string, library: string, backend: Runtime['backend']): Runtime => {
  const filename = `audio-${AUDIO_CPP_VERSION}-lib-${name}`;
  return { filename, url: `${RELEASE}/${filename}`, size, sha256, library, backend };
};
const RUNTIMES: Readonly<Record<string, Runtime>> = {
  'darwin-arm64': runtime('macos-arm64-metal.tar.gz', 15_293_898, '4f06e1d834e2e7a43fb9f257d561e946196a9e2459a8b4648cf36e24a0e5ac14', 'libs/libaudiocpp.0.1.0.dylib', 'metal'),
  'darwin-x64': runtime('macos-x64-cpu.tar.gz', 16_460_460, '02066f1ee9a7cad1a601d65cc6be3349ad570d9b9268c65e17b7cf88b706f10b', 'libs/libaudiocpp.0.1.0.dylib', 'cpu'),
  'linux-x64': runtime('linux-x64-vulkan.tar.gz', 46_783_748, '3b6ce18303f203eabc82997a2af14e6052f5aad2ea326e444973200a5fd908ca', 'libs/libaudiocpp.so.0.1.0', 'vulkan'),
  'linux-arm64': runtime('linux-arm64-vulkan.tar.gz', 40_477_068, '39c59b4ef06fe1ac8fd49fbdf14d3392515949d719ce1ebda5134a73a5c4fd10', 'libs/libaudiocpp.so.0.1.0', 'vulkan'),
  'win32-arm64': runtime('windows-arm64-vulkan.zip', 34_757_900, '2e3692e2eab320d58056e38492d8fa2dc8e0de9699e156d783addae3c789c50c', 'libs/audiocpp.dll', 'vulkan'),
  'win32-x64': runtime('windows-x64-vulkan.zip', 34_618_677, '25b3516d94d0f56b284689b3bf358b3f90e4f1a8ec8398c41ef5fa3806abbb1c', 'libs/audiocpp.dll', 'vulkan'),
};
const ESPEAK_DATA: Asset = {
  filename: `audio-${AUDIO_CPP_VERSION}-espeak-ng-data.bin`,
  url: `${RELEASE}/audio-${AUDIO_CPP_VERSION}-espeak-ng-data.bin`,
  size: 18_383_744,
  sha256: '59e581e5d0074112285592be38288da1e5e1f158b61ae236c99abbd6ed09e7c0',
};
const KOKORO_MODEL: Asset = {
  filename: 'kokoro-82m-q8_0.gguf',
  url: `https://huggingface.co/audio-cpp/audio.cpp-gguf/resolve/${GGUF_REVISION}/Kokoro-82M-GGUF/kokoro-82m-q8_0.gguf`,
  size: 189_550_976,
  sha256: '9a4ca6176460cdc8c7845b804c0bbe85a4791ee3ffff568a3fdadbb708c63f47',
};

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

const cacheRoot = () =>
  path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'ui-walkthrough-video', 'kokoro', AUDIO_CPP_VERSION);
// Where T3 Code installs the same files.
const T3_SPEECH = path.join(os.homedir(), '.t3', 'userdata', 'speech');

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

async function matches(file: string, asset: Asset): Promise<boolean> {
  try {
    if (fs.statSync(file).size !== asset.size) return false;
  } catch {
    return false;
  }
  return (await sha256(file)) === asset.sha256;
}

async function download(asset: Asset, destination: string): Promise<void> {
  console.error(`Downloading ${asset.filename} (${(asset.size / 1e6).toFixed(0)} MB) from ${new URL(asset.url).host}`);
  const response = await fetch(asset.url, { signal: AbortSignal.timeout(15 * 60_000) });
  if (!response.ok || !response.body) throw new Error(`Download of ${asset.filename} failed: HTTP ${response.status}`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const partial = `${destination}.${process.pid}.part`;
  try {
    const reader = response.body.getReader();
    const handle = fs.openSync(partial, 'w');
    try {
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) fs.writeSync(handle, chunk.value);
    } finally {
      fs.closeSync(handle);
    }
    if (!(await matches(partial, asset))) throw new Error(`${asset.filename} did not match its SHA-256 checksum; the download was discarded`);
    fs.renameSync(partial, destination);
  } finally {
    fs.rmSync(partial, { force: true });
  }
}

/** A checked copy of `asset`: T3 Code's when it matches, else the cache's, downloading if needed. */
async function file(asset: Asset, t3Name: string): Promise<string> {
  const cached = path.join(cacheRoot(), asset.filename);
  const marker = `${cached}.verified`;
  if (fs.existsSync(marker) && fs.existsSync(cached)) return cached;
  const fromT3 = path.join(T3_SPEECH, 'models', t3Name);
  if (await matches(fromT3, asset)) return fromT3;
  if (!(await matches(cached, asset))) await download(asset, cached);
  fs.writeFileSync(marker, asset.sha256);
  return cached;
}

/** The audio.cpp library for this machine, unpacked from its checked release archive. */
async function library(): Promise<{ readonly path: string; readonly backend: string }> {
  const platform = `${process.platform}-${process.arch}`;
  const release = RUNTIMES[platform];
  if (!release) throw new Error(`Kokoro narration has no audio.cpp build for ${platform}. Use the ElevenLabs provider.`);
  // T3 Code writes .t3-complete last, after checking the archive, so its unpacked copy is whole.
  const t3Directory = path.join(T3_SPEECH, 'runtime', `audio-cpp-${AUDIO_CPP_VERSION}-${platform}`);
  const t3Complete = path.join(t3Directory, '.t3-complete');
  if (fs.existsSync(t3Complete) && fs.readFileSync(t3Complete, 'utf8').trim() === AUDIO_CPP_VERSION && fs.existsSync(path.join(t3Directory, release.library)))
    return { path: path.join(t3Directory, release.library), backend: release.backend };
  const directory = path.join(cacheRoot(), `runtime-${platform}`);
  const complete = path.join(directory, '.complete');
  if (!fs.existsSync(complete)) {
    const archive = path.join(cacheRoot(), release.filename);
    if (!(await matches(archive, release))) await download(release, archive);
    const staging = `${directory}.${process.pid}.staging`;
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    // System tar reads .tar.gz on macOS and Linux, and .zip on Windows 10 and later.
    execFileSync('tar', ['-xf', archive, '-C', staging]);
    if (!fs.existsSync(path.join(staging, release.library))) throw new Error(`The audio.cpp archive has no ${release.library}`);
    fs.writeFileSync(path.join(staging, '.complete'), AUDIO_CPP_VERSION);
    fs.rmSync(directory, { recursive: true, force: true });
    fs.renameSync(staging, directory);
    fs.rmSync(archive, { force: true });
  }
  return { path: path.join(directory, release.library), backend: release.backend };
}

// audio.cpp unpacks eSpeak's data to <cache>/audio.cpp/espeak-data/<16 hex>-0/espeak-ng-data,
// and eSpeak cannot open a data path over 160 characters. A long cache path falls back to a
// short one in the system temp directory, where the data is unpacked again when it is cleared.
const ESPEAK_SUFFIX = '/audio.cpp/espeak-data/0123456789abcdef-0/espeak-ng-data/phontab';
const ESPEAK_PATH_LIMIT = 159;
function espeakCache(): string {
  const preferred = path.join(cacheRoot(), 'espeak-cache');
  if (preferred.length + ESPEAK_SUFFIX.length <= ESPEAK_PATH_LIMIT) return preferred;
  return path.join(os.tmpdir(), `uwv-espeak-${AUDIO_CPP_VERSION}`);
}

/** 16-bit PCM WAV, downmixed to mono. */
function wav(audio: Audio): Uint8Array {
  const frames = Math.floor(audio.samples.length / audio.channels);
  const bytes = new Uint8Array(44 + frames * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, audio.sampleRate, true); view.setUint32(28, audio.sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * 2, true);
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let channel = 0; channel < audio.channels; channel++) sum += audio.samples[frame * audio.channels + channel] ?? 0;
    const sample = Math.max(-1, Math.min(1, sum / audio.channels || 0));
    view.setInt16(44 + frame * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return bytes;
}

export function kokoroSpeaker({ voice, speed, language }: { readonly voice: string; readonly speed: number; readonly language?: string }): Speaker {
  if (!KOKORO_VOICES.includes(voice)) throw new Error(`Unknown Kokoro voice "${voice}". Choose one of: ${KOKORO_VOICES.join(', ')}`);
  if (!(speed >= 0.5 && speed <= 2)) throw new Error('Kokoro speed must be between 0.5 and 2');
  let model: SpeechModel | undefined;
  const load = async () => {
    if (model) return model;
    const [lib, gguf, espeak] = await Promise.all([library(), file(KOKORO_MODEL, KOKORO_MODEL.filename), file(ESPEAK_DATA, ESPEAK_DATA.filename)]);
    // audio.cpp reads these when it phonemizes text.
    process.env.AUDIOCPP_ESPEAK_DATA = espeak;
    process.env.AUDIOCPP_ESPEAK_CACHE = espeakCache();
    model = loadSpeechModel(lib.path, gguf, { backend: lib.backend, threads: Math.max(1, Math.min(8, os.availableParallelism() - 1)) });
    return model;
  };
  return {
    provider: 'kokoro',
    model: KOKORO_MODEL_ID,
    voice,
    identity: { voice, speed, language: language ?? null, audio_cpp: AUDIO_CPP_VERSION, model_sha256: KOKORO_MODEL.sha256 },
    async speak(text): Promise<Clip> {
      const loaded = await load();
      const audio = loaded.speak({ text, ...(language ? { language } : {}), options: { voice_id: voice, speed: String(speed) } });
      return { bytes: wav(audio), extension: 'wav', metadata: { backend: loaded.backend, sample_rate: audio.sampleRate } };
    },
    close() {
      model?.dispose();
      model = undefined;
    },
  };
}
