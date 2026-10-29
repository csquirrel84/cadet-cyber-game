# Briefing pack — Operation Blackout

Print this. Everything below the line is meant to be cut up and handed to
cadets — the briefing read aloud, the role cards one per cadet, the
exploit sheets left face-down on the table for Intelligence to pick up as
they're earned.

---

## Briefing (read aloud at minute 0)

> The Northern Republic is preparing a missile launch from a hardened
> command bunker. A strike package is already tasked and will go in at
> minute 50.
>
> You have a foothold on one compromised system inside the Republic's
> network. Everything else is unknown. You will have to pivot out from
> that one box to find and map the rest of the network yourselves.
>
> You have two ways to win. Open a window for the strike by suppressing
> the air defence, or, better, stop the launch itself by cyber means so
> the aircraft are stood down and never fly.
>
> Rules of engagement: effects must be precise, quiet and unattributable.
> Hospitals, homes, water, civil aircraft and the railway are protected.
> Anything you break that you should not have broken costs you points.

---

## Role card — Recce

**Job:** Run the scans. Type every `scan` command.

**You may not:** read the scan result aloud to anyone except Intelligence.
Tell them what you see; let them decide what it means.

---

## Role card — Intelligence

**Job:** Read what Recce found. Match the service name on screen to one of
the exploit sheets below. Tell Operator which card to use and where.

**You may not:** touch the keyboard. Every order goes through you by
voice, never by your own hand on the terminal.

---

## Role card — Operator

**Job:** The only one who types `run` and presses Roll. You act only on
an order from Intelligence, approved by the Commander where needed.

**You may not:** decide what to attack. You execute, you don't plan.

---

## Role card — Commander

**Job:** Own the noise and trace meters. Any action that needs
confirmation waits for you to say "confirmed" out loud before Operator
types `confirm`. You call go or no-go on everything.

**You may not:** type. Your tools are your voice and your judgement.

---

## Exploit sheets

Cut these out. Hand one to Intelligence the moment a scan reveals a
service that matches it — not before.

| Sheet | Matches the service |
|---|---|
| Remote command bug in grid PLC firmware 2.x | Grid PLC, firmware 2.x |
| Weak admin login on web SCADA panels | Web SCADA admin panel |
| Default login on fire-control panels | Fire-control panel |
| Input flaw in radar track processor v3 | Radar track processor v3 |
| Unpatched launch control terminal | Launch control terminal |
| Order message sequence numbers and format | Secure order messaging gateway |
| Command bug in rail interlocking controller | Rail interlocking controller |
| Unauthenticated dosing controller web panel | Chemical dosing controller |
| Scramble alert gateway weakness | Air operations alert system |
| Telecom switch management flaw | Telecom switch software |
| Building management default password | Building management system |

---

## Quick-reference card (one per table)

**Scan:** `scan <callsign> [1|2|3]` — 1 identify, 2 map links, 3 deep.
**See options:** `cards <callsign>`
**Act:** `run <callsign> <card>` then `roll`
**Approve:** `confirm`
**Check yourself:** `status`, `intel <callsign>`, `hosts`

Die roll: 1 fumble · 2 weak · 3 partial · 4 success · 5 clean · 6 critical
