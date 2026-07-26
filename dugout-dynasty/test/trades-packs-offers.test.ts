import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/core/content';
import { newOfferBook, purchaseOffer, updateOffers } from '../src/core/offers';
import { openPack, rollGrade, scoutActionGrade } from '../src/core/packs';
import { Rng } from '../src/core/rng';
import { generatePlayer, generateProspect, playerValue } from '../src/core/roster';
import { generateAITeams } from '../src/core/season';
import { evaluateTrade, maybeGenerateIncomingOffer, TradeOffer } from '../src/core/trades';
import { InterstitialPolicy } from '../src/monetization/AdService';
import { sanitizeTeamName } from '../src/online/LeaderboardService';

const T0 = 1_750_000_000_000;

describe('trades', () => {
  const rng = new Rng(11);
  const star = generatePlayer(rng, 0, 'CF', 1.6);
  const scrub = generatePlayer(rng, 0, 'LF', 0.6);

  it('AI rejects a lopsided offer against itself', () => {
    const offer: TradeOffer = {
      givePlayer: scrub,
      giveProspects: [],
      giveCash: 0,
      receivePlayer: star,
      aiTeamId: 'x',
    };
    expect(evaluateTrade(offer, 0).accepted).toBe(false);
  });

  it('AI accepts when the offer clears its margin', () => {
    const cashNeeded = Math.ceil(
      playerValue(star, 0) * BALANCE.tradeAcceptMargin / BALANCE.tradeCashValueFrac,
    );
    const offer: TradeOffer = {
      givePlayer: scrub,
      giveProspects: [],
      giveCash: cashNeeded,
      receivePlayer: star,
      aiTeamId: 'x',
    };
    expect(evaluateTrade(offer, 0).accepted).toBe(true);
  });

  it('prospects sweeten a deal', () => {
    const base: TradeOffer = {
      givePlayer: scrub,
      giveProspects: [],
      giveCash: 0,
      receivePlayer: star,
      aiTeamId: 'x',
    };
    const sweetened: TradeOffer = {
      ...base,
      giveProspects: [{ ...generateProspect(rng, 0, 'S'), dev: 100 }],
    };
    expect(evaluateTrade(sweetened, 0).giveValue).toBeGreaterThan(evaluateTrade(base, 0).giveValue);
  });

  it('incoming offers eventually appear and reference real assets', () => {
    const rng2 = new Rng(3);
    const roster = [generatePlayer(rng2, 0, 'CF')];
    const teams = generateAITeams(rng2, 0);
    let offer = null;
    for (let i = 0; i < 500 && !offer; i++) {
      offer = maybeGenerateIncomingOffer(rng2, roster, teams, 0, T0);
    }
    expect(offer).not.toBeNull();
    expect(offer!.wantsPlayerId).toBe(roster[0].id);
    expect(teams.some((t) => t.id === offer!.aiTeamId)).toBe(true);
  });
});

describe('packs', () => {
  it('grade odds converge to the published rates', () => {
    const rng = new Rng(2024);
    const pack = BALANCE.packs[1]; // silver
    const n = 20000;
    const counts: Record<string, number> = { C: 0, B: 0, A: 0, S: 0 };
    for (let i = 0; i < n; i++) counts[rollGrade(rng, pack)]++;
    for (const g of ['C', 'B', 'A', 'S'] as const) {
      expect(counts[g] / n).toBeCloseTo(pack.odds[g] ?? 0, 1);
    }
  });

  it('gold pack never yields a C prospect', () => {
    const rng = new Rng(5);
    const gold = BALANCE.packs[2];
    for (let i = 0; i < 2000; i++) {
      expect(rollGrade(rng, gold)).not.toBe('C');
    }
  });

  it('opened prospects start undeveloped at the given tier', () => {
    const rng = new Rng(6);
    const pr = openPack(rng, BALANCE.packs[0], 3);
    expect(pr.dev).toBe(0);
    expect(pr.tier).toBe(3);
  });

  it('scouting office levels shift grades upward', () => {
    const rng1 = new Rng(9);
    const rng2 = new Rng(9);
    const n = 5000;
    const score = { C: 0, B: 1, A: 2, S: 3 };
    let low = 0;
    let high = 0;
    for (let i = 0; i < n; i++) low += score[scoutActionGrade(rng1, 0)];
    for (let i = 0; i < n; i++) high += score[scoutActionGrade(rng2, 10)];
    expect(high).toBeGreaterThan(low);
  });
});

describe('offers', () => {
  it('starter deal triggers on first promotion, once only', () => {
    const book = newOfferBook();
    expect(updateOffers(book, { promotions: 0, championships: 0, prestiges: 0, now: T0 })).toHaveLength(0);
    const fresh = updateOffers(book, { promotions: 1, championships: 0, prestiges: 0, now: T0 });
    expect(fresh.map((o) => o.dealId)).toEqual(['starter']);
    // does not re-trigger
    expect(updateOffers(book, { promotions: 2, championships: 0, prestiges: 0, now: T0 })).toHaveLength(0);
  });

  it('offers expire after their window', () => {
    const book = newOfferBook();
    updateOffers(book, { promotions: 1, championships: 0, prestiges: 0, now: T0 });
    updateOffers(book, { promotions: 1, championships: 0, prestiges: 0, now: T0 + 49 * 3600_000 });
    expect(book.active).toHaveLength(0);
  });

  it('purchase is once-only and requires an active offer', () => {
    const book = newOfferBook();
    updateOffers(book, { promotions: 1, championships: 0, prestiges: 0, now: T0 });
    const deal = purchaseOffer(book, 'starter', T0 + 1000);
    expect(deal.diamonds).toBeGreaterThan(0);
    expect(() => purchaseOffer(book, 'starter', T0 + 2000)).toThrow();
    expect(() => purchaseOffer(book, 'champion', T0)).toThrow();
  });

  it('champion and dynasty deals trigger on their milestones', () => {
    const book = newOfferBook();
    const fresh = updateOffers(book, { promotions: 3, championships: 1, prestiges: 1, now: T0 });
    expect(fresh.map((o) => o.dealId).sort()).toEqual(['champion', 'dynasty', 'starter']);
  });
});

describe('interstitial policy', () => {
  it('never shows during the grace period', () => {
    const p = new InterstitialPolicy(T0);
    expect(p.canShow(T0 + BALANCE.interstitialGraceMs - 1)).toBe(false);
    expect(p.canShow(T0 + BALANCE.interstitialGraceMs + 1)).toBe(true);
  });

  it('enforces the minimum interval between ads', () => {
    const p = new InterstitialPolicy(T0);
    const t = T0 + BALANCE.interstitialGraceMs + 1;
    expect(p.canShow(t)).toBe(true);
    p.markShown(t);
    expect(p.canShow(t + BALANCE.interstitialMinIntervalMs - 1)).toBe(false);
    expect(p.canShow(t + BALANCE.interstitialMinIntervalMs + 1)).toBe(true);
  });
});

describe('team name sanitizer', () => {
  it('passes normal names and strips junk', () => {
    expect(sanitizeTeamName('Rocket City Sluggers')).toBe('Rocket City Sluggers');
    expect(sanitizeTeamName('  <b>Cool</b> Team  ')).toBe('bCoolb Team');
  });

  it('replaces profane or empty names', () => {
    expect(sanitizeTeamName('sh1t squad')).toBe('Anonymous Franchise');
    expect(sanitizeTeamName('')).toBe('Anonymous Franchise');
  });
});
