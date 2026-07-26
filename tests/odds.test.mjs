import { SHOP_ODDS, CHAMPIONS, tierPoolTotal, TIER_SIZE, POOL_COPIES } from "../docs/js/roster.js";
import { atLeastK, slotProbability, poolState, evaluate, goldToReachLevel, recommend, pct, shopAdvice } from "../docs/js/odds.js";

let pass = 0, fail = 0;
const near = (a, b, tol = 1e-4) => Math.abs(a - b) < tol;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
}

console.log("\n— Shop odds table —");
for (const [lvl, row] of Object.entries(SHOP_ODDS)) {
  const sum = row.reduce((a, b) => a + b, 0);
  check(`level ${lvl} sums to 100`, sum === 100, `got ${sum}`);
}

console.log("\n— Roster —");
const names = Object.values(CHAMPIONS).flat();
check("no duplicate champion across tiers", new Set(names).size === names.length,
  `${names.length} entries, ${new Set(names).size} unique`);
console.log(`  info  tier sizes: ${JSON.stringify(TIER_SIZE)} (total ${names.length})`);
check("4-cost pool total = copies x distinct", tierPoolTotal(4) === POOL_COPIES[4] * TIER_SIZE[4]);

console.log("\n— Binomial math —");
check("n=5 p=0.2 k=1 -> 0.67232", near(atLeastK(0.2, 5, 1), 0.67232));
check("n=10 p=0.1 k=2 -> 0.26390", near(atLeastK(0.1, 10, 2), 0.2639, 1e-4));
check("k=0 is certain", atLeastK(0.1, 10, 0) === 1);
check("p=0 is impossible", atLeastK(0, 100, 1) === 0);
check("large n stable (n=500)", atLeastK(0.02, 500, 3) > 0.99 && atLeastK(0.02, 500, 3) <= 1);

console.log("\n— XP / leveling —");
check("7 -> 8 costs 76g from 0 xp", goldToReachLevel(7, 0, 8) === 76, `got ${goldToReachLevel(7, 0, 8)}`);
check("partial xp reduces cost", goldToReachLevel(7, 40, 8) === 36, `got ${goldToReachLevel(7, 40, 8)}`);
check("already at level costs 0", goldToReachLevel(8, 0, 8) === 0);
check("beyond max level returns null", goldToReachLevel(10, 0, 11) === null);

console.log("\n— Pool state —");
const ps = poolState({ cost: 4, owned: 2, contested: "heavy", stage: 4 });
check("owned + rivals removed from copies", ps.copiesLeft === 10 - 2 - Math.round(10 * 0.45),
  JSON.stringify(ps));
check("contested reduces copies vs uncontested",
  poolState({ cost: 4, contested: "heavy", stage: 4 }).copiesLeft <
  poolState({ cost: 4, contested: "none", stage: 4 }).copiesLeft);

console.log("\n— Realistic scenarios —");
const l8 = evaluate({ cost: 4, level: 8, gold: 50, reserve: 0, stage: 4 });
console.log(`  info  L8, 50g, uncontested 4-cost: per-shop ${pct(l8.perShop)}, hit ${pct(l8.hitChance)}, exp copies ${l8.expectedCopies.toFixed(1)}`);
check("L8 50g uncontested 4-cost hit is 85-95%", l8.hitChance > 0.85 && l8.hitChance < 0.96);

const l7 = evaluate({ cost: 4, level: 7, gold: 50, reserve: 0, stage: 4 });
check("level 8 beats level 7 for 4-costs", l8.hitChance > l7.hitChance,
  `L8 ${pct(l8.hitChance)} vs L7 ${pct(l7.hitChance)}`);

// 40g is genuinely NOT enough to finish a 1-cost 3-star from 6 copies:
// ~2 expected copies seen. Slow-rolling over many rounds is what gets there.
const cheap = evaluate({ cost: 1, level: 6, gold: 40, reserve: 0, stage: 3, owned: 6, need: 3 });
console.log(`  info  3-starring a 1-cost at L6 w/ 40g, own 6: ${pct(cheap.hitChance)} to see 3 more (exp ${cheap.expectedCopies.toFixed(1)})`);
check("40g rarely finishes a 1-cost 3-star", cheap.hitChance > 0.2 && cheap.hitChance < 0.5);
const slowRoll = evaluate({ cost: 1, level: 6, gold: 120, reserve: 0, stage: 3, owned: 6, need: 3 });
check("sustained slow-rolling does finish it", slowRoll.hitChance > 0.85,
  `120g -> ${pct(slowRoll.hitChance)}`);

