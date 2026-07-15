import { Rng } from './rng';
import { BALANCE, TEAM_NAMES_A, TEAM_NAMES_B, TOP_TIER } from './content';
import { generateRoster, Player, teamRating } from './roster';
import { quickWinProb } from './sim';

export interface AITeam {
  id: string;
  name: string;
  roster: Player[];
  wins: number;
  losses: number;
}

export interface SeasonState {
  tier: number;
  gameIndex: number; // 0..gamesPerSeason
  playerWins: number;
  playerLosses: number;
  aiTeams: AITeam[]; // 7 opponents
  /** Opponent index for the upcoming game. */
  nextOpponent: number;
  seasonHr: number;
  seasonRuns: number;
}

export function generateAITeams(rng: Rng, tier: number): AITeam[] {
  const teams: AITeam[] = [];
  const used = new Set<string>();
  const count = BALANCE.teamsPerLeague - 1;
  while (teams.length < count) {
    const name = `${rng.pick(TEAM_NAMES_A)} ${rng.pick(TEAM_NAMES_B)}`;
    if (used.has(name)) continue;
    used.add(name);
    // Spread of team quality within a league so there are fleecable bottom-feeders
    const quality = 0.75 + (teams.length / (count - 1)) * 0.55;
    teams.push({
      id: `ai${tier}-${teams.length}`,
      name,
      roster: generateRoster(rng, tier, quality),
      wins: 0,
      losses: 0,
    });
  }
  return teams;
}

export function newSeason(rng: Rng, tier: number, keepTeams?: AITeam[]): SeasonState {
  const aiTeams = keepTeams ?? generateAITeams(rng, tier);
  for (const t of aiTeams) {
    t.wins = 0;
    t.losses = 0;
  }
  return {
    tier,
    gameIndex: 0,
    playerWins: 0,
    playerLosses: 0,
    aiTeams,
    nextOpponent: rng.int(0, aiTeams.length - 1),
    seasonHr: 0,
    seasonRuns: 0,
  };
}

/** After the player's game resolves, AI teams play a matchday among themselves. */
export function playAiMatchday(rng: Rng, season: SeasonState, playerOpponentIdx: number): void {
  const idle = season.aiTeams.map((_, i) => i).filter((i) => i !== playerOpponentIdx);
  // pair them up (6 idle teams -> 3 games)
  for (let i = 0; i + 1 < idle.length; i += 2) {
    const a = season.aiTeams[idle[i]];
    const b = season.aiTeams[idle[i + 1]];
    const pA = quickWinProb(teamRating(a.roster), teamRating(b.roster));
    if (rng.chance(pA)) {
      a.wins++;
      b.losses++;
    } else {
      b.wins++;
      a.losses++;
    }
  }
}

export interface StandingRow {
  name: string;
  wins: number;
  losses: number;
  isPlayer: boolean;
  aiIndex: number; // -1 for player
}

export function standings(season: SeasonState, teamName: string): StandingRow[] {
  const rows: StandingRow[] = [
    {
      name: teamName,
      wins: season.playerWins,
      losses: season.playerLosses,
      isPlayer: true,
      aiIndex: -1,
    },
    ...season.aiTeams.map((t, i) => ({
      name: t.name,
      wins: t.wins,
      losses: t.losses,
      isPlayer: false,
      aiIndex: i,
    })),
  ];
  return rows.sort((a, b) => b.wins - a.wins || a.losses - b.losses);
}

export function playerRank(season: SeasonState, teamName: string): number {
  return standings(season, teamName).findIndex((r) => r.isPlayer) + 1;
}

export function seasonOver(season: SeasonState): boolean {
  return season.gameIndex >= BALANCE.gamesPerSeason;
}

export interface SeasonOutcome {
  rank: number;
  promoted: boolean;
  champion: boolean;
}

export function seasonOutcome(season: SeasonState, teamName: string): SeasonOutcome {
  const rank = playerRank(season, teamName);
  return {
    rank,
    promoted: rank <= BALANCE.promotionRank && season.tier < TOP_TIER,
    champion: rank === 1,
  };
}
