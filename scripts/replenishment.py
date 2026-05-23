from __future__ import annotations

import math
import sqlite3
from datetime import date, timedelta

from db_helpers import date_where, max_activity_date, resolve_period, rows


WINDOWS = (30, 60, 90, 180, 365)
DEFAULT_LEAD_TIME_DAYS = 10
MIN_REVIEW_CYCLE_DAYS = 7
MAX_REVIEW_CYCLE_DAYS = 240
LARGE_PACKAGE_COVERAGE_DAYS = 150
HUGE_PACKAGE_COVERAGE_DAYS = 240
LONG_PRODUCT_REBUY_DAYS = 60


def _sale_day(sale: dict) -> date:
    cached = sale.get("_sold_day")
    if cached is not None:
        return cached
    day = date.fromisoformat(str(sale["sold_at"])[:10])
    sale["_sold_day"] = day
    return day


def _daily_std_from_totals(daily: dict[date, float], days: int) -> float:
    days = max(days, 1)
    if days <= 1:
        return 0.0
    total = sum(daily.values())
    mean_daily = total / days
    variance = (sum(value * value for value in daily.values()) / days) - (mean_daily * mean_daily)
    return math.sqrt(max(variance, 0.0))


def _build_product_metrics(product_sales: list[dict], ref: date, observed_days: int) -> dict:
    horizons = {days: min(days, observed_days) for days in WINDOWS}
    window_starts = {days: ref - timedelta(days=horizon - 1) for days, horizon in horizons.items()}
    qty_by_window = {days: 0.0 for days in WINDOWS}
    qty_all = 0.0
    max_single_sale = 0.0

    horizon_180 = horizons[180]
    start_180 = window_starts[180]
    start_30 = window_starts[30]
    daily_180: dict[date, float] = {}
    sale_days_30: set[date] = set()
    sale_lines_180 = 0
    sale_lines_30 = 0
    max_recent_sale = 0.0

    for sale in product_sales:
        sold_at = _sale_day(sale)
        quantity = float(sale["quantity"] or 0)
        max_line_quantity = float(sale.get("max_single_quantity") or quantity)
        line_count = int(sale.get("line_count") or 1)
        qty_all += quantity
        max_single_sale = max(max_single_sale, max_line_quantity)
        for days, start in window_starts.items():
            if sold_at >= start:
                qty_by_window[days] += quantity
        if sold_at >= start_180:
            daily_180[sold_at] = daily_180.get(sold_at, 0.0) + quantity
            sale_lines_180 += line_count
        if sold_at >= start_30:
            sale_days_30.add(sold_at)
            sale_lines_30 += line_count
            max_recent_sale = max(max_recent_sale, max_line_quantity)

    qty_30 = qty_by_window[30]
    qty_180 = qty_by_window[180]
    return {
        "qty_30": qty_30,
        "qty_60": qty_by_window[60],
        "qty_90": qty_by_window[90],
        "qty_180": qty_180,
        "qty_365": qty_by_window[365],
        "qty_all": qty_all,
        "max_single_sale": max_single_sale,
        "sale_days_180": len(daily_180),
        "sale_lines_180": sale_lines_180,
        "sale_days_30": len(sale_days_30),
        "sale_lines_30": sale_lines_30,
        "max_recent_sale": max_recent_sale,
        "recent_sale_share": max_recent_sale / qty_30 if qty_30 > 0 else 0.0,
        "recent_without_largest": max(qty_30 - max_recent_sale, 0.0),
        "std_daily_180": _daily_std_from_totals(daily_180, horizon_180),
        "d30": qty_30 / max(horizons[30], 1),
        "d60": qty_by_window[60] / max(horizons[60], 1),
        "d90": qty_by_window[90] / max(horizons[90], 1),
        "d180": qty_180 / max(horizon_180, 1),
        "d365": qty_by_window[365] / max(horizons[365], 1),
    }


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def round_package(quantity: float, package_size: float) -> float:
    package = package_size if package_size and package_size > 0 else 1.0
    if quantity <= 0:
        return 0.0
    return math.ceil(quantity / package) * package


def package_fit(raw_need: float, package_size: float, order_up_to: float) -> dict:
    rounded = round_package(raw_need, package_size)
    target = max(float(order_up_to or 0), 1.0)
    package = package_size if package_size and package_size > 0 else 1.0
    excess_units = max(rounded - raw_need, 0.0)
    return {
        "rounded_quantity": rounded,
        "excess_units": excess_units,
        "target_ratio": package / target,
        "requires_review": raw_need > 0 and package > target * 1.5,
        "blocks_auto": raw_need > 0 and package >= target * 3.0,
    }


