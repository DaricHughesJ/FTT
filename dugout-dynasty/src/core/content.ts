// All balance numbers and content pools live here so tuning is one-file work.

export const LEAGUES = [
  { name: 'Backyard League', short: 'BYL' },
  { name: 'Sandlot League', short: 'SLL' },
  { name: 'Rookie League', short: 'RKL' },
  { name: 'Class A', short: 'A' },
  { name: 'Double-A', short: 'AA' },
  { name: 'Triple-A', short: 'AAA' },
  { name: 'Continental League', short: 'CTL' },
  { name: 'Premier League', short: 'PRL' },
  { name: 'World League', short: 'WDL' },
  { name: 'Galaxy League', short: 'GXL' },
] as const;

export const TOP_TIER = LEAGUES.length - 1;

export const BALANCE = {
  // Season / league structure
  gamesPerSeason: 20,
  teamsPerLeague: 8, // player + 7 AI
  promotionRank: 2, // finish 1st or 2nd to promote
  gameDurationMs: 30_000, // one game of real time in the live view

  // Stats: average stat for a league tier. Player catches up via prospects/trades.
  leagueAvgStat: (tier: number) => 10 * Math.pow(2, tier),

  // Economy
  winIncomeBase: 60,
  winIncomeTierMult: 3.2, // income per win = base * mult^tier * fanMult * boosts
  runIncomeFrac: 0.06, // each run scores this fraction of win income
  lossIncomeFrac: 0.25,

  // Player upgrades: effective stat = base * (1 + upgradeStatFrac * up)
  upgradeStatFrac: 0.1,
  upgradeCostBase: 30,
  upgradeCostGrowth: 1.35,
  upgradeCostTierMult: 4,

  // Facilities: cost = base * growth^level
  facilities: {
    stadium: { base: 400, growth: 2.1, max: 40 },
    training: { base: 600, growth: 2.3, max: 25 },
    scouting: { base: 500, growth: 2.2, max: 25 },
  },
  facilityCostTierMult: 1.9, // facilities also scale with the tier they're bought at
  fanBase: 100,
  fansPerStadiumLevel: 1.45, // fans = fanBase * this^level
  fanIncomeLog: true, // fanMult = 1 + log10(fans / fanBase)

  trainingDevSpeedPerLevel: 0.35, // prospect dev speed mult = 1 + this*level
  trainingDiscountPerLevel: 0.02, // upgrade cost discount, capped below
  trainingDiscountCap: 0.4,

  scoutCooldownMs: 90_000, // "Scout" action cooldown
  scoutCooldownReducePerLevel: 0.04, // -4%/level, floor 30%
  scoutCostFrac: 0.5, // scout cost = frac * current win income

  // Prospects
  maxProspects: 6,
  prospectDevHours: { C: 0.4, B: 1, A: 2.5, S: 5 } as Record<string, number>,
  prospectGradeMult: { C: 0.92, B: 1.1, A: 1.35, S: 1.75 } as Record<string, number>,
  prospectRushDiamondsPerHour: 12, // diamonds to instantly finish remaining dev
  releaseRefundFrac: 0.2, // cash back when a called-up starter replaces someone

  // Scout packs (diamonds): odds must be shown in UI — store-policy requirement
  packs: [
    { id: 'bronze', name: 'Bronze Scout Pack', cost: 40, odds: { C: 0.6, B: 0.3, A: 0.09, S: 0.01 } },
    { id: 'silver', name: 'Silver Scout Pack', cost: 120, odds: { C: 0.25, B: 0.45, A: 0.24, S: 0.06 } },
    { id: 'gold', name: 'Gold Scout Pack', cost: 320, odds: { C: 0, B: 0.4, A: 0.44, S: 0.16 } },
  ],
  scoutOfficeGradeShift: 0.03, // per level: shifts scout-action odds toward better grades

  // Trades
  tradeCashValueFrac: 0.85, // AI values your cash at 85 cents on the dollar
  tradeAcceptMargin: 1.15, // AI accepts if it receives >= margin * what it gives
  incomingOfferChance: 0.06, // per completed game
  playerValueBase: 40, // value = base * 4^tier * (stat/leagueAvg)^2
  prospectValueByGrade: { C: 25, B: 70, A: 220, S: 650 } as Record<string, number>,

  // Diamonds
  diamondsPromotion: 25,
  diamondsChampionship: 60,
  diamondsRewardedAd: 6,
  diamondsRewardedAdDailyCap: 5, // times per day
  startingDiamonds: 60,

  // Boosts / ads
  incomeBoostMult: 2,
  incomeBoostDurationMs: 4 * 3600_000,
  simGamesReward: 10, // "sim N games instantly" rewarded ad
  interstitialMinIntervalMs: 3 * 60_000,
  interstitialGraceMs: 10 * 60_000, // no interstitials in first N ms after install

  // Offline
  offlineCapMs: 8 * 3600_000,
  offlineMinMs: 60_000, // absences shorter than this resolve via the normal tick

  // Prestige: legacy points from career progress; each point = +2% income & dev speed
  legacyIncomePerPoint: 0.02,
  legacyPointsFor: (highestTier: number, championships: number) =>
    Math.floor(Math.pow(highestTier, 1.6) + championships * 2),

  startingCash: 150,
} as const;

