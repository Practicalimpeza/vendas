from __future__ import annotations

import json
import sqlite3

from db_helpers import date_where, one, parse_decimal, resolve_period, rows, scalar_text

PRICING_MIN_MARGIN = {
    "ancora": 5.0,
    "commodity": 8.0,
    "normal": 20.0,
    "marca_propria": 30.0,
}


def product_role_label(role: str) -> str:
    return {
        "ancora": "Ancora",
        "commodity": "Commodity",
        "normal": "Normal",
        "marca_propria": "Marca propria",
    }.get(role, "Normal")


def classify_pricing_signal(row: dict) -> dict:
    role = row.get("product_role") or "normal"
    min_margin = PRICING_MIN_MARGIN.get(role, 20.0)
    sale_price = float(row.get("sale_price") or 0)
    cost_price = float(row.get("effective_cost") or 0)
    revenue = float(row.get("revenue") or 0)
    quantity = float(row.get("quantity") or 0)
    target_price = round(cost_price / (1 - min_margin / 100.0), 2) if cost_price > 0 and min_margin < 100 else 0.0
    suggested_price_delta = round(target_price - sale_price, 2) if target_price > 0 and sale_price > 0 else 0.0
    if sale_price <= 0:
        code = "sem_preco"
        label = "Sem preco"
        severity = "danger"
        reason = "Nao ha preco de venda importado do ERP para calcular margem."
    elif cost_price <= 0:
        code = "sem_custo"
        label = "Sem custo"
        severity = "danger"
        reason = "Sem custo, o Nexo nao consegue validar margem."
    else:
        margin = (sale_price - cost_price) / sale_price * 100.0
        row["margin_pct"] = round(margin, 1)
        if margin < 0:
            code = "margem_negativa"
            label = "Margem negativa"
            severity = "danger"
            reason = "Preco importado do ERP esta abaixo do custo conhecido. Revisao deve ser feita no ERP."
        elif margin < min_margin:
            code = "margem_baixa"
            label = "Margem baixa"
            severity = "warn"
            reason = f"Margem abaixo do alvo para {product_role_label(role)} ({min_margin:.0f}%). Sugestao: revisar preco no ERP."
        elif revenue >= 2000 and quantity >= 5 and margin > min_margin + 18:
            code = "oportunidade"
            label = "Oportunidade"
            severity = "good"
            reason = "Produto relevante com folga de margem; o Nexo sugere avaliar posicionamento, sem alterar o ERP."
        else:
            code = "ok"
            label = "Ok"
            severity = "muted"
            reason = "Margem dentro da faixa esperada para o papel do produto."
    row.update(
        {
            "signal": code,
            "signal_label": label,
            "severity": severity,
            "min_margin_pct": min_margin,
            "role_label": product_role_label(role),
            "reason": reason,
            "margin_pct": row.get("margin_pct"),
            "target_price": target_price,
            "suggested_price_delta": suggested_price_delta,
            "price_source": "erp_import",
            "nexo_action": "Sugerir revisao no ERP" if code in {"margem_negativa", "margem_baixa", "sem_preco"} else "Monitorar",
        }
    )
    return row


def api_pricing(conn: sqlite3.Connection, period: dict | None = None) -> dict:
    period = period or resolve_period(conn, {"period_days": "all"})
    period_sql, params = date_where("s.sold_at", period, "WHERE")
    data = rows(
        conn,
        f"""
        WITH sales AS (
            SELECT
                product_id,
                ROUND(SUM(quantity), 2) AS quantity,
                ROUND(SUM(gross_amount), 2) AS revenue
            FROM product_sales s
            {period_sql}
            GROUP BY product_id
        ),
        prices AS (
            SELECT product_id, MAX(sale_price) AS sale_price
            FROM price_snapshots
            GROUP BY product_id
        ),
        costs AS (
            SELECT product_id, MAX(total_cost) AS imported_cost
            FROM cost_snapshots
            GROUP BY product_id
        )
        SELECT
            p.id AS product_id,
            p.organization_id,
            p.source_code,
            p.name,
            COALESCE(s.quantity, 0) AS quantity,
            COALESCE(s.revenue, 0) AS revenue,
            COALESCE(pr.sale_price, 0) AS sale_price,
            cps.cost_price AS manual_cost,
            COALESCE(cps.cost_price, c.imported_cost, 0) AS effective_cost,
            CASE WHEN cps.cost_price IS NOT NULL THEN 'manual' WHEN c.imported_cost IS NOT NULL THEN 'erp' ELSE 'missing' END AS cost_origin,
            COALESCE(cps.product_role, 'normal') AS product_role
        FROM products p
        LEFT JOIN sales s ON s.product_id = p.id
        LEFT JOIN prices pr ON pr.product_id = p.id
        LEFT JOIN costs c ON c.product_id = p.id
        LEFT JOIN product_pricing_settings cps
          ON cps.organization_id = p.organization_id
         AND cps.product_id = p.id
        WHERE p.active = 1
          AND (COALESCE(s.revenue, 0) > 0 OR COALESCE(pr.sale_price, 0) > 0)
        ORDER BY COALESCE(s.revenue, 0) DESC
        LIMIT 250
        """,
        params,
    )
    rows_with_signals = [classify_pricing_signal(row) for row in data]
    summary = {
        "products": len(rows_with_signals),
        "negative_margin": sum(1 for row in rows_with_signals if row["signal"] == "margem_negativa"),
        "low_margin": sum(1 for row in rows_with_signals if row["signal"] == "margem_baixa"),
        "missing_cost": sum(1 for row in rows_with_signals if row["signal"] in {"sem_custo", "sem_preco"}),
        "opportunities": sum(1 for row in rows_with_signals if row["signal"] == "oportunidade"),
        "period_label": period.get("label", ""),
    }
    priority = {"margem_negativa": 0, "sem_custo": 1, "sem_preco": 1, "margem_baixa": 2, "oportunidade": 3, "ok": 4}
    rows_with_signals.sort(key=lambda row: (priority.get(row["signal"], 9), -float(row.get("revenue") or 0)))
    return {"summary": summary, "rows": rows_with_signals}


def update_product_pricing(conn: sqlite3.Connection, payload: dict) -> dict:
    organization_id = scalar_text(payload.get("organization_id"))
    product_id = scalar_text(payload.get("product_id"))
    cost_price = parse_decimal(payload.get("cost_price"), None)
    product_role = scalar_text(payload.get("product_role") or "normal")
    if product_role not in PRICING_MIN_MARGIN:
        raise ValueError("Papel de produto invalido.")
    if not organization_id or not product_id:
        raise ValueError("organization_id e product_id sao obrigatorios.")
    if cost_price is not None and cost_price < 0:
        raise ValueError("Custo nao pode ser negativo.")
    product = one(conn, "SELECT id, name FROM products WHERE organization_id = ? AND id = ?", (organization_id, product_id))
    if not product:
        raise ValueError("Produto nao encontrado.")
    conn.execute(
        """
        INSERT INTO product_pricing_settings
            (organization_id, product_id, cost_price, product_role, notes, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(organization_id, product_id) DO UPDATE SET
            cost_price = excluded.cost_price,
            product_role = excluded.product_role,
            notes = excluded.notes,
            updated_at = CURRENT_TIMESTAMP
        """,
        (organization_id, product_id, cost_price, product_role, scalar_text(payload.get("notes"))[:500]),
    )
    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, 'product_pricing_update', 'product', ?, '{}', ?)
        """,
        (
            organization_id,
            product_id,
            json.dumps({"cost_price": cost_price, "product_role": product_role}, ensure_ascii=False),
        ),
    )
    return {"ok": True}
