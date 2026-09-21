// label.js — document model, element rendering, dithering, and print-bitmap export.
// Coordinate space = "canvas dots" of the label as currently oriented:
//   horizontal: width = length (extendable), height = tape width (fixed)
//   vertical:   width = tape width (fixed),  height = length (extendable)

import { MEDIA, MM_TO_DOTS, encodeRows, mediaKeyOf } from './printer.js';

let _uid = 1;
const uid = () => _uid++;
export const newId = uid;

// ---- Floyd–Steinberg dithering: returns a b/w canvas of the source at w×h dots.
export function ditherToCanvas(source, w, h) {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = d[i * 4 + 3] / 255;
    lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) * a + 255 * (1 - a);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const nw = lum[i] < 128 ? 0 : 255;
      const err = lum[i] - nw;
      lum[i] = nw;
      if (x + 1 < w) lum[i + 1] += (err * 7) / 16;
      if (y + 1 < h) {
        if (x > 0) lum[i + w - 1] += (err * 3) / 16;
        lum[i + w] += (err * 5) / 16;
        if (x + 1 < w) lum[i + w + 1] += (err * 1) / 16;
      }
    }
  }
  for (let i = 0; i < w * h; i++) {
    const v = lum[i] < 128 ? 0 : 255;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

// ---- Ordered (Bayer) dithering for solid fills -> repeating B/W texture.
const BAYER4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
export function fillTexture(w, h, density) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(w, h);
  const d = id.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const thr = (BAYER4[y & 3][x & 3] + 0.5) / 16;
      const black = density > thr;
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 0;
      d[i + 3] = black ? 255 : 0; // black dots on transparent
    }
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

// ---- Elements -------------------------------------------------------------
export function makeText(text = 'Text', opts = {}) {
  return {
    id: uid(), type: 'text', name: text.slice(0, 18) || 'Text', visible: true,
    x: 20, y: 20,
    text,
    fontFamily: opts.fontFamily || 'Arial',
    fontSizeDots: opts.fontSizeDots || 96,
    bold: !!opts.bold, italic: !!opts.italic,
    align: opts.align || 'left',
    lineHeight: 1.2,
    rotation: 0,
    stretchX: 1, stretchY: 1,  // non-uniform stretch factors
    invert: false,      // knockout: draw white so it reverses out of a dark fill below
    _bbox: null,
  };
}

// kind: 'rect' | 'square' | 'roundrect' | 'circle'
export function makeShape(kind = 'rect') {
  const square = kind === 'square' || kind === 'circle';
  return {
    id: uid(), type: 'shape', name: kind[0].toUpperCase() + kind.slice(1), visible: true,
    x: 20, y: 20,
    wDots: square ? 200 : 260,
    hDots: square ? 200 : 150,
    rotation: 0,
    shapeKind: kind === 'square' ? 'rect' : kind, // 'rect' | 'roundrect' | 'circle'
    cornerRadius: kind === 'roundrect' ? 28 : 0,
    fill: { type: 'solid', density: 100 },        // 'none' | 'solid' | 'white' | 'texture'
    stroke: { width: 0 },
    _bbox: null,
  };
}

export function makeSymbol(glyph = '★') {
  const t = makeText(glyph, { fontFamily: 'Segoe UI Symbol', fontSizeDots: 140 });
  t.type = 'symbol';
  t.name = 'Symbol ' + glyph;
  return t;
}

export function makeImage(imgEl, name = 'Image') {
  const natW = imgEl.naturalWidth || imgEl.width;
  const natH = imgEl.naturalHeight || imgEl.height;
  const el = {
    id: uid(), type: 'image', name, visible: true,
    x: 20, y: 20,
    wDots: natW, hDots: natH,
    rotation: 0,
    src: imgEl,
    _dither: null, _dW: 0, _dH: 0,
  };
  return el;
}

