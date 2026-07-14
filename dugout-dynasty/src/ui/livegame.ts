import { GameResult, PlayEvent } from '../core/sim';

/**
 * Canvas renderer for the live game view: a stylized diamond, base runners,
 * and the most recent play. Reads the pre-simmed events up to the current
 * game progress — pure presentation, zero game logic.
 */
export interface LiveSnapshot {
  homeScore: number;
  awayScore: number;
  inning: number;
  half: 'top' | 'bottom';
  bases: [boolean, boolean, boolean];
  lastEvent: PlayEvent | null;
}

export function snapshotAt(result: GameResult, progress: number): LiveSnapshot {
  let homeScore = 0;
  let awayScore = 0;
  let inning = 1;
  let half: 'top' | 'bottom' = 'top';
  let bases: [boolean, boolean, boolean] = [false, false, false];
  let lastEvent: PlayEvent | null = null;
  let halfKey = '1top';

  for (const e of result.events) {
    if (e.t > progress) break;
    const key = `${e.inning}${e.half}`;
    if (key !== halfKey) {
      halfKey = key;
      bases = [false, false, false];
    }
    inning = e.inning;
    half = e.half;
    lastEvent = e;
    if (e.kind !== 'out') {
      bases = advance(bases, e.kind === 'single' ? 1 : e.kind === 'double' ? 2 : e.kind === 'triple' ? 3 : 4);
    }
    if (e.half === 'top') awayScore += e.runsScored;
    else homeScore += e.runsScored;
  }
  return { homeScore, awayScore, inning, half, bases, lastEvent };
}

function advance(bases: [boolean, boolean, boolean], move: number): [boolean, boolean, boolean] {
  const next: [boolean, boolean, boolean] = [false, false, false];
  for (let i = 0; i < 3; i++) {
    if (!bases[i]) continue;
    const target = i + move;
    if (target < 3) next[target] = true;
  }
  if (move < 4) next[move - 1] = true;
  return next;
}

export function drawField(canvas: HTMLCanvasElement, snap: LiveSnapshot, progress: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;

  // grass
  ctx.fillStyle = '#1c4423';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#245229';
  for (let i = 0; i < 6; i++) {
    if (i % 2 === 0) continue;
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.92, (w * 0.75 * (i + 1)) / 6, Math.PI, 0);
    ctx.arc(w / 2, h * 0.92, (w * 0.75 * i) / 6, 0, Math.PI, true);
    ctx.fill();
  }

  const cx = w / 2;
  const homeY = h * 0.86;
  const d = Math.min(w, h) * 0.3; // base distance

  const baseXY: [number, number][] = [
    [cx + d, homeY - d], // 1st
    [cx, homeY - d * 2], // 2nd
    [cx - d, homeY - d], // 3rd
  ];

  // infield dirt
  ctx.fillStyle = '#8a5a33';
  ctx.beginPath();
  ctx.moveTo(cx, homeY + 14);
  ctx.lineTo(cx + d + 16, homeY - d);
  ctx.lineTo(cx, homeY - d * 2 - 16);
  ctx.lineTo(cx - d - 16, homeY - d);
  ctx.closePath();
  ctx.fill();

  // base paths
  ctx.strokeStyle = '#c9a06c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, homeY);
  ctx.lineTo(baseXY[0][0], baseXY[0][1]);
  ctx.lineTo(baseXY[1][0], baseXY[1][1]);
  ctx.lineTo(baseXY[2][0], baseXY[2][1]);
  ctx.closePath();
  ctx.stroke();

  // pitcher mound
  ctx.fillStyle = '#a06b3d';
  ctx.beginPath();
  ctx.arc(cx, homeY - d, 9, 0, Math.PI * 2);
  ctx.fill();

  // bases (occupied = gold)
  const drawBase = (x: number, y: number, occupied: boolean) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = occupied ? '#ffd23f' : '#f2ede2';
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
  };
  drawBase(baseXY[0][0], baseXY[0][1], snap.bases[0]);
  drawBase(baseXY[1][0], baseXY[1][1], snap.bases[1]);
  drawBase(baseXY[2][0], baseXY[2][1], snap.bases[2]);

  // home plate
  ctx.fillStyle = '#f2ede2';
  ctx.beginPath();
  ctx.arc(cx, homeY, 7, 0, Math.PI * 2);
  ctx.fill();

  // last play flair: ball flying out on a homer
  if (snap.lastEvent && snap.lastEvent.kind === 'homer') {
    const wob = (progress * 40) % 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx + wob * w * 0.3 - w * 0.15, homeY - d * 2 - 30 - wob * 24, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // inning indicator
  ctx.fillStyle = '#eaf5ec';
  ctx.font = 'bold 13px Trebuchet MS, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${snap.half === 'top' ? '▲' : '▼'} Inning ${snap.inning}`, 10, 20);
}

export function playText(e: PlayEvent | null, opponentName: string): string {
  if (!e) return `Game starting vs ${opponentName}…`;
  const who = e.half === 'bottom' ? e.batter : `${opponentName}'s ${e.batter}`;
  switch (e.kind) {
    case 'out':
      return `${who} is retired.`;
    case 'single':
      return `${who} raps a single!`;
    case 'double':
      return `${who} rips a double!`;
    case 'triple':
      return `${who} legs out a triple!`;
    case 'homer':
      return `💥 ${who} CRUSHES a home run${e.runsScored > 1 ? ` — ${e.runsScored} runs score!` : '!'}`;
  }
}
