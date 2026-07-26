import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/content';
import { resolveOffline } from '../src/core/offline';
import { Engine, newGameState } from '../src/core/state';

const T0 = 1_750_000_000_000; // fixed epoch for determinism

function mkEngine(seed = 42): Engine {
  return new Engine(newGameState(seed, 'Testers', T0));
}

describe('engine tick', () => {
  it('completes exactly one game per gameDuration', () => {
    const e = mkEngine();
    const games = e.tick(BALANCE.gameDurationMs, T0 + BALANCE.gameDurationMs);
    expect(games).toBe(1);
    expect(e.state.season.gameIndex).toBe(1);
    expect(e.state.cash).toBeGreaterThan(BALANCE.startingCash);
  });

  it('partial time accumulates progress without finishing', () => {
    const e = mkEngine();
    const games = e.tick(BALANCE.gameDurationMs / 2, T0);
    expect(games).toBe(0);
    expect(e.state.gameProgress).toBeCloseTo(0.5);
  });

  it('a full season ends and starts a new one', () => {
    const e = mkEngine();
    let seasonEnded = 0;
    e.events.seasonEnded = () => seasonEnded++;
    e.tick(BALANCE.gameDurationMs * BALANCE.gamesPerSeason, T0 + 1);
    expect(seasonEnded).toBe(1);
    expect(e.state.season.gameIndex).toBe(0);
    expect(e.state.career.seasons).toBe(1);
  });

  it('career stats accumulate', () => {
    const e = mkEngine();
    e.tick(BALANCE.gameDurationMs * 10, T0 + 1);
    expect(e.state.career.wins + e.state.career.losses).toBe(10);
  });
});

describe('offline progress', () => {
  it('caps at the configured limit', () => {
    const e = mkEngine();
    const dayLater = T0 + 24 * 3600_000;
    const summary = resolveOffline(e, dayLater);
    expect(summary).not.toBeNull();
    expect(summary!.cappedMs).toBe(BALANCE.offlineCapMs);
    expect(summary!.gamesPlayed).toBe(Math.floor(BALANCE.offlineCapMs / BALANCE.gameDurationMs));
  });

  it('ignores very short absences', () => {
    const e = mkEngine();
    expect(resolveOffline(e, T0 + 1000)).toBeNull();
  });

  it('earns cash while away', () => {
    const e = mkEngine();
    const summary = resolveOffline(e, T0 + 3600_000);
    expect(summary!.cashEarned).toBeGreaterThan(0);
  });
});

describe('player actions', () => {
  it('upgrade spends cash and bumps the player', () => {
    const e = mkEngine();
    e.state.cash = 1e9;
    const p = e.state.roster[0];
    const before = e.state.cash;
    expect(e.upgradePlayer(p.id)).toBe(true);
    expect(p.up).toBe(1);
    expect(e.state.cash).toBeLessThan(before);
  });

  it('upgrade fails without cash', () => {
    const e = mkEngine();
    e.state.cash = 0;
    expect(e.upgradePlayer(e.state.roster[0].id)).toBe(false);
  });

  it('facilities purchase and respect max level', () => {
    const e = mkEngine();
    e.state.cash = Number.MAX_SAFE_INTEGER;
    let bought = 0;
    while (e.buyFacility('stadium')) bought++;
    expect(bought).toBe(BALANCE.facilities.stadium.max);
  });

  it('scout respects cooldown and capacity', () => {
    const e = mkEngine();
    e.state.cash = 1e9;
    const pr = e.scout(T0);
    expect(pr).not.toBeNull();
    expect(e.scout(T0 + 1000)).toBeNull(); // cooldown
    // fill to capacity
    for (let i = 1; i < BALANCE.maxProspects; i++) {
      expect(e.scout(T0 + i * 10 * 60_000)).not.toBeNull();
    }
    expect(e.scout(T0 + 100 * 60_000)).toBeNull(); // full
  });

  it('call-up replaces a matching player and clears the prospect', () => {
    const e = mkEngine();
    e.state.cash = 1e9;
    const pr = e.scout(T0)!;
    pr.dev = 100;
    const target = e.state.roster.find((p) => (p.pos === 'P') === (pr.pos === 'P'))!;
    const rosterSize = e.state.roster.length;
    expect(e.callUp(pr.id, target.id)).toBe(true);
    expect(e.state.roster.length).toBe(rosterSize);
    expect(e.state.prospects.find((x) => x.id === pr.id)).toBeUndefined();
    expect(e.state.roster.find((p) => p.name === pr.name)).toBeDefined();
  });

  it('call-up refuses undeveloped prospects and position mismatches', () => {
    const e = mkEngine();
    e.state.cash = 1e9;
    const pr = e.scout(T0)!;
    pr.dev = 50;
    const same = e.state.roster.find((p) => (p.pos === 'P') === (pr.pos === 'P'))!;
    expect(e.callUp(pr.id, same.id)).toBe(false);
    pr.dev = 100;
    const wrong = e.state.roster.find((p) => (p.pos === 'P') !== (pr.pos === 'P'))!;
    expect(e.callUp(pr.id, wrong.id)).toBe(false);
  });

  it('rush costs diamonds and finishes development', () => {
    const e = mkEngine();
    e.state.cash = 1e9;
    e.state.diamonds = 1e6;
    const pr = e.scout(T0)!;
    const before = e.state.diamonds;
    expect(e.rushProspect(pr.id)).toBe(true);
    expect(pr.dev).toBe(100);
    expect(e.state.diamonds).toBeLessThan(before);
  });
});

describe('monetization grants', () => {
  it('income boost doubles game income', () => {
    const a = mkEngine(7);
    const b = mkEngine(7);
    b.grantIncomeBoost(T0);
    a.tick(BALANCE.gameDurationMs * 5, T0 + 1);
    b.tick(BALANCE.gameDurationMs * 5, T0 + 1);
    const earnedA = a.state.cash - BALANCE.startingCash;
    const earnedB = b.state.cash - BALANCE.startingCash;
    expect(earnedB).toBeGreaterThan(earnedA * 1.5);
  });

  it('rewarded diamonds respect the daily cap', () => {
    const e = mkEngine();
    let granted = 0;
    for (let i = 0; i < 20; i++) {
      granted += e.grantAdDiamonds(T0 + i * 60_000) > 0 ? 1 : 0;
    }
    expect(granted).toBe(BALANCE.diamondsRewardedAdDailyCap);
    // next day the cap resets
    expect(e.grantAdDiamonds(T0 + 25 * 3600_000)).toBeGreaterThan(0);
  });

  it('instant games plays exactly the rewarded amount', () => {
    const e = mkEngine();
    const played = e.grantInstantGames(T0 + 1);
    expect(played).toBe(BALANCE.simGamesReward);
  });
});

describe('prestige', () => {
  it('locks until a championship and then resets with legacy', () => {
    const e = mkEngine();
    expect(e.prestigeAvailable()).toBe(false);
    e.state.career.championships = 1;
    e.state.career.highestTier = 2;
    expect(e.prestigeAvailable()).toBe(true);
    const gain = e.prestigeGain();
    expect(gain).toBeGreaterThan(0);
    const oldCareerWins = e.state.career.wins;
    e.prestige(T0 + 5000);
    expect(e.state.legacyPoints).toBe(gain);
    expect(e.state.season.tier).toBe(0);
    expect(e.state.cash).toBe(BALANCE.startingCash);
    expect(e.state.career.wins).toBe(oldCareerWins); // career persists
    expect(e.state.prestigeCount).toBe(1);
  });
});
