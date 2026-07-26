// Set 17 "Space Gods" roster, shop odds, and pool constants.
// Everything the odds engine needs lives here so a patch update is one file.
//
// SOURCING NOTE: the odds/pool tables below are well-attested for Set 17.
// The champion cost assignments were reconciled from several community
// sources that disagreed on a handful of units; the Scan tab lets you
// correct any unit inline and remembers it, and CHAMPIONS is trivial to
// edit directly. Verify against the in-game roster when convenient.

export const SET = 17;

// Shop odds: percent chance a single shop slot rolls each cost tier.
// Index 0 = 1-cost ... index 4 = 5-cost. Each row sums to 100.
export const SHOP_ODDS = {
  1:  [100, 0, 0, 0, 0],
  2:  [100, 0, 0, 0, 0],
  3:  [75, 25, 0, 0, 0],
  4:  [55, 30, 15, 0, 0],
  5:  [45, 30, 20, 5, 0],
  6:  [30, 35, 25, 10, 0],
  7:  [19, 35, 30, 15, 1],
  8:  [18, 25, 32, 22, 3],
  9:  [10, 20, 25, 35, 10],
  10: [5, 10, 20, 40, 25],
  11: [1, 2, 12, 40, 45],
};

// Copies of EACH champion in the shared pool, by cost.
export const POOL_COPIES = { 1: 30, 2: 25, 3: 18, 4: 10, 5: 9 };

// Cumulative XP required to reach each level, and XP gained per 4 gold bought.
export const XP_TO_LEVEL = { 2: 2, 3: 6, 4: 10, 5: 20, 6: 36, 7: 48, 8: 76, 9: 84, 10: 100 };
export const XP_PER_BUY = 4;
export const GOLD_PER_BUY = 4;
export const XP_PER_ROUND = 2;
export const ROLL_COST = 2;

export const CHAMPIONS = {
  1: ["Briar", "Caitlyn", "Cho'Gath", "Ezreal", "Leona", "Lissandra", "Nasus",
      "Poppy", "Rek'Sai", "Talon", "Teemo", "Twisted Fate", "Veigar"],
  2: ["Akali", "Bel'Veth", "Gnar", "Gragas", "Gwen", "Jax", "Jinx", "Meepsie",
      "Milio", "Mordekaiser", "Pantheon", "Pyke"],
  3: ["Aurora", "Diana", "Fizz", "Illaoi", "Kai'Sa", "Lulu", "Maokai",
      "Miss Fortune", "Ornn", "Rhaast", "Samira", "Urgot", "Viktor", "Zoe"],
  4: ["Aurelion Sol", "Corki", "Kindred", "Karma", "LeBlanc", "Master Yi",
      "Morgana", "Nami", "Nunu", "Rammus", "Riven", "Tahm Kench",
      "The Mighty Mech", "Xayah"],
  5: ["Bard", "Blitzcrank", "Fiora", "Graves", "Jhin", "Shen", "Sona", "Vex", "Zed"],
};

// Distinct champions per tier — derived so it can never drift from the roster.
export const TIER_SIZE = Object.fromEntries(
  Object.entries(CHAMPIONS).map(([cost, list]) => [cost, list.length])
);

// Total cards of a cost tier in a fresh pool.
export function tierPoolTotal(cost) {
  return POOL_COPIES[cost] * TIER_SIZE[cost];
}

export function costOf(name) {
  for (const [cost, list] of Object.entries(CHAMPIONS)) {
    if (list.includes(name)) return Number(cost);
  }
  return null;
}

export const ALL_CHAMPIONS = Object.entries(CHAMPIONS)
  .flatMap(([cost, list]) => list.map((name) => ({ name, cost: Number(cost) })))
  .sort((a, b) => a.name.localeCompare(b.name));

// Shop card frame colors by cost — used to read a screenshot.
// Hue in degrees; 1-cost is detected by LOW saturation rather than hue.
export const COST_COLORS = {
  1: { hue: null, hex: "#9aa4af", label: "1-cost", css: "#9aa4af" },
  2: { hue: 150,  hex: "#1cb96b", label: "2-cost", css: "#1cb96b" },
  3: { hue: 208,  hex: "#1f7fd8", label: "3-cost", css: "#1f7fd8" },
  4: { hue: 288,  hex: "#b23fd8", label: "4-cost", css: "#b23fd8" },
  5: { hue: 40,   hex: "#ffb327", label: "5-cost", css: "#ffb327" },
};