export type PackDef = (typeof BALANCE.packs)[number];

export const MILESTONES: { id: string; label: string; diamonds: number; check: (s: MilestoneStats) => boolean }[] = [
  { id: 'hr10', label: 'Hit 10 career home runs', diamonds: 10, check: (s) => s.careerHr >= 10 },
  { id: 'hr100', label: 'Hit 100 career home runs', diamonds: 20, check: (s) => s.careerHr >= 100 },
  { id: 'hr1000', label: 'Hit 1,000 career home runs', diamonds: 40, check: (s) => s.careerHr >= 1000 },
  { id: 'wins50', label: 'Win 50 career games', diamonds: 15, check: (s) => s.careerWins >= 50 },
  { id: 'wins500', label: 'Win 500 career games', diamonds: 40, check: (s) => s.careerWins >= 500 },
  { id: 'worth10k', label: 'Reach $10K team worth', diamonds: 10, check: (s) => s.teamWorth >= 10_000 },
  { id: 'worth1m', label: 'Reach $1M team worth', diamonds: 30, check: (s) => s.teamWorth >= 1_000_000 },
  { id: 'champ3', label: 'Win 3 championships', diamonds: 30, check: (s) => s.championships >= 3 },
];

export interface MilestoneStats {
  careerHr: number;
  careerWins: number;
  teamWorth: number;
  championships: number;
}

export const FIRST_NAMES = [
  'Ace', 'Bo', 'Cal', 'Dex', 'Eli', 'Fitz', 'Gus', 'Hank', 'Ike', 'Jax',
  'Kip', 'Lou', 'Mac', 'Nico', 'Otto', 'Pax', 'Quinn', 'Rex', 'Sal', 'Tuck',
  'Van', 'Wade', 'Xavi', 'York', 'Zeke', 'Buck', 'Chip', 'Duke', 'Finn', 'Moose',
];

export const LAST_NAMES = [
  'Bats', 'Cannon', 'Diamond', 'Fielder', 'Gloves', 'Homer', 'Iron', 'Jets',
  'Knuckles', 'Laser', 'Mound', 'Nails', 'Oakley', 'Pop', 'Quick', 'Rocket',
  'Slugger', 'Thunder', 'Uppercut', 'Vulture', 'Wheels', 'Yard', 'Zip',
  'Baldwin', 'Cortez', 'Delgado', 'Evans', 'Franco', 'Griffin', 'Hayes',
  'Ivers', 'Jenkins', 'Kowalski', 'Lopez', 'Murphy', 'Novak', "O'Neil",
  'Perez', 'Reyes', 'Suzuki', 'Torres', 'Vaughn', 'Walker', 'Yamada', 'Zimmer',
];

export const TEAM_NAMES_A = [
  'Rusty', 'Roaring', 'Flying', 'Mighty', 'Screaming', 'Golden', 'Iron',
  'Thundering', 'Blazing', 'Sneaky', 'Howling', 'Electric', 'Fighting', 'Lucky',
];

export const TEAM_NAMES_B = [
  'Badgers', 'Comets', 'Dingers', 'Emus', 'Falcons', 'Gators', 'Hornets',
  'Jackals', 'Krakens', 'Llamas', 'Mudcats', 'Otters', 'Pythons', 'Racoons',
  'Sluggers', 'Titans', 'Vipers', 'Wombats', 'Yetis', 'Zephyrs',
];

export const POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const;
