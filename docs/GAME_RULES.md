# Operation Blackout — game rules

This is the rulebook. It describes exactly what the system does, not what was
once discussed for it — anything still only on paper is marked **(not yet
built)** so a DM never promises a mechanic that won't actually happen on
screen.

## The shape of the hour

| Minute | Phase | What should be happening |
|---|---|---|
| 0 | Briefing | DM reads the briefing aloud, hands out roles |
| 10 | Recon | Team scans out from the foothold |
| 25 | Research | Intelligence matches scan results to exploit sheets |
| 35 | Strike | Team plays cards to disable or neutralise targets |
| 40 | — | DM-forced twist (see "The twist" below) |
| 50 | Debrief | DM adjudicates the outcome and runs the real-world debrief |

The phase names and minute boundaries are real: the server has a clock
running from the moment "Start operation" is pressed, and the header always
shows the current phase. The DM can pull or push the clock from the DM
console (`/dm`) with **+5 minutes**, or jump straight to minute 40.

## Roles

| Role | Does | Can't do |
|---|---|---|
| Recce | Types the `scan` commands | Doesn't interpret what comes back |
| Intelligence | Reads scan results, matches exploit sheets to services | Never touches the terminal |
| Operator | Types `run` and `roll`, the only one who presses the keys | Doesn't decide what to attack |
| Commander | Approves anything that needs confirmation, calls go/no-go | Doesn't type |

For 5–6 cadets, split Recce into a pair, or add a Signaller who relays
between Intelligence and Operator without touching the keyboard themself.

## The foothold and pivoting

The team starts with access to exactly **one** host — the foothold, marked
on the map. Nothing else exists on the map until it's found. This is not
flavour text, it's how the server actually works: the API only ever returns
hosts the team has pivoted to.

Every host offers three recon actions:

| Action | Reveals | Noise | Trace |
|---|---|---|---|
| `scan <host> 1` (identify) | Its name and type | 0 | 0 |
| `scan <host> 2` (map links) | Its description, running service, and **every host directly reachable from it** | 1 | 1 |
| `scan <host> 3` (deep scan) | Hidden sites attached to it (feeder lines, backup generators) | 3 | 2 |

A level-2 scan is the one that matters: it's the only action that adds new
hosts to the map. A team that only ever runs level-1 identifies will never
see past their foothold.

Once a host is identified at level 2, its available cards become visible
with `cards <host>`.

## The die

Every scan and every card costs a roll. The roll comes from the server, not
a physical die, so it can't be faked:

| Roll | Tier | Effect |
|---|---|---|
| 1 | Fumble | Fails outright. Extra noise. On a card, the attempt is "exposed". |
| 2 | Weak | Fails. Slightly less noise than a clean miss. |
| 3 | Partial | Works at half strength (half the duration, half the collateral) |
| 4 | Success | Works as written |
| 5 | Clean | Works, and generates one point less noise than listed |
| 6 | Critical | Works, and on a scan can turn up a one-time zero-day bonus |

A card's listed noise cost is modified by the tier: fumble and weak add
extra noise on top, clean and critical shave one off. Noise can never go
below zero.

## The two meters

**Noise** (0–10) is how loud the team has been. It decays by 1 every 6
minutes of game time. At 10, the system reports the team as locked down.
**(Not yet built: the system does not stop the team taking actions at
lockdown — the DM has to decide and enforce what that means at the table.)**

**Trace** (0–10) is how attributable the team has been. It does not decay.
At 8, the system reports the team as attributed.
**(Not yet built: same caveat — this is a readout for the DM to act on, not
an automatic game-over.)**

Both numbers are on the main screen at all times, and on the DM console.

## Confirmation

Some cards hit a protected site — a hospital, homes, water, a railway, or
civil air traffic. Those cards require the **Commander** to say so out loud
and type `confirm` before the action goes through. The Operator's terminal
shows the warning text when this happens; it cannot be skipped.

## One-time exploits

A small number of cards are marked **burn**: once played successfully, that
exact card can never be played again by anyone, on any host, for the rest of
the session (the defenders have patched it). The terminal and the card
listing both show this once it's spent.

## Needs an exploit sheet

Cards marked **needs exploit sheet** are written against a specific piece
of software. Intelligence has to match the scanned service name to the
right printed sheet before Operator plays the card.
**(Not yet built: the system does not check this match itself — if
Intelligence gets it wrong, the DM should rule the attempt as an automatic
fumble rather than let the roll happen.)**

## Collateral and scoring

Every card that is authored with a collateral value (for example,
`tamper_dosing` on the water plant, or `set_clear` on the railway) adds
those points when it lands — full points on a clean hit, half on a partial.
Cards that hit a site marked protected in the scenario (hospital, homes,
civil radar) add that site's penalty on top, through a separate mechanism,
so a card can trigger both at once.

The running collateral total is shown on the DM console.
**(Not yet built: there is no automatic final score. The scenario file
defines scoring weights — precise 30%, quiet 25%, unattributable 25%,
outcome 20% — but turning noise, trace, collateral and the strike outcome
into one number is still a DM judgement call at the debrief, using the
numbers on screen.)**

## Winning

There is no automatic win screen. At minute 50 the DM looks at the map and
judges the outcome by what the team has actually done:

- **Stand-down (best):** the hostile command bunker shows neutralised.
- **Strike window (good):** the air defence battery shows neutralised, with
  the strike due at minute 50.
- **Strike fails:** neither is neutralised by minute 50.

A site shows as neutralised on the map itself (a status marker) — this part
is real and automatic, computed from the actual flags, disables and
counters the team has achieved. The DM is only adjudicating the overall
result at minute 50, not individual site states.

## The twist

At minute 40, the DM is expected to force a complication — a patched
exploit, a defender response, whatever fits what the team has done. The DM
console's clock controls can jump straight to minute 40 to make this land
as a deliberate beat rather than a surprise.
**(Not yet built: there is no DM button that disables a specific card on
demand. "Patch this card" right now only happens automatically, when a
burn card is used. If the DM wants to narratively patch something else,
that's enforced by the DM saying so out loud, not by the system.)**
