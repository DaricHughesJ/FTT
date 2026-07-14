import { Rng } from './rng';
import { Player, playerArm, playerBat, playerSpd } from './roster';

export type PlayKind = 'out' | 'single' | 'double' | 'triple' | 'homer';

export interface PlayEvent {
  inning: number;
  half: 'top' | 'bottom'; // top = away bats, bottom = home bats
  batter: string;
  kind: PlayKind;
  runsScored: number;
  /** 0..1 position within the game, for pacing the live view. */
  t: number;
}

export interface GameResult {
  homeRuns: number; // runs scored by home team
  awayRuns: number;
  homeWin: boolean;
  homeHr: number; // home-team home-run count (for stats/leaderboards)
  events: PlayEvent[];
  innings: number;
}

export interface SimTeam {
  batters: Player[]; // 9
  pitchers: Player[]; // >=1; best is used
}

export function splitRoster(roster: Player[]): SimTeam {
  const batters = roster.filter((p) => p.pos !== 'P');
  const pitchers = roster.filter((p) => p.pos === 'P');
  return { batters, pitchers };
}

function bestPitcherArm(team: SimTeam): number {
  return Math.max(...team.pitchers.map((p) => playerArm(p)), 1);
}

/**
 * Arcade game sim: 3 condensed innings, at-bats resolved from batter Bat vs
 * pitcher Arm. Fully deterministic for a given Rng state.
 */
export function simGame(rng: Rng, home: SimTeam, away: SimTeam): GameResult {
  const events: PlayEvent[] = [];
  let homeRuns = 0;
  let awayRuns = 0;
  let homeHr = 0;
  const baseInnings = 3;
  let innings = baseInnings;

  const batterIdx = { home: 0, away: 0 };

  const playHalf = (side: 'home' | 'away', inning: number): number => {
    const batting = side === 'home' ? home : away;
    const pitching = side === 'home' ? away : home;
    const arm = bestPitcherArm(pitching);
    let outs = 0;
    let runs = 0;
    const bases: boolean[] = [false, false, false];
    let atBats = 0;

    while (outs < 3 && atBats < 12) {
      atBats++;
      const batter = batting.batters[batterIdx[side] % batting.batters.length];
      batterIdx[side]++;
      const bat = playerBat(batter);
      const spd = playerSpd(batter);
      const r = bat / (bat + arm); // 0.5 when evenly matched
      const hitChance = clamp(0.18 + 0.6 * (r - 0.5), 0.06, 0.62);

      let kind: PlayKind = 'out';
      let scored = 0;
      if (rng.chance(hitChance)) {
        const spdRel = clamp(spd / (bat + 1), 0.3, 2);
        // single / double / triple / homer weights
        const w = [0.58, 0.2, 0.05 * spdRel, 0.14 + 0.1 * (r - 0.5)];
        kind = (['single', 'double', 'triple', 'homer'] as const)[rng.weighted(w)];
        scored = advanceBases(bases, kind);
        runs += scored;
        if (kind === 'homer' && side === 'home') homeHr++;
      } else {
        outs++;
      }

      events.push({
        inning,
        half: side === 'away' ? 'top' : 'bottom',
        batter: batter.name,
        kind,
        runsScored: scored,
        t: 0, // filled in below once total event count is known
      });
    }
    return runs;
  };

  for (let inning = 1; inning <= innings; inning++) {
    awayRuns += playHalf('away', inning);
    homeRuns += playHalf('home', inning);
    // extra innings on a tie, capped so games always end
    if (inning === innings && homeRuns === awayRuns && innings < baseInnings + 3) {
      innings++;
    }
  }
  const homeWin = homeRuns === awayRuns ? rng.chance(0.5) : homeRuns > awayRuns;
  if (homeRuns === awayRuns) {
    // walk-off flavor run for the coin-flip winner
    if (homeWin) homeRuns++;
    else awayRuns++;
  }

  events.forEach((e, i) => {
    e.t = (i + 1) / (events.length + 1);
  });

  return { homeRuns, awayRuns, homeWin, homeHr, events, innings };
}

/** Advance base runners for a hit; returns runs scored. Batter included. */
function advanceBases(bases: boolean[], kind: PlayKind): number {
  const move = kind === 'single' ? 1 : kind === 'double' ? 2 : kind === 'triple' ? 3 : 4;
  let runs = 0;
  // shift existing runners
  for (let i = 2; i >= 0; i--) {
    if (!bases[i]) continue;
    const target = i + move;
    bases[i] = false;
    if (target >= 3) runs++;
    else bases[target] = true;
  }
  // place the batter
  if (move >= 4) runs++;
  else bases[move - 1] = true;
  return runs;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Quick rating-based winner for AI-vs-AI matchdays (no play-by-play needed). */
export function quickWinProb(ratingA: number, ratingB: number): number {
  const r = ratingA / (ratingA + ratingB);
  return clamp(0.5 + (r - 0.5) * 1.6, 0.05, 0.95);
}
