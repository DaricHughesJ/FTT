// Match analysis: Riot TFT API client + SVG charts.
// Riot's API does not send CORS headers, so browser calls must go through a
// proxy (see /proxy in the repo). Settings are stored in localStorage.

import { DEMO_MATCHES } from "./data.js";

const LS_KEY = "ftt-settings";

export function loadSettings() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; }
  catch { return {}; }
}
export function saveSettings(s) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

// Platform region -> regional routing host used by account-v1 / tft-match-v1
export const REGIONS = {
  na1: "americas", br1: "americas", la1: "americas", la2: "americas",
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe", me1: "europe",
  kr: "asia", jp1: "asia",
  oc1: "sea", ph2: "sea", sg2: "sea", th2: "sea", tw2: "sea", vn2: "sea",
};

async function riot(proxy, host, path, apiKey) {
  const base = proxy.replace(/\/+$/, "");
  const res = await fetch(`${base}/${host}${path}`, {
    headers: apiKey ? { "X-Riot-Token": apiKey } : {},
  });
  if (!res.ok) {
    const detail = res.status === 401 || res.status === 403
      ? "API key missing, expired, or not sent by the proxy."
      : res.status === 429 ? "Rate limited — wait a minute and retry."
      : res.status === 404 ? "Not found — check the Riot ID and region."
      : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return res.json();
}

// Fetch last `count` TFT matches for a Riot ID. Returns simplified match rows.
export async function fetchMatches({ proxy, apiKey, gameName, tagLine, region, count = 20 }) {
  const routing = REGIONS[region] || "americas";
  const account = await riot(proxy, routing,
    `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    apiKey);
  const ids = await riot(proxy, routing,
    `/tft/match/v1/matches/by-puuid/${account.puuid}/ids?count=${count}`, apiKey);
  const rows = [];
  for (const id of ids) {
    const m = await riot(proxy, routing, `/tft/match/v1/matches/${id}`, apiKey);
    const me = m.info.participants.find((p) => p.puuid === account.puuid);
    if (!me) continue;
    const topTraits = (me.traits || [])
      .filter((t) => t.tier_current > 0)
      .sort((a, b) => b.num_units - a.num_units)
      .slice(0, 2)
      .map((t) => `${cleanName(t.name)} ${t.num_units}`);
    rows.push({
      placement: me.placement,
      level: me.level,
      round: roundLabel(me.last_round),
      comp: topTraits[0] ? cleanName(topTraits[0].replace(/ \d+$/, "")) : "—",
      traits: topTraits,
      when: m.info.game_datetime,
    });
  }
  // newest first from the API; charts want oldest -> newest
  return rows.reverse();
}

function cleanName(s) { return String(s).replace(/^TFT\d+_/i, "").replace(/_/g, " "); }
function roundLabel(r) {
  if (!r || r < 1) return "—";
  // rounds 1-3 are stage 1; each later stage has 7 rounds
  if (r <= 3) return `1-${r}`;
  const rr = r - 3;
  return `${Math.floor((rr - 1) / 7) + 2}-${((rr - 1) % 7) + 1}`;
}

export function demoMatches() { return DEMO_MATCHES.slice(); }

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
export function computeStats(matches) {
  const n = matches.length;
  if (!n) return null;
  const places = matches.map((m) => m.placement);
  const avg = places.reduce((a, b) => a + b, 0) / n;
  const top4 = places.filter((p) => p <= 4).length;
  const wins = places.filter((p) => p === 1).length;
  const half = Math.floor(n / 2);
  const avgRecent = half ? places.slice(half).reduce((a, b) => a + b, 0) / (n - half) : avg;
  const avgOlder = half ? places.slice(0, half).reduce((a, b) => a + b, 0) / half : avg;
  const dist = Array.from({ length: 8 }, (_, i) => places.filter((p) => p === i + 1).length);
  const byComp = {};
  for (const m of matches) {
    (byComp[m.comp] ||= { games: 0, sum: 0 });
    byComp[m.comp].games++; byComp[m.comp].sum += m.placement;
  }
  const comps = Object.entries(byComp)
    .map(([comp, v]) => ({ comp, games: v.games, avg: v.sum / v.games }))
    .sort((a, b) => a.avg - b.avg);
  return { n, avg, top4, wins, avgRecent, avgOlder, dist, comps };
}

// ---------------------------------------------------------------------------
// Charts (inline SVG, dark surface, tap tooltips)
// ---------------------------------------------------------------------------
const INK2 = "#c3c2b7", MUTED = "#898781", GRID = "#2c2c2a", BASE = "#383835";
const ACCENT = "#3987e5", DEEMPH = "#4a4a47", SURFACE = "#1a1a19";

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// Placement trend: single-series line, y inverted (1st on top), no legend.
export function trendChart(matches) {
  const W = 360, H = 190, L = 30, R = 12, T = 14, B = 26;
  const iw = W - L - R, ih = H - T - B;
  const n = matches.length;
  const x = (i) => L + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (p) => T + ((p - 1) / 7) * ih; // place 1 top, 8 bottom
  let grid = "", labels = "";
  for (const p of [1, 4, 8]) {
    grid += `<line x1="${L}" y1="${y(p)}" x2="${W - R}" y2="${y(p)}" stroke="${GRID}" stroke-width="1"/>`;
    labels += `<text x="${L - 7}" y="${y(p) + 4}" fill="${MUTED}" font-size="10" text-anchor="end">${p}${p === 1 ? "st" : "th"}</text>`;
  }
  const pts = matches.map((m, i) => [x(i), y(m.placement)]);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  // markers: 8px (r=4) with 2px surface ring; last point labeled
  const dots = pts.map((p, i) =>
    `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4" fill="${ACCENT}" stroke="${SURFACE}" stroke-width="2"
       data-tip="${esc(matches[i].comp)} — ${ordinal(matches[i].placement)}" data-i="${i}"/>`).join("");
  const last = matches[n - 1];
  const endLabel = `<text x="${(pts[n - 1][0] - 2).toFixed(1)}" y="${(pts[n - 1][1] - 9).toFixed(1)}"
      fill="${INK2}" font-size="11" font-weight="600" text-anchor="end">${ordinal(last.placement)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Placement per match, oldest to newest">
    ${grid}${labels}
    <line x1="${L}" y1="${T + ih}" x2="${W - R}" y2="${T + ih}" stroke="${BASE}" stroke-width="1"/>
    <path d="${path}" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${endLabel}
    <text x="${L}" y="${H - 8}" fill="${MUTED}" font-size="10">oldest</text>
    <text x="${W - R}" y="${H - 8}" fill="${MUTED}" font-size="10" text-anchor="end">newest</text>
  </svg>`;
}

// Placement distribution: columns; top-4 in accent, 5-8 in de-emphasis gray
// (emphasis form — "top 4" is the story). Direct count labels on caps.
export function distChart(dist) {
  const W = 360, H = 170, L = 12, R = 12, T = 20, B = 24;
  const iw = W - L - R, ih = H - T - B;
  const max = Math.max(...dist, 1);
  const slot = iw / 8, bw = Math.min(24, slot - 8);
  let bars = "";
  dist.forEach((c, i) => {
    const bh = Math.max(c === 0 ? 0 : 3, (c / max) * ih);
    const bx = L + i * slot + (slot - bw) / 2;
    const by = T + ih - bh;
    const fill = i < 4 ? ACCENT : DEEMPH;
    bars += `<path d="M${bx},${T + ih} L${bx},${by + 4} Q${bx},${by} ${bx + 4},${by}
        L${bx + bw - 4},${by} Q${bx + bw},${by} ${bx + bw},${by + 4} L${bx + bw},${T + ih} Z"
        fill="${fill}" data-tip="${ordinal(i + 1)}: ${c} game${c === 1 ? "" : "s"}"/>`;
    if (c > 0) bars += `<text x="${bx + bw / 2}" y="${by - 5}" fill="${INK2}" font-size="10.5" font-weight="600" text-anchor="middle">${c}</text>`;
    bars += `<text x="${bx + bw / 2}" y="${H - 8}" fill="${MUTED}" font-size="10" text-anchor="middle">${i + 1}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Placement distribution">
    <line x1="${L}" y1="${T + ih}" x2="${W - R}" y2="${T + ih}" stroke="${BASE}" stroke-width="1"/>
    ${bars}
  </svg>`;
}

function ordinal(p) { return p + (["st", "nd", "rd"][p - 1] || "th"); }

// Tap-to-tooltip for chart marks
export function bindChartTips(container) {
  let tip = null;
  const clear = () => { tip?.remove(); tip = null; };
  container.addEventListener("click", (e) => {
    const mark = e.target.closest("[data-tip]");
    clear();
    if (!mark) return;
    const wrap = mark.closest(".chart-wrap");
    if (!wrap) return;
    tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.textContent = mark.dataset.tip;
    const wr = wrap.getBoundingClientRect();
    const mr = mark.getBoundingClientRect();
    tip.style.left = `${mr.left + mr.width / 2 - wr.left}px`;
    tip.style.top = `${mr.top - wr.top}px`;
    wrap.appendChild(tip);
    setTimeout(clear, 2500);
  });
}
