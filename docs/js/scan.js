// The Scan tab: read a screenshot, confirm the shop, get the optimal play.

import { CHAMPIONS, ALL_CHAMPIONS, COST_COLORS, costOf } from "./roster.js";
import { recommend, evaluate, shopAdvice, pct, CONTEST_LEVELS } from "./odds.js";
import { COMPS } from "./data.js";
import {
  imageFromFile, toCanvas, readShop, autoDetectShopBar,
  loadCalibration, saveCalibration, resetCalibration,
} from "./vision.js";

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const STATE_KEY = "ftt-scan-state";

const state = {
  region: loadCalibration(),
  canvas: null,
  imageURL: null,
  slots: [],
  autoDetected: false,
  calibrating: false,
  level: 8, gold: 50, xp: 0, stage: 4, health: 70,
  target: "", owned: 0, contested: "none", need: 1,
  compId: COMPS[0]?.id || null,
};

function persist() {
  const { level, gold, xp, stage, health, target, owned, contested, need, compId } = state;
  localStorage.setItem(STATE_KEY, JSON.stringify({ level, gold, xp, stage, health, target, owned, contested, need, compId }));
}
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (saved && typeof saved === "object") Object.assign(state, saved);
  } catch { /* keep defaults */ }
}

// ---------------------------------------------------------------------------
// Screenshot handling
// ---------------------------------------------------------------------------
async function handleFile(file) {
  const status = $("#scan-status");
  if (!file || !file.type.startsWith("image/")) {
    status.innerHTML = `<div class="error-box">That file isn't an image.</div>`;
    return;
  }
  status.innerHTML = `<div class="note">Reading screenshot…</div>`;
  try {
    const img = await imageFromFile(file);
    state.canvas = toCanvas(img);
    if (state.imageURL) URL.revokeObjectURL(state.imageURL);
    state.imageURL = state.canvas.toDataURL("image/jpeg", 0.85);

    const auto = autoDetectShopBar(state.canvas, state.region);
    state.autoDetected = !!auto.auto;
    if (auto.auto) {
      state.region = { x: auto.x, y: auto.y, w: auto.w, h: auto.h };
      saveCalibration(state.region);
    }
    rescan();
    status.innerHTML = state.autoDetected
      ? `<div class="note">Found the shop bar automatically. If the boxes below don't line up with your 5 cards, tap <strong>Adjust shop region</strong>.</div>`
      : `<div class="note">Couldn't locate the shop bar confidently — using your saved region. Tap <strong>Adjust shop region</strong> to line it up once; it's remembered after that.</div>`;
  } catch (err) {
    status.innerHTML = `<div class="error-box">${esc(err.message)}</div>`;
  }
}

