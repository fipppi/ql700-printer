// printer.js — Brother QL-700 WebUSB driver + ESC/P raster encoder.
// All numeric constants verified against the brother_ql project.

const QL_VENDOR_ID = 0x04f9;
const QL700_PRODUCT_ID = 0x2042;

// Print head is 720 pins => 90 bytes per raster row, at 300 dpi.
export const PINS = 720;
export const BYTES_PER_ROW = PINS / 8; // 90
export const DPI = 300;
export const MM_TO_DOTS = DPI / 25.4; // ≈ 11.81 dots/mm

// Media geometry (string keys). `printable` = across-tape dots; left_pad = 720 -
// printable - offsetR. Continuous tapes have lengthMm 0 (free length). Die-cut
// labels have a fixed printable length (lengthDots) and mediaType 0x0B — sending
// continuous commands to a die-cut roll makes the QL-700 flash its red LED.
// Values verified against brother_ql labels.py.
export const MEDIA = {
  '62':    { label: '62mm continuous',        kind: 'continuous', mediaType: 0x0a, widthMm: 62, lengthMm: 0,  printable: 696, offsetR: 12, feedMargin: 35, lengthDots: 0 },
  '29':    { label: '29mm continuous',        kind: 'continuous', mediaType: 0x0a, widthMm: 29, lengthMm: 0,  printable: 306, offsetR: 6,  feedMargin: 35, lengthDots: 0 },
  '29x90': { label: '29×90mm address (die-cut)', kind: 'diecut', mediaType: 0x0b, widthMm: 29, lengthMm: 90, printable: 306, offsetR: 6,  feedMargin: 0,  lengthDots: 991 },
  '62x100':{ label: '62×100mm shipping (die-cut)', kind: 'diecut', mediaType: 0x0b, widthMm: 62, lengthMm: 100, printable: 696, offsetR: 12, feedMargin: 0, lengthDots: 1109 },
};

// normalize legacy numeric/unknown keys to a valid string key
export function mediaKeyOf(key) {
  if (key == null) return '62';
  const k = String(key);
  return MEDIA[k] ? k : '62';
}

// Narrow media on the QL-700 is aligned to the pin-0 (left) edge of the head, so
// content is LEFT-padded by the tape's small margin. (62mm is ~symmetric so this
// matches its previous value; 29mm moves content from the right side to the left,
// where the tape actually is.)
export function leftPad(mediaKey) {
  const m = MEDIA[mediaKeyOf(mediaKey)];
  return m.offsetR;
}

export class QLPrinter {
  constructor() {
    this.device = null;
    this.epOut = null;
  }

  get connected() {
    return !!(this.device && this.device.opened);
  }

  // Prompt user to pick the printer (must be called from a user gesture).
  async request() {
    this.device = await navigator.usb.requestDevice({
      filters: [{ vendorId: QL_VENDOR_ID }],
    });
    await this._open();
    return this.info();
  }

  // Reconnect to an already-authorized device without a picker.
  async reconnect() {
    const devices = await navigator.usb.getDevices();
    const dev = devices.find((d) => d.vendorId === QL_VENDOR_ID);
    if (!dev) return null;
    this.device = dev;
    await this._open();
    return this.info();
  }

  async _open() {
    const d = this.device;
    if (!d.opened) await d.open();
    if (d.configuration === null) await d.selectConfiguration(1);

    const cfg = d.configuration;
    const iface = cfg.interfaces[0];
    await d.claimInterface(iface.interfaceNumber);

    // Find the bulk OUT endpoint.
    const alt = iface.alternate;
    const out = alt.endpoints.find(
      (e) => e.direction === 'out' && e.type === 'bulk'
    );
    if (!out) throw new Error('No bulk OUT endpoint found on the printer.');
    this.epOut = out.endpointNumber;
  }

  info() {
    if (!this.device) return null;
    return {
      product: this.device.productName || 'QL-700',
      manufacturer: this.device.manufacturerName || 'Brother',
      serial: this.device.serialNumber || '',
    };
  }

  async close() {
    if (this.device && this.device.opened) {
      try {
        await this.device.close();
      } catch (_) {}
    }
    this.device = null;
    this.epOut = null;
  }