// ---- Document -------------------------------------------------------------
export class LabelDoc {
  constructor() {
    this.orientation = 'h';       // 'h' | 'v'
    this.mediaKey = '62';
    this.lengthDots = Math.round(60 * MM_TO_DOTS); // long axis
    this.elements = [];           // index 0 = bottom layer
    this.cuts = [];               // [{id, pos}] positions along the long/feed axis in dots
    this.guides = [];             // [{id, dir:'h'|'v', pos}] in canvas dots (editor-only, never printed)
    this.dataset = [];            // template rows: [{var: value, …}] — one printed label per row
  }

  addGuide(dir, pos) { const g = { id: newId(), dir, pos: Math.round(pos) }; this.guides.push(g); return g; }
  removeGuide(id) { this.guides = this.guides.filter((g) => g.id !== id); }

  addCut(pos) { const c = { id: newId(), pos: Math.round(pos) }; this.cuts.push(c); this.sortCuts(); return c; }
  removeCut(id) { this.cuts = this.cuts.filter((c) => c.id !== id); }
  sortCuts() { this.cuts.sort((a, b) => a.pos - b.pos); }
  clampCuts() {
    for (const c of this.cuts) c.pos = Math.max(1, Math.min(this.lengthDots - 1, Math.round(c.pos)));
    this.cuts = this.cuts.filter((c) => c.pos > 0 && c.pos < this.lengthDots);
    this.sortCuts();
  }

  get media() { return MEDIA[mediaKeyOf(this.mediaKey)]; }
  get printable() { return this.media.printable; }

  // Apply a media key. Die-cut labels have a fixed length; lock it.
  setMedia(key) {
    this.mediaKey = mediaKeyOf(key);
    if (this.media.kind === 'diecut') { this.lengthDots = this.media.lengthDots; this.cuts = []; }
  }

  // Canvas (oriented) dimensions in dots.
  canvasW() { return this.orientation === 'h' ? this.lengthDots : this.printable; }
  canvasH() { return this.orientation === 'h' ? this.printable : this.lengthDots; }

  add(el) { this.elements.push(el); return el; }
  remove(id) { this.elements = this.elements.filter((e) => e.id !== id); }
  byId(id) { return this.elements.find((e) => e.id === id); }
  index(id) { return this.elements.findIndex((e) => e.id === id); }
  moveLayer(id, dir) {
    const i = this.index(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= this.elements.length) return;
    const [e] = this.elements.splice(i, 1);
    this.elements.splice(j, 0, e);
  }

  // Local (unrotated) box top-left + size in canvas dots.
  localBox(ctx, el) { return this.bbox(ctx, el); }
  center(ctx, el) { const b = this.bbox(ctx, el); return { cx: b.x + b.w / 2, cy: b.y + b.h / 2 }; }

