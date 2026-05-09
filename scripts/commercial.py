from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta

from db_helpers import date_where, one, resolve_period, rows
from replenishment import clamp


def api_customers(conn: sqlite3.Connection, period: dict | None = None) -> list[dict]:
    period = period or resolve_period(conn, {"period_days": "all"})
    product_period_sql, product_params = date_where("sold_at", period, "AND")
    service_period_sql, service_params = date_where("emitted_at", period, "AND")
    return rows(
        conn,
        f"""
        WITH events AS (
            SELECT customer_id, substr(sold_at, 1, 10) AS event_date, gross_amount
            FROM product_sales
            WHERE customer_id IS NOT NULL{product_period_sql}
            UNION ALL
            SELECT customer_id, substr(emitted_at, 1, 10) AS event_date, gross_amount
            FROM service_sales
            WHERE customer_id IS NOT NULL{service_period_sql}
        )
        SELECT
            MIN(c.name) AS name,
            COUNT(*) AS purchases,
            MAX(e.event_date) AS last_purchase,
            ROUND(SUM(e.gross_amount), 2) AS revenue
        FROM events e
        JOIN customers c ON c.id = e.customer_id
        WHERE c.canonical_name <> 'consumidor'
        GROUP BY c.organization_id, c.canonical_name
        HAVING revenue > 0
        ORDER BY revenue DESC
        """,
        (*product_params, *service_params),
    )


def customer_commercial_rows(conn: sqlite3.Connection, period: dict | None = None) -> list[dict]:
    period = period or resolve_period(conn, {"period_days": "all"})
    product_period_sql, product_params = date_where("sold_at", period, "AND")
    service_period_sql, service_params = date_where("emitted_at", period, "AND")
    return rows(
        conn,
        f"""
        WITH all_events AS (
            SELECT
                customer_id,
                substr(sold_at, 1, 10) AS event_date,
                SUM(gross_amount) AS product_revenue,
                0 AS service_revenue
            FROM product_sales
            WHERE customer_id IS NOT NULL{product_period_sql}
            GROUP BY customer_id, substr(sold_at, 1, 10)
            UNION ALL
            SELECT
                customer_id,
                substr(emitted_at, 1, 10) AS event_date,
                0 AS product_revenue,
                SUM(gross_amount) AS service_revenue
            FROM service_sales
            WHERE customer_id IS NOT NULL{service_period_sql}
            GROUP BY customer_id, substr(emitted_at, 1, 10)
        ),
        daily AS (
            SELECT
                customer_id,
                event_date,
                SUM(product_revenue) AS product_revenue,
                SUM(service_revenue) AS service_revenue,
                SUM(product_revenue + service_revenue) AS revenue
            FROM all_events
            GROUP BY customer_id, event_date
        ),
        max_date AS (
            SELECT MAX(event_date) AS max_event_date FROM daily
        )
        SELECT
            MIN(c.id) AS id,
            MIN(c.name) AS name,
            COUNT(DISTINCT d.event_date) AS purchase_days,
            MIN(d.event_date) AS first_purchase,
            MAX(d.event_date) AS last_purchase,
            ROUND(SUM(d.revenue), 2) AS revenue,
            ROUND(SUM(d.product_revenue), 2) AS product_revenue,
            ROUND(SUM(d.service_revenue), 2) AS service_revenue,
            ROUND(SUM(d.revenue) / NULLIF(COUNT(DISTINCT d.event_date), 0), 2) AS avg_ticket,
            ROUND(julianday((SELECT max_event_date FROM max_date)) - julianday(MAX(d.event_date)), 1) AS days_since,
            ROUND(
                CASE
                    WHEN COUNT(DISTINCT d.event_date) > 1
                        THEN (julianday(MAX(d.event_date)) - julianday(MIN(d.event_date))) / (COUNT(DISTINCT d.event_date) - 1)
                    ELSE NULL
                END,
                1
            ) AS avg_gap_days
        FROM daily d
        JOIN customers c ON c.id = d.customer_id
        WHERE c.canonical_name <> 'consumidor'
        GROUP BY c.organization_id, c.canonical_name
        HAVING SUM(d.revenue) > 0
        ORDER BY revenue DESC
        """,
        (*product_params, *service_params),
    )


