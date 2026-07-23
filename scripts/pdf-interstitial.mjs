// Show a real generated PDF inside a recorded Playwright page.
//
// Headless Chromium cannot render a PDF in-page, and apps usually window.open PDFs
// into a popup the recording never shows. This helper displays the artifact anyway:
// convert a page of the real PDF to PNG, wrap it in a minimal viewer page, and
// navigate the RECORDED page to it for a fixed dwell.
//
// COPY this file into the walkthrough's `scripts/` dir (next to the record script)
// and import it — do not reference it from the skill folder, which may move.
//
// Usage inside a record script:
//   import { showPdfInterstitial } from './pdf-interstitial.mjs';
//   await showPdfInterstitial(page, {
//     pdfPath: '/abs/path/take-invoice.pdf',   // the REAL artifact, fetched mid-take
//     title: 'Invoice PDF — as the customer receives it',
//     callout: 'Add-ons appear as ordinary lines; totals include them',
//     workDir: scriptsDir,
//   });
//   // then page.goto(...) back into the app.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Convert one page of a PDF to PNG. Prefers poppler's pdftoppm; falls back to
 *  macOS `sips` (first page only). Returns the PNG path. */
export function pdfToPng(pdfPath, outPngBase, { dpi = 110, page = 1 } = {}) {
  const pngPath = `${outPngBase}.png`;
  try {
    execFileSync('pdftoppm', [
      '-png', '-r', String(dpi), '-f', String(page), '-l', String(page), '-singlefile',
      pdfPath, outPngBase,
    ]);
    return pngPath;
  } catch {
    if (page !== 1) throw new Error('sips fallback can only render page 1 — install poppler (brew install poppler)');
    execFileSync('sips', ['-s', 'format', 'png', pdfPath, '--out', pngPath]);
    return pngPath;
  }
}

/** Display the PDF full-screen in the recorded page, with a title bar and an
 *  optional callout banner, for `dwellMs`. The caller navigates back afterwards. */
export async function showPdfInterstitial(
  page,
  { pdfPath, title, callout, dwellMs = 5000, workDir, pdfPage = 1, dpi = 110 },
) {
  const base = path.join(workDir, path.basename(pdfPath).replace(/\.pdf$/i, ''));
  const pngPath = pdfToPng(pdfPath, base, { dpi, page: pdfPage });

  const calloutHtml = callout
    ? `<div style="position:fixed;bottom:32px;left:50%;transform:translateX(-50%);z-index:20;background:#1c1917;color:#fafaf9;padding:10px 16px;border-radius:8px;font:500 14px/1.45 system-ui;max-width:520px;box-shadow:0 6px 24px rgba(0,0,0,.28)">${escapeHtml(callout)}</div>`
    : '';
  const viewerPath = path.join(workDir, `${path.basename(base)}-viewer.html`);
  // The <meta charset> is load-bearing: without it, file:// pages default to
  // latin-1 and em dashes / curly quotes in titles render as mojibake.
  fs.writeFileSync(
    viewerPath,
    `<!doctype html><html><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#3f3f46;display:flex;justify-content:center;align-items:flex-start;height:100vh;overflow:hidden">
  <div style="position:fixed;top:0;left:0;right:0;background:#18181b;color:#fafafa;font:500 15px system-ui;padding:12px 20px;z-index:10">${escapeHtml(title)}</div>
  <img src="file://${pngPath}" style="height:calc(100vh - 46px);margin-top:46px;box-shadow:0 4px 30px rgba(0,0,0,.5)" />
  ${calloutHtml}
</body></html>`,
  );
  await page.goto(`file://${viewerPath}`, { waitUntil: 'load' });
  await page.waitForTimeout(dwellMs);
  return pngPath;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
