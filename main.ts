// A Taste of One Ingredient — steaming bowl of ramen, procedurally drawn.
// Node 22+ stdlib only. Hand-rolled PNG encoder (zlib deflate + CRC32).
import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 896;
const H = 896;
const OUT_DIR = "/output";
const OUT_PATH = "/output/entry.png";

// ---------- deterministic RNG ----------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261123);

// ---------- pixel buffer ----------
const buf = new Uint8ClampedArray(W * H * 4);
function idx(x: number, y: number) { return (y * W + x) * 4; }
function clamp255(v: number) { return v < 0 ? 0 : v > 255 ? 255 : v; }

// source-over blend of a color onto the buffer
function px(x: number, y: number, r: number, g: number, b: number, a: number) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = idx(x | 0, y | 0);
  const sa = a > 1 ? 1 : a;
  const da = 1 - sa;
  buf[i] = clamp255(r * sa + buf[i] * da);
  buf[i + 1] = clamp255(g * sa + buf[i + 1] * da);
  buf[i + 2] = clamp255(b * sa + buf[i + 2] * da);
  buf[i + 3] = 255;
}

type RGB = [number, number, number];
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function lerpRGB(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// soft hash noise in [-1, 1]
function noise(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number,
  colorAt: (x: number, y: number, nx: number, ny: number) => [number, number, number, number]) {
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const ny = (y - cy) / ry;
    for (let x = x0; x <= x1; x++) {
      const nx = (x - cx) / rx;
      const d = nx * nx + ny * ny;
      if (d <= 1) {
        const c = colorAt(x, y, nx, ny);
        px(x, y, c[0], c[1], c[2], c[3]);
      }
    }
  }
}

function fillCircle(cx: number, cy: number, r: number,
  colorAt: (x: number, y: number, nx: number, ny: number) => [number, number, number, number]) {
  fillEllipse(cx, cy, r, r, colorAt);
}

// thick line segment via stamping circles along it
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number,
  col: RGB, alpha: number, clip?: (x: number, y: number) => boolean) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(2, Math.ceil(dist / (w * 0.4)));
  const r = w / 2;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = lerp(x0, x1, t), y = lerp(y0, y1, t);
    if (clip && !clip(x, y)) continue;
    const rr = Math.ceil(r);
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy <= r * r) px(x + dx, y + dy, col[0], col[1], col[2], alpha);
      }
    }
  }
}

// cubic bezier strand
function bezier(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, w: number, col: RGB, alpha: number,
  clip?: (x: number, y: number) => boolean) {
  const steps = 48;
  let px0 = x0, py0 = y0;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps, mt = 1 - t;
    const x = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
    const y = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
    thickLine(px0, py0, x, y, w, col, alpha, clip);
    px0 = x; py0 = y;
  }
}

// rounded rectangle fill (used for nori, chopsticks)
function fillRoundRect(cx: number, cy: number, w: number, h: number, rad: number,
  angle: number, col: RGB, alpha: number) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const hw = w / 2, hh = h / 2;
  const x0 = Math.floor(cx - hw - hh), x1 = Math.ceil(cx + hw + hh);
  const y0 = Math.floor(cy - hw - hh), y1 = Math.ceil(cy + hw + hh);
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      const dx = x - cx, dy = y - cy;
      const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      const qx = Math.max(Math.abs(lx) - (hw - rad), 0);
      const qy = Math.max(Math.abs(ly) - (hh - rad), 0);
      if (qx * qx + qy * qy <= rad * rad && Math.abs(lx) <= hw && Math.abs(ly) <= hh) {
        px(x, y, col[0], col[1], col[2], alpha);
      }
    }
  }
}

