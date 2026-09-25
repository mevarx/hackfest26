import asyncio
from collections.abc import Iterator, Mapping
from typing import Any

import pytest

from app.config import Settings
from app.services import hana_client


def live_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "use_mock_hana": False,
        "hana_host": "trial.example.test",
        "hana_port": 443,
        "hana_user": "SYSTEM",
        "hana_password": "super-secret-value",
    }
    values.update(overrides)
    return Settings(**values)


class FakeCursor:
    def __init__(self, connection: "FakeConnection") -> None:
        self._connection = connection
        self._rows: list[tuple[Any, ...]] = []
        self.description: tuple[tuple[str], ...] = tuple((name,) for name in connection.columns)
        self.closed = False

    def execute(self, sql: str, parameters: Mapping[str, Any] | None = None) -> None:
        self._connection.executed.append(sql)
        if self._connection.ping_fails:
            raise RuntimeError("connection is stale")
        self._rows = list(self._connection.rows)

    def fetchall(self) -> list[tuple[Any, ...]]:
        return self._rows

    def close(self) -> None:
        self.closed = True


class FakeConnection:
    def __init__(
        self,
        rows: tuple[tuple[Any, ...], ...] = (),
        columns: tuple[str, ...] = ("SKILL", "HOURS"),
        ping_fails: bool = False,
        reconnect_fails: bool = False,
    ) -> None:
        self.rows = rows
        self.columns = columns
        self.ping_fails = ping_fails
        self.reconnect_fails = reconnect_fails
        self.executed: list[str] = []
        self.reconnect_count = 0
        self.close_count = 0

    def cursor(self) -> FakeCursor:
        return FakeCursor(self)

    def reconnect(self) -> None:
        self.reconnect_count += 1
        if self.reconnect_fails:
            raise RuntimeError("reconnect refused")

    def close(self) -> None:
        self.close_count += 1


class FakeModule:
    def __init__(self, connection: FakeConnection, captured: list[dict[str, Any]]) -> None:
        self._connection = connection
        self._captured = captured

    def connect(self, **kwargs: Any) -> FakeConnection:
        self._captured.append(kwargs)
        if kwargs.get("address") == "unreachable.example.test":
            raise RuntimeError("network unreachable")
        return self._connection


@pytest.fixture(autouse=True)
def _isolated_connection() -> Iterator[None]:
    hana_client.reset_connection()
    yield
    hana_client.reset_connection()


def install_driver(
    monkeypatch: pytest.MonkeyPatch,
    connection: FakeConnection,
    captured: list[dict[str, Any]],
) -> None:
    fake_module = FakeModule(connection, captured)
    monkeypatch.setattr(hana_client, "_load_optional_module", lambda _name: fake_module)


def test_is_available_is_false_when_mock_hana_is_enabled() -> None:
    assert hana_client.is_available(live_settings(use_mock_hana=True)) is False


def test_is_available_is_false_when_hdbcli_is_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(hana_client, "_load_optional_module", lambda _name: None)

    assert hana_client.is_available(live_settings()) is False


