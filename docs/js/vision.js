// Screenshot reading: find the shop bar and classify each card's cost by its
// frame color.
//
// WHAT IS AUTOMATED: locating the 5 shop cards and reading each one's cost
// tier from its frame colour, plus detecting already-bought (empty) slots.
// Cost detection is reliable because TFT's frame colours are fixed and
// strongly saturated.
//
// WHAT IS NOT: identifying WHICH champion is on a card. That needs a trained
// model on champion art; reading the tiny stylised name text with generic OCR
// is worse than useless when it's confidently wrong. Instead the cost read
// narrows each slot to ~13 candidates and you tap the right one.
//
// Screen geometry differs per device, so the shop-bar box is calibrated once
// and remembered.

import { COST_COLORS } from "./roster.js";

const CAL_KEY = "ftt-calibration";

// Default shop-bar box as fractions of image width/height. Tuned for TFT
// mobile in landscape, where the shop occupies the bottom strip.
export const DEFAULT_REGION = { x: 0.205, y: 0.815, w: 0.59, h: 0.155 };

export function loadCalibration() {
  try {
    const saved = JSON.parse(localStorage.getItem(CAL_KEY));
    if (saved && ["x", "y", "w", "h"].every((k) => typeof saved[k] === "number")) return saved;
  } catch { /* fall through to default */ }
  return { ...DEFAULT_REGION };
}
export function saveCalibration(region) {
  localStorage.setItem(CAL_KEY, JSON.stringify(region));
}
export function resetCalibration() {
  localStorage.removeItem(CAL_KEY);
  return { ...DEFAULT_REGION };
}

export function imageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image.")); };
    img.src = url;
  });
}

