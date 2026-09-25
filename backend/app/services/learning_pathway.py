"""Learning pathway computed against the SAP HANA Cloud skills graph.

The graph is seeded from ``app.mocks.hana_fixtures`` and created by
``scripts/init_hana_schema.sql``. When SAP HANA Cloud cannot answer, the same
weighted graph is walked locally so the candidate still receives a route, but
the response is then labelled ``simulated`` instead of ``live``.
"""

import logging
from collections.abc import Mapping
from heapq import heappop, heappush
from importlib import import_module
from types import ModuleType
from typing import Any, Literal

from pydantic import JsonValue

from app.config import Settings
from app.mocks.hana_fixtures import ROLE_TARGET_SKILL, SKILL_EDGES, SKILL_NODES
from app.models import RouteLeg, RouteResponse
from app.services import hana_client

logger = logging.getLogger(__name__)


def _cheapest_edges() -> dict[tuple[int, int], int]:
    cheapest: dict[tuple[int, int], int] = {}
    for source, target, hours in SKILL_EDGES:
        pair = (source, target)
        current = cheapest.get(pair)
        if current is None or hours < current:
            cheapest[pair] = hours
    return cheapest


def _build_adjacency(edge_hours: Mapping[tuple[int, int], int]) -> dict[int, list[tuple[int, int]]]:
    adjacency: dict[int, list[tuple[int, int]]] = {node_id: [] for node_id in SKILL_NAMES}
    for (source, target), hours in sorted(edge_hours.items()):
        adjacency[source].append((target, hours))
    return adjacency


GRAPH_MAX_DEPTH = 6
SKILL_IDS: dict[str, int] = {name: node_id for node_id, name in SKILL_NODES}
SKILL_NAMES: dict[int, str] = {node_id: name for node_id, name in SKILL_NODES}
EDGE_HOURS: dict[tuple[int, int], int] = _cheapest_edges()
ADJACENCY: dict[int, list[tuple[int, int]]] = _build_adjacency(EDGE_HOURS)

LEAST_HOURS_PATH_SQL = f"""
WITH LEG_PATH (NODE_ID, LEG_HOURS, PREV_HOURS, PATH_IDS, DEPTH) AS (
    SELECT n.ID, 0, 0, CAST(n.ID AS VARCHAR(64)), 0
      FROM SKILLS_GRAPH.SKILLS_NODES n
     WHERE n.NAME = :from_skill
    UNION ALL
    SELECT e.TARGET, p.LEG_HOURS + e.HOURS, p.LEG_HOURS,
           CONCAT(p.PATH_IDS, ',', e.TARGET), p.DEPTH + 1
      FROM LEG_PATH p
      JOIN SKILLS_GRAPH.SKILLS_EDGES e ON e.SOURCE = p.NODE_ID
     WHERE p.DEPTH < {GRAPH_MAX_DEPTH}
       AND INSTR(',' || p.PATH_IDS || ',',
                 ',' || CAST(e.TARGET AS VARCHAR(64)) || ',') = 0
),
BEST_PATH AS (
    SELECT FIRST_VALUE(PATH_IDS) OVER (ORDER BY LEG_HOURS ASC, PATH_IDS ASC) AS PATH_IDS
      FROM LEG_PATH p
      JOIN SKILLS_GRAPH.SKILLS_NODES t ON t.ID = p.NODE_ID
     WHERE t.NAME = :target_skill
)
SELECT t.NAME AS SKILL, p.LEG_HOURS - p.PREV_HOURS AS HOURS
  FROM LEG_PATH p
  JOIN BEST_PATH b ON b.PATH_IDS = p.PATH_IDS
  JOIN SKILLS_GRAPH.SKILLS_NODES t ON t.ID = p.NODE_ID
 ORDER BY p.DEPTH ASC
"""


def route(
    settings: Settings,
    from_skill: str,
    target_role: str,
    hours_per_week: int,
) -> RouteResponse:
    start_id = _skill_id(from_skill)
    terminal_id = _terminal_skill_id(target_role)
    if start_id == terminal_id:
        raise ValueError(
            f"from_skill {from_skill!r} is already the terminal skill for target_role "
            f"{target_role!r}, so there is no upskilling bridge to plan"
        )
    canonical_start = SKILL_NAMES[start_id]
    legs = _live_legs(settings, canonical_start, SKILL_NAMES[terminal_id])
    source: Literal["live", "simulated"] = "simulated"
    if legs is None:
        legs = _local_legs(start_id, terminal_id)
    else:
        source = "live"
    total_hours = sum(leg.hours for leg in legs)
    return RouteResponse(
        legs=legs,
        total_hours=total_hours,
        paid_bridge=_paid_bridge(target_role, terminal_id),
        source=source,
        from_skill=canonical_start,
        target_role=target_role,
        hours_per_week=hours_per_week,
        weeks=round(total_hours / hours_per_week, 1),
    )


