[Documentation](README.md) › Tutorials

# Tutorials

A tutorial is a guided first session for one position: a fixed, calm traffic situation, explained step by step. Start one in the **Connect** dialog with the buttons next to **Tutorial** (*Delivery*, *Ground*, *Tower*, *Approach*).

- [How a tutorial works](#how-a-tutorial-works)
- [Delivery](#delivery)
- [Ground](#ground)
- [Tower](#tower)
- [Approach (radar)](#approach-radar)
- [After the tutorial](#after-the-tutorial)
- [For developers](#for-developers)

---

## How a tutorial works

- The session is always the same: EDDS, **runway 25**, wind **250/08**, no random traffic, no special events, no random readback errors. The positions you don't staff are run by the simulator, as in a normal session.
- The **tutorial panel** (bottom left of the scope; in mobile mode above the quick-action bar) shows the current step: what to do and why, and the **example instruction**.
  - **Show me** selects the aircraft of the step, centres the scope on it and puts the example into the command line. Send it with **Enter** or **SEND** - or use the aircraft menu or the quick-action bar instead.
  - Some steps are done **on the scope** instead of the radio (radar: assume a track Center offers, start the hand-over of a track); the text says where to click, and the button selects the aircraft.
  - Some steps have a **right moment** (radar: the turn onto base at 16 NM, the intercept 3 NM before the centre line). The panel shows what to wait for in grey (*Wait: EWG7TK is 9 NM east of the threshold - turn at 16 NM.*), then **Now!** in green.
  - Steps with a task continue on their own as soon as it is done (for example when the pushback has started). **Next** continues after an explanation, or skips the task of the current step.
  - **Back** shows the previous step again (marked *review* in the title bar). A step you go back to is only shown: its traffic is not started again and it does not continue by itself - **Next** brings you forward again, up to the step you were working on.
  - **Skip tutorial** ends the tutorial at once and starts live traffic (see below).
  - Tap the panel's title bar to fold it away and see the whole airport.
  - When the tutorial is finished or skipped, the panel disappears.
- Waiting for an aircraft? **2x** / **4x** in the toolbar speed the simulation up.
- Score, debriefing (DISCONNECT) and all menus work as usual.

## Delivery

Position: Stuttgart Delivery 121.915 (Ground and Tower by the simulator). About 5 minutes.

| Step | You learn |
| ---- | --------- |
| Welcome | What Delivery does |
| A clearance request | Selecting an aircraft (DLH5AB, stand 14) |
| IFR clearance | `cleared to Athens, KUNOD2B departure, flight planned route, climb via SID to altitude 5000 feet, squawk 2101` - destination, SID by the first fix of the route (towards the destination), initial climb, free squawk |
| Check the readback | Listen to the squawk; `readback correct` |
| Start-up | `start-up approved` at the TSAT (A-CDM) |
| Hand-off to Ground | `contact ground 118.605` |
| Catch a readback error | EWG7TK reads back a wrong squawk (always, in this step) |
| Correct it | `negative, squawk 2102` |
| Start-up and Ground | The routine on your own |
| Datalink clearance | CFG53 requests its clearance by DCL: aircraft menu *Send DCL (datalink)* |
| Well done | CTOTs and what else to practise |

## Ground

Position: Stuttgart Ground 118.605 (Delivery and Tower by the simulator). About 7 minutes.

| Step | You learn |
| ---- | --------- |
| Welcome | What Ground does, the scope and the lists |
| A departure calls | Selecting an aircraft (DLH5AB, stand 14) |
| Pushback | `pushback approved, facing east` |
| Taxi to the holding point | `taxi to holding point A via M, H, N`, the live route preview, the standard flows |
| An arrival is landing | EWG7TK lands and calls you after vacating |
| Taxi in | `taxi to stand 32` - automatic route without "via" |
| Hand-off to Tower | `contact tower 118.805` at the holding point |
| Well done | Hold short, give way, conditional clearances, standby, follow-me, CATC |

## Tower

Position: Stuttgart Tower 118.805 (Delivery and Ground by the simulator). About 12 minutes (the departure needs a while to taxi out; use 2x / 4x).

| Step | You learn |
| ---- | --------- |
| Welcome | What Tower does |
| An arrival on final | Selecting an aircraft (EWG7TK); airborne tags |
| Landing clearance | `wind 250 degrees 8 knots, runway 25, cleared to land` |
| Vacated: to Ground | `contact ground 118.605` |
| Line up | `line up and wait runway 25` (DLH5AB, handed over by Ground) |
| Take-off | `wind 250 degrees 8 knots, runway 25, cleared for take-off`; departure spacing |
| Hand-off to Radar | `contact radar 125.050` (the frequency of the departure's SID sector) |
| Well done | Conditional line-up, immediate take-off, go around, vacate via, speed control, crossings, COORD |

## Approach (radar)

Position: Stuttgart Approach / Departure, **Langen Radar 125.050**, on the radar scope (Center, Tower, Ground and Delivery by the simulator). About 15 minutes (use 2x / 4x while the aircraft fly).

| Step | You learn |
| ---- | --------- |
| Welcome | What Approach / Departure does, the radar scope, the final with its mile ticks |
| Center offers a track | EWG7TK from Hamburg over LBU: the flashing `H/O` tag - click it (*Accept hand-off* / `ASSUME`) |
| Identify and descend | `identified, descend altitude 5000 feet, QNH 1013` - below the transition level with the QNH |
| Downwind | `turn left heading 070, reduce speed 220 knots` - a heading takes the aircraft off its STAR |
| Base | At 16 NM east of the threshold: `turn right heading 160, reduce speed 180 knots` |
| Intercept and clear for the ILS | 3 NM before the centre line: `turn right heading 220, cleared ILS approach runway 25` - 30 degrees to the final, intercept at 12 NM or more |
| Hand-over to Tower | Start the transfer of the track (*Hand-over to Tower* / `XFER`), Tower accepts |
| Contact Tower | Once established: `contact Stuttgart Tower 118.805` |
| A departure calls | DLH5AB after take-off: `identified, climb flight level 140` - the release level of its Center sector |
| Hand-over to Center | Above 8000 ft: transfer of the track to Center (`XFER`) |
| Contact Center | `contact Langen Radar 131.300` - the frequency of its sector |
| The quick way: a transition | CFG1753 from Antalya over TEKSI: assume it |
| Cleared via the transition | `identified, descend altitude 5000 feet, cleared ILS approach runway 25` - it flies the TEKSI 25 transition by itself |
| Well done | 6 NM on final, speed control, holdings, direct-to, STCA and MSAW |

## After the tutorial

The last step offers **Live traffic**: from then on new departures and arrivals are generated as in a normal session (light density), so you can practise right away; **Close** ends the tutorial without new traffic. Either way the panel disappears. End the session with **DISCONNECT** for the debriefing. Next: a [scenario](scenarios.md) such as *First steps*.

## For developers

The lessons live in [`src/core/tutorial.ts`](../src/core/tutorial.ts) (no DOM): each step has a text, an optional example (a function of the simulation, e.g. to fill in the squawk or the stand), an optional `enter` (spawns its traffic), an optional `wait` (the right moment for the example, radar), an optional `action` (`assume` / `transfer`: done on the scope) and a `done` check; the UI panel is `src/ui/tutorialPanel.ts`. `tests/tutorial.test.ts` plays every lesson by sending the examples like a student (and performs the scope actions once it is time) and fails if a step cannot be finished or a pilot refuses an example; for the Approach lesson it also checks that the arrival lands and that no hand-off or transfer cost points - so the lessons stay correct when the simulation changes. Squawks, stands, release levels and frequencies in the tables above are examples; the panel always shows the actual ones.
