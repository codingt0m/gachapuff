const pad = (n: number) => String(n).padStart(2, '0');

/** 3 h 59 min 12 s -> "3:59:12", 4 min 5 s -> "04:05". */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
const numberFormat = new Intl.NumberFormat('fr-FR');

export const formatDate = (epoch: number) => dateFormat.format(epoch);

export function formatPuffs(puffs: number | null): string {
  return puffs === null ? 'Capacité inconnue' : `${numberFormat.format(puffs)} bouffées`;
}

export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits })} %`;
}
