import { destinationName } from '../../data/destinations';
import type { Simulation } from '../simulation';
import { spell, telephonyCallsign, toSpoken } from './speech';

/**
 * The radio phrases a controller says, in their spoken form ("taxi to holding point alpha one", "lufthansa five
 * alpha bravo", "contact tower one one eight decimal eight zero five") - the grammar of the own speech recogniser
 * (voskPhraseGrammar). Vosk learns from them which word may follow which; between the phrases anything goes. Only
 * the words that really stand alone (digits, the phonetic alphabet, short replies) are phrases of their own - a
 * word that is a phrase alone may come anywhere.
 */

/** Phrases of the phraseology the parser understands (docs/phraseology.md), in the order they are said. */
const INSTRUCTIONS = `
push and start approved | pushback approved | push back approved | pushback approved facing | push and start approved facing
facing east | facing west | facing north | facing south | tail east | tail west | tail north | tail south
start up approved | startup approved | cancel pushback | stop pushback | continue pushback
taxi to holding point | taxi to runway | taxi to stand | taxi to de icing pad | taxi to de icing | taxi via | taxi
hold short of taxiway | hold short of runway | hold short of | hold short
hold position | continue taxi | continue | expedite taxi | expedite | turn around | backtrack
cross runway | cleared to cross runway | give way to | from the left | from the right | follow | follow the follow me
tow approved | tow approved to stand | proceed to | proceed to base | return to base | report position | say position
line up and wait | line up and wait runway | line up and wait behind | behind the landing | behind landing | behind the departing | behind
cleared for take off | cleared for immediate take off | cleared for takeoff | take off | no delay
cleared to land | continue approach | expect late landing clearance | go around | i say again | say again
hold position cancel take off | cancel take off | stop immediately | say reason | report reason for the rejected take off
maintain | knots until | reduce to final approach speed | resume normal speed | knots | miles
vacate via | backtrack vacate via
wind | degrees | wind calm | wind variable | degrees | gusting
contact ground | contact tower | contact radar | contact delivery | contact approach | contact departure | contact center
monitor tower | monitor ground | frequency change approved | goodbye | good day
cleared to | departure | flight planned route | climb via sid to altitude | climb via sid | to altitude | climb | feet | thousand | hundred
flight level | initial climb | squawk | ctot | slot time | readback correct | read back correct | negative | correction
information | is current | qnh | altimeter | hectopascal | hectopascals
standby | stand by | roger | wilco | disregard | affirm | affirmative | negative | break break | all stations
number | for pushback | for start up | for taxi | for departure
expect pushback in | expect start up in | expect taxi in | expect departure in | minutes
advise able for departure from intersection | are you able intersection | able intersection | intersection departure | intersection
via | and | then | when ready | after | approved | request
runway | taxiway | stand | holding point | gate | pad
`;

/** Words that stand alone and may come anywhere (digits, letters, numbers, sides). */
const UNITS = `
zero one two three four five six seven eight nine niner ten eleven twelve thirteen fourteen fifteen sixteen seventeen
eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand decimal point
alpha bravo charlie delta echo foxtrot golf hotel india juliett kilo lima mike november oscar papa quebec romeo sierra
tango uniform victor whiskey xray yankee zulu left right centre center
`;

/** What the phrases of a session are made of (the names said on its radio). */
export interface PhraseContext {
  /** Callsigns of the traffic (ICAO, e.g. "DLH5AB", "DCMGB"). */
  callsigns: string[];
  /** Station names ("Stuttgart Ground") and their frequencies ("121.900"). */
  stations: { name: string; frequencies: string[] }[];
  holdingPoints: string[];
  taxiways: string[];
  stands: string[];
  /** Runway ends ("25", "26R"). */
  runways: string[];
  /** SIDs ("KUNOD2B"). */
  sids: string[];
  /** Destination names ("Frankfurt"). */
  destinations: string[];
}

/** Spoken form, lower case: "A1" -> "alpha one", "26R" -> "two six right". */
function say(text: string): string {
  return toSpoken(text).toLowerCase().replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
}

const NUMBER_NAMES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS_NAMES = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** A number below 100 as it is said ("fourteen", "twenty five"). */
function numberWords(n: number): string {
  if (n < 20) return NUMBER_NAMES[n];
  return `${TENS_NAMES[Math.floor(n / 10)]}${n % 10 ? ` ${NUMBER_NAMES[n % 10]}` : ''}`;
}

/** The radio phrases of a session. */
export function radioPhrases(ctx: PhraseContext): string[] {
  const out = new Set<string>();
  const add = (p: string) => {
    const s = p.toLowerCase().replace(/[^a-z' ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return;
    out.add(s);
    // 9 is "niner" on the radio (ICAO) - and "nine" for many: both.
    if (/\bniner\b/.test(s)) out.add(s.replace(/\bniner\b/g, 'nine'));
  };
  for (const p of INSTRUCTIONS.split(/[|\n]/)) add(p);
  for (const u of UNITS.split(/\s+/)) add(u);
  // Callsigns as said: "lufthansa five alpha bravo", "delta charlie mike golf bravo".
  for (const cs of ctx.callsigns) add(say(telephonyCallsign(cs)));
  for (const st of ctx.stations) {
    add(st.name);
    for (const f of st.frequencies) {
      add(say(f));
      add(`contact ${st.name} ${say(f)}`);
    }
  }
  for (const hp of ctx.holdingPoints) add(`holding point ${say(hp)}`);
  for (const tw of ctx.taxiways) add(say(tw));
  for (const stand of ctx.stands) {
    add(`stand ${say(stand)}`);
    // Stand numbers below 100 also as numbers ("stand fourteen", "stand twenty five").
    const n = /^(\d{1,2})([A-Z]?)$/.exec(stand.toUpperCase());
    if (n) add(`stand ${numberWords(Number(n[1]))}${n[2] ? ` ${say(n[2])}` : ''}`);
  }
  for (const rwy of ctx.runways) {
    add(`runway ${say(rwy)}`);
    add(say(rwy));
  }
  for (const sid of ctx.sids) {
    const m = /^([A-Z]+)(\d)([A-Z])$/.exec(sid.toUpperCase());
    if (m) add(`${m[1]} ${spell(m[2])} ${spell(m[3])} departure`);
  }
  for (const d of ctx.destinations) add(`cleared to ${d}`);
  return [...out];
}

/** The phrase context of a running session. */
export function sessionPhraseContext(sim: Simulation): PhraseContext {
  const destinations = new Set<string>();
  for (const a of sim.aircraft) if (a.flightPlan?.destination) destinations.add(destinationName(a.flightPlan.destination));
  return {
    callsigns: sim.radioCallsigns,
    stations: sim.config.airport.stations.map((st) => ({ name: st.name, frequencies: [st.frequency, ...Object.values(st.runwayFrequencies ?? {})] })),
    holdingPoints: [...sim.airport.holdingPoints.values()].map((n) => n.holdingPoint!.name),
    taxiways: [...sim.airport.taxiwayNames],
    stands: [...sim.airport.stands.keys()],
    runways: [...sim.airport.runwayEnds.keys()],
    sids: sim.sidNames,
    destinations: [...destinations],
  };
}
