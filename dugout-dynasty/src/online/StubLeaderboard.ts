import { Rng } from '../core/rng';
import { TEAM_NAMES_A, TEAM_NAMES_B } from '../core/content';
import { LeaderboardCategory } from '../core/stats';
import { LeaderboardEntry, LeaderboardScores, LeaderboardService } from './LeaderboardService';

/**
 * Local leaderboard with seeded fake rivals, so the screen is alive before
 * Firebase is configured. Your own scores are mixed into the board.
 */
export class StubLeaderboard implements LeaderboardService {
  private you: { teamName: string; scores: LeaderboardScores } | null = null;
  private rivals: Record<LeaderboardCategory, LeaderboardEntry[]>;

  constructor(seed = 20260714) {
    const rng = new Rng(seed);
    const names: string[] = [];
    const used = new Set<string>();
    while (names.length < 20) {
      const n = `${rng.pick(TEAM_NAMES_A)} ${rng.pick(TEAM_NAMES_B)}`;
      if (!used.has(n)) {
        used.add(n);
        names.push(n);
      }
    }
    const make = (base: number, spread: number, round = 1): LeaderboardEntry[] =>
      names
        .map((teamName, i) => ({
          teamName,
          score: Math.round((base * Math.pow(spread, (20 - i) / 4) * rng.range(0.8, 1.2)) / round) * round,
        }))
        .sort((a, b) => b.score - a.score);

    this.rivals = {
      rating: make(15, 2.4),
      worth: make(2500, 3.2),
      hr: make(40, 2.6),
      championships: make(1, 1.8),
    };
  }

  isOnline(): boolean {
    return false;
  }

  async submit(_playerId: string, teamName: string, scores: LeaderboardScores): Promise<void> {
    this.you = { teamName, scores };
  }

  async top(category: LeaderboardCategory, limit: number): Promise<LeaderboardEntry[]> {
    const board = [...this.rivals[category]];
    if (this.you) {
      board.push({ teamName: this.you.teamName, score: Math.floor(this.you.scores[category]), isYou: true });
    }
    return board.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
