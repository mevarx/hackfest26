from collections.abc import Iterable, Mapping
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.api.learning_pathway import router
from app.config import Settings
from app.mocks.hana_fixtures import ROLE_TARGET_SKILL, SKILL_EDGES, SKILL_NODES
from app.models import RouteResponse
from app.services import hana_client, learning_pathway
from app.services.learning_pathway import route

MOCK_SETTINGS = Settings(use_mock_hana=True)
LIVE_SETTINGS = Settings(
    use_mock_hana=False,
    hana_host="trial.example.test",
    hana_user="SYSTEM",
    hana_password=SecretStr("super-secret-value"),
)
KAVYA_START = "Manual testing"
QA_ANALYST_LEGS = ["API testing", "SQL data validation", "QA analytics"]


class FakeGraph:
    def __init__(self, path: list[object]) -> None:
        self.path = path
        self.nodes: list[object] = []
        self.edges: list[tuple[object, object, object]] = []

    def add_nodes_from(self, nodes: Iterable[object]) -> None:
        self.nodes.extend(nodes)

    def add_weighted_edges_from(self, edges: Iterable[tuple[object, object, object]]) -> None:
        self.edges.extend(edges)

    def shortest_path(
        self,
        source: object,
        target: object,
        weight: str | None = None,
    ) -> list[object]:
        return list(self.path)


class FakeNetworkX:
    def __init__(self, path: list[object]) -> None:
        self.path = path
        self.graphs: list[FakeGraph] = []

    def DiGraph(self) -> FakeGraph:
        graph = FakeGraph(self.path)
        self.graphs.append(graph)
        return graph


def build_client() -> TestClient:
    application = FastAPI()
    application.state.settings = MOCK_SETTINGS
    application.include_router(router)
    return TestClient(application)


def fake_available(_settings: Settings) -> bool:
    return True


def edge_hours(source: str, target: str) -> int:
    source_id = dict((name, node_id) for node_id, name in SKILL_NODES)[source]
    target_id = dict((name, node_id) for node_id, name in SKILL_NODES)[target]
    return learning_pathway.EDGE_HOURS[(source_id, target_id)]


def test_mock_route_is_deterministic_and_fully_validated() -> None:
    first = route(MOCK_SETTINGS, KAVYA_START, "qa-analyst", 10)
    second = route(MOCK_SETTINGS, KAVYA_START, "qa-analyst", 10)

    assert first == second
    assert isinstance(first, RouteResponse)
    assert first.source == "simulated"
    assert first.from_skill == KAVYA_START
    assert first.target_role == "qa-analyst"
    assert first.hours_per_week == 10
    assert [leg.skill for leg in first.legs] == [KAVYA_START, *QA_ANALYST_LEGS]
    assert first.legs[0].hours == 0
    assert first.total_hours == sum(leg.hours for leg in first.legs)
    assert first.total_hours == 70
    assert first.weeks == 7.0
    assert first.weeks == round(first.total_hours / first.hours_per_week, 1)


def test_mock_route_legs_are_ordered_source_to_target() -> None:
    response = route(MOCK_SETTINGS, KAVYA_START, "qa-analyst", 10)
    skills = [leg.skill for leg in response.legs]

    assert skills[0] == KAVYA_START
    assert skills[-1] == "QA analytics"
    for index, current in enumerate(response.legs[1:], start=1):
        assert current.hours == edge_hours(skills[index - 1], current.skill)
    assert [leg.hours for leg in response.legs] == [0, 25, 25, 20]


@pytest.mark.parametrize("hours_per_week", [1, 5, 20, 40])
def test_weeks_always_follow_hours_per_week(hours_per_week: int) -> None:
    response = route(MOCK_SETTINGS, KAVYA_START, "qa-analyst", hours_per_week)

    assert response.weeks == round(response.total_hours / hours_per_week, 1)
    assert response.weeks > 0


def test_every_seeded_role_is_reachable_from_every_seeded_skill() -> None:
    for _, skill in SKILL_NODES:
        for role in ROLE_TARGET_SKILL:
            if skill == ROLE_TARGET_SKILL[role]:
                continue
            response = route(MOCK_SETTINGS, skill, role, 10)

            assert response.legs[0].skill == skill
            assert response.legs[-1].skill == ROLE_TARGET_SKILL[role]
            assert response.total_hours == sum(leg.hours for leg in response.legs)
            assert response.weeks > 0


