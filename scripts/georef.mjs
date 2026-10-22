#!/usr/bin/env node
/**
 * Georeferencing helper for digitising paved areas that OpenStreetMap does not have.
 *
 * You render an official chart (aerodrome / ground movement chart) as an image on your own machine - the
 * chart is a REFERENCE ONLY and never goes into the repository - and measure pixel positions on it:
 * a few control points with known coordinates (runway thresholds from the AIP, the ARP, graticule crossings)
 * and the outlines or centre lines you want to digitise. This script fits the pixel -> lat/lon transform,
 * reports how well the control points fit, and converts the traced pixels into the coordinate format of
 * the airport data files.
 *
 *   node scripts/georef.mjs control.json [trace.json] [--similarity]
 *
 * control.json: { "points": [ { "name": "THR13L", "px": [412.5, 233.0], "ll": [50.8818, 7.1197] }, ... ] }
 *   At least 3 points (affine fit: scale, rotation and shear per axis) or 2 (--similarity: one scale and a
 *   rotation, for charts drawn to scale). Spread them over the chart; 4 or more show the residuals.
 * trace.json: { "lines": [ { "name": "G", "closed": true, "widthM": 15, "px": [[x, y], ...] } ],
 *               "areas": [ { "name": "Apron G2", "px": [[x, y], ...] } ] }
 *
 * Output: the fit (metres per pixel, rotation), the residual of every control point in metres, and the
 * traced lines and areas as `[lat, lon]` arrays (7 decimals) ready for `pavement` / `areas`. Check the
 * result on the scope and against OpenStreetMap; mark digitised parts as approximate in `dataNotice` and
 * in docs/airports/<ICAO>.md.
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const similarity = args.includes('--similarity');
const [controlFile, traceFile] = args.filter((a) => !a.startsWith('--'));
if (!controlFile) {
  console.error('usage: node scripts/georef.mjs control.json [trace.json] [--similarity]');
  process.exit(1);
}
const control = JSON.parse(readFileSync(controlFile, 'utf8')).points;
if (control.length < (similarity ? 2 : 3)) throw new Error(`need at least ${similarity ? 2 : 3} control points`);

// Local metric frame around the mean of the control points (WGS84 radii of curvature).
const lat0 = control.reduce((s, p) => s + p.ll[0], 0) / control.length;
const lon0 = control.reduce((s, p) => s + p.ll[1], 0) / control.length;
const a = 6378137, e2 = 0.00669437999, phi = (lat0 * Math.PI) / 180;
const kx = ((Math.PI / 180) * a * Math.cos(phi)) / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
const ky = ((Math.PI / 180) * a * (1 - e2)) / (1 - e2 * Math.sin(phi) ** 2) ** 1.5;
const toM = ([lat, lon]) => [(lon - lon0) * kx, (lat - lat0) * ky];
const toLL = ([x, y]) => [lat0 + y / ky, lon0 + x / kx];

/** Least squares: solves (AᵀA) p = Aᵀb by Gauss-Jordan elimination. */
function solve(rows, rhs) {
  const n = rows[0].length;
  const m = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0)));
  const v = Array.from({ length: n }, (_, i) => rows.reduce((s, r, k) => s + r[i] * rhs[k], 0));
  for (let i = 0; i < n; i++) {
    const p = m.reduce((best, _, r) => (r >= i && Math.abs(m[r][i]) > Math.abs(m[best][i]) ? r : best), i);
    [m[i], m[p]] = [m[p], m[i]];
    [v[i], v[p]] = [v[p], v[i]];
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = m[r][i] / m[i][i];
      for (let c = i; c < n; c++) m[r][c] -= f * m[i][c];
      v[r] -= f * v[i];
    }
  }
  return v.map((x, i) => x / m[i][i]);
}

// Pixel (x right, y down) -> metres (x east, y north).
const rows = [];
const rhs = [];
for (const p of control) {
  const [px, py] = p.px;
  const [x, y] = toM(p.ll);
  if (similarity) rows.push([px, py, 1, 0], [-py, px, 0, 1]);
  else rows.push([px, py, 1, 0, 0, 0], [0, 0, 0, px, py, 1]);
  rhs.push(x, y);
}
const k = solve(rows, rhs);
const pxToM = similarity
  ? ([px, py]) => [k[0] * px + k[1] * py + k[2], k[1] * px - k[0] * py + k[3]]
  : ([px, py]) => [k[0] * px + k[1] * py + k[2], k[3] * px + k[4] * py + k[5]];
const pxToLL = (p) => toLL(pxToM(p));

const [o, ex, ey] = [pxToM([0, 0]), pxToM([1, 0]), pxToM([0, 1])];
const scaleX = Math.hypot(ex[0] - o[0], ex[1] - o[1]);
const scaleY = Math.hypot(ey[0] - o[0], ey[1] - o[1]);
const rotation = (Math.atan2(ex[1] - o[1], ex[0] - o[0]) * 180) / Math.PI;
console.log(`fit: ${similarity ? 'similarity' : 'affine'}, ${scaleX.toFixed(3)} / ${scaleY.toFixed(3)} m per pixel (x / y), image x axis ${rotation.toFixed(2)}° from east`);
let worst = 0;
for (const p of control) {
  const [x, y] = pxToM(p.px);
  const [tx, ty] = toM(p.ll);
  const r = Math.hypot(x - tx, y - ty);
  worst = Math.max(worst, r);
  console.log(`  ${p.name.padEnd(12)} residual ${r.toFixed(1)} m`);
}
if (control.length > (similarity ? 2 : 3)) console.log(`  worst residual ${worst.toFixed(1)} m${worst > 5 ? ' - check the control points' : ''}`);

if (traceFile) {
  const trace = JSON.parse(readFileSync(traceFile, 'utf8'));
  const fmt = (pts) => `[${pts.map((p) => pxToLL(p)).map(([la, lo]) => `[${la.toFixed(7)}, ${lo.toFixed(7)}]`).join(', ')}]`;
  for (const l of trace.lines ?? []) {
    const props = [l.name ? `name: '${l.name}'` : '', l.closed ? 'closed: true' : '', `widthM: ${l.widthM ?? 15}`].filter(Boolean).join(', ');
    console.log(`{ ${props}, points: ${fmt(l.px)} },`);
  }
  for (const ar of trace.areas ?? []) console.log(`['${ar.name ?? ''}', ${fmt(ar.px)}],`);
}