  // Draw an element into ctx (already translated/scaled to dot space).
  drawElement(ctx, el) {
    if (!el.visible) return;
    const rot = el.rotation || 0;
    let restored = false;
    if (rot) {
      const { cx, cy } = this.center(ctx, el);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.translate(-cx, -cy); restored = true;
    }
    this._drawBody(ctx, el);
    if (restored) ctx.restore();
  }
  _drawBody(ctx, el) {
    if (el.type === 'image') {
      if (!el._dither || el._dW !== Math.round(el.wDots) || el._dH !== Math.round(el.hDots)) {
        el._dither = ditherToCanvas(el.src, el.wDots, el.hDots);
        el._dW = Math.round(el.wDots); el._dH = Math.round(el.hDots);
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(el._dither, el.x, el.y, el.wDots, el.hDots);
    } else if (el.type === 'shape') {
      this._drawShape(ctx, el);
    } else {
      // text / symbol
      const sxk = el.stretchX || 1, syk = el.stretchY || 1;
      ctx.save();
      ctx.translate(el.x, el.y);
      if (sxk !== 1 || syk !== 1) ctx.scale(sxk, syk);
      ctx.fillStyle = el.invert ? '#fff' : '#000'; // invert = white knockout over a dark fill
      ctx.textBaseline = 'middle'; // center each line in its slot so the block is vertically balanced
      ctx.font = fontString(el);
      const lines = el.text.split('\n');
      const lh = el.fontSizeDots * el.lineHeight;
      let maxW = 0;
      for (const ln of lines) maxW = Math.max(maxW, ctx.measureText(ln).width);
      for (let i = 0; i < lines.length; i++) {
        const w = ctx.measureText(lines[i]).width;
        let dx = 0;
        if (el.align === 'center') dx = (maxW - w) / 2;
        else if (el.align === 'right') dx = maxW - w;
        ctx.fillText(lines[i], dx, i * lh + lh / 2);
      }
      ctx.restore();
    }
  }

  _shapePath(ctx, el) {
    const x = el.x, y = el.y, w = el.wDots, h = el.hDots;
    ctx.beginPath();
    if (el.shapeKind === 'circle') {
      ctx.ellipse(x + w / 2, y + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
    } else if (el.shapeKind === 'roundrect') {
      const r = Math.max(0, Math.min(el.cornerRadius || 0, w / 2, h / 2));
      if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); }
      else {
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
      }
    } else {
      ctx.rect(x, y, w, h);
    }
  }
  _drawShape(ctx, el) {
    const fill = el.fill || { type: 'solid' };
    if (fill.type === 'solid' || fill.type === 'white') {
      // 'white' knocks out whatever is drawn below (e.g. a window in a black block or over a dithered image)
      this._shapePath(ctx, el); ctx.fillStyle = fill.type === 'white' ? '#fff' : '#000'; ctx.fill();
    } else if (fill.type === 'texture') {
      ctx.save(); this._shapePath(ctx, el); ctx.clip();
      const pat = fillTexture(el.wDots, el.hDots, Math.max(0, Math.min(1, (fill.density ?? 50) / 100)));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pat, Math.round(el.x), Math.round(el.y));
      ctx.restore();
    }
    if (el.stroke && el.stroke.width > 0) {
      this._shapePath(ctx, el); ctx.lineWidth = el.stroke.width; ctx.strokeStyle = '#000'; ctx.stroke();
    }
  }

  // Bounding box in dot space. Needs a measuring context for text.
  bbox(ctx, el) {
    if (el.type === 'image' || el.type === 'shape') {
      return { x: el.x, y: el.y, w: el.wDots, h: el.hDots };
    }
    ctx.font = fontString(el);
    const lines = el.text.split('\n');
    const lh = el.fontSizeDots * el.lineHeight;
    let maxW = 0;
    for (const ln of lines) maxW = Math.max(maxW, ctx.measureText(ln).width);
    const h = Math.max(lines.length * lh, el.fontSizeDots);
    return { x: el.x, y: el.y, w: Math.max(maxW, 8) * (el.stretchX || 1), h: h * (el.stretchY || 1) };
  }

  // Render the whole label to an offscreen canvas at full dot resolution.
  renderDotCanvas() {
    const w = Math.max(1, Math.round(this.canvasW()));
    const h = Math.max(1, Math.round(this.canvasH()));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    for (const el of this.elements) this.drawElement(ctx, el);
    if (this.media.shape === 'round') {
      // round die-cut label: blank everything outside the circle so nothing prints on the liner
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, w, h);
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill('evenodd');
      ctx.restore();
    }
    return c;
  }

  // Shared dark-map over the whole label in feed/across coordinates.
  _darkMap() {
    const dot = this.renderDotCanvas();
    const ctx = dot.getContext('2d', { willReadFrequently: true });
    const px = ctx.getImageData(0, 0, dot.width, dot.height).data;
    const W = dot.width, H = dot.height;
    const isV = this.orientation === 'v';
    const feedLen = isV ? H : W;
    const darkAt = (x, y) => {
      const cx = isV ? y : x;   // x = feed position, y = across tape
      const cy = isV ? x : y;
      return px[(cy * W + cx) * 4] < 128;
    };
    return { darkAt, feedLen, printable: this.printable };
  }

  // Feed-axis segment boundaries: [0, cut1, cut2, …, lengthDots].
  segments() {
    const b = [0, ...this.cuts.map((c) => c.pos), this.lengthDots]
      .filter((v, i, a) => v >= 0 && v <= this.lengthDots && a.indexOf(v) === i)
      .sort((x, y) => x - y);
    const segs = [];
    for (let i = 0; i < b.length - 1; i++) if (b[i + 1] - b[i] > 0) segs.push([b[i], b[i + 1]]);
    return segs;
  }

  // Produce printer rows for a single page (whole label, ignoring cuts).
  toRows() {
    const { darkAt, feedLen, printable } = this._darkMap();
    return encodeRows(feedLen, printable, this.mediaKey, darkAt);
  }

  // Produce one page of rows per cut-delimited segment (prints, cuts, repeats).
  toPages() {
    const { darkAt, feedLen, printable } = this._darkMap();
    const segs = this.segments();
    if (segs.length <= 1) return [encodeRows(feedLen, printable, this.mediaKey, darkAt)];
    return segs.map(([s, e]) =>
      encodeRows(e - s, printable, this.mediaKey, (x, y) => darkAt(s + x, y))
    );
  }

  // ---- templates ----
  // Unique {{variable}} names referenced by any text/symbol element, in order.
  variables() {
    const seen = [];
    const re = /\{\{\s*([\w-]+)\s*\}\}/g;
    for (const el of this.elements) {
      if (el.type === 'image') continue;
      let m; re.lastIndex = 0;
      while ((m = re.exec(el.text || ''))) if (!seen.includes(m[1])) seen.push(m[1]);
    }
    return seen;
  }
  // Run fn() with {{vars}} substituted into text, then restore. Each text element
  // keeps its CENTER fixed so replacement text of a different length (and any
  // rotation, which pivots about the center) stays put instead of drifting.
  _withVars(vars, fn) {
    const meas = this._meas || (this._meas = document.createElement('canvas').getContext('2d'));
    const saved = this.elements.map((e) => ({ text: e.text, x: e.x, y: e.y }));
    for (const el of this.elements) {
      if (el.type === 'image' || !el.text) continue;
      const b0 = this.bbox(meas, el);
      const cy = b0.y + b0.h / 2, cx = b0.x + b0.w / 2, right0 = b0.x + b0.w;
      el.text = fillVars(el.text, vars);
      const b1 = this.bbox(meas, el);
      // horizontal anchor honors alignment; vertical stays centered
      if (el.align === 'right') el.x = Math.round(right0 - b1.w);
      else if (el.align === 'center') el.x = Math.round(cx - b1.w / 2);
      else el.x = b0.x; // left: keep the left edge, expand rightward
      el.y = Math.round(cy - b1.h / 2);
    }
    const r = fn();
    this.elements.forEach((e, i) => { e.text = saved[i].text; e.x = saved[i].x; e.y = saved[i].y; });
    return r;
  }
  // Render pages with {{vars}} substituted, without permanently mutating text.
  toPagesVars(vars) { return this._withVars(vars, () => this.toPages()); }
  // Full-resolution preview canvas with {{vars}} substituted (non-destructive).
  renderPreviewVars(vars) { return this._withVars(vars, () => this.renderDotCanvas()); }

  // ---- serialization ----
  toJSON() {
    return {
      orientation: this.orientation,
      mediaKey: this.mediaKey,
      lengthDots: this.lengthDots,
      cuts: this.cuts.map((c) => ({ pos: c.pos })),
      guides: this.guides.map((g) => ({ dir: g.dir, pos: g.pos })),
      dataset: this.dataset,
      elements: this.elements.map(serializeEl),
    };
  }
  static fromJSON(obj, onImageLoad) {
    const d = new LabelDoc();
    d.orientation = obj.orientation || 'h';
    d.mediaKey = mediaKeyOf(obj.mediaKey);
    d.lengthDots = obj.lengthDots || Math.round(60 * MM_TO_DOTS);
    d.cuts = (obj.cuts || []).map((c) => ({ id: newId(), pos: c.pos }));
    d.guides = (obj.guides || []).map((g) => ({ id: newId(), dir: g.dir, pos: g.pos }));
    d.dataset = obj.dataset || [];
    d.elements = (obj.elements || []).map((e) => deserializeEl(e, onImageLoad));
    return d;
  }
}

