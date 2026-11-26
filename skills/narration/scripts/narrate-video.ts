#!/usr/bin/env node
// Node 22.18+, ffmpeg and ffprobe. Read credentials only from the environment.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { cacheEntry } from './cache.ts';
import { ELEVENLABS_DEFAULT_MODEL, ELEVENLABS_DEFAULT_VOICE, elevenLabsSpeaker } from './elevenlabs.ts';
import { KOKORO_DEFAULT_VOICE, kokoroSettingsProblem } from './kokoro-voices.ts';
import { isProvider, isRecord, PROVIDERS, type Provider, type Speaker } from './speakers.ts';

const help = `Usage: node narrate-video.ts --video source.mp4 --plan narration.json --out narrated.mp4 [--cache dir] [--dry-run]
Plan: {provider?, voice?, speed?, language?, model?, voice_settings?, segments: [{start, end, text}]}
  provider  "kokoro" (default; local, no key) or "elevenlabs" (needs ELEVENLABS_API_KEY).
  kokoro    voice (default ${KOKORO_DEFAULT_VOICE}), speed (default 1), language.
  elevenlabs voice (default Charlie), model (default ${ELEVENLABS_DEFAULT_MODEL}), voice_settings.
  A plan with voice_id, model_id or voice_settings and no provider is an ElevenLabs plan.
Times are seconds on the FINAL video, after cuts and title cards. Output replaces the audio track.
Clips are cached by provider, voice, settings and text in --cache, by default narration-cache/ beside
the video, so a rebuild only makes the lines that changed. Never overwrites source or output.`;

type Segment = { readonly start: number; readonly end: number; readonly text: string };
type Plan = {
  readonly provider?: Provider;
  readonly voice?: string;
  readonly model?: string;
  readonly speed?: number;
  readonly language?: string;
  readonly voice_settings?: Record<string, unknown>;
  readonly voice_id?: string;
  readonly model_id?: string;
  readonly segments: readonly Segment[];
};
type Stream = { readonly codec_type?: string };
type Probe = { readonly format: { readonly duration?: string }; readonly streams: readonly Stream[] };
type Placed = Segment & { readonly audio: string; readonly duration: number; readonly available: number; readonly cached: boolean };

const isSegment = (value: unknown): value is Segment =>
  isRecord(value) && typeof value.start === 'number' && typeof value.end === 'number' && typeof value.text === 'string';
const isProbe = (value: unknown): value is Probe =>
  isRecord(value) && isRecord(value.format) && Array.isArray(value.streams) && value.streams.every(isRecord);

/** The first thing wrong with the plan's shape, naming the field. */
function planShapeProblem(value: unknown): string | undefined {
  if (!isRecord(value)) return 'The plan must be a JSON object';
  if (value.provider !== undefined && !isProvider(value.provider)) return `provider must be one of: ${PROVIDERS.join(', ')}`;
  for (const field of ['voice', 'model', 'language', 'voice_id', 'model_id'])
    if (value[field] !== undefined && typeof value[field] !== 'string') return `${field} must be a string`;
  if (value.speed !== undefined && typeof value.speed !== 'number') return 'speed must be a number';
  if (value.voice_settings !== undefined && !isRecord(value.voice_settings)) return 'voice_settings must be an object';
  if (!Array.isArray(value.segments)) return 'segments must be a list';
  const bad = value.segments.findIndex((segment) => !isSegment(segment));
  if (bad >= 0) return `segment ${bad + 1} needs a numeric start and end and a text string`;
  return undefined;
}
const isPlan = (value: unknown): value is Plan => planShapeProblem(value) === undefined;

/** The first timing rule segment `index` breaks, or undefined. Times are on the final video. */
function segmentProblem(segment: Segment, index: number, previousEnd: number, total: number): string | undefined {
  const name = `Segment ${index + 1}`;
  if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end)) return `${name}: start and end must be finite numbers`;
  if (segment.end <= segment.start) return `${name}: end (${segment.end}) must be after start (${segment.start})`;
  if (segment.start < previousEnd) return `${name}: starts at ${segment.start}, before the previous segment ends at ${previousEnd}`;
  if (segment.end > total + 0.001) return `${name}: ends at ${segment.end}, after the video ends at ${total}`;
  if (!segment.text.trim()) return `${name}: text is empty`;
  return undefined;
}

