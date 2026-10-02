#!/usr/bin/env node
// Node 18+, ffmpeg and ffprobe. Read credentials only from the environment.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const help = `Usage: node narrate-video.mjs --video source.mp4 --plan narration.json --out narrated.mp4 [--dry-run]
Plan: {voice_id, model_id?, voice_settings?, segments: [{start, end, text}]}
Times are seconds on the FINAL video, after cuts and title cards. Output replaces the audio track.
Uses ELEVENLABS_API_KEY, optional ELEVENLABS_VOICE_ID / ELEVENLABS_MODEL_ID.
Caches requests beside the output in <output-name>.narration/. Never overwrites source or output.`;

function run(bin, args) {
  return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 });
}
function probe(file) {
  return JSON.parse(run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file]));
}
const duration = file => Number(probe(file).format.duration);

async function main() {
  const options = {};
  const allowed = new Set(['video', 'plan', 'out', 'dry-run', 'help']);
  for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i].replace(/^--/, '');
    if (!process.argv[i].startsWith('--') || !allowed.has(key)) throw new Error(`Unknown option: ${process.argv[i]}`);
    if (['dry-run', 'help'].includes(key)) options[key] = true;
    else {
      options[key] = process.argv[++i];
      if (!options[key] || options[key].startsWith('--')) throw new Error(`Missing value for --${key}`);
    }
  }
  if (options.help) return console.log(help);
  for (const key of ['video', 'plan', 'out']) if (!options[key]) throw new Error(`Missing --${key}\n${help}`);
  const video = fs.realpathSync(options.video);
  const out = path.resolve(options.out);
  if (!out.endsWith('.mp4')) throw new Error('Output must end in .mp4');
  if (out === video || fs.existsSync(out)) throw new Error('Choose a new output path; source and existing outputs are preserved');
  const plan = JSON.parse(fs.readFileSync(options.plan, 'utf8'));
  const info = probe(video);
  const total = Number(info.format.duration);
  if (!info.streams.some(s => s.codec_type === 'video') || !Number.isFinite(total)) throw new Error('Input needs a video stream and a finite duration');
  const voice = plan.voice_id ?? process.env.ELEVENLABS_VOICE_ID;
  const model = plan.model_id ?? process.env.ELEVENLABS_MODEL_ID ?? 'eleven_multilingual_v2';
  if (typeof voice !== 'string' || !/^[A-Za-z0-9_-]+$/.test(voice)) throw new Error('Set voice_id in the plan or ELEVENLABS_VOICE_ID');
  if (typeof model !== 'string' || !model) throw new Error('Invalid model_id');
  if (!Array.isArray(plan.segments) || !plan.segments.length || plan.segments.length > 100) throw new Error('Plan needs 1–100 segments');
  let previousEnd = 0;
  for (const [i, s] of plan.segments.entries()) {
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < previousEnd || s.end <= s.start || s.end > total + 0.001 || typeof s.text !== 'string' || !s.text.trim()) throw new Error(`Invalid/overlapping segment ${i + 1}`);
    if (/eleven_v[34]/.test(model) && /<break\b/.test(s.text)) throw new Error(`Segment ${i + 1}: v3/v4 use punctuation or audio tags, not SSML breaks`);
    previousEnd = s.end;
  }
  console.log(JSON.stringify({ duration_seconds: total, voice_id: voice, model_id: model, segments: plan.segments.length, characters: plan.segments.reduce((n,s) => n+s.text.length, 0), existing_audio: info.streams.some(s => s.codec_type === 'audio'), dry_run: Boolean(options['dry-run']) }));
  if (options['dry-run']) return;

  const work = out.replace(/\.mp4$/, '.narration');
  fs.mkdirSync(work, { recursive: true });
  const report = [];
  for (const [i, s] of plan.segments.entries()) {
    const request = { text: s.text, model_id: model, ...(plan.voice_settings ? { voice_settings: plan.voice_settings } : {}) };
    const hash = createHash('sha256').update(JSON.stringify({voice, output_format:'mp3_44100_128', request})).digest('hex');
    const audio = path.join(work, `${hash}.mp3`);
    const metadata = path.join(work, `${hash}.json`);
    const cached = fs.existsSync(audio) && fs.existsSync(metadata);
    if (!cached) {
      const key = process.env.ELEVENLABS_API_KEY;
      if (!key) throw new Error('ELEVENLABS_API_KEY is missing. Start an interactive zsh that loads ~/.zshrc');
      // No automatic retries: ambiguous failures may have consumed credits.
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/with-timestamps?output_format=mp3_44100_128`, {
        method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        let code = 'request_failed';
        try { const body = await response.json(); code = typeof body.detail?.status === 'string' ? body.detail.status : code; } catch {}
        throw new Error(`ElevenLabs HTTP ${response.status} (${code}); stopped at segment ${i + 1}`);
      }
      const result = await response.json();
      if (typeof result.audio_base64 !== 'string' || !result.audio_base64) throw new Error(`No audio returned for segment ${i + 1}`);
      fs.writeFileSync(audio, Buffer.from(result.audio_base64, 'base64'));
      fs.writeFileSync(metadata, JSON.stringify({ voice_id: voice, request, request_id: response.headers.get('request-id'), alignment: result.alignment, normalized_alignment: result.normalized_alignment }, null, 2));
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
  filters.push(`${report.map((_,i)=>`[a${i}]`).join('')}amix=inputs=${report.length}:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=duration=${total}[n]`);
  const wav = path.join(work, 'narration.wav');
  run('ffmpeg', ['-v','error','-y', ...report.flatMap(s=>['-i',s.audio]), '-filter_complex',filters.join(';'),'-map','[n]','-ar','48000','-c:a','pcm_s16le',wav]);
  try {
    run('ffmpeg', ['-v','error','-n','-i',video,'-i',wav,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-t',String(total),'-movflags','+faststart',out]);
    const finalInfo = probe(out);
    const finalDuration = Number(finalInfo.format.duration);
    if (!finalInfo.streams.some(s=>s.codec_type==='audio') || Math.abs(total-finalDuration)>0.1) throw new Error('Output verification failed: audio stream or duration');
    console.log(JSON.stringify({ output: out, duration_seconds: finalDuration, report: path.join(work, 'report.json') }));
  } catch (error) {
    if (fs.existsSync(out)) fs.unlinkSync(out);
    throw error;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
