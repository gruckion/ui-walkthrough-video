// Build the final walkthrough mp4 in the standard look: a title card, then each take with its
// cut ranges removed and a caption bar stacked ABOVE the app frame (it never covers the UI).
//
// COPY this file into the walkthrough's `scripts/` dir and run it there (it needs playwright
// from that dir's package.json, plus ffmpeg and ffprobe on PATH).
//
// Input: <takesDir>/<take>.webm + <take>.marks.json, as written by walkthrough-kit.mjs.
// Usage:
//   node build-walkthrough.mjs --base ~/ui-walkthroughs/SOL-1234 --out sol-1234-flow.mp4 \
//     --viewport 1440x1240 --kicker SOL-1234 --title "Boost payment type" \
//     --summary "What the change is.|What the viewer will see.|Any flag it depends on." A1 A2 B1
// Writes <base>/<out> and <base>/<out minus .mp4>.chapters.txt.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = {};
const takes = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
  else takes.push(args[i]);
}
for (const k of ['base', 'out', 'viewport', 'kicker', 'title', 'summary']) {
  if (!opt[k]) throw new Error(`missing --${k}`);
}
if (takes.length === 0) throw new Error('no takes given');

const BASE = opt.base.replace(/^~/, process.env.HOME);
const TAKES = path.join(BASE, 'takes');
const WORK = path.join(BASE, 'build');
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
const OUT = path.join(BASE, opt.out);
const [VW, VH] = opt.viewport.split('x').map(Number);
const BAND = 64;
const W = VW;
const H = VH + BAND;
const FPS = 25;
const TITLE_SECONDS = 3;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Pieces: [{ take, from, to, text }], one per caption, split around the cut ranges.
const pieces = [];
for (const take of takes) {
  const marks = JSON.parse(fs.readFileSync(path.join(TAKES, `${take}.marks.json`), 'utf8'));
  const bounds = [...marks.captions.map((c) => c.t), marks.end];
  marks.captions.forEach((c, i) => {
    let from = c.t;
    const to = bounds[i + 1];
    for (const [a, b] of [...marks.cuts].sort((x, y) => x[0] - y[0])) {
      if (b <= from || a >= to) continue;
      if (a > from) pieces.push({ take, from, to: a, text: c.text });
      from = Math.max(from, b);
    }
    if (to - from > 0.05) pieces.push({ take, from, to, text: c.text });
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const shot = async (html, file, height) => {
  await page.setViewportSize({ width: W, height });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#18181b;color:#fafafa;font:500 21px/1.2 -apple-system,system-ui,sans-serif}
    .band{height:${BAND}px;display:flex;align-items:center;padding:0 24px;gap:14px;white-space:nowrap}
    .step{color:#fb923c;font-weight:700}
    .card{height:${H}px;display:flex;flex-direction:column;justify-content:center;padding:0 96px;gap:18px}
    .card h1{font-size:54px;margin:0}.card p{font-size:26px;margin:0;color:#d4d4d8;line-height:1.45}.card .k{color:#fb923c;font-weight:700;font-size:24px}
  </style>${html}`);
  await page.screenshot({ path: file });
};
// Caption text is "<step> · <what is on screen>"; the step part is drawn in orange.
const bands = new Map();
for (const p of pieces) {
  if (bands.has(p.text)) continue;
  const [step, ...rest] = p.text.split(' · ');
  const file = path.join(WORK, `band-${bands.size}.png`);
  await shot(`<div class="band"><span class="step">${esc(step)}</span><span>${esc(rest.join(' · '))}</span></div>`, file, BAND);
  bands.set(p.text, file);
}
const titlePng = path.join(WORK, 'title.png');
await shot(`<div class="card"><div class="k">${esc(opt.kicker)}</div><h1>${esc(opt.title)}</h1>
  <p>${opt.summary.split('|').map(esc).join('<br>')}</p></div>`, titlePng, H);
await browser.close();

const ff = (a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: 'inherit' });
const enc = ['-r', String(FPS), '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-an'];
const files = [];
const title = path.join(WORK, 'p000.mp4');
ff(['-loop', '1', '-t', String(TITLE_SECONDS), '-i', titlePng, ...enc, title]);
files.push(title);
const chapters = [];
let clock = TITLE_SECONDS;
pieces.forEach((p, i) => {
  const file = path.join(WORK, `p${String(i + 1).padStart(3, '0')}.mp4`);
  ff(['-i', path.join(TAKES, `${p.take}.webm`), '-i', bands.get(p.text), '-ss', p.from.toFixed(3), '-t', (p.to - p.from).toFixed(3),
    '-filter_complex', `[0:v]fps=${FPS},scale=${W}:${VH}[v];[1:v][v]vstack=inputs=2[o]`, '-map', '[o]', ...enc, file]);
  files.push(file);
  if (chapters.at(-1)?.text !== p.text) chapters.push({ t: clock, text: p.text });
  clock += Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
});
const list = path.join(WORK, 'list.txt');
fs.writeFileSync(list, files.map((f) => `file '${f}'`).join('\n'));
ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', OUT]);
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const chapterText = ['0:00 Title', ...chapters.map((c) => `${mmss(c.t)} ${c.text}`)].join('\n') + '\n';
fs.writeFileSync(OUT.replace(/\.mp4$/, '.chapters.txt'), chapterText);
console.log(chapterText);
console.log(OUT, clock.toFixed(1) + 's');
