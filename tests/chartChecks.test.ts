import { describe, expect, it } from 'vitest';
import { Airport, type TaxiNode } from '../src/core/airport/airport';
import { AIRPORTS } from '../src/data/airports';

/**
 * Chart check "nothing ends in the grass" (step 5 of the airport recipe, docs/airport-data.md; 2.0 criterion 7):
 * every dead end of the taxi graph must be explained. Explained automatically: stands and their lane nodes,
 * holding points, de-icing pads, closed taxiways, the lead-in lines of OpenStreetMap parking positions that are no
 * simulated stand, and a stub of at most 60 m past a node with stand lead-ins (the room a pushback needs at the end of
 * a lane, or the lead-in line of a parking position next to the stands). Every other dead end is listed below with what the chart shows there (checked against the
 * aerodrome charts, used as a reference only, and OpenStreetMap). A new dead end fails the test until it is found on
 * the chart and listed - or connected; a listed one that is no longer a dead end fails too.
 */
const EXPLAINED: Record<string, Record<string, string>> = {
  EDDN: {
    'S3.5': 'GA lane S3 ends at Apron G2 / G2A by Hangar 2',
    'S4.10': 'GA lane S4 ends at the FAI apron',
    'T2.1': 'T2 ends at the aprons U1 / U2',
  },
  EDJA: {
    '?.12': 'GA apron lane ends on the apron',
    '?.16': 'GA apron lane ends on the apron',
    'P4.5': 'P4 ends at the hangar',
    'PAD.1': 'the pad south of P near E (aerodrome chart, digitised by hand)',
  },
  EDXW: {
    '?.14': 'the track to the glider site east of the 32 end',
    '?.30': 'the lane on Apron 4',
  },
  EDDW: {
    'M.4': 'M ends at runway 23 (light aircraft, take-off only; drawn, not used)',
    'L.2': 'L ends at Apron 3 by the maintenance hangar',
  },
  EDDP: {
    'K.2': 'K leads to the noise abatement facility (engine run-ups)',
    'G2.6': 'G2 leads to the small pad by DP2 (apron of Deutsche Aircraft, stands 1 / 2 not simulated)',
  },
};

/** The OpenStreetMap layouts (parking positions of the import). */
const LAYOUTS = import.meta.glob('../src/data/airports/*.layout.ts', { eager: true }) as Record<string, Record<string, unknown>>;
interface OsmStands {
  stands: { pos: [number, number]; lanes: string[] }[];
}
function osmLayout(icao: string): OsmStands | undefined {
  const mod = Object.entries(LAYOUTS).find(([path]) => path.toLowerCase().endsWith(`/${icao.toLowerCase()}.layout.ts`))?.[1];
  return mod && (Object.values(mod).find((v) => !!v && Array.isArray((v as OsmStands).stands)) as OsmStands | undefined);
}

/** Longest stub (m) past a node with stand lead-ins that counts as apron room. */
const STAND_STUB_M = 60;

/** A parking position of OpenStreetMap closer than this (m) to a dead end: its lead-in line ends there. */
const PARKING_POSITION_M = 60;

function unexplainedDeadEnds(ap: Airport, icao: string): TaxiNode[] {
  const standNodes = new Set([...ap.stands.values()].flatMap((s) => [s.node.id, s.lane.id]));
  const pads = new Set(ap.deicingPads.map((p) => p.node.id));
  const osm = osmLayout(icao);
  const osmLanes = new Set((osm?.stands ?? []).flatMap((s) => s.lanes));
  const osmStands = (osm?.stands ?? []).map((s) => ap.proj.toLocal({ lat: s.pos[0], lon: s.pos[1] }));
  const out: TaxiNode[] = [];
  for (const n of ap.nodes.values()) {
    const taxi = n.edges.filter((e) => e.kind !== 'runway');
    if (taxi.length !== 1 || n.edges.some((e) => e.kind === 'runway') || n.holdingPoint || standNodes.has(n.id) || pads.has(n.id)) continue;
    const e = taxi[0];
    if (e.kind === 'stand' || e.closed) continue;
    // A short stretch past a node the stands are pushed back from: the room the pushback needs at the end of a lane,
    // or the lead-in line of a parking position next to the stands (checked against OpenStreetMap for München).
    const before = e.from === n ? e.to : e.from;
    if (e.length <= STAND_STUB_M && before.edges.some((x) => x.kind === 'stand')) continue;
    if (osmLanes.has(n.id) || osmStands.some((p) => Math.hypot(p.x - n.pos.x, p.y - n.pos.y) < PARKING_POSITION_M)) continue;
    out.push(n);
  }
  return out;
}

describe('chart checks: no invented designators', () => {
  for (const data of AIRPORTS) {
    it(`${data.icao}: no taxiway is named after a stand number (OpenStreetMap tags lead-in lines that way)`, () => {
      const ap = new Airport(data);
      const names = [...new Set(ap.edges.filter((e) => e.kind === 'taxiway' || e.kind === 'taxilane').map((e) => e.name))];
      expect(names.filter((n) => /^\d+[A-Z]?$/.test(n) && ap.stand(n))).toEqual([]);
    });
  }
});

describe('chart checks: nothing ends in the grass', () => {
  for (const data of AIRPORTS) {
    it(`${data.icao}: every dead end of the taxi graph is on the chart`, () => {
      const ap = new Airport(data);
      const dead = unexplainedDeadEnds(ap, data.icao).map((n) => n.id);
      const listed = EXPLAINED[data.icao] ?? {};
      expect(dead.filter((id) => !listed[id]), 'dead ends not explained (find them on the chart, then connect or list them)').toEqual([]);
      expect(Object.keys(listed).filter((id) => !dead.includes(id)), 'listed, but no longer a dead end').toEqual([]);
    });
  }
});