def product_rebuy_policy(
    *,
    review_cycle_days: int,
    package_size: float,
    forecast_daily: float,
    adi_days: float | None = None,
    sale_days_180: int = 0,
    intermittent: bool = False,
    sparse_demand: bool = False,
) -> dict:
    package_days = package_size / forecast_daily if forecast_daily > 0 and package_size > 1 else None
    cadence_days = int(review_cycle_days or MIN_REVIEW_CYCLE_DAYS)
    source = "supplier_cycle"
    label = "Ciclo do fornecedor"
    reason = "Produto acompanha o ciclo calculado para formar pedido deste fornecedor."
    slow_signal = intermittent or sparse_demand or sale_days_180 <= 6

    if package_days is not None and package_days >= LARGE_PACKAGE_COVERAGE_DAYS:
        cadence_days = int(clamp(package_days, cadence_days, MAX_REVIEW_CYCLE_DAYS))
        source = "package_coverage"
        label = "Ciclo pela caixa"
        reason = "A menor compra possivel cobre muitos dias; este item nao precisa acompanhar todo pedido do fornecedor."
    elif package_days is not None and slow_signal and package_days >= max(cadence_days * 2, LONG_PRODUCT_REBUY_DAYS):
        cadence_days = int(clamp(package_days, cadence_days, MAX_REVIEW_CYCLE_DAYS))
        source = "package_coverage"
        label = "Ciclo pela caixa"
        reason = "A embalagem de compra alonga o intervalo natural de recompra deste item."
    elif adi_days is not None and slow_signal and adi_days >= max(cadence_days * 2, LONG_PRODUCT_REBUY_DAYS):
        cadence_days = int(clamp(adi_days, cadence_days, MAX_REVIEW_CYCLE_DAYS))
        source = "intermittent_sales"
        label = "Ciclo pelo giro"
        reason = "O intervalo medio entre dias com venda e maior que o ciclo do fornecedor."

    return {
        "days": cadence_days,
        "source": source,
        "label": label,
        "reason": reason,
        "package_coverage_days": round(package_days, 1) if package_days is not None else None,
    }


def order_horizon_policy(
    *,
    lead_time_days: int,
    review_cycle_days: int,
    target_coverage_days: int,
    target_mode: str,
    product_rebuy_interval_days: int,
) -> dict:
    lead_days = int(max(lead_time_days or DEFAULT_LEAD_TIME_DAYS, 0))
    cycle_days = int(
        clamp(
            max(review_cycle_days or 0, product_rebuy_interval_days or 0, MIN_REVIEW_CYCLE_DAYS),
            MIN_REVIEW_CYCLE_DAYS,
            MAX_REVIEW_CYCLE_DAYS,
        )
    )
    protection_days = int(lead_days + cycle_days)
    target_days = int(max(target_coverage_days or 0, 0))
    receipt_coverage_days = int(max(cycle_days, target_days))
    days = int(lead_days + receipt_coverage_days)
    if target_mode == "manual" and target_days >= cycle_days:
        source = "manual_coverage"
    elif target_days > cycle_days:
        source = "target_coverage"
    elif product_rebuy_interval_days and product_rebuy_interval_days > (review_cycle_days or 0):
        source = "product_rebuy_cycle"
    else:
        source = "lead_time_rebuy_cycle"
    return {
        "days": days,
        "cycle_days": cycle_days,
        "protection_days": protection_days,
        "target_days": target_days,
        "receipt_coverage_days": receipt_coverage_days,
        "source": source,
    }


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