def _local_legs(start_id: int, terminal_id: int) -> list[RouteLeg]:
    path = _shortest_path(start_id, terminal_id)
    if path is None:
        raise ValueError(
            f"no skills path from {SKILL_NAMES[start_id]!r} to {SKILL_NAMES[terminal_id]!r}"
        )
    return [
        RouteLeg(
            skill=SKILL_NAMES[node_id],
            hours=0 if index == 0 else EDGE_HOURS[(path[index - 1], node_id)],
        )
        for index, node_id in enumerate(path)
    ]


def _live_legs(settings: Settings, from_skill: str, target_skill: str) -> list[RouteLeg] | None:
    if not hana_client.is_available(settings):
        return None
    try:
        rows = hana_client.run_query(
            settings,
            LEAST_HOURS_PATH_SQL,
            {"from_skill": from_skill, "target_skill": target_skill},
        )
    except Exception:
        logger.warning(
            "SAP HANA Cloud least-hours path query failed; computing the route locally",
            exc_info=True,
        )
        return None
    legs = _coerce_live_legs(rows, from_skill)
    if legs is None:
        logger.warning(
            "SAP HANA Cloud returned an unusable least-hours path; computing the route locally"
        )
    return legs


def _coerce_live_legs(rows: list[dict[str, Any]], from_skill: str) -> list[RouteLeg] | None:
    if len(rows) < 2:
        return None
    legs: list[RouteLeg] = []
    seen: set[str] = set()
    for index, row in enumerate(rows):
        name = row.get("SKILL")
        hours = row.get("HOURS")
        if not isinstance(name, str) or name in seen or name not in SKILL_IDS:
            return None
        if isinstance(hours, bool) or not isinstance(hours, int):
            return None
        if hours < 0 or (index == 0 and hours != 0) or (index > 0 and hours == 0):
            return None
        if index == 0 and name != from_skill:
            return None
        seen.add(name)
        legs.append(RouteLeg(skill=name, hours=hours))
    return legs


def _paid_bridge(target_role: str, terminal_id: int) -> dict[str, JsonValue]:
    return {
        "role": target_role,
        "target_skill": SKILL_NAMES[terminal_id],
        "source": "simulated",
        "basis": "local_fixture",
        "note": (
            "Illustrative bridge to the target role built from the bundled SAP skills "
            "fixture, not a live SAP job posting."
        ),
    }


def _skill_id(name: str) -> int:
    node_id = SKILL_IDS.get(name)
    if node_id is None:
        valid = ", ".join(sorted(SKILL_IDS))
        raise ValueError(f"unknown from_skill {name!r}; valid options: {valid}")
    return node_id


def _terminal_skill_id(target_role: str) -> int:
    terminal_name = ROLE_TARGET_SKILL.get(target_role)
    if terminal_name is None:
        valid = ", ".join(sorted(ROLE_TARGET_SKILL))
        raise ValueError(f"unknown target_role {target_role!r}; valid options: {valid}")
    return SKILL_IDS[terminal_name]


def _shortest_path(start_id: int, terminal_id: int) -> list[int] | None:
    networkx_path = _networkx_path(start_id, terminal_id)
    if networkx_path is not None:
        return networkx_path
    return _dijkstra_path(start_id, terminal_id)


def _networkx_path(start_id: int, terminal_id: int) -> list[int] | None:
    networkx = _load_optional_module("networkx")
    if networkx is None:
        return None
    try:
        graph = networkx.DiGraph()
        graph.add_nodes_from(sorted(SKILL_NAMES))
        graph.add_weighted_edges_from(
            (source, target, hours) for (source, target), hours in EDGE_HOURS.items()
        )
        return _coerce_node_path(graph.shortest_path(start_id, terminal_id, weight="hours"))
    except Exception:
        logger.warning(
            "networkx could not solve the least-hours path; using the built-in Dijkstra",
            exc_info=True,
        )
        return None


def _dijkstra_path(start_id: int, terminal_id: int) -> list[int] | None:
    distances: dict[int, int] = {start_id: 0}
    previous: dict[int, int] = {}
    settled: set[int] = set()
    queue: list[tuple[int, int]] = [(0, start_id)]
    while queue:
        distance, node_id = heappop(queue)
        if node_id in settled:
            continue
        settled.add(node_id)
        if node_id == terminal_id:
            break
        for target, hours in ADJACENCY.get(node_id, ()):
            if target in settled:
                continue
            candidate = distance + hours
            best = distances.get(target)
            if best is None or candidate < best:
                distances[target] = candidate
                previous[target] = node_id
                heappush(queue, (candidate, target))
    if terminal_id not in distances:
        return None
    path = [terminal_id]
    while path[-1] != start_id:
        path.append(previous[path[-1]])
    return list(reversed(path))


def _coerce_node_path(raw_path: object) -> list[int] | None:
    if not isinstance(raw_path, list) or len(raw_path) < 2:
        return None
    path: list[int] = []
    for item in raw_path:
        if isinstance(item, bool) or not isinstance(item, int):
            return None
        path.append(item)
    return path


def _load_optional_module(name: str) -> ModuleType | None:
    try:
        return import_module(name)
    except ImportError:
        logger.debug("optional module %s is not installed", name)
        return None
