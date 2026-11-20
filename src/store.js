// Zusammenführen der Tagesdaten und lokale Speicherung (IndexedDB, sonst Arbeitsspeicher).
import { addDays } from './dates.js';

export function emptyState() {
  return { days: {}, checks: {}, settings: null, lastSync: null };
}

export function mergeDays(existing, incoming) {
  const out = { ...existing };
  for (const [k, rec] of Object.entries(incoming)) out[k] = { ...(existing[k] ?? {}), ...rec };
  return out;
}

/** Tage ohne jeden Datensatz zwischen dem ersten bekannten Tag (bzw. Rückblick) und gestern. */
export function findGaps(days, today, lookback = 60) {
  const keys = Object.keys(days).sort();
  if (!keys.length) return [];
  let start = keys[0];
  const earliest = addDays(today, -lookback);
  if (start < earliest) start = earliest;
  const gaps = [];
  for (let k = start; k < today; k = addDays(k, 1)) {
    if (!days[k] || !Object.keys(days[k]).length) gaps.push(k);
  }
  return gaps;
}

const MARK = 'gesundheits-cockpit';

export function exportState(state) {
  return JSON.stringify({ app: MARK, version: 1, exported: new Date().toISOString(), state });
}

export function importState(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Diese Datei ist keine gültige Sicherung.'); }
  if (data?.app !== MARK || !data.state || typeof data.state.days !== 'object') {
    throw new Error('Diese Datei ist keine Sicherung des Gesundheits-Cockpits.');
  }
  return { ...emptyState(), ...data.state };
}

const DB = 'gesundheits-cockpit', OS = 'state', KEY = 'main';

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(OS);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(OS, mode);
    const req = fn(t.objectStore(OS));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
  });
}

export async function openStore() {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('kein IndexedDB');
    const db = await idb();
    return {
      persistent: true,
      async load() { return { ...emptyState(), ...((await tx(db, 'readonly', s => s.get(KEY))) ?? {}) }; },
      async save(state) { await tx(db, 'readwrite', s => s.put(structuredClone(state), KEY)); },
    };
  } catch {
    let mem = emptyState();
    return {
      persistent: false,
      async load() { return structuredClone(mem); },
      async save(state) { mem = structuredClone(state); },
    };
  }
}
