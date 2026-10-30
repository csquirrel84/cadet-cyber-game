import itertools

import pytest

from cybergame import scenario as scenario_mod
from cybergame.engine import Game, GameError

SCENARIO_PATH = "scenario/blackout.yaml"


class FixedClock:
    def __init__(self, start=0.0):
        self.t = start

    def __call__(self):
        return self.t

    def advance(self, seconds):
        self.t += seconds


class FixedRng:
    """Deterministic stand-in for random.SystemRandom."""

    def __init__(self, values):
        self._values = iter(values)

    def randint(self, lo, hi):
        return next(self._values)

    def choice(self, seq):
        return seq[0]


@pytest.fixture
def sc():
    return scenario_mod.load(SCENARIO_PATH)


def make_game(sc, rolls=(), clock=None, reveal=()):
    clock = clock or FixedClock()
    game = Game(sc, now_fn=clock, rng=FixedRng(rolls))
    game.start()
    game.visible.update(reveal)
    return game, clock


def test_scenario_loads_without_error(sc):
    assert "airdef" in sc["nodes_by_id"]
    assert "air_base" in sc["nodes_by_id"]
    objectives = [n for n in sc["nodes_by_id"].values() if n["type"] == "objective"]
    assert len(objectives) == 1


def test_node_up_when_no_needs(sc):
    game, _ = make_game(sc)
    assert game.is_up("ps_north")


def test_node_depends_on_power_source(sc):
    game, _ = make_game(sc)
    assert game.is_up("sub1")
    game.disabled_until["ps_north"] = True
    assert not game.is_up("sub1")


def test_cascade_through_two_layers(sc):
    game, _ = make_game(sc)
    assert game.is_up("hospital")
    game.disabled_until["sub1"] = True
    assert not game.is_up("hospital")


def test_scan_raises_known_level_on_success(sc):
    game, _ = make_game(sc, rolls=[4])
    result = game.scan("sub1", level=2, roll_value=4)
    assert result["tier"] == "success"
    assert game.known_level["sub1"] == 2


def test_scan_fumble_adds_noise_and_no_knowledge(sc):
    game, _ = make_game(sc, rolls=[1], reveal=["airdef"])
    result = game.scan("airdef", level=3, roll_value=1)
    assert result["tier"] == "fumble"
    assert game.known_level.get("airdef", 0) == 0
    assert game.noise > 0


def test_play_card_requires_confirmation_when_marked(sc):
    game, _ = make_game(sc, rolls=[4], reveal=["hospital"])
    with pytest.raises(GameError, match="needs_confirmation"):
        game.play_card("hospital", "cut_hospital", roll_value=4)


def test_play_card_with_confirmation_applies_effect(sc):
    game, _ = make_game(sc, rolls=[4], reveal=["hospital"])
    result = game.play_card("hospital", "cut_hospital", roll_value=4, confirmed=True)
    assert result["applied"]
    assert not game.is_up("hospital")
    assert game.collateral_points > 0


def test_card_level_collateral_is_scored_on_apply(sc):
    """tamper_dosing targets water_plant, which has no node-level protected
    flag -- its heavy penalty only exists as the card's own collateral
    field, so this is the one path that proves that field is wired up."""
    game, _ = make_game(sc, rolls=[4], reveal=["water_plant"])
    assert game.collateral_points == 0
    result = game.play_card("water_plant", "tamper_dosing", roll_value=4, confirmed=True)
    assert result["applied"]
    assert game.collateral_points == 40
    assert result["collateral"] == 40


def test_card_level_collateral_halved_on_partial(sc):
    game, _ = make_game(sc, rolls=[3], reveal=["water_plant"])
    result = game.play_card("water_plant", "tamper_dosing", roll_value=3, confirmed=True)
    assert result["partial"]
    assert game.collateral_points == 20


def test_disable_effect_expires_after_duration(sc):
    clock = FixedClock()
    game, clock = make_game(sc, rolls=[4], clock=clock)
    game.play_card("sub1", "open_breaker", roll_value=4)
    assert not game.is_up("sub1")
    clock.advance(11 * 60)
    assert game.is_up("sub1")


def test_critical_roll_gives_zero_day_bonus(sc):
    game, _ = make_game(sc, rolls=[6], reveal=["mil_radar"])
    result = game.play_card("mil_radar", "blank_tracks", roll_value=6)
    assert result["tier"] == "critical"
    assert result.get("bonus") == "zero_day"


