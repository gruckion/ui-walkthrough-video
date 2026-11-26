// Record-side helpers for the standard walkthrough look: a visible cursor, and the
// caption / cut marks that build-walkthrough.ts turns into the caption bar.
//
// COPY this file into the walkthrough's `scripts/` dir (next to the record script)
// and import it; do not reference it from the skill folder, which may move.
//
// Usage inside a record script:
//   import { installCursor, startTake } from './walkthrough-kit.ts';
//   const context = await browser.newContext({ viewport, storageState, recordVideo: { dir: takesDir, size: viewport } });
//   await installCursor(context);                       // before newPage()
//   const page = await context.newPage();
//   const take = startTake(page);
//   take.cutStart(); await page.goto(url); await ready.waitFor(); take.cutEnd();   // load time, trimmed
//   take.caption('1. Flag OFF · Record a payment on an unpaid invoice');           // "<step> · <what is on screen>"
//   await take.click(page.getByRole('button', { name: 'Record Payment' }));
//   await take.finish({ takesDir, name: 'A1' });        // writes A1.webm + A1.marks.json

import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Locator, Page } from 'playwright';

export type Caption = { readonly t: number; readonly text: string };
export type Cut = readonly [from: number, to: number];
/** Seconds from the start of a take, written beside its video as `<take>.marks.json`. */
export type TakeMarks = {
  readonly captions: Caption[];
  readonly cuts: Cut[];
  end?: number;
};

// Playwright video has no OS cursor, so draw one. Orange, semi-transparent, shrinks on click.
export async function installCursor(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const make = () => {
      if (document.getElementById('wt-cursor')) return;
      const c = document.createElement('div');
      c.id = 'wt-cursor';
      Object.assign(c.style, {
        position: 'fixed', left: '0', top: '0', width: '18px', height: '18px', marginLeft: '-9px', marginTop: '-9px',
        borderRadius: '50%', background: 'rgba(234,88,12,.45)', border: '2px solid rgba(234,88,12,.95)',
        zIndex: '2147483647', pointerEvents: 'none', transition: 'transform .12s', transform: 'translate(-100px,-100px)',
      });
      document.documentElement.appendChild(c);
      let x = -100, y = -100;
      const put = (s: number) => { c.style.transform = `translate(${x}px,${y}px) scale(${s})`; };
      window.addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; put(1); }, true);
      window.addEventListener('mousedown', () => put(0.6), true);
      window.addEventListener('mouseup', () => put(1), true);
    };
    if (document.body) make(); else document.addEventListener('DOMContentLoaded', make);
  });
}

export function startTake(page: Page) {
  const t0 = Date.now();
  const marks: TakeMarks = { captions: [], cuts: [] };
  const now = () => (Date.now() - t0) / 1000;
  let cutFrom: number | null = null;
  const pause = (ms: number) => page.waitForTimeout(ms);

  // Move the cursor to the target first, so the viewer sees where the click lands.
  async function click(locator: Locator, { after = 700 }: { readonly after?: number } = {}) {
    await locator.waitFor();
    const box = await locator.boundingBox();
    if (!box) throw new Error('The click target is not visible, so the cursor cannot move to it');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
    await pause(350);
    await locator.click();
    await pause(after);
  }
  async function type(locator: Locator, text: string) {
    await click(locator, { after: 200 });
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(text, { delay: 70 });
    await pause(500);
  }
  async function finish({ takesDir, name }: { readonly takesDir: string; readonly name: string }) {
    marks.end = now();
    const video = page.video();
    if (!video) throw new Error('This page is not recording: create its context with recordVideo');
    const context = page.context();
    await page.close();
    await context.close();
    await video.saveAs(path.join(takesDir, `${name}.webm`));
    fs.writeFileSync(path.join(takesDir, `${name}.marks.json`), JSON.stringify(marks, null, 1));
  }
  return {
    marks, now, pause, click, type, finish,
    caption: (text: string) => { marks.captions.push({ t: now(), text }); },
    cutStart: () => { cutFrom = now(); },
    cutEnd: () => {
      if (cutFrom === null) throw new Error('cutEnd() needs a cutStart() first');
      marks.cuts.push([cutFrom, now()]);
      cutFrom = null;
    },
  };
}
