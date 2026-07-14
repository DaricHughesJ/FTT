import { LeaderboardCategory } from '../core/stats';

export interface LeaderboardEntry {
  teamName: string;
  score: number;
  isYou?: boolean;
}

export interface LeaderboardScores {
  rating: number;
  worth: number;
  hr: number;
  championships: number;
}

/**
 * Online leaderboards. Two implementations ship: StubLeaderboard (local,
 * seeded rivals — always available) and FirebaseLeaderboard (activates when
 * firebase-config.ts has real values). Google Play Games / Game Center can
 * implement this same interface at store time.
 */
export interface LeaderboardService {
  submit(playerId: string, teamName: string, scores: LeaderboardScores): Promise<void>;
  top(category: LeaderboardCategory, limit: number): Promise<LeaderboardEntry[]>;
  isOnline(): boolean;
}

const BANNED_WORDS = ['ass', 'shit', 'fuck', 'bitch', 'cunt', 'dick', 'nigg', 'fag', 'rape'];

/** Light profanity filter for team names shown on public boards. */
export function sanitizeTeamName(name: string): string {
  const clean = name.replace(/[^\w\s'!-]/g, '').trim().slice(0, 24);
  // normalize common letter substitutions before matching (sh1t, f@ck, …)
  const lower = clean
    .toLowerCase()
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4|@/g, 'a')
    .replace(/0/g, 'o')
    .replace(/5|\$/g, 's')
    .replace(/[^a-z]/g, '');
  for (const w of BANNED_WORDS) {
    if (lower.includes(w)) return 'Anonymous Franchise';
  }
  return clean.length >= 2 ? clean : 'Anonymous Franchise';
}
