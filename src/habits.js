// Gewohnheiten: Zielerreichung pro Tag und Streaks (Tage bzw. Wochen Mo–So).
import { addDays, weekStart } from './dates.js';

export const DEFAULT_SETTINGS = {
  habits: [
    { id: 'steps', name: '10.000 Schritte', kind: 'daily', metric: 'steps', min: 10000, enabled: true },
    { id: 'sleep', name: 'Schlafziel', kind: 'daily', metric: 'sleepMin', min: 420, enabled: true },
    { id: 'sport', name: 'Training', kind: 'weekly', auto: 'sport', target: 3, enabled: true },
    { id: 'walk', name: 'Walking', kind: 'weekly', auto: 'walk', target: 3, enabled: true },
    { id: 'bp', name: 'Blutdruck gemessen', kind: 'weekly', auto: 'bp', target: 3, enabled: true },
    { id: 'food', name: 'Ernährung erfasst', kind: 'daily', metric: 'kcalIn', min: 1, enabled: false },
  ],
  sportMinMin: 20,     // Mindestdauer eines Trainings
  walkMinMin: 20,      // Mindestdauer eines Walks
  kcalGoal: 2200,
  weightGoal: null,
  theme: 'dark',
};

/** Walking, Gehen, Spaziergang, Wandern zählen als Walking, alles andere als Training. */
export const isWalk = name => /walk|geh|spazier|wander|hik/i.test(String(name ?? ''));

/** Trainingsliste eines Tages aufgeteilt, oder null wenn keine Liste übertragen wurde. */
export function splitWorkouts(day) {
  if (!Array.isArray(day?.workouts)) return null;
  const r = { trainMin: 0, walkMin: 0, walkKm: 0, train: [], walks: 0 };
  for (const w of day.workouts) {
    if (isWalk(w.name)) { r.walkMin += w.min; r.walkKm = Math.round((r.walkKm + (w.km ?? 0)) * 10) / 10; r.walks++; }
    else { r.trainMin += w.min; r.train.push(w.name); }
  }
  return r;
}

export const habitById = (settings, id) => settings.habits.find(x => x.id === id);

/** true/false, oder null wenn für den Tag keine Daten vorliegen. */
export function dayMet(habit, day, checks, key, settings) {
  if (habit.manual) return checks?.[habit.id]?.[key] === true;
  if (habit.metric) {
    const v = day?.[habit.metric];
    return v == null ? null : v >= habit.min;
  }
  if (habit.auto === 'sport' || habit.auto === 'walk') {
    if (Array.isArray(day?.workouts)) {
      const walk = habit.auto === 'walk';
      const min = walk ? settings.walkMinMin : settings.sportMinMin;
      return day.workouts.some(w => isWalk(w.name) === walk && w.min >= min);
    }
    // Keine Trainingsliste aus Health: von Hand abhaken
    if (checks?.[habit.id]?.[key] === true) return true;
    return day ? false : null;
  }
  if (habit.auto === 'bp') {
    if (!day) return null;
    return (day.bp?.length ?? 0) > 0;
  }
  return null;
}

const MAX_LOOKBACK = 3 * 366;

function firstKey(state, today) {
  const keys = [...Object.keys(state.days ?? {}), ...Object.values(state.checks ?? {}).flatMap(Object.keys)].sort();
  const earliest = addDays(today, -MAX_LOOKBACK);
  return keys.length ? (keys[0] < earliest ? earliest : keys[0]) : today;
}

export function weekCount(habit, state, ws, today) {
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const k = addDays(ws, i);
    if (k > today) break;
    if (dayMet(habit, state.days?.[k], state.checks, k, state.settings) === true) n++;
  }
  return n;
}

export function streak(habit, state, today) {
  const met = k => dayMet(habit, state.days?.[k], state.checks, k, state.settings) === true;
  const start = firstKey(state, today);

  if (habit.kind === 'weekly') {
    const target = habit.target ?? 1;
    const curWs = weekStart(today);
    const count = weekCount(habit, state, curWs, today);
    const ok = ws => weekCount(habit, state, ws, today) >= target;
    let current = 0;
    for (let ws = count >= target ? curWs : addDays(curWs, -7); ws >= weekStart(start) && ok(ws); ws = addDays(ws, -7)) current++;
    let best = 0, run = 0;
    for (let ws = weekStart(start); ws <= curWs; ws = addDays(ws, 7)) {
      if (ok(ws)) best = Math.max(best, ++run);
      else if (ws !== curWs) run = 0;
    }
    return { current, best: Math.max(best, current), todayPending: count < target, weekCount: count, target, unit: 'Wochen' };
  }

  const todayMet = met(today);
  let current = 0;
  for (let k = todayMet ? today : addDays(today, -1); k >= start && met(k); k = addDays(k, -1)) current++;
  let best = 0, run = 0;
  for (let k = start; k <= today; k = addDays(k, 1)) {
    if (met(k)) best = Math.max(best, ++run);
    else if (k !== today) run = 0;
  }
  return { current, best: Math.max(best, current), todayPending: !todayMet, unit: 'Tage' };
}