  async _send(bytes) {
    if (!this.connected) throw new Error('Printer not connected.');
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const res = await this.device.transferOut(this.epOut, u8);
    if (res.status !== 'ok') throw new Error('USB transfer failed: ' + res.status);
    return res;
  }

  // Print an array of "pages" (each a rows array). A page boundary = a cut.
  // rows = array of Uint8Array(90). Autocut fires between pages.
  async print(pages, { mediaKey = '62' } = {}) {
    if (!pages.length) throw new Error('Nothing to print.');
    const media = MEDIA[mediaKeyOf(mediaKey)];

    for (let p = 0; p < pages.length; p++) {
      const rows = pages[p];
      const isLast = p === pages.length - 1;
      const isFirst = p === 0;
      const job = this._buildJob(rows, media, isFirst, isLast);
      // Chunk to keep transfers reasonable (~16 KB).
      const CHUNK = 16 * 1024;
      for (let i = 0; i < job.length; i += CHUNK) {
        await this._send(job.subarray(i, i + CHUNK));
      }
    }
  }

  _buildJob(rows, media, isFirst, isLast) {
    const out = [];
    const push = (...b) => out.push(...b);

    if (isFirst) {
      // Invalidate (clear any stuck data) + initialize.
      for (let i = 0; i < 200; i++) out.push(0x00);
      push(0x1b, 0x40); // ESC @  initialize
    }
    push(0x1b, 0x69, 0x61, 0x01); // ESC i a 1  -> raster mode

    // ESC i z  print information command
    const n = rows.length;
    const diecut = media.kind === 'diecut';
    // valid flags: 0x80 | type(0x02) | width(0x04) | length(0x08 for die-cut)
    const flags = 0x80 | 0x02 | 0x04 | (diecut ? 0x08 : 0x00);
    push(
      0x1b, 0x69, 0x7a,
      flags,
      media.mediaType,       // 0x0A continuous | 0x0B die-cut
      media.widthMm & 0xff,  // 62 / 29
      media.lengthMm & 0xff, // 0 continuous | 90/100 die-cut
      n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff,
      isFirst ? 0x00 : 0x01, // starting page flag
      0x00
    );

    push(0x1b, 0x69, 0x4d, 0x40); // ESC i M  autocut on
    push(0x1b, 0x69, 0x41, 0x01); // ESC i A  cut every 1 label (cut after each page)
    push(0x1b, 0x69, 0x4b, 0x08); // ESC i K  cut at end
    const fm = media.feedMargin & 0xffff;
    push(0x1b, 0x69, 0x64, fm & 0xff, (fm >> 8) & 0xff); // ESC i d  feed margin (35 continuous / 0 die-cut)
    push(0x4d, 0x00); // M 0  no compression

    // Raster rows: g 0x00 length data
    const head = new Uint8Array(out);
    const rowStride = 3 + BYTES_PER_ROW;
    const body = new Uint8Array(rows.length * rowStride);
    let o = 0;
    for (const row of rows) {
      body[o++] = 0x67; // 'g'
      body[o++] = 0x00;
      body[o++] = BYTES_PER_ROW; // 90
      body.set(row, o);
      o += BYTES_PER_ROW;
    }

    const tail = new Uint8Array([isLast ? 0x1a : 0x0c]); // print(+eject/cut) : feed
    const job = new Uint8Array(head.length + body.length + tail.length);
    job.set(head, 0);
    job.set(body, head.length);
    job.set(tail, head.length + body.length);
    return job;
  }
}

// Convert a 1-bit column-major bitmap into printer rows.
// darkAt(x, y) -> boolean, where x = feed position, y = across-tape pixel (0..printable-1).
// Produces `lengthDots` rows of 90 bytes each, padded to the correct pin offset.
export function encodeRows(lengthDots, printableDots, mediaKey, darkAt) {
  const pad = leftPad(mediaKey);
  const rows = [];
  for (let x = 0; x < lengthDots; x++) {
    const row = new Uint8Array(BYTES_PER_ROW);
    for (let y = 0; y < printableDots; y++) {
      if (darkAt(x, y)) {
        const pin = pad + y;
        row[pin >> 3] |= 0x80 >> (pin & 7);
      }
    }
    rows.push(row);
  }
  return rows;
}
