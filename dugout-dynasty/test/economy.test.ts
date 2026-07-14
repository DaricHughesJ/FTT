import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/content';
import { facilityCost, fanMult, gameIncome, winIncome } from '../src/core/economy';
import { Rng } from '../src/core/rng';
import { generatePlayer, upgradeCost } from '../src/core/roster';

const ctx = (tier: number, stadium = 0, boost = false) => ({
  tier,
  stadiumLevel: stadium,
  legacyPoints: 0,
  boostActive: boost,
});

describe('economy', () => {
  it('income grows steeply with league tier', () => {
    expect(winIncome(ctx(1))).toBeGreaterThan(winIncome(ctx(0)) * 3);
    expect(winIncome(ctx(5))).toBeGreaterThan(winIncome(ctx(0)) * 300);
  });

  it('boost doubles income', () => {
    expect(winIncome(ctx(0, 0, true))).toBeCloseTo(winIncome(ctx(0)) * BALANCE.incomeBoostMult);
  });

  it('losses pay a fraction of wins', () => {
    const win = gameIncome(ctx(0), true, 0);
    const loss = gameIncome(ctx(0), false, 0);
    expect(loss).toBeLessThan(win * 0.5);
    expect(loss).toBeGreaterThan(0);
  });

  it('runs add income', () => {
    expect(gameIncome(ctx(0), true, 5)).toBeGreaterThan(gameIncome(ctx(0), true, 0));
  });

  it('upgrade costs escalate so income cannot outrun the gate', () => {
    const rng = new Rng(1);
    const p = generatePlayer(rng, 0, 'CF');
    const c0 = upgradeCost(p, 0, 0);
    p.up = 10;
    const c10 = upgradeCost(p, 0, 0);
    expect(c10).toBeGreaterThan(c0 * 15); // 1.35^10 ≈ 20x
  });

  it('training center discounts upgrades but never below the cap', () => {
    const rng = new Rng(1);
    const p = generatePlayer(rng, 0, 'CF');
    const base = upgradeCost(p, 0, 0);
    const discounted = upgradeCost(p, 0, 10);
    const capped = upgradeCost(p, 0, 999);
    expect(discounted).toBeLessThan(base);
    expect(capped).toBeGreaterThanOrEqual(Math.floor(base * (1 - BALANCE.trainingDiscountCap)));
  });

  it('facility costs grow exponentially with level', () => {
    expect(facilityCost('stadium', 10, 0)).toBeGreaterThan(facilityCost('stadium', 0, 0) * 100);
  });

  it('fan multiplier grows with stadium level', () => {
    expect(fanMult(5)).toBeGreaterThan(fanMult(0));
    expect(fanMult(0)).toBeGreaterThanOrEqual(1);
  });
});
