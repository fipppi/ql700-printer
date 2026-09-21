// app.js — layered label editor controller.
import { QLPrinter } from './printer.js';
import { MM_TO_DOTS, MEDIA } from './printer.js';
import { LabelDoc, makeText, makeSymbol, makeImage, makeShape, fontString, newId } from './label.js';
import { FEATURES } from './config.js';

const RULER = 22;             // ruler thickness in px
const FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Impact', 'Segoe UI', 'Segoe UI Symbol'];
// ~100 free Unicode glyphs, rendered via a symbol font (no external assets).
const SYMBOLS = [
  // arrows
  '←','↑','→','↓','↔','↕','↖','↗','↘','↙','⇐','⇑','⇒','⇓','⟵','⟶','➜','➤','▲','▼','◀','▶',
  // stars / shapes
  '★','☆','✦','✧','❖','◆','◇','●','○','■','□','▪','▫','◼','◻','⬤','⬛','⬜','▮','▬',
  // check / marks
  '✓','✔','✗','✘','☑','☒','☐','⊕','⊗','⊙','✚','✜','✱','✲','✳','❋','❄','❅',
  // status / alert
  '⚠','⛔','⚡','☢','☣','♻','⚙','⚑','⚐','⌘','⌥','⎋','⏻','⏼','⏱','⏰','⌛','⏳','🔒','🔓',
  // communication / office
  '☎','✆','✉','✎','✏','✂','✁','⌨','🖥','🖨','🖱','💾','📁','📂','📎','📌','📍','🗑','⭐','🏷',
  // people / commerce
  '☺','☹','♥','♡','♦','♣','♠','☯','☮','⚕','⚖','⚜','$','€','£','¥','¢','№','℗','©','®','™',
  // weather / misc
  '☀','☁','☂','☃','❆','☄','✈','⚓','⌂','⚔','⚽','♪','♫','☼','✺','❀','✿','☘','⚛','∞',
];

const $ = (id) => document.getElementById(id);
const dpmm = MM_TO_DOTS;

const FORMAT = 'ql700-label';
const FORMAT_VERSION = 1;
const STORAGE_KEY = 'ql700-workspace';
const ROLL_KEY = 'ql700-roll-chosen';   // set once the first-run roll picker has been answered

