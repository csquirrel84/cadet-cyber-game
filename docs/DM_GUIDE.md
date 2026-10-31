# DM guide — Operation Blackout

You run this from `/dm` on whatever device is nearest you, while the
cadets look at the main screen on the TV or projector. Both pull from the
same live game, so anything you do shows up on their screen within 2
seconds.

If the game is running on the same machine you're both looking at, both
screens are just `localhost`. If it's running on a separate box (a spare
laptop plugged into the TV, say), use that machine's address on your
network instead of `localhost` on every other device — for example
`http://192.168.1.50:8000/`. Find that address on the host machine with
`ipconfig` (Windows) or `ip addr` / `ifconfig` (Linux/macOS).

## Before the session

1. Confirm the container is up — `docker ps --filter name=cadet-cyber-game`.
   If it isn't, run the setup script again, or
   `cd cadet-cyber-game && docker compose up -d`.
2. Hit `/api/reset` once so you start from a clean game — the DM console
   has a **Reset game** button for this.
3. Print [BRIEFING_PACK.md](BRIEFING_PACK.md): the briefing, four role
   cards, the exploit sheets (cut apart, kept face-down), and one
   quick-reference card per table.
4. Decide your roles before the cadets sit down — who's Recce, who's
   Intelligence, who's Operator, who's Commander. For 5–6 cadets, split
   Recce into a pair or add a Signaller.

## Running the hour

**0–10, Briefing.** Read the briefing aloud from the pack. Hand out role
cards. Don't press Start yet — let them ask questions first.

**10 min: press Start.** This is also when the clock actually starts
moving on screen, so do it deliberately, not while they're still settling
in.

**10–25, Recon.** Watch the main screen's map fill in as they scan. If
nobody's done a level-2 scan in the first few minutes, that's the moment
to nudge them — level 1 only names a site, level 2 is what finds the next
one.

**25–35, Research.** Watch for Intelligence correctly matching services to
sheets. If they try to run a card against the wrong service, the system
won't stop them — you have to. Rule it an automatic fumble and say why.

**35–50, Strike.** Watch the noise and trace meters, and the collateral
number, all on your console. This is where confirmation prompts start
landing — don't let Operator type `confirm` without actually hearing the
Commander say it.

**Minute 40: force the twist.** Hit **Jump to minute 40** if the clock
hasn't got there yet, or just let it arrive naturally. The system does not
patch anything for you — decide a complication that fits what they've
done (a card they've used a lot, a site they've been loud at) and
narrate it. If you want it to actually bite mechanically, the only lever
you have right now is the clock and your own narration; there's no
"disable this card" button yet.

**50, Debrief.** Look at the map:

- Bunker shows neutralised → **stand-down**, the best outcome.
- Air defence shows neutralised, bunker doesn't → **strike window**, good.
- Neither → the strike goes in anyway and probably fails or costs more.

Read the noise, trace and collateral numbers off your console. There's no
single score the system hands you — use the scenario's own weighting as a
guide (precise 30%, quiet 25%, unattributable 25%, outcome 20%) and make
the call yourself. Then walk through [the real-world
links](CARD_REFERENCE.md) — Stuxnet, the Ukraine grid, Oldsmar, Mirai,
Colonial Pipeline — and connect each one to something the team actually
did this session.

## Neutralising the bunker — the routes in

The bunker is now a real site with its own power and water supply, not
just two cards that only work once you're already inside its network. A
team can reach a stand-down several different ways, and some of these
only count as a full success paired with another route — that's
deliberate, so point it out if a team fixates on one card and gets stuck.

Two things changed that make this possible:

- **Pivoting and power are no longer the same thing.** Scanning a
  substation used to reveal the hospital, the homes, the rail line — all
  the sites it powers. It no longer does. A substation's level-2 scan now
  only reveals other sites on the same *network* (other substations, the
  power stations). Cutting a substation still blacks out everything
  downstream of it, but the team can't pivot through that power cable to
  get there — they have to reach the hospital or the military network a
  different way, over an actual network path. The full asset map draws
  these differently: solid grey lines are pivot paths, dashed orange
  lines are power/water/fuel dependencies with no pivot.
- **The bunker has needs of its own**: grid power from sub2, and water
  from the water plant (10-minute grace, same as the hospital).

The direct routes:

1. **Lock the launch** (`lock_launch`, on the bunker). The intended best
   outcome — quiet-ish, precise, but the hardest roll in the game and
   needs the right sheet.
