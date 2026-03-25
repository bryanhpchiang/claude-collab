/**
 * Server-only: generates and serves the OG image as PNG.
 * Separated from og.ts to avoid pulling node:zlib into Vite client bundles.
 */

import { deflateSync } from "node:zlib";
import { OG_IMAGE_SVG } from "./og";

const W = 1200, H = 630;
const BG: [number, number, number] = [0x0d, 0x11, 0x17];
const G0: [number, number, number] = [0xff, 0x9a, 0x56]; // #ff9a56
const G1: [number, number, number] = [0xff, 0x6b, 0x6b]; // #ff6b6b
const SUB: [number, number, number] = [0x8b, 0x94, 0x9e]; // #8b949e

type C3 = [number, number, number];

function lerp(a: number, b: number, t: number) { return Math.round(a + (b - a) * t); }
function lc(a: C3, b: C3, t: number): C3 { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function bl(bg: C3, fg: C3, a: number): C3 { return [lerp(bg[0], fg[0], a), lerp(bg[1], fg[1], a), lerp(bg[2], fg[2], a)]; }

function buildPixels(): Uint8Array {
  const raw = new Uint8Array(H * (1 + W * 3));
  let i = 0;
  for (let y = 0; y < H; y++) {
    raw[i++] = 0; // filter: None
    for (let x = 0; x < W; x++) {
      let r = BG[0], g = BG[1], b = BG[2];

      // Gradient accent bar y=290..310
      if (y >= 290 && y <= 310) {
        const gc = lc(G0, G1, x / W);
        let alpha = 1.0;
        if (y < 295) alpha = (y - 290) / 5;
        else if (y > 305) alpha = (310 - y) / 5;
        [r, g, b] = bl(BG, gc, alpha);
      }

      // Jar body outline
      const cx = 600, cy = 220, jw = 36, jh = 42;
      const jx = x - cx, jy = y - cy;
      if (Math.abs(jx) <= jw && Math.abs(jy) <= jh) {
        if (Math.abs(jx) >= jw - 3 || Math.abs(jy) >= jh - 3) {
          [r, g, b] = lc(G0, G1, (x + y) / (W + H));
        }
      }

      // Jar lid
      const lw = 42, lhh = 12, ly = cy - jh - 6;
      if (Math.abs(x - cx) <= lw && y >= ly && y <= ly + lhh) {
        [r, g, b] = bl(BG, lc(G0, G1, x / W), 0.9);
      }

      // Dots inside jar
      const dots: [number, number, number, C3][] = [
        [cx - 12, cy, 8, G0],
        [cx + 12, cy + 12, 6, [0xff, 0xcc, 0x80]],
        [cx - 6, cy + 18, 5, G1],
      ];
      for (const [dx, dy, dr, dc] of dots) {
        const dist = Math.sqrt((x - dx) ** 2 + (y - dy) ** 2);
        if (dist < dr) [r, g, b] = bl([r, g, b], dc, Math.max(0, 1 - dist / dr) * 0.7);
      }

      // Bottom gradient line
      if (y >= 620 && y <= 626) {
        [r, g, b] = bl(BG, lc(G0, G1, x / W), y <= 622 ? 0.6 : 0.3);
      }

      // Block-letter "Jam"
      const ty = 370, th = 50, tw = 3;
      const gt = (): C3 => lc(G0, G1, x / W);
      // J
      if (x >= 530 && x <= 560 && y >= ty && y <= ty + tw) [r, g, b] = gt();
      if (x >= 543 && x <= 548 && y >= ty && y <= ty + th) [r, g, b] = gt();
      if (x >= 530 && x <= 548 && y >= ty + th - tw && y <= ty + th) [r, g, b] = gt();
      if (x >= 530 && x <= 533 && y >= ty + th - 12 && y <= ty + th) [r, g, b] = gt();
      // a
      if (x >= 570 && x <= 600 && y >= ty + 18 && y <= ty + th) {
        const edge = x <= 573 || x >= 597 || y <= ty + 21 || y >= ty + th - tw;
        if (edge || (y >= ty + 32 && y <= ty + 35)) [r, g, b] = gt();
      }
      // m
      if (x >= 610 && x <= 613 && y >= ty + 18 && y <= ty + th) [r, g, b] = gt();
      if (x >= 610 && x <= 640 && y >= ty + 18 && y <= ty + 21) [r, g, b] = gt();
      if (x >= 637 && x <= 640 && y >= ty + 18 && y <= ty + th) [r, g, b] = gt();
      if (x >= 640 && x <= 670 && y >= ty + 18 && y <= ty + 21) [r, g, b] = gt();
      if (x >= 667 && x <= 670 && y >= ty + 18 && y <= ty + th) [r, g, b] = gt();

      // Subtitle bar
      if (y >= 450 && y <= 454 && x >= 440 && x <= 760) [r, g, b] = bl(BG, SUB, 0.5);

      raw[i++] = r;
      raw[i++] = g;
      raw[i++] = b;
    }
  }
  return raw;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new TextEncoder().encode(type);
  const out = new Uint8Array(4 + 4 + data.length + 4);
  new DataView(out.buffer).setUint32(0, data.length);
  out.set(t, 4);
  out.set(data, 8);
  // CRC over type+data
  const td = new Uint8Array(4 + data.length);
  td.set(t); td.set(data, 4);
  new DataView(out.buffer).setUint32(8 + data.length, crc32(td));
  return out;
}

function buildPng(): Uint8Array {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W); dv.setUint32(4, H);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  const compressed = deflateSync(buildPixels());

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", new Uint8Array(0))];
  const len = parts.reduce((s, p) => s + p.length, 0);
  const png = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { png.set(p, off); off += p.length; }
  return png;
}

/** Cached PNG buffer -- generated once on first request. */
let cachedPng: Uint8Array | null = null;

/** Serve the OG image as a PNG HTTP response. Server-only. */
export function serveOgImage(): Response {
  if (!cachedPng) cachedPng = buildPng();
  return new Response(cachedPng, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
