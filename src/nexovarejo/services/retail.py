from __future__ import annotations

import sqlite3
from datetime import date
from decimal import Decimal
from typing import Any

from nexovarejo.analytics.abc import ABCInput, classify_abc
from nexovarejo.analytics.purchasing import suggest_purchase
from nexovarejo.analytics.rfm import CustomerSale, build_rfm_segments


def _decimal(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def executive_summary(conn: sqlite3.Connection, organization_id: str, store_id: str | None = None) -> dict[str, Any]:
    params: list[Any] = [organization_id]
    store_filter = ""
    if store_id:
        store_filter = " AND store_id = ?"
        params.append(store_id)

    product_count = conn.execute(
        "SELECT COUNT(*) FROM products WHERE organization_id = ? AND active = 1",
        (organization_id,),
    ).fetchone()[0]
    customer_count = conn.execute(
        "SELECT COUNT(*) FROM customers WHERE organization_id = ?",
        (organization_id,),
    ).fetchone()[0]
    sales = conn.execute(
        f"""
        SELECT COUNT(*) AS lines, COALESCE(SUM(gross_amount), 0) AS gross_amount,
               COALESCE(SUM(quantity), 0) AS quantity
        FROM sales
        WHERE organization_id = ?{store_filter}
        """,
        params,
    ).fetchone()
    services = conn.execute(
        f"""
        SELECT COUNT(*) AS lines, COALESCE(SUM(gross_amount), 0) AS gross_amount
        FROM service_sales
        WHERE organization_id = ?{store_filter}
        """,
        params,
    ).fetchone()
    inventory = conn.execute(
        f"""
        WITH latest AS (
            SELECT MAX(id) AS id
            FROM inventory_snapshots
            WHERE organization_id = ?{store_filter}
            GROUP BY store_id, product_id
        )
        SELECT COUNT(*) AS products_with_stock,
               COALESCE(SUM(quantity_on_hand), 0) AS quantity_on_hand,
               COALESCE(SUM(quantity_on_hand * sale_price), 0) AS stock_sale_value
        FROM inventory_snapshots
        WHERE id IN (SELECT id FROM latest)
        """,
        params,
    ).fetchone()
    return {
        "organization_id": organization_id,
        "store_id": store_id,
        "products": int(product_count),
        "customers": int(customer_count),
        "sales_lines": int(sales["lines"]),
        "sales_gross_amount": float(sales["gross_amount"]),
        "sales_quantity": float(sales["quantity"]),
        "service_lines": int(services["lines"]),
        "service_gross_amount": float(services["gross_amount"]),
        "products_with_stock": int(inventory["products_with_stock"]),
        "stock_quantity": float(inventory["quantity_on_hand"]),
        "stock_sale_value": float(inventory["stock_sale_value"]),
    }


def top_products(
    conn: sqlite3.Connection,
    organization_id: str,
    *,
    store_id: str | None = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    params: list[Any] = [organization_id]
    store_filter = ""
    if store_id:
        store_filter = " AND s.store_id = ?"
        params.append(store_id)
    params.append(limit)
    rows = conn.execute(
        f"""
        SELECT p.id AS product_id, p.source_code, p.name, p.brand,
               COALESCE(SUM(s.quantity), 0) AS quantity,
               COALESCE(SUM(s.gross_amount), 0) AS gross_amount
        FROM sales s
        JOIN products p ON p.id = s.product_id
        WHERE s.organization_id = ?{store_filter}
        GROUP BY p.id, p.source_code, p.name, p.brand
        ORDER BY gross_amount DESC
        LIMIT ?
        """,
        params,
    ).fetchall()
    return [dict(row) for row in rows]


def abc_report(
    conn: sqlite3.Connection,
    organization_id: str,
    *,
    store_id: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    products = top_products(conn, organization_id, store_id=store_id, limit=limit)
    abc_rows = classify_abc(
        ABCInput(product["product_id"], _decimal(product["gross_amount"]))
        for product in products
    )
    metadata = {product["product_id"]: product for product in products}
    return [
        {
            **metadata[row.product_id],
            "share": float(row.share),
            "cumulative_share": float(row.cumulative_share),
            "abc_class": row.abc_class,
        }
        for row in abc_rows
    ]


def customer_rfm(
    conn: sqlite3.Connection,
    organization_id: str,
    *,
    reference_date: date | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    ref = reference_date or _max_sale_date(conn, organization_id) or date.today()
    rows = conn.execute(
        """
        SELECT customer_id, sold_at, gross_amount
        FROM sales
        WHERE organization_id = ? AND customer_id IS NOT NULL
        """,
        (organization_id,),
    ).fetchall()
    sales = [
        CustomerSale(row["customer_id"], date.fromisoformat(row["sold_at"]), _decimal(row["gross_amount"]))
        for row in rows
        if row["sold_at"]
    ]
    names = {
        row["id"]: row["name"]
        for row in conn.execute("SELECT id, name FROM customers WHERE organization_id = ?", (organization_id,))
    }
    return [
        {
            "customer_id": row.customer_id,
            "customer_name": names.get(row.customer_id, row.customer_id),
            "recency_days": row.recency_days,
            "frequency": row.frequency,
            "monetary": float(row.monetary),
            "segment": row.segment,
        }
        for row in build_rfm_segments(sales, ref)[:limit]
    ]


def purchase_suggestions(
    conn: sqlite3.Connection,
    organization_id: str,
    *,
    store_id: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    latest_params: list[Any] = [organization_id]
    latest_store_filter = ""
    demand_params: list[Any] = [organization_id]
    demand_store_filter = ""
    if store_id:
        latest_store_filter = " AND store_id = ?"
        latest_params.append(store_id)
        demand_store_filter = " AND store_id = ?"
        demand_params.append(store_id)
    rows = conn.execute(
        f"""
        WITH latest_inventory AS (
            SELECT i.*
            FROM inventory_snapshots i
            JOIN (
                SELECT store_id, product_id, MAX(id) AS max_id
                FROM inventory_snapshots
                WHERE organization_id = ?{latest_store_filter}
                GROUP BY store_id, product_id
            ) latest ON latest.max_id = i.id
        ),
        demand AS (
            SELECT product_id,
                   SUM(quantity) AS quantity,
                   MAX(julianday(sold_at)) - MIN(julianday(sold_at)) + 1 AS span_days
            FROM sales
            WHERE organization_id = ?{demand_store_filter}
            GROUP BY product_id
        )
        SELECT p.id AS product_id, p.source_code, p.name, p.brand,
               li.quantity_on_hand,
               COALESCE(d.quantity, 0) AS sold_quantity,
               COALESCE(d.span_days, 1) AS span_days,
               COALESCE(ps.package_size, 1) AS package_size,
               COALESCE(ps.target_coverage_days, 45) AS target_coverage_days,
               COALESCE(ps.blocked, 0) AS blocked
        FROM latest_inventory li
        JOIN products p ON p.id = li.product_id
        LEFT JOIN demand d ON d.product_id = li.product_id
        LEFT JOIN purchase_settings ps ON ps.product_id = li.product_id AND ps.organization_id = p.organization_id
        ORDER BY p.name
        """,
        [*latest_params, *demand_params],
    ).fetchall()

    result = []
    for row in rows:
        span_days = max(_decimal(row["span_days"]), Decimal("1"))
        average_daily = _decimal(row["sold_quantity"]) / span_days
        suggestion = suggest_purchase(
            product_id=row["product_id"],
            stock_on_hand=_decimal(row["quantity_on_hand"]),
            pending_purchase_quantity=Decimal("0"),
            average_daily_demand=average_daily,
            target_coverage_days=int(row["target_coverage_days"] or 45),
            package_size=_decimal(row["package_size"]) or Decimal("1"),
            blocked=bool(row["blocked"]),
        )
        if suggestion.status == "comprar":
            result.append({
                "product_id": row["product_id"],
                "source_code": row["source_code"],
                "name": row["name"],
                "brand": row["brand"],
                "average_daily_demand": float(average_daily),
                "stock_on_hand": float(_decimal(row["quantity_on_hand"])),
                "target_stock": float(suggestion.target_stock),
                "suggested_quantity": float(suggestion.suggested_quantity),
                "suggested_boxes": float(suggestion.suggested_boxes),
                "coverage_days": float(suggestion.coverage_days),
                "status": suggestion.status,
            })
    result.sort(key=lambda item: (item["coverage_days"], -item["suggested_quantity"]))
    return result[:limit]


def _max_sale_date(conn: sqlite3.Connection, organization_id: str) -> date | None:
    value = conn.execute(
        "SELECT MAX(sold_at) FROM sales WHERE organization_id = ?",
        (organization_id,),
    ).fetchone()[0]
    return date.fromisoformat(value) if value else None
