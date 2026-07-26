import { BALANCE } from './content';
import { Engine } from './state';

export interface OfflineSummary {
  awayMs: number;
  cappedMs: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  cashEarned: number;
  seasonsFinished: number;
  prospectsReady: number;
}

/**
 * Resolve time spent away. Uses the exact same tick path as live play, so
 * offline and online progress can never drift apart.
 * Returns null when the absence is too short to bother summarizing.
 */
export function resolveOffline(engine: Engine, now: number): OfflineSummary | null {
  const awayMs = now - engine.state.lastSeen;
  if (awayMs < BALANCE.offlineMinMs) return null;

  const cappedMs = Math.min(awayMs, BALANCE.offlineCapMs);
  const before = {
    wins: engine.state.career.wins,
    losses: engine.state.career.losses,
    cash: engine.state.cash,
    seasons: engine.state.career.seasons,
    ready: engine.state.prospects.filter((p) => p.dev >= 100).length,
  };

  const games = engine.tick(cappedMs, now);

  return {
    awayMs,
    cappedMs,
    gamesPlayed: games,
    wins: engine.state.career.wins - before.wins,
    losses: engine.state.career.losses - before.losses,
    cashEarned: Math.max(0, engine.state.cash - before.cash),
    seasonsFinished: engine.state.career.seasons - before.seasons,
    prospectsReady:
      engine.state.prospects.filter((p) => p.dev >= 100).length - before.ready,
  };
}
