// pdfimport.js — turn an eBay-style shipping PDF into a label document.
// Page 2 of those PDFs carries two rotated address blocks headed "Send from"
// and "Deliver to". We pull the text lines out with pdf.js, then lay each block
// out as its own cut-delimited segment on a continuous roll:
//   [sender] | cut | [receiver]
// pdf.js is vendored under js/vendor/ and loaded lazily on first use. The files
// are named .js rather than .mjs because Windows registers .mjs as text/plain,
// which python -m http.server passes through and Chrome then rejects as a module.

import { LabelDoc, makeText } from './label.js';
import { MEDIA, MM_TO_DOTS, mediaKeyOf } from './printer.js';

const HEADINGS = [
  { key: 'sender',   re: /^\s*send\s*from\s*$/i,  label: 'Send from' },
  { key: 'receiver', re: /^\s*deliver\s*to\s*$/i, label: 'Deliver to' },
];

let _pdfjs = null;
async function pdfjs() {
  if (_pdfjs) return _pdfjs;
  const lib = await import('./vendor/pdf.min.js');
  lib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.js', import.meta.url).href;
  return (_pdfjs = lib);
}

// Text lines of one page, in reading order. pdf.js hands back one item per
// run of text; items on the same baseline are joined, and hasEOL / a baseline
// change starts a new line. Works for the rotated (90°) page-2 text because
// the baseline is taken from the item's transform, not from page x/y.
async function pageLines(page) {
  const tc = await page.getTextContent();
  const lines = [];
  let cur = null, curBase = null;
  for (const it of tc.items) {
    if (!('str' in it)) continue;
    const [a, b, , , e, f] = it.transform;
    // baseline coordinate along the axis perpendicular to the text direction
    const rotated = Math.abs(a) < Math.abs(b);
    const base = rotated ? e : f;
    if (cur === null || Math.abs(base - curBase) > 1.5) { cur = ''; curBase = base; lines.push({ text: '' }); }
    cur += it.str;
    lines[lines.length - 1].text = cur;
    if (it.hasEOL) cur = null;
  }
  return lines.map((l) => l.text.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Split a page's lines into { sender: [...], receiver: [...] } on the headings.
function splitBlocks(lines) {
  const blocks = {};
  let cur = null;
  for (const ln of lines) {
    const h = HEADINGS.find((x) => x.re.test(ln));
    if (h) { cur = h.key; blocks[cur] = []; continue; }
    if (cur) blocks[cur].push(ln);
  }
  return blocks;
}

// Parse a shipping PDF (File/Blob) -> { sender: string[], receiver: string[] }.
export async function parseShippingPdf(file) {
  const lib = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = lib.getDocument({ data, isEvalSupported: false });
  const doc = await task.promise;
  try {
    // The address page is page 2; fall back to scanning every page for the headings.
    const order = doc.numPages >= 2 ? [2, ...range(1, doc.numPages).filter((n) => n !== 2)] : [1];
    for (const n of order) {
      const blocks = splitBlocks(await pageLines(await doc.getPage(n)));
      if (blocks.sender?.length && blocks.receiver?.length) return blocks;
    }
    throw new Error('No "Send from" / "Deliver to" blocks found (expected on page 2).');
  } finally {
    task.destroy();
  }
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// Build a LabelDoc with one segment per address block and a cut between them.
// Continuous media only (die-cut labels can't carry cut lines).
export function buildAddressLabelDoc({ sender, receiver }, mediaKey = '62') {
  const doc = new LabelDoc();
  let key = mediaKeyOf(mediaKey);
  if (MEDIA[key].kind !== 'continuous') key = MEDIA[key].widthMm === 29 ? '29' : '62';
  doc.setMedia(key);
  doc.orientation = 'h';

  const meas = document.createElement('canvas').getContext('2d');
  const H = doc.printable;
  const margin = Math.round(3 * MM_TO_DOTS);
  const maxSeg = Math.round(120 * MM_TO_DOTS);   // cap segment length; shrink text to fit
  const headSize = Math.round(H * 0.075);        // small caps-style heading
  const bodyMax = Math.round(H * 0.15);

  let x = 0;
  const bounds = []; // right edge of each segment
  const blocks = [
    { heading: 'Send from', lines: sender },
    { heading: 'Deliver to', lines: receiver },
  ];
  for (const { heading, lines } of blocks) {
    const body = makeText(lines.join('\n'), { fontFamily: 'Arial', bold: false });
    body.name = heading + ' address';
    const head = makeText(heading.toUpperCase(), { fontFamily: 'Arial', bold: true, fontSizeDots: headSize });
    head.name = heading;
    const gap = Math.round(headSize * 0.6);

    // Fit the body: as large as possible within the tape height, then shrink
    // until the widest line fits the maximum segment length.
    const availH = H - 2 * margin - headSize - gap;
    let size = Math.min(bodyMax, Math.floor(availH / (lines.length * body.lineHeight)));
    body.fontSizeDots = size;
    let w = doc.bbox(meas, body).w;
    while (w + 2 * margin > maxSeg && size > 24) { size -= 2; body.fontSizeDots = size; w = doc.bbox(meas, body).w; }

    const segW = Math.round(Math.max(w, doc.bbox(meas, head).w) + 2 * margin);
    head.x = x + margin; head.y = margin;
    body.x = x + margin; body.y = margin + headSize + gap;
    doc.add(head); doc.add(body);
    x += segW;
    bounds.push(x);
  }
  doc.lengthDots = x;
  // one cut between the two segments: the printer prints, cuts, prints, cuts
  doc.addCut(bounds[0]);
  return doc;
}
