#!/usr/bin/env node
/**
 * OpenStreetMap -> airport layout importer.
 *
 * Downloads the OSM data of an airport (OSM API `map` call, or a local .osm file) and writes
 * `src/data/airports/<icao>.layout.ts`: the taxi graph (taxiways, runway centre line), runway
 * holding positions, stands with their lead-in lines, aprons and buildings. Runway operations
 * (entries, exits, flows), names and procedures are added by hand in `<icao>.ts`.
 *
 *   node scripts/osm-import.mjs EDJA --bbox 10.215,47.975,10.265,48.000 [--osm file.osm]
 *        [--exclude-ways 123,456] [--simplify 2.5] [--building-margin 40] [--buildings-only]
 *
 * With --buildings-only it writes only the buildings, to `src/data/airports/<icao>.buildings.ts` (for an
 * airport whose taxi graph is built by hand, such as Stuttgart). Several .osm files can be given, comma
 * separated (e.g. a map extract and the full aerodrome relation); they are merged.
 *
 * The output is derived from OpenStreetMap data (© OpenStreetMap contributors) and is available
 * under the Open Database License (ODbL 1.0); credit it in `dataNotice` and in docs/airports/<ICAO>.md.
 *
 * What it does:
 * - keeps the ways tagged aeroway=taxiway/taxilane/runway (runway centre lines with a "06/24" ref)
 *   that are connected to the runway; taxiways in other components (closed military areas, isolated
 *   lines) become `pavement` lines (drawn only),
 * - takes the pavement width of taxiways from their `width` tag (metres) where mapped,
 * - reduces every way to its important nodes (junctions, ends, holding positions) plus shape
 *   points (Douglas-Peucker, `--simplify` metres),
 * - stands from aeroway=parking_position (nodes and ways, grouped by ref): the stand point, and one
 *   (pushback stand) or two (self-manoeuvring / drive-through stand: in and out) lane points where
 *   the lead-in lines meet a taxiway; lane points that are not on the graph are snapped onto the
 *   nearest taxiway edge,
 * - node ids are readable: "N.3" (third shape node on taxiway N), "N/W" (junction of N and W),
 *   "RWY.D" (where D meets the runway), "HP.<osm id>" for holding positions, "STAND_<id>",
 * - areas: aprons (ways and multipolygons), paved taxiway areas (area:aeroway=taxiway) and helipads,
 * - buildings: every building inside the aerodrome boundary (aeroway=aerodrome; ways and multipolygons,
 *   e.g. a terminal mapped as a multipolygon) or within `--building-margin` metres of an apron or taxiway
 *   (hangars just outside a boundary drawn too tightly), plus terminals, hangars and towers anywhere in the box.
 *   Named after their `name` tag; unnamed ones get no label (except "Terminal" / "Tower").
 */
import { readFileSync, writeFileSync } from 'node:fs';

// ------------------------------------------------------------------ arguments
const args = process.argv.slice(2);
const icao = (args[0] ?? '').toUpperCase();
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
if (!/^[A-Z]{4}$/.test(icao)) {
  console.error('usage: node scripts/osm-import.mjs <ICAO> --bbox minLon,minLat,maxLon,maxLat [--osm file] [--exclude-ways ids] [--simplify m]');
  process.exit(1);
}
const bbox = opt('bbox');
const osmFile = opt('osm');
const excludeWays = new Set((opt('exclude-ways', '') ?? '').split(',').filter(Boolean));
const tolerance = Number(opt('simplify', '2.5'));
const buildingMargin = Number(opt('building-margin', '40'));
const buildingsOnly = args.includes('--buildings-only');

let xml;
if (osmFile) xml = osmFile.split(',').map((f) => readFileSync(f, 'utf8')).join('\n');
else {
  if (!bbox) throw new Error('--bbox or --osm required');
  const res = await fetch(`https://api.openstreetmap.org/api/0.6/map?bbox=${bbox}`, { headers: { 'User-Agent': 'ultimate-atc osm-import' } });
  if (!res.ok) throw new Error(`OSM API: ${res.status}`);
  xml = await res.text();
}

