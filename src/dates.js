// Datums-Hilfen. Tage werden als 'YYYY-MM-DD' (lokale Zeit) geführt.

const pad = n => String(n).padStart(2, '0');

export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Lokaler Tag eines ISO-Zeitstempels, so wie er auf dem iPhone geschrieben wurde. */
export function isoDay(iso) {
  return String(iso).slice(0, 10);
}

function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // Mittag: robust gegen Zeitumstellung
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Montag der Woche, in der `key` liegt. */
export function weekStart(key) {
  const d = fromKey(key);
  const dow = (d.getDay() + 6) % 7; // Mo=0 … So=6
  d.setDate(d.getDate() - dow);
  return dayKey(d);
}

export function daysBetween(a, b) {
  return Math.round((fromKey(b) - fromKey(a)) / 86400000);
}

export function weekdayShort(key) {
  return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][fromKey(key).getDay()];
}

export function formatDay(key) {
  const d = fromKey(key);
  return `${weekdayShort(key)}, ${d.getDate()}.${d.getMonth() + 1}.`;
}
