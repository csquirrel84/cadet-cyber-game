"""Loads and validates a scenario YAML file."""
from pathlib import Path

import yaml

SCAN_CARDS = {
    "scan_identify": {
        "name": "Look (passive)", "kind": "recon", "level": 1, "recon": 0,
        "noise": 0, "trace": 0, "time": 2,
        "text": "Work out what this site is.",
        "tradeoff": "Quiet, but you learn the least.",
    },
    "scan_map": {
        "name": "Map links", "kind": "recon", "level": 2, "recon": 1,
        "noise": 1, "trace": 1, "time": 3,
        "text": "Learn what it feeds, what feeds it, and what software it runs.",
        "tradeoff": "A little noise.",
    },
    "scan_deep": {
        "name": "Deep scan", "kind": "recon", "level": 3, "recon": 2,
        "noise": 3, "trace": 2, "time": 5,
        "text": "Find hidden parts of the site.",
        "tradeoff": "Noisy, and it can get you detected.",
    },
}

CARD_DEFAULTS = {
    "kind": "exploit", "recon": 1, "noise": 0, "trace": 2, "time": 3,
    "needs_intel": False, "burn": False, "collateral": 0, "effects": [],
    "text": "", "tradeoff": "",
}

EFFECT_TYPES = {"disable", "flag", "counter", "noise", "trace", "pin", "hint", "random_disable"}


def load(path):
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return build(data)


def build(data):
    sc = dict(data)
    cards = {}
    for cid, card in {**SCAN_CARDS, **data.get("cards", {})}.items():
        merged = {**CARD_DEFAULTS, **card}
        merged["id"] = cid
        cards[cid] = merged
    sc["cards"] = cards
    sc["nodes_by_id"] = {}
    sc["site_letters"] = {}
    letter = 0
    for node in data["nodes"]:
        n = dict(node)
        n.setdefault("needs", [])
        n.setdefault("cards", [])
        n.setdefault("counters", {})
        n.setdefault("down_flags", [])
        n.setdefault("neutralised_when", [])
        n.setdefault("notes", {})
        n.setdefault("hidden", False)
        n.setdefault("protected", False)
        n.setdefault("penalty", 0)
        sc["nodes_by_id"][n["id"]] = n
        if not n["hidden"]:
            sc["site_letters"][n["id"]] = chr(ord("A") + letter)
            letter += 1
    sc.setdefault("services", {})
    sc.setdefault("sheets", [])
    sc.setdefault("extra_edges", [])
    sc.setdefault("flag_text", {})
    sc.setdefault("debrief_links", [])
    sc.setdefault("roles", [])
    sc.setdefault("false_flag", {"correct": None, "groups": []})
    _build_adjacency(sc)
    _validate(sc)
    return sc


def _build_adjacency(sc):
    """Build the pivot graph: which nodes a known node reveals, kept
    separate from which nodes merely have an *effect* on each other.

    A power/water/fuel dependency does not mean two sites talk to each
    other on a network -- cutting a substation blacks out everything
    downstream of it without the attacker being able to pivot through
    that wire. A `needs` group only becomes a pivot path if it is marked
    `network: true` (used for the shared grid-control/SCADA plane between
    power stations and substations). Everything else -- the leaf sites a
    substation feeds, a generator's fuel line, and so on -- is recorded in
    `effect_edges` for display only.

    `extra_edges` work the same way: kind "network" or "bridge" is a real
    pivot path, kind "effect" is a dependency with no pivot.

    `neighbors[nid]` is revealed by a level-2 (map links) scan of nid.
    `deep_neighbors[nid]` is revealed only by a level-3 (deep) scan of
    nid -- this is where hidden nodes (feeder lines, backup generators)
    surface.
    """
    nodes = sc["nodes_by_id"]
    neighbors = {nid: set() for nid in nodes}
    effect_edges = set()
    for nid, n in nodes.items():
        for group in n.get("needs", []):
            for src in group.get("sources", []):
                if src not in nodes:
                    continue
                if group.get("network"):
                    neighbors[nid].add(src)
                    neighbors[src].add(nid)
                else:
                    effect_edges.add((src, nid))  # (source, dependent)
    for edge in sc.get("extra_edges", []):
        a, b = edge.get("from"), edge.get("to")
        if a not in nodes or b not in nodes:
            continue
        if edge.get("kind") == "effect":
            effect_edges.add((a, b))  # (source, dependent), as written
        else:
            neighbors[a].add(b)
            neighbors[b].add(a)

    deep_neighbors = {nid: set() for nid in nodes}
    for nid, n in nodes.items():
        if n.get("hidden") and n.get("discoverable_from") in nodes:
            parent = n["discoverable_from"]
            deep_neighbors[parent].add(nid)

    for nid in list(neighbors):
        neighbors[nid] -= {h for h in nodes if nodes[h].get("hidden")}

    sc["neighbors"] = {k: sorted(v) for k, v in neighbors.items()}
    sc["deep_neighbors"] = {k: sorted(v) for k, v in deep_neighbors.items()}
    sc["effect_edges"] = sorted(effect_edges)


def _validate(sc):
    errors = []
    nodes = sc["nodes_by_id"]
    for nid, n in nodes.items():
        for req in n["needs"]:
            for src in req["sources"]:
                if src not in nodes:
                    errors.append(f"{nid}: unknown source {src}")
        if "service" in n and n["service"] not in sc["services"]:
            errors.append(f"{nid}: unknown service {n['service']}")
        for cid in n["cards"]:
            if cid not in sc["cards"]:
                errors.append(f"{nid}: unknown card {cid}")
        b = n.get("backup")
        if b:
            for key in ("node", "refuel"):
                if b.get(key) and b[key] not in nodes:
                    errors.append(f"{nid}: unknown backup {key} {b[key]}")
        if n["hidden"] and n.get("discoverable_from") not in nodes:
            errors.append(f"{nid}: hidden node needs a valid discoverable_from")
    for cid, card in sc["cards"].items():
        for eff in card["effects"]:
            if eff["type"] not in EFFECT_TYPES:
                errors.append(f"{cid}: unknown effect type {eff['type']}")
            target = eff.get("node")
            if target not in (None, "self") and target not in nodes:
                errors.append(f"{cid}: effect targets unknown node {target}")
            for choice in eff.get("choices", []):
                if choice not in nodes:
                    errors.append(f"{cid}: unknown choice {choice}")
    for sheet in sc["sheets"]:
        if sheet["matches"] not in sc["services"]:
            errors.append(f"sheet {sheet['id']}: unknown service {sheet['matches']}")
    for edge in sc["extra_edges"]:
        if edge["from"] not in nodes or edge["to"] not in nodes:
            errors.append(f"extra edge {edge} names an unknown node")
    objectives = [n for n in nodes.values() if n["type"] == "objective"]
    if len(objectives) != 1:
        errors.append("scenario needs exactly one node of type objective")
    for needed in ("airdef", "air_base"):
        if needed not in nodes:
            errors.append(f"scenario needs a node called {needed}")
    entry = sc.get("entry_node")
    if entry not in nodes:
        errors.append("scenario needs entry_node to name a real node id")
    elif nodes[entry].get("hidden"):
        errors.append("entry_node cannot be a hidden node")
    if errors:
        raise ValueError("Scenario problems:\n  " + "\n  ".join(errors))
