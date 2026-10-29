"""FastAPI server exposing the engine to the browser screen and DM page."""
import hashlib
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

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
        "entry_node": SC["entry_node"] if GAME.started else None,
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


@app.post("/api/start")
def start_game():
    try:
        GAME.start()
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


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/dm")
def dm_page():
    return FileResponse(STATIC_DIR / "dm.html")