def test_paid_bridge_is_labelled_as_a_local_fixture() -> None:
    response = route(MOCK_SETTINGS, KAVYA_START, "qa-analyst", 10)

    assert response.paid_bridge is not None
    assert response.paid_bridge["role"] == "qa-analyst"
    assert response.paid_bridge["target_skill"] == "QA analytics"
    assert response.paid_bridge["source"] == "simulated"
    assert response.paid_bridge["basis"] == "local_fixture"


def test_unknown_skill_lists_the_valid_options() -> None:
    with pytest.raises(ValueError) as error:
        route(MOCK_SETTINGS, "quantum testing", "qa-analyst", 10)

    message = str(error.value)
    assert "unknown from_skill" in message
    assert "qa-analyst" not in message
    for _, name in SKILL_NODES:
        assert name in message


def test_unknown_role_lists_the_valid_options() -> None:
    with pytest.raises(ValueError) as error:
        route(MOCK_SETTINGS, KAVYA_START, "astrologer", 10)

    message = str(error.value)
    assert "unknown target_role" in message
    for role in ROLE_TARGET_SKILL:
        assert role in message


def test_terminal_skill_cannot_be_planned_as_a_bridge() -> None:
    with pytest.raises(ValueError) as error:
        route(MOCK_SETTINGS, "QA analytics", "qa-analyst", 10)

    assert "no upskilling bridge" in str(error.value)


