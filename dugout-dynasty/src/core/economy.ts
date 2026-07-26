import { BALANCE } from './content';
import { Player, playerValue, Prospect, prospectValue } from './roster';

export interface Facilities {
  stadium: number;
  training: number;
  scouting: number;
}

export type FacilityKey = keyof Facilities;

export function fans(stadiumLevel: number): number {
  return Math.floor(BALANCE.fanBase * Math.pow(BALANCE.fansPerStadiumLevel, stadiumLevel));
}

export function fanMult(stadiumLevel: number): number {
  return 1 + Math.log10(fans(stadiumLevel) / BALANCE.fanBase + 1) * 2;
}

export function legacyMult(legacyPoints: number): number {
  return 1 + legacyPoints * BALANCE.legacyIncomePerPoint;
}

export interface IncomeContext {
  tier: number;
  stadiumLevel: number;
  legacyPoints: number;
  boostActive: boolean;
}

/** Income for winning one game (before per-run bonus). */
export function winIncome(ctx: IncomeContext): number {
  return (
    BALANCE.winIncomeBase *
    Math.pow(BALANCE.winIncomeTierMult, ctx.tier) *
    fanMult(ctx.stadiumLevel) *
    legacyMult(ctx.legacyPoints) *
    (ctx.boostActive ? BALANCE.incomeBoostMult : 1)
  );
}

/** Total payout for a completed game. */
export function gameIncome(ctx: IncomeContext, won: boolean, runs: number): number {
  const base = winIncome(ctx);
  const runBonus = base * BALANCE.runIncomeFrac * runs;
  return Math.floor((won ? base : base * BALANCE.lossIncomeFrac) + runBonus);
}

export function facilityCost(key: FacilityKey, level: number, tier: number): number {
  const def = BALANCE.facilities[key];
  return Math.ceil(
    def.base * Math.pow(def.growth, level) * Math.pow(BALANCE.facilityCostTierMult, tier),
  );
}

export function facilityMaxed(key: FacilityKey, level: number): boolean {
  return level >= BALANCE.facilities[key].max;
}

export function devSpeedMult(trainingLevel: number, legacyPoints: number): number {
  return (1 + BALANCE.trainingDevSpeedPerLevel * trainingLevel) * legacyMult(legacyPoints);
}

export function scoutCooldownMs(scoutingLevel: number): number {
  const factor = Math.max(0.3, 1 - BALANCE.scoutCooldownReducePerLevel * scoutingLevel);
  return BALANCE.scoutCooldownMs * factor;
}

export function scoutCost(ctx: IncomeContext): number {
  return Math.ceil(winIncome({ ...ctx, boostActive: false }) * BALANCE.scoutCostFrac);
}

/** Total franchise worth: players + prospects + facility investment + cash. */
export function teamWorth(
  roster: Player[],
  prospects: Prospect[],
  facilities: Facilities,
  tier: number,
  cash: number,
): number {
  let worth = cash;
  for (const p of roster) worth += playerValue(p, tier);
  for (const pr of prospects) worth += prospectValue(pr);
  for (const key of Object.keys(facilities) as FacilityKey[]) {
    for (let lvl = 0; lvl < facilities[key]; lvl++) {
      worth += facilityCost(key, lvl, 0) * 0.5;
    }
  }
  return Math.floor(worth);
}
