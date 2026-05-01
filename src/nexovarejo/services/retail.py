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


def manual_setup_status(conn: sqlite3.Connection, organization_id: str) -> dict[str, Any]:
    suppliers = conn.execute(
        "SELECT COUNT(*) FROM suppliers WHERE organization_id = ? AND active = 1",
        (organization_id,),
    ).fetchone()[0]
    product_brands = conn.execute(
        """
        SELECT COUNT(DISTINCT brand)
        FROM products
        WHERE organization_id = ? AND active = 1 AND TRIM(COALESCE(brand, '')) != ''
        """,
        (organization_id,),
    ).fetchone()[0]
    mapped_brands = conn.execute(
        """
        SELECT COUNT(DISTINCT p.brand)
        FROM products p
        JOIN brand_supplier_rules bsr
          ON bsr.organization_id = p.organization_id
         AND bsr.brand = p.brand
         AND bsr.active = 1
         AND bsr.supplier_id IS NOT NULL
        WHERE p.organization_id = ? AND p.active = 1 AND TRIM(COALESCE(p.brand, '')) != ''
        """,
        (organization_id,),
    ).fetchone()[0]
    product_count = conn.execute(
        "SELECT COUNT(*) FROM products WHERE organization_id = ? AND active = 1",
        (organization_id,),
    ).fetchone()[0]
    products_with_settings = conn.execute(
        """
        SELECT COUNT(*)
        FROM purchase_settings
        WHERE organization_id = ?
        """,
        (organization_id,),
    ).fetchone()[0]
    blocked_products = conn.execute(
        """
        SELECT COUNT(*)
        FROM purchase_settings
        WHERE organization_id = ? AND blocked = 1
        """,
        (organization_id,),
    ).fetchone()[0]
    unmapped = conn.execute(
        """
        SELECT p.brand, COUNT(*) AS products
        FROM products p
        LEFT JOIN brand_supplier_rules bsr
          ON bsr.organization_id = p.organization_id
         AND bsr.brand = p.brand
         AND bsr.active = 1
         AND bsr.supplier_id IS NOT NULL
        WHERE p.organization_id = ?
          AND p.active = 1
          AND TRIM(COALESCE(p.brand, '')) != ''
          AND bsr.supplier_id IS NULL
        GROUP BY p.brand
        ORDER BY products DESC, p.brand
        LIMIT 20
        """,
        (organization_id,),
    ).fetchall()
    return {
        "suppliers": int(suppliers),
        "product_brands": int(product_brands),
        "mapped_brands": int(mapped_brands),
        "unmapped_brands": max(int(product_brands) - int(mapped_brands), 0),
        "products": int(product_count),
        "products_with_purchase_settings": int(products_with_settings),
        "products_without_purchase_settings": max(int(product_count) - int(products_with_settings), 0),
        "blocked_products": int(blocked_products),
        "brand_mapping_progress": round((mapped_brands / product_brands) * 100, 2) if product_brands else 0.0,
        "purchase_settings_progress": round((products_with_settings / product_count) * 100, 2) if product_count else 0.0,
        "unmapped_brand_examples": [dict(row) for row in unmapped],
    }


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
               COALESCE(ps.blocked, 0) AS blocked,
               COALESCE(s.name, 'Sem fornecedor') AS supplier_name,
               COALESCE(s.minimum_order_value, 0) AS supplier_minimum_order
        FROM latest_inventory li
        JOIN products p ON p.id = li.product_id
        LEFT JOIN demand d ON d.product_id = li.product_id
        LEFT JOIN purchase_settings ps ON ps.product_id = li.product_id AND ps.organization_id = p.organization_id
        LEFT JOIN brand_supplier_rules bsr ON bsr.organization_id = p.organization_id AND bsr.brand = p.brand AND bsr.active = 1
        LEFT JOIN suppliers s ON s.id = COALESCE(ps.supplier_id, bsr.supplier_id)
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
                "supplier": row["supplier_name"],
                "supplier_minimum_order": float(_decimal(row["supplier_minimum_order"])),
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