function rescan() {
  if (!state.canvas) return;
  const previous = state.slots.map((s) => s.champion);
  state.slots = readShop(state.canvas, state.region);
  // Keep any champion the user already picked for a slot whose cost is unchanged.
  state.slots.forEach((s, i) => {
    if (previous[i] && costOf(previous[i]) === s.cost) s.champion = previous[i];
  });
  render();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function championOptions(detectedCost, selected) {
  const groups = [];
  const order = detectedCost
    ? [detectedCost, ...[1, 2, 3, 4, 5].filter((c) => c !== detectedCost)]
    : [1, 2, 3, 4, 5];
  for (const cost of order) {
    const label = cost === detectedCost ? `${cost}-cost (detected)` : `${cost}-cost`;
    const opts = CHAMPIONS[cost].map((name) =>
      `<option value="${esc(name)}" ${name === selected ? "selected" : ""}>${esc(name)}</option>`).join("");
    groups.push(`<optgroup label="${label}">${opts}</optgroup>`);
  }
  return `<option value="" ${!selected ? "selected" : ""}>— pick champion —</option>${groups.join("")}`;
}

function renderPreview() {
  const wrap = $("#scan-preview");
  if (!state.canvas) { wrap.innerHTML = ""; return; }
  const r = state.region;
  const guides = Array.from({ length: 4 }, (_, i) =>
    `<div class="slot-guide" style="left:${((i + 1) / 5) * 100}%"></div>`).join("");
  wrap.innerHTML = `
    <div class="shot-wrap ${state.calibrating ? "calibrating" : ""}" id="shot-wrap">
      <img src="${state.imageURL}" alt="Your TFT screenshot with the detected shop region outlined" />
      <div class="region-box" id="region-box"
           style="left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%">
        ${guides}
        ${state.calibrating ? '<div class="region-handle" id="region-handle"></div>' : ""}
      </div>
    </div>
    <div class="row-btns">
      <button class="btn secondary" id="btn-calibrate">${state.calibrating ? "Done adjusting" : "Adjust shop region"}</button>
      <button class="btn secondary" id="btn-reset-region">Reset region</button>
    </div>
    ${state.calibrating ? '<p class="note">Drag the box over your 5 shop cards; drag the corner to resize. The dividers show where the app splits the slots. Saved automatically.</p>' : ""}`;

  $("#btn-calibrate").addEventListener("click", () => {
    state.calibrating = !state.calibrating;
    render();
  });
  $("#btn-reset-region").addEventListener("click", () => {
    state.region = resetCalibration();
    rescan();
  });
  if (state.calibrating) bindRegionDrag();
}

function bindRegionDrag() {
  const wrap = $("#shot-wrap"), box = $("#region-box"), handle = $("#region-handle");
  if (!wrap || !box) return;
  let mode = null, startX = 0, startY = 0, origin = null;

  const begin = (e, which) => {
    mode = which;
    origin = { ...state.region };
    startX = e.clientX; startY = e.clientY;
    box.setPointerCapture?.(e.pointerId);
    e.preventDefault(); e.stopPropagation();
  };
  const move = (e) => {
    if (!mode) return;
    const rect = wrap.getBoundingClientRect();
    const dx = (e.clientX - startX) / rect.width;
    const dy = (e.clientY - startY) / rect.height;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (mode === "move") {
      state.region = {
        ...origin,
        x: clamp(origin.x + dx, 0, 1 - origin.w),
        y: clamp(origin.y + dy, 0, 1 - origin.h),
      };
    } else {
      state.region = {
        ...origin,
        w: clamp(origin.w + dx, 0.15, 1 - origin.x),
        h: clamp(origin.h + dy, 0.04, 1 - origin.y),
      };
    }
    box.style.left = `${state.region.x * 100}%`;
    box.style.top = `${state.region.y * 100}%`;
    box.style.width = `${state.region.w * 100}%`;
    box.style.height = `${state.region.h * 100}%`;
    e.preventDefault();
  };
  const end = () => {
    if (!mode) return;
    mode = null;
    saveCalibration(state.region);
    rescan();
  };

  box.addEventListener("pointerdown", (e) => begin(e, "move"));
  handle?.addEventListener("pointerdown", (e) => begin(e, "resize"));
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function renderSlots() {
  const el = $("#scan-slots");
  if (!state.slots.length) {
    el.innerHTML = `<p class="note">No screenshot loaded — you can still fill in your state below and get a verdict.</p>`;
    return;
  }
  const comp = COMPS.find((c) => c.id === state.compId);
  const advice = shopAdvice(state.slots, { comp, level: state.level, gold: state.gold });
  el.innerHTML = state.slots.map((s, i) => {
    const color = s.cost ? COST_COLORS[s.cost].css : "#4a4a47";
    if (s.empty) {
      return `<div class="slot-card empty"><div class="slot-head"><span class="slot-n">${i + 1}</span>
        <span class="slot-cost" style="background:#4a4a47">bought</span></div>
        <div class="slot-why">Slot already purchased or empty.</div></div>`;
    }
    const a = advice[i];
    return `<div class="slot-card">
      <div class="slot-head">
        <span class="slot-n">${i + 1}</span>
        <span class="slot-cost" style="background:${color};color:${s.cost === 5 || s.cost === 1 ? "#1a1400" : "#fff"}">${s.cost}-cost</span>
        <span class="slot-conf">${Math.round(s.confidence * 100)}% sure</span>
      </div>
      <select class="slot-pick" data-slot="${i}">${championOptions(s.cost, s.champion)}</select>
      <div class="slot-why verdict-${a.verdict}">${esc(a.why)}</div>
    </div>`;
  }).join("");

  el.querySelectorAll(".slot-pick").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const i = Number(e.target.dataset.slot);
      state.slots[i].champion = e.target.value || null;
      // Trusting the user's pick over the colour read.
      if (e.target.value) state.slots[i].cost = costOf(e.target.value) ?? state.slots[i].cost;
      render();
    });
  });
}

