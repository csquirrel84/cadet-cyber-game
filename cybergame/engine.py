"""Generic turn-based graph game engine.

This module has no knowledge of what a "node" represents. It only knows
about a dependency graph, counters, timed flags, two shared meters, and a
dice-roll outcome table. All subject-matter content (what a node is called,
what an action does narratively) lives in the scenario YAML file, not here.
"""
import random
import time

TIER_NAMES = {1: "fumble", 2: "weak", 3: "partial", 4: "success", 5: "clean", 6: "critical"}
NOISE_DELTA_BY_TIER = {1: 2, 2: 1, 3: 0, 4: 0, 5: -1, 6: -1}


class GameError(Exception):
    """A rule was broken. The message is safe to show players."""


class Game:
    """Holds all mutable state for one session of a scenario."""

    def __init__(self, scenario, now_fn=time.monotonic, rng=None):
        self.sc = scenario
        self.nodes = scenario["nodes_by_id"]
        self.cards = scenario["cards"]
        self.now_fn = now_fn
        self.rng = rng or random.SystemRandom()
        self.reset()

    # ------------------------------------------------------------- lifecycle

    def reset(self):
        self.started = False
        self.t0 = 0.0
        self.time_offset = 0.0

        self.known_level = {}
        self.visible = set()
        self.flags = {}
        self.counters = {nid: dict(n.get("counters", {})) for nid, n in self.nodes.items()}
        self.disabled_until = {}
        self.pinned = set()
        self.patched_cards = set()

        self.noise = 0
        self.trace = 0
        self.last_decay_minute = 0.0

        self.collateral_points = 0
        self.notes = []
        self.log = []

        self.pending_roll = None
        self.last_result = None
        self.outcome = None

    def start(self):
        if self.started:
            raise GameError("Already started.")
        self.started = True
        self.t0 = self.now_fn()
        self.visible.add(self.sc["entry_node"])
        self._log("started")

    # ------------------------------------------------------------------ time

    def minutes(self):
        if not self.started:
            return 0.0
        elapsed = (self.now_fn() - self.t0) / 60.0
        return elapsed + self.time_offset

    def phase(self):
        now = self.minutes()
        current = self.sc["phases"][0]
        for p in self.sc["phases"]:
            if now >= p["start"]:
                current = p
        return current

    # --------------------------------------------------------------- queries

    def node(self, node_id):
        if node_id not in self.nodes:
            raise GameError(f"No such node: {node_id}")
        return self.nodes[node_id]

    def is_known(self, node_id, level=1):
        return self.known_level.get(node_id, 0) >= level

    def is_visible(self, node_id):
        return node_id in self.visible

    def reveal_all(self):
        """DM override: put every asset on the map, fully identified, as if
        the team had pivoted to and mapped every site themselves. Used for
        a 'show everything' button on the DM console -- not something the
        team can trigger."""
        if not self.started:
            raise GameError("Game has not started.")
        self.visible = set(self.nodes.keys())
        for nid in self.nodes:
            self.known_level[nid] = max(self.known_level.get(nid, 0), 2)
        self._log("dm:reveal_all")

    def _reveal_neighbors(self, node_id, level):
        if level >= 2:
            self.visible.update(self.sc["neighbors"].get(node_id, []))
        if level >= 3:
            self.visible.update(self.sc["deep_neighbors"].get(node_id, []))

    def node_flags(self, node_id):
        return self.flags.get(node_id, {})

    def has_flag(self, node_id, name):
        now = self.minutes()
        exp = self.node_flags(node_id).get(name)
        if exp is None:
            return False
        return exp is True or exp > now

    def is_disabled(self, node_id):
        until = self.disabled_until.get(node_id)
        return until is not None and (until is True or until > self.minutes())

    def is_up(self, node_id, _seen=None):
        """A node is up if it is not disabled/pinned-down and every one of
        its need-groups has at least one up source (power-type sourcing),
        or it has no needs at all."""
        _seen = _seen or set()
        if node_id in _seen:
            return True
        _seen = _seen | {node_id}

        if self.is_disabled(node_id):
            return False
        n = self.node(node_id)
        for group in n.get("needs", []):
            grace = group.get("grace_minutes", 0)
            sources_up = any(self.is_up(src, _seen) for src in group["sources"])
            if not sources_up:
                first_down = self._first_down_time(group["sources"])
                if first_down is None or self.minutes() - first_down >= grace:
                    return False
        return True

    def _first_down_time(self, source_ids):
        """Earliest minute any of these sources went down, for grace periods."""
        times = []
        for sid in source_ids:
            t = self.disabled_since.get(sid) if hasattr(self, "disabled_since") else None
            if t is not None:
                times.append(t)
        return min(times) if times else self.minutes()

    def is_neutralised(self, node_id):
        n = self.node(node_id)
        rules = n.get("neutralised_when", [])
        if not rules:
            return not self.is_up(node_id)
        for rule in rules:
            if self._check_rule(node_id, rule):
                return True
        return False

    def _check_rule(self, node_id, rule):
        if rule.startswith("all:"):
            parts = rule[4:].split("&")
            return all(self._check_rule(node_id, p) for p in parts)
        if rule == "down":
            return not self.is_up(node_id)
        if rule.startswith("flag:"):
            return self.has_flag(node_id, rule.split(":", 1)[1])
        if rule.startswith("counter:"):
            body = rule.split(":", 1)[1]
            name, op, val = self._split_counter_expr(body)
            current = self.counters.get(node_id, {}).get(name, 0)
            return self._compare(current, op, val)
        if rule.startswith("node:"):
            _, other_id, rest = rule.split(":", 2)
            return self._check_rule(other_id, rest)
        return False

    @staticmethod
    def _split_counter_expr(body):
        for op in ("<=", ">=", "==", "<", ">"):
            if op in body:
                name, val = body.split(op, 1)
                return name, op, int(val)
        raise GameError(f"Bad counter expression: {body}")

    @staticmethod
    def _compare(current, op, val):
        return {
            "<=": current <= val, ">=": current >= val, "==": current == val,
            "<": current < val, ">": current > val,
        }[op]

    # ----------------------------------------------------------------- dice

    def roll(self):
        """Roll a six-sided die using the OS random source."""
        return self.rng.randint(1, 6)

    def tier_for(self, roll_value):
        return TIER_NAMES[roll_value]

    # -------------------------------------------------------------- actions

    def available_cards(self, node_id):
        n = self.node(node_id)
        out = []
        for cid in n.get("cards", []):
            if cid in self.patched_cards:
                continue
            card = self.cards[cid]
            if card.get("burn") and (node_id, cid) in self._used_once():
                continue
            out.append(card)
        return out

    def _used_once(self):
        return getattr(self, "burned", set())

    def play_card(self, node_id, card_id, roll_value, modifier=0, confirmed=False):
        """Resolve a card against a node for a given die roll.

        Returns a result dict describing what happened, for the caller to
        render. Does not itself decide right or wrong, narratively -- that
        judgement is entirely in the scenario's own flavour text and in
        whoever is running the session.
        """
        if not self.started:
            raise GameError("Game has not started.")
        if not self.is_visible(node_id):
            raise GameError("That target has not been pivoted to yet.")
        if card_id in self.patched_cards:
            raise GameError("This method has already been countered.")
        card = self.cards.get(card_id)
        if card is None:
            raise GameError(f"No such card: {card_id}")
        if card_id not in self.node(node_id).get("cards", []):
            raise GameError("That card is not available at this node.")
        if card.get("confirm") and not confirmed:
            raise GameError("needs_confirmation")

        total = max(1, min(6, roll_value + modifier))
        tier = self.tier_for(total)
        noise_delta = card.get("noise", 0) + NOISE_DELTA_BY_TIER[total]
        trace_delta = card.get("trace", 0)

        applied = tier in ("success", "clean", "critical")
        partial = tier == "partial"

        self._apply_meter("noise", max(0, noise_delta))
        self._apply_meter("trace", max(0, trace_delta))

        result = {
            "node": node_id, "card": card_id, "roll": roll_value,
            "modifier": modifier, "total": total, "tier": tier,
            "applied": applied, "partial": partial,
            "noise": self.noise, "trace": self.trace,
        }

        if applied:
            self._run_effects(node_id, card.get("effects", []), full_strength=(tier != "partial"))
            self.collateral_points += card.get("collateral", 0)
            if card.get("burn"):
                self.burned = self._used_once() | {(node_id, card_id)}
                self.patched_cards.add(card_id)
        elif partial:
            self._run_effects(node_id, card.get("effects", []), full_strength=False)
            self.collateral_points += card.get("collateral", 0) // 2

        result["collateral"] = self.collateral_points

        if tier == "critical":
            result["bonus"] = "zero_day"
        if tier == "fumble":
            result["note"] = "exposed"

        self.last_result = result
        self._log(f"{node_id}:{card_id}:{tier}")
        return result

    def scan(self, node_id, level, roll_value, modifier=0):
        """A recon action. Level 1=identify, 2=map, 3=deep. Raises known_level."""
        if not self.started:
            raise GameError("Game has not started.")
        self.node(node_id)  # raises GameError if unknown
        if not self.is_visible(node_id):
            raise GameError("That target has not been pivoted to yet.")
        total = max(1, min(6, roll_value + modifier))
        tier = self.tier_for(total)
        base_noise = {1: 0, 2: 1, 3: 3}[level]
        base_trace = {1: 0, 2: 1, 3: 2}[level]
        self._apply_meter("noise", max(0, base_noise + NOISE_DELTA_BY_TIER[total]))
        self._apply_meter("trace", max(0, base_trace))

        if tier in ("fumble", "weak"):
            gained = 0
        elif tier == "partial":
            gained = max(1, level - 1)
        else:
            gained = level
        newly_visible = []
        if gained:
            self.known_level[node_id] = max(self.known_level.get(node_id, 0), gained)
            before = set(self.visible)
            self._reveal_neighbors(node_id, gained)
            newly_visible = sorted(self.visible - before)
        result = {"node": node_id, "level": level, "roll": roll_value,
                  "total": total, "tier": tier, "gained": gained,
                  "newly_visible": newly_visible,
                  "noise": self.noise, "trace": self.trace}
        if tier == "critical" and level >= 2:
            result["bonus"] = "zero_day"
        self.last_result = result
        self._log(f"scan:{node_id}:{level}:{tier}")
        return result

    # -------------------------------------------------------------- effects

    def _run_effects(self, node_id, effects, full_strength=True):
        for eff in effects:
            target = node_id if eff.get("node") in (None, "self") else eff["node"]
            kind = eff["type"]
            if kind == "disable":
                self._disable(target, eff.get("duration") if full_strength else max(1, eff.get("duration", 2) // 2))
            elif kind == "flag":
                self._set_flag(target, eff["name"], eff.get("duration") if full_strength else None)
            elif kind == "counter":
                delta = eff.get("delta", 0)
                self.counters.setdefault(target, {})
                self.counters[target][eff["name"]] = self.counters[target].get(eff["name"], 0) + delta
            elif kind == "noise":
                self._apply_meter("noise", eff.get("delta", 0))
            elif kind == "trace":
                self._apply_meter("trace", eff.get("delta", 0))
            elif kind == "pin":
                self.pinned.add(target)
            elif kind == "hint":
                self.notes.append(eff.get("text", ""))
            elif kind == "random_disable":
                choice = self.rng.choice(eff["choices"])
                self._disable(choice, eff.get("duration"))
                if self.node(choice).get("protected"):
                    self.collateral_points += self.node(choice).get("penalty", 0)
            if self.node(target).get("protected") and kind in ("disable", "flag"):
                self.collateral_points += self.node(target).get("penalty", 0)

    def _disable(self, node_id, duration_minutes):
        if duration_minutes is None:
            self.disabled_until[node_id] = True
        else:
            self.disabled_until[node_id] = self.minutes() + duration_minutes
        if not hasattr(self, "disabled_since"):
            self.disabled_since = {}
        self.disabled_since[node_id] = self.minutes()

    def _set_flag(self, node_id, name, duration_minutes):
        self.flags.setdefault(node_id, {})
        if duration_minutes is None:
            self.flags[node_id][name] = True
        else:
            self.flags[node_id][name] = self.minutes() + duration_minutes

    def _apply_meter(self, which, delta):
        current = getattr(self, which)
        setattr(self, which, max(0, current + delta))

    def decay_noise(self):
        cfg = self.sc["meters"]["noise"]
        every = cfg.get("decay_every_min", 0)
        if every <= 0:
            return
        now = self.minutes()
        while now - self.last_decay_minute >= every:
            self.last_decay_minute += every
            self.noise = max(0, self.noise - 1)

    # ------------------------------------------------------------------ log

    def _log(self, text):
        self.log.append({"t": round(self.minutes(), 2), "text": text})

    # --------------------------------------------------------------- status

    def meter_status(self):
        self.decay_noise()
        ncfg = self.sc["meters"]["noise"]
        tcfg = self.sc["meters"]["trace"]
        return {
            "noise": self.noise, "noise_warn": ncfg["warn"], "noise_lockdown": ncfg["lockdown"],
            "trace": self.trace, "trace_warn": tcfg["warn"], "trace_attributed": tcfg["attributed"],
            "locked_down": self.noise >= ncfg["lockdown"],
            "attributed": self.trace >= tcfg["attributed"],
        }
