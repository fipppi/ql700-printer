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

The app is deployed to GitHub Pages: **https://fipppi.github.io/ql700-printer/** — that's the landing page (intro, setup guide, driver revert, FAQ); the editor itself is at **/app.html**.

Open it in Chrome or Edge. It's served over HTTPS (which WebUSB requires) and a service worker caches everything, so it keeps working offline after the first visit. Chrome's address-bar "Install" button adds it as a standalone app. Every push to `main` redeploys via `.github/workflows/pages.yml`.

### Locally

From the project folder:

```bash
python serve.py            # http://localhost:8000  (or: python serve.py 8765)
```

Then open **http://localhost:8000** in Chrome or Edge (landing page; the editor is **http://localhost:8000/app.html**).

> `serve.py` is a thin wrapper over `python -m http.server` that disables caching, so edits to the `.js` modules show up on a plain reload. Any static file server works instead (e.g. `python -m http.server 8000 --bind 127.0.0.1`, `npx serve`, VS Code Live Server) — it just has to be `http://localhost` or HTTPS, not a `file://` path — but then you'll need a hard reload (Ctrl+Shift+R) after code changes.

Click **Setup help** (top-right) in the app for the full first-time setup walkthrough.

---

## First-time printer setup (Windows)

1. **Exit Editor Lite mode.** The QL-700 has an *Editor Lite* button with a green LED. While it's lit, the printer only appears as a USB flash drive. **Hold the button ~1 s until the green LED turns off.**
2. **Install WinUSB with [Zadig](https://zadig.akeo.ie):**
   - `Options → List All Devices`.
   - Select **QL-700** — confirm the USB ID reads `04F9 2042` (not `2049`, which is the flash-drive mode).
   - Set the target driver to **WinUSB**, click **Replace Driver**.
   - Unplug and replug the printer.
3. In the app, click **Connect printer** and pick **QL-700**.

> ⚠ Installing WinUSB replaces Brother's driver, so Brother's own software won't print until you revert it (Device Manager → uninstall the QL-700 device with "delete driver", then re-run Brother's installer).

macOS / Linux usually work without Zadig.

---

## Choosing the tape

Pick the roll in the toolbar dropdown (or the first-run dialog) to **match the roll that's loaded**. Every DK roll the QL-700 accepts is supported:

| Continuous tape | Die-cut labels | Round die-cut |
|---|---|---|
| 62 mm DK-22205 (also film DK-22212 / clear DK-22113 / yellow DK-22606) | 62×100 mm shipping DK-11202 | 58 mm CD/DVD DK-11207 |
| 54 mm non-adhesive DK-N55224 | 62×29 mm small address DK-11209 | 24 mm DK-11218 |
| 50 mm DK-22223 | 38×90 mm large address DK-11208 | 12 mm DK-11219 |
| 38 mm DK-22225 | 29×90 mm address DK-11201 | |
| 29 mm DK-22210 (also film DK-22211) | 23×23 mm square DK-11221 | |
| 12 mm DK-22214 | 17×87 mm file folder DK-11203 · 17×54 mm multi-purpose DK-11204 | |

Continuous tape: drag the label's long edge to set its length. Die-cut: the size is fixed; round labels are masked to a circle so nothing prints on the liner. Dot geometry per roll comes from the [`brother_ql`](https://github.com/pklaus/brother_ql) label table.

A **red flashing LED** almost always means the selected tape doesn't match the loaded roll.

---

## Features

- Layered editor (Photoshop-style layers panel), drag / rotate (`R`) / scale / stretch elements.
- Text, ~100 Unicode symbols, images (auto Floyd–Steinberg dithering), and shapes (rect, rounded rect, circle) with black, white (knockout) or dithered-pattern fills, and white text over black shapes.
- Rulers, grid, guides (drag from a ruler), snap-to-grid / snap-to-guides, zoom.
- **Cut lines** — split a label into segments that print and cut in sequence.
- **Templates** — put `{{variables}}` in text, fill a data table (or "Edit as text" with `|` separators), and batch-print one label per row.
- **Import shipping PDF** *(off by default — feature flag)* — `File → Import shipping PDF…` reads the address page (page 2) of an eBay-style shipping/packing PDF and builds one label per file: the **Send from** block, a cut, then the **Deliver to** block. Enable it by setting `shippingPdf: true` in `js/config.js`, or per browser with `localStorage.setItem('ql700-feature-shippingPdf', '1')` in the console and a reload.
- **Print queue** with per-label preview, step-through, **Print all remaining**, and per-row selection.
- Multiple labels per workspace (left file picker), **Import / Export** as versioned JSON (single label or whole project). Workspace auto-saves to the browser's local storage.
- Undo/redo, clipboard (Ctrl+C/X/V).
- First-run dialog asks which label roll is loaded (illustrated, to scale); reopen it from **Help → Choose label roll…**.
- Light theme by default; **View → Dark theme** (or the ☾ button) switches, and the choice is remembered per browser.

---

## Project layout

```
index.html        landing page: intro, how-to, printer setup, driver revert, FAQ
landing.css       landing page styles
img/              screenshots used by the landing page
app.html          editor UI shell (menu bar, toolbar, panels, modals)
style.css         styles
js/printer.js     WebUSB driver + ESC/P raster encoder + media table
js/label.js       document model, element rendering, dithering, serialization, templates
serve.py          no-cache local dev server (optional)
sw.js             service worker: precaches the app for offline use (hosted builds only)
manifest.webmanifest, icons/   PWA install metadata
.github/workflows/pages.yml    GitHub Pages deploy
js/app.js         editor controller (all UI wiring)
js/config.js      feature flags (FEATURES.shippingPdf, off by default)
js/pdfimport.js   shipping-PDF parser (pdf.js) + address-label layout (loaded only when the flag is on)
js/vendor/        pdf.js (pdfjs-dist), vendored so the app works offline
```

## Notes

- After editing any `.js` module, **hard-reload** the page (Ctrl+Shift+R) — browsers cache ES modules aggressively.
- 300 dpi, 720-pin head (90 bytes/row). Raster constants verified against the [`brother_ql`](https://github.com/pklaus/brother_ql) project.
