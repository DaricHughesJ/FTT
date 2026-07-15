import { META, TRAITS, COMPS, COMPONENTS, COMBOS, ITEM_ARCHETYPES, STAGES, ECON_RULES, AUGMENT_GUIDE } from "./data.js";
import { loadSettings, saveSettings, fetchMatches, demoMatches, computeStats, trendChart, distChart, bindChartTips, REGIONS } from "./analysis.js";

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
const TABS = ["coach", "comps", "items", "traits", "analysis"];
function showTab(name) {
  for (const t of TABS) {
    $(`#view-${t}`).classList.toggle("active", t === name);
    $(`#tab-${t}`).classList.toggle("on", t === name);
  }
  window.scrollTo(0, 0);
  localStorage.setItem("ftt-tab", name);
}
for (const t of TABS) $(`#tab-${t}`).addEventListener("click", () => showTab(t));

// ---------------------------------------------------------------------------
// Coach tab — stage selector + guide
// ---------------------------------------------------------------------------
function renderCoach() {
  const seg = $("#stage-seg");
  seg.innerHTML = STAGES.map((s, i) =>
    `<button data-i="${i}" class="${i === 0 ? "on" : ""}">${esc(s.stage)}</button>`).join("");
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    seg.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
    renderStage(+b.dataset.i);
  });
  renderStage(0);

  $("#econ-rules").innerHTML = ECON_RULES.map((r) => `
    <div class="card"><h3>${esc(r.rule)}</h3><div class="body">${esc(r.detail)}</div></div>`).join("");
  $("#augment-guide").innerHTML = AUGMENT_GUIDE.map((a) => `
    <div class="card"><h3>${esc(a.pick)}</h3><div class="body">${esc(a.advice)}</div></div>`).join("");
}

