import pytest

from cybergame import scenario as scenario_mod


def test_load_valid_scenario_succeeds():
    sc = scenario_mod.load("scenario/blackout.yaml")
    assert sc["title"] == "Operation Blackout"


def test_build_rejects_unknown_source_node():
    data = {
        "phases": [{"id": "briefing", "name": "Briefing", "start": 0}],
        "meters": {"noise": {"warn": 1, "patch_at": [], "lockdown": 10, "decay_every_min": 5},
                   "trace": {"warn": 1, "attributed": 10, "max": 10}},
        "nodes": [
            {"id": "airdef", "name": "A", "type": "air defence", "pos": [0, 0],
             "needs": [{"kind": "power", "sources": ["ghost"]}]},
            {"id": "air_base", "name": "B", "type": "air base", "pos": [0, 0]},
            {"id": "obj", "name": "C", "type": "objective", "pos": [0, 0]},
        ],
    }
    with pytest.raises(ValueError, match="unknown source"):
        scenario_mod.build(data)


def test_build_requires_exactly_one_objective():
    data = {
        "phases": [{"id": "briefing", "name": "Briefing", "start": 0}],
        "meters": {"noise": {"warn": 1, "patch_at": [], "lockdown": 10, "decay_every_min": 5},
                   "trace": {"warn": 1, "attributed": 10, "max": 10}},
        "nodes": [
            {"id": "airdef", "name": "A", "type": "air defence", "pos": [0, 0]},
            {"id": "air_base", "name": "B", "type": "air base", "pos": [0, 0]},
        ],
    }
    with pytest.raises(ValueError, match="objective"):
        scenario_mod.build(data)