// Illustration of a label roll for the roll picker, drawn to scale from the media
// entry: a Brother DK-style spool (black flanges, wound paper, cardboard core) with
// the tape peeling off the top. Tape height ∝ width; die-cut rolls show the
// pre-cut labels on their backing liner. Gradient ids are prefixed per roll so
// several illustrations can share one page.
function rollSvg(m, key) {
  const W = 240, H = 100, scale = 0.72;                 // px per mm
  const th = +(m.widthMm * scale).toFixed(1);           // tape thickness on screen
  const cy = 52, cx = 40, tilt = 0.38;                  // spool centre; ellipse rx = r·tilt (viewed at an angle)
  const paperR = th / 2 + 13, flangeR = paperR + 5, coreR = 6;
  const depth = Math.round(th);                         // spool depth (front → back flange) = the tape's width, as on a real roll
  const x0 = Math.round(cx + depth + flangeR * tilt + 6), x1 = W - 4;
  const y0 = +(cy - th / 2).toFixed(1);
  const id = 'r' + String(key).replace(/\W/g, '');
  const el = (cxx, r, extra) => `<ellipse cx="${cxx}" cy="${cy}" rx="${(r * tilt).toFixed(1)}" ry="${r}" ${extra}/>`;

  const defs = `<defs>
    <linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a3a3a"/><stop offset="1" stop-color="#151515"/></linearGradient>
    <linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfaf7"/><stop offset="0.5" stop-color="#e6e2da"/><stop offset="1" stop-color="#c9c4ba"/></linearGradient>
    <linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eeebe4"/></linearGradient>
    <linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3dfd5"/><stop offset="1" stop-color="#cfc9bd"/></linearGradient>
  </defs>`;

  // spool: back flange, wound paper body, front flange with core
  const spool = `
    ${el(cx + depth, flangeR, `fill="#1c1c1c"`)}
    <rect x="${cx}" y="${cy - paperR}" width="${depth}" height="${paperR * 2}" fill="url(#${id}p)"/>
    ${el(cx + depth, paperR, `fill="url(#${id}p)"`)}
    ${el(cx, flangeR, `fill="url(#${id}f)"`)}
    ${el(cx, flangeR - 2, `fill="none" stroke="#555" stroke-width="0.8"`)}
    ${el(cx, coreR + 2, `fill="#4a4036"`)}
    ${el(cx, coreR, `fill="#111"`)}`;

  // tape peeling off the top of the wound paper and running to the right edge
  // the strip leaves along the full depth of the roll and twists into the side-on tape
  const peelY = cy - paperR, bx = cx + depth;
  const peel = `<path d="M${cx} ${peelY} L${bx} ${peelY} C${bx + 10} ${peelY} ${x0 - 10} ${y0} ${x0} ${y0} L${x0} ${y0 + th} C${x0 - 10} ${y0 + th} ${cx + 10} ${peelY + 6} ${cx} ${peelY + 3} Z" fill="url(#${id}t)" stroke="#b8b3a8" stroke-width="0.8" stroke-linejoin="round"/>`;
  const shadow = `<rect x="${x0}" y="${y0 + th + 1}" width="${x1 - x0 - 6}" height="3" rx="1.5" fill="#000" opacity="0.10"/>`;
  let tape = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${th}" fill="url(#${m.kind === 'diecut' ? id + 'l' : id + 't'})" stroke="#b8b3a8" stroke-width="0.8"/>`;
  if (m.kind === 'diecut') {
    // white labels on the darker backing liner
    const pitch = m.lengthMm * scale, gap = 4, inset = 2.5, r = Math.max(2, th * 0.1);
    if (m.shape === 'round') {
      const d = th - inset * 2;
      for (let x = x0 + gap; x < x1; x += pitch + gap) {
        if (x + d > x1 + d * 0.6) break;
        tape += `<circle cx="${(x + d / 2).toFixed(1)}" cy="${cy}" r="${(d / 2).toFixed(1)}" fill="#fff" stroke="#c9c4ba" stroke-width="0.7"/>`;
      }
    } else {
      for (let x = x0 + gap; x < x1; x += pitch) {
        const w = Math.min(pitch - gap, x1 - x + 6);
        tape += `<rect x="${x.toFixed(1)}" y="${(y0 + inset).toFixed(1)}" width="${w.toFixed(1)}" height="${(th - inset * 2).toFixed(1)}" rx="${r.toFixed(1)}" fill="#fff" stroke="#c9c4ba" stroke-width="0.7"/>`;
      }
    }
  } else {
    // faint cut marks: continuous tape is cut wherever you like
    tape += `<line x1="${x0 + 66}" y1="${y0}" x2="${x0 + 66}" y2="${y0 + th}" stroke="#9a948a" stroke-width="1" stroke-dasharray="2 3"/>`;
    tape += `<text x="${x0 + 66}" y="${y0 - 3}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="8" fill="#9a948a">✂</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${m.label}">${defs}${shadow}${tape}${peel}${spool}</svg>`;
}

class Editor {
  constructor() {
    this.printer = new QLPrinter();
    this.zoom = 1;
    this.selId = null;
    this.drag = null;           // {mode:'move'|'resize', ...}
    this.meas = document.createElement('canvas').getContext('2d');
    this.clip = null;           // clipboard element
    this.selCut = null;         // selected cut id
    this.selGuide = null;       // selected guide id
    this.view = { grid: true, gridMm: 5, snapGrid: true, snapGuides: true };
    this.realSize = false;      // 1:1 toggle: label shown at its printed size (CSS 96 px/in)
    this._zoomBeforeReal = 1;   // zoom to restore when the toggle is switched off
    this._pending = null;       // open transaction snapshot (coalesced edits)
    this._dragMoved = false;
    this.HIST_MAX = 60;

    // workspace: multiple labels
    this.labels = [];           // [{id, name, doc, history, future, checked}]
    this.activeId = null;
    this.queue = null;          // print queue {jobs, idx, mediaKey, running, busy}
    this.tplFree = false;       // template modal free-text edit mode

    this.stage = $('stage');
    this.surface = $('surface');
    this.canvas = $('label');
    this.ctx = this.canvas.getContext('2d');
    this.overlay = $('overlay');
    this.octx = this.overlay.getContext('2d');
    this.rTop = $('ruler-top');
    this.rLeft = $('ruler-left');

    this._wire();
    if (!this.loadWorkspace()) this._seed();
    this.syncToolbar();
    this.fit();
    this.renderFilePicker();
    // first visit in this browser: ask which roll is loaded before anything else
    let prompted = false;
    try { prompted = localStorage.getItem(ROLL_KEY) === '1'; } catch (_) {}
    if (!prompted) this.openRollPicker(true);
  }

  // tape + orientation dropdowns follow the active label
  syncToolbar() { $('media').value = String(this.doc.mediaKey); $('orientation').value = this.doc.orientation; }

  // ---- roll picker (first run, and Help → Choose label roll…) ----
  // No roll is preselected: the user must pick one. On first run the dialog can't be dismissed.
  openRollPicker(firstRun = false) {
    const grid = $('roll-grid');
    $('roll-close').classList.toggle('hidden', firstRun);
    $('roll-use').disabled = true;
    // one row per tape width, widest first; continuous tape leads each row
    const widths = [...new Set(Object.values(MEDIA).map((m) => m.widthMm))].sort((a, b) => b - a);
    const card = ([k, m]) => {
      const name = m.shape === 'round' ? `${m.widthMm} mm round` : m.kind === 'diecut' ? `${m.widthMm} × ${m.lengthMm} mm` : `${m.widthMm} mm`;
      const desc = m.kind === 'continuous' ? `Endless ${m.note} tape — cut to any length`
        : m.shape === 'round' ? `Pre-cut round labels${m.note ? ` (${m.note})` : ''}, ${m.widthMm} mm across`
        : `Pre-cut ${m.note} labels, ${m.widthMm} × ${m.lengthMm} mm each`;
      return `<button type="button" class="roll" data-key="${k}">
        ${rollSvg(m, k)}
        <span class="roll-name">${name}<span class="roll-kind">${m.kind === 'diecut' ? 'die-cut' : 'continuous'}</span></span>
        <span class="roll-desc">${desc}</span>
        <span class="roll-dk">${m.dk}</span>
      </button>`;
    };
    grid.innerHTML = widths.map((w) => {
      const rolls = Object.entries(MEDIA).filter(([, m]) => m.widthMm === w).sort(([, a], [, b]) => (a.kind === 'continuous' ? -1 : 1) - (b.kind === 'continuous' ? -1 : 1));
      return `<h3 class="roll-row-title">${w} mm</h3><div class="roll-row">${rolls.map(card).join('')}</div>`;
    }).join('');
    this._rollChoice = null;
    grid.querySelectorAll('.roll').forEach((b) => b.addEventListener('click', () => {
      grid.querySelectorAll('.roll').forEach((x) => x.classList.toggle('sel', x === b));
      this._rollChoice = b.dataset.key;
      $('roll-use').disabled = false;
    }));
    $('roll-modal').classList.remove('hidden');
  }
  closeRollPicker(apply) {
    if (apply && !this._rollChoice) return;
    if (apply && this._rollChoice !== this.doc.mediaKey) {
      const k = this._rollChoice;
      this.withUndo(() => { this.doc.setMedia(k); this.clampAll(); });
      this.syncToolbar(); this.fit(); this.renderPanels(); this.save();
    }
    if (apply) this.status(`Using ${MEDIA[this.doc.mediaKey].label}. Change it any time from the tape dropdown.`, 'ok');
    try { localStorage.setItem(ROLL_KEY, '1'); } catch (_) {}
    $('roll-modal').classList.add('hidden');
  }

  // active label bookkeeping
  get active() { return this.labels.find((l) => l.id === this.activeId); }
  get doc() { return this.active.doc; }
  get history() { return this.active.history; }
  get future() { return this.active.future; }

  makeEntry(name, doc) { return { id: newId(), name, doc: doc || new LabelDoc(), history: [], future: [], checked: false }; }

  // ---- setup ----
  _seed() {
    const doc = new LabelDoc();
    const t = makeText('Test Label', { fontSizeDots: 130, align: 'left' });
    t.x = Math.round(4 * dpmm); t.y = Math.round(8 * dpmm);
    doc.add(t);
    const entry = this.makeEntry('Label 1', doc);
    this.labels = [entry]; this.activeId = entry.id; this.selId = t.id;
  }

  _wire() {
    $('connect').addEventListener('click', () => this.connect());
    $('print').addEventListener('click', () => this.print());
    $('media').addEventListener('change', (e) => { const v = e.target.value; this.withUndo(() => { this.doc.setMedia(v); this.clampAll(); }); this.fit(); this.renderPanels(); });
    $('undo').addEventListener('click', () => this.undo());
    $('redo').addEventListener('click', () => this.redo());

    // coalesce a property-field editing session into one undo step
    const isField = (n) => n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA' || n.tagName === 'SELECT');
    $('props').addEventListener('focusin', (e) => { if (isField(e.target)) this.beginChange(); });
    $('props').addEventListener('change', (e) => { if (isField(e.target)) this.commitChange(); });
    $('orientation').addEventListener('change', (e) => { this.setOrientation(e.target.value); });
    $('add-text').addEventListener('click', () => this.addEl(makeText('New text')));
    $('add-symbol').addEventListener('click', () => this.addEl(makeSymbol('★')));
    $('add-image').addEventListener('click', () => $('image-file').click());
    $('add-shape').addEventListener('change', (e) => { if (e.target.value) { this.addEl(makeShape(e.target.value)); e.target.value = ''; } });
    $('add-cut').addEventListener('click', () => this.addCut());
    $('tpl-btn').addEventListener('click', () => this.openTemplate());
    $('grid-on').addEventListener('change', (e) => { this.view.grid = e.target.checked; this.syncViewMenu(); this.render(); });
    $('grid-size').addEventListener('input', (e) => { this.view.gridMm = Math.max(1, Number(e.target.value) || 5); this.render(); });
    $('snap-grid').addEventListener('change', (e) => { this.view.snapGrid = e.target.checked; this.syncViewMenu(); });
    $('snap-guides').addEventListener('change', (e) => { this.view.snapGuides = e.target.checked; this.syncViewMenu(); });
    // drag from rulers to create guides
    this.rTop.addEventListener('pointerdown', (e) => this.startGuide(e, 'h'));
    this.rLeft.addEventListener('pointerdown', (e) => this.startGuide(e, 'v'));
    $('image-file').addEventListener('change', (e) => this.loadImage(e.target.files[0]));
    $('zoom-in').addEventListener('click', () => this.setZoom(this.zoom * 1.25));
    $('zoom-out').addEventListener('click', () => this.setZoom(this.zoom / 1.25));
    $('zoom-fit').addEventListener('click', () => this.fit(true));
    $('real-size').addEventListener('click', () => this.toggleRealSize());

    const s = this.stage;
    s.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    this.stage.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.setZoom(this.zoom * (e.deltaY < 0 ? 1.1 : 0.9)); }
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      const t = e.target;
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !inField) {
        const k = e.key.toLowerCase();
        if (k === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); return; }
        if (k === 'y') { e.preventDefault(); this.redo(); return; }
        if (k === 'c') { e.preventDefault(); this.copy(); return; }
        if (k === 'x') { e.preventDefault(); this.cut(); return; }
        if (k === 'v') { e.preventDefault(); this.paste(); return; }
      }
      if (!mod && !inField && (e.key === 'r' || e.key === 'R') && this.selId) {
        e.preventDefault();
        this.rotateSel(e.shiftKey ? -90 : 90);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inField) {
        if (this.selGuide != null) {
          e.preventDefault();
          this.withUndo(() => { this.doc.removeGuide(this.selGuide); this.selGuide = null; });
          this.render(); this.renderPanels();
        } else if (this.selCut != null) {
          e.preventDefault();
          this.withUndo(() => { this.doc.removeCut(this.selCut); this.selCut = null; });
          this.render(); this.renderPanels();
        } else if (this.selId) {
          e.preventDefault();
          this.withUndo(() => { this.doc.remove(this.selId); this.selId = null; });
          this.render(); this.renderPanels();
        }
      }
    });
    window.addEventListener('resize', () => this.fit());

    // menu bar dropdowns
    const mb = $('menubar');
    mb.querySelectorAll('.menu').forEach((m) => {
      m.addEventListener('click', (e) => {
        if (e.target.closest('.dropdown')) return; // let item handler run
        const open = m.classList.contains('open');
        mb.querySelectorAll('.menu').forEach((x) => x.classList.remove('open'));
        if (!open) m.classList.add('open');
        e.stopPropagation();
      });
    });
    mb.querySelectorAll('.dropdown button').forEach((b) => {
      b.addEventListener('click', (e) => { e.stopPropagation(); mb.querySelectorAll('.menu').forEach((x) => x.classList.remove('open')); this.dispatch(b.dataset.action); });
    });
    window.addEventListener('click', () => mb.querySelectorAll('.menu').forEach((x) => x.classList.remove('open')));

    // theme (light by default; the <head> script applied the saved choice before first paint)
    $('theme-btn').addEventListener('click', () => this.setTheme(this.theme === 'dark' ? 'light' : 'dark'));
    this.setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', { render: false });

    // file picker
    $('new-label').addEventListener('click', () => this.newLabel());
    $('print-selected').addEventListener('click', () => this.printSelected());
    $('import-file').addEventListener('change', (e) => this.importFile(e.target.files[0]));
    if (FEATURES.shippingPdf) $('import-pdf-file').addEventListener('change', (e) => this.importPdfs([...e.target.files]));
    else document.querySelector('button[data-action="import-pdf"]').remove();

    // modals
    $('modal-close').addEventListener('click', () => this.closeModal());
    $('about-close').addEventListener('click', () => $('about').classList.add('hidden'));
    $('help-btn').addEventListener('click', () => $('help').classList.remove('hidden'));
    $('help-close').addEventListener('click', () => $('help').classList.add('hidden'));
    $('bw-close').addEventListener('click', () => $('browser-warn').classList.add('hidden'));
    $('roll-use').addEventListener('click', () => this.closeRollPicker(true));
    $('roll-close').addEventListener('click', () => this.closeRollPicker(false));
    $('tpl-add-row').addEventListener('click', () => this.tplAddRow());
    $('tpl-print').addEventListener('click', () => this.printTemplate());
    $('tpl-free').addEventListener('click', () => this.tplToggleFree());
    $('tpl-text').addEventListener('input', () => { this.textToDataset($('tpl-text').value); this.saveSoon(); });

    // print queue
    $('pq-next').addEventListener('click', () => this.qNext());
    $('pq-auto').addEventListener('click', () => this.qAuto());
    $('pq-cancel').addEventListener('click', () => this.qClose());
    $('pq-close').addEventListener('click', () => this.qClose());

    // build static selects
    const mediaSel = $('media');
    const opt = ([k, m]) => `<option value="${k}">${m.label} · ${m.dk}</option>`;
    const entries = Object.entries(MEDIA);
    mediaSel.innerHTML =
      `<optgroup label="Continuous tape">${entries.filter(([, m]) => m.kind === 'continuous').map(opt).join('')}</optgroup>` +
      `<optgroup label="Die-cut labels">${entries.filter(([, m]) => m.kind === 'diecut').map(opt).join('')}</optgroup>`;
    this.status('Ready. Connect the printer when you want to print.', 'info');

    // WebUSB support / silent reconnect
    if (navigator.usb) {
      this.printer.reconnect().then((i) => { if (i) this.onConnected(i); }).catch(() => {});
    } else {
      $('browser-warn').classList.remove('hidden'); // no WebUSB (Firefox/Safari/etc.)
      $('connect').disabled = true;
      this.status('This browser can’t print. Open this page in Chrome or Edge to print.', 'error');
    }
  }

  // ---- theme ----
  setTheme(t, { render = true } = {}) {
    this.theme = t;
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('ql700-theme', t); } catch (_) {}
    const dark = t === 'dark';
    $('theme-btn').textContent = dark ? '☀' : '☾';
    $('theme-btn').title = dark ? 'Switch to light theme' : 'Switch to dark theme';
    document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.documentElement).getPropertyValue('--menubar').trim();
    this._colors = null; // canvas colours are re-read from the stylesheet on next render
    this.syncViewMenu();
    if (render) this.render();
  }
  // Canvas drawing colours come from the same CSS tokens as the UI.
  get colors() {
    if (!this._colors) {
      const cs = getComputedStyle(document.documentElement);
      const v = (n) => cs.getPropertyValue(n).trim();
      this._colors = { accent: v('--accent'), guide: v('--guide'), guideOn: v('--guide-on'), cut: v('--cut'), cutOn: v('--cut-on'), rulerBg: v('--ruler-bg'), rulerTick: v('--ruler-tick'), rulerText: v('--ruler-text'), stageA: v('--stage-a') };
    }
    return this._colors;
  }
  // tick marks on the View menu's on/off items
  syncViewMenu() {
    const state = { grid: this.view.grid, snapGrid: this.view.snapGrid, snapGuides: this.view.snapGuides, dark: this.theme === 'dark', realSize: this.realSize };
    document.querySelectorAll('#menubar button[data-check]').forEach((b) => b.classList.toggle('on', !!state[b.dataset.check]));
  }
  onConnected(info) {
    this.status(`Connected to ${info.product}. Ready to print.`, 'ok');
    $('print').disabled = false; $('print').title = 'Print this label';
    $('connect').textContent = 'Reconnect printer';
  }

  // ---- geometry ----
  get scale() { return this.zoom; }
  stageInner() { const r = this.stage.getBoundingClientRect(); return { w: r.width - RULER, h: r.height - RULER, left: r.left, top: r.top }; }

  // Fit the label to the window. Internal callers (label switch, resize…) leave a
  // real-size view alone; the Fit button / menu pass explicit=true to leave real size.
  fit(explicit = false) {
    if (this.realSize && !explicit) return this.render();
    this.realSize = false;
    const si = this.stageInner();
    const pad = 24;
    const sx = (si.w - pad) / this.doc.canvasW();
    const sy = (si.h - pad) / this.doc.canvasH();
    this.zoom = Math.max(0.05, Math.min(sx, sy));
    this.syncZoomUI(); this.render();
  }
  setZoom(z) { this.realSize = false; this.zoom = Math.max(0.05, Math.min(8, z)); this.syncZoomUI(); this.render(); }
  // 1:1 — one printed millimetre ≈ one millimetre on screen (assumes the CSS 96 px/in reference;
  // real displays vary a little). Switching off restores the previous zoom.
  toggleRealSize() {
    if (this.realSize) { this.realSize = false; this.zoom = this._zoomBeforeReal; }
    else { this._zoomBeforeReal = this.zoom; this.realSize = true; this.zoom = 96 / 300; }
    this.syncZoomUI(); this.render();
  }
  syncZoomUI() { $('real-size').classList.toggle('on', this.realSize); this.syncViewMenu(); }

  clientToDot(e) {
    const r = this.stage.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - RULER) / this.scale,
      y: (e.clientY - r.top - RULER) / this.scale,
    };
  }

  // ---- element ops ----
  addEl(el) {
    el.x = Math.round(4 * dpmm); el.y = Math.round(4 * dpmm);
    this.withUndo(() => {
      if (el.type === 'shape') this.doc.elements.unshift(el); // shapes go to the bottom so text/knockout sits on top
      else this.doc.add(el);
      this.selId = el.id; this.clampEl(el);
    });
    this.render(); this.renderPanels();
  }
  loadImage(file) {
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const maxH = this.doc.printable - Math.round(6 * dpmm);
      if (img.naturalHeight > maxH) {
        const sc = maxH / img.naturalHeight;
        var el = makeImage(img, file.name);
        el.wDots = Math.round(img.naturalWidth * sc);
        el.hDots = Math.round(img.naturalHeight * sc);
      } else { var el = makeImage(img, file.name); }
      this.addEl(el);
      this.status('Image added and converted to black & white dots. Drag a corner to resize it.', 'ok');
    };
    img.onerror = () => this.status('That file isn’t an image this browser can open. Try a PNG, JPEG, SVG or WebP.', 'error');
    img.src = URL.createObjectURL(file);
  }
  addCut() {
    // place at midpoint, or offset if one already there
    let pos = Math.round(this.doc.lengthDots / 2);
    while (this.doc.cuts.some((c) => Math.abs(c.pos - pos) < 8)) pos += Math.round(6 * dpmm);
    pos = Math.max(1, Math.min(this.doc.lengthDots - 1, pos));
    let cut;
    this.withUndo(() => { cut = this.doc.addCut(pos); });
    this.selCut = cut.id; this.selId = null;
    this.render(); this.renderPanels();
  }
  // hit-test a cut tab (near the near-edge of the long axis). Returns cut id or null.
  hitCut(d) {
    const tolPos = 12 / this.scale;      // along long axis
    const tabDepth = 20 / this.scale;    // from the near edge
    for (const c of this.doc.cuts) {
      if (this.doc.orientation === 'h') {
        if (Math.abs(d.x - c.pos) < tolPos && d.y >= -6 / this.scale && d.y <= tabDepth) return c.id;
      } else {
        if (Math.abs(d.y - c.pos) < tolPos && d.x >= -6 / this.scale && d.x <= tabDepth) return c.id;
      }
    }
    return null;
  }

  // ---- guides ----
  startGuide(e, dir) {
    e.stopPropagation();
    const d = this.clientToDot(e);
    const pos = dir === 'h' ? d.y : d.x;
    this.beginChange();
    const g = this.doc.addGuide(dir, pos);
    this.selGuide = g.id; this.selId = null; this.selCut = null;
    this.drag = { mode: 'guide', id: g.id, dir };
    this._dragMoved = false;
    this.render(); this.renderPanels();
  }
  hitGuide(d) {
    const tol = 5 / this.scale;
    const W = this.doc.canvasW(), H = this.doc.canvasH();
    for (const g of this.doc.guides) {
      if (g.dir === 'h' && Math.abs(d.y - g.pos) < tol && d.x >= 0 && d.x <= W) return g.id;
      if (g.dir === 'v' && Math.abs(d.x - g.pos) < tol && d.y >= 0 && d.y <= H) return g.id;
    }
    return null;
  }

  // ---- element geometry (rotation-aware) ----
  elCenter(el) { const b = this.doc.bbox(this.meas, el); return { cx: b.x + b.w / 2, cy: b.y + b.h / 2 }; }
  toLocal(el, x, y) {
    const rot = el.rotation || 0; if (!rot) return { x, y };
    const { cx, cy } = this.elCenter(el);
    const c = Math.cos(-rot), s = Math.sin(-rot);
    const dx = x - cx, dy = y - cy;
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  }
  corners(el) {
    const b = this.doc.bbox(this.meas, el);
    const rot = el.rotation || 0;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
    const c = Math.cos(rot), s = Math.sin(rot);
    return pts.map(([px, py]) => { const dx = px - cx, dy = py - cy; return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c }; });
  }
  hitHandle(d, el) {
    if (!el) return -1;
    const tol = 9 / this.scale;
    const cs = this.corners(el);
    for (let i = 0; i < cs.length; i++) if (Math.hypot(cs[i].x - d.x, cs[i].y - d.y) < tol) return i;
    return -1;
  }
  // mid-edge stretch handles: 0=top,1=right,2=bottom,3=left (axis 'y' for top/bottom, 'x' for left/right)
  edges(el) {
    const c = this.corners(el);
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    return [
      { ...mid(c[0], c[1]), axis: 'y' },
      { ...mid(c[1], c[2]), axis: 'x' },
      { ...mid(c[2], c[3]), axis: 'y' },
      { ...mid(c[3], c[0]), axis: 'x' },
    ];
  }
  hitEdge(d, el) {
    if (!el) return -1;
    const tol = 9 / this.scale;
    const es = this.edges(el);
    for (let i = 0; i < 4; i++) if (Math.hypot(es[i].x - d.x, es[i].y - d.y) < tol) return i;
    return -1;
  }
  hitElement(d) {
    for (let i = this.doc.elements.length - 1; i >= 0; i--) {
      const el = this.doc.elements[i];
      if (!el.visible) continue;
      const p = this.toLocal(el, d.x, d.y);
      const b = this.doc.bbox(this.meas, el);
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return el;
    }
    return null;
  }

  // ---- snapping ----
  snapMove(el) {
    if (!this.view.snapGrid && !this.view.snapGuides) return;
    const b = this.doc.bbox(this.meas, el);
    const thr = 7 / this.scale;
    const W = this.doc.canvasW(), H = this.doc.canvasH();
    const gd = this.view.gridMm * dpmm;
    const candX = [0, W], candY = [0, H];
    if (this.view.snapGrid && gd > 2) { for (let x = 0; x <= W + 0.5; x += gd) candX.push(x); for (let y = 0; y <= H + 0.5; y += gd) candY.push(y); }
    if (this.view.snapGuides) for (const g of this.doc.guides) (g.dir === 'v' ? candX : candY).push(g.pos);
    const best = (anchors, cands) => {
      let bd = thr, delta = 0;
      for (const a of anchors) for (const c of cands) { const dd = c - a; if (Math.abs(dd) < Math.abs(bd)) { bd = dd; delta = dd; } }
      return Math.abs(bd) < thr ? delta : 0;
    };
    el.x += best([b.x, b.x + b.w / 2, b.x + b.w], candX);
    el.y += best([b.y, b.y + b.h / 2, b.y + b.h], candY);
  }

  // ---- corner scaling (opposite corner stays anchored, rotation-correct) ----
  applyScale(el, d) {
    const dr = this.drag, A = dr.anchor;
    // half-vector anchor->pointer, rotated into the element's local (unrotated) frame
    const hx = (A.x - d.x) / 2, hy = (A.y - d.y) / 2;
    const c = Math.cos(-dr.theta), s = Math.sin(-dr.theta);
    const vx = hx * c - hy * s, vy = hx * s + hy * c;
    const MIN = 3;
    let w2, h2;
    if (el.type === 'shape') {
      w2 = Math.max(MIN, Math.abs(vx)); h2 = Math.max(MIN, Math.abs(vy)); // independent
    } else {
      const diag0 = Math.max(1, Math.hypot(dr.w0, dr.h0) / 2);
      const f = Math.max(0.05, Math.hypot(vx, vy) / diag0);               // aspect-locked
      if (el.type === 'image') { w2 = dr.w0 * f / 2; h2 = dr.h0 * f / 2; }
      else { el.fontSizeDots = Math.max(8, Math.round(dr.size0 * f)); const b = this.doc.bbox(this.meas, el); w2 = b.w / 2; h2 = b.h / 2; }
    }
    if (el.type === 'image' || el.type === 'shape') { el.wDots = Math.max(6, w2 * 2); el.hDots = Math.max(6, h2 * 2); }
    // place so the anchor corner stays fixed: C' = A - R_theta(sign*half)
    const vX = dr.sx * w2, vY = dr.sy * h2;
    const cc = Math.cos(dr.theta), ss = Math.sin(dr.theta);
    el.x = Math.round(A.x - (vX * cc - vY * ss) - w2);
    el.y = Math.round(A.y - (vX * ss + vY * cc) - h2);
    this.render();
  }

  // ---- single-axis stretch (opposite edge anchored, rotation-correct) ----
  applyStretch(el, d) {
    const dr = this.drag, A = dr.anchor;
    const dx = d.x - A.x, dy = d.y - A.y;
    const c = Math.cos(-dr.theta), s = Math.sin(-dr.theta);
    const lx = dx * c - dy * s, ly = dx * s + dy * c;      // pointer in local frame, relative to anchor
    const MIN = 6;
    const dim = Math.max(MIN, Math.abs(dr.axis === 'x' ? lx : ly));
    // center so the fixed edge midpoint stays at A: C' = A - R_theta(signFixed*dim/2 along axis)
    const offx = dr.axis === 'x' ? dr.signFixed * dim / 2 : 0;
    const offy = dr.axis === 'y' ? dr.signFixed * dim / 2 : 0;
    const cc = Math.cos(dr.theta), ss = Math.sin(dr.theta);
    const Cx = A.x - (offx * cc - offy * ss), Cy = A.y - (offx * ss + offy * cc);
    let w = dr.w0, h = dr.h0;
    if (dr.axis === 'x') w = dim; else h = dim;
    if (el.type === 'shape' || el.type === 'image') {
      if (dr.axis === 'x') el.wDots = w; else el.hDots = h;
    } else {
      if (dr.axis === 'x') { const baseW = dr.w0 / (dr.sx0 || 1); el.stretchX = Math.max(0.1, w / baseW); }
      else { const baseH = dr.h0 / (dr.sy0 || 1); el.stretchY = Math.max(0.1, h / baseH); }
    }
    el.x = Math.round(Cx - w / 2);
    el.y = Math.round(Cy - h / 2);
    this.render();
  }

  // ---- rotation ----
  rotateSel(deg) {
    const el = this.sel(); if (!el) return;
    this.withUndo(() => { el.rotation = ((el.rotation || 0) + deg * Math.PI / 180); this.clampEl(el); });
    this.render(); this.renderPanels();
  }

  setOrientation(o) {
    if (o === this.doc.orientation) return;
    this.withUndo(() => { this.doc.orientation = o; this.clampAll(); });
    this.fit(); this.renderPanels();
  }
  sel() { return this.doc.byId(this.selId); }

  // ---- history / clipboard ----
  cloneEl(el, assignNew = false) {
    const c = Object.assign({}, el);      // copies scalars
    if (assignNew) { c.id = newId(); c._bbox = null; c._dither = null; c._dW = 0; c._dH = 0; }
    // src (Image) and _dither (canvas) kept by reference — treated as immutable
    return c;
  }
  snapshot() {
    return {
      orientation: this.doc.orientation,
      mediaKey: this.doc.mediaKey,
      lengthDots: this.doc.lengthDots,
      selId: this.selId,
      elements: this.doc.elements.map((e) => this.cloneEl(e)),
      cuts: this.doc.cuts.map((c) => ({ ...c })),
      guides: this.doc.guides.map((g) => ({ ...g })),
    };
  }
  restore(s) {
    this.doc.orientation = s.orientation;
    this.doc.mediaKey = s.mediaKey;
    this.doc.lengthDots = s.lengthDots;
    this.doc.elements = s.elements.map((e) => this.cloneEl(e));
    this.doc.cuts = (s.cuts || []).map((c) => ({ ...c }));
    this.doc.guides = (s.guides || []).map((g) => ({ ...g }));
    this.selId = s.selId;
    this.syncToolbar();
    this.render(); this.renderPanels();
  }
  pushUndo(state) {
    this.history.push(state);
    if (this.history.length > this.HIST_MAX) this.history.shift();
    this.future.length = 0;
    this.updateHistBtns();
    this.saveSoon();
  }
  // discrete mutation: snapshot before running fn
  withUndo(fn) { this.commitChange(); this.pushUndo(this.snapshot()); fn(); }
  // coalesced edit transaction (drags, typing in a field)
  beginChange() { if (!this._pending) this._pending = this.snapshot(); }
  commitChange() { if (this._pending) { this.pushUndo(this._pending); this._pending = null; } }
  cancelChange() { this._pending = null; }
  undo() {
    this.commitChange();
    if (!this.history.length) return;
    this.future.push(this.snapshot());
    this.restore(this.history.pop());
    this.updateHistBtns();
  }
  redo() {
    if (!this.future.length) return;
    this.history.push(this.snapshot());
    this.restore(this.future.pop());
    this.updateHistBtns();
  }
  updateHistBtns() {
    const u = $('undo'), r = $('redo');
    if (u) u.disabled = !this.history.length;
    if (r) r.disabled = !this.future.length;
  }
  copy() { const el = this.sel(); if (el) this.clip = this.cloneEl(el, true); }
  cut() { const el = this.sel(); if (!el) return; this.clip = this.cloneEl(el, true); this.withUndo(() => { this.doc.remove(el.id); this.selId = null; }); this.render(); this.renderPanels(); }
  paste() {
    if (!this.clip) return;
    const el = this.cloneEl(this.clip, true);
    el.x += Math.round(4 * dpmm); el.y += Math.round(4 * dpmm);
    this.withUndo(() => { this.doc.add(el); this.selId = el.id; this.clampEl(el); });
    this.render(); this.renderPanels();
  }

  clampEl(el) {
    // clamp the element's *visual* (rotation-aware) bounding box within the label
    const W = this.doc.canvasW(), H = this.doc.canvasH();
    const cs = this.corners(el);
    const xs = cs.map((p) => p.x), ys = cs.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    let dx = 0, dy = 0;
    if (maxX - minX <= W) { if (minX < 0) dx = -minX; else if (maxX > W) dx = W - maxX; }
    else dx = -minX; // wider than the label — pin to the left edge
    if (maxY - minY <= H) { if (minY < 0) dy = -minY; else if (maxY > H) dy = H - maxY; }
    else dy = -minY;
    el.x = Math.round(el.x + dx); el.y = Math.round(el.y + dy);
  }
  clampAll() { for (const el of this.doc.elements) this.clampEl(el); }

  // ---- pointer interaction ----
  edgeHit(d) {
    // die-cut labels have a fixed length — not resizable
    if (this.doc.media.kind === 'diecut') return false;
    // returns true if near the draggable long edge (in dot units)
    const tol = 10 / this.scale;
    if (this.doc.orientation === 'h') {
      return Math.abs(d.x - this.doc.canvasW()) < tol && d.y >= -tol && d.y <= this.doc.canvasH() + tol;
    }
    return Math.abs(d.y - this.doc.canvasH()) < tol && d.x >= -tol && d.x <= this.doc.canvasW() + tol;
  }
  onDown(e) {
    const d = this.clientToDot(e);
    this._dragMoved = false;

    // corner scale handle on the currently-selected element
    const selEl = this.sel();
    const hc = this.hitHandle(d, selEl);
    if (hc >= 0) {
      const cs = this.corners(selEl);
      const anchorIdx = (hc + 2) % 4;         // diagonally opposite corner stays fixed
      const SIGN = [[-1, -1], [1, -1], [1, 1], [-1, 1]]; // TL, TR, BR, BL
      const b = this.doc.bbox(this.meas, selEl);
      this.beginChange();
      this.drag = {
        mode: 'scale', id: selEl.id,
        anchor: { x: cs[anchorIdx].x, y: cs[anchorIdx].y },
        sx: SIGN[anchorIdx][0], sy: SIGN[anchorIdx][1],
        theta: selEl.rotation || 0,
        w0: b.w, h0: b.h, size0: selEl.fontSizeDots,
      };
      this.stage.setPointerCapture?.(e.pointerId);
      return;
    }
    // mid-edge stretch handle (one axis, opposite edge anchored)
    const he = this.hitEdge(d, selEl);
    if (he >= 0) {
      const es = this.edges(selEl);
      const opp = es[(he + 2) % 4]; // opposite edge midpoint stays fixed
      const axis = es[he].axis;
      const signFixed = axis === 'x' ? (he === 1 ? -1 : 1) : (he === 0 ? 1 : -1);
      const b = this.doc.bbox(this.meas, selEl);
      this.beginChange();
      this.drag = {
        mode: 'stretch', id: selEl.id, axis,
        anchor: { x: opp.x, y: opp.y }, signFixed,
        theta: selEl.rotation || 0, w0: b.w, h0: b.h,
        sx0: selEl.stretchX || 1, sy0: selEl.stretchY || 1,
      };
      this.stage.setPointerCapture?.(e.pointerId);
      return;
    }
    if (this.edgeHit(d)) {
      this.beginChange();
      this.drag = { mode: 'resize', start: d };
      this.stage.setPointerCapture?.(e.pointerId);
      return;
    }
    const guideId = this.hitGuide(d);
    if (guideId != null) {
      const g = this.doc.guides.find((x) => x.id === guideId);
      this.selGuide = guideId; this.selId = null; this.selCut = null;
      this.beginChange();
      this.drag = { mode: 'guide', id: guideId, dir: g.dir };
      this.render(); this.renderPanels();
      return;
    }
    const cutId = this.hitCut(d);
    if (cutId != null) {
      this.selCut = cutId; this.selId = null; this.selGuide = null;
      this.beginChange();
      this.drag = { mode: 'cut', id: cutId };
      this.render(); this.renderPanels();
      return;
    }
    const el = this.hitElement(d);
    if (el) {
      this.selId = el.id; this.selCut = null; this.selGuide = null;
      this.beginChange();
      this.drag = { mode: 'move', id: el.id, dx: d.x - el.x, dy: d.y - el.y };
    } else {
      this.selId = null; this.selCut = null; this.selGuide = null;
    }
    this.render(); this.renderPanels();
  }
  onMove(e) {
    if (!this.drag) {
      // hover cursor for edge
      return;
    }
    const d = this.clientToDot(e);
    this._dragMoved = true;
    if (this.drag.mode === 'resize') {
      const axis = this.doc.orientation === 'h' ? d.x : d.y;
      const min = Math.round(10 * dpmm), max = Math.round(1000 * dpmm);
      this.doc.lengthDots = Math.max(min, Math.min(max, Math.round(axis)));
      this.doc.clampCuts();
      this.render();
    } else if (this.drag.mode === 'move') {
      const el = this.doc.byId(this.drag.id);
      if (el) { el.x = Math.round(d.x - this.drag.dx); el.y = Math.round(d.y - this.drag.dy); this.snapMove(el); this.clampEl(el); this.render(); this.updatePosFields(el); }
    } else if (this.drag.mode === 'scale') {
      const el = this.doc.byId(this.drag.id);
      if (el) this.applyScale(el, d);
    } else if (this.drag.mode === 'stretch') {
      const el = this.doc.byId(this.drag.id);
      if (el) this.applyStretch(el, d);
    } else if (this.drag.mode === 'guide') {
      const g = this.doc.guides.find((x) => x.id === this.drag.id);
      if (g) { g.pos = Math.round(g.dir === 'h' ? d.y : d.x); this.render(); }
    } else if (this.drag.mode === 'cut') {
      const c = this.doc.cuts.find((c) => c.id === this.drag.id);
      if (c) {
        const axis = this.doc.orientation === 'h' ? d.x : d.y;
        c.pos = Math.max(1, Math.min(this.doc.lengthDots - 1, Math.round(axis)));
        this.doc.sortCuts(); this.render();
      }
    }
  }
  onUp() {
    if (!this.drag) return;
    if (this.drag.mode === 'guide') {
      const g = this.doc.guides.find((x) => x.id === this.drag.id);
      const W = this.doc.canvasW(), H = this.doc.canvasH();
      const out = g && (g.dir === 'h' ? (g.pos < 0 || g.pos > H) : (g.pos < 0 || g.pos > W));
      if (out) { this.doc.removeGuide(this.drag.id); this.selGuide = null; }
      this.commitChange(); // creating/moving a guide is a committed step
      this.drag = null; this.render(); this.renderPanels(); return;
    }
    if (this._dragMoved) this.commitChange(); else this.cancelChange();
    this.drag = null; this.render(); this.renderPanels();
  }

  // ---- rendering ----
  render() {
    const W = this.doc.canvasW(), H = this.doc.canvasH(), s = this.scale;
    const cw = Math.round(W * s), ch = Math.round(H * s);
    for (const c of [this.canvas, this.overlay]) { c.width = cw; c.height = ch; c.style.width = cw + 'px'; c.style.height = ch + 'px'; }
    this.surface.style.left = RULER + 'px';
    this.surface.style.top = RULER + 'px';

    // content
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (this.view.grid) this.drawGrid(ctx, W, H, s);
    for (const el of this.doc.elements) this.doc.drawElement(ctx, el);
    if (this.doc.media.shape === 'round') {
      // round label: show the liner outside the circle (nothing prints there)
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.colors.stageA; ctx.fill('evenodd');
      ctx.restore();
    }

    this.drawOverlay(W, H, s);
    this.drawRulers(W, H, s);
    this.updateReadout();
  }

  drawGrid(ctx, W, H, s) {
    const gd = this.view.gridMm * dpmm;
    if (gd < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(80,110,160,0.28)';
    ctx.lineWidth = 1 / s;
    ctx.beginPath();
    for (let x = 0; x <= W + 0.5; x += gd) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H + 0.5; y += gd) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.restore();
  }

  drawOverlay(W, H, s) {
    const octx = this.octx;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, this.overlay.width, this.overlay.height);

    const C = this.colors;
    // round label edge
    if (this.doc.media.shape === 'round') {
      octx.strokeStyle = C.rulerTick; octx.lineWidth = 1; octx.setLineDash([4, 4]);
      octx.beginPath(); octx.ellipse((W * s) / 2, (H * s) / 2, (W * s) / 2 - 0.5, (H * s) / 2 - 0.5, 0, 0, Math.PI * 2); octx.stroke();
      octx.setLineDash([]);
    }
    // guides (dashed, full span)
    for (const g of this.doc.guides) {
      const on = g.id === this.selGuide;
      octx.strokeStyle = on ? C.guideOn : C.guide; octx.lineWidth = on ? 2 : 1;
      octx.setLineDash([3, 3]); octx.beginPath();
      if (g.dir === 'h') { const y = g.pos * s + 0.5; octx.moveTo(0, y); octx.lineTo(W * s, y); }
      else { const x = g.pos * s + 0.5; octx.moveTo(x, 0); octx.lineTo(x, H * s); }
      octx.stroke(); octx.setLineDash([]);
    }

    // editor-only hint for shapes that print nothing visible on their own
    // (white fill or outline-only with no outline width) so they can still be found and grabbed
    for (const sh of this.doc.elements) {
      if (sh.type !== 'shape' || !sh.visible || sh.id === this.selId) continue;
      const ft = sh.fill?.type || 'solid';
      if (!((ft === 'white' || ft === 'none') && !(sh.stroke?.width > 0))) continue;
      const cs = this.corners(sh).map((p) => ({ x: p.x * s, y: p.y * s }));
      octx.strokeStyle = C.rulerTick; octx.lineWidth = 1; octx.setLineDash([2, 4]);
      octx.beginPath(); octx.moveTo(cs[0].x, cs[0].y);
      for (let i = 1; i < 4; i++) octx.lineTo(cs[i].x, cs[i].y);
      octx.closePath(); octx.stroke(); octx.setLineDash([]);
    }

    // selection box (rotation-aware) + corner scale handles
    const el = this.sel();
    if (el) {
      const cs = this.corners(el).map((p) => ({ x: p.x * s, y: p.y * s }));
      octx.strokeStyle = C.accent; octx.lineWidth = 1.5; octx.setLineDash([4, 3]);
      octx.beginPath(); octx.moveTo(cs[0].x, cs[0].y);
      for (let i = 1; i < 4; i++) octx.lineTo(cs[i].x, cs[i].y);
      octx.closePath(); octx.stroke(); octx.setLineDash([]);
      for (const c of cs) {
        octx.fillStyle = '#fff'; octx.strokeStyle = C.accent; octx.lineWidth = 1.5;
        octx.beginPath(); octx.rect(c.x - 4, c.y - 4, 8, 8); octx.fill(); octx.stroke();
      }
      // mid-edge stretch handles (bar hints the stretch axis)
      for (const ed of this.edges(el)) {
        const X = ed.x * s, Y = ed.y * s;
        const vert = ed.axis === 'x'; // vertical edge (left/right) -> tall bar
        const w = vert ? 5 : 13, h = vert ? 13 : 5;
        octx.fillStyle = C.accent; octx.strokeStyle = '#fff'; octx.lineWidth = 1;
        octx.beginPath(); octx.rect(X - w / 2, Y - h / 2, w, h); octx.fill(); octx.stroke();
      }
    }
    // long-edge resize handle
    octx.fillStyle = C.accent;
    if (this.doc.orientation === 'h') {
      const x = W * s;
      octx.fillRect(x - 3, 0, 3, H * s);
      this.grip(octx, x - 1.5, (H * s) / 2);
    } else {
      const y = H * s;
      octx.fillRect(0, y - 3, W * s, 3);
      this.grip(octx, (W * s) / 2, y - 1.5);
    }

    // cut lines (dashed across the tape, with a draggable tab at the near edge)
    for (const c of this.doc.cuts) {
      const on = c.id === this.selCut;
      octx.strokeStyle = on ? C.cutOn : C.cut;
      octx.lineWidth = on ? 2 : 1.5;
      octx.setLineDash([6, 4]);
      octx.beginPath();
      if (this.doc.orientation === 'h') {
        const x = c.pos * s + 0.5;
        octx.moveTo(x, 0); octx.lineTo(x, H * s);
      } else {
        const y = c.pos * s + 0.5;
        octx.moveTo(0, y); octx.lineTo(W * s, y);
      }
      octx.stroke();
      octx.setLineDash([]);
      // tab
      octx.fillStyle = on ? C.cutOn : C.cut;
      if (this.doc.orientation === 'h') { const x = c.pos * s; this.cutTab(octx, x, 0, true); }
      else { const y = c.pos * s; this.cutTab(octx, 0, y, false); }
    }
  }
  cutTab(ctx, x, y, horizontal) {
    ctx.save();
    ctx.beginPath();
    if (horizontal) { ctx.rect(x - 8, 0, 16, 16); } else { ctx.rect(0, y - 8, 16, 16); }
    ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✂', horizontal ? x : 8, horizontal ? 8 : y);
    ctx.restore();
  }
  grip(ctx, x, y) { ctx.fillStyle = this.colors.accent; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); }

  drawRulers(W, H, s) {
    const C = this.colors;
    const drawR = (canvas, lengthPx, dotsTotal, horizontal) => {
      canvas.width = horizontal ? lengthPx : RULER;
      canvas.height = horizontal ? RULER : lengthPx;
      const c = canvas.getContext('2d');
      c.fillStyle = C.rulerBg; c.fillRect(0, 0, canvas.width, canvas.height);
      c.font = '9px system-ui'; c.lineWidth = 1;
      const totalMm = dotsTotal / dpmm;
      const endPx = totalMm * dpmm * s;
      const stepMm = totalMm > 120 ? 20 : totalMm > 50 ? 10 : 5;
      const near = totalMm - Math.round(totalMm);
      const endLabel = Math.abs(near) < 0.15 ? String(Math.round(totalMm)) : totalMm.toFixed(1);

      const tick = (px, label, end) => {
        c.strokeStyle = end ? C.accent : C.rulerTick;
        c.fillStyle = end ? C.accent : C.rulerText;
        c.beginPath();
        if (horizontal) {
          c.moveTo(px, RULER); c.lineTo(px, RULER - (end ? 9 : 7)); c.stroke();
          c.textAlign = end ? 'right' : 'left';
          c.fillText(label, end ? px - 2 : px + 2, 10);
        } else {
          c.moveTo(RULER, px); c.lineTo(RULER - (end ? 9 : 7), px); c.stroke();
          c.save(); c.translate(9, px + (end ? 2 : -2)); c.rotate(-Math.PI / 2);
          c.textAlign = end ? 'left' : 'left'; c.fillText(label, 0, 0); c.restore();
        }
        c.textAlign = 'left';
      };

      // regular ticks — drop any that would overlap or sit near the end,
      // so the actual label dimension always wins (e.g. show 62, not 60).
      for (let mm = 0; mm < totalMm - 0.01; mm += stepMm) {
        const px = Math.round(mm * dpmm * s) + 0.5;
        const isLastMultiple = mm + stepMm >= totalMm - 0.01;
        const tooClosePx = Math.abs(endPx - px) < 18;
        const nearEndMm = isLastMultiple && (totalMm - mm) < stepMm * 0.5;
        if (mm > 0 && (tooClosePx || nearEndMm)) continue;
        tick(px, String(Math.round(mm)), false);
      }
      // end tick shows the actual label dimension
      tick(Math.round(endPx) - 0.5, endLabel, true);
    };
    this.rTop.style.left = RULER + 'px';
    this.rLeft.style.top = RULER + 'px';
    drawR(this.rTop, Math.round(W * s), W, true);
    drawR(this.rLeft, Math.round(H * s), H, false);
  }

  updateReadout() {
    const m = this.doc.media;
    const longMm = (this.doc.lengthDots / dpmm).toFixed(1);
    const wMm = m.widthMm; // physical tape width (not the slightly-smaller printable area)
    const cutInfo = this.doc.cuts.length ? ` · ${this.doc.cuts.length} cut${this.doc.cuts.length > 1 ? 's' : ''} → ${this.doc.segments().length} pieces` : '';
    const lenLabel = m.kind === 'diecut' ? `${m.lengthMm} mm (fixed die-cut)` : `${longMm} mm long`;
    $('readout').textContent = `${m.label} · ${lenLabel} · zoom ${Math.round(this.zoom * 100)}%${this.realSize ? ' (real size)' : ''}${cutInfo}`;
    $('dims-badge').textContent = this.doc.orientation === 'h'
      ? `${longMm} × ${wMm} mm` : `${wMm} × ${longMm} mm`;
  }

  // show the Template-data button only when the active label uses {{variables}}
  updateTplBtn() {
    const vars = this.doc.variables();
    const btn = $('tpl-btn');
    btn.classList.toggle('hidden', vars.length === 0);
    if (vars.length) btn.textContent = `▦ Template data (${vars.length} variable${vars.length > 1 ? 's' : ''})`;
  }

  // ---- side panels ----
  renderPanels() { this.renderLayers(); this.renderProps(); this.updateTplBtn(); }

  renderLayers() {
    const list = $('layers');
    list.innerHTML = '';
    // top layer first
    for (let i = this.doc.elements.length - 1; i >= 0; i--) {
      const el = this.doc.elements[i];
      const row = document.createElement('div');
      row.className = 'layer' + (el.id === this.selId ? ' sel' : '') + (el.visible ? '' : ' off');
      const icon = el.type === 'image' ? '🖼' : el.type === 'symbol' ? '✦' : el.type === 'shape' ? '▭' : 'T';
      row.innerHTML = `
        <button class="vis" title="${el.visible ? 'Hide (won’t print)' : 'Show'}">${el.visible ? '👁' : '—'}</button>
        <span class="ico" title="${el.type[0].toUpperCase() + el.type.slice(1)}">${icon}</span>
        <span class="nm">${escapeHtml(el.name || el.type)}</span>
        <button class="up" title="Bring forward">▲</button>
        <button class="dn" title="Send backward">▼</button>
        <button class="del" title="Delete layer">🗑</button>`;
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        this.selId = el.id; this.selCut = null; this.selGuide = null; this.render(); this.renderPanels();
      });
      row.querySelector('.vis').addEventListener('click', () => { this.withUndo(() => { el.visible = !el.visible; }); this.render(); this.renderPanels(); });
      row.querySelector('.up').addEventListener('click', () => { this.withUndo(() => this.doc.moveLayer(el.id, +1)); this.render(); this.renderPanels(); });
      row.querySelector('.dn').addEventListener('click', () => { this.withUndo(() => this.doc.moveLayer(el.id, -1)); this.render(); this.renderPanels(); });
      row.querySelector('.del').addEventListener('click', () => { this.withUndo(() => { this.doc.remove(el.id); if (this.selId === el.id) this.selId = null; }); this.render(); this.renderPanels(); });
      list.appendChild(row);
    }
    if (!this.doc.elements.length) list.innerHTML = '<div class="empty">This label is empty. Add text, a symbol, an image or a shape from the toolbar.</div>';
  }

  renderProps() {
    const p = $('props');
    const el = this.sel();
    if (!el) { p.innerHTML = '<div class="empty">Click something on the label, or a layer above, to edit it.</div>'; return; }
    const row = (label, inner) => `<label class="pf">${label}<div>${inner}</div></label>`;
    let html = '';
    if (el.type === 'text' || el.type === 'symbol') {
      const fonts = FONTS.map((f) => `<option ${f === el.fontFamily ? 'selected' : ''}>${f}</option>`).join('');
      html += row('Text', `<textarea id="p-text" rows="2">${escapeHtml(el.text)}</textarea>`);
      html += row('Font', `<select id="p-font">${fonts}</select>`);
      html += `<div class="prow">${row('Size (dots · 12 per mm)', `<input id="p-size" type="number" min="8" max="900" value="${Math.round(el.fontSizeDots)}">`)}${row('Align', `<select id="p-align"><option value="left"${el.align==='left'?' selected':''}>Left</option><option value="center"${el.align==='center'?' selected':''}>Centre</option><option value="right"${el.align==='right'?' selected':''}>Right</option></select>`)}</div>`;
      html += `<div class="prow"><label class="chk"><input id="p-bold" type="checkbox" ${el.bold?'checked':''}> Bold</label><label class="chk"><input id="p-italic" type="checkbox" ${el.italic?'checked':''}> Italic</label></div>`;
      html += `<label class="chk" title="Prints white — place it over a black shape"><input id="p-invert" type="checkbox" ${el.invert?'checked':''}> White text (on a black shape)</label>`;
      if (el.type === 'symbol') {
        html += row('Symbol', `<div class="symgrid">${SYMBOLS.map((g)=>`<button class="symbtn${g===el.text?' cur':''}" data-g="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join('')}</div>`);
      }
    } else if (el.type === 'image') {
      const wmm = (el.wDots / dpmm).toFixed(1);
      html += row('Width (mm)', `<input id="p-imgw" type="number" min="1" step="0.5" value="${wmm}">`);
      html += `<div class="hint">Height follows the width. The image is converted to black &amp; white dots again after each resize.</div>`;
    } else if (el.type === 'shape') {
      const k = el.shapeKind;
      const opt = (v, t) => `<option value="${v}"${k===v?' selected':''}>${t}</option>`;
      html += row('Shape', `<select id="p-shape">${opt('rect','Rectangle')}${opt('roundrect','Rounded rectangle')}${opt('circle','Circle / ellipse')}</select>`);
      html += `<div class="prow">${row('Width (mm)', `<input id="p-sw" type="number" min="1" step="0.5" value="${(el.wDots/dpmm).toFixed(1)}">`)}${row('Height (mm)', `<input id="p-sh" type="number" min="1" step="0.5" value="${(el.hDots/dpmm).toFixed(1)}">`)}</div>`;
      if (k === 'roundrect') html += row('Corner radius (mm)', `<input id="p-cr" type="number" min="0" step="0.5" value="${(el.cornerRadius/dpmm).toFixed(1)}">`);
      const ft = el.fill?.type || 'solid';
      html += row('Fill', `<select id="p-fill"><option value="none"${ft==='none'?' selected':''}>Outline only</option><option value="solid"${ft==='solid'?' selected':''}>Solid black</option><option value="white"${ft==='white'?' selected':''}>Solid white (covers what's below)</option><option value="texture"${ft==='texture'?' selected':''}>Grey pattern (dots)</option></select>`);
      if (ft === 'texture') html += row(`Darkness <span id="dens-val">${el.fill.density??50}%</span>`, `<input id="p-dens" type="range" min="0" max="100" step="5" value="${el.fill.density??50}">`);
      html += row('Outline width (dots)', `<input id="p-stroke" type="number" min="0" max="40" step="1" value="${el.stroke?.width||0}">`);
    }
    html += `<div class="prow">${row('X (mm)', `<input id="p-x" type="number" step="0.5" value="${(el.x/dpmm).toFixed(1)}">`)}${row('Y (mm)', `<input id="p-y" type="number" step="0.5" value="${(el.y/dpmm).toFixed(1)}">`)}</div>`;
    html += row('Rotation (°)', `<input id="p-rot" type="number" step="15" value="${Math.round((el.rotation||0)*180/Math.PI)}">`);
    html += `<div class="hint"><b>R</b> rotates 90°. Drag a corner to resize, an edge to stretch.</div>`;
    html += `<button id="p-del" class="btn danger small">Delete layer</button>`;
    p.innerHTML = html;

    const on = (id, ev, fn) => { const n = $(id); if (n) n.addEventListener(ev, fn); };
    const re = () => { if (el.type === 'text' || el.type === 'symbol') el.name = el.text.split('\n')[0].slice(0, 18) || el.type; this.clampEl(el); this.render(); this.renderLayers(); this.renderFilePicker(); };
    on('p-text', 'input', (e) => { el.text = e.target.value; re(); });
    on('p-font', 'change', (e) => { el.fontFamily = e.target.value; re(); });
    on('p-size', 'input', (e) => { el.fontSizeDots = Number(e.target.value) || 8; re(); });
    on('p-align', 'change', (e) => { el.align = e.target.value; this.render(); });
    on('p-bold', 'change', (e) => { el.bold = e.target.checked; re(); });
    on('p-italic', 'change', (e) => { el.italic = e.target.checked; re(); });
    on('p-x', 'input', (e) => { el.x = Math.round(Number(e.target.value) * dpmm); this.clampEl(el); this.render(); });
    on('p-y', 'input', (e) => { el.y = Math.round(Number(e.target.value) * dpmm); this.clampEl(el); this.render(); });
    on('p-rot', 'input', (e) => { el.rotation = (Number(e.target.value) || 0) * Math.PI / 180; this.render(); });
    on('p-imgw', 'input', (e) => { const asp = el.hDots / el.wDots; el.wDots = Math.max(4, Number(e.target.value) * dpmm); el.hDots = el.wDots * asp; this.clampEl(el); this.render(); });
    on('p-invert', 'change', (e) => { el.invert = e.target.checked; this.render(); });
    on('p-shape', 'change', (e) => { el.shapeKind = e.target.value; if (el.shapeKind === 'roundrect' && !el.cornerRadius) el.cornerRadius = Math.round(6 * dpmm); this.render(); this.renderProps(); });
    on('p-sw', 'input', (e) => { el.wDots = Math.max(4, Number(e.target.value) * dpmm); this.clampEl(el); this.render(); });
    on('p-sh', 'input', (e) => { el.hDots = Math.max(4, Number(e.target.value) * dpmm); this.clampEl(el); this.render(); });
    on('p-cr', 'input', (e) => { el.cornerRadius = Math.max(0, Number(e.target.value) * dpmm); this.render(); });
    on('p-fill', 'change', (e) => { el.fill = { ...el.fill, type: e.target.value }; if (e.target.value === 'texture' && el.fill.density == null) el.fill.density = 50; this.render(); this.renderProps(); });
    on('p-dens', 'input', (e) => { el.fill = { ...el.fill, density: Number(e.target.value) }; const dv = $('dens-val'); if (dv) dv.textContent = e.target.value + '%'; this.render(); });
    on('p-stroke', 'input', (e) => { el.stroke = { width: Math.max(0, Number(e.target.value)) }; this.render(); });
    on('p-del', 'click', () => { this.withUndo(() => { this.doc.remove(el.id); this.selId = null; }); this.render(); this.renderPanels(); });
    p.querySelectorAll('.symbtn').forEach((b) => b.addEventListener('click', () => { this.withUndo(() => { el.text = b.dataset.g; }); re(); }));
  }
  updatePosFields(el) {
    const x = $('p-x'), y = $('p-y');
    if (x) x.value = (el.x / dpmm).toFixed(1);
    if (y) y.value = (el.y / dpmm).toFixed(1);
  }

  // ---- printer ----
  status(msg, kind = 'info') { const s = $('status'); s.textContent = msg; s.className = 'status ' + kind; }
  async connect() {
    if (!navigator.usb) return this.status('This browser can’t reach USB devices. Open this page in Chrome or Edge.', 'error');
    try {
      const info = await this.printer.request();
      this.onConnected(info);
    } catch (e) {
      if (/No device selected/i.test(e.message)) return this.status('No printer chosen. Click Connect printer and pick QL-700 in the list. Not listed? See Setup help.', 'info');
      this.status(`Couldn’t connect: ${e.message}. Check the printer is on, Editor Lite is off, and (Windows) the WinUSB driver is installed — see Setup help.`, 'error');
    }
  }
  async print() {
    if (!this.printer.connected) return this.status('Connect the printer first (top right).', 'error');
    try {
      this.status('Preparing the label…', 'info');
      const pages = this.doc.toPages();
      this.status(pages.length > 1 ? `Printing ${pages.length} pieces…` : 'Printing…', 'info');
      await this.printer.print(pages, { mediaKey: this.doc.mediaKey });
      this.status(pages.length > 1 ? `Sent ${pages.length} pieces to the printer.` : 'Sent to the printer.', 'ok');
    } catch (e) { this.status(`Couldn’t print: ${e.message}. If the printer’s light is flashing red, check the tape matches the loaded roll.`, 'error'); }
  }

  // ---- menu dispatch ----
  dispatch(a) {
    switch (a) {
      case 'new-label': return this.newLabel();
      case 'import': return $('import-file').click();
      case 'import-pdf': return $('import-pdf-file').click();
      case 'export-label': return this.exportLabel();
      case 'export-project': return this.exportProject();
      case 'template': return this.openTemplate();
      case 'print-selected': return this.printSelected();
      case 'undo': return this.undo();
      case 'redo': return this.redo();
      case 'cut': return this.cut();
      case 'copy': return this.copy();
      case 'paste': return this.paste();
      case 'delete':
        if (this.selId) { this.withUndo(() => { this.doc.remove(this.selId); this.selId = null; }); this.render(); this.renderPanels(); }
        return;
      case 'toggle-grid': this.view.grid = !this.view.grid; $('grid-on').checked = this.view.grid; this.syncViewMenu(); return this.render();
      case 'toggle-snap-grid': this.view.snapGrid = !this.view.snapGrid; $('snap-grid').checked = this.view.snapGrid; return this.syncViewMenu();
      case 'toggle-snap-guides': this.view.snapGuides = !this.view.snapGuides; $('snap-guides').checked = this.view.snapGuides; return this.syncViewMenu();
      case 'toggle-theme': return this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
      case 'zoom-in': return this.setZoom(this.zoom * 1.25);
      case 'zoom-out': return this.setZoom(this.zoom / 1.25);
      case 'zoom-fit': return this.fit(true);
      case 'toggle-real-size': return this.toggleRealSize();
      case 'help': return $('help').classList.remove('hidden');
      case 'roll': return this.openRollPicker();
      case 'about': return $('about').classList.remove('hidden');
      case 'home': location.href = './'; return;
    }
  }

  // ---- workspace / file picker ----
  renderFilePicker() {
    this.updateTplBtn(); // variable set may have changed (e.g. text edited)
    const list = $('label-list'); list.innerHTML = '';
    for (const l of this.labels) {
      const row = document.createElement('div');
      row.className = 'lfile' + (l.id === this.activeId ? ' active' : '');
      const isTpl = l.doc.variables().length > 0;
      row.innerHTML = `<input type="checkbox" class="lchk" ${l.checked ? 'checked' : ''}>
        <span class="lname">${escapeHtml(l.name)}${isTpl ? ' <span class="tpl-badge" title="Uses {{variables}} — fill them in under File → Template data">T</span>' : ''}</span>
        <button class="lren mini" title="Rename label">✎</button>
        <button class="ldel mini" title="Delete label">🗑</button>`;
      row.querySelector('.lname').addEventListener('click', () => this.switchTo(l.id));
      row.querySelector('.lchk').addEventListener('change', (e) => { l.checked = e.target.checked; });
      row.querySelector('.ldel').addEventListener('click', () => this.deleteLabel(l.id));
      row.querySelector('.lren').addEventListener('click', () => {
        const span = row.querySelector('.lname');
        const inp = document.createElement('input'); inp.className = 'lname-edit'; inp.value = l.name;
        span.replaceWith(inp); inp.focus(); inp.select();
        inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') inp.blur(); if (ev.key === 'Escape') this.renderFilePicker(); });
        inp.addEventListener('blur', () => { l.name = inp.value.trim() || l.name; this.renderFilePicker(); this.saveSoon(); });
      });
      list.appendChild(row);
    }
  }
  switchTo(id) {
    if (id === this.activeId) return;
    this.commitChange();
    this.activeId = id;
    this.selId = this.selCut = this.selGuide = null;
    this.syncToolbar();
    this.fit(); this.renderPanels(); this.renderFilePicker(); this.updateHistBtns();
  }
  newLabel() {
    this.commitChange();
    const e = this.makeEntry('Label ' + (this.labels.length + 1));
    this.labels.push(e); this.saveSoon(); this.switchTo(e.id);
  }
  deleteLabel(id) {
    if (this.labels.length <= 1) return this.status('Keep at least one label. Add a new one before deleting this.', 'error');
    const i = this.labels.findIndex((l) => l.id === id);
    this.labels.splice(i, 1);
    if (this.activeId === id) {
      this.activeId = this.labels[Math.max(0, i - 1)].id;
      this.selId = this.selCut = this.selGuide = null;
      this.syncToolbar();
      this.fit(); this.renderPanels(); this.updateHistBtns();
    }
    this.renderFilePicker(); this.saveSoon();
  }

  // ---- persistence + import/export ----
  serializeWorkspace() { return { format: FORMAT, version: FORMAT_VERSION, labels: this.labels.map((l) => ({ name: l.name, doc: l.doc.toJSON() })) }; }
  saveSoon() { clearTimeout(this._saveT); this._saveT = setTimeout(() => this.save(), 400); }
  save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.serializeWorkspace())); } catch (_) {} }
  loadWorkspace() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const obj = JSON.parse(raw);
      if (!obj.labels || !obj.labels.length) return false;
      this.labels = obj.labels.map((l) => this.makeEntry(l.name, LabelDoc.fromJSON(l.doc, () => this.render())));
      this.activeId = this.labels[0].id;
      const first = this.doc.elements[0];
      this.selId = first ? first.id : null;
      this.syncToolbar();
      return true;
    } catch (e) { return false; }
  }
  download(name, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  exportLabel() {
    const l = this.active;
    this.download(safeName(l.name) + '.json', { format: FORMAT, version: FORMAT_VERSION, label: { name: l.name, doc: l.doc.toJSON() } });
    this.status('Exported "' + l.name + '".', 'ok');
  }
  exportProject() {
    this.download('label-project.json', this.serializeWorkspace());
    this.status(`Exported all ${this.labels.length} labels to a file.`, 'ok');
  }
  importFile(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => { try { this.importObject(JSON.parse(r.result)); } catch (e) { this.status('Couldn’t read that file: ' + e.message, 'error'); } };
    r.readAsText(file); $('import-file').value = '';
  }
  importObject(obj) {
    const added = [];
    const add = (name, docObj) => { const e = this.makeEntry(name || 'Imported', LabelDoc.fromJSON(docObj, () => this.render())); this.labels.push(e); added.push(e); };
    if (obj.labels) for (const l of obj.labels) add(l.name, l.doc);
    else if (obj.label) add(obj.label.name, obj.label.doc);
    else if (obj.doc || obj.elements) add(obj.name, obj.doc || obj);
    else return this.status('That isn’t a label file from this app. Use a file made with File → Export.', 'error');
    this.saveSoon(); this.renderFilePicker();
    if (added.length) { this.switchTo(added[0].id); this.status(`Imported ${added.length} label(s).`, 'ok'); }
  }

  // Shipping PDFs: one label per file, sender + receiver as two cut-separated segments.
  // Behind FEATURES.shippingPdf (js/config.js); the parser module loads on first use.
  async importPdfs(files) {
    $('import-pdf-file').value = '';
    if (!files.length) return;
    this.commitChange();
    const added = [], failed = [];
    this.status(files.length > 1 ? `Reading ${files.length} PDFs…` : 'Reading the PDF…', 'info');
    const { parseShippingPdf, buildAddressLabelDoc } = await import('./pdfimport.js');
    for (const f of files) {
      try {
        const blocks = await parseShippingPdf(f);
        const doc = buildAddressLabelDoc(blocks, this.doc.mediaKey);
        const e = this.makeEntry(f.name.replace(/\.pdf$/i, ''), doc);
        this.labels.push(e); added.push(e);
      } catch (err) { failed.push(`${f.name}: ${err.message}`); }
    }
    this.saveSoon(); this.renderFilePicker();
    if (added.length) this.switchTo(added[0].id);
    if (failed.length) this.status(`Imported ${added.length} label(s); failed — ${failed.join('; ')}`, added.length ? 'info' : 'error');
    else this.status(`Imported ${added.length} shipping label(s) — each prints sender, cuts, then receiver.`, 'ok');
  }

  // ---- template data ----
  openTemplate() { this.tplFree = false; this.renderTplTable(); this._syncTplView(); $('modal').classList.remove('hidden'); }
  closeModal() { $('modal').classList.add('hidden'); }
  _syncTplView() {
    const free = this.tplFree, hasVars = this.doc.variables().length > 0;
    $('tpl-table').closest('.tpl-table-wrap').classList.toggle('hidden', free);
    $('tpl-text').classList.toggle('hidden', !free);
    $('tpl-add-row').classList.toggle('hidden', free);
    $('tpl-free').textContent = free ? 'Back to table' : 'Edit as text';
    $('tpl-free').disabled = !hasVars;
  }
  tplToggleFree() {
    if (!this.doc.variables().length) return;
    this.tplFree = !this.tplFree;
    if (this.tplFree) {
      $('tpl-text').value = this.datasetToText();
      const vars = this.doc.variables();
      $('tpl-info').innerHTML = `One label per line. Separate the values with <code>|</code>, in this order: <code>${vars.map(escapeHtml).join(' | ')}</code>`;
    } else {
      this.textToDataset($('tpl-text').value);
      this.renderTplTable();
    }
    this._syncTplView();
  }
  datasetToText() {
    const vars = this.doc.variables();
    return this.doc.dataset.map((r) => vars.map((v) => (r[v] != null ? r[v] : '')).join(' | ')).join('\n');
  }
  textToDataset(text) {
    const vars = this.doc.variables();
    const old = this.doc.dataset;
    const ds = [];
    let i = 0;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const cells = line.split('|').map((c) => c.trim());
      const row = { _print: old[i] ? old[i]._print !== false : true }; // preserve print flag by position
      vars.forEach((v, ci) => (row[v] = cells[ci] != null ? cells[ci] : ''));
      ds.push(row); i++;
    }
    if (!ds.length) { const r = { _print: true }; vars.forEach((v) => (r[v] = '')); ds.push(r); }
    this.doc.dataset.length = 0;
    this.doc.dataset.push(...ds);
  }
  renderTplTable() {
    const vars = this.doc.variables();
    const info = $('tpl-info'), table = $('tpl-table');
    if (!vars.length) {
      info.innerHTML = 'This label has no variables yet. Type a placeholder such as <code>{{name}}</code> into a text layer, then come back here to fill in one row per label.';
      table.innerHTML = ''; $('tpl-print').disabled = true; $('tpl-add-row').disabled = true; return;
    }
    info.innerHTML = `Each row prints one label. Untick a row to skip it. Variables: ${vars.map((v) => `<code>{{${escapeHtml(v)}}}</code>`).join(' ')}`;
    $('tpl-print').disabled = false; $('tpl-add-row').disabled = false;
    const ds = this.doc.dataset;
    if (!ds.length) ds.push({});
    for (const row of ds) for (const v of vars) if (!(v in row)) row[v] = '';
    let html = '<thead><tr><th class="pr">Print</th><th>#</th>' + vars.map((v) => `<th>${escapeHtml(v)}</th>`).join('') + '<th></th></tr></thead><tbody>';
    ds.forEach((row, i) => {
      const on = row._print !== false;
      html += `<tr class="${on ? '' : 'off'}"><td class="pr"><input type="checkbox" class="rowprint" data-r="${i}" ${on ? 'checked' : ''}></td><td class="rn">${i + 1}</td>`
        + vars.map((v) => `<td><input data-r="${i}" data-v="${escapeHtml(v)}" value="${escapeHtml(row[v] || '')}"></td>`).join('')
        + `<td><button class="mini rowdel" data-r="${i}" title="Remove row">🗑</button></td></tr>`;
    });
    html += '</tbody>';
    table.innerHTML = html;
    table.querySelectorAll('input[data-v]').forEach((inp) => inp.addEventListener('input', (e) => { ds[+e.target.dataset.r][e.target.dataset.v] = e.target.value; this.saveSoon(); }));
    table.querySelectorAll('.rowprint').forEach((c) => c.addEventListener('change', (e) => { ds[+e.target.dataset.r]._print = e.target.checked; e.target.closest('tr').classList.toggle('off', !e.target.checked); this.saveSoon(); }));
    table.querySelectorAll('.rowdel').forEach((b) => b.addEventListener('click', () => { ds.splice(+b.dataset.r, 1); if (!ds.length) ds.push({ _print: true }); this.renderTplTable(); this.saveSoon(); }));
  }
  tplAddRow() { const row = { _print: true }; for (const v of this.doc.variables()) row[v] = ''; this.doc.dataset.push(row); this.renderTplTable(); this.saveSoon(); }
  // rows that are marked printable AND have at least one non-empty variable
  printableRows(doc) {
    const vars = doc.variables();
    return doc.dataset.filter((r) => r._print !== false && vars.some((v) => String(r[v] || '').length));
  }
  rowName(doc, row, i) {
    const vars = doc.variables();
    for (const v of vars) if (String(row[v] || '').length) return String(row[v]).slice(0, 20);
    return 'Row ' + (i + 1);
  }
  // scale a full-res canvas to a preview data URL. Smooth downscale keeps thin
  // knockout text legible over dithered fills (nearest-neighbor would drop it).
  thumb(canvas, maxDim = 1100) {
    const sc = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
    const w = Math.max(1, Math.round(canvas.width * sc)), h = Math.max(1, Math.round(canvas.height * sc));
    const t = document.createElement('canvas'); t.width = w; t.height = h;
    const cx = t.getContext('2d');
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(canvas, 0, 0, w, h);
    return t.toDataURL('image/png');
  }
  printTemplate() {
    if (!this.printer.connected) return this.status('Connect the printer first (top right).', 'error');
    if (this.tplFree) this.textToDataset($('tpl-text').value); // apply any pending free-text edits
    const rows = this.printableRows(this.doc);
    if (!rows.length) return this.status('Nothing to print yet. Tick at least one row and fill in a value.', 'error');
    const jobs = rows.map((r, i) => ({ name: this.rowName(this.doc, r, i), pages: this.doc.toPagesVars(r), preview: this.thumb(this.doc.renderPreviewVars(r)) }));
    this.closeModal();
    this.startQueue(jobs, this.doc.mediaKey);
  }

  // ---- print selected labels ----
  printSelected() {
    if (!this.printer.connected) return this.status('Connect the printer first (top right).', 'error');
    const sel = this.labels.filter((l) => l.checked);
    if (!sel.length) return this.status('Tick the labels you want to print in the list on the left, then try again.', 'error');
    const media = sel[0].doc.mediaKey;
    if (sel.some((l) => l.doc.mediaKey !== media)) return this.status('The ticked labels use different tapes. Print the ones for one tape, swap the roll, then print the rest.', 'error');
    const jobs = [];
    for (const l of sel) {
      const rows = this.printableRows(l.doc);
      if (l.doc.variables().length && rows.length) rows.forEach((r, i) => jobs.push({ name: `${l.name}: ${this.rowName(l.doc, r, i)}`, pages: l.doc.toPagesVars(r), preview: this.thumb(l.doc.renderPreviewVars(r)) }));
      else jobs.push({ name: l.name, pages: l.doc.toPages(), preview: this.thumb(l.doc.renderDotCanvas()) });
    }
    this.startQueue(jobs, media);
  }

  // ---- print queue (step through, or auto-print all) ----
  startQueue(jobs, mediaKey) {
    if (!jobs.length) return this.status('Nothing to print.', 'error');
    this.queue = { jobs: jobs.map((j) => ({ ...j, printed: false })), cur: 0, mediaKey, running: false, busy: false };
    $('printq').classList.remove('hidden');
    this.renderQueue();
  }
  qSelect(i) { if (this.queue && !this.queue.busy) { this.queue.cur = i; this.renderQueue(); } }
  nextUnprinted(q, from) {
    for (let k = 1; k <= q.jobs.length; k++) { const i = (from + k) % q.jobs.length; if (!q.jobs[i].printed) return i; }
    return from;
  }
  renderQueue() {
    const q = this.queue; if (!q) return;
    const total = q.jobs.length, printed = q.jobs.filter((j) => j.printed).length;
    const allDone = printed >= total;
    const cur = q.jobs[q.cur];
    $('pq-progress').textContent = allDone ? `All ${total} labels printed.` : `${printed} of ${total} printed. Next up: “${cur.name}”`;
    const prev = $('pq-preview');
    if (cur && cur.preview) { prev.src = cur.preview; prev.style.display = ''; } else { prev.removeAttribute('src'); prev.style.display = 'none'; }
    $('pq-list').innerHTML = q.jobs.map((j, i) => {
      const state = j.printed ? '✓' : (i === q.cur ? '▶' : '·');
      const cls = (j.printed ? 'done ' : '') + (i === q.cur ? 'cur' : '');
      const th = j.preview ? `<img class="pq-thumb" src="${j.preview}">` : '';
      return `<div class="pq-item ${cls}" data-i="${i}"><span class="pq-st">${state}</span>${th}<span class="pq-nm">${escapeHtml(j.name)}</span><span class="pq-pieces">${j.pages.length > 1 ? j.pages.length + ' pieces' : ''}</span></div>`;
    }).join('');
    $('pq-list').querySelectorAll('.pq-item').forEach((el) => el.addEventListener('click', () => this.qSelect(+el.dataset.i)));
    $('pq-next').disabled = q.busy || (cur && cur.printed && allDone);
    $('pq-auto').disabled = q.busy || allDone;
    $('pq-next').textContent = cur ? `Print “${cur.name}”` : 'Print next';
    $('pq-cancel').textContent = allDone ? 'Done' : (q.running ? 'Stop after this one' : 'Close');
  }
  async qNext() {
    const q = this.queue; if (!q || q.busy) return;
    const job = q.jobs[q.cur]; if (!job) return;
    q.busy = true; this.renderQueue();
    this.status(`Printing “${job.name}”…`, 'info');
    try {
      await this.printer.print(job.pages, { mediaKey: q.mediaKey });
      job.printed = true;
      q.cur = this.nextUnprinted(q, q.cur); // jump to next not-yet-printed
      const done = q.jobs.filter((j) => j.printed).length;
      this.status(done >= q.jobs.length ? 'All labels printed.' : `Printed ${done} of ${q.jobs.length}.`, 'ok');
    } catch (e) { this.status('Print failed: ' + e.message, 'error'); }
    q.busy = false; this.renderQueue();
  }
  async qAuto() {
    const q = this.queue; if (!q || q.busy) return;
    q.running = true; this.renderQueue();
    while (this.queue && this.queue.running) {
      const i = this.queue.jobs.findIndex((j) => !j.printed); // skip already-printed
      if (i < 0) break;
      this.queue.cur = i;
      await this.qNext();
    }
    if (this.queue) { this.queue.running = false; this.renderQueue(); }
  }
  qClose() {
    if (this.queue && this.queue.running) { this.queue.running = false; this.renderQueue(); return; } // first click stops auto
    this.queue = null; $('printq').classList.add('hidden');
  }
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function safeName(s) { return String(s || 'label').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'label'; }

let editor;
document.addEventListener('DOMContentLoaded', () => {
  editor = new Editor();
  window.ql700 = editor; // debug / automation handle
  editor.renderPanels();
  // re-fit after layout settles so the first paint is never slightly off
  requestAnimationFrame(() => editor.fit());
});
