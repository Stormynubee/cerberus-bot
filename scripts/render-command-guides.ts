/**
 * Hand-drawn 8-bit command manuals (not model-generated).
 * Run: npx tsx scripts/render-command-guides.ts
 */
import { deflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const W = 320;
const H = 220;
const SCALE = 3;

const C = {
  void: [12, 8, 10],
  bg: [22, 16, 18],
  panel: [32, 22, 24],
  ink: [244, 228, 193],
  dim: [168, 154, 138],
  gold: [255, 191, 31],
  red: [225, 29, 42],
  ember: [255, 98, 36],
  green: [74, 222, 128],
  black: [8, 6, 8],
  cat: [8, 6, 10],
  fur: [36, 28, 42],
  eye: [255, 176, 32],
  pink: [255, 140, 170],
  frame: [124, 45, 18],
  line: [90, 36, 28],
  outline: [244, 228, 193],
} as const;

type RGB = readonly [number, number, number];

const FONT: Record<string, number[]> = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  "!": [4, 4, 4, 4, 0, 4, 4],
  "#": [10, 31, 10, 31, 10, 0, 0],
  "%": [17, 18, 4, 8, 17, 0, 0],
  "&": [4, 10, 4, 10, 17, 14, 0],
  "'": [4, 4, 0, 0, 0, 0, 0],
  "(": [2, 4, 4, 4, 4, 2, 0],
  ")": [8, 4, 4, 4, 4, 8, 0],
  "+": [0, 4, 14, 4, 0, 0, 0],
  ",": [0, 0, 0, 0, 4, 4, 8],
  "-": [0, 0, 14, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 4, 4],
  "/": [1, 2, 4, 8, 16, 0, 0],
  "0": [14, 17, 19, 21, 25, 14, 0],
  "1": [4, 12, 4, 4, 4, 14, 0],
  "2": [14, 17, 2, 4, 8, 31, 0],
  "3": [14, 17, 6, 1, 17, 14, 0],
  "4": [2, 6, 10, 18, 31, 2, 0],
  "5": [31, 16, 30, 1, 17, 14, 0],
  "6": [14, 16, 30, 17, 17, 14, 0],
  "7": [31, 1, 2, 4, 8, 8, 0],
  "8": [14, 17, 14, 17, 17, 14, 0],
  "9": [14, 17, 17, 15, 1, 14, 0],
  ":": [0, 4, 4, 0, 4, 4, 0],
  "<": [2, 4, 8, 4, 2, 0, 0],
  ">": [8, 4, 2, 4, 8, 0, 0],
  "?": [14, 17, 2, 4, 0, 4, 0],
  "@": [14, 17, 23, 21, 16, 14, 0],
  A: [14, 17, 17, 31, 17, 17, 0],
  B: [30, 17, 30, 17, 17, 30, 0],
  C: [14, 17, 16, 16, 17, 14, 0],
  D: [30, 17, 17, 17, 17, 30, 0],
  E: [31, 16, 30, 16, 16, 31, 0],
  F: [31, 16, 30, 16, 16, 16, 0],
  G: [14, 17, 16, 19, 17, 14, 0],
  H: [17, 17, 31, 17, 17, 17, 0],
  I: [14, 4, 4, 4, 4, 14, 0],
  J: [1, 1, 1, 1, 17, 14, 0],
  K: [17, 18, 28, 18, 17, 17, 0],
  L: [16, 16, 16, 16, 16, 31, 0],
  M: [17, 27, 21, 17, 17, 17, 0],
  N: [17, 25, 21, 19, 17, 17, 0],
  O: [14, 17, 17, 17, 17, 14, 0],
  P: [30, 17, 17, 30, 16, 16, 0],
  Q: [14, 17, 17, 21, 18, 13, 0],
  R: [30, 17, 17, 30, 18, 17, 0],
  S: [14, 17, 14, 1, 17, 14, 0],
  T: [31, 4, 4, 4, 4, 4, 0],
  U: [17, 17, 17, 17, 17, 14, 0],
  V: [17, 17, 17, 17, 10, 4, 0],
  W: [17, 17, 17, 21, 27, 17, 0],
  X: [17, 10, 4, 10, 17, 17, 0],
  Y: [17, 17, 10, 4, 4, 4, 0],
  Z: [31, 2, 4, 8, 16, 31, 0],
  a: [0, 14, 1, 15, 17, 15, 0],
  b: [16, 16, 30, 17, 17, 30, 0],
  c: [0, 14, 16, 16, 17, 14, 0],
  d: [1, 1, 15, 17, 17, 15, 0],
  e: [0, 14, 17, 31, 16, 14, 0],
  f: [6, 8, 28, 8, 8, 8, 0],
  g: [0, 15, 17, 15, 1, 14, 0],
  h: [16, 16, 30, 17, 17, 17, 0],
  i: [4, 0, 12, 4, 4, 14, 0],
  j: [2, 0, 2, 2, 18, 12, 0],
  k: [16, 18, 20, 24, 20, 18, 0],
  l: [12, 4, 4, 4, 4, 14, 0],
  m: [0, 26, 21, 21, 21, 21, 0],
  n: [0, 30, 17, 17, 17, 17, 0],
  o: [0, 14, 17, 17, 17, 14, 0],
  p: [0, 30, 17, 30, 16, 16, 0],
  q: [0, 15, 17, 15, 1, 1, 0],
  r: [0, 22, 24, 16, 16, 16, 0],
  s: [0, 15, 16, 14, 1, 30, 0],
  t: [8, 28, 8, 8, 8, 6, 0],
  u: [0, 17, 17, 17, 17, 15, 0],
  v: [0, 17, 17, 17, 10, 4, 0],
  w: [0, 17, 17, 21, 21, 10, 0],
  x: [0, 17, 10, 4, 10, 17, 0],
  y: [0, 17, 17, 15, 1, 14, 0],
  z: [0, 31, 2, 4, 8, 31, 0],
  "|": [4, 4, 4, 4, 4, 4, 0],
  "~": [0, 0, 8, 21, 2, 0, 0],
};

