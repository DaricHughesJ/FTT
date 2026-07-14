import { Rng } from './rng';
import { BALANCE, FIRST_NAMES, LAST_NAMES, POSITIONS } from './content';

export type Position = (typeof POSITIONS)[number] | 'P';
export type Grade = 'C' | 'B' | 'A' | 'S';

export interface Player {
  id: string;
  name: string;
  pos: Position;
  /** Base stats, set at generation/call-up time. */
  bat: number;
  arm: number;
  spd: number;
  /** Upgrade count; effective stat = base * (1 + upgradeStatFrac * up). */
  up: number;
}

export interface Prospect {
  id: string;
  name: string;
  pos: Position;
  grade: Grade;
  /** 0..100 development progress. */
  dev: number;
  /** Tier the prospect was scouted at — call-up stats scale from this. */
  tier: number;
}

let idCounter = 0;
export function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export function randomName(rng: Rng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

export function effectiveStat(base: number, up: number): number {
  return base * (1 + BALANCE.upgradeStatFrac * up);
}

export function playerBat(p: Player): number {
  return effectiveStat(p.bat, p.up);
}
export function playerArm(p: Player): number {
  return effectiveStat(p.arm, p.up);
}
export function playerSpd(p: Player): number {
  return effectiveStat(p.spd, p.up);
}

/** Overall rating of one player: batters weigh bat/spd, pitchers weigh arm. */
export function playerRating(p: Player): number {
  if (p.pos === 'P') return playerArm(p);
  return (playerBat(p) * 2 + playerSpd(p)) / 3;
}

export function teamRating(roster: Player[]): number {
  if (roster.length === 0) return 0;
  return roster.reduce((sum, p) => sum + playerRating(p), 0) / roster.length;
}

/** Generate one player around a league-average stat line. quality ~1 is average. */
export function generatePlayer(rng: Rng, tier: number, pos: Position, quality = 1): Player {
  const avg = BALANCE.leagueAvgStat(tier) * quality;
  const jitter = () => avg * rng.range(0.82, 1.18);
  return {
    id: nextId('p'),
    name: randomName(rng),
    pos,
    bat: pos === 'P' ? jitter() * 0.5 : jitter(),
    arm: pos === 'P' ? jitter() : jitter() * 0.5,
    spd: jitter(),
    up: 0,
  };
}

/** A full 9 batters + 3 pitchers roster. */
export function generateRoster(rng: Rng, tier: number, quality = 1): Player[] {
  const roster: Player[] = POSITIONS.map((pos) => generatePlayer(rng, tier, pos, quality));
  for (let i = 0; i < 3; i++) roster.push(generatePlayer(rng, tier, 'P', quality));
  return roster;
}

export function upgradeCost(p: Player, tier: number, trainingLevel: number): number {
  const discount = Math.min(
    BALANCE.trainingDiscountCap,
    BALANCE.trainingDiscountPerLevel * trainingLevel,
  );
  return Math.ceil(
    BALANCE.upgradeCostBase *
      Math.pow(BALANCE.upgradeCostTierMult, tier) *
      Math.pow(BALANCE.upgradeCostGrowth, p.up) *
      (1 - discount),
  );
}

/** Market value of a player, used for trades and team worth. */
export function playerValue(p: Player, tier: number): number {
  const avg = BALANCE.leagueAvgStat(tier);
  const rel = playerRating(p) / avg;
  return BALANCE.playerValueBase * Math.pow(4, tier) * rel * rel;
}

export function prospectValue(pr: Prospect): number {
  const base = BALANCE.prospectValueByGrade[pr.grade];
  return base * Math.pow(4, pr.tier) * (0.5 + pr.dev / 200);
}

export function generateProspect(rng: Rng, tier: number, grade: Grade): Prospect {
  const pos = rng.chance(0.25) ? 'P' : rng.pick(POSITIONS);
  return { id: nextId('pr'), name: randomName(rng), pos, grade, dev: 0, tier };
}

/** Hours of development a grade needs at 1x speed. */
export function prospectDevHours(grade: Grade): number {
  return BALANCE.prospectDevHours[grade];
}

/** Advance a prospect's development by elapsed ms. Returns true if it just finished. */
export function developProspect(pr: Prospect, elapsedMs: number, devSpeedMult: number): boolean {
  if (pr.dev >= 100) return false;
  const fullMs = prospectDevHours(pr.grade) * 3600_000;
  pr.dev = Math.min(100, pr.dev + (elapsedMs / fullMs) * 100 * devSpeedMult);
  return pr.dev >= 100;
}

/** Diamonds required to instantly finish development. */
export function rushCost(pr: Prospect, devSpeedMult: number): number {
  if (pr.dev >= 100) return 0;
  const fullMs = prospectDevHours(pr.grade) * 3600_000;
  const remainingMs = (fullMs * (100 - pr.dev)) / 100 / devSpeedMult;
  return Math.max(1, Math.ceil((remainingMs / 3600_000) * BALANCE.prospectRushDiamondsPerHour));
}

/** Convert a fully developed prospect into a Player at the *current* league tier. */
export function callUpProspect(rng: Rng, pr: Prospect, currentTier: number): Player {
  const avg = BALANCE.leagueAvgStat(currentTier);
  const mult = BALANCE.prospectGradeMult[pr.grade];
  const stat = () => avg * mult * rng.range(0.9, 1.1);
  return {
    id: nextId('p'),
    name: pr.name,
    pos: pr.pos,
    bat: pr.pos === 'P' ? stat() * 0.5 : stat(),
    arm: pr.pos === 'P' ? stat() : stat() * 0.5,
    spd: stat(),
    up: 0,
  };
}
