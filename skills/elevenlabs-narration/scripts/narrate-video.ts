#!/usr/bin/env node
// Node 22.18+, ffmpeg and ffprobe. Read credentials only from the environment.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const help = `Usage: node narrate-video.ts --video source.mp4 --plan narration.json --out narrated.mp4 [--dry-run]
Plan: {voice_id, model_id?, voice_settings?, segments: [{start, end, text}]}
Times are seconds on the FINAL video, after cuts and title cards. Output replaces the audio track.
Uses ELEVENLABS_API_KEY, optional ELEVENLABS_VOICE_ID / ELEVENLABS_MODEL_ID.
Caches requests beside the output in <output-name>.narration/. Never overwrites source or output.`;

type Segment = { readonly start: number; readonly end: number; readonly text: string };
type Plan = {
  readonly voice_id?: string;
  readonly model_id?: string;
  readonly voice_settings?: Record<string, unknown>;
  readonly segments: readonly Segment[];
};
type Stream = { readonly codec_type?: string };
type Probe = { readonly format: { readonly duration?: string }; readonly streams: readonly Stream[] };
type Placed = Segment & { readonly audio: string; readonly duration: number; readonly available: number; readonly cached: boolean };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isSegment = (value: unknown): value is Segment =>
  isRecord(value) && typeof value.start === 'number' && typeof value.end === 'number' && typeof value.text === 'string';
const isPlan = (value: unknown): value is Plan =>
  isRecord(value) &&
  (value.voice_id === undefined || typeof value.voice_id === 'string') &&
  (value.model_id === undefined || typeof value.model_id === 'string') &&
  (value.voice_settings === undefined || isRecord(value.voice_settings)) &&
  Array.isArray(value.segments) && value.segments.every(isSegment);
const isProbe = (value: unknown): value is Probe =>
  isRecord(value) && isRecord(value.format) && Array.isArray(value.streams) && value.streams.every(isRecord);

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
  const values = new Set(['video', 'plan', 'out']);
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
  return { help: switches.has('help'), dryRun: switches.has('dry-run'), required };
}

async function synthesize(voice: string, request: Record<string, unknown>, index: number) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is missing. Start an interactive zsh that loads ~/.zshrc');
  // No automatic retries: ambiguous failures may have consumed credits.
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, {
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
    audio: Buffer.from(result.audio_base64, 'base64'),
    requestId: response.headers.get('request-id'),
    alignment: result.alignment,
    normalizedAlignment: result.normalized_alignment,
  };
}

async function main() {
  const options = parseOptions();
  if (options.help) return console.log(help);
  const video = fs.realpathSync(options.required('video'));
  const out = path.resolve(options.required('out'));
  if (!out.endsWith('.mp4')) throw new Error('Output must end in .mp4');
  if (out === video || fs.existsSync(out)) throw new Error('Choose a new output path; source and existing outputs are preserved');
  const plan: unknown = JSON.parse(fs.readFileSync(options.required('plan'), 'utf8'));
  if (!isPlan(plan)) throw new Error('Plan must be {voice_id?, model_id?, voice_settings?, segments: [{start, end, text}]}');
  const info = probe(video);
  const total = Number(info.format.duration);
  if (!hasStream(info, 'video') || !Number.isFinite(total)) throw new Error('Input needs a video stream and a finite duration');
  const voice = plan.voice_id ?? process.env.ELEVENLABS_VOICE_ID;
  const model = plan.model_id ?? process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2';
  if (typeof voice !== 'string' || !/^[A-Za-z0-9_-]+$/.test(voice)) throw new Error('Set voice_id in the plan or ELEVENLABS_VOICE_ID');
  if (!model) throw new Error('Invalid model_id');
  if (!plan.segments.length || plan.segments.length > 100) throw new Error('Plan needs 1–100 segments');
  let previousEnd = 0;
  for (const [i, s] of plan.segments.entries()) {
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < previousEnd || s.end <= s.start || s.end > total + 0.001 || !s.text.trim()) throw new Error(`Invalid/overlapping segment ${i + 1}`);
    if (/eleven_v[34]/.test(model) && /<break\b/.test(s.text)) throw new Error(`Segment ${i + 1}: v3/v4 use punctuation or audio tags, not SSML breaks`);
    previousEnd = s.end;
  }
  console.log(JSON.stringify({ duration_seconds: total, voice_id: voice, model_id: model, segments: plan.segments.length, characters: plan.segments.reduce((n, s) => n + s.text.length, 0), existing_audio: hasStream(info, 'audio'), dry_run: options.dryRun }));
  if (options.dryRun) return;

  const work = out.replace(/\.mp4$/, '.narration');
  fs.mkdirSync(work, { recursive: true });
  const report: Placed[] = [];
  for (const [i, s] of plan.segments.entries()) {
    const request = { text: s.text, model_id: model, ...(plan.voice_settings ? { voice_settings: plan.voice_settings } : {}) };
    const hash = createHash('sha256').update(JSON.stringify({ voice, output_format: 'mp3_44100_128', request })).digest('hex');
    const audio = path.join(work, `${hash}.mp3`);
    const metadata = path.join(work, `${hash}.json`);
    const cached = fs.existsSync(audio) && fs.existsSync(metadata);
    if (!cached) {
      const result = await synthesize(voice, request, i);
      fs.writeFileSync(audio, result.audio);
      fs.writeFileSync(metadata, JSON.stringify({ voice_id: voice, request, request_id: result.requestId, alignment: result.alignment, normalized_alignment: result.normalizedAlignment }, null, 2));
    }
    const seconds = duration(audio);
    const available = s.end - s.start;
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Invalid audio duration for segment ${i + 1}`);
    report.push({ ...s, audio, duration: seconds, available, cached });
    fs.writeFileSync(path.join(work, 'report.json'), JSON.stringify(report, null, 2));
    if (seconds > available + 0.001) throw new Error(`Segment ${i + 1} is ${seconds.toFixed(2)}s but has ${available.toFixed(2)}s. Shorten its text or revise the scene timing; cached audio is retained`);
    console.log(`Segment ${i + 1}: ${seconds.toFixed(2)}s / ${available.toFixed(2)}s${cached ? ' (cached)' : ''}`);
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
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
