// The decision engine: shop probability math and roll/level/save advice.
//
// Every number here is derived, not guessed — given your level, gold, and
// what you're hunting, it computes the actual chance of hitting and compares
// the concrete alternatives (roll now vs. level first vs. save).

import {
  SHOP_ODDS, POOL_COPIES, XP_TO_LEVEL, XP_PER_BUY, GOLD_PER_BUY, ROLL_COST,
  tierPoolTotal,
} from "./roster.js";

// How much of a cost tier's pool is typically gone by a given stage.
// Other players buying the same tier is what makes late rolldowns harder.
const TIER_DEPLETION_BY_STAGE = { 1: 0.02, 2: 0.05, 3: 0.10, 4: 0.18, 5: 0.26, 6: 0.33, 7: 0.40 };

// How many of YOUR target's copies rivals are holding.
export const CONTEST_LEVELS = {
  none:  { label: "Uncontested", fraction: 0.0 },
  light: { label: "1 other player", fraction: 0.22 },
  heavy: { label: "2+ others", fraction: 0.45 },
};

export function tierDepletion(stage) {
  return TIER_DEPLETION_BY_STAGE[Math.min(7, Math.max(1, Math.floor(stage)))] ?? 0.2;
}

/**
 * How many copies of the target remain, and how many cards are left in its
 * tier. Both feed the per-slot probability.
 */
export function poolState({ cost, owned = 0, contested = "none", stage = 4 }) {
  const total = POOL_COPIES[cost];
  const takenByOthers = Math.round(total * (CONTEST_LEVELS[contested]?.fraction ?? 0));
  const copiesLeft = Math.max(0, total - owned - takenByOthers);
  const tierCardsLeft = Math.max(1, Math.round(tierPoolTotal(cost) * (1 - tierDepletion(stage))));
  return { copiesLeft, tierCardsLeft, totalCopies: total, takenByOthers };
}

/** Probability a SINGLE shop slot shows the target champion. */
export function slotProbability({ cost, level, copiesLeft, tierCardsLeft }) {
  const odds = SHOP_ODDS[level];
  if (!odds) return 0;
  const tierChance = odds[cost - 1] / 100;
  if (tierChance === 0 || copiesLeft <= 0) return 0;
  return tierChance * (copiesLeft / tierCardsLeft);
}

/** Probability of seeing at least `k` copies across `slots` independent slots. */
export function atLeastK(p, slots, k = 1) {
  if (p <= 0) return 0;
  if (k <= 0) return 1;
  if (p >= 1) return 1;
  // 1 - P(fewer than k) using the binomial tail.
  let cumulative = 0;
  for (let i = 0; i < k; i++) {
    cumulative += binomialPmf(slots, i, p);
  }
  return Math.max(0, Math.min(1, 1 - cumulative));
}

function binomialPmf(n, k, p) {
  if (k > n) return 0;
  // log-space keeps large n stable
  const logC = logFactorial(n) - logFactorial(k) - logFactorial(n - k);
  const logP = logC + k * Math.log(p) + (n - k) * Math.log(1 - p);
  return Math.exp(logP);
}

const logFactCache = [0, 0];
function logFactorial(n) {
  if (logFactCache[n] !== undefined) return logFactCache[n];
  let value = logFactCache[logFactCache.length - 1];
  for (let i = logFactCache.length; i <= n; i++) {
    value += Math.log(i);
    logFactCache[i] = value;
  }
  return logFactCache[n];
}

export function rollsAffordable(gold, reserve = 0) {
  return Math.max(0, Math.floor((gold - reserve) / ROLL_COST));
}

/** Full outcome for a given level + gold + target. */
export function evaluate({ cost, level, gold, reserve = 0, owned = 0, contested = "none", stage = 4, need = 1 }) {
  const { copiesLeft, tierCardsLeft, takenByOthers } = poolState({ cost, owned, contested, stage });
  const p = slotProbability({ cost, level, copiesLeft, tierCardsLeft });
  const rolls = rollsAffordable(gold, reserve);
  const slots = rolls * 5;
  return {
    level, gold, rolls, slots, copiesLeft, takenByOthers,
    slotProbability: p,
    perShop: 1 - Math.pow(1 - p, 5),
    hitChance: atLeastK(p, slots, need),
    expectedCopies: p * slots,
    need,
  };
}

/** Gold needed to buy XP from (level, xp) up to targetLevel. */
export function goldToReachLevel(level, xp, targetLevel) {
  if (targetLevel <= level) return 0;
  let needed = 0, curLevel = level, curXp = xp;
  while (curLevel < targetLevel) {
    const req = XP_TO_LEVEL[curLevel + 1];
    if (req == null) return null; // beyond max level
    needed += Math.max(0, req - curXp);
    curXp = 0;
    curLevel++;
  }
  return Math.ceil(needed / XP_PER_BUY) * GOLD_PER_BUY;
}

/**
 * Compare the real options and pick one. Returns the chosen action plus the
 * numbers behind every option so the UI can show the reasoning.
 */
