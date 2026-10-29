# Card reference — Operation Blackout

Every card in the live scenario, exactly as the engine reads it. "Recon"
is the minimum scan level needed before the card appears at all (it's
listed once the site is known at level 2, same as every card there).
"Sheet" means Intelligence needs to have matched the right exploit sheet
before Operator should attempt it.

## Power stations

| Card | Site | Noise | Sheet | Text | Trade-off |
|---|---|---|---|---|---|
| Trip the station | Power station north | 3 | yes | Trip the generating plant offline. | Defenders restart it after about 12 minutes. |
| Overload the station | Power station south | 4 | yes | Push the wind farm offline. | Loud. Stays down about 15 minutes. |
| Spoof the grid load readings | Power station north | 2 | yes | Operators shed load on their own. | You don't choose what's shed — it could be the hospital. **Needs Commander confirmation.** |

## Substations (1, 2, 3)

| Card | Noise | Sheet | Text | Trade-off |
|---|---|---|---|---|
| Open the breaker | 2 | no | Everything downstream loses power. | Fast and cheap, takes out everything downstream. Restored after ~10 min. |
| Lock the breaker controls | 3 | yes | Stops defenders restoring this substation. | Only useful once it's cut. Your method gets logged. |

## Air defence backup chain

| Card | Site | Noise | Sheet | Text | Trade-off |
|---|---|---|---|---|---|
| Cut the feeder line | Feeder 1B / 3B | 3 | no | One supply to the air defence battery is cut. | Precise, no collateral. Rerouted within ~8 min. |
| Block the auto-start signal | Backup generator | 4 | yes | The generator never starts. | Works at once, but points defenders at the air defence site. |
| Disable the fuel pump | Backup generator | 3 | no | Generator dies after its first tank runs out. | Quiet, but time it with the power cut. |
| Cut the depot pumps | Fuel depot | 2 | no | No refuelling for any generator. | Slow effect — matters ten minutes after power goes. |
| Tamper with the level gauges | Fuel depot | 3 | yes | Defenders think the generator has fuel. | They find out when it fails. Good timing for a strike. |

## Air defence battery

| Card | Noise | Sheet | Burn? | Text | Trade-off |
|---|---|---|---|---|---|
| Exploit the control panel | 4 | yes | **yes, one use ever** | Full control of the battery. | Defenders log the method and patch it everywhere. |
| Change its targeting data | 3 | yes | no | Fires at the wrong place. | Obvious once it fires, lasts ~15 min. |
| Lock the launcher | 3 | yes | no | Battery cannot fire. | Operators revert to manual after ~9 min. |

## Military and civil radar

| Card | Target | Noise | Sheet | Text | Trade-off |
|---|---|---|---|---|---|
| Shared-software exploit | Both radars at once | 4 | yes | Hits military and civil radar together. | You get the military radar free, but airliners lose theirs too. **Confirm required. Collateral 25.** |
| Blank the tracks | Military radar | 3 | yes | Radar shows an empty sky. | Noticed within ~6 min. |
| Ghost tracks | Military radar | 2 | yes | Fake aircraft appear, battery readiness −1. | A bad fake raises noise. |
| Delay the feed | Military radar | 1 | yes | Tracks arrive late, readiness −1. | Quiet, but a short delay won't stop it firing. |
| Corrupt the friend-or-foe code | Military radar | 4 | yes | Readiness −2, but may flag your own strike package. | — |
| Freeze the display | Military radar | 1 | no | Picture looks fine but is stale. | Fails as soon as anyone checks a known flight (~5 min). |
| Blank / ghost / delay the feed | Civil radar | 1–3 | yes | Same effects as above, on the civilian radar. | **Airliners lose separation. Confirm required. Collateral 25 each.** |

## Military comms and telecoms

| Card | Site | Noise | Sheet | Text | Trade-off |
|---|---|---|---|---|---|
| Jam the command link | Military comms | 3 | no | Air base and air defence can't coordinate. | Backup radio after ~12 min. |
| Inject a false order | Military comms | 4 | yes | Air defence stands down. | Only works if the order format matches the sheet. |
| Intercept traffic | Military comms | 1 | no | Listen to the defenders' orders. | Quiet, but information only — changes nothing on the board. |
| Jam the air defence command link | Telecoms | 3 | no | Battery can't receive orders. | Runners restore it after ~5 min. |

## Air base

| Card | Noise | Sheet | Text | Trade-off |
|---|---|---|---|---|
| Cut the runway lighting | 2 | no | No night scramble. | Works since the strike is at night. Lasts ~20 min. |
| Corrupt the scramble alert | 3 | yes | Pilots don't receive the order. | A phone call fixes it after ~9 min. |
| Disable the fuel bowsers | 3 | no | Aircraft can't refuel after launch. | Delayed, but permanent. |
| Ground the fleet (fake fault) | 4 | yes | Aircraft stay grounded. | A real engineer check reveals it after ~12 min. |

## Protected civilian sites

| Card | Site | Noise | Sheet | Text | Trade-off |
|---|---|---|---|---|---|
| Cut the hospital's power | Hospital | 2 | no | Lights out. | Generator holds ~3 min, then fails. **Confirm required. Heavy penalty.** |
| Open the district breaker | Homes east/west | 2 | no | A whole district goes dark. | **Confirm required. Penalty scales with population.** |
| Stop the pumps | Water plant | 3 | yes | Pressure drops. | Restarted after ~9 min. |
| Alter the chemical dosing | Water plant | 4 | yes | Water becomes unsafe. | **Confirm required. Collateral 40 — the worst in the game.** |
| Set all signals to red | Rail | 3 | yes | Trains stop. | Safe, but a distraction — raises noise by 2. |
| Set signals to clear | Rail | 4 | yes | Trains can collide. | **Confirm required. Collateral 30. The one to choose not to do.** |

## The objective — hostile command bunker

| Card | Noise | Sheet | Text | Trade-off |
|---|---|---|---|---|
| Lock the launch control | 5 | yes | Site cannot fire. | The best outcome and the loudest action. |
| Cut it off from command | 4 | yes | Site cannot receive orders. | Lasts ~8 min — time it for the strike. |

## Recon actions (every site)

| Action | Noise | Trace | Reveals |
|---|---|---|---|
| Look (identify) | 0 | 0 | Name and type |
| Map links | 1 | 1 | Description, service, every directly connected host |
| Deep scan | 3 | 2 | Hidden sites attached to this one |