/** Draw to a canvas, downscaled so processing stays fast on a phone. */
export function toCanvas(img, maxWidth = 1400) {
  const scale = Math.min(1, maxWidth / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/**
 * Sample the frame of a card box: the perimeter ring plus the bottom
 * nameplate, where the cost tint lives. The interior is splash art and only
 * adds noise.
 */
function sampleFrame(ctx, box) {
  const { x, y, w, h } = box;
  const data = ctx.getImageData(x, y, w, h).data;
  const px = (cx, cy) => {
    const i = ((cy * w) + cx) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const ringW = Math.max(2, Math.round(w * 0.10));
  const ringH = Math.max(2, Math.round(h * 0.10));
  const samples = [];
  const step = Math.max(1, Math.round(Math.min(w, h) / 40));

  for (let cx = 0; cx < w; cx += step) {
    for (let cy = 0; cy < ringH; cy += step) samples.push(px(cx, cy));
    for (let cy = h - ringH; cy < h; cy += step) samples.push(px(cx, cy));
    // bottom nameplate strip, where the cost colour is strongest
    for (let cy = Math.round(h * 0.78); cy < h; cy += step) samples.push(px(cx, cy));
  }
  for (let cy = 0; cy < h; cy += step) {
    for (let cx = 0; cx < ringW; cx += step) samples.push(px(cx, cy));
    for (let cx = w - ringW; cx < w; cx += step) samples.push(px(cx, cy));
  }
  return samples;
}

/**
 * Classify a card's cost from sampled frame pixels.
 * Returns { cost, confidence, empty }.
 */
export function classifyCost(samples) {
  if (!samples.length) return { cost: null, confidence: 0, empty: true };

  const hsv = samples.map(([r, g, b]) => rgbToHsv(r, g, b));
  const meanV = hsv.reduce((a, p) => a + p.v, 0) / hsv.length;

  // A bought/empty slot is a dark, flat hole.
  const lively = hsv.filter((p) => p.v > 0.12 && p.v < 0.99);
  if (meanV < 0.10 || lively.length < samples.length * 0.15) {
    return { cost: null, confidence: 0.8, empty: true };
  }

  // Weighted circular histogram over saturated pixels only.
  const BINS = 36;
  const hist = new Array(BINS).fill(0);
  let saturatedWeight = 0, totalWeight = 0;
  for (const p of lively) {
    const weight = p.v;
    totalWeight += weight;
    if (p.s >= 0.25) {
      hist[Math.min(BINS - 1, Math.floor(p.h / (360 / BINS)))] += p.s * p.v;
      saturatedWeight += p.s * p.v;
    }
  }

  const saturatedShare = totalWeight ? saturatedWeight / totalWeight : 0;
  // 1-costs have a gray frame: bright enough to be a card, but no hue.
  if (saturatedShare < 0.10) {
    return { cost: 1, confidence: Math.min(0.9, 0.55 + (0.10 - saturatedShare) * 4), empty: false };
  }

  // Smooth circularly so a hue straddling two bins still peaks correctly.
  const smooth = hist.map((_, i) =>
    hist[(i - 1 + BINS) % BINS] * 0.5 + hist[i] + hist[(i + 1) % BINS] * 0.5);
  let peak = 0;
  for (let i = 1; i < BINS; i++) if (smooth[i] > smooth[peak]) peak = i;
  const peakHue = (peak + 0.5) * (360 / BINS);
  const peakShare = smooth[peak] / smooth.reduce((a, b) => a + b, 0);

  let best = null, bestDist = Infinity;
  for (const [cost, def] of Object.entries(COST_COLORS)) {
    if (def.hue == null) continue;
    let d = Math.abs(peakHue - def.hue);
    if (d > 180) d = 360 - d;
    if (d < bestDist) { bestDist = d; best = Number(cost); }
  }
  if (bestDist > 42) {
    // Hue doesn't match any cost frame — most likely a gray 1-cost card
    // sitting on colourful splash art.
    return { cost: 1, confidence: 0.35, empty: false };
  }
  const confidence = Math.max(0.3, Math.min(0.95,
    (1 - bestDist / 42) * 0.6 + Math.min(1, peakShare * 3) * 0.4));
  return { cost: best, confidence, empty: false };
}

/** Read all 5 shop slots from a calibrated region (fractions of the image). */
export function readShop(canvas, region) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rx = Math.round(region.x * canvas.width);
  const ry = Math.round(region.y * canvas.height);
  const rw = Math.round(region.w * canvas.width);
  const rh = Math.round(region.h * canvas.height);
  const slotW = rw / 5;
  const slots = [];
  for (let i = 0; i < 5; i++) {
    const box = {
      x: Math.max(0, Math.round(rx + i * slotW)),
      y: Math.max(0, ry),
      w: Math.max(1, Math.min(canvas.width - Math.round(rx + i * slotW), Math.round(slotW))),
      h: Math.max(1, Math.min(canvas.height - ry, rh)),
    };
    if (box.x >= canvas.width || box.y >= canvas.height) {
      slots.push({ slot: i, cost: null, confidence: 0, empty: true, box });
      continue;
    }
    const result = classifyCost(sampleFrame(ctx, box));
    slots.push({ slot: i, ...result, box, champion: null });
  }
  return slots;
}

/**
 * Try to locate the shop bar automatically by finding the widest band of
 * saturated colour in the lower part of the image. Falls back to the saved
 * calibration when nothing convincing turns up.
 */
// A shop bar is a band of this rough height relative to the whole screen.
// Anything outside the range is playfield or HUD, not the shop.
const MIN_BAR_H = 0.07, MAX_BAR_H = 0.26;

export function autoDetectShopBar(canvas, fallback) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const W = canvas.width, H = canvas.height;
  // Only the bottom slice — the playfield above is full of saturated unit art
  // that otherwise swamps the signal.
  const top = Math.round(H * 0.70);
  const rows = H - top;
  if (rows < 8) return { ...fallback, auto: false };
  const stripe = ctx.getImageData(0, top, W, rows).data;
  const step = Math.max(1, Math.round(W / 220));
  const perRow = Math.ceil(W / step);

  const rowScore = new Array(rows).fill(0);
  for (let y = 0; y < rows; y++) {
    let score = 0;
    for (let x = 0; x < W; x += step) {
      const i = ((y * W) + x) * 4;
      const { s, v } = rgbToHsv(stripe[i], stripe[i + 1], stripe[i + 2]);
      if (s > 0.35 && v > 0.25) score++;
    }
    rowScore[y] = score;
  }

  const maxScore = Math.max(...rowScore);
  if (maxScore < perRow * 0.10) return { ...fallback, auto: false };

  // Take the strongest CONTIGUOUS run above threshold rather than the outer
  // extent, so scattered bright rows elsewhere can't stretch the band.
  //
  // The threshold is deliberately low: a shop card is a coloured FRAME, so
  // rows through the middle of a card only light up its thin left/right
  // edges. A high threshold would find just the nameplate strip and reject
  // it as too thin.
  const threshold = Math.max(perRow * 0.03, maxScore * 0.18);
  let best = null, run = null;
  for (let y = 0; y <= rows; y++) {
    const on = y < rows && rowScore[y] >= threshold;
    if (on) {
      run ??= { start: y, total: 0 };
      run.total += rowScore[y];
      run.end = y;
    } else if (run) {
      if (!best || run.total > best.total) best = run;
      run = null;
    }
  }
  if (!best) return { ...fallback, auto: false };

  const height = (best.end - best.start + 1) / H;
  if (height < MIN_BAR_H || height > MAX_BAR_H) return { ...fallback, auto: false };

  // Pad slightly — the threshold clips the frame's soft edges.
  const pad = height * 0.06;
  const yTop = Math.max(0, (top + best.start) / H - pad);
  // Keep the horizontal extent from calibration; the vertical band is what
  // this reliably finds.
  return {
    x: fallback.x, w: fallback.w,
    y: yTop, h: Math.min(1 - yTop, height + pad * 2),
    auto: true,
  };
}
