// Ansichten als HTML-Strings.
import { addDays, weekStart, formatDay, weekdayShort, daysBetween } from './dates.js';
import { dayMet, streak, weekCount, splitWorkouts } from './habits.js';
import { barChart, lineChart, heatmap } from './charts.js';

const nf = (v, digits = 0) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtSleep = m => `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}`;
const avg = list => { const v = list.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const range = (from, n) => Array.from({ length: n }, (_, i) => addDays(from, i));
const enabled = state => state.settings.habits.filter(h => h.enabled);
const timeOf = iso => String(iso).slice(11, 16);
// Erster Tag mit Daten oder Häkchen, oder null.
const firstDataKey = state => [...Object.keys(state.days), ...Object.values(state.checks ?? {}).flatMap(Object.keys)].sort()[0] ?? null;
// Der laufende Tag verzerrt Summenwerte (Schritte, Kalorien …) nach unten: für Mittelwerte weglassen, solange es andere Tage gibt.
const closedKeys = (keys, today) => keys.length > 1 ? keys.filter(k => k !== today) : keys;

function latest(state, field, today, maxDays = 30) {
  for (let i = 0; i <= maxDays; i++) {
    const k = addDays(today, -i), v = state.days[k]?.[field];
    if (v != null && !(Array.isArray(v) && !v.length)) return { key: k, v };
  }
  return null;
}

const trainingMin = d => splitWorkouts(d)?.trainMin ?? null;
const walkMin = d => splitWorkouts(d)?.walkMin ?? null;
const walkKm = d => splitWorkouts(d)?.walkKm ?? null;
const usesManual = (habit, day) => habit.manual || ((habit.auto === 'sport' || habit.auto === 'walk') && !Array.isArray(day?.workouts));

// ---------- Heute ----------

function habitStrip(habit, state, today) {
  if (habit.kind === 'weekly') {
    const ws = weekStart(today);
    return `<div class="strip week">${range(ws, 7).map(k => {
      const m = k > today ? 'future' : dayMet(habit, state.days[k], state.checks, k, state.settings) === true ? 'met' : 'miss';
      return `<span class="cell ${m}" title="${formatDay(k)}"><i>${weekdayShort(k).slice(0, 1)}</i></span>`;
    }).join('')}</div>`;
  }
  return `<div class="strip">${range(addDays(today, -13), 14).map(k => {
    const r = dayMet(habit, state.days[k], state.checks, k, state.settings);
    const m = r === true ? 'met' : k === today ? 'open' : r === false ? 'miss' : 'none';
    return `<span class="cell ${m}" title="${formatDay(k)}"></span>`;
  }).join('')}</div>`;
}

function habitStatus(habit, state, today, s) {
  const d = state.days[today];
  if (habit.kind === 'weekly') {
    const left = s.target - s.weekCount;
    return left > 0 ? `${s.weekCount} von ${s.target} diese Woche` : `Wochenziel erreicht (${s.weekCount}×)`;
  }
  if (habit.manual) return s.todayPending ? 'Heute noch offen' : 'Heute erledigt';
  if (habit.metric === 'steps') return d?.steps != null ? `Heute ${nf(d.steps)} von ${nf(habit.min)}` : 'Heute noch keine Daten';
  if (habit.metric === 'sleepMin') return d?.sleepMin != null ? `Letzte Nacht ${fmtSleep(d.sleepMin)}, Ziel ${fmtSleep(habit.min)}` : 'Letzte Nacht noch keine Daten';
  if (habit.metric === 'kcalIn') return d?.kcalIn ? `Heute ${nf(d.kcalIn)} kcal erfasst` : 'Heute noch nichts erfasst';
  return '';
}

function habitRow(habit, state, today) {
  const s = streak(habit, state, today);
  const done = !s.todayPending;
  const toggle = usesManual(habit, state.days[today])
    ? `<button class="check ${state.checks[habit.id]?.[today] ? 'on' : ''}" data-toggle="${esc(habit.id)}" aria-pressed="${!!state.checks[habit.id]?.[today]}" aria-label="${esc(habit.name)} heute erledigt"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg></button>`
    : '';
  return `<li class="habit ${done ? 'done' : ''}">
    <div class="habit-main">
      <div class="habit-head">${toggle}<span class="habit-name">${esc(habit.name)}</span></div>
      <div class="habit-status">${habitStatus(habit, state, today, s)}</div>
      ${habitStrip(habit, state, today)}
    </div>
    <div class="streak" aria-label="Serie ${s.current} ${s.unit}">
      <span class="streak-n">${s.current}</span>
      <span class="streak-u">${s.current === 1 ? { Tage: 'Tag', Wochen: 'Woche' }[s.unit] : s.unit}</span>
      <span class="streak-best">Rekord ${s.best}</span>
    </div>
  </li>`;
}

const CHEVRON = '<svg viewBox="0 0 8 13" aria-hidden="true"><path d="M1.5 1.5l5 5-5 5"/></svg>';

function stat(label, value, sub = '', extra = '', cls = '', metric = null) {
  const empty = value === '–' ? ' is-empty' : '';
  const inner = `<span class="stat-label">${label}${metric ? CHEVRON : ''}</span><span class="stat-value">${value}</span>${extra}<span class="stat-sub">${sub}</span>`;
  return metric
    ? `<button class="stat ${cls}${empty}" data-goto="${metric}" aria-label="${label}: Verlauf öffnen">${inner}</button>`
    : `<div class="stat ${cls}${empty}">${inner}</div>`;
}

function ring(done, total) {
  const r = 24, c = 2 * Math.PI * r, p = total ? done / total : 0;
  return `<div class="ring" role="img" aria-label="${done} von ${total} Zielen erfüllt">
    <svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="${r}" fill="none" stroke-width="6" class="track"/>
    <circle cx="28" cy="28" r="${r}" fill="none" stroke-width="6" class="fill" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" data-offset="${(c * (1 - p)).toFixed(1)}"/></svg>
    <span>${done}/${total}</span></div>`;
}

function progress(v, goal) {
  const p = Math.max(0, Math.min(1, v / goal));
  return `<span class="progress" role="presentation"><span style="width:${(p * 100).toFixed(1)}%" class="${p >= 1 ? 'met' : ''}"></span></span>`;
}

export function renderToday(state, today, ctx) {
  const d = state.days[today] ?? {};
  const st = state.settings;
  const habits = enabled(state);
  const stepsGoal = st.habits.find(h => h.id === 'steps')?.min ?? 10000;
  const sleepGoal = st.habits.find(h => h.id === 'sleep')?.min ?? 420;

  const tiles = [];
  tiles.push(stat('Schritte', d.steps != null ? nf(d.steps) : '–', `Ziel ${nf(stepsGoal)}`, progress(d.steps ?? 0, stepsGoal), '', 'steps'));
  tiles.push(stat('Schlaf', d.sleepMin != null ? fmtSleep(d.sleepMin) : '–', `Ziel ${fmtSleep(sleepGoal)}`, progress(d.sleepMin ?? 0, sleepGoal), '', 'sleep'));

  const sw = splitWorkouts(d);
  const weekOf = id => { const h = st.habits.find(x => x.id === id); return h ? `Diese Woche ${weekCount(h, state, weekStart(today), today)} von ${h.target}` : ''; };
  tiles.push(stat('Training', sw?.trainMin ? `${nf(sw.trainMin)}<small>min</small>` : '–',
    sw?.train.length ? esc(sw.train.join(', ')) : weekOf('sport'), '', '', 'training'));
  tiles.push(stat('Walking', sw?.walkMin ? `${nf(sw.walkKm || sw.walkMin, sw.walkKm ? 1 : 0)}<small>${sw.walkKm ? 'km' : 'min'}</small>` : '–',
    sw?.walkMin ? `${nf(sw.walkMin)} min, ${weekOf('walk').replace('Diese Woche ', '')} diese Woche` : weekOf('walk'), '', '', 'walk'));

  const rhr = latest(state, 'restingHr', today, 3);
  const rhr30 = avg(range(addDays(today, -29), 30).map(k => state.days[k]?.restingHr));
  tiles.push(stat('Ruhepuls', rhr ? `${rhr.v}<small>/min</small>` : '–', rhr30 ? `Ø 30 Tage ${nf(rhr30)}` : '', '', '', 'rhr'));

  const bpL = latest(state, 'bp', today, 30);
  if (bpL) {
    const b = bpL.v[bpL.v.length - 1];
    const high = b.sys >= 140 || b.dia >= 90;
    tiles.push(stat('Blutdruck', `${b.sys}/${b.dia}`, `${high ? 'Erhöht, ' : ''}${bpL.key === today ? 'heute' : formatDay(bpL.key)}, ${timeOf(b.t)} Uhr`, '', high ? 'warn' : '', 'bp'));
  } else {
    const first = firstDataKey(state);
    const sub = first && daysBetween(first, today) >= 30 ? 'Keine Messung in 30 Tagen' : 'Noch keine Messung';
    tiles.push(stat('Blutdruck', '–', sub, '', '', 'bp'));
  }

  const w = latest(state, 'weightKg', today, 30);
  const w30 = w ? latest(state, 'weightKg', addDays(today, -30), 14) : null;
  const delta = w && w30 ? w.v - w30.v : null;
  tiles.push(stat('Gewicht', w ? `${nf(w.v, 1)}<small>kg</small>` : '–',
    delta != null ? `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${nf(Math.abs(delta), 1)} kg in 30 Tagen` : (w ? formatDay(w.key) : ''), '', '', 'weight'));

  tiles.push(stat('Ernährung', d.kcalIn != null ? `${nf(d.kcalIn)}<small>kcal</small>` : '–',
    d.protein != null ? `Eiweiß ${nf(d.protein)} g` : `Ziel ${nf(st.kcalGoal)} kcal`,
    progress(d.kcalIn ?? 0, st.kcalGoal), '', 'kcal'));

  const doneCount = habits.filter(h => !streak(h, state, today).todayPending).length;

  return `<div class="view">
    <header class="page-head">
      <div><h1>Heute</h1><p class="sub">${formatLong(today)}</p></div>
      ${habits.length ? ring(doneCount, habits.length) : ''}
    </header>
    ${ctx.banner ?? ''}
    <div class="today-grid">
      <section aria-labelledby="h-habits">
        <h2 class="section-title" id="h-habits">Gewohnheiten</h2>
        ${habits.length ? `<ul class="habits group">${habits.map(h => habitRow(h, state, today)).join('')}</ul>`
          : `<div class="group"><p class="group-footer" style="padding:16px;margin:0">Keine Gewohnheit aktiv. Schalte sie in den Einstellungen ein.</p></div>`}
      </section>
      <section aria-labelledby="h-values">
        <h2 class="section-title" id="h-values">Werte</h2>
        <div class="stats">${tiles.join('')}</div>
      </section>
    </div>
    <p class="sync">${syncText(state)}</p>
  </div>`;
}

function formatLong(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function syncText(state) {
  if (state.demo) return 'Beispieldaten. Es wird nichts gespeichert.';
  if (!state.lastSync) return 'Noch keine Daten übernommen. Öffne das Cockpit über den Kurzbefehl.';
  const t = new Date(state.lastSync);
  return `Zuletzt abgeglichen ${t.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}, ${t.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`;
}

export function renderEmpty() {
  return `<div class="empty view">
    <h1>Noch keine Daten</h1>
    <p>Das Cockpit holt seine Werte über einen Kurzbefehl aus Apple Health. Richte ihn einmal ein und öffne das Cockpit danach immer über sein Symbol auf dem Home-Bildschirm.</p>
    <div class="btn-row"><a href="docs/kurzbefehl-anleitung.html" class="btn">Kurzbefehl einrichten</a><button class="btn secondary" data-action="demo">Beispieldaten ansehen</button></div>
  </div>`;
}

// ---------- Verlauf ----------

const METRICS = {
  steps: { label: 'Schritte', kind: 'bar', partial: true, get: d => d?.steps, goal: s => s.habits.find(h => h.id === 'steps')?.min, unit: '', better: 1 },
  sleep: { label: 'Schlaf', kind: 'bar', get: d => d?.sleepMin, goal: s => s.habits.find(h => h.id === 'sleep')?.min, tick: v => `${nf(Math.round(v / 60))} h`, show: fmtSleep, better: 1 },
  training: { label: 'Training', kind: 'bar', partial: true, get: trainingMin, unit: ' min', better: 1 },
  walk: { label: 'Walking', kind: 'bar', partial: true, get: walkMin, unit: ' min', better: 1 },
  distance: { label: 'Strecke', kind: 'bar', partial: true, get: d => d?.distKm, unit: ' km', digits: 1, better: 1 },
  rhr: { label: 'Ruhepuls', kind: 'line', get: d => d?.restingHr, unit: ' /min', better: -1 },
  bp: { label: 'Blutdruck', kind: 'bp', better: -1 },
  weight: { label: 'Gewicht', kind: 'weight', get: d => d?.weightKg, unit: ' kg', digits: 1, better: -1 },
  kcal: { label: 'Ernährung', kind: 'bar', partial: true, get: d => d?.kcalIn, goal: s => s.kcalGoal, unit: ' kcal', better: 0 },
};
export const RANGES = [7, 30, 90, 365];

function bucket(points, size) {
  if (size <= 1) return points;
  const out = [];
  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size);
    out.push({ key: chunk[0].key, y: avg(chunk.map(p => p.y)) });
  }
  return out;
}