check("more gold never lowers the odds",
  evaluate({ cost: 4, level: 8, gold: 60, reserve: 0, stage: 4 }).hitChance >=
  evaluate({ cost: 4, level: 8, gold: 30, reserve: 0, stage: 4 }).hitChance);
check("contested lowers the odds",
  evaluate({ cost: 4, level: 8, gold: 50, reserve: 0, stage: 4, contested: "heavy" }).hitChance <
  evaluate({ cost: 4, level: 8, gold: 50, reserve: 0, stage: 4, contested: "none" }).hitChance);
check("5-costs impossible before level 7",
  evaluate({ cost: 5, level: 6, gold: 100, reserve: 0, stage: 4 }).hitChance === 0);

console.log("\n— Recommendations —");
const r1 = recommend({ cost: 4, level: 8, xp: 0, gold: 80, stage: 4 });
console.log(`  info  L8 80g hunting 4-cost -> ${r1.best.key}: ${r1.best.label} (${pct(r1.best.chance)})`);
check("80g at L8 rolls while keeping 50 interest", r1.best.key === "roll");

const r2 = recommend({ cost: 4, level: 7, xp: 0, gold: 20, stage: 4 });
console.log(`  info  L7 20g hunting 4-cost -> ${r2.best.key}: ${r2.best.label} (${pct(r2.best.chance)})`);
check("low gold at L7 saves rather than burning it", r2.best.key === "save");

// 32g of XP leaves only 28g to roll; 60g of rolling at level 7 beats that
// for finding ONE specific unit. (Leveling still has board-strength value
// the single-target model doesn't score — the UI says so.)
const r3 = recommend({ cost: 4, level: 7, xp: 44, gold: 60, stage: 4 });
console.log(`  info  L7 (44xp) 60g hunting 4-cost -> ${r3.best.key}: ${r3.best.label} (${pct(r3.best.chance)})`);
check("expensive level-up loses to just rolling", r3.best.key === "rollAll");

// When the level-up is nearly paid off, leveling first does win.
const r3b = recommend({ cost: 4, level: 7, xp: 72, gold: 40, stage: 4 });
console.log(`  info  L7 (72xp) 40g -> ${r3b.best.key}: ${r3b.best.label} (${pct(r3b.best.chance)})`);
check("cheap level-up to 8 is preferred", r3b.best.key === "level",
  `got ${r3b.best.key}`);

const r4 = recommend({ cost: 4, level: 8, xp: 0, gold: 40, stage: 5, health: 20 });
console.log(`  info  L8 40g at 20HP -> ${r4.best.key}: ${r4.best.label} (${pct(r4.best.chance)})`);
check("low HP spends everything", r4.desperate && r4.best.key !== "save");

console.log("\n— Shop advice —");
const advice = shopAdvice(
  [{ slot: 0, champion: "Nami", cost: 4 }, { slot: 1, champion: "Teemo", cost: 1 },
   { slot: 2, champion: "Riven", cost: 4 }, { slot: 3, champion: "Jax", cost: 2 },
   { slot: 4, champion: null, cost: null }],
  { comp: { core: ["Nami", "Riven", "Jax", "Gwen"], carries: [{ unit: "Nami" }] },
    ownedCounts: { Jax: 2 } });
check("main carry -> buy", advice[0].verdict === "buy");
check("off-comp 1-cost -> skip", advice[1].verdict === "skip");
check("core unit -> buy", advice[2].verdict === "buy");
check("2 owned completes 2-star -> buy", advice[3].verdict === "buy" && /2★/.test(advice[3].why));
check("unknown slot -> unknown", advice[4].verdict === "unknown");

console.log("\n— Interest-vs-commit tradeoff (regression) —");
const r5 = recommend({ cost: 4, level: 8, xp: 0, gold: 80, stage: 4, owned: 1, need: 2 });
const partial = r5.options.find(o => o.key === "roll").chance;
const all = r5.options.find(o => o.key === "rollAll").chance;
console.log(`  info  need 2 Nami @L8 80g: roll-to-50 ${pct(partial)} vs spend-all ${pct(all)} -> ${r5.best.key}`);
check("does not recommend a far worse option to protect interest",
  !(all - partial > 0.2 && r5.best.key === "roll"), `chose ${r5.best.key}`);
check("commits when spending all is much better", r5.best.key === "rollAll", `chose ${r5.best.key}`);

const r6 = recommend({ cost: 4, level: 8, xp: 0, gold: 80, stage: 4, need: 1 });
console.log(`  info  need 1 @L8 80g -> ${r6.best.key} (${pct(r6.best.chance)})`);
check("still keeps interest when odds already strong", r6.best.key === "roll", `chose ${r6.best.key}`);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
