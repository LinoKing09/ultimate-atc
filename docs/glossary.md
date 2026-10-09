# Glossary

Terms used in the simulator and in this documentation. Real-world terms are explained the way the simulator uses them; where the simulator simplifies, the linked page says how.

| Term | Meaning |
| ---- | ------- |
| **A-CDM** | Airport Collaborative Decision Making: airlines, handlers, airport and ATC share their times (TOBT, TSAT, CTOT). See [systems](systems.md). |
| **A-SMGCS** | Advanced Surface Movement Guidance and Control System: surface surveillance plus safety nets (RMCA, CATC) and routing. See [systems](systems.md). |
| **ATIS** | Automatic Terminal Information Service: recorded broadcast with runway, wind, QNH and approach procedure, identified by a letter (information R). |
| **CATC** | Conflicting ATC clearances: the A-SMGCS alert for clearances that conflict; in the simulator, taxi routes that meet head-on. |
| **Clearance limit** | The point an aircraft is cleared to and must not pass: the destination of a taxi instruction or a hold-short point; in an IFR clearance, the destination airport. |
| **Combined position** | One controller staffing several positions at once (for example Delivery + Ground). |
| **CTOT** | Calculated take-off time: an ATFM slot from the Network Manager; take-off from CTOT -5 to +10 minutes. |
| **DCL** | Departure clearance by datalink instead of voice. |
| **Deadlock** | Two (or more) aircraft that block each other so that none of them can move on by itself - typically two aircraft nose to nose on a taxiway (**head-on**) or each waiting for the other at an intersection. The pilots report it after 60 s (`we have opposite traffic ahead, request instructions`); only the controller can resolve it (re-route one, *Resolve conflict*, a tug). See [simulation model](simulation.md#pilot-see-and-avoid). |
| **Gridlock** | A deadlock that has spread: several aircraft stuck in a chain behind a deadlock or blocking each other's way out, so that a whole area (a taxiway, an apron exit) stops. Used informally in the changelog for traffic jams of early versions; the simulator itself detects and reports deadlocks. |
| **Follow-me** | A car (yellow, "FOLLOW ME" sign) that leads an aircraft to its stand or along a route, for crews unfamiliar with the airport or in low visibility. "Follow the follow-me". |
| **Head-on** | Two aircraft on the same taxiway in opposite directions (routes meeting at more than 135 degrees). Airliners cannot turn around on a taxiway, so it ends in a deadlock unless one turns off in time. |
| **Holding point** | Runway holding position where departures wait before entering the runway (EDDS: A, B, C, D for runway 25; K, Y, I, H, W for runway 07). |
| **ILS / LOC / GP** | Instrument landing system with localizer (lateral guidance) and glide path (vertical guidance). Without them: localizer-only or RNP approaches. |
| **Incursion** | An aircraft entering the runway without a clearance, or while it is occupied - a serious incident (-50 points). |
| **Proceed** | The instruction word for vehicles ("Follow-me 1, proceed to DCEEO via N, F"); aircraft get "taxi". |
| **Radio discipline** | Only one station talks at a time; after an instruction the addressed station reads back before anyone else calls. |
| **RMCA** | Runway monitoring and conflict alerting: A-SMGCS alert for aircraft approaching an occupied runway. |
| **RNP approach** | Approach with satellite navigation (no ILS needed). |
| **SID** | Standard instrument departure: the published departure route from the runway to the first fix of the flight plan (placeholder names in the simulator). |
| **Squawk** | The four-digit transponder code (octal digits 0-7) assigned in the IFR clearance. |
| **Stand** | Aircraft parking position. |
| **Tow** | Moving an aircraft without its own engines by a tug, e.g. from a contact stand to a remote stand. The tug driver talks to Ground: "request tow ... from stand 14 to stand 45" - "tow approved via ...". |
| **TOBT** | Target off-block time: when the airline expects the aircraft to be ready (the simulator's ready time). |
| **TSAT** | Target start-up approval time from the A-CDM pre-departure sequencer; start-up is approved at the TSAT. |
| **Tug** | Towing vehicle: pushes aircraft off the stand, and turns an airliner around when it is stuck (5-10 minutes in the simulator). |