// ---------- scene ----------
// 1. warm wooden table
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = y / H;
    let [r, g, b] = lerpRGB([96, 58, 30], [146, 96, 52], t);
    // subtle vertical grain
    const grain = Math.sin(x * 0.021 + Math.sin(y * 0.008) * 2.2) * 5
      + Math.sin(x * 0.061 + y * 0.013) * 3.5;
    r += grain; g += grain * 0.8; b += grain * 0.6;
    // plank seams
    if ((x + 137) % 224 < 2) { r -= 16; g -= 12; b -= 8; }
    px(x, y, r, g, b, 1);
  }
}
// soft top light
fillEllipse(W / 2, 180, 560, 420, (x, y, nx, ny) => {
  const d = Math.min(1, Math.sqrt(nx * nx + ny * ny));
  const a = 0.10 * (1 - d);
  return [255, 214, 150, a];
});

// 2. soft shadow under bowl
fillEllipse(448, 838, 330, 52, (x, y, nx, ny) => {
  const d = Math.min(1, Math.sqrt(nx * nx + ny * ny));
  return [20, 8, 4, 0.42 * (1 - d) * (1 - d)];
});

// bowl geometry
const BCX = 448, BCY = 520, BR = 308;          // outer bowl
const BROTH_CX = 448, BROTH_CY = 498, BROTH_RX = 262, BROTH_RY = 228;

// 3. bowl body — deep red lacquer with light from upper left
fillEllipse(BCX, BCY, BR, BR * 0.97, (x, y, nx, ny) => {
  const d = Math.min(1, Math.sqrt(nx * nx + ny * ny));
  const light = Math.max(0, 1 - Math.hypot(nx + 0.35, ny + 0.45));
  let [r, g, b] = lerpRGB([52, 10, 8], [168, 48, 32], light * 0.9);
  [r, g, b] = lerpRGB([r, g, b], [96, 20, 16], d * 0.55);
  const n = noise(x, y) * 3;
  return [r + n, g + n, b + n, 1];
});
// glossy rim highlight arc (upper left)
for (let a = Math.PI * 0.95; a <= Math.PI * 1.55; a += 0.01) {
  const x = BCX + Math.cos(a) * BR * 0.93;
  const y = BCY + Math.sin(a) * BR * 0.90;
  fillCircle(x, y, 7, () => [255, 120, 90, 0.10]);
}
// cream rim ring
fillEllipse(BCX, BCY, BR * 0.90, BR * 0.87, (x, y, nx, ny) => {
  const d = Math.sqrt(nx * nx + ny * ny);
  if (d < 0.94) return [0, 0, 0, 0];
  return [242, 226, 196, 1];
});
// inner dark ring
fillEllipse(BCX, BCY, BR * 0.845, BR * 0.815, (x, y, nx, ny) => {
  const d = Math.sqrt(nx * nx + ny * ny);
  if (d < 0.965) return [0, 0, 0, 0];
  return [30, 8, 6, 1];
});

// 4. broth — glossy golden-orange, brighter toward upper left
fillEllipse(BROTH_CX, BROTH_CY, BROTH_RX, BROTH_RY, (x, y, nx, ny) => {
  const d = Math.min(1, Math.sqrt(nx * nx + ny * ny));
  const light = Math.max(0, 1 - Math.hypot(nx + 0.42, ny + 0.5));
  let [r, g, b] = lerpRGB([188, 96, 16], [246, 168, 62], light * 0.9);
  [r, g, b] = lerpRGB([r, g, b], [140, 62, 8], d * 0.5);
  const n = noise(x, y) * 4;
  return [r + n, g + n, b + n, 1];
});
// broth gloss: two soft specular arcs upper-left
for (let k = 0; k < 2; k++) {
  const rr = 150 - k * 26;
  for (let a = Math.PI * 1.05; a <= Math.PI * 1.5; a += 0.008) {
    const x = BROTH_CX + Math.cos(a) * rr;
    const y = BROTH_CY + Math.sin(a) * rr * 0.87;
    fillCircle(x, y, 9 - k * 3, () => [255, 205, 120, 0.10]);
  }
}
// oil droplets on broth
for (let i = 0; i < 26; i++) {
  const ang = rand() * Math.PI * 2;
  const rr = Math.sqrt(rand()) * 0.92;
  const x = BROTH_CX + Math.cos(ang) * rr * BROTH_RX;
  const y = BROTH_CY + Math.sin(ang) * rr * BROTH_RY;
  const r = 4 + rand() * 9;
  fillCircle(x, y, r, () => [255, 176, 84, 0.5]);
  fillCircle(x - r * 0.25, y - r * 0.3, r * 0.45, () => [255, 226, 160, 0.75]);
}