def test_burn_card_cannot_be_played_twice(sc):
    game, _ = make_game(sc, rolls=[4, 4], reveal=["airdef"])
    game.play_card("airdef", "exploit_hmi", roll_value=4)
    assert "exploit_hmi" in game.patched_cards
    with pytest.raises(GameError):
        game.play_card("airdef", "exploit_hmi", roll_value=4)


def test_airdef_neutralised_when_both_feeders_down(sc):
    game, _ = make_game(sc)
    assert not game.is_neutralised("airdef")
    game.disabled_until["feed_1b"] = True
    game.disabled_until["feed_3b"] = True
    assert game.is_neutralised("airdef")


def test_airdef_neutralised_when_radar_blanked(sc):
    game, _ = make_game(sc)
    game._set_flag("mil_radar", "blanked", None)
    assert game.is_neutralised("airdef")


def test_noise_cannot_go_negative(sc):
    game, _ = make_game(sc, rolls=[5], reveal=["mil_radar"])
    game.play_card("mil_radar", "delay_feed", roll_value=5)
    assert game.noise >= 0


def test_card_not_available_at_wrong_node_raises(sc):
    game, _ = make_game(sc, rolls=[4], reveal=["hospital"])
    with pytest.raises(GameError):
        game.play_card("hospital", "exploit_hmi", roll_value=4)


def test_phase_detection_by_minute(sc):
    clock = FixedClock()
    game, clock = make_game(sc, clock=clock)
    assert game.phase()["id"] == "briefing"
    clock.advance(26 * 60)
    assert game.phase()["id"] == "research"


def test_meter_status_reports_lockdown(sc):
    game, _ = make_game(sc)
    game.noise = 10
    assert game.meter_status()["locked_down"]


def test_only_entry_node_visible_after_start(sc):
    game, _ = make_game(sc)
    assert game.visible == {sc["entry_node"]}


def test_scan_on_unreached_node_raises(sc):
    game, _ = make_game(sc, rolls=[4])
    with pytest.raises(GameError, match="pivoted"):
        game.scan("airdef", level=1, roll_value=4)


def test_play_on_unreached_node_raises(sc):
    game, _ = make_game(sc, rolls=[4])
    with pytest.raises(GameError, match="pivoted"):
        game.play_card("airdef", "exploit_hmi", roll_value=4)


def test_map_links_scan_reveals_neighbors(sc):
    game, _ = make_game(sc, rolls=[4])
    entry = sc["entry_node"]
    assert game.visible == {entry}
    game.scan(entry, level=2, roll_value=4)
    assert game.visible > {entry}
    assert game.visible == {entry} | set(sc["neighbors"][entry])


def test_identify_scan_does_not_reveal_neighbors(sc):
    game, _ = make_game(sc, rolls=[4])
    entry = sc["entry_node"]
    game.scan(entry, level=1, roll_value=4)
    assert game.visible == {entry}


def test_deep_scan_reveals_hidden_neighbors(sc):
    game, _ = make_game(sc, rolls=[4], reveal=["airdef"])
    game.scan("airdef", level=3, roll_value=4)
    assert "feed_1b" in game.visible
    assert "feed_3b" in game.visible
    assert "gen_ad" in game.visible


def test_every_node_reachable_from_entry(sc):
    """No node should be stranded with no path in from the entry point --
    this would make it impossible for players to ever reach it."""
    entry = sc["entry_node"]
    seen = {entry}
    frontier = [entry]
    while frontier:
        nid = frontier.pop()
        for nxt in set(sc["neighbors"].get(nid, [])) | set(sc["deep_neighbors"].get(nid, [])):
            if nxt not in seen:
                seen.add(nxt)
                frontier.append(nxt)
    unreachable = set(sc["nodes_by_id"]) - seen
    assert not unreachable, f"unreachable nodes: {unreachable}"


def test_reveal_all_shows_every_node_fully_identified(sc):
    game, _ = make_game(sc)
    assert len(game.visible) == 1
    game.reveal_all()
    assert len(game.visible) == len(sc["nodes_by_id"])
    assert all(game.known_level[nid] >= 2 for nid in sc["nodes_by_id"])


def test_reveal_all_before_start_raises():
    import cybergame.scenario as scenario_mod
    sc = scenario_mod.load("scenario/blackout.yaml")
    game = Game(sc, now_fn=FixedClock(), rng=FixedRng([]))
    with pytest.raises(GameError, match="not started"):
        game.reveal_all()