2. **Cut it off from command** (`cut_off_bunker`, on the bunker). Blocks
   orders for about 8 minutes — times well with the minute-50 strike.
3. **Inject a false stand-down order** (`inject_bunker_order`, on the
   bunker). The crew think the launch is cancelled. Falls apart if trace
   is already high when it lands — a team that's been loud shouldn't be
   able to rely on this one.
4. **Spoof the time signal** (`spoof_time_signal`, on telecoms). The
   bunker's clock drifts and its own checks start failing. Quiet, but
   only lasts until someone resyncs — a short window.
5. **Corrupt the launch authentication codes** (`corrupt_auth_codes`, on
   military comms). The bunker can't verify any order it receives.
   Precise, but getting caught means a fast code change.
6. **Trigger a false alarm** (`trigger_false_alarm`, on the hidden bunker
   building-management system — only found by a deep scan on the bunker
   itself). Seals or evacuates the crew. Short timer, so a team needs to
   be ready to act the moment it lands.

Routes that only neutralise the bunker **paired** with another:

7 + 8. **Cut military comms, and either radar.** Cutting mil_comms alone
   doesn't do it — pair it with taking down military radar *or* civil
   radar (whichever the team can reach) to represent the bunker having no
   orders and no targeting data at once.
9. **Feed false targets** (`feed_false_targets`, on military radar) is a
   cheaper, noisier alternative to taking the radar fully down — it
   counts the same way paired with mil_comms being cut, but costs
   collateral on a bad roll.
10. **Starve the power.** Cutting sub2 alone already blacks the bunker
    out (no grace period on that need), so this one is usually already
    "down" on its own — but if a team wants the narrative beat of also
    killing the backup generator, `sabotage_bunker_generator` (on the
    bunker) sets a flag that pairs with sub2 being down for the same
    result.
11. **Overheat it.** Cut the water plant. After the 10-minute grace period
    runs out the bunker counts as down, same as any other needs-based
    outage — no extra card required.
12. **Halt the reload convoy** (`halt_reload_convoy`, on rail signalling)
    only counts paired with `corrupt_auth_codes` — on its own it's framed
    as a partial (no more missiles arrive, but the one already loaded can
    still fire).

Routes that widen *how* the team gets in, not what they do once there:

13. **The contractor's laptop.** A deep scan on the air base reveals a
    hidden `contractor` site with a remote-access bridge into the
    military network — a second, slower way past the wall around
    mil_comms/airdef/air_base/mil_radar/bunker, alongside the existing
    civil-telecom leased-circuit bridge.
14. **Phish the crew.** Bunker staff live in homes west, which has its own
    network path into military comms — weaker, but useful if the
    contractor route is a dead end for this team.

A **diversion** (`staged_diversion`, on east homes) doesn't touch the
bunker at all — it lowers the trace meter for whatever else is running at
the same time, at the cost of collateral. Worth pointing out to a team
that's run up a high trace score and is about to go for the kill.

## Full asset map

The DM console also shows every site and every link between them, all at
once, regardless of what the team has actually discovered -- the main
screen never shows this. Grey dots are undiscovered, green is up, red is
down, amber is a protected site, purple means a win-condition site has
been neutralised, and the foothold has a white ring. It's there so you can
see at a glance how far the team has to go, and plan the minute-40 twist
around a site they genuinely haven't reached yet rather than guessing.

## DM console controls

| Control | Does |
|---|---|
| Start operation | Starts the clock. Can only be pressed once per game. |
| Reset game | Wipes everything back to minute 0, nothing discovered. Use between sessions, not mid-session. |
| +5 minutes | Nudges the clock forward without resetting anything else. |
| Jump to minute 40 | Forces the clock straight to 40 if it isn't there yet. |
| Noise / Trace / Collateral readout | Live numbers, refreshes every 2 seconds. |

## Known gaps — things you have to adjudicate by hand

- **Lockdown and attribution aren't enforced.** The system reports the
  team as locked down at noise 10 and attributed at trace 8, but it
  doesn't stop them acting. Decide what that means at your table and say
  so.
- **Exploit sheet matching isn't checked.** If Intelligence hands Operator
  the wrong sheet, the roll will still happen unless you stop it.
- **No final score.** You read the numbers and judge it yourself.
- **The minute-40 twist is narration only.** There's no button that
  disables a specific card on demand.

None of these are bugs — they're the parts of the game still sitting with
the DM rather than the code. If you find yourself wanting one of them
automated, that's useful feedback for the next build pass.
