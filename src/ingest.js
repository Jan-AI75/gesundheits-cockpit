// Übernahme der Rohdaten aus dem Kurzbefehl (Payload v1) und Umrechnung in Tagesdatensätze.
import { isoDay } from './dates.js';

/** Liest `#d=<URL-kodiertes JSON>`. Gibt null zurück, wenn das Fragment keine Daten enthält. */
export function parseFragment(hash) {
  const m = /^#?d=(.*)$/s.exec(hash || '');
  if (!m) return null;
  let payload;
  try {
    payload = JSON.parse(decodeURIComponent(m[1]));
  } catch {
    return { ok: false, error: 'Die übertragenen Daten sind unvollständig oder beschädigt.' };
  }
  if (!payload || payload.v !== 1) {
    return { ok: false, error: 'Unbekanntes Datenformat – bitte den Kurzbefehl prüfen.' };
  }
  return { ok: true, payload };
}

/** Zahl aus Kurzbefehl-Text, auch mit deutschem Komma oder Tausenderpunkt. */
export function toNum(v) {
  if (typeof v === 'number') return v;
  const m = /-?\d[\d.,]*/.exec(String(v ?? '').replace(/\s(?=\d)/g, ''));
  if (!m) return NaN;
  let s = m[0].replace(/[.,]$/, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  return /^-?\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}

const SUM_FIELDS = { steps: 'steps', exMin: 'exMin', dist: 'distKm', kcalIn: 'kcalIn', protein: 'protein', carbs: 'carbs', fat: 'fat' };
const AVG_FIELDS = { rhr: 'restingHr', hr: 'hrAvg' };

const isAwake = k => /awake|wach/i.test(k);
const isInBed = k => /in ?bed|im bett/i.test(k);
const ms = iso => Date.parse(iso);
const round1 = x => Math.round(x * 10) / 10;

function unionMinutes(intervals) {
  const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0, cur = null;
  for (const [a, b] of sorted) {
    if (!cur || a > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [a, b]; }
    else cur[1] = Math.max(cur[1], b);
  }
  if (cur) total += cur[1] - cur[0];
  return Math.round(total / 60000);
}

/**
 * Der Kurzbefehl darf eine Reihe auch als parallele, mit "|" getrennte Texte liefern:
 * {d: "2026-11-18|2026-11-19", v: "8000|10234"} -> [{d,v},{d,v}]
 */
export function expand(series) {
  if (Array.isArray(series)) return series;
  if (!series || typeof series !== 'object') return [];
  const cols = Object.fromEntries(Object.entries(series).map(([k, v]) => [k, String(v ?? '').split('|')]));
  const n = Math.max(0, ...Object.values(cols).map(c => (c.length === 1 && c[0] === '' ? 0 : c.length)));
  return Array.from({ length: n }, (_, i) => Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, (c[i] ?? '').trim()])));
}

export function normalize(raw) {
  const payload = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, k === 'v' ? v : expand(v)]));
  if (raw.workouts == null) delete payload.workouts;
  const days = {};
  const day = k => (days[k] ??= {});

  for (const [src, field] of Object.entries(SUM_FIELDS)) {
    for (const { d, v } of payload[src] ?? []) {
      const n = toNum(v);
      if (Number.isNaN(n)) continue;
      const rec = day(isoDay(d));
      rec[field] = round1((rec[field] ?? 0) + n);
    }
  }

  for (const [src, field] of Object.entries(AVG_FIELDS)) {
    const acc = {};
    for (const { d, v } of payload[src] ?? []) {
      const n = toNum(v);
      if (Number.isNaN(n)) continue;
      (acc[isoDay(d)] ??= []).push(n);
    }
    for (const [k, list] of Object.entries(acc)) day(k)[field] = Math.round(list.reduce((a, b) => a + b, 0) / list.length);
  }

  // Gewicht: letzter Wert des Tages
  const lastWeight = {};
  for (const { t, v } of payload.weight ?? []) {
    const n = toNum(v);
    if (Number.isNaN(n)) continue;
    const k = isoDay(t);
    if (!lastWeight[k] || ms(t) > lastWeight[k].t) lastWeight[k] = { t: ms(t), v: n };
  }
  for (const [k, w] of Object.entries(lastWeight)) day(k).weightKg = round1(w.v);

  // Schlaf: zählt zum Tag des Aufwachens; Vereinigung der Intervalle; "Im Bett" nur als Ersatz
  const nights = {};
  for (const { s, e, k } of payload.sleep ?? []) {
    if (isAwake(k ?? '')) continue;
    const n = (nights[isoDay(e)] ??= { asleep: [], inBed: [] });
    (isInBed(k ?? '') ? n.inBed : n.asleep).push([ms(s), ms(e)]);
  }
  for (const [k, n] of Object.entries(nights)) {
    const min = unionMinutes(n.asleep.length ? n.asleep : n.inBed);
    if (min > 0) day(k).sleepMin = min;
  }

  // Blutdruck: Systole und Diastole kommen getrennt, Paarung über Zeitstempel (≤ 2 min)
  const dias = (payload.dia ?? []).map(x => ({ t: ms(x.t), v: toNum(x.v), used: false }));
  for (const { t, v } of [...(payload.sys ?? [])].sort((a, b) => ms(a.t) - ms(b.t))) {
    const sys = toNum(v), tt = ms(t);
    let best = null;
    for (const d of dias) {
      if (d.used || Number.isNaN(d.v)) continue;
      const diff = Math.abs(d.t - tt);
      if (diff <= 120000 && (!best || diff < Math.abs(best.t - tt))) best = d;
    }
    if (!best || Number.isNaN(sys)) continue;
    best.used = true;
    (day(isoDay(t)).bp ??= []).push({ t, sys, dia: best.v });
  }

  // Trainings
  if (Array.isArray(payload.workouts)) {
    for (const { s, e, n, km } of payload.workouts) {
      const k = toNum(km);
      (day(isoDay(s)).workouts ??= []).push({
        t: s,
        name: n || 'Training',
        min: Math.round((ms(e) - ms(s)) / 60000),
        km: Number.isNaN(k) ? null : round1(k),
      });
    }
    for (const rec of Object.values(days)) rec.workouts ??= [];
  }

  return days;
}
