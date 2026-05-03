from __future__ import annotations

import sqlite3
from datetime import date, timedelta


def scalar_text(value: object) -> str:
    if isinstance(value, list):
        value = value[0] if value else ""
    return str(value or "").strip()


def parse_decimal(value: object, default: float | None = 0.0) -> float | None:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return default
    normalized = text.replace("R$", "").replace(" ", "")
    if "," in normalized:
        normalized = normalized.replace(".", "").replace(",", ".")
    try:
        return float(normalized)
    except ValueError:
        return default


def parse_int(value: object, default: int | None = None) -> int | None:
    parsed = parse_decimal(value, None)
    if parsed is None:
        return default
    return int(round(parsed))


def rows(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[dict]:
    return [dict(row) for row in conn.execute(sql, params).fetchall()]


def one(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> dict:
    row = conn.execute(sql, params).fetchone()
    return dict(row) if row else {}


def max_activity_date(conn: sqlite3.Connection) -> str:
    return one(
        conn,
        """
        SELECT MAX(max_date) AS max_date
        FROM (
            SELECT MAX(substr(sold_at, 1, 10)) AS max_date FROM product_sales
            UNION ALL
            SELECT MAX(substr(emitted_at, 1, 10)) AS max_date FROM service_sales
        )
        """,
    ).get("max_date") or date.today().isoformat()


def resolve_period(conn: sqlite3.Connection, query: dict | None = None, default_days: int | None = None) -> dict:
    query = query or {}
    raw_days = scalar_text(query.get("period_days"))
    date_to = scalar_text(query.get("date_to"))
    date_from = scalar_text(query.get("date_from"))
    if raw_days == "all":
        return {"date_from": "", "date_to": "", "period_days": "all", "label": "Todo periodo"}
    days = parse_int(raw_days, default_days)
    if not date_to:
        date_to = max_activity_date(conn)
    if days and not date_from:
        date_from = (date.fromisoformat(date_to) - timedelta(days=max(days - 1, 0))).isoformat()
    label = "Periodo selecionado"
    if days:
        label = "Ultimos 6 meses" if days == 180 else f"Ultimos {days} dias"
    return {"date_from": date_from, "date_to": date_to, "period_days": days or "", "label": label}


def date_where(column: str, period: dict, prefix: str = "WHERE") -> tuple[str, tuple]:
    clauses = []
    params = []
    if period.get("date_from"):
        clauses.append(f"substr({column}, 1, 10) >= ?")
        params.append(period["date_from"])
    if period.get("date_to"):
        clauses.append(f"substr({column}, 1, 10) <= ?")
        params.append(period["date_to"])
    if not clauses:
        return "", ()
    return f" {prefix} " + " AND ".join(clauses), tuple(params)