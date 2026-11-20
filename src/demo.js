// Beispieldaten für die Vorschau. Werden nie gespeichert.
import { addDays, weekStart } from './dates.js';
import { DEFAULT_SETTINGS } from './habits.js';

function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

export function demoState(today) {
  const r = rng(42);
  const between = (a, b) => a + (b - a) * r();
  const days = {};
  const N = 150;
  for (let i = N; i >= 0; i--) {
    const k = addDays(today, -i);
    const dow = (new Date(k + 'T12:00').getDay() + 6) % 7; // Mo=0
    const p = 1 - i / N; // Fortschritt 0 → 1
    const d = {};
    d.steps = Math.round(between(6500, 13500) + p * 1200);
    d.sleepMin = Math.round(between(375, 495));
    d.restingHr = Math.round(61 - p * 5 + between(-2, 2));
    d.hrAvg = d.restingHr + Math.round(between(14, 22));
    d.kcalIn = Math.round(between(1750, 2550));
    d.protein = Math.round(between(80, 150));
    d.carbs = Math.round(between(170, 290));
    d.fat = Math.round(between(55, 95));
    d.distKm = Math.round(d.steps * 0.00072 * 10) / 10;
    d.weightKg = Math.round((85.2 - p * 3.1 + between(-0.4, 0.4)) * 10) / 10;
    d.workouts = [];
    const gymDay = [0, 2, 4].includes(dow) && r() > 0.1;
    if (gymDay) d.workouts.push({ t: `${k}T18:10:00+01:00`, name: 'Krafttraining', min: Math.round(between(48, 72)), km: null });
    if (dow === 5 && r() > 0.35) d.workouts.push({ t: `${k}T09:30:00+01:00`, name: 'Radfahren', min: Math.round(between(45, 80)), km: Math.round(between(15, 28) * 10) / 10 });
    if ([1, 3, 5, 6].includes(dow) && r() > 0.3) d.workouts.push({ t: `${k}T19:30:00+01:00`, name: 'Walking', min: Math.round(between(28, 65)), km: Math.round(between(2.8, 6.2) * 10) / 10 });
    d.exMin = d.workouts.reduce((a, w) => a + w.min, 0) + Math.round(between(5, 25));
    if ([0, 3, 5].includes(dow) && r() > 0.15) {
      const sys = Math.round(between(118, 136) - p * 4), dia = Math.round(between(75, 88) - p * 2);
      d.bp = [{ t: `${k}T07:35:00+01:00`, sys, dia }];
    }
    days[k] = d;
  }
  // heute: Tag läuft noch
  Object.assign(days[today], { steps: 7340, distKm: 5.3, kcalIn: 1420, exMin: 18, workouts: [] });
  delete days[today].weightKg;
  if (weekStart(today) === today) delete days[today].bp;

  const settings = structuredClone(DEFAULT_SETTINGS);
  settings.habits.push({ id: 'c-dehnen', name: 'Dehnen', kind: 'weekly', target: 4, manual: true, enabled: true });
  const checks = { 'c-dehnen': {} };
  for (let i = 0; i < 60; i++) if (r() > 0.45) checks['c-dehnen'][addDays(today, -i - 1)] = true;

  return { days, checks, settings, lastSync: new Date().toISOString(), demo: true };
}