def test_unavailable_hana_falls_back_to_the_local_graph(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(hana_client, "is_available", lambda _settings: False)
    monkeypatch.setattr(
        hana_client,
        "run_query",
        lambda *_args, **_kwargs: pytest.fail("HANA must not be queried when it is unavailable"),
    )

    response = route(LIVE_SETTINGS, KAVYA_START, "qa-analyst", 10)

    assert response.source == "simulated"
    assert response.total_hours == 70


def test_failed_live_query_falls_back_to_simulated(monkeypatch: pytest.MonkeyPatch) -> None:
    def explode(*_args: object, **_kwargs: object) -> list[dict[str, Any]]:
        raise RuntimeError("SAP HANA Cloud trial instance is not reachable")

    monkeypatch.setattr(hana_client, "is_available", fake_available)
    monkeypatch.setattr(hana_client, "run_query", explode)

    response = route(LIVE_SETTINGS, KAVYA_START, "qa-analyst", 10)
    source: str = response.source

    assert source == "simulated"
    assert source != "live"
    assert [leg.skill for leg in response.legs] == [KAVYA_START, *QA_ANALYST_LEGS]
    assert response.total_hours == 70
    assert response.weeks == 7.0


def test_answered_live_query_is_labelled_live(monkeypatch: pytest.MonkeyPatch) -> None:
    queries: list[tuple[str, Mapping[str, Any] | None]] = []

    def capture_query(
        _settings: Settings,
        sql: str,
        parameters: Mapping[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        queries.append((sql, parameters))
        return [
            {"SKILL": "Manual testing", "HOURS": 0},
            {"SKILL": "Regression testing", "HOURS": 30},
            {"SKILL": "Stakeholder communication", "HOURS": 30},
            {"SKILL": "QA analytics", "HOURS": 18},
        ]

    monkeypatch.setattr(hana_client, "is_available", fake_available)
    monkeypatch.setattr(hana_client, "run_query", capture_query)

    response = route(LIVE_SETTINGS, KAVYA_START, "qa-analyst", 10)

    assert response.source == "live"
    assert response.total_hours == 78
    assert response.weeks == 7.8
    assert response.paid_bridge is not None
    assert response.paid_bridge["source"] == "simulated"
    assert len(queries) == 1
    assert queries[0][0] == learning_pathway.LEAST_HOURS_PATH_SQL
    assert "SKILLS_GRAPH" in queries[0][0]
    assert queries[0][1] == {
        "from_skill": "Manual testing",
        "target_skill": "QA analytics",
    }


@pytest.mark.parametrize(
    "rows",
    [
        [],
        [{"SKILL": "Manual testing", "HOURS": 0}],
        [{"SKILL": "Regression testing", "HOURS": 30}, {"SKILL": "QA analytics", "HOURS": 18}],
        [
            {"SKILL": "Manual testing", "HOURS": 0},
            {"SKILL": "Quantum testing", "HOURS": 30},
        ],
        [
            {"SKILL": "Manual testing", "HOURS": 0},
            {"SKILL": "Regression testing", "HOURS": "thirty"},
        ],
        [
            {"SKILL": "Manual testing", "HOURS": 0},
            {"SKILL": "Regression testing", "HOURS": 0},
        ],
        [
            {"SKILL": "Manual testing", "HOURS": 0},
            {"SKILL": "Regression testing", "HOURS": 30},
            {"SKILL": "Regression testing", "HOURS": 5},
        ],
    ],
)
def test_unusable_live_rows_never_claim_a_live_source(
    rows: list[dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(hana_client, "is_available", fake_available)
    monkeypatch.setattr(hana_client, "run_query", lambda *_args, **_kwargs: rows)

    response = route(LIVE_SETTINGS, KAVYA_START, "qa-analyst", 10)

    assert response.source == "simulated"
    assert response.total_hours == 70


def test_route_endpoint_returns_the_validated_route() -> None:
    with build_client() as client:
        response = client.get(
            "/route",
            params={
                "from_skill": KAVYA_START,
                "target_role": "qa-analyst",
                "hours_per_week": 5,
            },
        )

    payload = response.json()
    assert response.status_code == 200
    assert payload["source"] == "simulated"
    assert payload["total_hours"] == 70
    assert payload["weeks"] == 14.0
    assert [leg["skill"] for leg in payload["legs"]] == [KAVYA_START, *QA_ANALYST_LEGS]
    assert payload["paid_bridge"]["role"] == "qa-analyst"


def test_route_endpoint_defaults_hours_per_week() -> None:
    with build_client() as client:
        response = client.get(
            "/route",
            params={"from_skill": KAVYA_START, "target_role": "qa-analyst"},
        )

    assert response.status_code == 200
    assert response.json()["hours_per_week"] == 10
    assert response.json()["weeks"] == 7.0


def test_route_endpoint_rejects_unknown_skill_and_role() -> None:
    with build_client() as client:
        unknown_skill = client.get(
            "/route",
            params={"from_skill": "quantum testing", "target_role": "qa-analyst"},
        )
        unknown_role = client.get(
            "/route",
            params={"from_skill": KAVYA_START, "target_role": "astrologer"},
        )
        missing_params = client.get("/route")

    assert unknown_skill.status_code == 422
    assert "unknown from_skill" in unknown_skill.json()["detail"]
    assert unknown_role.status_code == 422
    assert "unknown target_role" in unknown_role.json()["detail"]
    assert missing_params.status_code == 422


def test_networkx_is_used_when_it_is_importable(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeNetworkX([1, 3, 5, 7])
    monkeypatch.setattr(learning_pathway, "_load_optional_module", lambda _name: fake)

    start_id = learning_pathway.SKILL_IDS[KAVYA_START]
    terminal_id = learning_pathway.SKILL_IDS["QA analytics"]
    path = learning_pathway._shortest_path(start_id, terminal_id)

    assert path == [1, 3, 5, 7]
    assert len(fake.graphs) == 1
    assert fake.graphs[0].nodes == sorted(learning_pathway.SKILL_NAMES)
    assert fake.graphs[0].edges == [
        (source, target, hours) for (source, target), hours in learning_pathway.EDGE_HOURS.items()
    ]


def test_unusable_networkx_path_falls_back_to_the_builtin_dijkstra(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(learning_pathway, "_load_optional_module", lambda _name: FakeNetworkX([1]))

    start_id = learning_pathway.SKILL_IDS[KAVYA_START]
    terminal_id = learning_pathway.SKILL_IDS["QA analytics"]
    path = learning_pathway._shortest_path(start_id, terminal_id)

    assert path == [1, 3, 5, 7]
    assert learning_pathway._shortest_path(3, 4) == [3, 4]
    assert learning_pathway._shortest_path(6, 1) is not None
    assert learning_pathway._shortest_path(7, 7) == [7]


def test_fixtures_are_a_valid_directed_graph() -> None:
    node_ids = {node_id for node_id, _ in SKILL_NODES}
    names = [name for _, name in SKILL_NODES]

    assert len(node_ids) == len(SKILL_NODES)
    assert len(set(names)) == len(names)
    assert all(
        source in node_ids and target in node_ids and hours > 0
        for source, target, hours in SKILL_EDGES
    )
    assert set(ROLE_TARGET_SKILL.values()) <= set(names)
    assert learning_pathway.GRAPH_MAX_DEPTH >= 1
