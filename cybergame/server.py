"""FastAPI server exposing the engine to the browser screen and DM page."""
import hashlib
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.types import Scope
from pydantic import BaseModel


class NoCacheStaticFiles(StaticFiles):
    """Browsers caching a stale copy of app.js/dm.html/style.css during
    rapid iteration has bitten this project more than once -- never cache
    these, the server is the only source of truth."""

    async def get_response(self, path: str, scope: Scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-store"
        return response

from cybergame import scenario as scenario_mod
from cybergame.engine import Game, GameError

BASE_DIR = Path(__file__).resolve().parent.parent
SCENARIO_PATH = BASE_DIR / "scenario" / "blackout.yaml"
STATIC_DIR = Path(__file__).resolve().parent / "static"

app = FastAPI(title="Cadet cyber game")

SC = scenario_mod.load(SCENARIO_PATH)
GAME = Game(SC)

CARD_PUBLIC_FIELDS = (
    "id", "name", "kind", "recon", "noise", "trace", "time",
    "needs_intel", "burn", "confirm", "text", "tradeoff",
)


def _callsign_for(node_id):
    """Deterministic, scenario-facing handle so a newly pivoted-to host can
    be addressed in the terminal before it is identified -- like a hostname
    you got from a hop, with no idea yet what the box actually is."""
    digest = hashlib.sha1(node_id.encode()).hexdigest()
    return f"HOST-{digest[:4].upper()}"


class StartRequest(BaseModel):
    foothold: str | None = None


class ScanRequest(BaseModel):
    node: str
    level: int
    roll: int
    modifier: int = 0


class PlayRequest(BaseModel):
    node: str
    card: str
    roll: int
    modifier: int = 0
    confirmed: bool = False


class OffsetRequest(BaseModel):
    minutes: float


def _public_node(nid):
    n = GAME.node(nid)
    known = GAME.known_level.get(nid, 0)
    entry = {
        "id": nid,
        "callsign": _callsign_for(nid),
        "pos": n.get("pos"),
        "known": known,
        "up": GAME.is_up(nid),
        "neutralised": GAME.is_neutralised(nid) if n["type"] in ("air defence", "air base", "objective") else None,
    }
    if known >= 1:
        entry["name"] = n["name"]
        entry["type"] = n["type"]
    if known >= 2:
        entry["desc"] = n.get("desc")
        entry["service"] = SC["services"].get(n.get("service", ""), {}).get("label")
        entry["cards"] = [c for c in n.get("cards", []) if c not in GAME.patched_cards]
    if known >= 3:
        entry["notes"] = n.get("notes", {})
        entry["counters"] = GAME.counters.get(nid, {})
        entry["flags"] = {k: True for k in GAME.node_flags(nid)}
    return entry


@app.get("/api/state")
def get_state():
    phase = GAME.phase()
    return {
        "started": GAME.started,
        "minutes": round(GAME.minutes(), 1),
        "phase": phase["id"],
        "phase_name": phase["name"],
        "meters": GAME.meter_status(),
        "collateral_points": GAME.collateral_points,
        "nodes": [_public_node(nid) for nid in sorted(GAME.visible)],
        "entry_node": GAME.entry_node if GAME.started else None,
        "notes": GAME.notes,
        "title": SC["title"],
    }


@app.get("/api/scenario")
def get_scenario():
    return {
        "title": SC["title"],
        "briefing": SC["briefing"],
        "roles": SC["roles"],
        "phases": SC["phases"],
        "sheets": SC["sheets"],
        "debrief_links": SC["debrief_links"],
    }


@app.post("/api/dm/reveal_all")
def dm_reveal_all():
    try:
        GAME.reveal_all()
    except GameError as exc:
        raise HTTPException(400, str(exc))
    return {"ok": True}


@app.get("/api/dm/topology")
def dm_topology():
    """DM-only: every asset and every link between them, regardless of
    whether the team has pivoted to it yet. Used for the full map on the
    DM console -- never sent to the main screen."""
    nodes = []
    for nid, n in SC["nodes_by_id"].items():
        nodes.append({
            "id": nid,
            "name": n["name"],
            "type": n["type"],
            "pos": n.get("pos"),
            "hidden": n.get("hidden", False),
            "protected": n.get("protected", False),
            "up": GAME.is_up(nid) if GAME.started else True,
            "known": GAME.known_level.get(nid, 0),
            "visible": GAME.is_visible(nid),
            "neutralised": GAME.is_neutralised(nid) if n["type"] in ("air defence", "air base", "objective") else None,
        })

    # Dedup keys are scoped per edge kind, not shared across kinds -- a
    # power-effect edge (e.g. a hidden feeder line to the air defence
    # battery) can share a node pair with that same node's "hidden, deep
    # scan reveals it" edge, and both need to survive independently.
    seen = set()
    edges = []
    for nid, neighbors in SC["neighbors"].items():
        for other in neighbors:
            key = ("link", tuple(sorted((nid, other))))
            if key in seen:
                continue
            seen.add(key)
            edges.append({"from": key[1][0], "to": key[1][1], "kind": "link"})
    for nid, deep in SC["deep_neighbors"].items():
        for other in deep:
            key = ("hidden", tuple(sorted((nid, other))))
            if key in seen:
                continue
            seen.add(key)
            edges.append({"from": key[1][0], "to": key[1][1], "kind": "hidden"})
    for a, b in SC.get("effect_edges", []):
        key = ("effect", tuple(sorted((a, b))))
        if key in seen:
            continue
        seen.add(key)
        edges.append({"from": a, "to": b, "kind": "effect"})

    return {"nodes": nodes, "edges": edges, "entry_node": GAME.entry_node or SC["entry_node"]}


@app.get("/api/footholds")
def list_footholds():
    """Pre-start only, in spirit -- the cover stories the team can pick
    from. Each one is a different starting node with its own starting
    noise/trace, the cost of however they got in."""
    return [
        {
            "id": f["id"],
            "name": f["name"],
            "text": f["text"],
            "noise": f.get("noise", 0),
            "trace": f.get("trace", 0),
            "note": f.get("note", ""),
            "node": f["node"],
            "pos": SC["nodes_by_id"][f["node"]].get("pos"),
        }
        for f in SC.get("footholds", [])
    ]


@app.post("/api/start")
def start_game(req: StartRequest | None = None):
    foothold = req.foothold if req else None
    try:
        GAME.start(foothold)
    except GameError as exc:
        raise HTTPException(400, str(exc))
    return {"ok": True}


@app.post("/api/reset")
def reset_game():
    GAME.reset()
    return {"ok": True}


@app.post("/api/offset")
def apply_offset(req: OffsetRequest):
    """DM control: nudge the clock, e.g. to trigger the minute-40 twist early."""
    GAME.time_offset += req.minutes
    return {"ok": True, "minutes": round(GAME.minutes(), 1)}


@app.get("/api/roll")
def roll_die():
    return {"roll": GAME.roll()}


@app.post("/api/scan")
def do_scan(req: ScanRequest):
    try:
        result = GAME.scan(req.node, req.level, req.roll, req.modifier)
    except GameError as exc:
        raise HTTPException(400, str(exc))
    result["discovered"] = [
        {"id": nid, "callsign": _callsign_for(nid)} for nid in result.get("newly_visible", [])
    ]
    return result


@app.post("/api/play")
def do_play(req: PlayRequest):
    try:
        result = GAME.play_card(req.node, req.card, req.roll, req.modifier, req.confirmed)
    except GameError as exc:
        if str(exc) == "needs_confirmation":
            card = GAME.cards[req.card]
            raise HTTPException(409, card.get("confirm", "This action needs Commander confirmation."))
        raise HTTPException(400, str(exc))
    return result


@app.get("/api/card/{card_id}")
def card_detail(card_id: str):
    card = GAME.cards.get(card_id)
    if card is None:
        raise HTTPException(404, "No such card.")
    out = {k: card.get(k) for k in CARD_PUBLIC_FIELDS}
    out["patched"] = card_id in GAME.patched_cards
    return out


@app.get("/api/sheet-match/{sheet_id}")
def sheet_match(sheet_id: str):
    sheet = next((s for s in SC["sheets"] if s["id"] == sheet_id), None)
    if not sheet:
        raise HTTPException(404, "No such sheet.")
    matching = [nid for nid, n in SC["nodes_by_id"].items() if n.get("service") == sheet["matches"]]
    return {"sheet": sheet, "nodes": matching}


app.mount("/static", NoCacheStaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/dm")
def dm_page():
    return FileResponse(STATIC_DIR / "dm.html", headers={"Cache-Control": "no-store"})