// ------------------------------------------------------------------ parse (OSM XML is simple enough for regexes)
const nodes = new Map(); // id -> { lat, lon, tags }
const ways = []; // { id, nds, tags }
const seenWays = new Set();
const attr = (s, k) => new RegExp(`\\b${k}="([^"]*)"`).exec(s)?.[1];
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const tagsOf = (body) => Object.fromEntries([...body.matchAll(/<tag k="([^"]*)" v="([^"]*)"\s*\/>/g)].map((m) => [unescape(m[1]), unescape(m[2])]));
for (const m of xml.matchAll(/<node\b([^>]*?)(\/>|>([\s\S]*?)<\/node>)/g)) {
  nodes.set(attr(m[1], 'id'), { lat: Number(attr(m[1], 'lat')), lon: Number(attr(m[1], 'lon')), tags: m[3] ? tagsOf(m[3]) : {} });
}
for (const m of xml.matchAll(/<way\b([^>]*?)>([\s\S]*?)<\/way>/g)) {
  const id = attr(m[1], 'id');
  if (seenWays.has(id)) continue; // merged files
  seenWays.add(id);
  ways.push({ id, nds: [...m[2].matchAll(/<nd ref="(\d+)"/g)].map((x) => x[1]), tags: tagsOf(m[2]) });
}
const relations = []; // multipolygons: { id, tags, outer: [way ids] }
const seenRelations = new Set();
for (const m of xml.matchAll(/<relation\b([^>]*?)>([\s\S]*?)<\/relation>/g)) {
  const tags = tagsOf(m[2]);
  if (tags.type !== 'multipolygon' || seenRelations.has(attr(m[1], 'id'))) continue;
  seenRelations.add(attr(m[1], 'id'));
  const outer = [...m[2].matchAll(/<member type="way" ref="(\d+)" role="outer"\s*\/>/g)].map((x) => x[1]);
  relations.push({ id: attr(m[1], 'id'), tags, outer });
}

