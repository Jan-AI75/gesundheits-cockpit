// Start, Datenübernahme, Navigation, Ereignisse.
import { dayKey, formatDay } from './dates.js';
import { parseFragment, normalize } from './ingest.js';
import { openStore, mergeDays, findGaps, exportState, importState } from './store.js';
import { DEFAULT_SETTINGS } from './habits.js';
import { demoState } from './demo.js';
import { renderToday, renderTrends, renderStreaks, renderWeek, renderSettings, renderEmpty, esc } from './ui.js';

const main = document.querySelector('main');
const tabs = document.querySelector('nav.tabs');
const topbar = document.querySelector('.topbar');
const TITLES = { today: 'Heute', trends: 'Verlauf', streaks: 'Serien', week: 'Woche', settings: 'Einstellungen' };
let store, state, banner = '';
const view = { tab: 'today', metric: 'steps', range: 30 };

function withDefaults(settings) {
  const s = structuredClone(DEFAULT_SETTINGS);
  if (!settings) return s;
  const habits = s.habits.map(d => ({ ...d, ...(settings.habits?.find(h => h.id === d.id) ?? {}), name: d.name }));
  const { exMinFallback, ...rest } = settings;
  return { ...s, ...rest, habits: [...habits, ...(settings.habits ?? []).filter(h => h.manual)] };
}

function note(text, kind = 'info') {
  return `<div class="banner ${kind}" role="status">${text}</div>`;
}

async function save() {
  if (!state.demo) await store.save(state);
}

function applyTheme() {
  const t = state?.settings?.theme ?? 'dark';
  document.documentElement.dataset.theme = t;
  const light = t === 'light' || (t === 'auto' && matchMedia('(prefers-color-scheme: light)').matches);
  document.querySelector('meta[name="theme-color"]').content = light ? '#f2f2f7' : '#000000';
}

function render({ animate = false } = {}) {
  applyTheme();
  main.classList.toggle('static', !animate);
  const chipScroll = main.querySelector('.chips')?.scrollLeft ?? 0;
  const today = dayKey();
  const hasData = Object.keys(state.days).length > 0 || state.demo;
  tabs.hidden = !hasData;
  if (!hasData) { main.innerHTML = (banner || '') + renderEmpty(); return; }
  const ctx = { banner, persistent: store.persistent };
  main.innerHTML = {
    today: () => renderToday(state, today, ctx),
    trends: () => renderTrends(state, today, view),
    streaks: () => renderStreaks(state, today),
    week: () => renderWeek(state, today),
    settings: () => renderSettings(state, ctx),
  }[view.tab]();
  for (const b of tabs.querySelectorAll('button')) b.setAttribute('aria-current', b.dataset.tab === view.tab ? 'page' : 'false');
  topbar.textContent = TITLES[view.tab];
  const chips = main.querySelector('.chips');
  if (chips) {
    chips.scrollLeft = animate ? 0 : chipScroll;
    chips.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  watchTitle();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    for (const c of main.querySelectorAll('.ring .fill')) c.style.strokeDashoffset = c.dataset.offset;
  }));
}

// Kompakte Titelleiste einblenden, sobald der große Titel aus dem Bild scrollt.
let titleObserver;
function watchTitle() {
  titleObserver?.disconnect();
  const h1 = main.querySelector('.page-head h1');
  if (!h1 || !('IntersectionObserver' in window)) { topbar.classList.remove('show'); return; }
  titleObserver = new IntersectionObserver(([e]) => topbar.classList.toggle('show', !e.isIntersecting && e.boundingClientRect.top < 0));
  titleObserver.observe(h1);
}

function go(tab) {
  view.tab = tab;
  window.scrollTo(0, 0);
  render({ animate: true });
}

function gapBanner() {
  const gaps = findGaps(state.days, dayKey());
  if (!gaps.length) return '';
  const span = gaps.length === 1 ? formatDay(gaps[0]) : `${gaps.length} Tage, ${formatDay(gaps[0])} bis ${formatDay(gaps[gaps.length - 1])}`;
  return note(`Für ${span} fehlen Daten. Führe einmal den Kurzbefehl „Verlauf laden“ aus.`, 'warn');
}

// Daten aus dem Fragment übernehmen. Läuft beim Start und wenn Safari nur das Fragment
// eines bereits offenen Tabs austauscht (dann gibt es kein Neuladen, nur "hashchange").
async function handleFragment() {
  const parsed = parseFragment(location.hash);
  if (!parsed) return false;
  if (parsed.ok) {
    state.days = mergeDays(state.days, normalize(parsed.payload));
    state.lastSync = new Date().toISOString();
    banner = '';
    await save();
  } else {
    banner = note(`${parsed.error} Deine gespeicherten Daten sind unverändert.`, 'warn');
  }
  history.replaceState(null, '', location.pathname + location.search);
  return true;
}