class Bitmap {
  w: number;
  h: number;
  data: Uint8Array;
  constructor(w: number, h: number, fill: RGB = C.bg) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 3);
    this.fill(0, 0, w, h, fill);
  }
  idx(x: number, y: number) {
    return (y * this.w + x) * 3;
  }
  set(x: number, y: number, c: RGB) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = this.idx(x, y);
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
  }
  fill(x: number, y: number, w: number, h: number, c: RGB) {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) this.set(x + xx, y + yy, c);
    }
  }
  rect(x: number, y: number, w: number, h: number, c: RGB) {
    this.fill(x, y, w, 1, c);
    this.fill(x, y + h - 1, w, 1, c);
    this.fill(x, y, 1, h, c);
    this.fill(x + w - 1, y, 1, h, c);
  }
  text(x: number, y: number, str: string, c: RGB, scale = 1) {
    let cx = x;
    for (const ch of str) {
      if (ch === "\n") {
        cx = x;
        y += 8 * scale;
        continue;
      }
      const glyph = FONT[ch] ?? FONT["?"];
      for (let row = 0; row < 7; row++) {
        const bits = glyph![row]!;
        for (let col = 0; col < 5; col++) {
          if (bits & (1 << (4 - col))) {
            this.fill(cx + col * scale, y + row * scale, scale, scale, c);
          }
        }
      }
      cx += 6 * scale;
    }
    return cx;
  }
  sprite(x: number, y: number, rows: string[], map: Record<string, RGB>, scale = 1) {
    for (let yy = 0; yy < rows.length; yy++) {
      const row = rows[yy]!;
      for (let xx = 0; xx < row.length; xx++) {
        const c = map[row[xx]!];
        if (c) this.fill(x + xx * scale, y + yy * scale, scale, scale, c);
      }
    }
  }
  scale(n: number) {
    const out = new Bitmap(this.w * n, this.h * n);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = this.idx(x, y);
        const c: RGB = [this.data[i]!, this.data[i + 1]!, this.data[i + 2]!];
        out.fill(x * n, y * n, n, n, c);
      }
    }
    return out;
  }
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function toPng(bmp: Bitmap): Buffer {
  const raw = Buffer.alloc((bmp.w * 3 + 1) * bmp.h);
  for (let y = 0; y < bmp.h; y++) {
    const row = y * (bmp.w * 3 + 1);
    raw[row] = 0;
    raw.set(bmp.data.subarray(y * bmp.w * 3, (y + 1) * bmp.w * 3), row + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(bmp.w, 0);
  ihdr.writeUInt32BE(bmp.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array()),
  ]);
}

const CAT = [
  ".www.www.www.",
  "wfffwfffwfffw",
  "wfoofoofoofow",
  "wfkkfkfkfkkfw",
  "wfppfppfpppfw",
  ".wfffDwDfffw.",
  "..wffffffffw.",
  "...wffffffw..",
  "....wf..fw...",
];

const COIN = [
  "..yyy..",
  ".ywwyy.",
  "ywDywyy",
  "ywyDyyy",
  ".yyyyy.",
  "..yyy..",
];

const FIRE = [
  "...y...",
  "..yry..",
  ".yrrry.",
  "yrrrrry",
  ".ryyyr.",
  "..rrr..",
];

const SKULL = [
  ".wwwww.",
  "wDwDwDw",
  "wwwwwww",
  "wDwwwDw",
  ".wwwww.",
  "..w.w..",
];

const SWORDS = [
  "w....w",
  ".w.g.w",
  "..wgw.",
  ".w.g.w",
  "w....w",
];

const MAP: Record<string, RGB> = {
  k: C.cat,
  f: C.fur,
  o: C.eye,
  y: C.gold,
  w: C.outline,
  p: C.pink,
  D: C.black,
  e: C.ember,
  r: C.red,
  g: C.green,
};

