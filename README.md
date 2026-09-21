# QL-700 Label Studio

A label editor & print tool for the Brother QL-700 that replaces the need for Brother's awful built-in P-touch software. Prints directly to the device over WebUSB with WinUSB drivers. Supports text, symbols, images and shapes, cut lines, `{{variable}}` templates with batch printing.

Use the tool online: **https://ql700.fippi.io**.

## Prerequisites

- **Google Chrome** or **Microsoft Edge** (WebUSB isn't available in Firefox or Safari)
- A **Brother QL-700** with Editor Lite mode turned off (hold the Editor Lite button until its green light goes out).
- **Windows only:** swap the printer's driver for WinUSB once with [Zadig](https://zadig.akeo.ie) (`Options → List All Devices`, pick QL-700, target driver WinUSB, Replace Driver). macOS and Linux usually work as-is.
- **Python 3** if you want to run it from source (only used to serve the files).

## Run from source

```bash
git clone https://github.com/fipppi/ql700-printer.git
cd ql700-printer
python serve.py
```

Then open **http://localhost:8000** in Chrome or Edge.
