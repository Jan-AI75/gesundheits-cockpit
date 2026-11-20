// Schlichte SVG-Diagramme ohne Bibliothek.

const W = 340, PAD = { l: 40, r: 8, t: 10, b: 20 };

function scale(min, max, h) {
  const span = max - min || 1;
  return v => PAD.t + (h - PAD.t - PAD.b) * (1 - (v - min) / span);
}

function niceRange(values, extra = []) {
  const all = [...values, ...extra].filter(v => v != null);
  if (!all.length) return [0, 1];
  let min = Math.min(...all), max = Math.max(...all);
  const pad = (max - min) * 0.12 || Math.abs(max) * 0.05 || 1;
  return [min - pad, max + pad];
}

function round2(v) {
  if (v === 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))) - 1);
  return Math.round(v / mag) * mag;
}
const fmt = v => new Intl.NumberFormat('de-DE', { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 }).format(round2(v));

function axis(min, max, y, h, opts) {
  const ticks = [min + (max - min) * 0.15, (min + max) / 2, max - (max - min) * 0.15];
  return ticks.map(t => `<text x="${PAD.l - 6}" y="${y(t) + 3}" class="ax" text-anchor="end">${(opts.tick ?? fmt)(t)}</text>`).join('');
}

function xLabels(keys, x, h) {
  if (!keys.length) return '';
  const idx = keys.length <= 7 ? keys.map((_, i) => i) : [0, Math.floor((keys.length - 1) / 2), keys.length - 1];
  return idx.map(i => {
    const [, m, d] = keys[i].split('-');
    return `<text x="${x(i)}" y="${h - 4}" class="ax" text-anchor="middle">${+d}.${+m}.</text>`;
  }).join('');
}

function refLines(lines = [], y, h) {
  return lines.map(l => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(l.y)}" y2="${y(l.y)}" class="ref ${l.cls ?? ''}"/>` +
    (l.label ? `<text x="${W - PAD.r}" y="${y(l.y) - 4}" class="ax ref-label" text-anchor="end">${l.label}</text>` : '')).join('');
}

/**
 * Säulen. points: [{key, y}] (y darf null sein). opts: {height, goal, tick}
 */
export function barChart(points, opts = {}) {
  const h = opts.height ?? 170;
  const vals = points.map(p => p.y);
  const [, maxR] = niceRange(vals, [opts.goal]);
  const min = 0, max = maxR;
  const y = scale(min, max, h);
  const n = points.length, inner = W - PAD.l - PAD.r, bw = inner / n;
  const x = i => PAD.l + bw * i + bw / 2;
  const bars = points.map((p, i) => p.y == null ? '' :
    `<rect x="${PAD.l + bw * i + bw * 0.18}" y="${y(p.y)}" width="${Math.max(bw * 0.64, 1)}" height="${Math.max(y(min) - y(p.y), 0)}" rx="${Math.min(2, bw * 0.2)}" class="bar ${opts.goal != null && p.y >= opts.goal ? 'met' : ''}"/>`).join('');
  const goal = opts.goal != null ? refLines([{ y: opts.goal, label: opts.goalLabel ?? 'Ziel' }], y, h) : '';
  return `<svg viewBox="0 0 ${W} ${h}" class="chart" role="img" aria-label="${opts.label ?? 'Diagramm'}">${axis(min, max, y, h, opts)}${bars}${goal}${xLabels(points.map(p => p.key), x, h)}</svg>`;
}

/**
 * Linien. series: [{points:[{key,y}], cls, dots}], alle mit gleichen keys. opts: {height, refs, tick}
 */
export function lineChart(series, opts = {}) {
  const h = opts.height ?? 170;
  const keys = series[0]?.points.map(p => p.key) ?? [];
  const [min, max] = niceRange(series.flatMap(s => s.points.map(p => p.y)), (opts.refs ?? []).map(r => r.y));
  const y = scale(min, max, h);
  const n = keys.length, inner = W - PAD.l - PAD.r;
  const x = i => PAD.l + (n <= 1 ? inner / 2 : (inner * i) / (n - 1));
  const paths = series.map(s => {
    let d = '', pen = false;
    s.points.forEach((p, i) => {
      if (p.y == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`;
      pen = true;
    });
    const dots = s.dots ? s.points.map((p, i) => p.y == null ? '' : `<circle cx="${x(i)}" cy="${y(p.y)}" r="${n > 60 ? 1.4 : 2.4}" class="dot ${s.cls ?? ''}"/>`).join('') : '';
    return (s.line === false ? '' : `<path d="${d}" class="line ${s.cls ?? ''}"/>`) + dots;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${h}" class="chart" role="img" aria-label="${opts.label ?? 'Diagramm'}">${axis(min, max, y, h, opts)}${refLines(opts.refs, y, h)}${paths}${xLabels(keys, x, h)}</svg>`;
}

/**
 * Kalender-Raster: Spalten = Wochen, Zeilen = Mo…So. cells: [{key, state:'met'|'miss'|'none'|'future'}]
 */
export function heatmap(cells, opts = {}) {
  const cols = Math.ceil(cells.length / 7), size = 11, gap = 3;
  const w = cols * (size + gap), h = 7 * (size + gap);
  const rects = cells.map((c, i) => {
    const col = Math.floor(i / 7), row = i % 7;
    return `<rect x="${col * (size + gap)}" y="${row * (size + gap)}" width="${size}" height="${size}" rx="2.5" class="hm ${c.state}"><title>${c.key}</title></rect>`;
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" class="heatmap" role="img" aria-label="${opts.label ?? 'Verlauf'}">${rects}</svg>`;
}