export function fillVars(text, vars) {
  return String(text).replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ''));
}

function serializeEl(el) {
  const base = { type: el.type, name: el.name, visible: el.visible, x: el.x, y: el.y, rotation: el.rotation || 0 };
  if (el.type === 'image') {
    let dataURL = el.dataURL;
    if (!dataURL) {
      try {
        const c = document.createElement('canvas');
        c.width = el.src.naturalWidth || el.src.width; c.height = el.src.naturalHeight || el.src.height;
        c.getContext('2d').drawImage(el.src, 0, 0);
        dataURL = c.toDataURL('image/png');
      } catch (_) { dataURL = ''; }
    }
    return { ...base, wDots: el.wDots, hDots: el.hDots, dataURL };
  }
  if (el.type === 'shape') {
    return { ...base, shapeKind: el.shapeKind, wDots: el.wDots, hDots: el.hDots, cornerRadius: el.cornerRadius || 0, fill: { ...el.fill }, stroke: { ...el.stroke } };
  }
  return { ...base, text: el.text, fontFamily: el.fontFamily, fontSizeDots: el.fontSizeDots, bold: el.bold, italic: el.italic, align: el.align, lineHeight: el.lineHeight, stretchX: el.stretchX || 1, stretchY: el.stretchY || 1, invert: !!el.invert };
}

