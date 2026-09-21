# QL-700 Label Studio

A label editor and printer for the Brother QL-700 that runs entirely in the browser. It drives the printer directly over WebUSB, so there's no need for Brother's drivers or P-touch software. Layered editor for text, symbols, images and shapes, cut lines, `{{variable}}` templates with batch printing, and every DK roll the QL-700 accepts.

Hosted version: **https://fipppi.github.io/ql700-printer/** (the setup guide is there too).

## Prerequisites

- **Google Chrome** or **Microsoft Edge** — WebUSB isn't available in Firefox or Safari.
- A **Brother QL-700** with Editor Lite mode turned off (hold the Editor Lite button until its green light goes out).
- **Windows only:** swap the printer's driver for WinUSB once with [Zadig](https://zadig.akeo.ie) (`Options → List All Devices`, pick QL-700, target driver WinUSB, Replace Driver). macOS and Linux usually work as-is.
- **Python 3** if you want to run it from source (only used to serve the files — WebUSB needs `http://localhost` or HTTPS, not `file://`).

## Run from source

```bash
git clone https://github.com/fipppi/ql700-printer.git
cd ql700-printer
python serve.py
```

Then open **http://localhost:8000** in Chrome or Edge. No build step, no dependencies.
