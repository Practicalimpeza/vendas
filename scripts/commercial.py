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
            SELECT customer_id, substr(sold_at, 1, 10) AS event_date, gross_amount, 'product' AS kind
            FROM product_sales
            WHERE customer_id IS NOT NULL{product_period_sql}
            UNION ALL
            SELECT customer_id, substr(emitted_at, 1, 10) AS event_date, gross_amount, 'service' AS kind
            FROM service_sales
            WHERE customer_id IS NOT NULL{service_period_sql}
        ),
        max_date AS (
            SELECT MAX(event_date) AS max_event_date FROM events
        )
        , grouped AS (
            SELECT
                MIN(c.id) AS id,
                c.organization_id,
                MIN(c.name) AS name,
                MIN(c.source_code) AS source_code,
                MIN(c.document) AS document,
                MIN(c.customer_type) AS customer_type,
                COUNT(*) AS purchases,
                COUNT(DISTINCT e.event_date) AS purchase_days,
                MIN(e.event_date) AS first_purchase,
                MAX(e.event_date) AS last_purchase,
                ROUND(SUM(e.gross_amount), 2) AS revenue,
                ROUND(SUM(CASE WHEN e.kind = 'product' THEN e.gross_amount ELSE 0 END), 2) AS product_revenue,
                ROUND(SUM(CASE WHEN e.kind = 'service' THEN e.gross_amount ELSE 0 END), 2) AS service_revenue,
                ROUND(SUM(e.gross_amount) / NULLIF(COUNT(DISTINCT e.event_date), 0), 2) AS avg_ticket,
                ROUND(julianday((SELECT max_event_date FROM max_date)) - julianday(MAX(e.event_date)), 1) AS days_since,
                ROUND(
                    CASE
                        WHEN COUNT(DISTINCT e.event_date) > 1
                            THEN (julianday(MAX(e.event_date)) - julianday(MIN(e.event_date))) / (COUNT(DISTINCT e.event_date) - 1)
                        ELSE NULL
                    END,
                    1
                ) AS avg_gap_days
            FROM events e
            JOIN customers c ON c.id = e.customer_id
            WHERE c.canonical_name <> 'consumidor'
            GROUP BY c.organization_id, c.canonical_name
            HAVING revenue > 0
        )
        SELECT
            g.*,
            COALESCE(crm.owner_name, '') AS crm_owner_name,
            COALESCE(crm.commercial_status, '') AS crm_status,
            COALESCE(crm.priority, '') AS crm_priority,
            COALESCE(crm.next_action, '') AS crm_next_action,
            COALESCE(crm.next_action_at, '') AS crm_next_action_at,
            COALESCE(crm.updated_at, '') AS crm_updated_at
        FROM grouped g
        LEFT JOIN customer_crm_profiles crm
          ON crm.organization_id = g.organization_id
         AND crm.customer_id = g.id
        ORDER BY g.revenue DESC
        """,
        (*product_params, *service_params),
    )


def _customer_relationship(summary: dict) -> dict:
    purchase_days = int(summary.get("purchase_days") or 0)
    last_purchase = summary.get("last_purchase") or ""
    days_since_value = summary.get("days_since")
    days_since = float(days_since_value) if days_since_value is not None else None
    avg_gap = summary.get("avg_gap_days")
    expected_gap = float(avg_gap) if avg_gap is not None and float(avg_gap or 0) > 0 else 90.0
    expected_gap = float(clamp(expected_gap, 21, 180))
    due_in = round(expected_gap - days_since, 1) if days_since is not None else None
    overdue_factor = (days_since / expected_gap) if days_since is not None and expected_gap else 0

    if purchase_days <= 0:
        status = "empty"
        label = "Sem compras no recorte"
        reason = "Nao ha compras desse cliente dentro do periodo selecionado."
    elif purchase_days < 2:
        status = "new"
        label = "Cliente novo"
        reason = "Ainda nao existe cadencia suficiente para prever recompra."
    elif overdue_factor >= 1.8:
        status = "lost"
        label = "Possivel perda"
        reason = "Passou muito do intervalo medio de recompra observado."
    elif overdue_factor >= 1.15:
        status = "risk"
        label = "Em risco"
        reason = "Ja passou da janela normal de nova compra."
    elif due_in is not None and -14 <= due_in <= 14:
        status = "due"
        label = "Recompra proxima"
        reason = "Esta perto da janela esperada de nova compra."
    else:
        status = "healthy"
        label = "Em ritmo"
        reason = "Compra recente dentro da cadencia observada."

    estimated_next_purchase = ""
    if last_purchase:
        estimated_next_purchase = (
            datetime.strptime(last_purchase, "%Y-%m-%d").date() + timedelta(days=round(expected_gap))
        ).isoformat()
    return {
        "status": status,
        "label": label,
        "reason": reason,
        "days_since": days_since,
        "expected_gap_days": round(expected_gap, 1),
        "due_in_days": due_in,
        "estimated_next_purchase": estimated_next_purchase,
    }


def api_sales(conn: sqlite3.Connection, period: dict | None = None, limit: int = 1000) -> list[dict]:
    period = period or resolve_period(conn, {"period_days": "all"})
    limit = max(1, min(int(limit or 1000), 5000))
    product_where, product_params = date_where("ps.sold_at", period, "WHERE")
    service_where, service_params = date_where("ss.emitted_at", period, "WHERE")
    return rows(
        conn,
        f"""
        SELECT *
        FROM (
            SELECT
                'produto:' || ps.id AS id,
                'Produto' AS tipo,
                substr(ps.sold_at, 1, 10) AS data,
                COALESCE(st.name, '') AS loja,
                p.source_code AS codigo,
                p.name AS item,
                COALESCE(c.name, 'Consumidor') AS cliente,
                ROUND(ps.quantity, 2) AS quantidade,
                ROUND(ps.gross_amount, 2) AS receita,
                ROUND(ps.gross_amount / NULLIF(ps.quantity, 0), 2) AS valor_unitario
            FROM product_sales ps
            JOIN products p ON p.id = ps.product_id
            LEFT JOIN customers c ON c.id = ps.customer_id
            LEFT JOIN stores st ON st.id = ps.store_id
            {product_where}
            UNION ALL
            SELECT
                'servico:' || ss.id AS id,
                'Serviço' AS tipo,
                substr(ss.emitted_at, 1, 10) AS data,
                COALESCE(st.name, '') AS loja,
                '' AS codigo,
                COALESCE(s.name, 'Serviço') AS item,
                COALESCE(c.name, 'Consumidor') AS cliente,
                ROUND(ss.quantity, 2) AS quantidade,
                ROUND(ss.gross_amount, 2) AS receita,
                ROUND(ss.gross_amount / NULLIF(ss.quantity, 0), 2) AS valor_unitario
            FROM service_sales ss
            LEFT JOIN services s ON s.id = ss.service_id
            LEFT JOIN customers c ON c.id = ss.customer_id
            LEFT JOIN stores st ON st.id = ss.store_id
            {service_where}
        )
        ORDER BY data DESC, id DESC
        LIMIT ?
        """,
        (*product_params, *service_params, limit),
    )


def api_customer_mix(conn: sqlite3.Connection, customer_id: str, period: dict | None = None) -> dict:
    period = period or resolve_period(conn, {"period_days": "all"})
    customer = one(
        conn,
        """
        SELECT id, organization_id, source_code, name, canonical_name, document, customer_type, active
        FROM customers
        WHERE id = ?
        LIMIT 1
        """,
        (customer_id,),
    )
    if not customer:
        return {
            "contract": "customer_profile.v1",
            "customer": {},
            "period": period,
            "summary": {"products": 0, "services": 0, "quantity": 0, "revenue": 0, "purchase_days": 0},
            "relationship": _customer_relationship({"purchase_days": 0}),
            "products": [],
            "services": [],
            "categories": [],
            "monthly": [],
            "recent_purchases": [],
            "contract_hint": "Cliente nao encontrado.",
        }
    product_period_sql, product_params = date_where("ps.sold_at", period, "AND")
    service_period_sql, service_params = date_where("ss.emitted_at", period, "AND")
    product_scope_params = (customer["organization_id"], customer["canonical_name"], *product_params)
    service_scope_params = (customer["organization_id"], customer["canonical_name"], *service_params)
    combined_scope_params = (*product_scope_params, *service_scope_params)
    summary = one(
        conn,
        f"""
        WITH events AS (
            SELECT
                'product' AS kind,
                substr(ps.sold_at, 1, 10) AS event_date,
                ps.gross_amount AS revenue
            FROM product_sales ps
            JOIN customers c ON c.id = ps.customer_id
            WHERE ps.organization_id = ?
              AND c.canonical_name = ?{product_period_sql}
            UNION ALL
            SELECT
                'service' AS kind,
                substr(ss.emitted_at, 1, 10) AS event_date,
                ss.gross_amount AS revenue
            FROM service_sales ss
            JOIN customers c ON c.id = ss.customer_id
            WHERE ss.organization_id = ?
              AND c.canonical_name = ?{service_period_sql}
        )
        SELECT
            COUNT(*) AS events,
            COUNT(DISTINCT event_date) AS purchase_days,
            MIN(event_date) AS first_purchase,
            MAX(event_date) AS last_purchase,
            ROUND(SUM(revenue), 2) AS revenue,
            ROUND(SUM(CASE WHEN kind = 'product' THEN revenue ELSE 0 END), 2) AS product_revenue,
            ROUND(SUM(CASE WHEN kind = 'service' THEN revenue ELSE 0 END), 2) AS service_revenue,
            ROUND(SUM(revenue) / NULLIF(COUNT(DISTINCT event_date), 0), 2) AS avg_ticket,
            ROUND(
                CASE
                    WHEN COUNT(DISTINCT event_date) > 1
                        THEN (julianday(MAX(event_date)) - julianday(MIN(event_date))) / (COUNT(DISTINCT event_date) - 1)
                    ELSE NULL
                END,
                1
            ) AS avg_gap_days
        FROM events
        """,
        combined_scope_params,
    )
    max_event_date = one(
        conn,
        """
        SELECT MAX(event_date) AS event_date
        FROM (
            SELECT MAX(substr(sold_at, 1, 10)) AS event_date
            FROM product_sales
            WHERE organization_id = ?
            UNION ALL
            SELECT MAX(substr(emitted_at, 1, 10)) AS event_date
            FROM service_sales
            WHERE organization_id = ?
        )
        """,
        (customer["organization_id"], customer["organization_id"]),
    ).get("event_date")
    if period.get("date_to"):
        max_event_date = period.get("date_to")
    if max_event_date and summary.get("last_purchase"):
        summary["days_since"] = round(
            (
                datetime.strptime(max_event_date, "%Y-%m-%d").date()
                - datetime.strptime(summary["last_purchase"], "%Y-%m-%d").date()
            ).days,
            1,
        )
    else:
        summary["days_since"] = None
    product_overview = one(
        conn,
        f"""
        SELECT
            COUNT(DISTINCT ps.product_id) AS products,
            ROUND(SUM(ps.quantity), 2) AS quantity
        FROM product_sales ps
        JOIN customers c ON c.id = ps.customer_id
        WHERE ps.organization_id = ?
          AND c.canonical_name = ?{product_period_sql}
        """,
        product_scope_params,
    )
    service_overview = one(
        conn,
        f"""
        SELECT
            COUNT(DISTINCT ss.service_id) AS services,
            ROUND(SUM(ss.quantity), 2) AS service_quantity,
            ROUND(SUM(ss.net_amount), 2) AS service_net_revenue
        FROM service_sales ss
        JOIN customers c ON c.id = ss.customer_id
        WHERE ss.organization_id = ?
          AND c.canonical_name = ?{service_period_sql}
        """,
        service_scope_params,
    )
    mix_rows = rows(
        conn,
        f"""
        SELECT
            p.id AS product_id,
            p.source_code,
            p.name,
            COALESCE(b.name, '') AS brand_name,
            COALESCE(cat.name, 'Sem categoria') AS category_name,
            ROUND(SUM(ps.quantity), 2) AS quantity,
            ROUND(SUM(ps.gross_amount), 2) AS revenue,
            COUNT(*) AS sale_lines,
            COUNT(DISTINCT substr(ps.sold_at, 1, 10)) AS purchase_days,
            MAX(substr(ps.sold_at, 1, 10)) AS last_purchase,
            ROUND(SUM(ps.gross_amount) / NULLIF(SUM(ps.quantity), 0), 2) AS avg_unit_price
        FROM product_sales ps
        JOIN customers c ON c.id = ps.customer_id
        JOIN products p ON p.id = ps.product_id
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN categories cat ON cat.id = p.category_id
        WHERE ps.organization_id = ?
          AND c.canonical_name = ?{product_period_sql}
        GROUP BY p.id
        HAVING SUM(ps.gross_amount) > 0
        ORDER BY SUM(ps.gross_amount) DESC, SUM(ps.quantity) DESC
        LIMIT 30
        """,
        product_scope_params,
    )
    service_rows = rows(
        conn,
        f"""
        SELECT
            COALESCE(s.id, 'servico_sem_cadastro') AS service_id,
            COALESCE(s.name, 'Servico') AS name,
            ROUND(SUM(ss.quantity), 2) AS quantity,
            ROUND(SUM(ss.gross_amount), 2) AS revenue,
            ROUND(SUM(ss.net_amount), 2) AS net_revenue,
            COUNT(*) AS sale_lines,
            COUNT(DISTINCT substr(ss.emitted_at, 1, 10)) AS purchase_days,
            MAX(substr(ss.emitted_at, 1, 10)) AS last_purchase,
            ROUND(SUM(ss.gross_amount) / NULLIF(SUM(ss.quantity), 0), 2) AS avg_unit_price
        FROM service_sales ss
        JOIN customers c ON c.id = ss.customer_id
        LEFT JOIN services s ON s.id = ss.service_id
        WHERE ss.organization_id = ?
          AND c.canonical_name = ?{service_period_sql}
        GROUP BY COALESCE(s.id, 'servico_sem_cadastro'), COALESCE(s.name, 'Servico')
        HAVING SUM(ss.gross_amount) > 0
        ORDER BY SUM(ss.gross_amount) DESC, SUM(ss.quantity) DESC
        LIMIT 20
        """,
        service_scope_params,
    )
    category_rows = rows(
        conn,
        f"""
        SELECT
            COALESCE(cat.name, 'Sem categoria') AS name,
            ROUND(SUM(ps.quantity), 2) AS quantity,
            ROUND(SUM(ps.gross_amount), 2) AS revenue,
            COUNT(DISTINCT ps.product_id) AS products
        FROM product_sales ps
        JOIN customers c ON c.id = ps.customer_id
        JOIN products p ON p.id = ps.product_id
        LEFT JOIN categories cat ON cat.id = p.category_id
        WHERE ps.organization_id = ?
          AND c.canonical_name = ?{product_period_sql}
        GROUP BY COALESCE(cat.name, 'Sem categoria')
        HAVING SUM(ps.gross_amount) > 0
        ORDER BY SUM(ps.gross_amount) DESC
        LIMIT 12
        """,
        product_scope_params,
    )
    recent_purchases = rows(
        conn,
        f"""
        SELECT *
        FROM (
            SELECT
                'Produto' AS type,
                substr(ps.sold_at, 1, 10) AS event_date,
                COALESCE(st.name, '') AS store_name,
                p.source_code AS code,
                p.name AS item_name,
                ROUND(ps.quantity, 2) AS quantity,
                ROUND(ps.gross_amount, 2) AS revenue,
                ROUND(ps.gross_amount / NULLIF(ps.quantity, 0), 2) AS unit_value,
                '' AS order_number
            FROM product_sales ps
            JOIN customers c ON c.id = ps.customer_id
            JOIN products p ON p.id = ps.product_id
            LEFT JOIN stores st ON st.id = ps.store_id
            WHERE ps.organization_id = ?
              AND c.canonical_name = ?{product_period_sql}
            UNION ALL
            SELECT
                'Servico' AS type,
                substr(ss.emitted_at, 1, 10) AS event_date,
                COALESCE(st.name, '') AS store_name,
                '' AS code,
                COALESCE(s.name, 'Servico') AS item_name,
                ROUND(ss.quantity, 2) AS quantity,
                ROUND(ss.gross_amount, 2) AS revenue,
                ROUND(ss.gross_amount / NULLIF(ss.quantity, 0), 2) AS unit_value,
                ss.order_number AS order_number
            FROM service_sales ss
            JOIN customers c ON c.id = ss.customer_id
            LEFT JOIN services s ON s.id = ss.service_id
            LEFT JOIN stores st ON st.id = ss.store_id
            WHERE ss.organization_id = ?
              AND c.canonical_name = ?{service_period_sql}
        )
        ORDER BY event_date DESC, revenue DESC
        LIMIT 30
        """,
        combined_scope_params,
    )
    monthly_rows = rows(
        conn,
        f"""
        WITH events AS (
            SELECT
                'product' AS kind,
                substr(ps.sold_at, 1, 7) AS month,
                substr(ps.sold_at, 1, 10) AS event_date,
                ps.gross_amount AS revenue
            FROM product_sales ps
            JOIN customers c ON c.id = ps.customer_id
            WHERE ps.organization_id = ?
              AND c.canonical_name = ?{product_period_sql}
            UNION ALL
            SELECT
                'service' AS kind,
                substr(ss.emitted_at, 1, 7) AS month,
                substr(ss.emitted_at, 1, 10) AS event_date,
                ss.gross_amount AS revenue
            FROM service_sales ss
            JOIN customers c ON c.id = ss.customer_id
            WHERE ss.organization_id = ?
              AND c.canonical_name = ?{service_period_sql}
        )
        SELECT
            month,
            COUNT(*) AS events,
            COUNT(DISTINCT event_date) AS purchase_days,
            ROUND(SUM(revenue), 2) AS revenue,
            ROUND(SUM(CASE WHEN kind = 'product' THEN revenue ELSE 0 END), 2) AS product_revenue,
            ROUND(SUM(CASE WHEN kind = 'service' THEN revenue ELSE 0 END), 2) AS service_revenue
        FROM events
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
        """,
        combined_scope_params,
    )
    monthly_rows = list(reversed(monthly_rows))
    total_revenue = float(summary.get("revenue") or 0)
    product_revenue = float(summary.get("product_revenue") or 0)
    service_revenue = float(summary.get("service_revenue") or 0)
    total_quantity = float(product_overview.get("quantity") or 0)
    core_revenue = 0.0
    for index, row in enumerate(mix_rows):
        revenue = float(row.get("revenue") or 0)
        quantity = float(row.get("quantity") or 0)
        share = (revenue / product_revenue * 100) if product_revenue else 0
        quantity_share = (quantity / total_quantity * 100) if total_quantity else 0
        row["share"] = round(share, 1)
        row["quantity_share"] = round(quantity_share, 1)
        row["mix_role"] = "principal" if index < 5 or share >= 10 else "complementar"
        if row["mix_role"] == "principal":
            core_revenue += revenue
    core_share = (core_revenue / total_revenue * 100) if total_revenue else 0
    product_count = int(product_overview.get("products") or 0)
    service_count = int(service_overview.get("services") or 0)
    purchase_days = int(summary.get("purchase_days") or 0)
    relationship = _customer_relationship(summary)
    if product_count >= 3 and service_count and purchase_days >= 2:
        contract_hint = "Cliente com compra de produto e servico. Bom candidato para rotina comercial acompanhada."
    elif product_count >= 3 and purchase_days >= 2:
        contract_hint = "Bom candidato para mix personalizado com tabela de preco por periodo."
    elif product_count:
        contract_hint = "Mix identificado, mas ainda com pouca recorrencia para travar muitos precos."
    elif service_count:
        contract_hint = "Historico concentrado em servicos. Vale acompanhar recompra, pacote e agenda."
    else:
        contract_hint = "Ainda nao ha venda suficiente no recorte para montar uma ficha comercial."
    return {
        "contract": "customer_profile.v1",
        "customer": {
            "id": customer["id"],
            "source_code": customer.get("source_code") or "",
            "name": customer["name"],
            "canonical_name": customer["canonical_name"],
            "document": customer.get("document") or "",
            "customer_type": customer.get("customer_type") or "",
            "active": int(customer.get("active") or 0),
        },
        "period": period,
        "summary": {
            "products": product_count,
            "services": service_count,
            "quantity": round(total_quantity, 2),
            "revenue": round(total_revenue, 2),
            "product_revenue": round(product_revenue, 2),
            "service_revenue": round(service_revenue, 2),
            "service_net_revenue": round(float(service_overview.get("service_net_revenue") or 0), 2),
            "events": int(summary.get("events") or 0),
            "purchase_days": purchase_days,
            "first_purchase": summary.get("first_purchase") or "",
            "last_purchase": summary.get("last_purchase") or "",
            "avg_ticket": round(float(summary.get("avg_ticket") or 0), 2),
            "avg_gap_days": summary.get("avg_gap_days"),
            "days_since": summary.get("days_since"),
            "product_share": round((product_revenue / total_revenue * 100) if total_revenue else 0, 1),
            "service_share": round((service_revenue / total_revenue * 100) if total_revenue else 0, 1),
            "core_revenue": round(core_revenue, 2),
            "core_share": round(core_share, 1),
        },
        "relationship": relationship,
        "products": mix_rows,
        "services": service_rows,
        "categories": category_rows,
        "monthly": monthly_rows,
        "recent_purchases": recent_purchases,
        "contract_hint": contract_hint,
    }


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
