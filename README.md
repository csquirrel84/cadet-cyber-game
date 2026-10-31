# Cadet cyber game — Operation Blackout

A one-hour, browser-based scenario for teaching Army Cadets how infrastructure
depends on itself, and why real cyber effects have to be precise, quiet and
unattributable. Each team plays on its own laptop, roles enforced by who is
allowed to touch what. Run it for up to 10 teams at once from one DM laptop
-- no internet connection needed, and no technical setup beyond running one
script.

**Printable docs for running a real session:**
[Game rules](docs/GAME_RULES.md) ·
[Card reference](docs/CARD_REFERENCE.md) ·
[Briefing pack](docs/BRIEFING_PACK.md) (briefing, role cards, exploit sheets) ·
[DM guide](docs/DM_GUIDE.md)

## Quick start (Linux)

Run this on the laptop you (the DM) will sit at for the session:

```bash
./setup.sh
```

It checks for Docker (installs it if missing), builds the game, starts one
fully isolated instance per team (10 teams, ports 8000-8009), and brings up
a WiFi access point on this machine for the team laptops to connect to --
no internet sharing, the team laptops only need to reach this machine. When
it finishes it prints the WiFi network name/password and every team's URL.

**DM console access is restricted to this machine.** `/dm` (and everything
under it) only answers requests from this laptop's own loopback interface
-- it is never reachable over the WiFi network the script creates, by
design, so there's nothing to password-protect and nothing for a team to
stumble into. Open each team's console from this laptop at
`http://127.0.0.1:<team's port>/dm`.

To shut everything down at the end of the session (stops every team's
container and tears down the WiFi access point):

```bash
./teardown.sh
```

**Windows:** `setup.ps1` currently only starts a single shared-screen
instance (see below) -- the field deployment above (multiple teams, WiFi
access point) is Linux-only for now.

## Running a single shared-screen game instead

For a smaller session — one game on a TV or projector, played by everyone
together rather than team-by-team — skip the scripts above and run the
container directly:

```bash
docker compose up -d --build    # build and start
docker compose restart          # restart without rebuilding
docker compose down             # stop it
docker logs -f cadet-cyber-game # watch it run
```

This starts one instance on port 8000:

- Main screen (cadets): `http://localhost:8000/`
- DM console (you): `http://localhost:8000/dm` (also loopback-only if you're
  not on the same machine as the cadets, use the host machine's own
  network address for the main screen and keep `/dm` on the host itself)

If you edit `scenario/blackout.yaml` only, you don't need to rebuild — it's
mounted read-only into the container, so a `restart` picks it up. If you edit
anything under `cybergame/` (the server or the browser screen), you need
`up -d --build` to bake the change into the image.

## How the hour runs

| Minute | Phase | What happens |
|---|---|---|
| 0 | Briefing | Read the briefing text on the DM console aloud. Hand out roles. |
| 10 | Recon | Cadets scan sites on the map. Nothing is named until it's scanned. |
| 25 | Research | Match what Recce found to the exploit sheets, printed from `/dm`. |
| 35 | Strike | Cadets act: disable, exploit, or stand the bunker down. |
| 40 | Twist | Hit "Jump to minute 40" on the DM console to force the defenders to patch, regardless of the clock. |
| 50 | Debrief | Use the real-world links on the DM console to talk through what happened. |

The clock runs for real, in minutes, from the moment "Start operation" is
pressed on the main screen. Use the DM console's **+5 minutes** or
**Jump to minute 40** buttons to speed things along if the group is quick,
or to force the twist as a deliberate beat rather than leaving it to chance.

## Roles

Four cadets, one job each, enforced by who's allowed to touch the keyboard
and who's allowed to read what:

- **Recce** — clicks the scan buttons. Doesn't read the result panel aloud
  to anyone except Intelligence.
- **Intelligence** — reads the printed exploit sheets (from `/dm`) and tells
  Operator which card matches which site.
- **Operator** — is the only one who touches the roll button and plays cards.
- **Commander** — owns the go/no-go call. Any action with a confirmation
  prompt (hospital, water dosing, civil radar, rail signals) needs the
  Commander to say yes out loud before Operator clicks confirm.

Five or six cadets: split Recce into a pair, or add a Signaller who relays
between Intelligence and Operator without touching either screen.

## How the game itself works

- Every site on the map starts unidentified (shown as "?"). Scanning it at
  level 1 (Look) reveals its name and type; level 2 (Map links) reveals what
  it depends on and what service it runs; level 3 (Deep scan) reveals hidden
  sites, like the air defence's two feeder lines.
- Every scan and every card costs noise, and some cost trace. Both are
  shown as meters at the top of the main screen. Noise decays slowly over
  time; trace does not.
- Every action is resolved with a die roll (1–6), done by the engine, not a
  physical die — see `scenario/blackout.yaml`'s dice table for what each
  result means. 1 is a fumble, 6 is a critical hit that can turn up a
  zero-day.
- Some cards have a **confirm** prompt — these are the ones that hit a
  protected site (hospital, homes, civil radar, water dosing, rail). The
  Operator's browser will show the warning text; the Commander has to agree
  before it's allowed through.
- The win conditions are: disable the air defence battery for the strike
  window (good), do that with no collateral and low meters (better), or
  neutralise the bunker objective directly so no strike is needed at all
  (best).

## Editing the scenario

Everything cadet-facing — site names, descriptions, card text, trade-offs,
the briefing, the debrief links, the exploit sheets — lives in
`scenario/blackout.yaml` as plain text. You can change the story, rename
nodes, add new sites, or write a second scenario file entirely without
touching any code. The game logic (`cybergame/engine.py`) only understands
generic concepts: nodes, dependencies, flags, counters, meters, dice. It has
no infrastructure-specific content of its own, so the same engine will run
any scenario file you write in the same format.

To add a node: give it an `id`, `name`, `type`, `desc`, `pos` (x/y as a
percent of the map, 0–100), and a `needs` list naming which other node IDs
it depends on. To add a card: give it an `id` under `cards`, a `recon` cost,
`noise`/`trace` costs, and an `effects` list (see the existing cards for the
effect types: `disable`, `flag`, `counter`, `noise`, `pin`, `hint`,
`random_disable`).

## Developing without Docker

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt    # Windows: .venv\Scripts\pip
.venv/bin/uvicorn cybergame.server:app --reload --port 8000
```

Run the test suite:

```bash
.venv/bin/python -m pytest -q
```

## What's not built yet

- The physical box (Pi, LEDs, big roll button). Everything today is
  screen-only, by design.
- Printed exploit sheet cards and role cue cards — the `/dm` page lists the
  sheet names and debrief links as plain text; turning them into something
  printable is a small follow-on task.
- A scoring summary screen at the end of the hour. Right now the DM reads
  the meters, the collateral total, and the node states off the screen for
  the debrief by eye.
- Lockdown and attribution thresholds are reported but not enforced — see
  [DM_GUIDE.md](docs/DM_GUIDE.md) for the full list of things the DM has to
  adjudicate by hand.