const inBroth = (x: number, y: number) => {
  const nx = (x - BROTH_CX) / (BROTH_RX - 12);
  const ny = (y - BROTH_CY) / (BROTH_RY - 12);
  return nx * nx + ny * ny <= 1;
};

// 5. nori sheet at the back of the bowl
fillRoundRect(606, 352, 84, 168, 10, 0.22, [20, 32, 17], 1);
fillRoundRect(606, 352, 77, 160, 9, 0.22, [32, 50, 26], 1);
for (let i = 0; i < 5; i++) {
  thickLine(590 + i * 8, 280, 584 + i * 8, 425, 2, [46, 68, 36], 0.5);
}

// 6. wavy noodle strands across the broth — tangled, diagonal, curvy
const noodleCols: RGB[] = [[242, 193, 78], [250, 214, 110], [224, 164, 48]];
for (let i = 0; i < 44; i++) {
  const cx = BROTH_CX + (rand() - 0.5) * 320;
  const cy = BROTH_CY + (rand() - 0.5) * 280;
  const ang = (rand() - 0.5) * 1.0; // up to ~±29°
  const len = 150 + rand() * 170;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const pxv = -dy, pyv = dx; // perpendicular
  const w1 = (rand() - 0.5) * 90, w2 = (rand() - 0.5) * 90;
  const col = noodleCols[i % 3];
  const w = 5 + rand() * 3.5;
  bezier(
    cx - dx * len / 2, cy - dy * len / 2,
    cx - dx * len / 6 + pxv * w1, cy - dy * len / 6 + pyv * w1,
    cx + dx * len / 6 + pxv * w2, cy + dy * len / 6 + pyv * w2,
    cx + dx * len / 2, cy + dy * len / 2,
    w, col, 0.95, inBroth,
  );
  // highlight thread on some strands
  if (i % 3 === 0) {
    bezier(
      cx - dx * len / 2 + 3, cy - dy * len / 2 - 3,
      cx - dx * len / 6 + pxv * w1 + 3, cy - dy * len / 6 + pyv * w1 - 3,
      cx + dx * len / 6 + pxv * w2 + 3, cy + dy * len / 6 + pyv * w2 - 3,
      cx + dx * len / 2 + 3, cy + dy * len / 2 - 3,
      2, [255, 232, 150], 0.8, inBroth);
  }
}

// 7. chashu pork slices (2)
function chashu(cx: number, cy: number, r: number, rot: number) {
  fillEllipse(cx, cy, r, r * 0.92, (x, y, nx, ny) => {
    const d = Math.min(1, Math.sqrt(nx * nx + ny * ny));
    let [rr, gg, bb] = lerpRGB([216, 138, 96], [168, 86, 56], d);
    // seared edge
    if (d > 0.82) [rr, gg, bb] = lerpRGB([rr, gg, bb], [94, 42, 20], (d - 0.82) / 0.18);
    // fatty swirl
    const sw = Math.sin(Math.atan2(ny, nx) * 3 + d * 9) * 0.5 + 0.5;
    if (d < 0.7 && sw > 0.62) [rr, gg, bb] = lerpRGB([rr, gg, bb], [248, 216, 184], 0.6);
    return [rr, gg, bb, 1];
  });
  // gloss dot
  fillCircle(cx - r * 0.3, cy - r * 0.35, r * 0.16, () => [255, 230, 200, 0.5]);
}
chashu(330, 560, 74, 0);
chashu(560, 600, 68, 0);

