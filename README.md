# Cadet cyber game — Operation Blackout

A one-hour, browser-based scenario for teaching Army Cadets how infrastructure
depends on itself, and why real cyber effects have to be precise, quiet and
unattributable. Everyone plays on one shared screen (a TV or projector works
well) and uses roles enforced by who is allowed to touch what.

**Printable docs for running a real session:**
[Game rules](docs/GAME_RULES.md) ·
[Card reference](docs/CARD_REFERENCE.md) ·
[Briefing pack](docs/BRIEFING_PACK.md) (briefing, role cards, exploit sheets) ·
[DM guide](docs/DM_GUIDE.md)

## What is running where

This is built and running on **orochiman-EQ (192.168.26.251, Tailscale
100.95.90.71)** in Docker. The project lives at
`/home/orochiman/Projects/cadet-cyber-game`.

- Main screen (cadets): `http://192.168.26.251:8000/`
- DM console (you): `http://192.168.26.251:8000/dm`

Both work over Tailscale too, at `100.95.90.71` instead of the `.251` address,
if you're running the session from somewhere not on that LAN.

## Starting and stopping it

On orochiman-EQ (192.168.26.251):

```bash
cd /home/orochiman/Projects/cadet-cyber-game
sudo docker compose up -d --build    # build and start
sudo docker compose restart          # restart without rebuilding
sudo docker compose down             # stop it
sudo docker logs -f cadet-cyber-game # watch it run
```

If you edit `scenario/blackout.yaml` only, you don't need to rebuild —
it's mounted read-only into the container, so a `restart` picks it up.
If you edit anything under `cybergame/` (the server or the browser
screen), you need `up -d --build` to bake the change into the image.

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

## Local development (not the eq box)

If you want to run it somewhere other than the eq box, e.g. your own
machine, to test scenario changes before pushing them:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn cybergame.server:app --reload --port 8000
```

Or with Docker locally:

```bash
docker compose up --build
```

Run the test suite (28 tests, covering the dependency graph, the dice
tiers, confirmation prompts, and the API):

```bash
.venv/bin/python -m pytest -q
```

## What's not built yet

- The physical box (Pi, LEDs, big roll button). Everything today is
  screen-only, by design — see the conversation history for why.
- Printed exploit sheet cards and role cue cards — the `/dm` page lists the
  sheet names and debrief links as plain text; turning them into something
  printable is a small follow-on task.
- A scoring summary screen at the end of the hour. Right now the DM reads
  the meters and the node states off the screen for the debrief by eye.