function deserializeEl(o, onImageLoad) {
  if (o.type === 'shape') {
    return {
      id: newId(), type: 'shape', name: o.name || 'Shape', visible: o.visible !== false,
      x: o.x, y: o.y, rotation: o.rotation || 0,
      wDots: o.wDots, hDots: o.hDots, shapeKind: o.shapeKind || 'rect', cornerRadius: o.cornerRadius || 0,
      fill: o.fill || { type: 'solid', density: 100 }, stroke: o.stroke || { width: 0 }, _bbox: null,
    };
  }
  if (o.type === 'image') {
    const img = new Image();
    const el = { id: newId(), type: 'image', name: o.name || 'Image', visible: o.visible !== false, x: o.x, y: o.y, rotation: o.rotation || 0, wDots: o.wDots, hDots: o.hDots, src: img, dataURL: o.dataURL, _dither: null, _dW: 0, _dH: 0 };
    img.onload = () => { el._dither = null; onImageLoad && onImageLoad(); }; // drop any dither cached from before decode (would stay blank)
    img.src = o.dataURL || '';
    return el;
  }
  return {
    id: newId(), type: o.type || 'text', name: o.name || 'Text', visible: o.visible !== false,
    x: o.x, y: o.y, rotation: o.rotation || 0,
    text: o.text || '', fontFamily: o.fontFamily || 'Arial', fontSizeDots: o.fontSizeDots || 96,
    bold: !!o.bold, italic: !!o.italic, align: o.align || 'left', lineHeight: o.lineHeight || 1.2,
    stretchX: o.stretchX || 1, stretchY: o.stretchY || 1, invert: !!o.invert, _bbox: null,
  };
}

export function fontString(el) {
  return `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${el.fontSizeDots}px ${el.fontFamily}`;
}