const bpOf = (d, f) => d?.bp?.length ? avg(d.bp.map(b => b[f])) : null;

export function renderTrends(state, today, view) {
  const m = METRICS[view.metric] ?? METRICS.steps;
  const n = view.range;
  const keys = range(addDays(today, -(n - 1)), n);
  const prevKeys = range(addDays(today, -(2 * n - 1)), n);
  const size = n > 90 ? 7 : 1;
  let chart, cur, prev, show;

  if (m.kind === 'bp') {
    const sys = keys.map(k => ({ key: k, y: bpOf(state.days[k], 'sys') }));
    const dia = keys.map(k => ({ key: k, y: bpOf(state.days[k], 'dia') }));
    chart = lineChart([
      { points: bucket(sys, size), cls: 'sys', dots: true, line: size > 1 },
      { points: bucket(dia, size), cls: 'dia', dots: true, line: size > 1 },
    ], { refs: [{ y: 140, cls: 'warn' }, { y: 90, cls: 'warn', label: '140/90' }, { y: 120 }, { y: 80, label: '120/80' }], label: 'Blutdruck' });
    const a = f => avg(keys.map(k => bpOf(state.days[k], f))), b = f => avg(prevKeys.map(k => bpOf(state.days[k], f)));
    cur = a('sys') != null ? [a('sys'), a('dia')] : null;
    prev = b('sys') != null ? [b('sys'), b('dia')] : null;
    show = v => `${nf(v[0])}/${nf(v[1])}`;
    const count = keys.reduce((s, k) => s + (state.days[k]?.bp?.length ?? 0), 0);
    return trendsShell(view, chart, [
      ['Durchschnitt', cur ? show(cur) : '–'],
      ['Vorzeitraum', prev ? show(prev) : '–'],
      ['Messungen', nf(count)],
    ], '<span class="key sys">Systolisch</span><span class="key dia">Diastolisch</span>');
  }

  const pts = keys.map(k => ({ key: k, y: m.get(state.days[k]) ?? null }));
  if (m.kind === 'bar') chart = barChart(bucket(pts, size), { goal: m.goal?.(state.settings) ?? null, tick: m.tick, label: m.label });
  else if (m.kind === 'weight') {
    const mean = keys.map((k, i) => ({ key: k, y: avg(range(addDays(k, -6), 7).map(j => m.get(state.days[j]))) }));
    chart = lineChart([{ points: bucket(pts, size), cls: 'raw', dots: true, line: false }, { points: bucket(mean, size), cls: 'main' }],
      { refs: state.settings.weightGoal ? [{ y: state.settings.weightGoal, label: 'Ziel' }] : [], label: m.label });
  } else chart = lineChart([{ points: bucket(pts, size), cls: 'main', dots: n <= 30 }], { label: m.label });

  const summaryKeys = new Set(m.partial ? closedKeys(keys.filter(k => m.get(state.days[k]) != null), today) : keys);
  const vals = pts.filter(p => summaryKeys.has(p.key)).map(p => p.y).filter(v => v != null);
  cur = avg(vals);
  prev = avg(prevKeys.map(k => m.get(state.days[k])));
  show = m.show ?? (v => `${nf(v, m.digits ?? 0)}${m.unit ?? ''}`);
  const goal = m.goal?.(state.settings);
  const rows = [['Durchschnitt', cur != null ? show(cur) : '–'], ['Vorzeitraum', prev != null ? show(prev) : '–']];
  if (goal != null && m.kind === 'bar') rows.push(['Ziel erreicht', `${vals.filter(v => v >= goal).length} von ${vals.length} Tagen`]);
  else if (vals.length) rows.push(['Spanne', `${show(Math.min(...vals))} bis ${show(Math.max(...vals))}`]);
  return trendsShell(view, chart, rows, m.kind === 'weight' ? '<span class="key raw">Messung</span><span class="key main">7-Tage-Mittel</span>' : '');
}

