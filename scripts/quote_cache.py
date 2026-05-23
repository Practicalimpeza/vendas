from __future__ import annotations

from collections.abc import Callable
import sqlite3
import threading
import time

from app_config import active_tenant
from replenishment_v2 import api_replenishment_v2


_QUOTE_REPLENISHMENT_CACHE: dict[tuple, dict] = {}
_API_PAYLOAD_CACHE: dict[tuple, dict] = {}
_QUOTE_CACHE_TTL_SECONDS = 45.0
_API_CACHE_TTL_SECONDS = 45.0
_CACHE_LOCK = threading.RLock()
_CACHE_VERSION = 0


def _database_path(conn: sqlite3.Connection) -> str:
    db_info = conn.execute("PRAGMA database_list").fetchone()
    return (db_info["file"] if isinstance(db_info, sqlite3.Row) else db_info[2]) or ":memory:"


def _freeze(value: object) -> object:
    if isinstance(value, dict):
        items = []
        for key, val in sorted(value.items(), key=lambda item: str(item[0])):
            if key == "label":
                continue
            if key == "period_days":
                val = str(val or "")
            items.append((str(key), _freeze(val)))
        return tuple(items)
    if isinstance(value, (list, tuple)):
        return tuple(_freeze(item) for item in value)
    if isinstance(value, set):
        return tuple(sorted(_freeze(item) for item in value))
    return value


def _period_cache_key(period: dict | None) -> object:
    if not period:
        return (("period_days", "all"),)
    if period.get("period_days") == "all" and not period.get("date_from") and not period.get("date_to"):
        return (("period_days", "all"),)
    return (
        ("date_from", period.get("date_from") or ""),
        ("date_to", period.get("date_to") or ""),
        ("period_days", str(period.get("period_days") or "")),
    )


def replenishment_v2_full_payload(conn: sqlite3.Connection, period: dict | None = None) -> dict:
    db_path = _database_path(conn)
    key = (active_tenant(), db_path, "replenishment_v2_full", _period_cache_key(period))
    now = time.monotonic()
    with _CACHE_LOCK:
        cache_version = _CACHE_VERSION
        cached = _QUOTE_REPLENISHMENT_CACHE.get(key)
        if cached and now - cached["created_at"] <= _QUOTE_CACHE_TTL_SECONDS:
            return cached["payload"]
    payload = api_replenishment_v2(conn, limit=0, period=period)
    with _CACHE_LOCK:
        if cache_version == _CACHE_VERSION:
            _QUOTE_REPLENISHMENT_CACHE.clear()
            _QUOTE_REPLENISHMENT_CACHE[key] = {"created_at": now, "payload": payload}
    return payload


def replenishment_v2_payload(conn: sqlite3.Connection, limit: int = 300, period: dict | None = None) -> dict:
    payload = replenishment_v2_full_payload(conn, period)
    if not limit:
        return payload
    return {**payload, "rows": payload.get("rows", [])[:limit]}


def quote_replenishment_payload(conn: sqlite3.Connection) -> dict:
    return replenishment_v2_full_payload(conn)


def invalidate_quote_replenishment_cache() -> None:
    global _CACHE_VERSION
    with _CACHE_LOCK:
        _CACHE_VERSION += 1
        _QUOTE_REPLENISHMENT_CACHE.clear()


def cached_api_payload(
    conn: sqlite3.Connection,
    namespace: str,
    params: object,
    factory: Callable[[], object],
    ttl_seconds: float = _API_CACHE_TTL_SECONDS,
) -> object:
    key = (active_tenant(), _database_path(conn), namespace, _freeze(params))
    now = time.monotonic()
    with _CACHE_LOCK:
        cache_version = _CACHE_VERSION
        cached = _API_PAYLOAD_CACHE.get(key)
        if cached and now - cached["created_at"] <= ttl_seconds:
            return cached["payload"]
    payload = factory()
    with _CACHE_LOCK:
        if cache_version == _CACHE_VERSION:
            _API_PAYLOAD_CACHE[key] = {"created_at": now, "payload": payload}
    return payload


def invalidate_api_payload_cache() -> None:
    global _CACHE_VERSION
    with _CACHE_LOCK:
        _CACHE_VERSION += 1
        _API_PAYLOAD_CACHE.clear()


def invalidate_runtime_caches() -> None:
    global _CACHE_VERSION
    with _CACHE_LOCK:
        _CACHE_VERSION += 1
        _QUOTE_REPLENISHMENT_CACHE.clear()
        _API_PAYLOAD_CACHE.clear()
