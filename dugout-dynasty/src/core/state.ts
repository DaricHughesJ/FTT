import { Rng } from './rng';
import { BALANCE, MILESTONES, TOP_TIER } from './content';
import {
  callUpProspect,
  developProspect,
  generateProspect,
  generateRoster,
  Grade,
  nextId,
  Player,
  playerValue,
  Prospect,
  prospectValue,
  rushCost,
  teamRating,
  upgradeCost,
} from './roster';
import { GameResult, simGame, splitRoster } from './sim';
import {
  devSpeedMult,
  Facilities,
  facilityCost,
  FacilityKey,
  facilityMaxed,
  gameIncome,
  IncomeContext,
  scoutCooldownMs,
  scoutCost,
  teamWorth,
} from './economy';
import {
  newSeason,
  playAiMatchday,
  playerRank,
  SeasonState,
  seasonOutcome,
  seasonOver,
} from './season';
import { applyTrade, evaluateTrade, IncomingOffer, maybeGenerateIncomingOffer, TradeOffer } from './trades';
import { openPack, packById, scoutActionGrade } from './packs';
import { newOfferBook, OfferBookState, purchaseOffer, updateOffers } from './offers';
import { CareerStats, newCareerStats } from './stats';

export const SAVE_VERSION = 1;

export interface GameState {
  version: number;
  createdAt: number;
  lastSeen: number;
  teamName: string;
  cash: number;
  diamonds: number;
  roster: Player[];
  prospects: Prospect[];
  facilities: Facilities;
  season: SeasonState;
  career: CareerStats;
  legacyPoints: number;
  boostUntil: number;
  scoutReadyAt: number;
  rewardedAdDay: string; // yyyy-mm-dd of the daily counter
  rewardedAdCount: number;
  offers: OfferBookState;
  incomingOffer: IncomingOffer | null;
  milestonesClaimed: string[];
  /** 0..1 progress of the game currently being "played" in real time. */
  gameProgress: number;
  /** Pre-simmed result of the game in progress (drives the live view). */
  currentGame: GameResult | null;
  rngSeed: number;
  prestigeCount: number;
}

export interface SeasonEndSummary {
  rank: number;
  promoted: boolean;
  champion: boolean;
  newTier: number;
  diamondsEarned: number;
}

export interface EngineEvents {
  gameFinished?: (result: GameResult, income: number) => void;
  seasonEnded?: (summary: SeasonEndSummary) => void;
  milestoneReached?: (label: string, diamonds: number) => void;
  offerAppeared?: (dealId: string) => void;
  incomingTradeOffer?: (offer: IncomingOffer) => void;
}

export function newGameState(seed: number, teamName: string, now: number, legacyPoints = 0, prestigeCount = 0, offers?: OfferBookState, career?: CareerStats): GameState {
  const rng = new Rng(seed);
  const roster = generateRoster(rng, 0, 1.0);
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSeen: now,
    teamName,
    cash: BALANCE.startingCash,
    diamonds: prestigeCount === 0 ? BALANCE.startingDiamonds : 0,
    roster,
    prospects: [],
    facilities: { stadium: 0, training: 0, scouting: 0 },
    season: newSeason(rng, 0),
    career: career ?? newCareerStats(),
    legacyPoints,
    boostUntil: 0,
    scoutReadyAt: 0,
    rewardedAdDay: '',
    rewardedAdCount: 0,
    offers: offers ?? newOfferBook(),
    incomingOffer: null,
    milestonesClaimed: [],
    gameProgress: 0,
    currentGame: null,
    rngSeed: rng.seed,
    prestigeCount,
  };
}

/**
 * The engine wraps a GameState and exposes every game action. Pure of DOM —
 * the UI layer subscribes via EngineEvents and renders from `state`.
 */
export class Engine {
  state: GameState;
  events: EngineEvents = {};

  constructor(state: GameState) {
    this.state = state;
  }

  private rng(): Rng {
    return new Rng(this.state.rngSeed);
  }

  private saveRng(rng: Rng): void {
    this.state.rngSeed = rng.seed;
  }

  incomeCtx(now: number): IncomeContext {
    return {
      tier: this.state.season.tier,
      stadiumLevel: this.state.facilities.stadium,
      legacyPoints: this.state.legacyPoints,
      boostActive: now < this.state.boostUntil,
    };
  }

  boostActive(now: number): boolean {
    return now < this.state.boostUntil;
  }

  devSpeed(): number {
    return devSpeedMult(this.state.facilities.training, this.state.legacyPoints);
  }

