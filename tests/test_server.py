import pytest
from fastapi.testclient import TestClient

from cybergame.server import app, GAME


@pytest.fixture(autouse=True)
def reset_game():
    GAME.reset()
    yield
    GAME.reset()


@pytest.fixture
def client():
    return TestClient(app)


def test_state_before_start(client):
    res = client.get("/api/state")
    assert res.status_code == 200
    assert res.json()["started"] is False


def test_start_then_state_started(client):
    client.post("/api/start")
    res = client.get("/api/state")
    assert res.json()["started"] is True


def test_double_start_is_rejected(client):
    client.post("/api/start")
    res = client.post("/api/start")
    assert res.status_code == 400


def test_scan_unknown_node_returns_400(client):
    client.post("/api/start")
    res = client.post("/api/scan", json={"node": "nope", "level": 1, "roll": 4})
    assert res.status_code == 400


def test_play_requiring_confirmation_returns_409(client):
    client.post("/api/start")
    GAME.visible.add("hospital")
    res = client.post("/api/play", json={"node": "hospital", "card": "cut_hospital", "roll": 4})
    assert res.status_code == 409


def test_play_with_confirmed_flag_succeeds(client):
    client.post("/api/start")
    GAME.visible.add("hospital")
    res = client.post("/api/play", json={"node": "hospital", "card": "cut_hospital", "roll": 4, "confirmed": True})
    assert res.status_code == 200
    assert res.json()["applied"] is True


def test_play_on_unreached_node_returns_400(client):
    client.post("/api/start")
    res = client.post("/api/play", json={"node": "hospital", "card": "cut_hospital", "roll": 4, "confirmed": True})
    assert res.status_code == 400


def test_state_only_lists_visible_nodes(client):
    client.post("/api/start")
    res = client.get("/api/state")
    ids = [n["id"] for n in res.json()["nodes"]]
    assert ids == [res.json()["entry_node"]]


def test_scan_map_links_discovers_neighbors(client):
    client.post("/api/start")
    state = client.get("/api/state").json()
    entry = state["entry_node"]
    res = client.post("/api/scan", json={"node": entry, "level": 2, "roll": 4})
    assert res.status_code == 200
    assert len(res.json()["discovered"]) > 0


def test_callsign_has_no_dotted_quad(client):
    client.post("/api/start")
    state = client.get("/api/state").json()
    assert "." not in state["nodes"][0]["callsign"]


def test_roll_returns_value_in_range(client):
    res = client.get("/api/roll")
    assert 1 <= res.json()["roll"] <= 6


def test_index_page_served(client):
    res = client.get("/")
    assert res.status_code == 200
    assert b"Cadet cyber game" in res.content


def test_dm_reveal_all_shows_every_node(client):
    client.post("/api/start")
    res = client.post("/api/dm/reveal_all")
    assert res.status_code == 200
    state = client.get("/api/state").json()
    assert len(state["nodes"]) == len(GAME.nodes)
    assert all(n["known"] >= 2 for n in state["nodes"])
