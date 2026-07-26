// Career/franchise stats tracked for milestones and leaderboards.

export interface CareerStats {
  hr: number;
  wins: number;
  losses: number;
  runs: number;
  championships: number;
  seasons: number;
  promotions: number;
  highestTier: number;
  prestiges: number;
  packsOpened: number;
  tradesCompleted: number;
}

export function newCareerStats(): CareerStats {
  return {
    hr: 0,
    wins: 0,
    losses: 0,
    runs: 0,
    championships: 0,
    seasons: 0,
    promotions: 0,
    highestTier: 0,
    prestiges: 0,
    packsOpened: 0,
    tradesCompleted: 0,
  };
}

/** Leaderboard categories — ids are stable (used as backend keys). */
export const LEADERBOARD_CATEGORIES = [
  { id: 'rating', label: 'Team Rating' },
  { id: 'worth', label: 'Team Worth' },
  { id: 'hr', label: 'Career Home Runs' },
  { id: 'championships', label: 'Championships' },
] as const;

export type LeaderboardCategory = (typeof LEADERBOARD_CATEGORIES)[number]['id'];