  teamWorth(): number {
    return teamWorth(
      this.state.roster,
      this.state.prospects,
      this.state.facilities,
      this.state.season.tier,
      this.state.cash,
    );
  }

  teamRating(): number {
    return teamRating(this.state.roster);
  }

  /**
   * Advance the game clock by elapsedMs of real time. Drives game progress,
   * prospect development, and boost expiry. Multiple games can complete in a
   * single call (that's exactly how offline progress resolves).
   * Returns the number of games completed.
   */
  tick(elapsedMs: number, now: number, maxGames = Infinity): number {
    const s = this.state;
    // prospect development
    for (const pr of s.prospects) developProspect(pr, elapsedMs, this.devSpeed());

    let remaining = elapsedMs;
    let completed = 0;
    while (remaining > 0 && completed < maxGames) {
      const msToFinish = (1 - s.gameProgress) * BALANCE.gameDurationMs;
      if (remaining < msToFinish) {
        s.gameProgress += remaining / BALANCE.gameDurationMs;
        break;
      }
      remaining -= msToFinish;
      this.finishGame(now);
      completed++;
    }
    s.lastSeen = now;
    return completed;
  }

  /** Ensure the in-progress game is simmed (live view reads its events). */
  ensureCurrentGame(): GameResult {
    if (this.state.currentGame) return this.state.currentGame;
    const rng = this.rng();
    const s = this.state;
    const opponent = s.season.aiTeams[s.season.nextOpponent];
    const result = simGame(rng, splitRoster(s.roster), splitRoster(opponent.roster));
    s.currentGame = result;
    this.saveRng(rng);
    return result;
  }

  /** Resolve the current game, award income, advance the season. */
  private finishGame(now: number): void {
    const s = this.state;
    const result = this.ensureCurrentGame();
    const rng = this.rng();
    const opponentIdx = s.season.nextOpponent;
    const opponent = s.season.aiTeams[opponentIdx];

    // player is always the home team
    const won = result.homeWin;
    const income = gameIncome(this.incomeCtx(now), won, result.homeRuns);
    s.cash += income;

    if (won) {
      s.season.playerWins++;
      s.career.wins++;
      opponent.losses++;
    } else {
      s.season.playerLosses++;
      s.career.losses++;
      opponent.wins++;
    }
    s.season.seasonHr += result.homeHr;
    s.season.seasonRuns += result.homeRuns;
    s.career.hr += result.homeHr;
    s.career.runs += result.homeRuns;
    s.season.gameIndex++;

    playAiMatchday(rng, s.season, opponentIdx);

    this.events.gameFinished?.(result, income);

    // maybe an AI comes knocking with a trade
    if (!s.incomingOffer) {
      const offer = maybeGenerateIncomingOffer(rng, s.roster, s.season.aiTeams, s.season.tier, now);
      if (offer) {
        s.incomingOffer = offer;
        this.events.incomingTradeOffer?.(offer);
      }
    }

    s.gameProgress = 0;
    s.currentGame = null;

    if (seasonOver(s.season)) {
      this.endSeason(rng, now);
    } else {
      s.season.nextOpponent = rng.int(0, s.season.aiTeams.length - 1);
    }
    this.saveRng(rng);
    this.checkMilestones();
  }

  private endSeason(rng: Rng, now: number): void {
    const s = this.state;
    const outcome = seasonOutcome(s.season, s.teamName);
    s.career.seasons++;
    let diamonds = 0;
    if (outcome.champion) {
      s.career.championships++;
      diamonds += BALANCE.diamondsChampionship;
    }
    let newTier = s.season.tier;
    if (outcome.promoted) {
      newTier = s.season.tier + 1;
      s.career.promotions++;
      s.career.highestTier = Math.max(s.career.highestTier, newTier);
      diamonds += BALANCE.diamondsPromotion;
    }
    s.diamonds += diamonds;

    // fresh opponents on promotion; same league re-rolls standings only
    s.season = newSeason(rng, newTier, outcome.promoted ? undefined : s.season.aiTeams);

    const fresh = updateOffers(s.offers, {
      promotions: s.career.promotions,
      championships: s.career.championships,
      prestiges: s.career.prestiges,
      now,
    });
    for (const o of fresh) this.events.offerAppeared?.(o.dealId);

    this.events.seasonEnded?.({ ...outcome, newTier, diamondsEarned: diamonds });
  }