function renderVerdict() {
  const el = $("#scan-verdict");
  const target = state.target;
  if (!target) {
    el.innerHTML = `<div class="card"><div class="body">Pick the unit you're hunting above to get the roll / level / save verdict with real numbers.</div></div>`;
    return;
  }
  const cost = costOf(target);
  if (!cost) { el.innerHTML = `<div class="error-box">Unknown champion.</div>`; return; }

  const rec = recommend({
    cost, level: state.level, xp: state.xp, gold: state.gold, owned: state.owned,
    contested: state.contested, stage: state.stage, need: state.need, health: state.health,
  });
  const single = evaluate({ cost, level: state.level, gold: state.gold, reserve: 0,
    owned: state.owned, contested: state.contested, stage: state.stage, need: state.need });

  const rows = rec.options
    .slice()
    .sort((a, b) => b.chance - a.chance)
    .map((o) => `<tr class="${o.key === rec.best.key ? "best" : ""}">
        <td>${esc(o.label)}</td>
        <td class="num">${o.key === "save" ? "—" : pct(o.chance)}</td>
      </tr>`).join("");

  el.innerHTML = `
    <div class="verdict-card">
      <div class="verdict-label">Best play</div>
      <div class="verdict-action">${esc(rec.best.label)}</div>
      <div class="verdict-chance">${rec.best.key === "save" ? "Hold your gold" : `${pct(rec.best.chance)} to hit ${esc(target)}`}</div>
      <div class="verdict-why">${esc(rec.why)}</div>
    </div>
    <div class="card" style="padding:6px 4px">
      <table class="data"><thead><tr><th>Option</th><th class="num">Chance</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>
    <div class="card">
      <h3>The numbers</h3>
      <dl class="kv">
        <dt>Per shop</dt><dd>${pct(single.perShop)} chance ${esc(target)} appears in any given shop</dd>
        <dt>Copies left</dt><dd>${single.copiesLeft} of ${cost === 1 ? 30 : cost === 2 ? 25 : cost === 3 ? 18 : cost === 4 ? 10 : 9} in the pool${single.takenByOthers ? ` (${single.takenByOthers} assumed held by rivals)` : ""}</dd>
        <dt>Expected</dt><dd>${single.expectedCopies.toFixed(1)} copies seen if you spend all ${state.gold}g</dd>
        <dt>Need</dt><dd>${state.need} more ${state.need === 1 ? "copy" : "copies"}</dd>
      </dl>
      <div class="body"><strong>Caveat:</strong> this scores your chance of finding <em>this specific unit</em>. Leveling also makes your whole board stronger and opens other units, which the number above doesn't capture — when it's close, level.</div>
    </div>`;
}

function render() {
  renderPreview();
  renderSlots();
  renderVerdict();
  persist();
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
export function initScan() {
  restore();

  $("#scan-file").addEventListener("change", (e) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  });
  window.addEventListener("paste", (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) handleFile(item.getAsFile());
  });

  // Numeric state controls
  const numFields = [
    ["#s-level", "level", 1, 11], ["#s-gold", "gold", 0, 999],
    ["#s-xp", "xp", 0, 200], ["#s-stage", "stage", 1, 7], ["#s-health", "health", 1, 100],
  ];
  for (const [sel, key, lo, hi] of numFields) {
    const input = $(sel);
    input.value = state[key];
    input.addEventListener("input", () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) state[key] = Math.max(lo, Math.min(hi, v));
      render();
    });
  }

  const targetSel = $("#s-target");
  targetSel.innerHTML = `<option value="">— pick the unit you want —</option>` +
    [1, 2, 3, 4, 5].map((cost) =>
      `<optgroup label="${cost}-cost">` +
      CHAMPIONS[cost].map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("") +
      `</optgroup>`).join("");
  targetSel.value = state.target || "";
  targetSel.addEventListener("change", () => { state.target = targetSel.value; render(); });

  const ownedSel = $("#s-owned");
  ownedSel.innerHTML = Array.from({ length: 9 }, (_, i) =>
    `<option value="${i}">${i}</option>`).join("");
  ownedSel.value = state.owned;
  ownedSel.addEventListener("change", () => {
    state.owned = Number(ownedSel.value);
    // Hunting a 2-star needs 3 copies, a 3-star needs 9.
    const nextGoal = state.owned < 3 ? 3 : 9;
    state.need = Math.max(1, nextGoal - state.owned);
    $("#s-need").value = state.need;
    render();
  });

  const needSel = $("#s-need");
  needSel.innerHTML = Array.from({ length: 9 }, (_, i) =>
    `<option value="${i + 1}">${i + 1}</option>`).join("");
  needSel.value = state.need;
  needSel.addEventListener("change", () => { state.need = Number(needSel.value); render(); });

  const contestSel = $("#s-contested");
  contestSel.innerHTML = Object.entries(CONTEST_LEVELS).map(([key, v]) =>
    `<option value="${key}">${esc(v.label)}</option>`).join("");
  contestSel.value = state.contested;
  contestSel.addEventListener("change", () => { state.contested = contestSel.value; render(); });

  const compSel = $("#s-comp");
  compSel.innerHTML = COMPS.map((c) =>
    `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  compSel.value = state.compId || COMPS[0].id;
  compSel.addEventListener("change", () => { state.compId = compSel.value; render(); });

  render();
}
