# Roadmap

The long-term goal is a simulator that feels as close as possible to controlling on VATSIM with EuroScope: several positions, many airports, realistic pilots, and eventually shared sessions with other controllers.

Status legend: **done**, *in progress*, planned.

## Road to 1.0

Version 1.0 is the first full version. It is released only when we agree on it; the proposal below gives the criteria. When the criteria are met, Claude proposes the release - it is never done automatically.

**Proposed criteria for 1.0**

1. **Stuttgart complete**: Delivery, Ground and Tower playable at EDDS (single positions and combined), with realistic procedures, phraseology and AI for the positions you don't staff.
2. **A second airport** with a different layout (proves the airport data format and the briefing).
3. **No dead ends**: AI pilots solve simple conflicts themselves the way real pilots would (stop, give way, ask); remaining deadlocks always have a clear way out; no collisions caused by the AI in the soak test.
4. **Training**: a tutorial for each position, scenario presets for typical training topics, a debriefing after a session (what went well, what cost points).
5. **Quality**: soak test (20 h of traffic) clean, performance budget met on an iPad, documentation complete, benchmark statistics for the release in [benchmarks.md](benchmarks.md).

**Proposed path**

| Version | Focus |
| ------- | ----- |
| 0.5 | Foundations for more positions and airports: position-independent station model and hand-offs, per-airport traffic (airlines, destinations), airport data checks, soak test in CI |
| 0.6 | **Delivery** at EDDS: IFR clearances, squawks, start-up, CTOT |
| 0.7 | **Tower** at EDDS: line-up / take-off / landing clearances, runway crossings, arrival sequence |
| 0.8 | Combined positions, AI pilots that resolve simple conflicts, debriefing |
| 0.9 | Second airport, tutorials, polish, beta testing |
| 1.0 | Release after the criteria above are met and agreed |

Major releases (1.0, 2.0, ...) come with a statistics section in [benchmarks.md](benchmarks.md) that compares them with the previous major release.

## v0.4 - Settings and mobile (current)

- **done** - In-game settings menu (layout, sizes, voices, traffic, events)
- **done** - Tablet mode (iPad): zoom buttons, tap-twice / long-press menus, quick-action bar, larger touch targets
- **done** - Intersection departures with "advise able" and per-type runway requirements
- **done** - No 180 degree turns for airliners, tug turnaround when stuck, tow-back after a cancelled pushback
- **done** - Crossing priority on the ground, AI Tower handling of stranded departures, vacate points clear of taxiway S
- **done** - Airport briefing (help window) and a clear button for the command line
- **done** - Scenario builder and shareable scenario codes (runway, traffic mix, heavies, scheduled events)
- planned - More tablet improvements: landscape layout, swipe-up command sheet, haptic feedback on requests

## v0.2 / v0.3 - Feedback rounds 1 and 2

- **done** - ATIS editor (runway in use, wind, QNH, letter) instead of choosing the runway at login; runway changes during the session
- **done** - Much better voice control: recognition alternatives, fuzzy callsigns, misrecognition fixes, last-caller fallback, TTS pauses while transmitting
- **done** - Extended phraseology: cancel/stop/continue pushback, conditional clearances, queue numbers, expected delays, incomplete taxi instructions (clearance limit)
- **done** - Special events: medical emergencies, rejected take-offs
- **done** - EuroScope-like clickable tag items, telephony display
- **done** - Realistic routing (no U-turns / hairpins), arrival turn-around bug fixed
- **done** - Researched tower separation model (departure/arrival/runway separation, departure gaps), see [tower-operations.md](tower-operations.md)
- **done** - Accurate EDDS layout digitised from the AIP aerodrome charts (v0.3), scope rotation, standard taxi flows

## v0.1 - Ground at EDDS

- **done** - Browser app, EuroScope-style ground radar, departure and arrival lists, message window, command line
- **done** - EDDS layout (approximate), real runway and frequencies
- **done** - ICAO phraseology parser (typed and spoken), live route preview
- **done** - AI pilots: requests, read-backs, reminders, see-and-avoid, deadlock reports
- **done** - AI Tower: departures, arrivals, exits, go-arounds, incursion detection
- **done** - Text-to-speech and speech recognition
- **done** - Score and incident statistics
- **done** - CI and GitHub Pages deployment

## Next steps

### Gameplay and realism

- planned - EDDS details: de-icing pads DP1-DP4, holding bays P1/P2, GA apron, A-stands (9A, 24A ...)
- planned - Real `follow` behaviour (follow-the-leader)
- planned - Stand allocation per airline and terminal (Schengen / non-Schengen), contact/remote stands
- planned - More special events (bird strike, blocked taxiway, follow-me, towing), de-icing, engine-start delays, pilots who make mistakes (wrong turn, missed hold short, read-back errors you must catch)
- planned - Low visibility procedures (CAT II/III holding points, larger spacing)
- planned - Wind that changes during the session (METAR updates)
- planned - Scenario files (fixed traffic for training) and a tutorial mode

### Positions

- planned - **Delivery**: IFR clearances (SID, initial climb, squawk, CTOT), start-up approvals, datalink (DCL) style list
- planned - **Tower**: line-up, take-off and landing clearances, runway crossings, departure spacing, arrival sequence display
- planned - **Approach / Departure**: radar scope, vectoring, altitude and speed instructions, ILS clearances, handoffs
- planned - **Radar / Center**: en-route sector, coordination, handoffs between sectors
- planned - Combined positions (e.g. Tower + Ground when the user is alone)

### Airports

- planned - EDDF Frankfurt
- planned - EGLL London Heathrow
- planned - KLAX Los Angeles
- planned - KSAN San Diego
- planned - Per-airport traffic mix (operators, destinations, fleet), regional phraseology differences (FAA vs ICAO)

### Client

- planned - EuroScope-like configurable tag items and colour profiles
- planned - Scope rotation (runway horizontal), saved views
- planned - Flight strip / flight plan window, ATIS editor
- planned - Sound effects (radio clicks, frequency congestion)
- planned - Mobile and tablet layout improvements

### Multiplayer

- planned - Run the simulation on a server; multiple human controllers on different positions of the same airport
- planned - Hand-offs and coordination between human controllers, text and voice channels
