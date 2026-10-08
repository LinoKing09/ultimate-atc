# Scenarios and seeds

Every session is driven by a **seeded random number generator**. This page explains what the seed does, and how **scenario codes** let you choose what you want to train and repeat it as often as you like.

- [What the seed does](#what-the-seed-does)
- [Scenario codes](#scenario-codes)
- [The scenario builder](#the-scenario-builder)
- [Presets](#presets)
- [Scheduled events](#scheduled-events)
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
```

| Part     | Example     | Meaning                                                                                       |
| -------- | ----------- | --------------------------------------------------------------------------------------------- |
| Airport  | `EDDS`      | Airport ICAO code                                                                              |
| Runway   | `25`        | Runway in use at the start. `AUTO` = from the random wind                                      |
| Traffic  | `HD1`       | Density (`L` light, `M` medium, `H` heavy), traffic mix (`B` balanced, `D` departure push, `A` arrival rush), flags (`0` none, `1` more heavies, `2` random special events, `3` both) |
| Events   | `M10R20W30` | Scheduled events: a letter and the minute after the start. `M` medical emergency (arrival), `D` medical emergency (departure), `R` rejected take-off, `W` wind shift. `X` = none |
| Seed     | `K7Q2M`     | The random seed, in base 36 (digits and letters)                                               |

Codes are not case-sensitive. Type or paste one into the **Scenario** field of the Connect dialog; the dialog shows what it means (or why it is invalid). With a code, the density and special-events controls of the dialog are ignored.

**Traffic mix** (movements per hour, see [simulation model](simulation.md#traffic-generation)):

| Mix            | Departures      | Arrivals        |
| -------------- | --------------- | --------------- |
| Balanced       | as the density  | as the density  |
| Departure push | x 1.6           | x 0.5           |
| Arrival rush   | x 0.5           | x 1.6           |

**More heavies**: about one in three flights is a wide-body (A330, B767, B787), picked from operators that fly them. Wide-bodies cannot turn around on taxiways, need the full runway length and only fit some stands.

## The scenario builder

Click **Scenario builder...** next to the Scenario field in the Connect dialog:

1. Pick a **preset**, or set the runway, density, traffic mix, heavies and random events yourself.
2. Add **scheduled events** with the minute when they should happen.
3. **New seed** keeps the scenario but gives different traffic.
4. The **scenario code** updates as you go. **Copy code** / **Copy link** copy it, **Use this scenario** puts it into the Connect dialog.

## Presets

| Preset          | Settings                                                    | Trains                                                         |
| --------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| First steps     | light, balanced, no events                                  | The basics without pressure                                    |
| Departure push  | heavy, departure push                                       | Sequencing pushbacks, queue numbers, conditional clearances    |
| Arrival rush    | heavy, arrival rush                                         | Quick taxi-in instructions, keeping exits and vacate points free |
| Heavy metal     | medium, more heavies                                        | Wide-bodies: no turning around, full length, stand sizes       |
| Emergencies     | medium; medical arrival at 6 min, rejected take-off at 15, medical departure at 25 | Priorities, returning aircraft to stands          |
| Runway change   | medium, runway 25, wind shift at 15 min                     | Changing the runway with traffic on the move                   |
| Full shift      | heavy, more heavies, random events; medical arrival at 12, wind shift at 35 | Everything at once                                   |

Each preset gets a new random seed; press **New seed** for another variant.

## Scheduled events

Scheduled events happen even when random special events are off:

| Event                       | What happens at the given minute                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| Medical emergency, arrival  | The **next arrival** that appears on final declares a medical emergency (PAN PAN), see [special events](simulation.md#special-events). |
| Medical emergency, departure | The departure on your frequency that is ready earliest and has not started to taxi gets a medical emergency **40 s after it starts taxiing**. If there is none, the simulator tries again every 30 s. |
| Rejected take-off           | The **next take-off** is rejected at 60-110 kt.                                                  |
| Wind shift                  | The surface wind turns to the opposite direction (9-15 kt). A *Supervisor* message tells you the new wind and the tailwind; the toolbar wind turns red. The ATIS does not change by itself: open the ATIS editor (it is pre-filled with the new wind), broadcast a new ATIS with the other runway and re-route the traffic. |

## Sharing a scenario

**Copy link** gives a link such as `https://linoking09.github.io/ultimate-atc/?scenario=EDDS-25-MB0-W15-K7Q2M`. Opening it pre-fills the Connect dialog with the code, so others can train exactly the same session - for example to compare scores.