// 8. halved soft egg (2 halves)
function eggHalf(cx: number, cy: number, r: number) {
  fillEllipse(cx, cy, r, r * 0.88, (x, y, nx, ny) => {
    const d = Math.min(1, Math.sqrt(nx * nx + ny * ny));
    let [rr, gg, bb] = lerpRGB([255, 250, 238], [232, 214, 188], d * 0.8);
    if (d > 0.9) [rr, gg, bb] = lerpRGB([rr, gg, bb], [214, 188, 150], (d - 0.9) / 0.1);
    return [rr, gg, bb, 1];
  });
  // jammy yolk
  fillCircle(cx, cy, r * 0.52, (x, y, nx, ny) => {
    const d = Math.min(1, Math.sqrt(nx * nx + ny * ny));
    const [rr, gg, bb] = lerpRGB([255, 176, 52], [222, 110, 8], d);
    return [rr, gg, bb, 1];
  });
  fillCircle(cx - r * 0.16, cy - r * 0.18, r * 0.12, () => [255, 222, 140, 0.85]);
}
eggHalf(452, 408, 62);
eggHalf(560, 448, 56);

// 9. narutomaki — white fish cake with pink swirl
function naruto(cx: number, cy: number, r: number) {
  fillCircle(cx, cy, r, (x, y, nx, ny) => {
    const d = Math.min(1, Math.sqrt(nx * nx + ny * ny));
    return [252, 248, 240, 1];
  });
  // pink spiral: archimedean, drawn as thick line along the spiral
  let px0 = cx, py0 = cy;
  for (let a = 0; a <= Math.PI * 5.2; a += 0.08) {
    const rr = (a / (Math.PI * 5.2)) * r * 0.82;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    thickLine(px0, py0, x, y, 5.5, [240, 118, 150], 1);
    px0 = x; py0 = y;
  }
  fillCircle(cx - r * 0.3, cy - r * 0.3, r * 0.2, () => [255, 255, 255, 0.35]);
}
naruto(360, 640, 40);
naruto(468, 660, 34);

// 10. chopped green onions scattered on the broth
for (let i = 0; i < 42; i++) {
  const ang = rand() * Math.PI * 2;
  const rr = Math.sqrt(rand()) * 0.9;
  const x = BROTH_CX + Math.cos(ang) * rr * BROTH_RX;
  const y = BROTH_CY + Math.sin(ang) * rr * BROTH_RY;
  const r = 5 + rand() * 4;
  const green: RGB = rand() > 0.5 ? [74, 164, 74] : [96, 190, 92];
  // ring: outer green, inner darker (hollow scallion)
  fillCircle(x, y, r, () => [green[0], green[1], green[2], 1]);
  fillCircle(x, y, r * 0.55, () => [30, 96, 40, 1]);
  fillCircle(x - r * 0.25, y - r * 0.25, r * 0.22, () => [190, 235, 160, 0.8]);
}

// 11. chopsticks resting diagonally across the rim
function chopstick(cx: number, cy: number, angle: number, len: number, w: number) {
  // body with length gradient (dark tip to warm handle)
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const hw = len / 2, hh = w / 2;
  const x0 = Math.floor(cx - hw - hh - 4), x1 = Math.ceil(cx + hw + hh + 4);
  const y0 = Math.floor(cy - hw - hh - 4), y1 = Math.ceil(cy + hw + hh + 4);
  for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
      const dx = x - cx, dy = y - cy;
      const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      if (Math.abs(lx) > hw || Math.abs(ly) > hh) continue;
      const t = (lx + hw) / len; // 0 tip → 1 handle
      let [r, g, b] = lerpRGB([92, 52, 20], [168, 106, 48], t);
      // taper: thinner toward the tip
      const taper = 0.55 + 0.45 * t;
      if (Math.abs(ly) > hh * taper) continue;
      // top highlight stripe
      if (ly < -hh * 0.15 && ly > -hh * 0.75) [r, g, b] = lerpRGB([r, g, b], [224, 168, 96], 0.65);
      px(x, y, r, g, b, 1);
    }
  }
}
// shadow first (offset down-right, translucent dark)
fillRoundRect(448, 348, 560, 15, 7, -0.42, [30, 10, 4], 0.35);
chopstick(448, 332, -0.42, 560, 17);
chopstick(448, 356, -0.38, 560, 17);

