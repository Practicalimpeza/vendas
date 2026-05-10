from __future__ import annotations

import math
import sqlite3
from datetime import date, timedelta
from statistics import pstdev

from db_helpers import date_where, max_activity_date, resolve_period, rows


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def round_package(quantity: float, package_size: float) -> float:
    package = package_size if package_size and package_size > 0 else 1.0
    if quantity <= 0:
        return 0.0
    return math.ceil(quantity / package) * package


def status_label(status: str) -> str:
    labels = {
        "buy_now": "Comprar agora",
        "urgent": "Ruptura iminente",
        "mix_review": "Decidir mix",
        "watch": "Monitorar",
        "ok": "Estoque ok",
        "excess": "Excesso",
        "no_demand": "Sem demanda",
        "blocked": "Descontinuado",
        "ignored": "Descontinuado",
        "out_of_mix": "Descontinuado",
    }
    return labels.get(status, status)


def abc_classes(product_revenue: dict[str, float]) -> dict[str, str]:
    total = sum(product_revenue.values())
    if total <= 0:
        return {product_id: "C" for product_id in product_revenue}
    cumulative = 0.0
    result = {}
    for product_id, revenue in sorted(product_revenue.items(), key=lambda item: item[1], reverse=True):
        cumulative += revenue / total
        if cumulative <= 0.80:
            result[product_id] = "A"
        elif cumulative <= 0.95:
            result[product_id] = "B"
        else:
            result[product_id] = "C"
    return result