export function recommend({ cost, level, xp = 0, gold, owned = 0, contested = "none", stage = 4, need = 1, health = 100 }) {
  // Below ~35 HP you cannot afford to play for interest — spend to survive.
  const desperate = health <= 35;

  // Rolling down to the 50g interest breakpoint is only a distinct option
  // when you actually hold more than 50.
  const rollToFifty = gold > 50
    ? evaluate({ cost, level, gold, reserve: 50, owned, contested, stage, need })
    : null;
  const rollAll = evaluate({ cost, level, gold, reserve: 0, owned, contested, stage, need });

  const levelCost = goldToReachLevel(level, xp, level + 1);
  const canLevel = levelCost != null && levelCost <= gold && SHOP_ODDS[level + 1];
  const levelFirst = canLevel
    ? { ...evaluate({ cost, level: level + 1, gold: gold - levelCost, reserve: 0, owned, contested, stage, need }), levelCost }
    : null;

  const options = [
    { key: "save", label: `Save your ${gold}g`, chance: 0,
      detail: "Take interest and roll later with more gold behind it." },
  ];
  if (rollToFifty) {
    options.push({ key: "roll", label: `Roll down to 50g — ${rollToFifty.rolls} rolls`,
      chance: rollToFifty.hitChance, data: rollToFifty });
  }
  options.push({ key: "rollAll", label: `Spend all ${gold}g — ${rollAll.rolls} rolls`,
    chance: rollAll.hitChance, data: rollAll });
  if (levelFirst) {
    options.push({ key: "level",
      label: `Level to ${level + 1} for ${levelCost}g, then roll ${gold - levelCost}g`,
      chance: levelFirst.hitChance, data: levelFirst });
  }

  const pick = (key) => options.find((o) => o.key === key);
  const bestRollDown = rollToFifty?.hitChance ?? 0;
  // Preserving interest is only worth it if spending everything isn't
  // dramatically better. Past these margins the extra gold buys too much.
  const WORTH_KEEPING_INTEREST = 0.25;
  const MARGIN_AT_LOWER_ODDS = 0.20;
  const gainFromSpendingAll = rollAll.hitChance - bestRollDown;
  let best, why;

  if (desperate) {
    best = options.reduce((a, b) => (b.chance > a.chance ? b : a));
    why = "You're low enough that interest is worthless if you die — take the highest chance to stabilize.";
  } else if (rollToFifty && rollToFifty.hitChance >= 0.5 && gainFromSpendingAll < WORTH_KEEPING_INTEREST) {
    best = pick("roll");
    why = "Strong odds without dropping below the 50g interest breakpoint — this costs you nothing.";
  } else if (levelFirst && levelFirst.hitChance > Math.max(rollAll.hitChance, bestRollDown) * 1.05) {
    best = pick("level");
    why = "Even after paying for XP, the higher level's shop odds win.";
  } else if (rollToFifty && rollToFifty.hitChance >= 0.3 && gainFromSpendingAll < MARGIN_AT_LOWER_ODDS) {
    best = pick("roll");
    why = "Worth a partial roll — you keep max interest either way.";
  } else if (rollAll.hitChance >= 0.65) {
    best = pick("rollAll");
    why = bestRollDown > 0
      ? `Rolling only to 50g gives just ${pct(bestRollDown)} — spending down is worth breaking interest for.`
      : "High enough to commit — spending down is worth it at this chance.";
  } else if (rollToFifty && rollToFifty.hitChance >= 0.3) {
    best = pick("roll");
    why = "Worth a partial roll — you keep max interest either way.";
  } else {
    best = pick("save");
    why = "Not enough gold to make this likely. Save, take interest, and roll with more behind it.";
  }

  return { best, why, options, rollToFifty, rollAll, levelFirst, levelCost, desperate };
}

export function pct(x) {
  if (x >= 0.995) return ">99%";
  if (x > 0 && x < 0.01) return "<1%";
  return `${Math.round(x * 100)}%`;
}

/**
 * Per-slot buy advice for a scanned shop.
 * `comp` is an optional comp object from data.js (core unit names).
 */
export function shopAdvice(slots, { comp = null, ownedCounts = {}, level = 7, gold = 0 } = {}) {
  const core = new Set((comp?.core || []).map((u) => u.replace(/\s*\(.*\)$/, "").trim()));
  const carries = new Set((comp?.carries || []).map((c) => c.unit));
  return slots.map((slot) => {
    if (!slot.champion) return { ...slot, verdict: "unknown", why: "Pick the champion to get advice." };
    const name = slot.champion;
    const owned = ownedCounts[name] || 0;
    const isCarry = carries.has(name);
    const isCore = core.has(name) || isCarry;

    if (owned === 2) {
      return { ...slot, verdict: "buy", why: `Completes ${name} 2★ — buy immediately.` };
    }
    if (isCarry) {
      return { ...slot, verdict: "buy", why: `${name} is your main carry — always buy.` };
    }
    if (isCore) {
      return { ...slot, verdict: "buy", why: `Core unit in this comp${owned ? ` (you have ${owned})` : ""}.` };
    }
    if (slot.cost >= 4) {
      return { ...slot, verdict: "consider", why: `${slot.cost}-cost off-comp — buy only to deny a rival or pivot.` };
    }
    if (owned >= 1) {
      return { ...slot, verdict: "consider", why: `You hold ${owned}; only worth it if you're pivoting here.` };
    }
    return { ...slot, verdict: "skip", why: "Not in your comp — leave it, save the gold." };
  });
}