  private checkMilestones(): void {
    const s = this.state;
    const stats = {
      careerHr: s.career.hr,
      careerWins: s.career.wins,
      teamWorth: this.teamWorth(),
      championships: s.career.championships,
    };
    for (const m of MILESTONES) {
      if (s.milestonesClaimed.includes(m.id)) continue;
      if (m.check(stats)) {
        s.milestonesClaimed.push(m.id);
        s.diamonds += m.diamonds;
        this.events.milestoneReached?.(m.label, m.diamonds);
      }
    }
  }

  // ---- Player actions ----

  upgradePlayer(playerId: string): boolean {
    const s = this.state;
    const p = s.roster.find((x) => x.id === playerId);
    if (!p) return false;
    const cost = upgradeCost(p, s.season.tier, s.facilities.training);
    if (s.cash < cost) return false;
    s.cash -= cost;
    p.up++;
    return true;
  }

  buyFacility(key: FacilityKey): boolean {
    const s = this.state;
    if (facilityMaxed(key, s.facilities[key])) return false;
    const cost = facilityCost(key, s.facilities[key], s.season.tier);
    if (s.cash < cost) return false;
    s.cash -= cost;
    s.facilities[key]++;
    return true;
  }

  /** Cash-cost scout action (cooldown-gated); returns the prospect or null. */
  scout(now: number): Prospect | null {
    const s = this.state;
    if (now < s.scoutReadyAt) return null;
    if (s.prospects.length >= BALANCE.maxProspects) return null;
    const cost = scoutCost(this.incomeCtx(now));
    if (s.cash < cost) return null;
    const rng = this.rng();
    s.cash -= cost;
    const grade = scoutActionGrade(rng, s.facilities.scouting);
    const pr = generateProspect(rng, s.season.tier, grade);
    s.prospects.push(pr);
    s.scoutReadyAt = now + scoutCooldownMs(s.facilities.scouting);
    this.saveRng(rng);
    return pr;
  }

  /** Diamond scout pack; returns the prospect or null (checks funds/capacity). */
  buyPack(packId: string): Prospect | null {
    const s = this.state;
    const pack = packById(packId);
    if (!pack) return null;
    if (s.diamonds < pack.cost) return null;
    if (s.prospects.length >= BALANCE.maxProspects) return null;
    const rng = this.rng();
    s.diamonds -= pack.cost;
    const pr = openPack(rng, pack, s.season.tier);
    s.prospects.push(pr);
    s.career.packsOpened++;
    this.saveRng(rng);
    return pr;
  }

  /** Spend diamonds to finish a prospect's development instantly. */
  rushProspect(prospectId: string): boolean {
    const s = this.state;
    const pr = s.prospects.find((x) => x.id === prospectId);
    if (!pr || pr.dev >= 100) return false;
    const cost = rushCost(pr, this.devSpeed());
    if (s.diamonds < cost) return false;
    s.diamonds -= cost;
    pr.dev = 100;
    return true;
  }

  /** Call up a developed prospect, replacing a roster player (who is sold). */
  callUp(prospectId: string, replacePlayerId: string): boolean {
    const s = this.state;
    const pr = s.prospects.find((x) => x.id === prospectId);
    const idx = s.roster.findIndex((x) => x.id === replacePlayerId);
    if (!pr || pr.dev < 100 || idx === -1) return false;
    const outgoing = s.roster[idx];
    // position compatibility: pitchers replace pitchers, batters replace batters
    if ((pr.pos === 'P') !== (outgoing.pos === 'P')) return false;
    const rng = this.rng();
    const player = callUpProspect(rng, pr, s.season.tier);
    player.pos = outgoing.pos;
    s.roster[idx] = player;
    s.prospects = s.prospects.filter((x) => x.id !== prospectId);
    s.cash += Math.floor(playerValue(outgoing, s.season.tier) * BALANCE.releaseRefundFrac);
    this.saveRng(rng);
    this.checkMilestones();
    return true;
  }

  releaseProspect(prospectId: string): boolean {
    const s = this.state;
    const pr = s.prospects.find((x) => x.id === prospectId);
    if (!pr) return false;
    s.prospects = s.prospects.filter((x) => x.id !== prospectId);
    s.cash += Math.floor(prospectValue(pr) * 0.3);
    return true;
  }

