import { AIRCRAFT_TYPES } from '../../data/aircraftTypes';
import { AIRLINES } from '../../data/airlines';
import { Airport } from './airport';
import { findRoute, isRouteError } from './routing';
import type { AirportData } from './types';

/**
 * Checks an airport's data for mistakes that would break the simulation or
 * the briefing: dangling references, unreachable stands and holding points,
 * unknown operators or aircraft types. Returns a list of problems (empty if
 * the data is fine). Every airport must pass this (see tests/airports.test.ts).
 */
export function validateAirport(data: AirportData): string[] {
  const problems: string[] = [];
  const add = (msg: string) => problems.push(`${data.icao}: ${msg}`);

  // ---------------------------------------------------------------- basic data
  if (!/^[A-Z]{4}$/.test(data.icao)) add(`invalid ICAO code "${data.icao}"`);
  const ids = new Set<string>();
  for (const n of data.taxiNodes) {
    if (ids.has(n.id)) add(`duplicate taxi node "${n.id}"`);
    ids.add(n.id);
  }
  for (const e of data.taxiEdges) {
    if (!ids.has(e.from) || !ids.has(e.to)) add(`edge ${e.name} references an unknown node (${e.from} - ${e.to})`);
  }
  const standIds = new Set<string>();
  for (const s of data.stands) {
    if (standIds.has(s.id)) add(`duplicate stand "${s.id}"`);
    standIds.add(s.id);
    if (!ids.has(`STAND_${s.id}`)) add(`stand ${s.id} has no node STAND_${s.id}`);
    if (!ids.has(s.laneNode)) add(`stand ${s.id} references unknown lane node ${s.laneNode}`);
    if (!(s.maxWingspanM > 0)) add(`stand ${s.id} has no maximum wingspan`);
  }
  for (const st of data.stations) {
    if (!/^1[1-3]\d\.\d{2,3}$/.test(st.frequency)) add(`station ${st.callsign} has an invalid frequency ${st.frequency}`);
  }
  if (problems.length) return problems; // the rest needs a consistent graph

  let airport: Airport;
  try {
    airport = new Airport(data);
  } catch (err) {
    add(`cannot be built: ${(err as Error).message}`);
    return problems;
  }

  // ---------------------------------------------------------------- runway operations
  for (const ops of data.runwayOps) {
    if (!airport.runwayEnd(ops.runway)) add(`runway operations for unknown runway ${ops.runway}`);
    if (!ops.departureEntries.some((e) => e.fullLength)) add(`runway ${ops.runway} has no full-length departure entry`);
    for (const e of ops.departureEntries) {
      if (!airport.holdingPoint(e.holdingPoint)) add(`runway ${ops.runway}: unknown holding point ${e.holdingPoint}`);
    }
    for (const x of ops.exits) {
      for (const id of x.path) if (!airport.nodes.has(id)) add(`runway ${ops.runway} exit ${x.name}: unknown node ${id}`);
    }
    for (const f of ops.flows ?? []) {
      if (!airport.taxiwayNames.has(f.taxiway.toUpperCase())) add(`runway ${ops.runway}: flow on unknown taxiway ${f.taxiway}`);
    }
  }
  if (!data.stations.some((s) => s.type === 'GND') && !data.stations.some((s) => s.type === 'TWR')) add('has neither a Ground nor a Tower station');

  // ---------------------------------------------------------------- reachability
  // Every stand must reach a full-length entry of every runway (with an aircraft of the stand's size),
  // and every exit must lead to at least one stand.
  for (const s of airport.stands.values()) {
    const wingspanM = Math.min(s.maxWingspanM, 65);
    for (const ops of data.runwayOps) {
      const reachable = ops.departureEntries
        .filter((e) => e.fullLength)
        .some((e) => {
          const hp = airport.holdingPoint(e.holdingPoint);
          if (!hp) return false;
          const heading = s.pushback ? (s.heading + 180) % 360 : s.heading;
          return !isRouteError(findRoute(airport, { node: s.node, heading }, hp, [], { wingspanM }));
        });
      if (!reachable) add(`stand ${s.id} cannot reach a full-length entry of runway ${ops.runway} (wingspan ${wingspanM} m)`);
    }
  }
  for (const ops of data.runwayOps) {
    for (const x of ops.exits) {
      const end = airport.nodes.get(x.path[x.path.length - 1]);
      if (!end) continue;
      const ok = [...airport.stands.values()].some((s) => !isRouteError(findRoute(airport, { node: end }, s.node)));
      if (!ok) add(`exit ${x.name} of runway ${ops.runway} does not lead to any stand`);
    }
  }

  // ---------------------------------------------------------------- traffic
  for (const o of data.traffic?.operators ?? []) {
    const airline = AIRLINES.find((a) => a.icao === o.airline);
    if (!airline) {
      add(`traffic: unknown operator ${o.airline} (add it to data/airlines.ts)`);
      continue;
    }
    if (!(o.weight > 0)) add(`traffic: operator ${o.airline} has no weight`);
    for (const t of o.types ?? airline.types) if (!AIRCRAFT_TYPES.has(t)) add(`traffic: ${o.airline} uses unknown aircraft type ${t}`);
    for (const d of o.destinations ?? airline.destinations) if (!/^[A-Z]{4}$/.test(d)) add(`traffic: ${o.airline} has an invalid destination ${d}`);
    const largest = Math.max(...[...airport.stands.values()].map((s) => s.maxWingspanM));
    for (const t of o.types ?? airline.types) {
      const span = AIRCRAFT_TYPES.get(t)?.wingspanM ?? 0;
      if (span > largest) add(`traffic: ${o.airline} ${t} does not fit any stand`);
    }
  }

  // ---------------------------------------------------------------- briefing
  const text = JSON.stringify(data.briefing ?? []);
  for (const m of text.matchAll(/holding point ([A-Z]\d?)\b/g)) {
    if (!airport.holdingPoint(m[1])) add(`briefing mentions unknown holding point ${m[1]}`);
  }
  for (const m of text.matchAll(/stand (\d+[A-Z]?)\b/g)) {
    if (!airport.stand(m[1])) add(`briefing mentions unknown stand ${m[1]}`);
  }
  return problems;
}
