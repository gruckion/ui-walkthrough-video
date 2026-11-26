// Runs install.sh against a throwaway home. It must remove only links that point into this
// checkout under the old skill name, never anything else with that name.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO = fs.realpathSync(path.join(import.meta.dirname, '..'));

function install(home: string) {
  return spawnSync('bash', [path.join(REPO, 'install.sh'), '--both'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, CODEX_HOME: path.join(home, '.codex'), XDG_STATE_HOME: path.join(home, '.state') },
  });
}

test('replaces a link to the old elevenlabs-narration skill and installs both skills', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  try {
    const claude = path.join(home, '.claude', 'skills');
    fs.mkdirSync(claude, { recursive: true });
    fs.symlinkSync(path.join(REPO, 'skills', 'elevenlabs-narration'), path.join(claude, 'elevenlabs-narration'));
    const run = install(home);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(fs.existsSync(path.join(claude, 'elevenlabs-narration')) || isLink(path.join(claude, 'elevenlabs-narration')), false);
    for (const root of [claude, path.join(home, '.codex', 'skills')])
      for (const name of ['ui-walkthrough-video', 'narration'])
        assert.equal(fs.readlinkSync(path.join(root, name)), path.join(REPO, 'skills', name));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('keeps an elevenlabs-narration link or folder that is not from this checkout', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  try {
    const claude = path.join(home, '.claude', 'skills');
    const codex = path.join(home, '.codex', 'skills');
    fs.mkdirSync(claude, { recursive: true });
    fs.mkdirSync(path.join(codex, 'elevenlabs-narration'), { recursive: true });
    fs.symlinkSync(path.join(home, 'elsewhere'), path.join(claude, 'elevenlabs-narration'));
    const run = install(home);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(fs.readlinkSync(path.join(claude, 'elevenlabs-narration')), path.join(home, 'elsewhere'));
    assert.equal(fs.statSync(path.join(codex, 'elevenlabs-narration')).isDirectory(), true);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

function isLink(file: string): boolean {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}