def supplier_summary(
    conn: sqlite3.Connection,
    organization_id: str,
    *,
    store_id: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    suggestions = purchase_suggestions(conn, organization_id, store_id=store_id, limit=10000)
    grouped: dict[str, dict[str, Any]] = {}
    for item in suggestions:
        supplier = item.get("supplier") or "Sem fornecedor"
        current = grouped.setdefault(
            supplier,
            {
                "supplier": supplier,
                "items": 0,
                "suggested_quantity": 0.0,
                "minimum_order": item.get("supplier_minimum_order", 0.0),
                "critical_items": 0,
            },
        )
        current["items"] += 1
        current["suggested_quantity"] += float(item.get("suggested_quantity", 0) or 0)
        current["critical_items"] += 1 if float(item.get("coverage_days", 999999) or 999999) <= 15 else 0
    rows = list(grouped.values())
    rows.sort(key=lambda row: (-row["critical_items"], -row["items"], row["supplier"]))
    return rows[:limit]


def stock_alerts(
    conn: sqlite3.Connection,
    organization_id: str,
    *,
    store_id: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    suggestions = purchase_suggestions(conn, organization_id, store_id=store_id, limit=10000)
    alerts = []
    for item in suggestions:
        coverage = float(item.get("coverage_days", 999999) or 999999)
        if coverage <= 7:
            alert = "ruptura_iminente"
            severity = "critico"
        elif coverage <= 15:
            alert = "cobertura_baixa"
            severity = "atencao"
        elif not item.get("supplier") or item.get("supplier") == "Sem fornecedor":
            alert = "sem_fornecedor"
            severity = "cadastro"
        else:
            continue
        alerts.append({**item, "alert": alert, "severity": severity})
    alerts.sort(key=lambda row: (row["coverage_days"], row["supplier"], row["name"]))
    return alerts[:limit]


def product_catalog(
    conn: sqlite3.Connection,
    organization_id: str,
    *,
    store_id: str | None = None,
    q: str = "",
    limit: int = 200,
) -> list[dict[str, Any]]:
    latest_params: list[Any] = [organization_id]
    store_filter = ""
    if store_id:
        store_filter = " AND store_id = ?"
        latest_params.append(store_id)
    final_params: list[Any] = [*latest_params, organization_id, organization_id]
    search_filter = ""
    if q:
        search_filter = " AND (p.name LIKE ? OR p.brand LIKE ? OR p.source_code LIKE ?)"
        like = f"%{q}%"
        final_params.extend([like, like, like])
    final_params.append(limit)
    rows = conn.execute(
        f"""
        WITH latest_inventory AS (
            SELECT i.*
            FROM inventory_snapshots i
            JOIN (
                SELECT store_id, product_id, MAX(id) AS max_id
                FROM inventory_snapshots
                WHERE organization_id = ?{store_filter}
                GROUP BY store_id, product_id
            ) latest ON latest.max_id = i.id
        ),
        sales_total AS (
            SELECT product_id, SUM(quantity) AS quantity, SUM(gross_amount) AS gross_amount
            FROM sales
            WHERE organization_id = ?
            GROUP BY product_id
        )
        SELECT p.id AS product_id, p.source_code, p.name, p.brand, p.unit,
               COALESCE(li.quantity_on_hand, 0) AS stock,
               COALESCE(li.sale_price, 0) AS sale_price,
               COALESCE(st.quantity, 0) AS sold_quantity,
               COALESCE(st.gross_amount, 0) AS gross_amount,
               COALESCE(s.name, 'Sem fornecedor') AS supplier
        FROM products p
        LEFT JOIN latest_inventory li ON li.product_id = p.id
        LEFT JOIN sales_total st ON st.product_id = p.id
        LEFT JOIN brand_supplier_rules bsr ON bsr.organization_id = p.organization_id AND bsr.brand = p.brand AND bsr.active = 1
        LEFT JOIN suppliers s ON s.id = bsr.supplier_id
        WHERE p.organization_id = ? AND p.active = 1{search_filter}
        ORDER BY gross_amount DESC, p.name
        LIMIT ?
        """,
        final_params,
    ).fetchall()
    return [dict(row) for row in rows]


def _max_sale_date(conn: sqlite3.Connection, organization_id: str) -> date | None:
    value = conn.execute(
        "SELECT MAX(sold_at) FROM sales WHERE organization_id = ?",
        (organization_id,),
    ).fetchone()[0]
    return date.fromisoformat(value) if value else None