// ------------------------------------------------------------------ local projection (metres around the first runway)
const R = 6371008.8;
const runwayWays = ways.filter((w) => w.tags.aeroway === 'runway' && /^\d{2}[LRC]?\/\d{2}[LRC]?$/.test(w.tags.ref ?? '') && !excludeWays.has(w.id));
if (!runwayWays.length) throw new Error('no runway centre line with a ref like 06/24');
const ref0 = nodes.get(runwayWays[0].nds[0]);
const k = Math.cos((ref0.lat * Math.PI) / 180);
const xy = (n) => ({ x: ((n.lon - ref0.lon) * Math.PI * R * k) / 180, y: ((n.lat - ref0.lat) * Math.PI * R) / 180 });
const ll = (p) => ({ lat: ref0.lat + (p.y * 180) / (Math.PI * R), lon: ref0.lon + (p.x * 180) / (Math.PI * R * k) });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const bearing = (a, b) => ((Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI + 360) % 360;
for (const n of nodes.values()) Object.assign(n, xy(n));

// ------------------------------------------------------------------ taxi graph
const isTaxi = (w) => (w.tags.aeroway === 'taxiway' || w.tags.aeroway === 'taxilane') && !excludeWays.has(w.id) && w.nds.every((id) => nodes.has(id));
let taxiWays = ways.filter(isTaxi);
const graphWays = [...runwayWays.map((w) => ({ ...w, kind: 'runway', name: w.tags.ref })), ...taxiWays.map((w) => ({ ...w, kind: 'taxiway', name: (w.tags.ref ?? '').toUpperCase() }))];

// connected component of the runway
const adj = new Map();
for (const w of graphWays) {
  for (let i = 0; i < w.nds.length - 1; i++) {
    for (const [a, b] of [[w.nds[i], w.nds[i + 1]], [w.nds[i + 1], w.nds[i]]]) {
      if (!adj.has(a)) adj.set(a, new Set());
      adj.get(a).add(b);
    }
  }
}
const reach = new Set();
const stack = runwayWays.map((w) => w.nds[0]);
while (stack.length) {
  const id = stack.pop();
  if (reach.has(id)) continue;
  reach.add(id);
  for (const nb of adj.get(id) ?? []) stack.push(nb);
}
const kept = graphWays.filter((w) => w.nds.some((id) => reach.has(id)));
const dropped = graphWays.filter((w) => !kept.includes(w));
if (dropped.length) console.error(`dropped ${dropped.length} ways not connected to the runway: ${dropped.map((w) => `${w.id}(${w.name || '-'})`).join(' ')}`);

// nodes used by several ways / way ends / tagged nodes are important
const use = new Map();
for (const w of kept) for (const id of new Set(w.nds)) use.set(id, (use.get(id) ?? 0) + 1);
const holding = new Set([...nodes].filter(([id, n]) => n.tags.aeroway === 'holding_position' && use.has(id)).map(([id]) => id));
const important = (w, i) => i === 0 || i === w.nds.length - 1 || use.get(w.nds[i]) > 1 || holding.has(w.nds[i]);

/** Douglas-Peucker on a run of node ids (first and last kept). */
function simplify(ids) {
  if (ids.length <= 2) return ids;
  const a = nodes.get(ids[0]);
  const b = nodes.get(ids[ids.length - 1]);
  let worst = 0;
  let at = -1;
  for (let i = 1; i < ids.length - 1; i++) {
    const p = nodes.get(ids[i]);
    const L = dist(a, b) || 1e-9;
    const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L;
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  if (worst <= tolerance) return [ids[0], ids[ids.length - 1]];
  return [...simplify(ids.slice(0, at + 1)).slice(0, -1), ...simplify(ids.slice(at))];
}

/** Graph edges between OSM node ids. */
const edges = [];
for (const w of kept) {
  let run = [w.nds[0]];
  for (let i = 1; i < w.nds.length; i++) {
    run.push(w.nds[i]);
    if (important(w, i)) {
      const s = w.kind === 'runway' ? [run[0], run[run.length - 1]] : simplify(run);
      for (let j = 0; j < s.length - 1; j++) if (s[j] !== s[j + 1]) edges.push({ from: s[j], to: s[j + 1], name: w.name, kind: w.kind, oneWay: w.tags.oneway === 'yes', width: w.kind === 'runway' ? undefined : parseFloat(w.tags.width ?? '') || undefined });
      run = [w.nds[i]];
    }
  }
}
// runway: also split at nodes where taxiways join (they are important through `use`)

// ------------------------------------------------------------------ stands
const parking = ways.filter((w) => w.tags.aeroway === 'parking_position' && w.nds.every((id) => nodes.has(id)));
const parkingNodes = [...nodes].filter(([, n]) => n.tags.aeroway === 'parking_position');
const refs = new Set([...parking.map((w) => w.tags.ref), ...parkingNodes.map(([, n]) => n.tags.ref)].filter(Boolean));

/** Nearest point on a non-runway graph edge. */
function nearestOnGraph(p) {
  let best;
  for (const e of edges) {
    if (e.kind === 'runway') continue;
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1e-9;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2));
    const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    const d = dist(p, q);
    if (!best || d < best.d) best = { e, t, q, d };
  }
  return best;
}
let snapCount = 0;
/** Returns a graph node id at (or near) point p, splitting an edge if needed. */
function laneNodeAt(p) {
  const hit = nearestOnGraph(p);
  if (!hit) return undefined;
  const a = nodes.get(hit.e.from);
  const b = nodes.get(hit.e.to);
  if (dist(hit.q, a) < 6) return hit.e.from;
  if (dist(hit.q, b) < 6) return hit.e.to;
  const id = `snap${++snapCount}`;
  nodes.set(id, { ...ll(hit.q), ...hit.q, tags: {} });
  const i = edges.indexOf(hit.e);
  edges.splice(i, 1, { ...hit.e, to: id }, { ...hit.e, from: id });
  return id;
}