function trendsShell(view, chart, rows, legend) {
  const ri = RANGES.indexOf(view.range);
  const [headVal] = rows;
  return `<div class="view">
    <header class="page-head"><h1>Verlauf</h1></header>
    <div class="chips" role="tablist" aria-label="Kennzahl">${Object.entries(METRICS).map(([id, m]) =>
      `<button role="tab" aria-selected="${id === view.metric}" data-metric="${id}">${m.label}</button>`).join('')}</div>
    <div class="segmented" role="tablist" aria-label="Zeitraum" style="--n:${RANGES.length};--i:${ri}">${RANGES.map(r =>
      `<button role="tab" aria-selected="${r === view.range}" data-range="${r}">${r === 365 ? '1 Jahr' : `${r} Tage`}</button>`).join('')}</div>
    <figure class="chart-card" style="margin-inline:0">
      <div class="headline"><strong>${headVal[1]}</strong><span>Ø ${view.range === 365 ? 'im letzten Jahr' : `der letzten ${view.range} Tage`}</span></div>
      ${chart}${legend ? `<figcaption class="legend">${legend}</figcaption>` : ''}
    </figure>
    <dl class="facts group">${rows.slice(1).map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('')}</dl>
  </div>`;
}

// ---------- Serien ----------

export function renderStreaks(state, today) {
  const start = addDays(weekStart(today), -25 * 7);
  const keys = range(start, 26 * 7);
  const unit = s => s.current === 1 ? { Tage: 'Tag', Wochen: 'Woche' }[s.unit] : s.unit;
  return `<div class="view">
    <header class="page-head"><div><h1>Serien</h1><p class="sub">Letzte 26 Wochen, jede Spalte eine Woche von Montag bis Sonntag</p></div></header>
    <ul class="series">${enabled(state).map(h => {
      const s = streak(h, state, today);
      const cells = keys.map(k => ({
        key: formatDay(k),
        state: k > today ? 'future' : dayMet(h, state.days[k], state.checks, k, state.settings) === true ? 'met' : (state.days[k] || h.manual) ? 'miss' : 'none',
      }));
      let weeksMet = 0, weeksDone = 0;
      const first = firstDataKey(state);
      const from = first && weekStart(first) > start ? weekStart(first) : start;
      if (h.kind === 'weekly') for (let ws = from; ws < weekStart(today); ws = addDays(ws, 7)) { weeksDone++; if (weekCount(h, state, ws, today) >= h.target) weeksMet++; }
      return `<li>
        <div class="series-head"><span class="habit-name">${esc(h.name)}</span><span class="series-n">${s.current} ${unit(s)}<small>Rekord ${s.best}</small></span></div>
        ${heatmap(cells, { label: h.name })}
        <p class="series-note">${h.kind === 'weekly'
          ? (weeksDone ? `Ziel ${h.target}× pro Woche, in ${weeksMet} von ${weeksDone} abgeschlossenen ${weeksDone === 1 ? 'Woche' : 'Wochen'} erreicht` : `Ziel ${h.target}× pro Woche. Die erste Woche wird nach Sonntag bewertet.`)
          : (n => `${n} ${n === 1 ? 'Tag' : 'Tage'} erreicht`)(cells.filter(c => c.state === 'met').length)}</p>
      </li>`;
    }).join('')}</ul>
  </div>`;
}

