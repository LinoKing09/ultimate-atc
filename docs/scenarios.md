# Scenarios and seeds

Every session is driven by a **seeded random number generator**. This page explains what the seed does, and how **scenario codes** let you choose what you want to train and repeat it as often as you like.

- [What the seed does](#what-the-seed-does)
- [Scenario codes](#scenario-codes)
- [The scenario builder](#the-scenario-builder)
- [Presets](#presets)
- [Scheduled events](#scheduled-events)
- [Start time and night flying restrictions](#start-time-and-night-flying-restrictions)
- [Closed taxiways](#closed-taxiways)
- [Thunderstorm](#thunderstorm)
- [De-icing](#de-icing)
- [Sharing a scenario](#sharing-a-scenario)

---

## What the seed does

All random decisions in the simulation come from one pseudo-random generator (mulberry32), started with the **seed**:

- the initial wind, QNH, ATIS letter and therefore the runway in use,
- which airlines, aircraft types, callsigns, stands, destinations and SIDs appear,
- when departures are ready and when arrivals show up,
- pilot reaction times, reminders, random special events.

**The same seed with the same settings gives the same session**, as long as your instructions are the same. When you give different instructions (or give them at different times), the traffic soon develops differently, because the pilots react to you.

Leaving the field empty in the Connect dialog starts a random session. A plain number (for example `4711`) is used as the seed with the density and special-events settings from the dialog. A seed alone cannot choose *what* happens. Scenario codes can.

## Scenario codes

A scenario code packs everything a training session needs into one string:

```
EDDS-25-HD1-M10R20W30-K7Q2M
EDDS-25-MB0-S20-T2215.N.CE.CS-K7Q2M      (with the optional options part)
```

| Part     | Example     | Meaning                                                                                       |
| -------- | ----------- | --------------------------------------------------------------------------------------------- |
| Airport  | `EDDS`      | Airport ICAO code                                                                              |
| Runway   | `25`        | Runway in use at the start. `AUTO` = from the random wind                                      |
| Traffic  | `HD1` or `4213` | **Letter form**: density (`L` light, `M` medium, `H` heavy), traffic mix (`B` balanced, `D` departure rush, `A` arrival rush), flags (`0` none, `1` heavies 35 %, `2` random special events "rare", `3` both). **Digit form** for the other slider steps: density 1-5, mix 1-5 (1 departure rush ... 3 balanced ... 5 arrival rush), heavies 0-4, random events 0-4 (see the tables below). The letter form is used whenever it fits, so older codes stay the same |
| Events   | `M10R20W30` | Scheduled events: a letter and the minute after the start. `M` medical emergency (arrival), `D` medical emergency (departure), `R` rejected take-off, `W` wind shift, `S` thunderstorm. `X` = none |
| Options  | `T2215.N.CE` | *Optional* (codes without options have five parts and are still valid). Tokens separated by `.`: `T2215` start at 22:15 local airport time, `N` night flying restrictions, `C` + taxiway (`CE`, `CL2`) taxiway closed - one token per closed taxiway, `I` de-icing (winter operations) |
| Seed     | `K7Q2M`     | The random seed, in base 36 (digits and letters)                                               |

Codes are not case-sensitive. Type or paste one into the **Scenario** field of the Connect dialog; the dialog shows what it means (or why it is invalid). With a code, the density and special-events sliders of the dialog show the code's values and are locked.

The four traffic **sliders** have five steps each (digit in the code in brackets):

| Step | Density (dep / arr per hour) | Traffic mix (dep x / arr x) | Heavies | Random events (chance x) |
| ---- | ---------------------------- | --------------------------- | ------- | ------------------------ |
| 1st  | Light 8 / 7 (`1`, `L`)       | Departure rush 1.6 / 0.5 (`1`, `D`) | Normal: the operators' fleets (`0`) | Never 0 (`0`) |
| 2nd  | Light to medium 11 / 10 (`2`) | More departures 1.3 / 0.75 (`2`) | 10 % wide-bodies (`1`) | Very rare 0.5 (`1`) |
| 3rd  | Medium 14 / 12 (`3`, `M`)    | Balanced 1 / 1 (`3`, `B`)   | 20 % (`2`) | Rare 1 - the standard rates (`2`) |
| 4th  | Medium to heavy 18 / 15 (`4`) | More arrivals 0.75 / 1.3 (`4`) | 35 % (`3`) | Occasional 2 (`3`) |
| 5th  | Heavy 22 / 18 (`5`, `H`)     | Arrival rush 0.5 / 1.6 (`5`, `A`) | 50 % (`4`) | Often 4 (`4`) |

**Heavies**: with a share above *normal*, that share of the new flights is a wide-body (A330, B767, B787), picked from operators that fly them. Wide-bodies cannot turn around on taxiways, need the full runway length and only fit a few stands - with a large share some wait for a stand or are not generated. **Random events** multiply the chances of the random special events (see [simulation model](simulation.md#special-events)); scheduled events happen at any step.

## The scenario builder

Click **Scenario builder...** next to the Scenario field in the Connect dialog:

1. Pick a **preset**, or set the runway and the sliders for density, traffic mix, heavies and random events yourself.
2. Under **Conditions**, set a **start time** (local airport time; empty = now), the **night flying restrictions**, **de-icing** and **closed taxiways**. A closure that would cut stands off from a runway is shown in red and cannot be used.
3. Add **scheduled events** with the minute when they should happen.
4. **New seed** keeps the scenario but gives different traffic.
5. The **scenario code** updates as you go. **Copy code** / **Copy link** copy it, **Use this scenario** puts it into the Connect dialog.

## Presets

| Preset          | Settings                                                    | Trains                                                         |
| --------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| First steps     | light, balanced, no events                                  | The basics without pressure                                    |
| Departure push  | heavy, departure push                                       | Sequencing pushbacks, queue numbers, conditional clearances    |
| Arrival rush    | heavy, arrival rush                                         | Quick taxi-in instructions, keeping exits and vacate points free |
| Heavy metal     | medium, more heavies                                        | Wide-bodies: no turning around, full length, stand sizes       |
| Emergencies     | medium; medical arrival at 6 min, rejected take-off at 15, medical departure at 25 | Priorities, returning aircraft to stands          |
| Runway change   | medium, runway 25, wind shift at 15 min                     | Changing the runway with traffic on the move                   |
| Night shift     | medium, start 22:15 local, night flying restrictions        | The last wave before the curfew: jets out by 2300, landings until 2330 (delayed ones until 2400) |
| Construction works | medium, runway 25, taxiways E and S closed               | Routing around closed taxiways                                 |
| Winter morning  | medium, departure rush, start 06:30 local, de-icing         | Every departure via a de-icing pad: pad allocation, two taxi clearances per departure |
| Thunderstorm    | medium, thunderstorm at 12 min                              | Gusts, a tailwind shift, windshear go-arounds, a departure stop |
| Full shift      | heavy, more heavies, random events; medical arrival at 12, wind shift at 35 | Everything at once                                   |

Each preset gets a new random seed; press **New seed** for another variant.

## Scheduled events

Scheduled events happen even when random special events are off:

| Event                       | What happens at the given minute                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| Medical emergency, arrival  | The **next arrival** that appears on final declares a medical emergency (PAN PAN), see [special events](simulation.md#special-events). |
| Medical emergency, departure | The departure on your frequency that is ready earliest and has not started to taxi gets a medical emergency **40 s after it starts taxiing**. If there is none, the simulator tries again every 30 s. |
| Rejected take-off           | The **next take-off** is rejected at 60-110 kt.                                                  |
| Thunderstorm                | A storm cell crosses the airport for 20 minutes - see [Thunderstorm](#thunderstorm). If one is still active, the next one waits. |
| Wind shift                  | The surface wind turns to the opposite direction (9-15 kt). A *Supervisor* message tells you the new wind and the tailwind; the toolbar wind turns red. The ATIS does not change by itself: open the ATIS editor (it is pre-filled with the new wind), broadcast a new ATIS with the other runway and re-route the traffic. |

## Start time and night flying restrictions

**Start time** (`T2215`): the session starts at this local airport time (Stuttgart: Europe/Berlin, summer or winter time of today's date). Without it, the session starts at the current time. The toolbar clock stays in UTC; with night rules the local time is shown next to it (`2215L`).

**Night flying restrictions** (`N`) apply the airport's rules. Stuttgart (source: Flughafen Stuttgart):

| Rule                               | Local time        |
| ---------------------------------- | ----------------- |
| No jet departures                  | 23:00 - 06:00     |
| No landings                        | 23:30 - 06:00     |
| Delayed landings (scheduled before 23:30) | until 24:00 |

How the simulator applies them (turboprops are not affected by the departure curfew; exemptions such as mail flights, emergencies or permits are not modelled):

- **Traffic**: no jet is generated that could not be airborne before 23:00 (ready time + 20 minutes taxi estimate). From 04:45 local on, departures are planned for the morning wave: ready at 05:50-06:00. Arrivals that would land between 23:30 and 24:00 appear only as *delayed flights* (about 35 % of the normal rate; Approach announces them with their scheduled time); after 24:00 none until 06:00.
- **Messages** at the session start, 15 minutes before the curfew, at 23:00, 23:30, 24:00 and 06:00.
- **Jets still on the ground at 23:00** cannot leave: a jet still on its stand is postponed to the morning (new TOBT about 05:50-06:00 local); one that is off-block or taxiing asks to taxi back to a stand (`we have missed the night curfew, request taxi back to stand 14`) - when Ground or Tower is run by the simulator, it sends it back itself. Crews refuse a take-off or line-up clearance in the curfew (`unable, night curfew, jet departures are not permitted until 0600 local`).
- **Score**: a jet that was ready at least 15 minutes before the curfew and still missed it costs 10 points (*Departures that missed the night curfew*).

## Closed taxiways

Closed taxiways (`CE`, `CS` ...) are closed for the whole session, e.g. for resurfacing:

- The scope draws them red and hatched, with the designator in red. The ATIS (`taxiways E and S closed`), the briefing (*Now* table) and a NOTAM message at the start say so.
- The router never uses them, and their runway entries (holding points) and exits are closed too. Automatic routes (AI Ground, *auto route*, conflict resolution) go around them; arrivals vacate elsewhere.
- A crew refuses an instruction over a closed taxiway: `unable, taxiway S closed` (also for a holding point or `vacate via` on it).
- Only taxiways can be closed (not apron taxilanes or the runway). The builder checks the closure: every stand must still reach a full-length entry of each runway and be reachable from an exit of each runway (Stuttgart: closing N, O, V or A is therefore not possible).

## Thunderstorm

A storm cell crosses the airport (event `S`), in three phases:

| Phase                  | Duration   | What happens |
| ---------------------- | ---------- | ------------ |
| Warning                | 5 minutes  | *MET* warns of the storm. The wind starts to gust (speed +4 kt, gusts 10-16 kt above it). Approach spaces the arrivals at least 8 NM apart and sends half as many. |
| Overhead               | 15 minutes | Gust front: the wind turns to blow along the runway in use from behind (±20°), 14-20 kt, gusts 12-18 kt above that - a strong tailwind. **Lightning stops the ground handling**: no pushbacks (crews don't call, `unable, ground handling has stopped, lightning alert`), no tows. **No take-offs**: crews refuse a take-off clearance (`unable, thunderstorm overhead with windshear, we will wait until it has passed`), the AI Tower lines nobody up; aircraft already lined up and cleared still go. **On final**, at 1 NM, crews go around with more than 10 kt tailwind, and in windshear about 4 in 10 times. |
| Passed                 | -          | The wind settles from the new direction at 6-11 kt; the other runway is usually better now. Departures and ground handling resume. |

What you do: broadcast a new ATIS (the editor is pre-filled with the gusts), change the runway to stop the tailwind go-arounds, keep the departures waiting at the holding points in order, and get the queue moving when the storm has passed. Weather go-arounds **do not cost points**; the toolbar shows the wind in red with `TS` while the storm is active.

## De-icing

Winter operations (option `I`): frost on the wings, every departure has to be de-iced on one of the **de-icing pads** before take-off. Stuttgart has four, **DP1-DP4**, between taxiways N and S - DP1 / DP2 between I and H, DP3 / DP4 between H and F. Every pad is a drive-through bay **entered from N and left onto S** along its lead line: DP1 and DP3 lead west, DP2 and DP4 east, so DP2 / DP4 are entered eastbound on N (e.g. from the circle via L2) and DP1 westbound (from H or M). After the pad: runway 25 departures from DP2 / DP4 continue on S towards A, runway 07 departures from DP1 / DP3 on S towards K. See [EDDS](airports/EDDS.md#holding-bays-and-de-icing-pads).

- The crew asks for it: `ready for taxi, request de-icing` (the ATIS says `de-icing in progress on the de-icing pads`, the briefing has a *De-icing* row).
- **Taxi it to a pad**: `taxi to de-icing pad DP2 via L2, N` (also `de-icing position 2`, `delta papa 2`; without a pad the crew takes the free pad nearest to it). The *Taxi to* menu lists the pads first, occupied ones greyed out. A pad is taken from the taxi clearance until the aircraft has left it; crews refuse an occupied pad (`de-icing pad DP2 is occupied, request another pad`).
- On the pad the status shows `DEICE` for **6-10 minutes** (3 more for aircraft over 40 m wingspan). A taxi instruction meanwhile: `negative, de-icing in progress, about 4 more minutes`.
- Then: `de-icing complete on DP2, ready for taxi` - taxi it to the runway as usual.
- **Before the de-icing** crews refuse the runway or a holding point: `negative, we require de-icing first`.
- Pad sizes: **DP1 up to 65 m** wingspan (code E), **DP2 up to 68.5 m** (code E, also the B747-8), **DP3 and DP4 up to 36 m** (code C) - wide-bodies use DP1 or DP2. An aircraft too large for every pad would be de-iced on its stand (none at Stuttgart).
- Not modelled: in reality S is closed next to the pads in use (I-H for DP1 / DP2, H-F for DP3 / DP4).
- The AI Ground does the same: it keeps a departure on its stand while all pads are busy, taxis it to a free pad, and on to the runway afterwards.
- Not modelled: holdover times (a de-iced aircraft stays de-iced), de-icing fluid types, snow on the taxiways, braking action.

## Sharing a scenario

**Copy link** gives a link such as `https://linoking09.github.io/ultimate-atc/?scenario=EDDS-25-MB0-W15-K7Q2M`. Opening it pre-fills the Connect dialog with the code, so others can train exactly the same session - for example to compare scores.