const standsOut = [];
const graphNodeIds = () => new Set(edges.flatMap((e) => [e.from, e.to]));
for (const ref of [...refs].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
  const ws = parking.filter((w) => w.tags.ref === ref);
  const pn = parkingNodes.find(([, n]) => n.tags.ref === ref)?.[1];
  const g = graphNodeIds();
  // Line ends that touch the taxi graph, or come within 25 m of it.
  const ends = [];
  for (const w of ws) {
    for (const id of [w.nds[0], w.nds[w.nds.length - 1]]) {
      const n = nodes.get(id);
      const onGraph = g.has(id);
      const near = onGraph ? 0 : nearestOnGraph(n)?.d ?? Infinity;
      if (onGraph || near < 25) ends.push({ id, n, onGraph, way: w });
    }
  }
  // Stand point: the tagged node, else the line point farthest from the graph.
  let standPt = pn;
  if (!standPt) {
    let far = -1;
    for (const w of ws) for (const id of w.nds) {
      const n = nodes.get(id);
      const d = nearestOnGraph(n)?.d ?? 0;
      if (d > far) {
        far = d;
        standPt = n;
      }
    }
  }
  if (!standPt) continue;
  // Distinct lane points (more than 15 m apart).
  const lanes = [];
  for (const e of ends) if (!lanes.some((l) => dist(l.n, e.n) < 15)) lanes.push(e);
  if (!lanes.length) {
    const hit = nearestOnGraph(standPt);
    if (!hit || hit.d > 150) continue;
    lanes.push({ n: hit.q });
  }
  const laneIds = lanes.slice(0, 2).map((l) => (l.onGraph ? l.id : laneNodeAt(l.n)));
  standsOut.push({ id: ref.replace(/\s+/g, ''), pos: ll(standPt), xy: { x: standPt.x, y: standPt.y }, lanes: laneIds });
}
// headings and sizes
for (const s of standsOut) {
  const lane = nodes.get(s.lanes[0]);
  if (s.lanes.length === 1) s.heading = Math.round(bearing(lane, s.xy)); // nose in, push back
  else s.heading = Math.round(bearing(s.xy, nodes.get(s.lanes[1]))); // parked facing its way out
  let near = Infinity;
  for (const o of standsOut) if (o !== s) near = Math.min(near, dist(s.xy, o.xy));
  s.spacingM = Math.round(near);
}

// ------------------------------------------------------------------ readable ids
const graphIds = graphNodeIds();
const names = new Map();
const used = new Set();
const unique = (base) => {
  let id = base;
  for (let i = 2; used.has(id); i++) id = `${base}.${i}`;
  used.add(id);
  return id;
};
const wayNamesAt = (id) => [...new Set(edges.filter((e) => e.from === id || e.to === id).map((e) => (e.kind === 'runway' ? 'RWY' : e.name || '?')))].sort();
for (const id of graphIds) {
  const ns = wayNamesAt(id);
  if (holding.has(id)) continue;
  if (ns.includes('RWY')) {
    const others = ns.filter((x) => x !== 'RWY');
    names.set(id, unique(others.length ? `RWY.${others.join('/')}` : 'RWY.END'));
  } else if (ns.length > 1) names.set(id, unique(ns.join('/')));
}
for (const id of holding) names.set(id, unique(`HP.${id}`));
const counters = new Map();
for (const id of graphIds) {
  if (names.has(id)) continue;
  const base = wayNamesAt(id)[0];
  const c = (counters.get(base) ?? 0) + 1;
  counters.set(base, c);
  names.set(id, unique(`${base}.${c}`));
}