// ---------- Woche ----------

export function renderWeek(state, today) {
  const ws = weekStart(today), lws = addDays(ws, -7);
  const thisKeys = range(ws, daysBetween(ws, today) + 1), lastKeys = range(lws, 7);
  const sport = state.settings.habits.find(h => h.id === 'sport');
  const sportDays = keys => sport ? keys.filter(k => dayMet(sport, state.days[k], state.checks, k, state.settings) === true).length : null;
  const lastVal = (keys, f) => { for (const k of [...keys].reverse()) if (state.days[k]?.[f] != null) return state.days[k][f]; return null; };
  const rows = [
    ['Schritte, Ø Tag', keys => avg(closedKeys(keys.filter(k => state.days[k]?.steps != null), today).map(k => state.days[k].steps)), v => nf(v), 1],
    ['Schlaf, Ø Nacht', keys => avg(keys.map(k => state.days[k]?.sleepMin)), fmtSleep, 1],
    ['Trainingstage', sportDays, v => nf(v), 1, true],
    ['Trainingszeit', keys => keys.reduce((a, k) => a + (trainingMin(state.days[k]) ?? 0), 0), v => `${nf(v)} min`, 1, true],
    ['Walks', keys => keys.reduce((a, k) => a + (splitWorkouts(state.days[k])?.walks ?? 0), 0), v => nf(v), 1, true],
    ['Walk-Strecke', keys => keys.reduce((a, k) => a + (walkKm(state.days[k]) ?? 0), 0), v => `${nf(v, 1)} km`, 1, true],
    ['Ruhepuls', keys => avg(keys.map(k => state.days[k]?.restingHr)), v => `${nf(v)} /min`, -1],
    ['Blutdruck', keys => { const s = avg(keys.map(k => bpOf(state.days[k], 'sys'))); return s == null ? null : [s, avg(keys.map(k => bpOf(state.days[k], 'dia')))]; }, v => `${nf(v[0])}/${nf(v[1])}`, -1],
    ['Gewicht', keys => lastVal(keys, 'weightKg'), v => `${nf(v, 1)} kg`, -1],
    ['Kalorien, Ø Tag', keys => avg(closedKeys(keys.filter(k => state.days[k]?.kcalIn != null), today).map(k => state.days[k].kcalIn)), v => `${nf(v)} kcal`, 0],
  ];
  const habits = enabled(state);
  const num = v => Array.isArray(v) ? v[0] : v;
  return `<div class="view">
    <header class="page-head"><div><h1>Woche</h1><p class="sub">${formatDay(ws)} bis ${formatDay(addDays(ws, 6))}</p></div></header>
    <h2 class="section-title">Gewohnheiten</h2>
    <div class="group"><table class="matrix">
      <thead><tr><th scope="col"><span class="sr-only">Gewohnheit</span></th>${range(ws, 7).map(k => `<th scope="col" ${k === today ? 'aria-current="date"' : ''}>${weekdayShort(k)}</th>`).join('')}</tr></thead>
      <tbody>${habits.map(h => `<tr><th scope="row">${esc(h.name)}</th>${range(ws, 7).map(k => {
        if (k > today) return '<td class="future"><span></span></td>';
        const r = dayMet(h, state.days[k], state.checks, k, state.settings);
        const label = r === true ? 'erreicht' : r === false ? 'nicht erreicht' : 'keine Daten';
        return `<td class="${r === true ? 'met' : r === false ? 'miss' : 'none'}"><span role="img" aria-label="${formatDay(k)}: ${label}"></span></td>`;
      }).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <h2 class="section-title">Im Vergleich zur Vorwoche</h2>
    <div class="group"><table class="compare">
      <thead><tr><th scope="col"><span class="sr-only">Kennzahl</span></th><th scope="col">Diese</th><th scope="col">Vorwoche</th></tr></thead>
      <tbody>${rows.map(([label, fn, show, better, isSum]) => {
        const a = fn(thisKeys), b = fn(lastKeys);
        let cls = '', arrow = '';
        if (a != null && b != null && !(isSum && thisKeys.length < 7) && Math.abs(num(a) - num(b)) > Math.abs(num(b)) * 0.02) {
          arrow = num(a) > num(b) ? '↑' : '↓';
          if (better) cls = (num(a) - num(b)) * better > 0 ? 'up' : 'down';
        }
        return `<tr><th scope="row">${label}</th><td class="${cls}">${arrow ? `<span class="trend" aria-hidden="true">${arrow}</span>` : ''}${a != null ? show(a) : '–'}</td><td>${b != null ? show(b) : '–'}</td></tr>`;
      }).join('')}</tbody>
    </table></div>
    ${thisKeys.length < 7 ? '<p class="group-footer">Summen wie Trainingstage und Walks werden erst nach Sonntag bewertet.</p>' : ''}
  </div>`;
}

// ---------- Einstellungen ----------

function numRow(label, path, value, attrs = '') {
  const id = 'f-' + path.replace(/\./g, '-');
  return `<li><label for="${id}" class="text">${label}</label><input id="${id}" type="number" inputmode="decimal" data-setting="${path}" value="${value ?? ''}" ${attrs}></li>`;
}

function switchRow(title, sub, attr, checked) {
  return `<li><span class="text">${title}<small>${sub}</small></span><label class="switch"><input type="checkbox" ${attr} ${checked ? 'checked' : ''} aria-label="${title}"><span></span></label></li>`;
}

export const THEMES = [['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']];

export function renderSettings(state, ctx) {
  const st = state.settings;
  const hb = id => st.habits.find(h => h.id === id);
  const builtIn = st.habits.filter(h => !h.manual);
  const custom = st.habits.filter(h => h.manual);
  const ti = THEMES.findIndex(([k]) => k === (st.theme ?? 'dark'));
  return `<div class="view">
    <header class="page-head"><h1>Einstellungen</h1></header>

    <h2 class="section-title">Darstellung</h2>
    <div class="segmented" role="tablist" aria-label="Darstellung" style="--n:3;--i:${ti}">${THEMES.map(([k, l]) =>
      `<button role="tab" aria-selected="${k === (st.theme ?? 'dark')}" data-theme-set="${k}">${l}</button>`).join('')}</div>

    <h2 class="section-title">Ziele</h2>
    <ul class="list group">
      ${numRow('Schritte pro Tag', 'habit.steps.min', hb('steps').min, 'step="500" min="1000"')}
      ${numRow('Schlaf pro Nacht in Stunden', 'habit.sleep.hours', hb('sleep').min / 60, 'step="0.25" min="4" max="12"')}
      ${numRow('Training pro Woche', 'habit.sport.target', hb('sport').target, 'step="1" min="1" max="7"')}
      ${numRow('Training zählt ab Minuten', 'sportMinMin', st.sportMinMin, 'step="5" min="5"')}
      ${numRow('Walking pro Woche', 'habit.walk.target', hb('walk').target, 'step="1" min="1" max="7"')}
      ${numRow('Walk zählt ab Minuten', 'walkMinMin', st.walkMinMin, 'step="5" min="5"')}
      ${numRow('Blutdruck messen pro Woche', 'habit.bp.target', hb('bp').target, 'step="1" min="1" max="7"')}
      ${numRow('Kalorien pro Tag', 'kcalGoal', st.kcalGoal, 'step="50" min="1000"')}
      ${numRow('Zielgewicht in kg', 'weightGoal', st.weightGoal ?? '', 'step="0.5" min="30" placeholder="–"')}
    </ul>

    <h2 class="section-title">Gewohnheiten</h2>
    <ul class="list group">
      ${builtIn.map(h => switchRow(esc(h.name), `${h.kind === 'weekly' ? 'pro Woche' : 'täglich'}, automatisch aus Health`, `data-enable="${h.id}"`, h.enabled)).join('')}
      ${custom.map(h => `<li><span class="text">${esc(h.name)}<small>${h.kind === 'weekly' ? `${h.target}× pro Woche` : 'täglich'}, zum Abhaken</small></span><button class="btn plain danger" data-remove="${esc(h.id)}">Entfernen</button></li>`).join('')}
      <li class="add">
        <form data-form="add-habit" style="display:contents">
          <input type="text" name="name" placeholder="Eigene Gewohnheit, z. B. Dehnen" maxlength="40" required aria-label="Name der Gewohnheit">
          <select name="kind" aria-label="Rhythmus"><option value="daily">täglich</option><option value="weekly">pro Woche</option></select>
          <label class="per-week"><input name="target" type="number" min="1" max="7" value="3" aria-label="Mal pro Woche">× pro Woche</label>
          <button class="btn small" type="submit" style="margin-left:auto">Hinzufügen</button>
        </form>
      </li>
    </ul>
    <p class="group-footer">Training zählt jede Sportart außer Gehen und Wandern, Walking zählt nur Geh-Trainings der Watch. Eigene Gewohnheiten hakst du unter „Heute“ ab.</p>

    <h2 class="section-title">Daten</h2>
    <div class="group">
      <p class="group-footer" style="margin:0;padding:14px 16px 0">${syncText(state).replace(/\.?$/, '.')}${state.demo ? '' : ' ' + (ctx.persistent ? 'Die Daten liegen nur auf diesem Gerät.' : 'Dieser Browser speichert nicht dauerhaft, lege regelmäßig eine Sicherung an.')}</p>
      <div class="btn-row">
        <button class="btn secondary" data-action="export">Sicherung speichern</button>
        <label class="btn secondary">Sicherung laden<input type="file" accept="application/json,.json" data-action="import" hidden></label>
      </div>
    </div>
    <p class="group-footer"><a href="docs/kurzbefehl-anleitung.html">Anleitung für die Kurzbefehle</a></p>
  </div>`;
}
