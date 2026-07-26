const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function formatNumber(n: number): string {
  if (!isFinite(n)) return '∞';
  const neg = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n < 1000) return neg + (Number.isInteger(n) ? n.toString() : n.toFixed(1));
  let tier = Math.floor(Math.log10(n) / 3);
  tier = Math.min(tier, SUFFIXES.length - 1);
  const scaled = n / Math.pow(10, tier * 3);
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return neg + scaled.toFixed(digits) + SUFFIXES[tier];
}

export function formatCash(n: number): string {
  return '$' + formatNumber(Math.round(n));
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
