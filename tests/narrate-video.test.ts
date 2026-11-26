// Runs narrate-video.ts with --dry-run, which checks the plan and picks the voice without
// downloading, calling a provider, or loading the speech engine. Needs ffmpeg and ffprobe.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

const SCRIPTS = path.join(import.meta.dirname, '..', 'skills', 'narration', 'scripts');
let dir = '';
let video = '';

before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'narrate-test-'));
  video = path.join(dir, 'six-seconds.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

type Run = { readonly status: number | null; readonly stdout: string; readonly stderr: string; readonly summary?: Record<string, unknown> };

function dryRun(plan: unknown, { env = {}, scripts = SCRIPTS }: { readonly env?: Record<string, string>; readonly scripts?: string } = {}): Run {
  const planPath = path.join(dir, `plan-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(planPath, JSON.stringify(plan));
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ELEVENLABS_')));
  const result = spawnSync(process.execPath, [path.join(scripts, 'narrate-video.ts'), '--video', video, '--plan', planPath, '--out', path.join(dir, 'out.mp4'), '--dry-run'], {
    encoding: 'utf8',
    env: { ...clean, ...env },
  });
  const line = result.stdout.split('\n').find((l) => l.startsWith('{'));
  const parsed: unknown = line ? JSON.parse(line) : undefined;
  const summary = typeof parsed === 'object' && parsed !== null ? Object.fromEntries(Object.entries(parsed)) : undefined;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, ...(summary ? { summary } : {}) };
}

const segments = [{ start: 0.5, end: 2, text: 'One line.' }];

describe('choosing the voice', () => {
  test('a plan with no provider fields uses Kokoro with am_liam', () => {
    const run = dryRun({ segments });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.summary?.provider, 'kokoro');
    assert.equal(run.summary?.voice, 'am_liam');
  });

  test('an older plan with voice_id uses ElevenLabs with that voice', () => {
    const run = dryRun({ voice_id: 'abc123', segments });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.summary?.provider, 'elevenlabs');
    assert.equal(run.summary?.voice, 'abc123');
  });

  test('an older plan with only voice_settings uses ElevenLabs', () => {
    const run = dryRun({ voice_settings: { stability: 0.5 }, segments });
    assert.equal(run.summary?.provider, 'elevenlabs');
  });

  test('ElevenLabs takes its voice and model from the environment when the plan has none', () => {
    const run = dryRun({ provider: 'elevenlabs', segments }, { env: { ELEVENLABS_VOICE_ID: 'envVoice', ELEVENLABS_MODEL_ID: 'eleven_v3' } });
    assert.equal(run.summary?.voice, 'envVoice');
    assert.equal(run.summary?.model, 'eleven_v3');
  });

  test('ELEVENLABS_VOICE_ID with no provider in the plan warns that Kokoro is used', () => {
    const run = dryRun({ segments }, { env: { ELEVENLABS_VOICE_ID: 'envVoice' } });
    assert.equal(run.summary?.provider, 'kokoro');
    assert.match(run.stderr, /ELEVENLABS_VOICE_ID is set, but the plan names no provider/);
  });

  test('ElevenLabs runs where koffi is not installed', () => {
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'narrate-no-koffi-'));
    try {
      for (const file of fs.readdirSync(SCRIPTS)) fs.copyFileSync(path.join(SCRIPTS, file), path.join(copy, file));
      const run = dryRun({ provider: 'elevenlabs', segments }, { scripts: copy });
      assert.equal(run.status, 0, run.stderr);
      assert.equal(run.summary?.provider, 'elevenlabs');
    } finally {
      fs.rmSync(copy, { recursive: true, force: true });
    }
  });
});

describe('rejecting a plan', () => {
  const cases: ReadonlyArray<readonly [string, unknown, RegExp]> = [
    ['an unknown provider', { provider: 'polly', segments }, /provider must be one of: kokoro, elevenlabs/],
    ['segments that are not a list', { segments: 'none' }, /segments must be a list/],
    ['a segment without a numeric start', { segments: [{ start: '0', end: 1, text: 'x' }] }, /segment 1 needs a numeric start and end/],
    ['an unknown Kokoro voice', { voice: 'af_nobody', segments }, /Unknown Kokoro voice "af_nobody"/],
    ['a Kokoro speed out of range', { speed: 3, segments }, /Kokoro speed must be between 0.5 and 2/],
    ['an end before the start', { segments: [{ start: 2, end: 1, text: 'x' }] }, /Segment 1: end \(1\) must be after start \(2\)/],
    ['overlapping segments', { segments: [{ start: 0, end: 2, text: 'a' }, { start: 1.5, end: 3, text: 'b' }] }, /Segment 2: starts at 1.5, before the previous segment ends at 2/],
    ['a segment past the end of the video', { segments: [{ start: 5, end: 7, text: 'x' }] }, /Segment 1: ends at 7, after the video ends at 6/],
    ['empty text', { segments: [{ start: 0, end: 1, text: '  ' }] }, /Segment 1: text is empty/],
    ['no segments', { segments: [] }, /Plan needs 1–100 segments/],
  ];
  for (const [name, plan, message] of cases)
    test(name, () => {
      const run = dryRun(plan);
      assert.equal(run.status, 1);
      assert.match(run.stderr, message);
    });
});