def classify_customer(row: dict) -> dict:
    revenue = float(row.get("revenue") or 0)
    purchase_days = int(row.get("purchase_days") or 0)
    days_since = float(row.get("days_since") or 0)
    avg_gap = row.get("avg_gap_days")
    avg_gap = float(avg_gap) if avg_gap is not None else None
    expected_gap = avg_gap if avg_gap and avg_gap > 0 else 90.0
    expected_gap = float(clamp(expected_gap, 21, 180))
    due_in = round(expected_gap - days_since, 1)
    overdue_factor = days_since / expected_gap if expected_gap else 0
    frequency_factor = min(1.0, purchase_days / 8.0)
    value_factor = min(1.0, revenue / 5000.0)
    risk_score = int(round(clamp((overdue_factor - 0.75) * 55 + frequency_factor * 25 + value_factor * 20, 0, 100)))
    if purchase_days < 2:
        status = "novo"
        label = "Cliente novo"
        reason = "Ainda nao existe cadencia suficiente para prever recompra."
    elif overdue_factor >= 1.8:
        status = "lost"
        label = "Possivel perda"
        reason = "Passou muito do intervalo medio de recompra."
    elif overdue_factor >= 1.15:
        status = "risk"
        label = "Em risco"
        reason = "Ja passou do intervalo esperado de recompra."
    elif -14 <= due_in <= 14:
        status = "due"
        label = "Recompra proxima"
        reason = "Esta perto da janela normal de nova compra."
    else:
        status = "healthy"
        label = "Em ritmo"
        reason = "Compra recente dentro da cadencia observada."
    row.update(
        {
            "expected_gap_days": round(expected_gap, 1),
            "due_in_days": due_in,
            "risk_score": risk_score,
            "status": status,
            "status_label": label,
            "reason": reason,
            "estimated_next_purchase": (
                datetime.strptime(row["last_purchase"], "%Y-%m-%d").date() + timedelta(days=round(expected_gap))
            ).isoformat()
            if row.get("last_purchase")
            else "",
        }
    )
    return row


def momentum_rows(conn: sqlite3.Connection, level: str, limit: int = 12, period: dict | None = None) -> list[dict]:
    period = period or resolve_period(conn, {"period_days": "all"})
    if level == "brand":
        select_id = "COALESCE(b.id, 'sem_marca') AS entity_id"
        select_name = "COALESCE(b.name, 'Sem marca') AS name"
        join = "JOIN products p ON p.id = s.product_id LEFT JOIN brands b ON b.id = p.brand_id"
        group = "COALESCE(b.id, 'sem_marca'), COALESCE(b.name, 'Sem marca')"
    else:
        select_id = "p.id AS entity_id"
        select_name = "p.name AS name"
        join = "JOIN products p ON p.id = s.product_id"
        group = "p.id, p.name"
    date_ceiling = "date((SELECT max_sold_at FROM max_date))"
    params: tuple = (limit,)
    if period.get("date_to"):
        date_ceiling = "date(?)"
        params = tuple([period["date_to"]] * 6 + [limit])
    return rows(
        conn,
        f"""
        WITH max_date AS (
            SELECT MAX(substr(sold_at, 1, 10)) AS max_sold_at FROM product_sales
        ),
        period AS (
            SELECT
                {select_id},
                {select_name},
                SUM(CASE
                    WHEN substr(s.sold_at, 1, 10) > date({date_ceiling}, '-90 day')
                     AND substr(s.sold_at, 1, 10) <= {date_ceiling}
                    THEN s.gross_amount ELSE 0 END
                ) AS recent_revenue,
                SUM(CASE
                    WHEN substr(s.sold_at, 1, 10) <= date({date_ceiling}, '-90 day')
                     AND substr(s.sold_at, 1, 10) > date({date_ceiling}, '-180 day')
                    THEN s.gross_amount ELSE 0 END
                ) AS previous_revenue,
                SUM(CASE
                    WHEN substr(s.sold_at, 1, 10) > date({date_ceiling}, '-90 day')
                     AND substr(s.sold_at, 1, 10) <= {date_ceiling}
                    THEN s.quantity ELSE 0 END
                ) AS recent_quantity
            FROM product_sales s
            {join}
            GROUP BY {group}
        )
        SELECT
            entity_id,
            name,
            ROUND(recent_revenue, 2) AS recent_revenue,
            ROUND(previous_revenue, 2) AS previous_revenue,
            ROUND(recent_revenue - previous_revenue, 2) AS delta_revenue,
            ROUND(recent_quantity, 2) AS recent_quantity,
            ROUND(
                CASE
                    WHEN previous_revenue > 0 THEN (recent_revenue - previous_revenue) * 100.0 / previous_revenue
                    WHEN recent_revenue > 0 THEN 100.0
                    ELSE 0
                END,
                1
            ) AS trend_pct
        FROM period
        WHERE recent_revenue > 0 OR previous_revenue > 0
        ORDER BY ABS(delta_revenue) DESC
        LIMIT ?
        """,
        params,
    )


