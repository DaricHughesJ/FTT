import { Rng } from './rng';
import { BALANCE, PackDef } from './content';
import { generateProspect, Grade, Prospect } from './roster';

export function packById(id: string): PackDef | undefined {
  return BALANCE.packs.find((p) => p.id === id);
}

/** Roll a grade from a pack's published odds. */
export function rollGrade(rng: Rng, pack: PackDef): Grade {
  const grades: Grade[] = ['C', 'B', 'A', 'S'];
  const weights = grades.map((g) => pack.odds[g] ?? 0);
  return grades[rng.weighted(weights)];
}

/** Open a pack: returns the prospect. Caller checks diamonds + prospect capacity. */
export function openPack(rng: Rng, pack: PackDef, tier: number): Prospect {
  const grade = rollGrade(rng, pack);
  return generateProspect(rng, tier, grade);
}

/**
 * The Scout button (cash, cooldown-gated): grade odds improve with the
 * Scouting Office level, shifting weight from C toward B/A.
 */
export function scoutActionGrade(rng: Rng, scoutingLevel: number): Grade {
  const shift = Math.min(0.45, BALANCE.scoutOfficeGradeShift * scoutingLevel);
  const weights = [Math.max(0.1, 0.8 - shift * 2), 0.18 + shift, 0.02 + shift * 0.8, shift * 0.1];
  const grades: Grade[] = ['C', 'B', 'A', 'S'];
  return grades[rng.weighted(weights)];
}