function frame(b: Bitmap) {
  b.fill(0, 0, W, H, C.void);
  b.fill(6, 6, W - 12, H - 12, C.bg);
  b.rect(4, 4, W - 8, H - 8, C.gold);
  b.rect(5, 5, W - 10, H - 10, C.frame);
  b.rect(8, 8, W - 16, H - 16, C.line);
  // meander ticks
  for (let x = 12; x < W - 12; x += 8) {
    b.fill(x, 8, 4, 1, C.gold);
    b.fill(x, H - 9, 4, 1, C.gold);
  }
}

function header(b: Bitmap, page: string, title: string) {
  b.fill(12, 12, W - 24, 22, C.panel);
  b.text(16, 16, "GREEKBOT", C.gold, 2);
  b.text(122, 18, page, C.dim);
  b.text(16, 38, title, C.ember);
}

function cmd(b: Bitmap, y: number, name: string, desc: string): number {
  b.text(16, y, name, C.gold);
  const nameW = name.length * 6;
  if (16 + nameW < 168) {
    b.text(172, y, desc, C.ink);
    return y + 10;
  }
  b.text(22, y + 9, desc, C.dim);
  return y + 19;
}

function page1(): Bitmap {
  const b = new Bitmap(W, H);
  frame(b);
  header(b, "1/3", "START");
  b.sprite(W - 78, 11, CAT, MAP, 2);

  b.text(16, 50, "GreekGodBerry HellCat casino.", C.ink);
  b.text(16, 62, "Same commands:  /daily   or   !daily", C.green);

  b.text(16, 78, "WALLET", C.red);
  let y = 90;
  y = cmd(b, y, "/help  /hell", "this guide");
  y = cmd(b, y, "/daily", "claim + streak");
  y = cmd(b, y, "/balance", "your HCC");
  y = cmd(b, y, "/tip @staff amt", "owner/admin/mod");
  y = cmd(b, y, "/leaderboard", "top wallets");
  y = cmd(b, y, "/profile", "wins / losses");
  y = cmd(b, y, "/jackpot", "house pot");

  b.text(16, 176, "Insert coin. Try /daily then /slots 10", C.dim);
  b.text(16, 196, "next: games ->", C.gold);
  return b;
}

function page2(): Bitmap {
  const b = new Bitmap(W, H);
  frame(b);
  header(b, "2/3", "GAMES");
  b.sprite(W - 44, 12, SWORDS, MAP, 2);
  b.sprite(W - 22, 14, COIN, MAP, 2);

  b.text(16, 50, "Buttons fight. You just lose with style.", C.dim);

  b.text(16, 64, "PVP  (no rake)", C.red);
  let y = 76;
  y = cmd(b, y, "/coinflip amt heads|tails", "house or @user");
  y = cmd(b, y, "/rps @user amt", "rock-paper-scissors");
  y = cmd(b, y, "/blackjack amt", "hit / stand vs house");

  b.text(16, y + 4, "CASINO  (~2% rake -> jackpot)", C.red);
  y += 16;
  y = cmd(b, y, "/slots amt", "3-reel spin");
  y = cmd(b, y, "/roulette amt red|black|green", "green 36x");
  y = cmd(b, y, "/crash amt", "cash out or boom");
  y = cmd(b, y, "/highlow amt", "true-odds climb");

  b.text(16, 176, "House games take a cut. PvP does not.", C.dim);
  b.text(16, 196, "next: inferno ->", C.gold);
  return b;
}

function page3(): Bitmap {
  const b = new Bitmap(W, H);
  frame(b);
  header(b, "3/3", "INFERNO");
  b.sprite(W - 44, 12, SKULL, MAP, 2);
  b.sprite(W - 22, 14, FIRE, MAP, 2);

  b.text(16, 50, "Hunger Games. On fire. Early deaths: yes.", C.dim);

  let y = 64;
  y = cmd(b, y, "/hungergames new", "open signup");
  y = cmd(b, y, "/hungergames pricing", "prize / revive / fees");
  y = cmd(b, y, "/hungergames setup", "same as pricing");
  y = cmd(b, y, "/hungergames status", "alive / dead / pool");
  b.text(16, y + 2, "Join > Start > Bloodbath > Finale", C.green);
  b.text(16, y + 12, "Host pays prize. Revives feed the pool.", C.ink);

  b.text(16, y + 26, "ADMIN  (Manage Server)", C.red);
  y += 38;
  y = cmd(b, y, "/admin grant|revoke|freeze|audit", "money tools");
  y = cmd(b, y, "/admin bigwin", "big-win feed");
  y = cmd(b, y, "/admin arenamaster", "arena role");

  b.text(16, 196, "Last cat standing takes the pot.", C.dim);
  return b;
}

function main() {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/guides");
  mkdirSync(dir, { recursive: true });
  const pages = [
    ["greekbot-guide-1-start.png", page1],
    ["greekbot-guide-2-games.png", page2],
    ["greekbot-guide-3-inferno.png", page3],
  ] as const;
  for (const [name, fn] of pages) {
    const png = toPng(fn().scale(SCALE));
    const file = path.join(dir, name);
    writeFileSync(file, png);
    const hash = createHash("sha1").update(png).digest("hex").slice(0, 8);
    console.log(`wrote ${file}  ${png.length} bytes  ${hash}`);
  }
}

main();
