import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/content';
import { Rng } from '../src/core/rng';
import {
  developPlayer,
  generatePlayer,
  playerValue,
  rollPotential,
  callUpProspect,
  generateProspect,
} from '../src/core/roster';
import { simGame, splitRoster } from '../src/core/sim';
import { generateRoster } from '../src/core/roster';
import { Engine, newGameState } from '../src/core/state';

const T0 = 1_750_000_000_000;

function avgGrowth(potential: 'C' | 'S', perf: { atBats: number; hits: number; homers: number } | undefined, won: boolean, seed: number, n = 4000): number {
  const rng = new Rng(seed);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const p = generatePlayer(rng, 0, 'CF');
    p.potential = potential;
    const before = p.bat;
    developPlayer(rng, p, perf, won, T0);
    total += p.bat / before - 1;
  }
  return total / n;
}

describe('player development', () => {
  it('every generated player carries a potential grade', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 50; i++) {
      const p = generatePlayer(rng, 0, 'CF');
      expect(['C', 'B', 'A', 'S']).toContain(p.potential);
    }
  });

  it('potential distribution follows the configured weights', () => {
    const rng = new Rng(77);
    const counts: Record<string, number> = { C: 0, B: 0, A: 0, S: 0 };
    const n = 20000;
    for (let i = 0; i < n; i++) counts[rollPotential(rng)]++;
    for (const g of ['C', 'B', 'A', 'S'] as const) {
      expect(counts[g] / n).toBeCloseTo(BALANCE.development.potentialWeights[g], 1);
    }
  });

  it('S-potential players grow faster than C-potential on average', () => {
    const perf = { atBats: 4, hits: 1, homers: 0 };
    expect(avgGrowth('S', perf, true, 42)).toBeGreaterThan(avgGrowth('C', perf, true, 42));
  });

  it('a monster game tilts growth upward vs a hitless one', () => {
    const hot = { atBats: 4, hits: 4, homers: 2 };
    const cold = { atBats: 4, hits: 0, homers: 0 };
    expect(avgGrowth('B' as never, hot, true, 7)).toBeGreaterThan(avgGrowth('B' as never, cold, true, 7));
  });

  it('hitless games can shrink a player but never below zero', () => {
    const rng = new Rng(3);
    const cold = { atBats: 4, hits: 0, homers: 0 };
    let sawDecline = false;
    for (let i = 0; i < 2000; i++) {
      const p = generatePlayer(rng, 0, 'CF');
      const before = p.bat;
      const frac = developPlayer(rng, p, cold, false, T0);
      if (frac < 0) sawDecline = true;
      expect(p.bat).toBeGreaterThan(0);
      if (frac !== 0) expect(p.devAt).toBe(T0);
      else expect(p.bat).toBe(before);
    }
    expect(sawDecline).toBe(true);
  });

  it('pitchers develop off wins instead of at-bats', () => {
    const rng = new Rng(9);
    let winGrowth = 0;
    let lossGrowth = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const w = generatePlayer(rng, 0, 'P');
      w.potential = 'B';
      const wb = w.arm;
      developPlayer(rng, w, undefined, true, T0);
      winGrowth += w.arm / wb - 1;
      const l = generatePlayer(rng, 0, 'P');
      l.potential = 'B';
      const lb = l.arm;
      developPlayer(rng, l, undefined, false, T0);
      lossGrowth += l.arm / lb - 1;
    }
    expect(winGrowth / n).toBeGreaterThan(lossGrowth / n);
  });

  it('potential raises market value', () => {
    const rng = new Rng(5);
    const p = generatePlayer(rng, 0, 'CF');
    p.potential = 'C';
    const low = playerValue(p, 0);
    p.potential = 'S';
    expect(playerValue(p, 0)).toBeGreaterThan(low);
  });

  it('called-up prospects inherit their grade as potential', () => {
    const rng = new Rng(6);
    const pr = generateProspect(rng, 0, 'S');
    const player = callUpProspect(rng, pr, 0);
    expect(player.potential).toBe('S');
  });

  it('sim records a home-team box score used for weighting', () => {
    const rng = new Rng(8);
    const home = splitRoster(generateRoster(rng, 0));
    const away = splitRoster(generateRoster(rng, 0));
    const res = simGame(rng, home, away);
    const ids = Object.keys(res.homePerf);
    expect(ids.length).toBeGreaterThan(0);
    const totalAb = ids.reduce((s, id) => s + res.homePerf[id].atBats, 0);
    const homeAtBats = res.events.filter((e) => e.half === 'bottom').length;
    expect(totalAb).toBe(homeAtBats);
  });

  it('stats drift after games through the engine', () => {
    const e = new Engine(newGameState(42, 'Devs', T0));
    const before = e.state.roster.map((p) => p.bat + p.arm + p.spd);
    e.tick(BALANCE.gameDurationMs * 20, T0 + 1);
    const after = e.state.roster.map((p) => p.bat + p.arm + p.spd);
    const changed = after.filter((v, i) => v !== before[i]).length;
    expect(changed).toBeGreaterThan(0);
  });
});