def api_commercial_intelligence(conn: sqlite3.Connection, period: dict | None = None) -> dict:
    period = period or resolve_period(conn, {"period_days": "all"})
    customers = [classify_customer(row) for row in customer_commercial_rows(conn, period)]
    total_customers = len(customers)
    total_revenue = round(sum(float(row.get("revenue") or 0) for row in customers), 2)
    risk_customers = [
        row for row in customers if row["status"] in {"risk", "lost"} and int(row.get("purchase_days") or 0) >= 2
    ]
    risk_customers.sort(key=lambda row: (-row["risk_score"], -float(row.get("revenue") or 0)))
    due_customers = [
        row for row in customers if row["status"] == "due" and int(row.get("purchase_days") or 0) >= 2
    ]
    due_customers.sort(key=lambda row: (abs(float(row.get("due_in_days") or 0)), -float(row.get("revenue") or 0)))
    champions = [
        row
        for row in customers
        if row["status"] == "healthy" and int(row.get("purchase_days") or 0) >= 3 and float(row.get("revenue") or 0) > 0
    ][:12]
    product_momentum = momentum_rows(conn, "product", 16, period)
    brand_momentum = momentum_rows(conn, "brand", 12, period)
    growth_products = [row for row in product_momentum if float(row.get("delta_revenue") or 0) > 0]
    drop_products = [row for row in product_momentum if float(row.get("delta_revenue") or 0) < 0]
    last_sale = one(
        conn,
        """
        SELECT MAX(max_date) AS last_sale_date
        FROM (
            SELECT MAX(substr(sold_at, 1, 10)) AS max_date FROM product_sales
            UNION ALL
            SELECT MAX(substr(emitted_at, 1, 10)) AS max_date FROM service_sales
        )
        """,
    ).get("last_sale_date")
    return {
        "contract": "commercial_intelligence.v1",
        "period": period,
        "summary": {
            "customers": total_customers,
            "revenue": total_revenue,
            "at_risk_customers": len(risk_customers),
            "at_risk_revenue": round(sum(float(row.get("revenue") or 0) for row in risk_customers), 2),
            "due_customers": len(due_customers),
            "due_revenue": round(sum(float(row.get("revenue") or 0) for row in due_customers), 2),
            "growth_products": len(growth_products),
            "drop_products": len(drop_products),
            "last_sale_date": last_sale,
            "period_label": period.get("label", ""),
        },
        "risk_customers": risk_customers[:20],
        "repurchase_opportunities": due_customers[:20],
        "champions": champions,
        "product_momentum": product_momentum,
        "brand_momentum": brand_momentum,
        "explanations": [
            {
                "title": "Cliente em risco",
                "body": "Compara os dias desde a ultima compra com a cadencia historica daquele cliente. Se passou muito do padrao dele, entra em risco.",
            },
            {
                "title": "Recompra proxima",
                "body": "Mostra clientes perto da janela esperada de nova compra. E uma acao pequena, boa para contato comercial sem depender de cadastro novo.",
            },
            {
                "title": "Ganho e queda de ritmo",
                "body": "Compara os ultimos 90 dias da base com os 90 dias anteriores, sempre pela data mais recente importada.",
            },
        ],
    }


def api_services(conn: sqlite3.Connection, period: dict | None = None) -> list[dict]:
    period = period or resolve_period(conn, {"period_days": "all"})
    period_sql, params = date_where("ss.emitted_at", period, "WHERE")
    return rows(
        conn,
        f"""
        SELECT
            sv.name,
            ROUND(SUM(ss.quantity), 2) AS quantity,
            ROUND(SUM(ss.gross_amount), 2) AS revenue,
            ROUND(SUM(ss.net_amount), 2) AS net_revenue
        FROM service_sales ss
        JOIN services sv ON sv.id = ss.service_id
        {period_sql}
        GROUP BY sv.id
        HAVING revenue > 0
        ORDER BY revenue DESC
        """,
        params,
    )