// ------------------------------------------------------------------ areas
const polygon = (w) => w.nds.map((id) => nodes.get(id)).filter(Boolean);
const wayById = new Map(ways.map((w) => [w.id, w]));
/** Outer rings of a multipolygon, as pseudo-ways (member ways joined end to end). */
function outerRings(rel) {
  const parts = rel.outer.map((id) => wayById.get(id)?.nds).filter((nds) => nds && nds.every((id) => nodes.has(id))).map((nds) => [...nds]);
  const rings = [];
  while (parts.length) {
    let ring = parts.shift();
    for (let joined = true; joined && ring[0] !== ring[ring.length - 1]; ) {
      joined = false;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const end = ring[ring.length - 1];
        if (p[0] === end) ring = [...ring, ...p.slice(1)];
        else if (p[p.length - 1] === end) ring = [...ring, ...[...p].reverse().slice(1)];
        else continue;
        parts.splice(i, 1);
        joined = true;
        break;
      }
    }
    if (ring.length > 3 && ring[0] === ring[ring.length - 1]) rings.push({ id: rel.id, nds: ring, tags: rel.tags });
  }
  return rings;
}
const polygonWays = [...ways, ...relations.flatMap(outerRings)];
// Aerodrome boundary (for the buildings).
const aerodrome = polygonWays.filter((w) => w.tags.aeroway === 'aerodrome' && w.nds.length > 3).map(polygon);
const insideRing = (ring, p) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};
const segDist = (p, a, b) => {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1e-9;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2));
  return Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y));
};
const paved = polygonWays.filter((w) => w.tags.aeroway === 'apron' || w.tags.aeroway === 'taxiway').map(polygon);
const onAerodrome = (pts) => {
  const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  if (!aerodrome.length || aerodrome.some((ring) => insideRing(ring, c))) return true;
  return paved.some((line) => line.some((p, i) => i > 0 && segDist(c, line[i - 1], p) < buildingMargin));
};
const simplifyPoly = (pts) => {
  // Douglas-Peucker on a temporary node table. A closed ring (first = last point) is split at the point
  // farthest from its start, so the two halves keep their shape.
  const tmp = pts.map((p, i) => [`p${i}`, p]);
  for (const [id, p] of tmp) nodes.set(id, p);
  const ids = tmp.map(([id]) => id);
  let out;
  if (pts.length > 3 && dist(pts[0], pts[pts.length - 1]) < 0.5) {
    let k = 1;
    for (let i = 1; i < pts.length - 1; i++) if (dist(pts[0], pts[i]) > dist(pts[0], pts[k])) k = i;
    out = [...simplify(ids.slice(0, k + 1)).slice(0, -1), ...simplify(ids.slice(k))].map((id) => nodes.get(id));
  } else out = simplify(ids).map((id) => nodes.get(id));
  for (const [id] of tmp) nodes.delete(id);
  return out;
};
const areaName = (t) =>
  t.aeroway === 'apron' ? t.name ?? (t.ref ? `Apron ${t.ref}` : 'Apron') : t.aeroway === 'helipad' ? t.ref ?? t.name ?? 'Helipad' : t['area:aeroway'] === 'taxiway' ? t.ref ?? '' : '';
const areas = polygonWays
  .filter((w) => (w.tags.aeroway === 'apron' || w.tags.aeroway === 'helipad' || w.tags['area:aeroway'] === 'taxiway') && w.nds.length > 3)
  .map((w) => ({ name: areaName(w.tags), pts: simplifyPoly(polygon(w)) }));
const aerowayBuilding = (t) => t.aeroway === 'terminal' || t.aeroway === 'hangar' || t.aeroway === 'tower' || ['terminal', 'hangar'].includes(t.building);
const buildings = polygonWays
  .filter((w) => w.nds.length > 3 && ((w.tags.building && w.tags.building !== 'no') || aerowayBuilding(w.tags)))
  .filter((w) => aerowayBuilding(w.tags) || onAerodrome(polygon(w)))
  .map((w) => ({ name: w.tags.name ?? (w.tags.aeroway === 'tower' ? 'Tower' : w.tags.aeroway === 'terminal' || w.tags.building === 'terminal' ? 'Terminal' : ''), pts: simplifyPoly(polygon(w)) }));