function renderStage(i) {
  const s = STAGES[i];
  $("#stage-detail").innerHTML = `
    <div class="card">
      <h3>${esc(s.stage)} <span class="badge style">${esc(s.label)}</span></h3>
      <dl class="kv">
        <dt>Goal</dt><dd>${esc(s.goal)}</dd>
        <dt>Econ</dt><dd>${esc(s.econ)}</dd>
        <dt>Leveling</dt><dd>${esc(s.level)}</dd>
      </dl>
      <div class="body">${esc(s.detail)}</div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Comps tab
// ---------------------------------------------------------------------------
function renderComps() {
  $("#comps-list").innerHTML = COMPS.map((c) => `
    <div class="card tappable" data-id="${c.id}">
      <h3><span class="badge ${c.tier}">${c.tier}</span> ${esc(c.name)}
        <span class="badge style">${esc(c.style)}</span><span class="chev">▶</span></h3>
      <div class="sub">${esc(c.carries.map((x) => x.unit).join(" · "))} — ${esc(c.difficulty)}</div>
      <div class="detail body">
        ${c.carries.map((x) => `<div class="row"><strong>${esc(x.unit)}:</strong> ${x.items.map((i) => `<span class="pill item">${esc(i)}</span>`).join("")}</div>`).join("")}
        <div class="row"><strong>Core:</strong> ${c.core.map((u) => `<span class="pill">${esc(u)}</span>`).join("")}</div>
        <div class="row"><strong>Game plan:</strong> ${esc(c.plan)}</div>
        <div class="row"><strong>Positioning:</strong> ${esc(c.positioning)}</div>
        <div class="row"><strong>Notes:</strong> ${esc(c.notes)}</div>
      </div>
    </div>`).join("");
  $("#comps-list").addEventListener("click", (e) => {
    const card = e.target.closest(".card"); if (card) card.classList.toggle("open");
  });
}

// ---------------------------------------------------------------------------
// Items tab — tap two components
// ---------------------------------------------------------------------------
let picked = [];
function renderItems() {
  const grid = $("#component-grid");
  grid.innerHTML = COMPONENTS.map((c) =>
    `<button data-id="${c.id}">${esc(c.name)}<br><small style="color:var(--muted);font-weight:500">${esc(c.stat)}</small></button>`).join("");
  grid.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    // Keep the last two taps; tapping the same component twice = its double.
    picked = [...picked, b.dataset.id].slice(-2);
    grid.querySelectorAll("button").forEach((x) =>
      x.classList.toggle("sel", picked.includes(x.dataset.id)));
    renderCombo();
  });
  $("#item-archetypes").innerHTML = ITEM_ARCHETYPES.map((a) => `
    <div class="card"><h3>${esc(a.arch)}</h3>
      <div class="body">${a.items.map((i) => `<span class="pill item">${esc(i)}</span>`).join("")}</div>
    </div>`).join("");
}

function renderCombo() {
  const out = $("#combo-result");
  if (picked.length < 2) {
    out.innerHTML = `<div class="combo-hint">Tap two components (tap one twice for its double) to see what they build.</div>`;
    return;
  }
  const key = [...picked].sort().join("+");
  const combo = COMBOS[key];
  if (!combo) {
    out.innerHTML = `<div class="combo-hint">Spatula combos other than Spatula+Spatula make set-specific emblems — check in-game.</div>`;
    return;
  }
  const names = picked.map((id) => COMPONENTS.find((c) => c.id === id).name);
  out.innerHTML = `<div class="combo-result">
    <div class="sub" style="color:var(--muted);font-size:12px">${esc(names[0])} + ${esc(names[1])}</div>
    <div class="name">${esc(combo.name)}</div>
    <div class="use">${esc(combo.use)}</div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Traits tab
// ---------------------------------------------------------------------------
function renderTraits() {
  const html = (kind) => TRAITS.filter((t) => t.kind === kind).map((t) => `
    <div class="card">
      <h3>${esc(t.name)}</h3>
      <div class="sub">${esc(t.units)}</div>
      <div class="body">${esc(t.desc)}<div class="row"><strong>Tip:</strong> ${esc(t.tip)}</div></div>
    </div>`).join("");
  $("#traits-origins").innerHTML = html("origin");
  $("#traits-classes").innerHTML = html("class");
}

// ---------------------------------------------------------------------------
// Analysis tab
// ---------------------------------------------------------------------------
function renderAnalysisSettings() {
  const s = loadSettings();
  $("#f-name").value = s.gameName || "";
  $("#f-tag").value = s.tagLine || "";
  $("#f-region").innerHTML = Object.keys(REGIONS).map((r) =>
    `<option value="${r}" ${s.region === r ? "selected" : ""}>${r.toUpperCase()}</option>`).join("");
  $("#f-proxy").value = s.proxy || "";
  $("#f-key").value = s.apiKey || "";
}

async function runAnalysis(demo) {
  const status = $("#analysis-status");
  const results = $("#analysis-results");
  status.innerHTML = "";
  let matches;
  if (demo) {
    matches = demoMatches();
    status.innerHTML = `<div class="note">Showing <strong>demo data</strong> — configure the Riot API below to see your real matches.</div>`;
  } else {
    const s = {
      gameName: $("#f-name").value.trim(),
      tagLine: $("#f-tag").value.trim().replace(/^#/, ""),
      region: $("#f-region").value,
      proxy: $("#f-proxy").value.trim(),
      apiKey: $("#f-key").value.trim(),
    };
    saveSettings(s);
    if (!s.gameName || !s.tagLine) { status.innerHTML = `<div class="error-box">Enter your Riot ID (name + tag).</div>`; return; }
    if (!s.proxy) { status.innerHTML = `<div class="error-box">A proxy URL is required — Riot's API blocks direct browser calls. Deploy the free Cloudflare Worker in this repo's <strong>proxy/</strong> folder (5&nbsp;min), then paste its URL here.</div>`; return; }
    status.innerHTML = `<div class="note">Fetching matches… (20 matches ≈ 21 API calls; dev keys may rate-limit briefly)</div>`;
    try {
      matches = await fetchMatches({ ...s, count: 20 });
    } catch (err) {
      status.innerHTML = `<div class="error-box">Fetch failed: ${esc(err.message)}</div>`;
      return;
    }
    status.innerHTML = "";
  }

  const st = computeStats(matches);
  if (!st) { results.innerHTML = `<div class="note">No matches found.</div>`; return; }
  const deltaAvg = st.avgOlder - st.avgRecent; // positive = improving
  results.innerHTML = `
    <div class="kpi-row">
      <div class="tile"><div class="label">Avg placement</div><div class="value">${st.avg.toFixed(2)}</div>
        <div class="delta ${deltaAvg >= 0 ? "up" : "down"}">${deltaAvg >= 0 ? "▲" : "▼"} ${Math.abs(deltaAvg).toFixed(2)} vs first half</div></div>
      <div class="tile"><div class="label">Top-4 rate</div><div class="value">${Math.round((st.top4 / st.n) * 100)}%</div>
        <div class="delta">${st.top4} of ${st.n} games</div></div>
      <div class="tile"><div class="label">Wins</div><div class="value">${st.wins}</div>
        <div class="delta">${Math.round((st.wins / st.n) * 100)}% win rate</div></div>
      <div class="tile"><div class="label">Games</div><div class="value">${st.n}</div>
        <div class="delta">last ${st.n} ranked/normal</div></div>
    </div>
    <div class="chart-card"><div class="title">Placement trend</div>
      <div class="subtitle">Last ${st.n} games, oldest → newest · tap a point for details</div>
      <div class="chart-wrap">${trendChart(matches)}</div></div>
    <div class="chart-card"><div class="title">Placement distribution</div>
      <div class="subtitle">Blue = top-4 finishes · tap a bar for count</div>
      <div class="chart-wrap">${distChart(st.dist)}</div></div>
    <h2>Your comps, ranked</h2>
    <div class="card" style="padding:6px 4px">
      <table class="data"><thead><tr><th>Avg</th><th>Comp / lead trait</th><th>Games</th></tr></thead>
      <tbody>${st.comps.map((c) => `<tr><td>${c.avg.toFixed(1)}</td><td>${esc(c.comp)}</td><td>${c.games}</td></tr>`).join("")}</tbody>
      </table></div>
    <h2>Match list</h2>
    <div class="card" style="padding:6px 4px">
      <table class="data"><thead><tr><th>Place</th><th>Comp</th><th>Lvl</th><th>Out</th></tr></thead>
      <tbody>${[...matches].reverse().map((m) => `<tr><td>${m.placement}</td><td>${esc(m.comp)}</td><td>${m.level}</td><td>${esc(m.round)}</td></tr>`).join("")}</tbody>
      </table></div>`;
  bindChartTips(results);
}

$("#btn-fetch").addEventListener("click", () => runAnalysis(false));
$("#btn-demo").addEventListener("click", () => runAnalysis(true));

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
$("#patch-label").textContent = `Set ${META.set} · ${META.setName} · ${META.patch}`;
renderCoach();
renderComps();
renderItems();
renderCombo();
renderTraits();
renderAnalysisSettings();
runAnalysis(true);
showTab(localStorage.getItem("ftt-tab") || "coach");

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