window.addEventListener('hashchange', async () => {
  if (!state) return;
  if (location.hash === '#demo') { state = demoState(dayKey()); render(); return; }
  if (state.demo) { state = await store.load(); state.settings = withDefaults(state.settings); }
  if (await handleFragment()) { if (!banner) banner = gapBanner(); render(); }
});

async function start() {
  store = await openStore();
  state = await store.load();
  state.settings = withDefaults(state.settings);

  const demo = document.documentElement.hasAttribute('data-demo') || location.hash === '#demo';
  await handleFragment();
  if (demo) state = demoState(dayKey());
  else banner += gapBanner();
  render({ animate: true });
}

matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => state && applyTheme());

tabs.addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  go(b.dataset.tab);
});

main.addEventListener('click', async e => {
  const t = e.target.closest('button, [data-action]');
  if (!t) return;
  if (t.dataset.action === 'demo') { state = demoState(dayKey()); banner = ''; render({ animate: true }); return; }
  if (t.dataset.goto) { view.metric = t.dataset.goto; go('trends'); return; }
  if (t.dataset.themeSet) { slide(t); state.settings.theme = t.dataset.themeSet; await save(); setTimeout(render, 200); return; }
  if (t.dataset.toggle) {
    const id = t.dataset.toggle, k = dayKey();
    const c = (state.checks[id] ??= {});
    if (c[k]) delete c[k]; else c[k] = true;
    await save(); render(); return;
  }
  if (t.dataset.metric) { view.metric = t.dataset.metric; render(); return; }
  if (t.dataset.range) { slide(t); view.range = Number(t.dataset.range); setTimeout(render, 200); return; }
  if (t.dataset.remove) {
    const h = state.settings.habits.find(x => x.id === t.dataset.remove);
    if (h && confirmInline(t, `„${h.name}“ entfernen?`)) {
      state.settings.habits = state.settings.habits.filter(x => x !== h);
      delete state.checks[h.id];
      await save(); render();
    }
    return;
  }
  if (t.dataset.action === 'export') {
    const blob = new Blob([exportState(state)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `cockpit-sicherung-${dayKey()}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
});

// Segment-Daumen gleiten lassen, bevor neu gezeichnet wird.
function slide(btn) {
  const seg = btn.closest('.segmented');
  if (!seg) return;
  const idx = [...seg.children].indexOf(btn);
  seg.style.setProperty('--i', idx);
  for (const b of seg.children) b.setAttribute('aria-selected', b === btn);
}

// Zweistufiges Entfernen ohne Browser-Dialog: erster Tipp fragt, zweiter bestätigt.
function confirmInline(btn, text) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1';
  btn.textContent = 'Wirklich entfernen';
  btn.setAttribute('aria-label', text);
  setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = 'Entfernen'; } }, 4000);
  return false;
}

main.addEventListener('change', async e => {
  const el = e.target;
  if (el.dataset.enable) {
    const h = state.settings.habits.find(x => x.id === el.dataset.enable);
    if (h) h.enabled = el.checked;
    await save(); return;
  }
  if (el.dataset.setting) {
    const v = el.value === '' ? null : Number(el.value);
    if (v != null && (!Number.isFinite(v) || v <= 0)) return;
    const p = el.dataset.setting.split('.');
    if (p[0] === 'habit') {
      const h = state.settings.habits.find(x => x.id === p[1]);
      if (!h || v == null) return;
      if (p[2] === 'hours') h.min = Math.round(v * 60); else h[p[2]] = v;
    } else state.settings[p[0]] = v;
    await save(); return;
  }
  if (el.dataset.action === 'import' && el.files?.[0]) {
    try {
      const imported = importState(await el.files[0].text());
      imported.settings = withDefaults(imported.settings);
      state = imported;
      await save();
      banner = note('Sicherung geladen.');
    } catch (err) {
      banner = note(esc(err.message), 'warn');
    }
    view.tab = 'today';
    render();
  }
});

main.addEventListener('submit', async e => {
  if (e.target.dataset.form !== 'add-habit') return;
  e.preventDefault();
  const f = new FormData(e.target);
  const name = String(f.get('name') || '').trim();
  if (!name) return;
  const kind = f.get('kind') === 'weekly' ? 'weekly' : 'daily';
  const target = Math.min(7, Math.max(1, Number(f.get('target')) || 1));
  state.settings.habits.push({ id: `c-${Date.now().toString(36)}`, name, kind, target: kind === 'weekly' ? target : undefined, manual: true, enabled: true });
  await save(); render();
});

document.addEventListener('visibilitychange', () => { if (!document.hidden && state) render(); });

start();