  /** Player-initiated trade. Returns the evaluation (applied when accepted). */
  proposeTrade(offer: TradeOffer): ReturnType<typeof evaluateTrade> {
    const s = this.state;
    const evaln = evaluateTrade(offer, s.season.tier);
    if (evaln.accepted && s.cash >= offer.giveCash) {
      const aiTeam = s.season.aiTeams.find((t) => t.id === offer.aiTeamId);
      if (!aiTeam) return { ...evaln, accepted: false };
      const res = applyTrade(offer, s.roster, s.prospects, aiTeam);
      s.roster = res.roster;
      s.prospects = res.prospects;
      s.cash += res.cashDelta;
      s.career.tradesCompleted++;
      this.checkMilestones();
      return evaln;
    }
    return { ...evaln, accepted: false };
  }

  acceptIncomingOffer(now: number): boolean {
    const s = this.state;
    const offer = s.incomingOffer;
    if (!offer || offer.expiresAt < now) {
      s.incomingOffer = null;
      return false;
    }
    const idx = s.roster.findIndex((p) => p.id === offer.wantsPlayerId);
    const aiTeam = s.season.aiTeams.find((t) => t.id === offer.aiTeamId);
    if (idx === -1 || !aiTeam) {
      s.incomingOffer = null;
      return false;
    }
    const outgoing = s.roster[idx];
    s.roster[idx] = { ...offer.offersPlayer, pos: outgoing.pos };
    aiTeam.roster = aiTeam.roster.map((p) =>
      p.id === offer.offersPlayer.id ? { ...outgoing, pos: p.pos } : p,
    );
    s.cash += offer.offersCash;
    s.career.tradesCompleted++;
    s.incomingOffer = null;
    this.checkMilestones();
    return true;
  }

  declineIncomingOffer(): void {
    this.state.incomingOffer = null;
  }

  // ---- Monetization hooks (called by services after ad/purchase succeeds) ----

  grantIncomeBoost(now: number): void {
    this.state.boostUntil = Math.max(now, this.state.boostUntil) + BALANCE.incomeBoostDurationMs;
  }

  grantInstantGames(now: number): number {
    return this.tick(BALANCE.simGamesReward * BALANCE.gameDurationMs, now, BALANCE.simGamesReward);
  }

  /** Rewarded-ad diamonds, daily-capped. Returns granted amount (0 if capped). */
  grantAdDiamonds(now: number): number {
    const s = this.state;
    const day = new Date(now).toISOString().slice(0, 10);
    if (s.rewardedAdDay !== day) {
      s.rewardedAdDay = day;
      s.rewardedAdCount = 0;
    }
    if (s.rewardedAdCount >= BALANCE.diamondsRewardedAdDailyCap) return 0;
    s.rewardedAdCount++;
    s.diamonds += BALANCE.diamondsRewardedAd;
    return BALANCE.diamondsRewardedAd;
  }

  grantDiamonds(amount: number): void {
    this.state.diamonds += amount;
  }

  /** Apply a purchased deal's contents. */
  applyDeal(dealId: string, now: number): void {
    const s = this.state;
    const deal = purchaseOffer(s.offers, dealId, now);
    s.diamonds += deal.diamonds;
    s.cash += Math.floor(
      deal.cashWinsMult * gameIncome({ ...this.incomeCtx(now), boostActive: false }, true, 0),
    );
    if (deal.prospectGrade && s.prospects.length < BALANCE.maxProspects) {
      const rng = this.rng();
      s.prospects.push(generateProspect(rng, s.season.tier, deal.prospectGrade as Grade));
      this.saveRng(rng);
    }
  }

  // ---- Prestige ----

  prestigeAvailable(): boolean {
    return this.state.career.championships > 0;
  }

  prestigeGain(): number {
    return BALANCE.legacyPointsFor(this.state.career.highestTier, this.state.career.championships);
  }

  /** Start a new franchise: reset progress, keep legacy + career + purchased deals. */
  prestige(now: number): GameState {
    const s = this.state;
    if (!this.prestigeAvailable()) return s;
    const gained = this.prestigeGain();
    s.career.prestiges++;
    const fresh = newGameState(
      s.rngSeed ^ (now & 0xffff),
      s.teamName,
      now,
      s.legacyPoints + gained,
      s.prestigeCount + 1,
      s.offers,
      s.career,
    );
    fresh.createdAt = s.createdAt;
    fresh.milestonesClaimed = s.milestonesClaimed;
    const freshOffers = updateOffers(s.offers, {
      promotions: s.career.promotions,
      championships: s.career.championships,
      prestiges: s.career.prestiges,
      now,
    });
    this.state = fresh;
    for (const o of freshOffers) this.events.offerAppeared?.(o.dealId);
    return fresh;
  }

  rank(): number {
    return playerRank(this.state.season, this.state.teamName);
  }
}

export { TOP_TIER, nextId };
