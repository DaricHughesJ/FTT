import { Rng } from './rng';
import { BALANCE } from './content';
import { Player, playerValue, Prospect, prospectValue } from './roster';
import { AITeam } from './season';

export interface TradeOffer {
  /** What the player gives up. Exactly one player (keeps roster shape) + sweeteners. */
  givePlayer: Player;
  giveProspects: Prospect[];
  giveCash: number;
  /** What the player receives. */
  receivePlayer: Player;
  aiTeamId: string;
}

export interface TradeEvaluation {
  giveValue: number; // value the AI receives
  receiveValue: number; // value the AI gives up
  accepted: boolean;
  /** receive/give ratio the AI demands. */
  margin: number;
}

/** Value of the assets the AI would RECEIVE in this offer. */
export function offerGiveValue(offer: Pick<TradeOffer, 'givePlayer' | 'giveProspects' | 'giveCash'>, tier: number): number {
  let v = playerValue(offer.givePlayer, tier);
  for (const pr of offer.giveProspects) v += prospectValue(pr);
  v += offer.giveCash * BALANCE.tradeCashValueFrac;
  return v;
}

export function evaluateTrade(offer: TradeOffer, tier: number): TradeEvaluation {
  const giveValue = offerGiveValue(offer, tier);
  const receiveValue = playerValue(offer.receivePlayer, tier);
  return {
    giveValue,
    receiveValue,
    accepted: giveValue >= receiveValue * BALANCE.tradeAcceptMargin,
    margin: BALANCE.tradeAcceptMargin,
  };
}

/**
 * Apply an accepted trade: swaps the players between rosters, removes traded
 * prospects, deducts cash. Caller must have validated `accepted`.
 */
export function applyTrade(
  offer: TradeOffer,
  roster: Player[],
  prospects: Prospect[],
  aiTeam: AITeam,
): { roster: Player[]; prospects: Prospect[]; cashDelta: number } {
  const newRoster = roster.map((p) =>
    p.id === offer.givePlayer.id ? { ...offer.receivePlayer, pos: p.pos } : p,
  );
  aiTeam.roster = aiTeam.roster.map((p) =>
    p.id === offer.receivePlayer.id ? { ...offer.givePlayer, pos: p.pos } : p,
  );
  const tradedIds = new Set(offer.giveProspects.map((pr) => pr.id));
  const newProspects = prospects.filter((pr) => !tradedIds.has(pr.id));
  return { roster: newRoster, prospects: newProspects, cashDelta: -offer.giveCash };
}

export interface IncomingOffer {
  aiTeamId: string;
  aiTeamName: string;
  /** AI wants this player of yours... */
  wantsPlayerId: string;
  /** ...and offers this player plus cash. */
  offersPlayer: Player;
  offersCash: number;
  expiresAt: number;
}

/**
 * Occasionally the AI covets one of your players and offers player + cash.
 * The AI overpays slightly, so incoming offers are usually worth reading.
 */
export function maybeGenerateIncomingOffer(
  rng: Rng,
  roster: Player[],
  aiTeams: AITeam[],
  tier: number,
  now: number,
): IncomingOffer | null {
  if (!rng.chance(BALANCE.incomingOfferChance)) return null;
  const team = rng.pick(aiTeams);
  if (team.roster.length === 0 || roster.length === 0) return null;
  const wants = rng.pick(roster);
  const gives = rng.pick(team.roster);
  const wantValue = playerValue(wants, tier);
  const giveValue = playerValue(gives, tier);
  const cash = Math.max(0, Math.ceil((wantValue * rng.range(1.0, 1.25) - giveValue)));
  return {
    aiTeamId: team.id,
    aiTeamName: team.name,
    wantsPlayerId: wants.id,
    offersPlayer: gives,
    offersCash: cash,
    expiresAt: now + 10 * 60_000,
  };
}
