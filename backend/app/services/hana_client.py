"""Thin SAP HANA Cloud wrapper around the optional ``hdbcli`` driver.

The driver is imported lazily so importing this module can never fail, and so a
laptop without the SAP client keeps serving the mock pathway. HANA Cloud trial
instances are reached over TLS: the session is encrypted, and because the trial
instance presents the SAP trial certificate instead of a public root chain, the
certificate check is disabled for that rehearsal instance.
"""

import asyncio
import logging
import threading
from collections.abc import Awaitable, Callable, Mapping
from importlib import import_module
from types import ModuleType
from typing import TYPE_CHECKING, Any, Protocol, cast

from app.config import Settings, hana_is_configured

if TYPE_CHECKING:
    from hdbcli.dbapi import Connection  # type: ignore[import-untyped]

logger = logging.getLogger(__name__)

HANA_DRIVER_MODULE = "hdbcli.dbapi"
HANA_CLOUD_ENCRYPT = True
HANA_CLOUD_VALIDATE_CERTIFICATE = False
KEEP_ALIVE_SQL = "SELECT 1 FROM DUMMY"


class HanaUnavailableError(RuntimeError):
    pass


class HanaConnection(Protocol):
    def cursor(self) -> Any: ...

    def reconnect(self) -> None: ...

    def close(self) -> None: ...


_CONNECTION: HanaConnection | None = None
_CONNECTION_LOCK = threading.Lock()


def is_available(settings: Settings) -> bool:
    if settings.use_mock_hana:
        return False
    if not hana_is_configured(settings):
        return False
    return _load_optional_module(HANA_DRIVER_MODULE) is not None


def get_connection(settings: Settings) -> HanaConnection:
    global _CONNECTION
    with _CONNECTION_LOCK:
        connection = _CONNECTION
        if connection is not None:
            if _ping_succeeds(connection):
                return connection
            logger.warning("stored SAP HANA connection failed its ping; reconnecting")
            try:
                connection.reconnect()
            except Exception as error:
                _CONNECTION = None
                raise HanaUnavailableError(
                    "the stored SAP HANA connection could not be re-established"
                ) from error
            return connection
        opened = _open_connection(settings)
        _CONNECTION = cast("HanaConnection", opened)
        return _CONNECTION


def set_connection(connection: HanaConnection | None) -> None:
    global _CONNECTION
    with _CONNECTION_LOCK:
        _CONNECTION = connection


def reset_connection() -> None:
    set_connection(None)


def close_connection() -> None:
    """Close and forget the cached connection, e.g. on application shutdown."""
    global _CONNECTION
    with _CONNECTION_LOCK:
        connection = _CONNECTION
        _CONNECTION = None
    if connection is None:
        return
    try:
        connection.close()
    except Exception:
        logger.warning("the SAP HANA connection did not close cleanly", exc_info=True)


def run_query(
    settings: Settings,
    sql: str,
    parameters: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    connection = get_connection(settings)
    cursor = connection.cursor()
    try:
        if parameters is None:
            cursor.execute(sql)
        else:
            cursor.execute(sql, parameters)
        rows = cursor.fetchall() or []
        columns = _column_names(cursor)
        return [_row_mapping(columns, row) for row in rows]
    finally:
        _close_quietly(cursor)


def run_scalar(
    settings: Settings,
    sql: str,
    parameters: Mapping[str, Any] | None = None,
) -> Any:
    rows = run_query(settings, sql, parameters)
    if not rows:
        return None
    return next(iter(rows[0].values()), None)


async def keep_alive_loop(
    settings: Settings,
    sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> None:
    """Ping HANA on an interval so the trial instance is not reaped while idle.

    ``run_query`` is a blocking driver call, so it is pushed onto a worker thread:
    awaiting it inline would stall the whole event loop -- every request and every
    WebSocket in the process -- for up to ``hana_query_timeout_seconds``.
    """
    while True:
        await sleep(settings.hana_keep_alive_seconds)
        if not is_available(settings):
            continue
        try:
            await asyncio.to_thread(run_query, settings, KEEP_ALIVE_SQL)
        except HanaUnavailableError:
            logger.warning("SAP HANA keep-alive query failed; the connection is reopened on demand")
        except Exception:
            logger.warning("SAP HANA keep-alive query raised an unexpected error", exc_info=True)


def _open_connection(settings: Settings) -> "Connection":
    module = _load_optional_module(HANA_DRIVER_MODULE)
    connect = getattr(module, "connect", None) if module is not None else None
    if connect is None:
        raise HanaUnavailableError(
            "hdbcli is not installed; install the hdbcli package or keep USE_MOCK_HANA=true"
        )
    try:
        return cast("Connection", connect(**_connect_kwargs(settings)))
    except HanaUnavailableError:
        raise
    except Exception as error:
        raise HanaUnavailableError(
            f"could not connect to SAP HANA Cloud at {settings.hana_host}:{settings.hana_port}"
        ) from error


def _connect_kwargs(settings: Settings) -> dict[str, Any]:
    return {
        "address": settings.hana_host,
        "port": settings.hana_port,
        "user": settings.hana_user,
        "password": settings.hana_password.get_secret_value(),
        "autocommit": True,
        "encrypt": HANA_CLOUD_ENCRYPT,
        "validateCertificate": HANA_CLOUD_VALIDATE_CERTIFICATE,
        "connectionTimeout": int(settings.hana_query_timeout_seconds),
    }


def _ping_succeeds(connection: HanaConnection) -> bool:
    try:
        cursor = connection.cursor()
    except Exception:
        logger.warning("SAP HANA cursor could not be opened for the ping", exc_info=True)
        return False
    try:
        cursor.execute(KEEP_ALIVE_SQL)
        cursor.fetchall()
    except Exception:
        logger.warning("SAP HANA ping query failed", exc_info=True)
        return False
    finally:
        _close_quietly(cursor)
    return True


def _load_optional_module(name: str) -> ModuleType | None:
    try:
        return import_module(name)
    except ImportError:
        logger.debug("optional module %s is not installed", name)
        return None


def _column_names(cursor: Any) -> tuple[str, ...]:
    description = getattr(cursor, "description", None) or ()
    return tuple(str(column[0]) for column in description)


def _row_mapping(columns: tuple[str, ...], row: Any) -> dict[str, Any]:
    if isinstance(row, Mapping):
        return {str(key): value for key, value in row.items()}
    values = list(row)
    return dict(zip(columns, values, strict=False))


def _close_quietly(cursor: Any) -> None:
    try:
        cursor.close()
    except Exception:
        logger.debug("ignoring a SAP HANA cursor close failure", exc_info=True)
