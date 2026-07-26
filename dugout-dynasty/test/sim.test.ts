import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { generateRoster, teamRating } from '../src/core/roster';
import { quickWinProb, simGame, splitRoster } from '../src/core/sim';

describe('sim', () => {
  it('is deterministic for the same seed', () => {
    const mk = () => {
      const rng = new Rng(42);
      const home = splitRoster(generateRoster(rng, 0));
      const away = splitRoster(generateRoster(rng, 0));
      return simGame(rng, home, away);
    };
    const a = mk();
    const b = mk();
    expect(a.homeRuns).toBe(b.homeRuns);
    expect(a.awayRuns).toBe(b.awayRuns);
    expect(a.events.map((e) => e.kind)).toEqual(b.events.map((e) => e.kind));
  });

  it('never ends in a tie and always has a winner', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 200; i++) {
      const home = splitRoster(generateRoster(rng, 1));
      const away = splitRoster(generateRoster(rng, 1));
      const res = simGame(rng, home, away);
      expect(res.homeRuns).not.toBe(res.awayRuns);
      expect(res.homeWin).toBe(res.homeRuns > res.awayRuns);
    }
  });

  it('better teams win far more often', () => {
    const rng = new Rng(123);
    const strong = splitRoster(generateRoster(rng, 2)); // 4x the stats
    const weak = splitRoster(generateRoster(rng, 0));
    let strongWins = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      if (simGame(rng, strong, weak).homeWin) strongWins++;
    }
    expect(strongWins / n).toBeGreaterThan(0.8);
  });

  it('events carry monotonically increasing timeline positions', () => {
    const rng = new Rng(9);
    const res = simGame(rng, splitRoster(generateRoster(rng, 0)), splitRoster(generateRoster(rng, 0)));
    for (let i = 1; i < res.events.length; i++) {
      expect(res.events[i].t).toBeGreaterThan(res.events[i - 1].t);
    }
    expect(res.events[res.events.length - 1].t).toBeLessThan(1);
  });

  it('quickWinProb favors the higher rating and stays in bounds', () => {
    expect(quickWinProb(100, 100)).toBeCloseTo(0.5);
    expect(quickWinProb(200, 100)).toBeGreaterThan(0.6);
    expect(quickWinProb(10000, 1)).toBeLessThanOrEqual(0.95);
    expect(quickWinProb(1, 10000)).toBeGreaterThanOrEqual(0.05);
  });

  it('team rating reflects roster strength', () => {
    const rng = new Rng(5);
    const weak = generateRoster(rng, 0);
    const strong = generateRoster(rng, 3);
    expect(teamRating(strong)).toBeGreaterThan(teamRating(weak) * 4);
  });
});