function run(bin: string, args: readonly string[]): string {
  return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
}
function probe(file: string): Probe {
  const result: unknown = JSON.parse(run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file]));
  if (!isProbe(result)) throw new Error(`ffprobe returned an unexpected shape for ${file}`);
  return result;
}
const duration = (file: string) => Number(probe(file).format.duration);
const hasStream = (info: Probe, type: string) => info.streams.some((s) => s.codec_type === type);

function parseOptions() {
  const flags = new Set(['dry-run', 'help']);
  const values = new Set(['video', 'plan', 'out', 'cache']);
  const options = new Map<string, string>();
  const switches = new Set<string>();
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    const key = arg.replace(/^--/, '');
    if (!arg.startsWith('--') || (!flags.has(key) && !values.has(key))) throw new Error(`Unknown option: ${arg}`);
    if (flags.has(key)) {
      switches.add(key);
      continue;
    }
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    options.set(key, value);
  }
  const required = (key: string) => {
    const value = options.get(key);
    if (!value) throw new Error(`Missing --${key}\n${help}`);
    return value;
  };
  return { help: switches.has('help'), dryRun: switches.has('dry-run'), required, cache: options.get('cache') };
}

/**
 * The plan's provider, else ElevenLabs for an older plan that names any ElevenLabs field, else
 * Kokoro. Kokoro's module loads koffi, so it is imported only when a plan uses it.
 */
async function speakerFor(plan: Plan): Promise<Speaker> {
  const legacy = plan.voice_id !== undefined || plan.model_id !== undefined || plan.voice_settings !== undefined;
  const provider: Provider = plan.provider ?? (legacy ? 'elevenlabs' : 'kokoro');
  if (provider === 'kokoro') {
    if (!plan.provider && process.env.ELEVENLABS_VOICE_ID)
      console.error('Warning: ELEVENLABS_VOICE_ID is set, but the plan names no provider, so it uses Kokoro. Add "provider": "elevenlabs" to use ElevenLabs.');
    const voice = plan.voice ?? KOKORO_DEFAULT_VOICE;
    const speed = plan.speed ?? 1;
    const problem = kokoroSettingsProblem(voice, speed);
    if (problem) throw new Error(problem);
    const { kokoroSpeaker } = await import('./kokoro.ts');
    return kokoroSpeaker({ voice, speed, ...(plan.language ? { language: plan.language } : {}) });
  }
  return elevenLabsSpeaker({
    voice: plan.voice ?? plan.voice_id ?? process.env.ELEVENLABS_VOICE_ID ?? ELEVENLABS_DEFAULT_VOICE,
    model: plan.model ?? plan.model_id ?? process.env.ELEVENLABS_MODEL_ID ?? ELEVENLABS_DEFAULT_MODEL,
    ...(plan.voice_settings ? { voiceSettings: plan.voice_settings } : {}),
  });
}