// 12. steam — drawn on its own layer, box-blurred, composited on top
const steam = new Float32Array(W * H); // alpha 0..1
function steamPx(x: number, y: number, a: number) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y | 0) * W + (x | 0);
  steam[i] = Math.min(1, steam[i] + a);
}
function steamBlob(cx: number, cy: number, r: number, a: number) {
  const rr = Math.ceil(r);
  for (let dy = -rr; dy <= rr; dy++) {
    for (let dx = -rr; dx <= rr; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy) / r;
      if (d <= 1) steamPx(cx + dx, cy + dy, a * (1 - d) * (1 - d));
    }
  }
}
// three rising S-curved wisps
const wisps = [
  { x: 350, phase: 0.0, amp: 34 },
  { x: 448, phase: 2.1, amp: 42 },
  { x: 548, phase: 4.2, amp: 34 },
];
for (const wisp of wisps) {
  for (let y = 250; y >= 40; y -= 6) {
    const t = (250 - y) / 210; // 0 bottom → 1 top
    const x = wisp.x + Math.sin(t * 5.2 + wisp.phase) * wisp.amp * (0.4 + t * 0.6)
      + Math.sin(t * 11 + wisp.phase * 2) * 6;
    const r = 13 + t * 26;
    const a = 0.13 * (1 - t * 0.55);
    steamBlob(x, y, r, a);
  }
}
// separable box blur on the steam alpha (radius 9)
function blurAlpha(src: Float32Array, radius: number): Float32Array {
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -radius; x <= radius; x++) acc += src[y * W + Math.max(0, Math.min(W - 1, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / (2 * radius + 1);
      const xa = Math.max(0, x - radius), xb = Math.min(W - 1, x + radius + 1);
      acc += src[y * W + xb] - src[y * W + xa];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -radius; y <= radius; y++) acc += tmp[Math.max(0, Math.min(H - 1, y)) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc / (2 * radius + 1);
      const ya = Math.max(0, y - radius), yb = Math.min(H - 1, y + radius + 1);
      acc += tmp[yb * W + x] - tmp[ya * W + x];
    }
  }
  return out;
}
const steamBlurred = blurAlpha(steam, 9);
for (let i = 0; i < W * H; i++) {
  const a = steamBlurred[i] * 0.85;
  if (a > 0.003) {
    const p = i * 4;
    buf[p] = clamp255(255 * a + buf[p] * (1 - a));
    buf[p + 1] = clamp255(250 * a + buf[p + 1] * (1 - a));
    buf[p + 2] = clamp255(244 * a + buf[p + 2] * (1 - a));
  }
}

// 13. final vignette
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const nx = (x - W / 2) / (W / 2), ny = (y - H / 2) / (H / 2);
    const d = Math.sqrt(nx * nx + ny * ny);
    if (d > 0.82) {
      const a = Math.min(0.28, (d - 0.82) * 1.1);
      const i = idx(x, y);
      buf[i] = clamp255(buf[i] * (1 - a));
      buf[i + 1] = clamp255(buf[i + 1] * (1 - a));
      buf[i + 2] = clamp255(buf[i + 2] * (1 - a));
    }
  }
}

// ---------- PNG encoder (hand-rolled, zlib deflate + CRC32) ----------
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0; // filter: none
  Buffer.from(buf.buffer, y * W * 4, W * 4).copy(raw, y * (1 + W * 4) + 1);
}
const idat = deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", idat),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_PATH, png);
console.log(`wrote ${OUT_PATH} (${png.length} bytes, ${W}x${H})`);