def target_coverage_policy(
    *,
    abc_class: str,
    configured_target: int,
    target_mode: str,
    supplier_adjustment_days: int,
    lead_time_days: int,
    package_size: float,
    forecast_daily: float,
    qty_all: float,
    qty_180: float,
    sale_days_180: int,
    variability: float,
    intermittent: bool,
    sparse_demand: bool,
) -> dict:
    base_by_abc = {"A": 45, "B": 35, "C": 25}
    base = base_by_abc.get(abc_class, 25)
    manual = target_mode == "manual" and configured_target > 0
    package_days = package_size / forecast_daily if forecast_daily > 0 and package_size > 1 else None
    if manual:
        target = int(clamp(configured_target + supplier_adjustment_days, 14, 720))
        return {
            "days": target,
            "base_days": base,
            "mode": "manual",
            "identity": "manual",
            "label": "Manual",
            "reason": "Cobertura fixada manualmente para este produto.",
            "package_coverage_days": round(package_days, 1) if package_days is not None else None,
        }

    variable_adjustment = 0
    if variability >= 2.0:
        variable_adjustment += 18
    elif variability >= 1.2:
        variable_adjustment += 9
    lead_adjustment = int(clamp((lead_time_days - 7) * 0.4, 0, 14))
    slow_presence = qty_all > 0 and (sparse_demand or intermittent or sale_days_180 <= 6 or forecast_daily < 0.08)
    no_recent_presence = qty_all > 0 and qty_180 <= 0
    if package_days is not None and slow_presence:
        target = int(clamp(max(base, package_days), 30, 720))
        identity = "large_package_presence" if package_days >= 240 else "mix_presence"
        label = "Caixa grande / giro lento" if identity == "large_package_presence" else "Presenca de mix"
        reason = (
            "Produto lento, mas ativo no mix. A cobertura foi ajustada pela menor compra realista da embalagem."
        )
    elif slow_presence or no_recent_presence:
        target = int(clamp(30 if sparse_demand else max(base, 90), 30, 180))
        identity = "mix_presence"
        label = "Presenca de mix"
        reason = "Produto de giro lento mantido no mix; usa alvo minimo de presenca em vez de cortar pelo giro baixo."
    else:
        target = int(clamp(base + supplier_adjustment_days + variable_adjustment + lead_adjustment, 14, 120))
        identity = "steady_demand" if abc_class in {"A", "B"} else "regular_demand"
        label = "Giro forte" if abc_class == "A" else "Giro regular"
        reason = "Cobertura automatica por curva, fornecedor, prazo e variacao da demanda."

    return {
        "days": target,
        "base_days": base,
        "mode": "auto",
        "identity": identity,
        "label": label,
        "reason": reason,
        "package_coverage_days": round(package_days, 1) if package_days is not None else None,
    }


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
            COALESCE(ps.target_coverage_days, 0) AS configured_target_days,
            COALESCE(ps.target_coverage_mode, 'auto') AS target_coverage_mode,
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
            COALESCE(s.average_lead_time_days, 10) AS lead_time_days,
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
        f"""
        SELECT
            product_id,
            substr(sold_at, 1, 10) AS sold_at,
            SUM(quantity) AS quantity,
            SUM(gross_amount) AS gross_amount,
            MAX(quantity) AS max_single_quantity,
            COUNT(*) AS line_count
        FROM product_sales
        WHERE quantity > 0{period_sql}
        GROUP BY product_id, substr(sold_at, 1, 10)
        """,
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
            WHERE po.status IN ('pending_confirmation', 'approved', 'sent', 'partial_received')
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
    metrics_by_product = {
        product["id"]: _build_product_metrics(by_product.get(product["id"], []), ref, observed_days)
        for product in products
    }

    def supplier_group(product: dict) -> tuple[str, str, bool]:
        if product["effective_supplier_id"]:
            return f"supplier:{product['effective_supplier_id']}", product["supplier_name"] or "Fornecedor sem nome", True
        if product["brand_id"]:
            return f"brand:{product['brand_id']}", f"Marca {product['brand_name'] or 'sem marca'} - fornecedor a configurar", False
        return "unassigned", "Fornecedor a configurar", False

    supplier_profiles: dict[str, dict] = {}
    for product in products:
        group_key, group_name, configured = supplier_group(product)
        metrics = metrics_by_product[product["id"]]
        qty_365 = metrics["qty_365"]
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
                "lead_time_days": int(product["lead_time_days"] or DEFAULT_LEAD_TIME_DAYS),
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
            manual_cycle_days = int(profile["manual_review_cycle_days"] or 0)
            if manual_cycle_days and manual_cycle_days != 14:
                cycle_days = manual_cycle_days
            elif days_to_order is not None:
                cycle_days = int(clamp(days_to_order, MIN_REVIEW_CYCLE_DAYS, MAX_REVIEW_CYCLE_DAYS))
            else:
                cycle_days = 14
            adjustment_days = int(profile["manual_adjustment_days"] or 0)
            if not adjustment_days:
                adjustment_days = {"easy": -7, "normal": 0, "hard": 18, "unknown": 0}.get(difficulty, 0)

        profile["days_to_order"] = round(days_to_order, 1) if days_to_order is not None else None
        profile["difficulty"] = difficulty
        profile["review_cycle_days"] = int(clamp(cycle_days, MIN_REVIEW_CYCLE_DAYS, MAX_REVIEW_CYCLE_DAYS))
        profile["target_adjustment_days"] = int(clamp(adjustment_days, -14, 45))

    result = []
    for product in products:
        metrics = metrics_by_product[product["id"]]
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
        lead_time_days = int(product["lead_time_days"] or DEFAULT_LEAD_TIME_DAYS)
        review_cycle_days = int(supplier_profile["review_cycle_days"])
        minimum_stock = float(product["minimum_stock"] or 0)
        maximum_stock = float(product["maximum_stock"] or 0)
        marker = product["marker"] or ""

        qty_30 = metrics["qty_30"]
        qty_60 = metrics["qty_60"]
        qty_90 = metrics["qty_90"]
        qty_180 = metrics["qty_180"]
        qty_365 = metrics["qty_365"]
        qty_all = metrics["qty_all"]
        max_single_sale = metrics["max_single_sale"]
        dall = qty_all / observed_days
        out_of_current_mix = stock_units <= 0 and open_order_quantity <= 0 and qty_all <= 0
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
                    "target_coverage_base_days": 0,
                    "target_coverage_mode": product["target_coverage_mode"] or "auto",
                    "coverage_identity": "out_of_mix",
                    "coverage_identity_label": "Fora do mix",
                    "coverage_identity_reason": "Sem estoque, pedido aberto ou historico de venda importado.",
                    "package_coverage_days": None,
                    "product_rebuy_interval_days": 0,
                    "product_rebuy_interval_source": "none",
                    "product_rebuy_interval_label": "Sem ciclo",
                    "product_rebuy_interval_reason": "Sem demanda para estimar intervalo do produto.",
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
        sale_days_180 = metrics["sale_days_180"]
        sale_lines_180 = metrics["sale_lines_180"]
        sale_days_30 = metrics["sale_days_30"]
        sale_lines_30 = metrics["sale_lines_30"]
        max_recent_sale = metrics["max_recent_sale"]
        recent_sale_share = metrics["recent_sale_share"]

        d30 = metrics["d30"]
        d60 = metrics["d60"]
        d90 = metrics["d90"]
        d180 = metrics["d180"]
        d365 = metrics["d365"]
        weighted = (0.30 * d30) + (0.25 * d60) + (0.20 * d90) + (0.15 * d180) + (0.10 * d365)
        trend_index = d90 / d365 if d365 > 0 else (1.4 if d90 > 0 else 1.0)
        trend_factor = clamp(0.85 + (trend_index * 0.15), 0.75, 1.25)
        forecast_daily = max(weighted * trend_factor, dall * 0.65)

        sparse_limit_days = max(6, math.ceil(horizon_180 * 0.08))
        sparse_demand = qty_180 > 0 and sale_days_180 <= sparse_limit_days
        recent_burst = sparse_demand and qty_30 >= max(qty_180 * 0.60, max_single_sale * 3.0, package_size * 6.0)
        recent_without_largest = metrics["recent_without_largest"]
        isolated_recent_spike = (
            sparse_demand
            and qty_30 > 0
            and max_recent_sale >= max(package_size * 2.0, qty_180 * 0.30, 8.0)
            and recent_sale_share >= 0.70
            and recent_without_largest <= max(package_size, max_recent_sale * 0.25)
            and sale_lines_30 <= max(5, sale_days_30 + 2)
        )
        demand_signal = "single_spike" if isolated_recent_spike else "burst" if recent_burst else "sparse" if sparse_demand else "regular"
        forecast_guardrail = False
        if sparse_demand:
            if isolated_recent_spike:
                sparse_forecast_cap = max(
                    d180 * 1.15,
                    d365 * 1.25,
                    (recent_without_largest / max(min(30, observed_days), 1)) + (max_recent_sale / 120.0),
                )
            else:
                sparse_forecast_cap = max(d180 * (1.25 if recent_burst else 1.10), d365 * 1.35, max_single_sale / 30.0)
            if forecast_daily > sparse_forecast_cap > 0:
                forecast_daily = sparse_forecast_cap
                forecast_guardrail = True

        intermittent = sale_days_180 <= 4 and qty_180 > 0
        if intermittent:
            forecast_daily = min(forecast_daily, max(d180, dall) * 0.85)

        std_daily = metrics["std_daily_180"]
        variability = std_daily / forecast_daily if forecast_daily > 0 else 0.0

        configured_target = int(product["configured_target_days"] or 0)
        coverage_policy = target_coverage_policy(
            abc_class=abc_class,
            configured_target=configured_target,
            target_mode=product["target_coverage_mode"] or "auto",
            supplier_adjustment_days=int(supplier_profile["target_adjustment_days"]),
            lead_time_days=lead_time_days,
            package_size=package_size,
            forecast_daily=forecast_daily,
            qty_all=qty_all,
            qty_180=qty_180,
            sale_days_180=sale_days_180,
            variability=variability,
            intermittent=intermittent,
            sparse_demand=sparse_demand,
        )
        product_rebuy = product_rebuy_policy(
            review_cycle_days=review_cycle_days,
            package_size=package_size,
            forecast_daily=forecast_daily,
            adi_days=(horizon_180 / sale_days_180) if sale_days_180 > 0 else None,
            sale_days_180=sale_days_180,
            intermittent=intermittent,
            sparse_demand=sparse_demand,
        )
        explicit_manual_coverage = (product["target_coverage_mode"] or "auto") == "manual" and configured_target > 0
        target_coverage_days = int(coverage_policy["days"]) if explicit_manual_coverage else review_cycle_days
        order_horizon = order_horizon_policy(
            lead_time_days=lead_time_days,
            review_cycle_days=review_cycle_days,
            target_coverage_days=target_coverage_days,
            target_mode="manual" if explicit_manual_coverage else "auto",
            product_rebuy_interval_days=product_rebuy["days"],
        )
        if sparse_demand:
            forecast_guardrail = True
        service_z = {"A": 1.65, "B": 1.28, "C": 0.84}[abc_class]
        std_cap_multiplier = 0.85 if sparse_demand else 1.50
        effective_std_daily = min(std_daily, forecast_daily * std_cap_multiplier) if forecast_daily > 0 else 0.0
        safety_stock = service_z * effective_std_daily * math.sqrt(max(order_horizon["protection_days"], 1))
        if intermittent:
            safety_stock *= 0.55

        reorder_point = (forecast_daily * order_horizon["protection_days"]) + safety_stock + minimum_stock
        order_up_to = (forecast_daily * order_horizon["days"]) + safety_stock + minimum_stock
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
        package_math = package_fit(raw_need, package_size, order_up_to)
        package_review_required = False
        large_package_blocks_auto = False
        forced_purchase = marker == "force_one_more_purchase"
        stockout_with_recent_demand = projected_stock_units <= 0 and (qty_30 > 0 or qty_90 >= max(1.0, package_size * 0.5))
        low_confidence_repurchase = (
            projected_stock_units <= max(package_size, 3.0)
            and not stockout_with_recent_demand
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
        elif stockout_with_recent_demand and raw_need > 0:
            status = "urgent" if qty_30 > 0 else "buy_now"
            suggested_quantity = package_math["rounded_quantity"]
            reason = "Produto zerado com venda recente; reposicao deve entrar na cotacao antes de discutir mix."
        elif low_confidence_repurchase:
            status = "mix_review"
            if coverage_policy["identity"] in {"mix_presence", "large_package_presence"} and raw_need > 0:
                suggested_quantity = round_package(max(raw_need, package_size if package_size > 1 else 1.0), package_size)
                package_review_required = True
                reason = (
                    "Produto lento, mas ainda pertence ao mix. A menor recompra realista considera a embalagem; "
                    "revise se vale manter presenca, comprar sob demanda ou tirar do mix."
                )
            elif raw_need <= 0:
                reason = (
                    "Produto lento e de baixa evidencia, mas o estoque atual ja cobre o alvo tecnico; "
                    "nao ha compra sugerida agora."
                )
            else:
                reason = "Estoque esta acabando, mas a demanda nao justifica recompra automatica. Operador decide se tira do mix ou forca mais uma compra."
        elif forecast_daily <= 0:
            status = "no_demand"
            reason = "Sem demanda historica suficiente no periodo importado."
        elif raw_need <= 0:
            reason = "Alvo tecnico ja esta coberto ou limitado por teto maximo; nao ha necessidade bruta para comprar."
        elif (
            package_math["requires_review"]
            and abc_class != "A"
            and projected_stock_units > forecast_daily * max(lead_time_days, 1)
        ):
            status = "mix_review"
            package_review_required = True
            reason = (
                "Compra minima por embalagem fica maior que o alvo tecnico. "
                "Revise se vale comprar uma caixa inteira, ajustar cobertura ou manter sob demanda."
            )
        elif (
            isolated_recent_spike
            and not stockout_with_recent_demand
            and projected_stock_units > forecast_daily * max(lead_time_days, 1)
        ):
            status = "watch" if projected_coverage_days is not None and projected_coverage_days <= target_coverage_days else "ok"
            reason = (
                "Pico isolado recente nao justifica recompra automatica enquanto o estoque cobre o prazo de reposicao."
            )
        elif projected_stock_units <= forecast_daily * max(lead_time_days, 1):
            status = "urgent"
            suggested_quantity = package_math["rounded_quantity"]
            reason = "Estoque projetado, ja considerando pedidos em aberto, nao cobre o prazo estimado ate reposicao."
        elif projected_stock_units <= reorder_point:
            status = "buy_now"
            suggested_quantity = package_math["rounded_quantity"]
            reason = "Estoque projetado abaixo do ponto de pedido calculado."
        elif projected_stock_units > max(order_up_to * 1.8, forecast_daily * 120) and revenue > 0:
            status = "excess"
            reason = "Estoque acima do horizonte calculado e do consumo projetado."
        elif projected_coverage_days is not None and projected_coverage_days <= target_coverage_days:
            status = "watch"
            reason = "Cobertura abaixo da meta, mas ainda acima do ponto de pedido."
        package_coverage_days = package_size / forecast_daily if forecast_daily > 0 and package_size > 1 else None
        clear_package_rupture = stockout_with_recent_demand and (qty_30 > 0 or sale_days_180 >= 3 or abc_class in {"A", "B"})
        if package_coverage_days is not None and package_coverage_days >= LARGE_PACKAGE_COVERAGE_DAYS and suggested_quantity > 0:
            package_review_required = True
            if suggested_quantity > package_size:
                suggested_quantity = package_size
                package_math["rounded_quantity"] = suggested_quantity
                package_math["excess_units"] = max(suggested_quantity - raw_need, 0.0)
                reason = (
                    f"{reason} Uma caixa cobre cerca de {package_coverage_days:.0f} dias; "
                    "compra automatica limitada a uma caixa."
                )
            if package_coverage_days >= LARGE_PACKAGE_COVERAGE_DAYS and not clear_package_rupture and not forced_purchase:
                status = "mix_review"
                large_package_blocks_auto = True
                suggested_quantity = 0.0
                package_math["rounded_quantity"] = 0.0
                package_math["excess_units"] = 0.0
                reason = (
                    f"Caixa de compra cobre cerca de {package_coverage_days:.0f} dias de demanda. "
                    "Nao entrou no pedido automatico; revise se vale manter presenca, comprar sob demanda ou retirar."
                )
        if forecast_guardrail and status in {"urgent", "buy_now", "watch"}:
            reason = f"{reason} Alvo limitado por historico esparso ou rajada recente."
        if product_rebuy["source"] != "supplier_cycle" and status in {"urgent", "buy_now", "watch", "mix_review"}:
            reason = f"{reason} {product_rebuy['reason']}"
        if package_math["requires_review"] and status in {"urgent", "buy_now"}:
            reason = (
                f"{reason} Embalagem de compra ({package_size:g} un.) fica acima do alvo tecnico; "
                "a sugestao compra uma caixa minima e pode gerar excesso."
            )

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
                "target_coverage_base_days": coverage_policy["base_days"],
                "target_coverage_mode": coverage_policy["mode"],
                "order_horizon_days": order_horizon["days"],
                "order_horizon_source": order_horizon["source"],
                "coverage_identity": coverage_policy["identity"],
                "coverage_identity_label": coverage_policy["label"],
                "coverage_identity_reason": coverage_policy["reason"],
                "package_coverage_days": coverage_policy["package_coverage_days"],
                "product_rebuy_interval_days": product_rebuy["days"],
                "product_rebuy_interval_source": product_rebuy["source"],
                "product_rebuy_interval_label": product_rebuy["label"],
                "product_rebuy_interval_reason": product_rebuy["reason"],
                "safety_stock": round(safety_stock, 2),
                "reorder_point": round(reorder_point, 2),
                "order_up_to": round(order_up_to, 2),
                "suggested_quantity": round(suggested_quantity, 2),
                "package_size": round(package_size, 2),
                "package_excess_units": round(package_math["excess_units"], 2),
                "package_target_ratio": round(package_math["target_ratio"], 2),
                "package_review_required": package_review_required or (package_math["requires_review"] and status in {"urgent", "buy_now"}),
                "package_blocks_auto": (package_math["blocks_auto"] or large_package_blocks_auto) and status == "mix_review",
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