async function main() {
  const options = parseOptions();
  if (options.help) return console.log(help);
  const video = fs.realpathSync(options.required('video'));
  const out = path.resolve(options.required('out'));
  if (!out.endsWith('.mp4')) throw new Error('Output must end in .mp4');
  if (out === video || fs.existsSync(out)) throw new Error('Choose a new output path; source and existing outputs are preserved');
  const plan: unknown = JSON.parse(fs.readFileSync(options.required('plan'), 'utf8'));
  if (!isPlan(plan)) throw new Error(`The plan is invalid: ${planShapeProblem(plan)}.\n${help}`);
  const info = probe(video);
  const total = Number(info.format.duration);
  if (!hasStream(info, 'video') || !Number.isFinite(total)) throw new Error('Input needs a video stream and a finite duration');
  if (!plan.segments.length || plan.segments.length > 100) throw new Error('Plan needs 1–100 segments');
  let previousEnd = 0;
  for (const [i, s] of plan.segments.entries()) {
    const problem = segmentProblem(s, i, previousEnd, total);
    if (problem) throw new Error(problem);
    previousEnd = s.end;
  }
  const speaker = await speakerFor(plan);
  const cache = path.resolve(options.cache ?? path.join(path.dirname(video), 'narration-cache'));
  const entries = plan.segments.map((s) => cacheEntry(cache, speaker, s.text));
  const uncached = plan.segments.filter((_, i) => !entries[i]?.cached);
  console.log(JSON.stringify({
    duration_seconds: total, provider: speaker.provider, model: speaker.model, voice: speaker.voice, segments: plan.segments.length,
    cached_segments: plan.segments.length - uncached.length, characters_to_generate: uncached.reduce((n, s) => n + s.text.length, 0),
    cache, existing_audio: hasStream(info, 'audio'), dry_run: options.dryRun,
  }));
  if (options.dryRun) return;

  const work = out.replace(/\.mp4$/, '.narration');
  fs.mkdirSync(work, { recursive: true });
  fs.mkdirSync(cache, { recursive: true });
  const report: Placed[] = [];
  try {
    for (const [i, s] of plan.segments.entries()) {
      const entry = entries[i];
      if (!entry) throw new Error(`No cache entry for segment ${i + 1}`);
      if (!entry.cached) {
        const clip = await speaker.speak(s.text, i);
        // Written beside the cache, then renamed, so an interrupted run never leaves half a clip.
        const partial = `${entry.audio}.${process.pid}.part`;
        fs.writeFileSync(partial, clip.bytes);
        fs.renameSync(partial, entry.audio);
        fs.writeFileSync(entry.metadata, JSON.stringify({ provider: speaker.provider, model: speaker.model, identity: speaker.identity, text: s.text, ...clip.metadata }, null, 2));
      }
      const seconds = duration(entry.audio);
      const available = s.end - s.start;
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Invalid audio duration for segment ${i + 1}`);
      report.push({ ...s, audio: entry.audio, duration: seconds, available, cached: entry.cached });
      fs.writeFileSync(path.join(work, 'report.json'), JSON.stringify(report, null, 2));
      if (seconds > available + 0.001) throw new Error(`Segment ${i + 1} is ${seconds.toFixed(2)}s but has ${available.toFixed(2)}s. Shorten its text or revise the scene timing; cached audio is retained`);
      console.log(`Segment ${i + 1}: ${seconds.toFixed(2)}s / ${available.toFixed(2)}s${entry.cached ? ' (cached)' : ''}`);
    }
  } finally {
    speaker.close();
  }
  const filters = report.map((s, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=mono,asetpts=PTS-STARTPTS,adelay=${Math.round(s.start * 1000)}:all=1[a${i}]`);
  filters.push(`${report.map((_, i) => `[a${i}]`).join('')}amix=inputs=${report.length}:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=duration=${total}[n]`);
  const wav = path.join(work, 'narration.wav');
  run('ffmpeg', ['-v', 'error', '-y', ...report.flatMap((s) => ['-i', s.audio]), '-filter_complex', filters.join(';'), '-map', '[n]', '-ar', '48000', '-c:a', 'pcm_s16le', wav]);
  try {
    run('ffmpeg', ['-v', 'error', '-n', '-i', video, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', String(total), '-movflags', '+faststart', out]);
    const finalInfo = probe(out);
    const finalDuration = Number(finalInfo.format.duration);
    if (!hasStream(finalInfo, 'audio') || Math.abs(total - finalDuration) > 0.1) throw new Error('Output verification failed: audio stream or duration');
    console.log(JSON.stringify({ output: out, duration_seconds: finalDuration, report: path.join(work, 'report.json') }));
  } catch (error) {
    if (fs.existsSync(out)) fs.unlinkSync(out);
    throw error;
  }
}

// audio.cpp's GPU backend prints a line for every kernel it compiles, straight to stderr. Its log
// hook cannot help: it calls back from GPU threads while Node waits on the engine, which
// deadlocks. So the script reruns itself as a child and drops those lines from its stderr.
const QUIET = 'NARRATE_VIDEO_CHILD';
const STOP_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
if (process.env[QUIET]) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
} else {
  const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    env: { ...process.env, [QUIET]: '1' },
    stdio: ['inherit', 'inherit', 'pipe'],
  });
  // A stop sent to this process (a Ctrl+C, or a caller's timeout) must stop the narration too,
  // or the child would go on to write the video after its caller gave up.
  for (const signal of STOP_SIGNALS) process.on(signal, () => child.kill(signal));
  createInterface({ input: child.stderr }).on('line', (line) => {
    if (!/^ggml_/.test(line)) process.stderr.write(`${line}\n`);
  });
  child.on('close', (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}
