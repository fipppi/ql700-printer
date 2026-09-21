# QL-700 Label Studio

## Description

Browser-based label designer and printer for the Brother QL-700 that drives the printer directly over WebUSB, without Brother's drivers or P-touch software. It has a layered editor for text, symbols, images and shapes, cut lines, `{{variable}}` templates with batch printing from a data table, and a print queue. Plain HTML, CSS and ES modules served from a local static server.

A browser-based label designer and printer for the **Brother QL-700**, using **WebUSB** — no Brother drivers or P-touch software required. Design multi-element labels (text, symbols, images, shapes), use templates with variable data, print with cut lines, and drive the printer straight from Chrome.

Replaces the primitive bundled `PtLite10.exe`.

---

## Requirements

- **Google Chrome** or **Microsoft Edge** (WebUSB is not supported in Firefox or Safari).
- **Python 3** (only used to serve the files over `localhost` — WebUSB requires a secure context, so `file://` will not work).
- On **Windows**, the printer's USB interface must use the **WinUSB** driver (one-time Zadig setup — see below).

No build step, no `npm install` — it's plain HTML/CSS/ES modules.

---

## Run it

### Hosted (no install)

The app is deployed to GitHub Pages: **https://jackphilippi.github.io/ql700-printer/**

Open it in Chrome or Edge. It's served over HTTPS (which WebUSB requires) and a service worker caches everything, so it keeps working offline after the first visit. Chrome's address-bar "Install" button adds it as a standalone app. Every push to `main` redeploys via `.github/workflows/pages.yml`.

### Locally

From the project folder:

```bash
python serve.py            # http://localhost:8000  (or: python serve.py 8765)
```

Then open **http://localhost:8000** in Chrome or Edge.

> `serve.py` is a thin wrapper over `python -m http.server` that disables caching, so edits to the `.js` modules show up on a plain reload. Any static file server works instead (e.g. `python -m http.server 8000 --bind 127.0.0.1`, `npx serve`, VS Code Live Server) — it just has to be `http://localhost` or HTTPS, not a `file://` path — but then you'll need a hard reload (Ctrl+Shift+R) after code changes.

Click the **Help** button (top-right) in the app for the full first-time setup walkthrough.

---

## First-time printer setup (Windows)

1. **Exit Editor Lite mode.** The QL-700 has an *Editor Lite* button with a green LED. While it's lit, the printer only appears as a USB flash drive. **Hold the button ~1 s until the green LED turns off.**
2. **Install WinUSB with [Zadig](https://zadig.akeo.ie):**
   - `Options → List All Devices`.
   - Select **QL-700** — confirm the USB ID reads `04F9 2042` (not `2049`, which is the flash-drive mode).
   - Set the target driver to **WinUSB**, click **Replace Driver**.
   - Unplug and replug the printer.
3. In the app, click **Connect** and pick **QL-700**.

> ⚠ Installing WinUSB replaces Brother's driver, so Brother's own software won't print until you revert it (Device Manager → uninstall the QL-700 device with "delete driver", then re-run Brother's installer).

macOS / Linux usually work without Zadig.

---

## Choosing the tape

Pick the media in the top-left dropdown to **match the roll that's loaded**:

- **62 mm / 29 mm continuous** — endless tape, drag the label's long edge to set length.
- **29×90 mm address / 62×100 mm shipping (die-cut)** — fixed-size labels; length is locked.

A **red flashing LED** almost always means the selected tape doesn't match the loaded roll.

---

## Features

- Layered editor (Photoshop-style layers panel), drag / rotate (`R`) / scale / stretch elements.
- Text, ~100 Unicode symbols, images (auto Floyd–Steinberg dithering), and shapes (rect, rounded rect, circle) with solid or dithered-texture fills and text knockout/invert.
- Rulers, grid, guides (drag from a ruler), snap-to-grid / snap-to-guides, zoom.
- **Cut lines** — split a label into segments that print and cut in sequence.
- **Templates** — put `{{variables}}` in text, fill a data table (or bulk "Free edit" with `|` separators), and batch-print one label per row.
- **Import shipping PDF** — `File → Import shipping PDF…` reads the address page (page 2) of an eBay-style shipping/packing PDF and builds one label per file: the **Send from** block, a cut, then the **Deliver to** block. Select several PDFs at once to import them all, then use **Print selected labels**.
- **Print queue** with per-label preview, step-through (**Print next**), **Auto print all**, and per-row selection.
- Multiple labels per workspace (left file picker), **Import / Export** as versioned JSON (single label or whole project). Workspace auto-saves to the browser's local storage.
- Undo/redo, clipboard (Ctrl+C/X/V).

---

## Project layout

```
index.html        UI shell (menu bar, toolbar, panels, modals)
style.css         styles
js/printer.js     WebUSB driver + ESC/P raster encoder + media table
js/label.js       document model, element rendering, dithering, serialization, templates
serve.py          no-cache local dev server (optional)
sw.js             service worker: precaches the app for offline use (hosted builds only)
manifest.webmanifest, icons/   PWA install metadata
.github/workflows/pages.yml    GitHub Pages deploy
js/app.js         editor controller (all UI wiring)
js/pdfimport.js   shipping-PDF parser (pdf.js) + address-label layout
js/vendor/        pdf.js (pdfjs-dist), vendored so the app works offline
```

## Notes

- After editing any `.js` module, **hard-reload** the page (Ctrl+Shift+R) — browsers cache ES modules aggressively.
- 300 dpi, 720-pin head (90 bytes/row). Raster constants verified against the [`brother_ql`](https://github.com/pklaus/brother_ql) project.