@pytest.mark.parametrize(
    "overrides",
    [
        {"hana_host": "   "},
        {"hana_user": ""},
        {"hana_password": ""},
    ],
)
def test_is_available_is_false_when_credentials_are_blank(
    overrides: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_driver(monkeypatch, FakeConnection(), [])

    assert hana_client.is_available(live_settings(**overrides)) is False


def test_is_available_is_true_when_driver_and_credentials_are_present(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_driver(monkeypatch, FakeConnection(), [])

    assert hana_client.is_available(live_settings()) is True


def test_get_connection_keeps_a_healthy_stored_connection(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[dict[str, Any]] = []
    connection = FakeConnection(rows=(("Manual testing", 0), ("QA analytics", 20)))
    install_driver(monkeypatch, connection, captured)
    hana_client.set_connection(connection)

    resolved = hana_client.get_connection(live_settings())

    assert resolved is connection
    assert connection.reconnect_count == 0
    assert connection.executed == ["SELECT 1 FROM DUMMY"]
    assert captured == []


def test_get_connection_reconnects_when_the_ping_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[dict[str, Any]] = []
    connection = FakeConnection(ping_fails=True)
    install_driver(monkeypatch, connection, captured)
    hana_client.set_connection(connection)

    resolved = hana_client.get_connection(live_settings())

    assert resolved is connection
    assert connection.reconnect_count == 1
    assert captured == []


def test_get_connection_raises_when_ping_and_reconnect_both_fail(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[dict[str, Any]] = []
    dead_connection = FakeConnection(ping_fails=True, reconnect_fails=True)
    install_driver(monkeypatch, FakeConnection(), captured)
    hana_client.set_connection(dead_connection)

    with pytest.raises(hana_client.HanaUnavailableError):
        hana_client.get_connection(live_settings())

    assert dead_connection.reconnect_count == 1
    reopened = hana_client.get_connection(live_settings())

    assert isinstance(reopened, FakeConnection)
    assert reopened is not dead_connection
    assert len(captured) == 1


def test_get_connection_raises_when_no_driver_is_installed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(hana_client, "_load_optional_module", lambda _name: None)

    with pytest.raises(hana_client.HanaUnavailableError):
        hana_client.get_connection(live_settings())


def test_get_connection_builds_the_documented_tls_connect_kwargs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[dict[str, Any]] = []
    connection = FakeConnection()
    install_driver(monkeypatch, connection, captured)

    resolved = hana_client.get_connection(live_settings())

    assert resolved is connection
    assert captured == [
        {
            "address": "trial.example.test",
            "port": 443,
            "user": "SYSTEM",
            "password": "super-secret-value",
            "autocommit": True,
            "encrypt": True,
            "validateCertificate": False,
            "connectionTimeout": 8,
        }
    ]
    assert hana_client.HANA_CLOUD_ENCRYPT is True
    assert hana_client.HANA_CLOUD_VALIDATE_CERTIFICATE is False


def test_unreachable_hana_never_leaks_the_password(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: list[dict[str, Any]] = []
    install_driver(monkeypatch, FakeConnection(), captured)
    settings = live_settings(hana_host="unreachable.example.test")

    with pytest.raises(hana_client.HanaUnavailableError) as captured_error:
        hana_client.get_connection(settings)

    message = str(captured_error.value)
    assert "unreachable.example.test" in message
    assert "super-secret-value" not in message
    assert "super-secret-value" not in repr(settings.hana_password)


def test_run_query_maps_result_columns_to_dictionaries(monkeypatch: pytest.MonkeyPatch) -> None:
    connection = FakeConnection(rows=(("Manual testing", 0), ("QA analytics", 20)))
    install_driver(monkeypatch, connection, [])
    hana_client.set_connection(connection)

    rows = hana_client.run_query(live_settings(), "SELECT SKILL, HOURS FROM SKILLS_GRAPH")

    assert rows == [
        {"SKILL": "Manual testing", "HOURS": 0},
        {"SKILL": "QA analytics", "HOURS": 20},
    ]
    assert connection.executed[-1] == "SELECT SKILL, HOURS FROM SKILLS_GRAPH"


def test_run_query_forwards_named_parameters(monkeypatch: pytest.MonkeyPatch) -> None:
    connection = FakeConnection(rows=(("QA analytics", 20),))
    install_driver(monkeypatch, connection, [])
    hana_client.set_connection(connection)

    rows = hana_client.run_query(
        live_settings(),
        "SELECT * FROM SKILLS_GRAPH WHERE NAME = :from_skill",
        {"from_skill": "Manual testing"},
    )

    assert rows == [{"SKILL": "QA analytics", "HOURS": 20}]


def test_run_scalar_returns_the_first_value_of_the_first_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = FakeConnection(rows=((20,),), columns=("TOTAL_HOURS",))
    install_driver(monkeypatch, connection, [])
    hana_client.set_connection(connection)

    assert hana_client.run_scalar(live_settings(), "SELECT 20 FROM DUMMY") == 20

    hana_client.set_connection(FakeConnection(rows=(), columns=("TOTAL_HOURS",)))
    assert hana_client.run_scalar(live_settings(), "SELECT * FROM EMPTY") is None


def test_keep_alive_loop_swallows_connection_errors_and_stops_cleanly(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    delays: list[float] = []
    queries: list[str] = []

    def failing_query(
        _settings: Settings,
        sql: str,
        _parameters: Mapping[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        queries.append(sql)
        raise RuntimeError("connection reset by peer")

    async def sleep_then_cancel(delay: float) -> None:
        delays.append(delay)
        if len(delays) > 2:
            raise asyncio.CancelledError

    monkeypatch.setattr(hana_client, "is_available", lambda _settings: True)
    monkeypatch.setattr(hana_client, "run_query", failing_query)
    settings = live_settings(hana_keep_alive_seconds=600.0)

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(hana_client.keep_alive_loop(settings, sleep=sleep_then_cancel))

    assert delays == [600.0, 600.0, 600.0]
    assert queries == ["SELECT 1 FROM DUMMY", "SELECT 1 FROM DUMMY"]


def test_keep_alive_loop_skips_work_when_hana_is_not_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    def unexpected_query(*_args: object, **_kwargs: object) -> list[dict[str, Any]]:
        calls.append("query")
        return []

    async def sleep_then_cancel(_delay: float) -> None:
        raise asyncio.CancelledError

    monkeypatch.setattr(hana_client, "is_available", lambda _settings: False)
    monkeypatch.setattr(hana_client, "run_query", unexpected_query)

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(hana_client.keep_alive_loop(live_settings(), sleep=sleep_then_cancel))

    assert calls == []