def api_replenishment(conn: sqlite3.Connection, limit: int = 300, period: dict | None = None) -> dict:
    period = period or resolve_period(conn, {"period_days": "all"})
    products = rows(
        conn,
        """
        SELECT
            p.id,
            p.organization_id,
            p.source_code,
            (
                SELECT pi.identifier_value
                FROM product_identifiers pi
                WHERE pi.organization_id = p.organization_id
                  AND pi.product_id = p.id
                  AND pi.identifier_type = 'supplier_reference'
                ORDER BY pi.id DESC
                LIMIT 1
            ) AS supplier_reference,
            p.name,
            p.unit,
            p.brand_id,
            b.name AS brand_name,
            COALESCE(bsr.supplier_id, ps.preferred_supplier_id) AS effective_supplier_id,
            COALESCE(ps.package_size, 1) AS package_size,
            COALESCE(ps.target_coverage_days, 45) AS configured_target_days,
            COALESCE(ps.minimum_stock, 0) AS minimum_stock,
            COALESCE(ps.maximum_stock, 0) AS maximum_stock,
            COALESCE(ps.blocked_for_purchase, 0) AS blocked_for_purchase,
            COALESCE(ps.ignored_in_purchase_reports, 0) AS ignored_in_purchase_reports,
            COALESCE(ps.marker, '') AS marker,
            COALESCE(ps.notes, '') AS operational_notes,
            s.name AS supplier_name,
            s.contact_phone AS supplier_phone,
            COALESCE(s.minimum_order_value, 0) AS minimum_order_value,
            COALESCE(s.target_order_value, 0) AS target_order_value,
            COALESCE(s.average_lead_time_days, 7) AS lead_time_days,
            s.order_review_cycle_days,
            COALESCE(s.target_coverage_adjustment_days, 0) AS target_coverage_adjustment_days,
            COALESCE(s.order_difficulty, 'auto') AS order_difficulty
        FROM products p
        LEFT JOIN product_settings ps ON ps.product_id = p.id AND ps.organization_id = p.organization_id
        LEFT JOIN brand_supplier_rules bsr ON bsr.organization_id = p.organization_id AND bsr.brand_id = p.brand_id AND bsr.active = 1
        LEFT JOIN suppliers s ON s.id = COALESCE(bsr.supplier_id, ps.preferred_supplier_id)
        LEFT JOIN brands b ON b.id = p.brand_id
        WHERE p.active = 1
        """,
    )
    period_sql, period_params = date_where("sold_at", period, "AND")
    sales = rows(
        conn,
        f"SELECT product_id, sold_at, quantity, gross_amount FROM product_sales WHERE quantity > 0{period_sql}",
        period_params,
    )
    if sales:
        max_date_text = max(str(row["sold_at"])[:10] for row in sales)
        ref = date.fromisoformat(max_date_text)
        min_date_text = min(str(row["sold_at"])[:10] for row in sales)
        first_sale = date.fromisoformat(min_date_text)
    else:
        ref = date.fromisoformat((period.get("date_to") or max_activity_date(conn))[:10])
        first_sale = ref
    observed_days = max((ref - first_sale).days + 1, 1)

    stock = {
        row["product_id"]: float(row["stock_units"] or 0)
        for row in rows(
            conn,
            """
            SELECT product_id, SUM(quantity_on_hand) AS stock_units
            FROM inventory_snapshots inv
            WHERE inv.id = (
                SELECT inv2.id
                FROM inventory_snapshots inv2
                WHERE inv2.organization_id = inv.organization_id
                  AND inv2.store_id = inv.store_id
                  AND inv2.product_id = inv.product_id
                ORDER BY inv2.snapshot_date DESC, inv2.id DESC
                LIMIT 1
            )
            GROUP BY product_id
            """,
        )
    }
    costs = {
        row["product_id"]: float(row["unit_cost"] or 0)
        for row in rows(
            conn,
            """
            SELECT product_id, total_cost AS unit_cost
            FROM cost_snapshots cs
            WHERE cs.id = (
                SELECT cs2.id
                FROM cost_snapshots cs2
                WHERE cs2.organization_id = cs.organization_id
                  AND cs2.product_id = cs.product_id
                ORDER BY cs2.snapshot_date DESC, cs2.id DESC
                LIMIT 1
            )
            """,
        )
    }
    prices = {
        row["product_id"]: float(row["sale_price"] or 0)
        for row in rows(
            conn,
            """
            SELECT product_id, sale_price
            FROM price_snapshots ps
            WHERE ps.id = (
                SELECT ps2.id
                FROM price_snapshots ps2
                WHERE ps2.organization_id = ps.organization_id
                  AND ps2.product_id = ps.product_id
                ORDER BY ps2.snapshot_date DESC, ps2.id DESC
                LIMIT 1
            )
            """,
        )
    }
    open_orders = {
        row["product_id"]: row
        for row in rows(
            conn,
            """
            SELECT
                poi.product_id,
                COUNT(DISTINCT po.id) AS open_order_count,
                ROUND(COALESCE(SUM(
                    CASE
                        WHEN poi.decision = 'buy' THEN MAX(poi.final_quantity - COALESCE(poi.received_quantity, 0), 0)
                        ELSE 0
                    END
                ), 0), 2) AS open_order_quantity,
                ROUND(COALESCE(SUM(
                    CASE
                        WHEN poi.decision = 'buy' THEN MAX(poi.final_quantity - COALESCE(poi.received_quantity, 0), 0) * COALESCE(poi.unit_price, 0)
                        ELSE 0
                    END
                ), 0), 2) AS open_order_value
            FROM purchase_orders po
            JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
            WHERE po.status IN ('approved', 'sent', 'partial_received')
            GROUP BY poi.product_id
            """,
        )
    }

    by_product: dict[str, list[dict]] = {}
    revenue_by_product: dict[str, float] = {}
    for sale in sales:
        product_id = sale["product_id"]
        by_product.setdefault(product_id, []).append(sale)
        revenue_by_product[product_id] = revenue_by_product.get(product_id, 0.0) + float(sale["gross_amount"] or 0)
    abc = abc_classes(revenue_by_product)

    def window_qty(product_sales: list[dict], days: int) -> float:
        start = ref - timedelta(days=days - 1)
        return sum(float(sale["quantity"] or 0) for sale in product_sales if date.fromisoformat(str(sale["sold_at"])[:10]) >= start)

    def supplier_group(product: dict) -> tuple[str, str, bool]:
        if product["effective_supplier_id"]:
            return f"supplier:{product['effective_supplier_id']}", product["supplier_name"] or "Fornecedor sem nome", True
        if product["brand_id"]:
            return f"brand:{product['brand_id']}", f"Marca {product['brand_name'] or 'sem marca'} - fornecedor a configurar", False
        return "unassigned", "Fornecedor a configurar", False

    supplier_profiles: dict[str, dict] = {}
    for product in products:
        group_key, group_name, configured = supplier_group(product)
        product_sales = by_product.get(product["id"], [])
        qty_365 = window_qty(product_sales, min(365, observed_days))
        unit_cost = costs.get(product["id"], 0.0)
        sale_price = prices.get(product["id"], 0.0)
        purchase_unit_value = unit_cost if unit_cost > 0 else sale_price * 0.60
        daily_purchase_value = (qty_365 / max(min(365, observed_days), 1)) * purchase_unit_value
        profile = supplier_profiles.setdefault(
            group_key,
            {
                "supplier_key": group_key,
                "supplier_name": group_name,
                "configured": configured,
                "daily_purchase_value": 0.0,
                "active_skus": 0,
                "minimum_order_value": float(product["minimum_order_value"] or 0),
                "target_order_value": float(product["target_order_value"] or 0),
                "lead_time_days": int(product["lead_time_days"] or 7),
                "manual_review_cycle_days": product["order_review_cycle_days"],
                "manual_adjustment_days": int(product["target_coverage_adjustment_days"] or 0),
                "manual_difficulty": product["order_difficulty"] or "auto",
                "contact_phone": product["supplier_phone"] or "",
            },
        )
        profile["daily_purchase_value"] += daily_purchase_value
        if qty_365 > 0:
            profile["active_skus"] += 1

    for profile in supplier_profiles.values():
        minimum = float(profile["minimum_order_value"] or 0)
        target = float(profile["target_order_value"] or 0)
        threshold = target if target > minimum else minimum
        daily_value = float(profile["daily_purchase_value"] or 0)
        if threshold > 0 and daily_value > 0:
            days_to_order = threshold / daily_value
        elif profile["configured"]:
            days_to_order = 21.0
        else:
            days_to_order = None

        if not profile["configured"]:
            difficulty = "configure"
            cycle_days = 14
            adjustment_days = 0
        elif profile["manual_difficulty"] in {"easy", "normal", "hard"}:
            difficulty = profile["manual_difficulty"]
        elif days_to_order is None:
            difficulty = "normal"
        elif minimum <= 0 and target <= 0:
            difficulty = "unknown"
        elif days_to_order <= 14:
            difficulty = "easy"
        elif days_to_order <= 35:
            difficulty = "normal"
        else:
            difficulty = "hard"

        if profile["configured"]:
            if profile["manual_review_cycle_days"]:
                cycle_days = int(profile["manual_review_cycle_days"])
            elif days_to_order is not None:
                cycle_days = int(clamp(days_to_order, 7, 60))
            else:
                cycle_days = 14
            adjustment_days = int(profile["manual_adjustment_days"] or 0)
            if not adjustment_days:
                adjustment_days = {"easy": -7, "normal": 0, "hard": 18, "unknown": 0}.get(difficulty, 0)

        profile["days_to_order"] = round(days_to_order, 1) if days_to_order is not None else None
        profile["difficulty"] = difficulty
        profile["review_cycle_days"] = int(clamp(cycle_days, 7, 60))
        profile["target_adjustment_days"] = int(clamp(adjustment_days, -14, 45))

    result = []
    for product in products:
        product_sales = by_product.get(product["id"], [])
        group_key, supplier_name, supplier_configured = supplier_group(product)
        supplier_profile = supplier_profiles[group_key]
        stock_units = stock.get(product["id"], 0.0)
        open_order = open_orders.get(product["id"])
        open_order_quantity = float((open_order or {}).get("open_order_quantity") or 0.0)
        open_order_value = float((open_order or {}).get("open_order_value") or 0.0)
        open_order_count = int((open_order or {}).get("open_order_count") or 0)
        projected_stock_units = stock_units + open_order_quantity
        revenue = revenue_by_product.get(product["id"], 0.0)
        abc_class = abc.get(product["id"], "C")
        package_size = float(product["package_size"] or 1) or 1.0
        lead_time_days = int(product["lead_time_days"] or 7)
        review_cycle_days = int(supplier_profile["review_cycle_days"])
        minimum_stock = float(product["minimum_stock"] or 0)
        maximum_stock = float(product["maximum_stock"] or 0)
        marker = product["marker"] or ""

        qty_30 = window_qty(product_sales, min(30, observed_days))
        qty_60 = window_qty(product_sales, min(60, observed_days))
        qty_90 = window_qty(product_sales, min(90, observed_days))
        qty_180 = window_qty(product_sales, min(180, observed_days))
        qty_365 = window_qty(product_sales, min(365, observed_days))
        qty_all = sum(float(sale["quantity"] or 0) for sale in product_sales)
        max_single_sale = max((float(sale["quantity"] or 0) for sale in product_sales), default=0.0)
        dall = qty_all / observed_days
        out_of_current_mix = stock_units <= 0 and open_order_quantity <= 0 and qty_180 <= 0
        if out_of_current_mix:
            status = "out_of_mix"
            reason = "Sem estoque e sem venda recente; tratado como descontinuado ate nova evidencia."
            result.append(
                {
                    "product_id": product["id"],
                    "organization_id": product["organization_id"],
                    "source_code": product["source_code"],
                    "supplier_reference": product["supplier_reference"] or "",
                    "quote_code": product["supplier_reference"] or product["source_code"],
                    "name": product["name"],
                    "unit": product["unit"],
                    "brand_id": product["brand_id"] or "",
                    "brand_name": product["brand_name"] or "Sem marca",
                    "abc_class": abc_class,
                    "status": status,
                    "status_label": status_label(status),
                    "priority": 0,
                    "stock_units": round(stock_units, 2),
                    "open_order_quantity": round(open_order_quantity, 2),
                    "open_order_value": round(open_order_value, 2),
                    "open_order_count": open_order_count,
                    "projected_stock_units": round(projected_stock_units, 2),
                    "forecast_daily_demand": 0,
                    "avg_daily_demand": round(dall, 4),
                    "demand_total": round(qty_all, 2),
                    "max_single_sale": round(max_single_sale, 2),
                    "demand_30": round(qty_30, 2),
                    "demand_90": round(qty_90, 2),
                    "demand_180": round(qty_180, 2),
                    "coverage_days": None,
                    "projected_coverage_days": None,
                    "lead_time_days": lead_time_days,
                    "review_cycle_days": int(supplier_profile["review_cycle_days"]),
                    "target_coverage_days": 0,
                    "safety_stock": 0,
                    "reorder_point": 0,
                    "order_up_to": 0,
                    "suggested_quantity": 0,
                    "package_size": round(package_size, 2),
                    "estimated_value": 0,
                    "unit_cost": round(costs.get(product["id"], 0.0), 2),
                    "sale_price": round(prices.get(product["id"], 0.0), 2),
                    "margin_pct": None,
                    "trend_index": 1,
                    "variability": 0,
                    "intermittent": False,
                    "demand_signal": "none",
                    "sale_days_180": 0,
                    "sale_lines_180": 0,
                    "forecast_guardrail": False,
                    "revenue": round(revenue, 2),
                    "reason": reason,
                    "supplier_id": product["effective_supplier_id"] or "",
                    "supplier_name": supplier_name,
                    "supplier_phone": supplier_profile["contact_phone"],
                    "supplier_configured": supplier_configured,
                    "supplier_difficulty": supplier_profile["difficulty"],
                    "supplier_daily_purchase_value": round(supplier_profile["daily_purchase_value"], 2),
                    "supplier_days_to_order": supplier_profile["days_to_order"],
                    "supplier_target_adjustment_days": supplier_profile["target_adjustment_days"],
                    "supplier_active_skus": supplier_profile["active_skus"],
                    "out_of_current_mix": True,
                    "mix_decision_required": False,
                    "forced_purchase": False,
                }
            )
            continue
        horizon_180 = min(180, observed_days)
        start_180 = ref - timedelta(days=horizon_180 - 1)
        sales_180 = [
            sale
            for sale in product_sales
            if date.fromisoformat(str(sale["sold_at"])[:10]) >= start_180
        ]
        sale_days_180 = len({str(sale["sold_at"])[:10] for sale in sales_180})
        sale_lines_180 = len(sales_180)

        d30 = qty_30 / max(min(30, observed_days), 1)
        d60 = qty_60 / max(min(60, observed_days), 1)
        d90 = qty_90 / max(min(90, observed_days), 1)
        d180 = qty_180 / max(min(180, observed_days), 1)
        d365 = qty_365 / max(min(365, observed_days), 1)
        weighted = (0.30 * d30) + (0.25 * d60) + (0.20 * d90) + (0.15 * d180) + (0.10 * d365)
        trend_index = d90 / d365 if d365 > 0 else (1.4 if d90 > 0 else 1.0)
        trend_factor = clamp(0.85 + (trend_index * 0.15), 0.75, 1.25)
        forecast_daily = max(weighted * trend_factor, dall * 0.65)

        sparse_limit_days = max(6, math.ceil(horizon_180 * 0.08))
        sparse_demand = qty_180 > 0 and sale_days_180 <= sparse_limit_days
        recent_burst = sparse_demand and qty_30 >= max(qty_180 * 0.60, max_single_sale * 3.0, package_size * 6.0)
        demand_signal = "burst" if recent_burst else "sparse" if sparse_demand else "regular"
        forecast_guardrail = False
        if sparse_demand:
            sparse_forecast_cap = max(d180 * (1.25 if recent_burst else 1.10), d365 * 1.35, max_single_sale / 30.0)
            if forecast_daily > sparse_forecast_cap > 0:
                forecast_daily = sparse_forecast_cap
                forecast_guardrail = True

        intermittent = sale_days_180 <= 4 and qty_180 > 0
        if intermittent:
            forecast_daily = min(forecast_daily, max(d180, dall) * 0.85)

        daily_values = []
        daily_start = ref - timedelta(days=min(180, observed_days) - 1)
        daily_map: dict[str, float] = {}
        for sale in product_sales:
            sale_date = date.fromisoformat(str(sale["sold_at"])[:10])
            if sale_date >= daily_start:
                sale_day = sale_date.isoformat()
                daily_map[sale_day] = daily_map.get(sale_day, 0.0) + float(sale["quantity"] or 0)
        for offset in range(min(180, observed_days)):
            day = (daily_start + timedelta(days=offset)).isoformat()
            daily_values.append(daily_map.get(day, 0.0))
        std_daily = pstdev(daily_values) if len(daily_values) > 1 else 0.0
        variability = std_daily / forecast_daily if forecast_daily > 0 else 0.0

        target_by_abc = {"A": 45, "B": 35, "C": 25}[abc_class]
        configured_target = int(product["configured_target_days"] or target_by_abc)
        target_coverage_days = configured_target if configured_target != 45 or abc_class == "A" else target_by_abc
        target_coverage_days = int(clamp(target_coverage_days + int(supplier_profile["target_adjustment_days"]), 14, 120))
        if sparse_demand:
            target_coverage_days = min(target_coverage_days, 30)
            forecast_guardrail = True
        service_z = {"A": 1.65, "B": 1.28, "C": 0.84}[abc_class]
        std_cap_multiplier = 0.85 if sparse_demand else 1.50
        effective_std_daily = min(std_daily, forecast_daily * std_cap_multiplier) if forecast_daily > 0 else 0.0
        safety_stock = service_z * effective_std_daily * math.sqrt(max(lead_time_days + review_cycle_days, 1))
        if intermittent:
            safety_stock *= 0.55

        reorder_point = (forecast_daily * (lead_time_days + review_cycle_days)) + safety_stock + minimum_stock
        order_up_to = (forecast_daily * (lead_time_days + review_cycle_days + target_coverage_days)) + safety_stock + minimum_stock
        if sparse_demand:
            evidence_cap_units = max(package_size, max_single_sale * 2.0, qty_90 * 0.55, qty_180 * 0.40)
            if order_up_to > evidence_cap_units:
                order_up_to = evidence_cap_units
                forecast_guardrail = True
            reorder_point = min(reorder_point, order_up_to)
        if maximum_stock > 0:
            order_up_to = min(order_up_to, maximum_stock)
            reorder_point = min(reorder_point, order_up_to)
        raw_need = max(order_up_to - projected_stock_units, 0)

        coverage_days = None if forecast_daily <= 0 else stock_units / forecast_daily
        projected_coverage_days = None if forecast_daily <= 0 else projected_stock_units / forecast_daily
        suggested_quantity = 0.0
        status = "ok"
        reason = "Estoque cobre a demanda projetada dentro da politica atual."
        forced_purchase = marker == "force_one_more_purchase"
        low_confidence_repurchase = (
            projected_stock_units <= max(package_size, 3.0)
            and (
                forecast_daily <= 0.03
                or qty_90 <= 0
                or (sale_days_180 <= 2 and qty_180 <= max(package_size * 2, 4.0))
                or (projected_coverage_days is not None and projected_coverage_days <= 30 and intermittent)
            )
        )
        open_order_covers_need = open_order_quantity > 0 and raw_need <= 0

        if int(product["blocked_for_purchase"] or 0):
            status = "blocked"
            reason = "Produto descontinuado. Ainda conta como estoque existente, mas nao entra em compra futura."
        elif int(product["ignored_in_purchase_reports"] or 0):
            status = "ignored"
            reason = "Produto descontinuado. Ainda conta como estoque existente, mas nao entra em compra futura."
        elif open_order_covers_need:
            reason = "Pedido em aberto cobre a necessidade calculada; aguardar chegada antes de comprar novamente."
        elif forced_purchase:
            status = "buy_now"
            suggested_quantity = round_package(max(raw_need, package_size), package_size)
            reason = "Operador decidiu forcar mais uma compra antes de retirar o produto do mix."
        elif low_confidence_repurchase:
            status = "mix_review"
            reason = "Estoque esta acabando, mas a demanda nao justifica recompra automatica. Operador decide se tira do mix ou forca mais uma compra."
        elif forecast_daily <= 0:
            status = "no_demand"
            reason = "Sem demanda historica suficiente no periodo importado."
        elif projected_stock_units <= forecast_daily * max(lead_time_days, 1):
            status = "urgent"
            suggested_quantity = round_package(raw_need, package_size)
            reason = "Estoque projetado, ja considerando pedidos em aberto, nao cobre o prazo estimado ate reposicao."
        elif projected_stock_units <= reorder_point:
            status = "buy_now"
            suggested_quantity = round_package(raw_need, package_size)
            reason = "Estoque projetado abaixo do ponto de pedido calculado."
        elif projected_stock_units > max(order_up_to * 1.8, forecast_daily * 120) and revenue > 0:
            status = "excess"
            reason = "Estoque acima da cobertura alvo e do consumo projetado."
        elif projected_coverage_days is not None and projected_coverage_days <= target_coverage_days:
            status = "watch"
            reason = "Cobertura abaixo da meta, mas ainda acima do ponto de pedido."
        if forecast_guardrail and status in {"urgent", "buy_now", "watch"}:
            reason = f"{reason} Alvo limitado por historico esparso ou rajada recente."

        unit_cost = costs.get(product["id"], 0.0)
        sale_price = prices.get(product["id"], 0.0)
        estimated_value = suggested_quantity * unit_cost if unit_cost > 0 else 0.0
        margin_pct = ((sale_price - unit_cost) / sale_price * 100.0) if sale_price > 0 and unit_cost > 0 else None
        priority = 0.0
        priority += {"urgent": 100, "buy_now": 85, "mix_review": 70, "watch": 45, "excess": 20, "ok": 5, "no_demand": 0, "blocked": 0, "ignored": 0}[status]
        priority += {"A": 18, "B": 9, "C": 2}[abc_class]
        priority += clamp(revenue / 10000.0, 0, 18)
        if projected_coverage_days is not None:
            priority += clamp((target_coverage_days - projected_coverage_days) / max(target_coverage_days, 1) * 20, -10, 20)

        result.append(
            {
                "product_id": product["id"],
                "organization_id": product["organization_id"],
                "source_code": product["source_code"],
                "supplier_reference": product["supplier_reference"] or "",
                "quote_code": product["supplier_reference"] or product["source_code"],
                "name": product["name"],
                "unit": product["unit"],
                "brand_id": product["brand_id"] or "",
                "brand_name": product["brand_name"] or "Sem marca",
                "abc_class": abc_class,
                "status": status,
                "status_label": status_label(status),
                "priority": round(priority, 1),
                "stock_units": round(stock_units, 2),
                "open_order_quantity": round(open_order_quantity, 2),
                "open_order_value": round(open_order_value, 2),
                "open_order_count": open_order_count,
                "projected_stock_units": round(projected_stock_units, 2),
                "forecast_daily_demand": round(forecast_daily, 4),
                "avg_daily_demand": round(dall, 4),
                "demand_total": round(qty_all, 2),
                "max_single_sale": round(max_single_sale, 2),
                "demand_30": round(qty_30, 2),
                "demand_90": round(qty_90, 2),
                "demand_180": round(qty_180, 2),
                "coverage_days": round(coverage_days, 1) if coverage_days is not None else None,
                "projected_coverage_days": round(projected_coverage_days, 1) if projected_coverage_days is not None else None,
                "lead_time_days": lead_time_days,
                "review_cycle_days": review_cycle_days,
                "target_coverage_days": target_coverage_days,
                "safety_stock": round(safety_stock, 2),
                "reorder_point": round(reorder_point, 2),
                "order_up_to": round(order_up_to, 2),
                "suggested_quantity": round(suggested_quantity, 2),
                "package_size": round(package_size, 2),
                "estimated_value": round(estimated_value, 2),
                "unit_cost": round(unit_cost, 2),
                "sale_price": round(sale_price, 2),
                "margin_pct": round(margin_pct, 1) if margin_pct is not None else None,
                "trend_index": round(trend_index, 2),
                "variability": round(variability, 2),
                "intermittent": intermittent,
                "demand_signal": demand_signal,
                "sale_days_180": sale_days_180,
                "sale_lines_180": sale_lines_180,
                "forecast_guardrail": forecast_guardrail,
                "revenue": round(revenue, 2),
                "reason": reason,
                "supplier_id": product["effective_supplier_id"] or "",
                "supplier_name": supplier_name,
                "supplier_phone": supplier_profile["contact_phone"],
                "supplier_configured": supplier_configured,
                "supplier_difficulty": supplier_profile["difficulty"],
                "supplier_daily_purchase_value": round(supplier_profile["daily_purchase_value"], 2),
                "supplier_days_to_order": supplier_profile["days_to_order"],
                "supplier_target_adjustment_days": supplier_profile["target_adjustment_days"],
                "supplier_active_skus": supplier_profile["active_skus"],
                "out_of_current_mix": status in {"blocked", "ignored"},
                "mix_decision_required": status == "mix_review",
                "forced_purchase": forced_purchase,
            }
        )

    status_order = {"urgent": 0, "buy_now": 1, "mix_review": 2, "watch": 3, "excess": 4, "ok": 5, "no_demand": 6, "blocked": 7, "ignored": 8, "out_of_mix": 9}
    result.sort(key=lambda row: (status_order.get(row["status"], 9), -row["priority"], -row["revenue"]))
    summary = {
        "reference_date": ref.isoformat(),
        "observed_days": observed_days,
        "buy_now": sum(1 for row in result if row["status"] in {"urgent", "buy_now"}),
        "mix_review": sum(1 for row in result if row["status"] == "mix_review"),
        "watch": sum(1 for row in result if row["status"] == "watch"),
        "excess": sum(1 for row in result if row["status"] == "excess"),
        "no_demand": sum(1 for row in result if row["status"] == "no_demand"),
        "out_of_current_mix": sum(1 for row in result if row["status"] in {"blocked", "ignored", "out_of_mix"}),
        "critical_a": sum(1 for row in result if row["abc_class"] == "A" and row["status"] in {"urgent", "buy_now"}),
        "suggested_units": round(sum(row["suggested_quantity"] for row in result), 2),
        "estimated_value": round(sum(row["estimated_value"] for row in result), 2),
        "hard_suppliers": sum(1 for profile in supplier_profiles.values() if profile["difficulty"] == "hard"),
        "unknown_minimum_suppliers": sum(1 for profile in supplier_profiles.values() if profile["difficulty"] == "unknown"),
        "unconfigured_supplier_groups": sum(1 for profile in supplier_profiles.values() if not profile["configured"]),
    }
    return {"contract": "replenishment.v1", "period": period, "summary": summary, "rows": result[:limit] if limit else result}


def api_stock(conn: sqlite3.Connection) -> list[dict]:
    return api_replenishment(conn)["rows"][:80]
