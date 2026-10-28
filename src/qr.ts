/* A QR code for a status page's link, drawn in the browser so the link never leaves it for a third-party service.
   Byte mode, error correction level M (about 15% of the code can be scuffed or covered and it still reads: a sticker on
   a storefront window), versions 1 to 10 (up to 213 bytes; a status link is about 80). Follows ISO/IEC 18004 the way
   Project Nayuki's reference generator lays it out. The mask with the lowest penalty is chosen, as the standard asks.
   Read back by OpenCV's decoder at versions 1, 4, 5, 6, 8 and 10 when written; scripts/compliance-test.ts holds its shape. */

const ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const MAX_VERSION = 10;

const bit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

function rawModules(v: number): number {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
  return r;
}
const dataBytes = (v: number) => Math.floor(rawModules(v) / 8) - ECC_M[v] * BLOCKS_M[v];

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}
function rsDivisor(deg: number): number[] {
  const r = new Array<number>(deg).fill(0); r[deg - 1] = 1;
  let root = 1;
  for (let i = 0; i < deg; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    root = gfMul(root, 0x02);
  }
  return r;
}
function rsRemainder(data: number[], div: number[]): number[] {
  const r = div.map(() => 0);
  for (const b of data) {
    const f = b ^ (r.shift() as number);
    r.push(0);
    div.forEach((c, i) => { r[i] ^= gfMul(c, f); });
  }
  return r;
}

function alignPositions(v: number, size: number): number[] {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let p = size - 7; out.length < n; p -= step) out.splice(1, 0, p);
  return out;
}

/** The code's modules, row by row: true is dark. Throws for text too long for version 10. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  let v = 1;
  for (; v <= MAX_VERSION; v++) if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= dataBytes(v) * 8) break;
  if (v > MAX_VERSION) throw new Error("Too long for a QR code");
  const cap = dataBytes(v) * 8;
  const bits: number[] = [];
  const put = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4); put(bytes.length, v < 10 ? 8 : 16); for (const b of bytes) put(b, 8);
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  // split into blocks, add error correction, interleave
  const nb = BLOCKS_M[v], ecLen = ECC_M[v], raw = Math.floor(rawModules(v) / 8);
  const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const div = rsDivisor(ecLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - ecLen + (i < nShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const words: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecLen || j >= nShort) words.push(b[i]); });

  const size = v * 4 + 17;
  const m: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, d: boolean) => { m[y][x] = d; fn[y][x] = true; };

  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = alignPositions(v, size);
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const format = (mask: number) => {
    const d = (0 << 3) | mask; // level M is 00
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, bit(b, i));
    set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i));
    set(8, size - 8, true);
  };
  format(0);
  if (v >= 7) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const b = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, bit(b, i)); set(c, a, bit(b, i)); }
  }

  // the data, in the two-column zigzag
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && i < words.length * 8) { m[y][x] = bit(words[i >>> 3], 7 - (i & 7)); i++; }
    }
  }

  const masks: ((x: number, y: number) => boolean)[] = [
    (x, y) => (x + y) % 2 === 0, (_x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const apply = (k: number) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && masks[k](x, y)) m[y][x] = !m[y][x]; };
  const penalty = () => {
    let p = 0, dark = 0;
    for (let a = 0; a < size; a++) for (const row of [true, false]) {
      let run = 0, col = false;
      for (let b = 0; b < size; b++) {
        const c = row ? m[a][b] : m[b][a];
        if (b > 0 && c === col) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else { col = c; run = 1; }
      }
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (m[y][x]) dark++;
      if (x < size - 1 && y < size - 1) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
    }
    const total = size * size;
    return p + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  };
  let best = 0, low = Infinity;
  for (let k = 0; k < 8; k++) { apply(k); format(k); const s = penalty(); if (s < low) { low = s; best = k; } apply(k); }
  apply(best); format(best);
  return m;
}

/** The code as an SVG, with the four-module quiet zone the standard asks for. Dark on white, whatever the theme. */
export function qrSvg(text: string, opts: { px?: number; label?: string } = {}): string {
  const m = qrMatrix(text), n = m.length, q = 4, w = n + q * 2;
  let d = "";
  m.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + q} ${y + q}h1v1h-1z`; }));
  const px = opts.px ?? 256;
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="${esc(opts.label ?? "QR code")}"><rect width="${w}" height="${w}" fill="#fff"/><path fill="#000" d="${d}"/></svg>`;
}
