/**
 * "Real" menu style (Settings -> Aircraft menus): the menu entries of Delivery, Ground and Tower in the short form of
 * EuroScope's lists and tag menus (PUSH, TAXI, LUAW 25, T/O 25, LAND 25, GND 118.605) instead of the phrase that is
 * said. Only the label changes - the action (and the phrase on the radio) stays the same. The radar menus build
 * their short labels themselves (radarMenus.ts).
 */
const RULES: [RegExp, string | ((m: RegExpExecArray) => string)][] = [
  [/^Push and start approved$/, 'PUSH+ST'],
  [/^Pushback approved$/, 'PUSH'],
  [/^Start-up approved$/, 'ST-UP'],
  [/^Cancel pushback$/, 'CNL PUSH'],
  [/^Stop pushback$/, 'STOP PUSH'],
  [/^Pilot decides$/, 'ANY'],
  [/^Facing (\w)\w*$/, (m) => `FAC ${m[1].toUpperCase()}`],
  [/^Taxi to stand$/, 'TAXI STD'],
  [/^Taxi to$/, 'TAXI'],
  [/^Taxi, hold short of$/, 'TAXI H/S'],
  [/^Whole route$/, 'FULL'],
  [/^Hold position$/, 'HOLD'],
  [/^Continue taxi$/, 'CONT'],
  [/^Continue$/, 'CONT'],
  [/^Continue approach$/, 'CONT APP'],
  [/^Continue, expect late landing clearance$/, 'CONT LATE'],
  [/^Hold short of$/, 'H/S'],
  [/^Hold short of (.+)$/, (m) => `H/S ${m[1]}`],
  [/^Give way to$/, 'GIVE WAY'],
  [/^Follow the follow-me$/, 'FLWME'],
  [/^Cross runway (.+)$/, (m) => `CROSS ${m[1]}`],
  [/^Backtrack runway (\S+), line up and wait$/, (m) => `B/T LUAW ${m[1]}`],
  [/^Backtrack runway (\S+), cleared for take-off$/, (m) => `B/T T/O ${m[1]}`],
  [/^Line up and wait runway (.+)$/, (m) => `LUAW ${m[1]}`],
  [/^Behind \.\.\. line up and wait$/, 'LUAW BEHIND'],
  [/^behind landing (.+)$/, (m) => `BHD ${m[1]}`],
  [/^Cleared for take-off runway (.+)$/, (m) => `T/O ${m[1]}`],
  [/^Cleared for immediate take-off$/, 'T/O IMM'],
  [/^Cancel take-off$/, 'CNL T/O'],
  [/^Stop immediately$/, 'STOP'],
  [/^Cleared to land runway (.+)$/, (m) => `LAND ${m[1]}`],
  [/^Go around$/, 'G/A'],
  [/^Vacate via$/, 'VAC'],
  [/^Speed$/, 'SPD'],
  [/^Maintain (\d+) knots until (\d+) miles$/, (m) => `${m[1]}/${m[2]}NM`],
  [/^Reduce to final approach speed$/, 'FAS'],
  [/^Contact Ground (.+)$/, (m) => `GND ${m[1]}`],
  [/^Contact Tower (.+)$/, (m) => `TWR ${m[1]}`],
  [/^Contact .* (\d{3}\.\d+)$/, (m) => `FREQ ${m[1]}`],
  [/^Request hand-off to (.+)$/, (m) => `REQ H/O ${m[1]}`],
  [/^Hand-off to (.+) requested$/, (m) => `H/O ${m[1]} REQ`],
  [/^On (.+) frequency$/, (m) => `ON ${m[1]}`],
  [/^Readback correct$/, 'RB OK'],
  [/^Negative, squawk (.+)$/, (m) => `NEG SQ ${m[1]}`],
  [/^Squawk$/, 'SQWK'],
  [/^New code$/, 'NEW'],
  [/^Send DCL \(datalink\)$/, 'DCL'],
  [/^Information (\w) is (now )?current$/, (m) => `INFO ${m[1]}`],
  [/^Able intersection\?$/, 'ABLE INT?'],
  [/^Intersection (.+)$/, (m) => `INT ${m[1]}`],
  [/^Taxiway (.+)$/, (m) => `TWY ${m[1]}`],
  [/^Stand (.+)$/, (m) => `STD ${m[1]}`],
  [/^De-icing (.+)$/, (m) => `DEICE ${m[1]}`],
  [/^Tow approved to stand ?(.*)$/, (m) => `TOW ${m[1]}`.trim()],
  [/^Number (\d+)$/, (m) => `NR ${m[1]}`],
  [/^Number \.\.\. for (.+)$/, (m) => `NR ${m[1].toUpperCase()}`],
  [/^Resolve conflict with (.+)$/, (m) => `RESOLVE ${m[1]}`],
  [/^Acknowledge CATC alert$/, 'ACK CATC'],
  [/^Say reason$/, 'SAY RSN'],
  [/^Say again$/, 'SAY AGN'],
  [/^Standby$/, 'STBY'],
  [/^Flight plan$/, 'FPL'],
  [/^Return to base$/, 'BASE'],
  [/^Proceed to (.+)$/, (m) => `PROC ${m[1]}`],
  [/^Other runways$/, 'OTHER RWY'],
  [/^Centre view$/, 'CENTER'],
  [/^Annotation$/, 'NOTE'],
  [/^Reset tag position$/, 'RST TAG'],
  [/^Accept hand-off$/, 'ASSUME'],
];

/** The short (EuroScope-like) form of a menu label; labels without a rule stay as they are. */
export function realLabel(label: string): string {
  for (const [re, to] of RULES) {
    const m = re.exec(label);
    if (m) return typeof to === 'string' ? to : to(m);
  }
  return label;
}
