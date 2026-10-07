# Roadmap

The long-term goal is a simulator that feels as close as possible to controlling on VATSIM with EuroScope: several positions, many airports, realistic pilots, and eventually shared sessions with other controllers.

Status legend: **done**, *in progress*, planned.

## v0.1 - Ground at EDDS (current)

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

- planned - Real EDDS layout from OpenStreetMap data (ODbL, with attribution) via an importer script, replacing the hand-made approximation
- planned - Conditional clearances ("behind the Lufthansa A320 passing left to right, taxi ...") and real `follow` behaviour
- planned - Stand allocation per airline and terminal (Schengen / non-Schengen), contact/remote stands
- planned - De-icing, engine-start delays, pilots who make mistakes (wrong turn, missed hold short, read-back errors you must catch)
- planned - Low visibility procedures (CAT II/III holding points, larger spacing)
- planned - Runway change during a session; wind changes with ATIS updates
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