// ------------------------------------------------------------------ output
const f6 = (v) => Number(v.toFixed(7));
if (buildingsOnly) {
  const out = `src/data/airports/${icao.toLowerCase()}.buildings.ts`;
  const body = buildings.map((a) => `  { name: ${JSON.stringify(a.name)}, polygon: [${a.pts.map((p) => `[${f6(p.lat)}, ${f6(p.lon)}]`).join(', ')}] },`);
  writeFileSync(
    out,
    [
      `// Generated by scripts/osm-import.mjs --buildings-only from OpenStreetMap on ${new Date().toISOString().slice(0, 10)} - do not edit by hand.`,
      '// Data © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0).',
      '',
      '/** Buildings on the aerodrome: name ("" = no label) and outline as [lat, lon] points. */',
      `export const ${icao}_BUILDINGS: { name: string; polygon: [number, number][] }[] = [`,
      ...body,
      '];',
      '',
    ].join('\n'),
  );
  console.error(`${out}: ${buildings.length} buildings`);
  process.exit(0);
}
const holdingOut = [...holding].map((id) => {
  const t = nodes.get(id).tags;
  return { node: names.get(id), osm: id, ref: t.ref ?? '', type: t['holding_position:type'] ?? '', taxiways: wayNamesAt(id).filter((x) => x !== 'RWY') };
});
const q = (s) => JSON.stringify(s);
const lines = [];
lines.push(`// Generated by scripts/osm-import.mjs from OpenStreetMap on ${new Date().toISOString().slice(0, 10)} - do not edit by hand,`);
lines.push('// change OSM-derived facts in the importer options or override them in the airport file.');
lines.push('// Data © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0).');
lines.push("import type { OsmLayout } from './osmLayout';");
lines.push('');
lines.push(`export const ${icao}_LAYOUT: OsmLayout = {`);
lines.push('  // [id, lat, lon]');
lines.push('  nodes: [');
for (const id of [...graphIds].sort((a, b) => names.get(a).localeCompare(names.get(b), 'en', { numeric: true }))) {
  const n = nodes.get(id);
  lines.push(`    [${q(names.get(id))}, ${f6(n.lat)}, ${f6(n.lon)}],`);
}
lines.push('  ],');
lines.push('  // [from, to, name, kind, oneWay?, widthM?]');
lines.push('  edges: [');
for (const e of edges) lines.push(`    [${q(names.get(e.from))}, ${q(names.get(e.to))}, ${q(e.name)}, ${q(e.kind)}${e.oneWay || e.width ? `, ${e.oneWay}` : ''}${e.width ? `, ${e.width}` : ''}],`);
lines.push('  ],');
lines.push('  holdingPositions: [');
for (const h of holdingOut) lines.push(`    { node: ${q(h.node)}, ref: ${q(h.ref)}, type: ${q(h.type)}, taxiways: ${q(h.taxiways)} },`);
lines.push('  ],');
lines.push('  stands: [');
for (const s of standsOut) lines.push(`    { id: ${q(s.id)}, pos: [${f6(s.pos.lat)}, ${f6(s.pos.lon)}], heading: ${s.heading}, lanes: ${q(s.lanes.map((x) => names.get(x)))}, spacingM: ${s.spacingM} },`);
lines.push('  ],');
const polyOut = (list) => list.map((a) => `    { name: ${q(a.name)}, polygon: [${a.pts.map((p) => `[${f6(p.lat)}, ${f6(p.lon)}]`).join(', ')}] },`);
lines.push('  areas: [');
lines.push(...polyOut(areas));
lines.push('  ],');
lines.push('  buildings: [');
lines.push(...polyOut(buildings));
lines.push('  ],');
// Taxiways not connected to the runway: drawn only.
const loose = dropped.filter((w) => w.kind === 'taxiway').map((w) => ({ name: w.name, width: parseFloat(w.tags.width ?? '') || undefined, pts: simplifyPoly(polygon(w)) }));
lines.push('  pavement: [');
for (const l of loose) lines.push(`    { name: ${q(l.name)}, points: [${l.pts.map((p) => `[${f6(p.lat)}, ${f6(p.lon)}]`).join(', ')}]${l.width ? `, widthM: ${l.width}` : ''} },`);
lines.push('  ],');
lines.push('};');
const out = `src/data/airports/${icao.toLowerCase()}.layout.ts`;
writeFileSync(out, lines.join('\n') + '\n');
console.error(`${out}: ${graphIds.size} nodes, ${edges.length} edges, ${holdingOut.length} holding positions, ${standsOut.length} stands, ${areas.length} aprons, ${buildings.length} buildings`);
