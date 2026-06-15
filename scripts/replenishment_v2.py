from __future__ import annotations

import math
import sqlite3
from datetime import date, timedelta
from statistics import mean, pstdev

from db_helpers import max_activity_date, resolve_period, rows
from replenishment import (
    DEFAULT_LEAD_TIME_DAYS,
    MAX_REVIEW_CYCLE_DAYS,
    HUGE_PACKAGE_COVERAGE_DAYS,
    LARGE_PACKAGE_COVERAGE_DAYS,
    MIN_REVIEW_CYCLE_DAYS,
    abc_classes,
    clamp,
    package_fit,
    product_rebuy_policy,
    round_package,
    status_label,
    target_coverage_policy,
)


WINDOWS = (7, 14, 30, 60, 90, 180, 365)
DEMAND_CLASS_LABELS = {
    "new": "Produto novo",
    "regular": "Demanda regular",
    "seasonal": "Sazonal",
    "intermittent": "Intermitente",
    "lumpy": "Irregular",
    "erratic": "Erratica",
    "single_spike": "Pico isolado",
    "stockout_demand": "Ruptura com demanda",
    "dormant": "Dormente",
    "no_demand": "Sem demanda",
}


def _parse_day(value: object) -> date:
    return date.fromisoformat(str(value)[:10])


def _sale_day(sale: dict) -> date:
    cached = sale.get("_sold_day")
    if cached is not None:
        return cached
    day = _parse_day(sale["sold_at"])
    sale["_sold_day"] = day
    return day


def _shift_year(day: date, years: int) -> date:
    try:
        return day.replace(year=day.year - years)
    except ValueError:
        return day.replace(year=day.year - years, day=28)


def _sales_until_ref(sales: list[dict], ref: date) -> list[dict]:
    return [sale for sale in sales if _sale_day(sale) <= ref]


def _daily_std_from_totals(daily: dict[date, float], days: int) -> float:
    days = max(days, 1)
    if days <= 1:
        return 0.0
    total = sum(daily.values())
    mean_daily = total / days
    variance = (sum(value * value for value in daily.values()) / days) - (mean_daily * mean_daily)
    return math.sqrt(max(variance, 0.0))


def _seasonality_factor(
    product_sales: list[dict],
    ref: date,
    horizon_days: int,
    first_sale: date | None,
) -> dict:
    if not product_sales or first_sale is None:
        return {"factor": 1.0, "confidence": "none", "source": "none", "years": 0, "reason": "Historico insuficiente para sazonalidade."}

    horizon = int(clamp(horizon_days, 14, 90))
    factors = []
    for years_back in range(1, 6):
        period_start = _shift_year(ref + timedelta(days=1), years_back)
        period_end = period_start + timedelta(days=horizon - 1)
        year_start = date(period_start.year, 1, 1)
        year_end = date(period_start.year, 12, 31)
        if year_end < first_sale:
            continue
        active_start = max(year_start, first_sale)
        active_days = max((year_end - active_start).days + 1, 1)
        annual_qty = sum(
            float(sale["quantity"] or 0)
            for sale in product_sales
            if active_start <= _sale_day(sale) <= year_end
        )
        if annual_qty <= 0:
            continue
        period_qty = sum(
            float(sale["quantity"] or 0)
            for sale in product_sales
            if period_start <= _sale_day(sale) <= period_end
        )
        expected_qty = (annual_qty / active_days) * horizon
        if expected_qty > 0:
            factors.append(clamp(period_qty / expected_qty, 0.35, 2.40))

    if not factors:
        return {"factor": 1.0, "confidence": "none", "source": "none", "years": 0, "reason": "Sem anos comparaveis para sazonalidade."}

    factor = mean(factors)
    spread = pstdev(factors) if len(factors) > 1 else 0.0
    if len(factors) >= 3 and spread <= 0.45:
        confidence = "high"
    elif len(factors) >= 2:
        confidence = "medium"
    else:
        confidence = "low"
    return {
        "factor": round(factor, 4),
        "confidence": confidence,
        "source": "product",
        "years": len(factors),
        "reason": f"Sazonalidade calculada por {len(factors)} ano(s) comparavel(is) no horizonte futuro.",
    }


def _inherit_seasonality(product_profile: dict, fallback_profile: dict | None, source: str) -> dict:
    if product_profile["confidence"] in {"high", "medium"}:
        return product_profile
    if fallback_profile and fallback_profile["confidence"] in {"high", "medium"}:
        inherited = dict(fallback_profile)
        inherited["source"] = source
        inherited["reason"] = f"Sazonalidade herdada de {source} porque o produto ainda tem pouco historico."
        return inherited
    return product_profile


def _build_signals(product_sales: list[dict], ref: date) -> dict:
    product_sales = _sales_until_ref(product_sales, ref)
    window_starts = {days: ref - timedelta(days=days - 1) for days in WINDOWS}
    qty_by_window = {days: 0.0 for days in WINDOWS}
    qty_all = 0.0
    first_sale = None
    last_sale = None
    max_single_sale = 0.0
    for sale in product_sales:
        sold_at = _sale_day(sale)
        quantity = float(sale["quantity"] or 0)
        max_line_quantity = float(sale.get("max_single_quantity") or quantity)
        qty_all += quantity
        max_single_sale = max(max_single_sale, max_line_quantity)
        if first_sale is None or sold_at < first_sale:
            first_sale = sold_at
        if last_sale is None or sold_at > last_sale:
            last_sale = sold_at
        for days, start in window_starts.items():
            if sold_at >= start:
                qty_by_window[days] += quantity
    product_age_days = max((ref - first_sale).days + 1, 1) if first_sale else 0
    days_since_last_sale = (ref - last_sale).days if last_sale else None

    horizon_180 = max(min(180, product_age_days or 180), 1)
    start_180 = ref - timedelta(days=horizon_180 - 1)
    start_30 = ref - timedelta(days=29)
    daily_180: dict[date, float] = {}
    days_30: set[date] = set()
    sale_lines_180 = 0
    sale_lines_30 = 0
    max_recent_sale = 0.0
    for sale in product_sales:
        sold_at = _sale_day(sale)
        quantity = float(sale["quantity"] or 0)
        max_line_quantity = float(sale.get("max_single_quantity") or quantity)
        line_count = int(sale.get("line_count") or 1)
        if sold_at >= start_180:
            daily_180[sold_at] = daily_180.get(sold_at, 0.0) + quantity
            sale_lines_180 += line_count
        if sold_at >= start_30:
            days_30.add(sold_at)
            sale_lines_30 += line_count
            max_recent_sale = max(max_recent_sale, max_line_quantity)

    positive_180 = [qty for qty in daily_180.values() if qty > 0]
    sale_days_180 = len(daily_180)
    sale_days_30 = len(days_30)
    recent_sale_share = max_recent_sale / qty_by_window[30] if qty_by_window[30] > 0 else 0.0
    avg_positive_qty = mean(positive_180) if positive_180 else 0.0
    std_positive_qty = pstdev(positive_180) if len(positive_180) > 1 else 0.0
    cv2 = (std_positive_qty / avg_positive_qty) ** 2 if avg_positive_qty > 0 else 0.0
    adi_days = horizon_180 / sale_days_180 if sale_days_180 > 0 else None
    std_daily = _daily_std_from_totals(daily_180, horizon_180)
    long_daily = qty_all / product_age_days if product_age_days > 0 else 0.0

    return {
        "qty_7": qty_by_window[7],
        "qty_14": qty_by_window[14],
        "qty_30": qty_by_window[30],
        "qty_60": qty_by_window[60],
        "qty_90": qty_by_window[90],
        "qty_180": qty_by_window[180],
        "qty_365": qty_by_window[365],
        "qty_all": qty_all,
        "first_sale": first_sale,
        "last_sale": last_sale,
        "product_age_days": product_age_days,
        "days_since_last_sale": days_since_last_sale,
        "horizon_180": horizon_180,
        "sale_days_180": sale_days_180,
        "sale_lines_180": sale_lines_180,
        "sale_days_30": sale_days_30,
        "sale_lines_30": sale_lines_30,
        "max_recent_sale": max_recent_sale,
        "max_single_sale": max_single_sale,
        "recent_sale_share": recent_sale_share,
        "recent_without_largest": max(qty_by_window[30] - max_recent_sale, 0.0),
        "positive_day_avg_180": avg_positive_qty,
        "positive_day_cv2_180": cv2,
        "adi_days_180": adi_days,
        "std_daily_180": std_daily,
        "long_daily": long_daily,
        "d30": qty_by_window[30] / max(min(30, product_age_days or 30), 1),
        "d60": qty_by_window[60] / max(min(60, product_age_days or 60), 1),
        "d90": qty_by_window[90] / max(min(90, product_age_days or 90), 1),
        "d180": qty_by_window[180] / max(min(180, product_age_days or 180), 1),
        "d365": qty_by_window[365] / max(min(365, product_age_days or 365), 1),
    }


def _classify_demand(signals: dict, *, stock_units: float, projected_stock_units: float, package_size: float, seasonality: dict) -> dict:
    qty_all = signals["qty_all"]
    qty_30 = signals["qty_30"]
    qty_90 = signals["qty_90"]
    qty_180 = signals["qty_180"]
    age = signals["product_age_days"]
    sale_days_180 = signals["sale_days_180"]
    adi = signals["adi_days_180"]
    cv2 = signals["positive_day_cv2_180"]
    days_since_last = signals["days_since_last_sale"]
    recent_without_largest = signals["recent_without_largest"]
    sparse_limit_days = max(4, math.ceil(signals["horizon_180"] * 0.10))
    sparse = qty_180 > 0 and sale_days_180 <= sparse_limit_days
    isolated_recent_spike = (
        sparse
        and qty_30 > 0
        and signals["max_recent_sale"] >= max(package_size * 2.0, qty_180 * 0.30, 8.0)
        and signals["recent_sale_share"] >= 0.70
        and recent_without_largest <= max(package_size, signals["max_recent_sale"] * 0.25)
        and signals["sale_lines_30"] <= max(5, signals["sale_days_30"] + 2)
    )
    stockout_with_recent_demand = projected_stock_units <= 0 and (qty_30 > 0 or qty_90 >= max(1.0, package_size * 0.5))
    early_new_low_evidence = bool(qty_all > 0 and age <= 14 and sale_days_180 <= 2)
    low_evidence_stockout = bool(
        stockout_with_recent_demand
        and qty_30 <= 0
        and qty_90 <= max(1.0, package_size * 0.5)
        and sale_days_180 <= 2
    )

    if qty_all <= 0:
        demand_class = "no_demand"
    elif stockout_with_recent_demand:
        demand_class = "stockout_demand"
    elif isolated_recent_spike:
        demand_class = "single_spike"
    elif age and age <= 90:
        demand_class = "new"
    elif days_since_last is not None and days_since_last >= 180 and qty_180 <= 0:
        demand_class = "dormant"
    elif seasonality["confidence"] in {"high", "medium"} and abs(float(seasonality["factor"] or 1.0) - 1.0) >= 0.18:
        demand_class = "seasonal"
    elif sale_days_180 >= 18 and cv2 >= 1.50:
        demand_class = "erratic"
    elif adi is not None and adi >= 21 and cv2 >= 0.80:
        demand_class = "lumpy"
    elif adi is not None and adi >= 12:
        demand_class = "intermittent"
    else:
        demand_class = "regular"

    confidence = "high"
    if demand_class in {"new", "single_spike", "lumpy", "stockout_demand"}:
        confidence = "medium" if sale_days_180 >= 4 or qty_90 > 0 else "low"
    elif demand_class in {"intermittent", "erratic", "seasonal"}:
        confidence = "medium"
    elif demand_class in {"dormant", "no_demand"}:
        confidence = "low"
    elif sale_days_180 < 8 or age < 180:
        confidence = "medium"
    if early_new_low_evidence or low_evidence_stockout:
        confidence = "low"
    if stock_units <= 0 and qty_30 <= 0 and demand_class not in {"no_demand", "dormant"}:
        confidence = "medium"
    if low_evidence_stockout:
        confidence = "low"

    return {
        "class": demand_class,
        "label": DEMAND_CLASS_LABELS[demand_class],
        "confidence": confidence,
        "sparse": sparse,
        "isolated_recent_spike": isolated_recent_spike,
        "stockout_with_recent_demand": stockout_with_recent_demand,
        "early_new_low_evidence": early_new_low_evidence,
        "low_evidence_stockout": low_evidence_stockout,
    }


def _forecast_demand(signals: dict, classification: dict, seasonality: dict) -> dict:
    demand_class = classification["class"]
    weighted = (
        0.34 * signals["d30"]
        + 0.24 * signals["d60"]
        + 0.18 * signals["d90"]
        + 0.14 * signals["d180"]
        + 0.10 * signals["d365"]
    )
    trend_index = signals["d90"] / signals["d365"] if signals["d365"] > 0 else (1.25 if signals["d90"] > 0 else 1.0)
    trend_factor = clamp(0.88 + (trend_index * 0.12), 0.72, 1.28)
    long_floor = signals["long_daily"] * (0.70 if signals["product_age_days"] <= 180 else 0.55)
    base_daily = max(weighted * trend_factor, long_floor)
    method = "robust_weighted_windows"
    guardrail = False

    positive_avg = signals["positive_day_avg_180"]
    adi = signals["adi_days_180"] or signals["horizon_180"]
    croston_daily = positive_avg / max(adi, 1.0) if positive_avg > 0 else 0.0
    sba_daily = croston_daily * 0.95

    if demand_class == "new":
        base_daily = max(0.45 * signals["d30"] + 0.35 * signals["d60"] + 0.20 * signals["d90"], signals["long_daily"] * 0.85)
        method = "new_product_age_adjusted"
    elif demand_class == "stockout_demand":
        if classification["early_new_low_evidence"]:
            evidence_window = 30
            base_daily = max(
                signals["qty_30"] / evidence_window,
                signals["max_single_sale"] / 45.0,
                signals["qty_all"] / 45.0,
            )
            method = "stockout_discovery_batch"
            guardrail = True
        else:
            base_daily = max(signals["d30"], signals["d90"], signals["d180"] * 1.10, sba_daily)
            method = "stockout_censored_demand"
    elif demand_class in {"intermittent", "lumpy"}:
        base_daily = max((0.45 * weighted) + (0.55 * sba_daily), signals["d365"] * 0.85)
        method = "croston_sba_blend"
    elif demand_class == "erratic":
        base_daily = (0.65 * weighted * trend_factor) + (0.35 * signals["d180"])
        method = "erratic_robust_blend"
    elif demand_class == "single_spike":
        normal_recent = signals["recent_without_largest"] / max(min(30, signals["product_age_days"] or 30), 1)
        spike_memory = signals["max_recent_sale"] / 120.0
        base_daily = max(signals["d180"] * 1.10, signals["d365"] * 1.20, normal_recent + spike_memory)
        method = "single_spike_guardrail"
        guardrail = True
    elif demand_class == "dormant":
        days_since = signals["days_since_last_sale"] or 365
        decay = clamp(120.0 / max(days_since, 120), 0.12, 0.60)
        base_daily = min(signals["d365"], signals["long_daily"]) * decay
        method = "dormant_decay"
        guardrail = True
    elif demand_class == "no_demand":
        base_daily = 0.0
        method = "no_demand"

    seasonal_factor = float(seasonality.get("factor") or 1.0)
    if seasonality["confidence"] == "high":
        applied_factor = clamp(seasonal_factor, 0.70, 1.55)
    elif seasonality["confidence"] == "medium":
        applied_factor = clamp(seasonal_factor, 0.82, 1.32)
    elif seasonality["confidence"] == "low":
        applied_factor = clamp(seasonal_factor, 0.92, 1.15)
    else:
        applied_factor = 1.0
    p50 = max(base_daily * applied_factor, 0.0)

    uncertainty_by_class = {
        "regular": 0.22,
        "seasonal": 0.30,
        "new": 0.42,
        "intermittent": 0.52,
        "lumpy": 0.72,
        "erratic": 0.62,
        "single_spike": 0.60,
        "stockout_demand": 0.48,
        "dormant": 0.45,
        "no_demand": 0.00,
    }
    uncertainty = uncertainty_by_class[demand_class]
    p75 = p50 * (1.0 + uncertainty * 0.45)
    p90 = p50 * (1.0 + uncertainty * 0.90)

    if demand_class in {"single_spike", "intermittent", "lumpy", "dormant"}:
        evidence_cap = max(signals["d180"] * 1.45, signals["d365"] * 1.60, signals["max_single_sale"] / 45.0)
        if evidence_cap > 0 and p90 > evidence_cap:
            p90 = evidence_cap
            p75 = min(p75, p90)
            p50 = min(p50, p75)
            guardrail = True

    return {
        "p50": p50,
        "p75": p75,
        "p90": p90,
        "method": method,
        "trend_index": trend_index,
        "seasonality_factor_applied": applied_factor,
        "guardrail": guardrail,
    }


def _build_operation_profile(products: list[dict], signals_by_product: dict[str, dict], stock: dict, supplier_profiles: dict[str, dict]) -> dict:
    active_mix = 0
    sold_180 = 0
    recurring = 0
    intermittent = 0
    dormant = 0
    new_items = 0
    package_heavy = 0
    spike_like = 0
    total_age_days = 0
    aged_items = 0

    for product in products:
        signals = signals_by_product.get(product["id"]) or {}
        stock_units = float(stock.get(product["id"], 0.0) or 0.0)
        package_size = float(product["package_size"] or 1) or 1.0
        rough_daily = max(signals["d90"], signals["d180"], signals["d365"], signals["long_daily"])
        package_days = package_size / rough_daily if rough_daily > 0 and package_size > 1 else None
        has_activity = stock_units > 0 or signals["qty_365"] > 0
        if has_activity:
            active_mix += 1
        if signals["qty_180"] > 0:
            sold_180 += 1
        if signals["sale_days_180"] >= 18:
            recurring += 1
        if signals["qty_180"] > 0 and signals["sale_days_180"] <= 6:
            intermittent += 1
        if signals["qty_all"] > 0 and signals["qty_180"] <= 0:
            dormant += 1
        if signals["qty_all"] > 0 and signals["product_age_days"] <= 90:
            new_items += 1
        if package_days is not None and package_days >= LARGE_PACKAGE_COVERAGE_DAYS:
            package_heavy += 1
        if signals["qty_30"] > 0 and signals["recent_sale_share"] >= 0.70 and signals["max_recent_sale"] >= max(package_size * 2.0, 8.0):
            spike_like += 1
        if signals["product_age_days"] > 0:
            total_age_days += signals["product_age_days"]
            aged_items += 1

    active_base = max(active_mix, 1)
    sold_base = max(sold_180, 1)
    supplier_values = list(supplier_profiles.values())
    supplier_base = max(len(supplier_values), 1)
    long_supplier_count = sum(1 for profile in supplier_values if int(profile.get("review_cycle_days") or 0) >= 90)
    easy_supplier_count = sum(1 for profile in supplier_values if int(profile.get("review_cycle_days") or 0) <= 35)
    minimum_driven_count = sum(1 for profile in supplier_values if float(profile.get("days_to_order") or 0) >= 60)
    avg_supplier_cycle = sum(int(profile.get("review_cycle_days") or 0) for profile in supplier_values) / supplier_base

    intermittent_ratio = intermittent / sold_base
    recurring_ratio = recurring / sold_base
    dormant_ratio = dormant / active_base
    package_heavy_ratio = package_heavy / active_base
    new_ratio = new_items / active_base
    spike_ratio = spike_like / sold_base
    long_supplier_ratio = long_supplier_count / supplier_base
    easy_supplier_ratio = easy_supplier_count / supplier_base
    minimum_driven_ratio = minimum_driven_count / supplier_base

    scores = {
        "fast_turnover": round(clamp(recurring_ratio * (0.45 + easy_supplier_ratio * 0.55), 0, 1), 3),
        "intermittent_mix": round(clamp(intermittent_ratio * 0.70 + dormant_ratio * 0.30, 0, 1), 3),
        "package_heavy": round(clamp(package_heavy_ratio, 0, 1), 3),
        "supplier_minimum_driven": round(clamp(long_supplier_ratio * 0.55 + minimum_driven_ratio * 0.45, 0, 1), 3),
        "spiky_b2b": round(clamp(spike_ratio, 0, 1), 3),
        "new_mix": round(clamp(new_ratio, 0, 1), 3),
    }
    profile_key = max(scores, key=scores.get) if scores else "hybrid"
    if scores.get(profile_key, 0) < 0.18:
        profile_key = "hybrid"
    labels = {
        "fast_turnover": "Alto giro",
        "intermittent_mix": "Mix intermitente",
        "package_heavy": "Caixa pesada",
        "supplier_minimum_driven": "Pedido minimo dominante",
        "spiky_b2b": "Pedidos pontuais grandes",
        "new_mix": "Mix novo",
        "hybrid": "Operacao hibrida",
    }
    reason = (
        f"{active_mix} SKUs ativos; {round(intermittent_ratio * 100)}% dos SKUs com venda recente sao intermitentes; "
        f"{round(package_heavy_ratio * 100)}% dos ativos tem caixa que cobre {LARGE_PACKAGE_COVERAGE_DAYS}+ dias; "
        f"ciclo medio de fornecedor {round(avg_supplier_cycle, 1)} dias."
    )
    return {
        "profile_key": profile_key,
        "profile_label": labels.get(profile_key, "Operacao hibrida"),
        "scores": scores,
        "active_skus": active_mix,
        "sold_180_skus": sold_180,
        "recurring_ratio": round(recurring_ratio, 3),
        "intermittent_ratio": round(intermittent_ratio, 3),
        "dormant_ratio": round(dormant_ratio, 3),
        "package_heavy_ratio": round(package_heavy_ratio, 3),
        "new_ratio": round(new_ratio, 3),
        "spike_ratio": round(spike_ratio, 3),
        "long_supplier_ratio": round(long_supplier_ratio, 3),
        "minimum_driven_supplier_ratio": round(minimum_driven_ratio, 3),
        "average_supplier_cycle_days": round(avg_supplier_cycle, 1),
        "average_product_age_days": round(total_age_days / max(aged_items, 1), 1) if aged_items else 0,
        "reason": reason,
    }


def _policy_forecast(
    abc_class: str,
    supplier_difficulty: str,
    classification: dict,
    forecast: dict,
    operation_profile: dict | None = None,
) -> tuple[float, str]:
    demand_class = classification["class"]
    confidence = classification["confidence"]
    scores = (operation_profile or {}).get("scores") or {}
    intermittent_score = float(scores.get("intermittent_mix") or 0)
    package_score = float(scores.get("package_heavy") or 0)
    fast_score = float(scores.get("fast_turnover") or 0)
    if demand_class in {"no_demand", "dormant"}:
        return forecast["p50"], "p50"
    if demand_class == "new":
        if confidence == "low":
            return forecast["p50"], "p50"
        if float(scores.get("new_mix") or 0) >= 0.18 and abc_class == "C":
            return forecast["p50"], "p50"
        return forecast["p75"], "p75"
    if demand_class == "stockout_demand":
        if confidence == "low":
            return forecast["p50"], "p50"
        if abc_class == "A" or supplier_difficulty == "hard":
            return forecast["p90"], "p90"
        return forecast["p75"], "p75"
    if demand_class == "single_spike" and confidence != "high":
        return forecast["p50"], "p50"
    if demand_class in {"intermittent", "lumpy"} and (intermittent_score >= 0.35 or package_score >= 0.20):
        return forecast["p50"], "p50"
    if demand_class in {"regular", "seasonal"} and fast_score >= 0.45 and abc_class in {"A", "B"}:
        return forecast["p90"], "p90"
    if abc_class == "A" or supplier_difficulty == "hard":
        return forecast["p90"], "p90"
    if abc_class == "C" and confidence == "low":
        return forecast["p50"], "p50"
    return forecast["p75"], "p75"


def _supplier_cycle_horizon_policy(
    *,
    lead_time_days: int,
    review_cycle_days: int,
    manual_target_days: int,
    target_mode: str,
) -> dict:
    lead_days = int(max(lead_time_days or DEFAULT_LEAD_TIME_DAYS, 0))
    cycle_days = int(clamp(review_cycle_days or MIN_REVIEW_CYCLE_DAYS, MIN_REVIEW_CYCLE_DAYS, MAX_REVIEW_CYCLE_DAYS))
    manual_days = int(max(manual_target_days or 0, 0))
    if target_mode == "manual" and manual_days > cycle_days:
        receipt_days = manual_days
        source = "manual_coverage"
    else:
        receipt_days = cycle_days
        source = "supplier_cycle"
    return {
        "days": int(lead_days + receipt_days),
        "cycle_days": cycle_days,
        "protection_days": int(lead_days + cycle_days),
        "target_days": manual_days if target_mode == "manual" else cycle_days,
        "receipt_coverage_days": receipt_days,
        "source": source,
    }


def _demand_signal(demand_class: str) -> str:
    return {
        "single_spike": "single_spike",
        "intermittent": "sparse",
        "lumpy": "sparse",
        "erratic": "burst",
        "seasonal": "seasonal",
        "new": "new",
        "stockout_demand": "stockout",
        "dormant": "dormant",
        "no_demand": "none",
    }.get(demand_class, "regular")


def _supplier_group(product: dict) -> tuple[str, str, bool]:
    if product["effective_supplier_id"]:
        return f"supplier:{product['effective_supplier_id']}", product["supplier_name"] or "Fornecedor sem nome", True
    if product["brand_id"]:
        return f"brand:{product['brand_id']}", f"Marca {product['brand_name'] or 'sem marca'} - fornecedor a configurar", False
    return "unassigned", "Fornecedor a configurar", False


def _load_products(conn: sqlite3.Connection) -> list[dict]:
    return rows(
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


def _load_context(conn: sqlite3.Connection, period: dict) -> dict:
    date_to = period.get("date_to") or max_activity_date(conn)
    ref = date.fromisoformat(str(date_to)[:10]) if date_to else date.today()
    products = _load_products(conn)
    all_sales = rows(
        conn,
        """
        SELECT
            product_id,
            substr(sold_at, 1, 10) AS sold_at,
            SUM(quantity) AS quantity,
            SUM(gross_amount) AS gross_amount,
            MAX(quantity) AS max_single_quantity,
            COUNT(*) AS line_count
        FROM product_sales
        WHERE quantity > 0
          AND substr(sold_at, 1, 10) <= ?
        GROUP BY product_id, substr(sold_at, 1, 10)
        """,
        (ref.isoformat(),),
    )
    for sale in all_sales:
        sale["_sold_day"] = _parse_day(sale["sold_at"])
    if all_sales:
        ref = max(row["_sold_day"] for row in all_sales)
    first_global = min((row["_sold_day"] for row in all_sales), default=ref)
    observed_days = max((ref - first_global).days + 1, 1)

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
    for sale in all_sales:
        product_id = sale["product_id"]
        by_product.setdefault(product_id, []).append(sale)
        revenue_by_product[product_id] = revenue_by_product.get(product_id, 0.0) + float(sale["gross_amount"] or 0)
    return {
        "products": products,
        "ref": ref,
        "observed_days": observed_days,
        "sales_by_product": by_product,
        "revenue_by_product": revenue_by_product,
        "stock": stock,
        "costs": costs,
        "prices": prices,
        "open_orders": open_orders,
    }


def _build_supplier_profiles(products: list[dict], signals_by_product: dict[str, dict], costs: dict, prices: dict) -> dict[str, dict]:
    profiles: dict[str, dict] = {}
    for product in products:
        group_key, group_name, configured = _supplier_group(product)
        signals = signals_by_product.get(product["id"]) or {}
        qty_365 = signals["qty_365"]
        unit_cost = costs.get(product["id"], 0.0)
        sale_price = prices.get(product["id"], 0.0)
        purchase_unit_value = unit_cost if unit_cost > 0 else sale_price * 0.60
        active_days = max(min(365, signals["product_age_days"] or 365), 1)
        daily_purchase_value = (qty_365 / active_days) * purchase_unit_value
        profile = profiles.setdefault(
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

    for profile in profiles.values():
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
    return profiles


def _brand_seasonality(products: list[dict], by_product: dict[str, list[dict]], ref: date, horizon_days: int) -> dict[str, dict]:
    sales_by_brand: dict[str, list[dict]] = {}
    first_by_brand: dict[str, date] = {}
    product_brand = {product["id"]: product["brand_id"] or "" for product in products}
    for product_id, product_sales in by_product.items():
        brand_id = product_brand.get(product_id) or ""
        if not brand_id:
            continue
        sales_by_brand.setdefault(brand_id, []).extend(product_sales)
    for brand_id, brand_sales in sales_by_brand.items():
        first_by_brand[brand_id] = min((_sale_day(sale) for sale in brand_sales), default=ref)
    return {
        brand_id: _seasonality_factor(brand_sales, ref, horizon_days, first_by_brand.get(brand_id))
        for brand_id, brand_sales in sales_by_brand.items()
    }


def _reason_text(classification: dict, forecast: dict, seasonality: dict, status: str, base_reason: str) -> str:
    class_label = classification["label"]
    confidence = classification["confidence"]
    method = forecast["method"]
    parts = [f"{class_label} com confianca {confidence}; metodo {method}."]
    if seasonality["source"] != "none":
        parts.append(
            f"Sazonalidade {seasonality['source']} aplicada com fator {forecast['seasonality_factor_applied']:.2f}."
        )
    if forecast["guardrail"]:
        parts.append("Previsao limitada por trava de evidencia para evitar supercompra.")
    if status in {"urgent", "buy_now", "watch", "mix_review", "no_demand", "excess"}:
        parts.append(base_reason)
    return " ".join(parts)


def api_replenishment_v2(conn: sqlite3.Connection, limit: int = 300, period: dict | None = None) -> dict:
    period = period or resolve_period(conn, {"period_days": "all"})
    context = _load_context(conn, period)
    products = context["products"]
    ref = context["ref"]
    by_product = context["sales_by_product"]
    revenue_by_product = context["revenue_by_product"]
    stock = context["stock"]
    costs = context["costs"]
    prices = context["prices"]
    open_orders = context["open_orders"]
    abc = abc_classes(revenue_by_product)
    signals_by_product = {
        product["id"]: _build_signals(by_product.get(product["id"], []), ref)
        for product in products
    }
    supplier_profiles = _build_supplier_profiles(products, signals_by_product, costs, prices)
    operation_profile = _build_operation_profile(products, signals_by_product, stock, supplier_profiles)
    brand_seasonality = _brand_seasonality(products, by_product, ref, 45)

    result = []
    for product in products:
        product_sales = by_product.get(product["id"], [])
        signals = signals_by_product[product["id"]]
        group_key, supplier_name, supplier_configured = _supplier_group(product)
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
        seasonality = _seasonality_factor(product_sales, ref, max(45, lead_time_days + review_cycle_days), signals["first_sale"])
        seasonality = _inherit_seasonality(seasonality, brand_seasonality.get(product["brand_id"] or ""), "brand")
        classification = _classify_demand(
            signals,
            stock_units=stock_units,
            projected_stock_units=projected_stock_units,
            package_size=package_size,
            seasonality=seasonality,
        )
        forecast = _forecast_demand(signals, classification, seasonality)
        policy_daily, quantile_used = _policy_forecast(
            abc_class,
            supplier_profile["difficulty"],
            classification,
            forecast,
            operation_profile,
        )
        variability = signals["std_daily_180"] / policy_daily if policy_daily > 0 else 0.0

        configured_target = int(product["configured_target_days"] or 0)
        coverage_policy = target_coverage_policy(
            abc_class=abc_class,
            configured_target=configured_target,
            target_mode=product["target_coverage_mode"] or "auto",
            supplier_adjustment_days=int(supplier_profile["target_adjustment_days"]),
            lead_time_days=lead_time_days,
            package_size=package_size,
            forecast_daily=policy_daily,
            qty_all=signals["qty_all"],
            qty_180=signals["qty_180"],
            sale_days_180=signals["sale_days_180"],
            variability=variability,
            intermittent=classification["class"] in {"intermittent", "lumpy"},
            sparse_demand=classification["sparse"],
        )
        product_rebuy = product_rebuy_policy(
            review_cycle_days=review_cycle_days,
            package_size=package_size,
            forecast_daily=policy_daily,
            adi_days=signals["adi_days_180"],
            sale_days_180=signals["sale_days_180"],
            intermittent=classification["class"] in {"intermittent", "lumpy"},
            sparse_demand=classification["sparse"],
        )
        explicit_manual_coverage = (product["target_coverage_mode"] or "auto") == "manual" and configured_target > 0
        target_coverage_days = int(coverage_policy["days"]) if explicit_manual_coverage else review_cycle_days
        operation_scores = operation_profile.get("scores") or {}
        if explicit_manual_coverage and classification["class"] in {"single_spike", "intermittent", "lumpy"}:
            slow_cap = 28 if float(operation_scores.get("intermittent_mix") or 0) >= 0.35 or float(operation_scores.get("package_heavy") or 0) >= 0.20 else 35
            target_coverage_days = int(clamp(target_coverage_days, 14, slow_cap))
        if explicit_manual_coverage and classification["class"] == "new":
            target_coverage_days = int(clamp(target_coverage_days, 14, 45))
        if (
            explicit_manual_coverage
            and
            classification["class"] in {"regular", "seasonal"}
            and float(operation_scores.get("fast_turnover") or 0) >= 0.45
            and supplier_profile["difficulty"] in {"easy", "normal"}
        ):
            target_coverage_days = int(clamp(target_coverage_days, 14, 75))
        order_horizon = _supplier_cycle_horizon_policy(
            lead_time_days=lead_time_days,
            review_cycle_days=review_cycle_days,
            manual_target_days=target_coverage_days,
            target_mode="manual" if explicit_manual_coverage else "auto",
        )

        service_z = {"A": 1.65, "B": 1.28, "C": 0.84}[abc_class]
        std_cap_multiplier = 0.90 if classification["sparse"] else 1.60
        effective_std_daily = min(signals["std_daily_180"], policy_daily * std_cap_multiplier) if policy_daily > 0 else 0.0
        safety_stock = service_z * effective_std_daily * math.sqrt(max(order_horizon["protection_days"], 1))
        if classification["class"] in {"intermittent", "lumpy", "single_spike"}:
            safety_stock *= 0.65

        reorder_point = (policy_daily * order_horizon["protection_days"]) + safety_stock + minimum_stock
        order_up_to = (policy_daily * order_horizon["days"]) + safety_stock + minimum_stock
        forecast_guardrail = bool(forecast["guardrail"])
        if classification["class"] in {"single_spike", "intermittent", "lumpy"} and not classification["stockout_with_recent_demand"]:
            evidence_cap_units = max(package_size, signals["max_single_sale"] * 1.50, signals["qty_90"] * 0.70, signals["qty_180"] * 0.45)
            if evidence_cap_units > 0 and order_up_to > evidence_cap_units:
                order_up_to = evidence_cap_units
                reorder_point = min(reorder_point, order_up_to)
                forecast_guardrail = True
                forecast["guardrail"] = True
        if classification["class"] == "new":
            if classification["early_new_low_evidence"]:
                evidence_cap_units = max(package_size, signals["qty_all"] * 2.0, signals["max_single_sale"] * 2.0)
            elif signals["product_age_days"] <= 60:
                evidence_cap_units = max(package_size, signals["qty_90"] * 2.0, signals["max_single_sale"] * 2.5)
            else:
                evidence_cap_units = max(package_size, signals["qty_90"] * 2.5, signals["qty_180"] * 1.5)
            if evidence_cap_units > 0 and order_up_to > evidence_cap_units:
                order_up_to = evidence_cap_units
                reorder_point = min(reorder_point, order_up_to)
                forecast_guardrail = True
                forecast["guardrail"] = True
        if classification["class"] == "stockout_demand":
            if classification["early_new_low_evidence"]:
                evidence_cap_units = max(
                    package_size,
                    min(round_package(signals["max_single_sale"], package_size), package_size * 2.0),
                )
            elif classification["low_evidence_stockout"]:
                evidence_cap_units = package_size
            elif signals["product_age_days"] <= 60 and signals["sale_days_180"] <= 3:
                evidence_cap_units = max(package_size, signals["qty_90"] * 3.0, signals["max_single_sale"] * 2.0)
            else:
                evidence_cap_units = max(package_size, signals["qty_90"] * 2.0, signals["qty_180"] * 1.20, signals["max_single_sale"] * 2.0)
            if evidence_cap_units > 0 and order_up_to > evidence_cap_units:
                order_up_to = evidence_cap_units
                reorder_point = min(reorder_point, order_up_to)
                forecast_guardrail = True
                forecast["guardrail"] = True
        if maximum_stock > 0:
            order_up_to = min(order_up_to, maximum_stock)
            reorder_point = min(reorder_point, order_up_to)

        stock_for_need = projected_stock_units
        negative_stock_limited = False
        if classification["class"] == "stockout_demand" and classification["early_new_low_evidence"] and stock_for_need < 0:
            stock_for_need = 0.0
            negative_stock_limited = True
        raw_need = max(order_up_to - stock_for_need, 0)
        coverage_days = None if policy_daily <= 0 else stock_units / policy_daily
        projected_coverage_days = None if policy_daily <= 0 else projected_stock_units / policy_daily
        package_math = package_fit(raw_need, package_size, order_up_to)
        technical_quantity = package_math["rounded_quantity"] if raw_need > 0 else 0.0
        suggested_quantity = 0.0
        status = "ok"
        base_reason = "Estoque cobre a demanda projetada dentro da politica atual."
        package_review_required = False
        large_package_blocks_auto = False
        forced_purchase = marker == "force_one_more_purchase"
        open_order_covers_need = open_order_quantity > 0 and raw_need <= 0
        low_confidence_repurchase = (
            projected_stock_units <= max(package_size, 3.0)
            and not classification["stockout_with_recent_demand"]
            and classification["class"] in {"dormant", "intermittent", "lumpy", "single_spike", "no_demand"}
            and classification["confidence"] == "low"
        )

        if int(product["blocked_for_purchase"] or 0):
            status = "blocked"
            base_reason = "Produto descontinuado. Ainda conta como estoque existente, mas nao entra em compra futura."
        elif int(product["ignored_in_purchase_reports"] or 0):
            status = "ignored"
            base_reason = "Produto descontinuado. Ainda conta como estoque existente, mas nao entra em compra futura."
        elif stock_units <= 0 and open_order_quantity <= 0 and signals["qty_all"] <= 0:
            status = "out_of_mix"
            base_reason = "Sem estoque, pedido aberto ou venda registrada; fica fora da rotina ativa."
        elif open_order_covers_need:
            base_reason = "Pedido em aberto cobre a necessidade calculada; aguardar chegada antes de comprar novamente."
        elif forced_purchase:
            status = "buy_now"
            suggested_quantity = round_package(max(raw_need, package_size), package_size)
            base_reason = "Operador decidiu forcar mais uma compra antes de retirar o produto do mix."
        elif classification["stockout_with_recent_demand"] and raw_need > 0:
            status = "urgent"
            suggested_quantity = package_math["rounded_quantity"]
            base_reason = "Produto zerado com venda recente; demanda tratada como ruptura, nao como duvida de mix."
        elif low_confidence_repurchase:
            status = "mix_review"
            if coverage_policy["identity"] in {"mix_presence", "large_package_presence"} and raw_need > 0:
                suggested_quantity = round_package(max(raw_need, package_size if package_size > 1 else 1.0), package_size)
                package_review_required = True
            base_reason = "Baixa evidencia para recompra automatica; operador decide se mantem no mix, compra sob demanda ou retira."
        elif policy_daily <= 0:
            status = "no_demand"
            base_reason = "Sem demanda historica suficiente no periodo importado."
        elif raw_need <= 0:
            base_reason = "Alvo tecnico ja esta coberto ou limitado por teto maximo; nao ha necessidade bruta para comprar."
        elif (
            package_math["requires_review"]
            and abc_class != "A"
            and projected_stock_units > policy_daily * max(lead_time_days, 1)
        ):
            status = "mix_review"
            package_review_required = True
            base_reason = "Compra minima por embalagem fica maior que o alvo tecnico; revise antes de comprar caixa inteira."
        elif (
            classification["class"] == "single_spike"
            and not classification["stockout_with_recent_demand"]
            and projected_stock_units > forecast["p50"] * max(lead_time_days, 1)
        ):
            status = "watch" if projected_coverage_days is not None and projected_coverage_days <= target_coverage_days else "ok"
            base_reason = "Pico isolado recente nao justifica recompra automatica enquanto o estoque cobre o prazo de reposicao."
        elif projected_stock_units <= forecast["p50"] * max(lead_time_days, 1):
            status = "urgent"
            suggested_quantity = package_math["rounded_quantity"]
            base_reason = "Estoque projetado nao cobre o prazo estimado ate reposicao."
        elif projected_stock_units <= reorder_point:
            status = "buy_now"
            suggested_quantity = package_math["rounded_quantity"]
            base_reason = "Estoque projetado abaixo do ponto de pedido calculado."
        elif projected_stock_units > max(order_up_to * 1.8, policy_daily * 120) and revenue > 0:
            status = "excess"
            base_reason = "Estoque acima do horizonte calculado e do consumo projetado."
        elif projected_coverage_days is not None and projected_coverage_days <= target_coverage_days:
            status = "watch"
            base_reason = "Cobertura abaixo da meta, mas ainda acima do ponto de pedido."
        package_coverage_days = package_size / policy_daily if policy_daily > 0 and package_size > 1 else None
        clear_package_rupture = classification["stockout_with_recent_demand"] and (
            signals["qty_30"] > 0 or signals["sale_days_180"] >= 3 or abc_class in {"A", "B"}
        )
        small_package_topoff = (
            package_size > 1
            and raw_need > 0
            and raw_need <= max(1.0, package_size * 0.25)
            and projected_stock_units > forecast["p50"] * max(lead_time_days, 1)
            and not classification["stockout_with_recent_demand"]
            and not forced_purchase
        )
        if small_package_topoff and suggested_quantity > 0 and status in {"urgent", "buy_now"}:
            status = "watch"
            package_review_required = True
            suggested_quantity = 0.0
            technical_quantity = raw_need
            package_math["rounded_quantity"] = 0.0
            package_math["excess_units"] = 0.0
            base_reason = (
                f"Necessidade bruta de {raw_need:g} un. e menor que a embalagem de compra "
                f"({package_size:g} un.); estoque cobre o prazo. Nao gera compra automatica."
            )
        if package_coverage_days is not None and package_coverage_days >= LARGE_PACKAGE_COVERAGE_DAYS and suggested_quantity > 0:
            package_review_required = True
            if suggested_quantity > package_size:
                suggested_quantity = package_size
                package_math["rounded_quantity"] = suggested_quantity
                package_math["excess_units"] = max(suggested_quantity - raw_need, 0.0)
                base_reason = (
                    f"{base_reason} Uma caixa cobre cerca de {package_coverage_days:.0f} dias; "
                    "compra automatica limitada a uma caixa."
                )
            if package_coverage_days >= LARGE_PACKAGE_COVERAGE_DAYS and not clear_package_rupture and not forced_purchase:
                status = "mix_review"
                large_package_blocks_auto = True
                suggested_quantity = 0.0
                package_math["rounded_quantity"] = 0.0
                package_math["excess_units"] = 0.0
                base_reason = (
                    f"Caixa de compra cobre cerca de {package_coverage_days:.0f} dias de demanda. "
                    "Nao entrou no pedido automatico; revise se vale manter presenca, comprar sob demanda ou retirar."
                )

        if package_math["requires_review"] and status in {"urgent", "buy_now"}:
            base_reason = (
                f"{base_reason} Embalagem de compra ({package_size:g} un.) fica acima do alvo tecnico; "
                "a sugestao compra uma caixa minima e pode gerar excesso."
            )
        if product_rebuy["source"] != "supplier_cycle" and status in {"urgent", "buy_now", "watch", "mix_review"}:
            base_reason = f"{base_reason} {product_rebuy['reason']}"

        risk_gap_days = None
        stockout_risk_days = None
        after_purchase_stock_units = projected_stock_units + suggested_quantity
        after_purchase_coverage_days = None
        after_purchase_excess_days = None
        after_purchase_excess_units = max(after_purchase_stock_units - order_up_to, 0.0)
        if policy_daily > 0:
            risk_gap_days = max(order_horizon["protection_days"] - (projected_coverage_days or 0), 0.0)
            stockout_risk_days = max(lead_time_days - (projected_coverage_days or 0), 0.0)
            after_purchase_coverage_days = after_purchase_stock_units / policy_daily
            after_purchase_excess_days = max(after_purchase_coverage_days - order_horizon["days"], 0.0)

        if status in {"blocked", "ignored", "out_of_mix"}:
            purchase_decision = "blocked"
            purchase_decision_label = "Fora da compra"
        elif open_order_covers_need:
            purchase_decision = "wait_open_order"
            purchase_decision_label = "Aguardar pedido"
        elif status == "urgent":
            purchase_decision = "required"
            purchase_decision_label = "Essencial"
        elif status == "buy_now":
            purchase_decision = "required"
            purchase_decision_label = "Comprar"
        elif status == "mix_review":
            purchase_decision = "review"
            purchase_decision_label = "Revisar"
        elif status == "watch":
            purchase_decision = "watch"
            purchase_decision_label = "Observar"
        elif status == "excess":
            purchase_decision = "excess"
            purchase_decision_label = "Excesso"
        elif status == "no_demand":
            purchase_decision = "no_demand"
            purchase_decision_label = "Sem demanda"
        else:
            purchase_decision = "defer"
            purchase_decision_label = "Aguardar"

        unit_cost = costs.get(product["id"], 0.0)
        sale_price = prices.get(product["id"], 0.0)
        estimated_value = suggested_quantity * unit_cost if unit_cost > 0 else 0.0
        margin_pct = ((sale_price - unit_cost) / sale_price * 100.0) if sale_price > 0 and unit_cost > 0 else None
        priority = 0.0
        priority += {"urgent": 100, "buy_now": 85, "mix_review": 70, "watch": 45, "excess": 20, "ok": 5, "no_demand": 0, "blocked": 0, "ignored": 0, "out_of_mix": 0}[status]
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
                "stock_for_need": round(stock_for_need, 2),
                "negative_stock_limited": negative_stock_limited,
                "forecast_daily_demand": round(policy_daily, 4),
                "avg_daily_demand": round(signals["long_daily"], 4),
                "demand_total": round(signals["qty_all"], 2),
                "max_single_sale": round(signals["max_single_sale"], 2),
                "demand_30": round(signals["qty_30"], 2),
                "demand_90": round(signals["qty_90"], 2),
                "demand_180": round(signals["qty_180"], 2),
                "coverage_days": round(coverage_days, 1) if coverage_days is not None else None,
                "projected_coverage_days": round(projected_coverage_days, 1) if projected_coverage_days is not None else None,
                "lead_time_days": lead_time_days,
                "review_cycle_days": review_cycle_days,
                "target_coverage_days": target_coverage_days,
                "target_coverage_base_days": coverage_policy["base_days"],
                "target_coverage_mode": coverage_policy["mode"],
                "order_horizon_days": order_horizon["days"],
                "order_horizon_source": order_horizon["source"],
                "order_horizon_cycle_days": order_horizon["cycle_days"],
                "order_horizon_protection_days": order_horizon["protection_days"],
                "order_horizon_target_days": order_horizon["target_days"],
                "order_horizon_receipt_coverage_days": order_horizon["receipt_coverage_days"],
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
                "raw_need": round(raw_need, 2),
                "rounded_need": round(package_math["rounded_quantity"], 2),
                "technical_quantity": round(technical_quantity, 2),
                "suggested_quantity": round(suggested_quantity, 2),
                "risk_gap_days": round(risk_gap_days, 1) if risk_gap_days is not None else None,
                "stockout_risk_days": round(stockout_risk_days, 1) if stockout_risk_days is not None else None,
                "after_purchase_stock_units": round(after_purchase_stock_units, 2),
                "after_purchase_coverage_days": round(after_purchase_coverage_days, 1) if after_purchase_coverage_days is not None else None,
                "after_purchase_excess_days": round(after_purchase_excess_days, 1) if after_purchase_excess_days is not None else None,
                "after_purchase_excess_units": round(after_purchase_excess_units, 2),
                "purchase_decision": purchase_decision,
                "purchase_decision_label": purchase_decision_label,
                "purchase_decision_reason": base_reason,
                "package_size": round(package_size, 2),
                "package_excess_units": round(package_math["excess_units"], 2),
                "package_target_ratio": round(package_math["target_ratio"], 2),
                "package_review_required": package_review_required or (package_math["requires_review"] and status in {"urgent", "buy_now"}),
                "package_blocks_auto": (package_math["blocks_auto"] or large_package_blocks_auto) and status == "mix_review",
                "estimated_value": round(estimated_value, 2),
                "unit_cost": round(unit_cost, 2),
                "sale_price": round(sale_price, 2),
                "margin_pct": round(margin_pct, 1) if margin_pct is not None else None,
                "trend_index": round(forecast["trend_index"], 2),
                "variability": round(variability, 2),
                "intermittent": classification["class"] in {"intermittent", "lumpy"},
                "demand_signal": _demand_signal(classification["class"]),
                "sale_days_180": signals["sale_days_180"],
                "sale_lines_180": signals["sale_lines_180"],
                "forecast_guardrail": forecast_guardrail,
                "revenue": round(revenue, 2),
                "reason": _reason_text(classification, forecast, seasonality, status, base_reason),
                "supplier_id": product["effective_supplier_id"] or "",
                "supplier_name": supplier_name,
                "supplier_phone": supplier_profile["contact_phone"],
                "supplier_configured": supplier_configured,
                "supplier_difficulty": supplier_profile["difficulty"],
                "supplier_daily_purchase_value": round(supplier_profile["daily_purchase_value"], 2),
                "supplier_days_to_order": supplier_profile["days_to_order"],
                "supplier_target_adjustment_days": supplier_profile["target_adjustment_days"],
                "supplier_active_skus": supplier_profile["active_skus"],
                "out_of_current_mix": status in {"blocked", "ignored", "out_of_mix"},
                "mix_decision_required": status == "mix_review",
                "forced_purchase": forced_purchase,
                "operation_profile_key": operation_profile["profile_key"],
                "operation_profile_label": operation_profile["profile_label"],
                "demand_class": classification["class"],
                "demand_class_label": classification["label"],
                "demand_confidence": classification["confidence"],
                "demand_method": forecast["method"],
                "demand_daily_p50": round(forecast["p50"], 4),
                "demand_daily_p75": round(forecast["p75"], 4),
                "demand_daily_p90": round(forecast["p90"], 4),
                "demand_quantile_used": quantile_used,
                "product_age_days": signals["product_age_days"],
                "first_sale_date": signals["first_sale"].isoformat() if signals["first_sale"] else "",
                "last_sale_date": signals["last_sale"].isoformat() if signals["last_sale"] else "",
                "days_since_last_sale": signals["days_since_last_sale"],
                "adi_days_180": round(signals["adi_days_180"], 2) if signals["adi_days_180"] is not None else None,
                "cv2_180": round(signals["positive_day_cv2_180"], 2),
                "seasonality_factor": round(float(seasonality.get("factor") or 1.0), 4),
                "seasonality_factor_applied": round(forecast["seasonality_factor_applied"], 4),
                "seasonality_confidence": seasonality["confidence"],
                "seasonality_source": seasonality["source"],
                "seasonality_years": seasonality["years"],
                "seasonality_reason": seasonality["reason"],
            }
        )

    status_order = {"urgent": 0, "buy_now": 1, "mix_review": 2, "watch": 3, "excess": 4, "ok": 5, "no_demand": 6, "blocked": 7, "ignored": 8, "out_of_mix": 9}
    result.sort(key=lambda row: (status_order.get(row["status"], 9), -row["priority"], -row["revenue"]))
    summary = {
        "reference_date": ref.isoformat(),
        "observed_days": context["observed_days"],
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
        "demand_classes": {
            demand_class: sum(1 for row in result if row["demand_class"] == demand_class)
            for demand_class in DEMAND_CLASS_LABELS
        },
        "seasonal_items": sum(1 for row in result if row["seasonality_source"] != "none"),
        "operation_profile": operation_profile,
    }
    return {"contract": "replenishment.v2", "period": period, "summary": summary, "rows": result[:limit] if limit else result}


def api_replenishment_v2_compare(conn: sqlite3.Connection, period: dict | None = None, limit: int = 80) -> dict:
    from replenishment import api_replenishment

    period = period or resolve_period(conn, {"period_days": "all"})
    v1 = api_replenishment(conn, limit=0, period=period)
    v2 = api_replenishment_v2(conn, limit=0, period=period)
    v1_by_product = {row["product_id"]: row for row in v1["rows"]}
    comparisons = []
    for row in v2["rows"]:
        old = v1_by_product.get(row["product_id"])
        if not old:
            continue
        suggested_delta = round(row["suggested_quantity"] - float(old.get("suggested_quantity") or 0), 2)
        target_delta = round(row["order_up_to"] - float(old.get("order_up_to") or 0), 2)
        status_changed = row["status"] != old.get("status")
        meaningful_quantity_change = abs(suggested_delta) >= max(1.0, row["package_size"] * 0.5)
        if status_changed or meaningful_quantity_change or abs(target_delta) >= max(5.0, row["package_size"]):
            comparisons.append(
                {
                    "product_id": row["product_id"],
                    "source_code": row["source_code"],
                    "name": row["name"],
                    "supplier_name": row["supplier_name"],
                    "v1_status": old.get("status"),
                    "v2_status": row["status"],
                    "v1_suggested_quantity": old.get("suggested_quantity"),
                    "v2_suggested_quantity": row["suggested_quantity"],
                    "suggested_delta": suggested_delta,
                    "v1_order_up_to": old.get("order_up_to"),
                    "v2_order_up_to": row["order_up_to"],
                    "target_delta": target_delta,
                    "v1_forecast_daily": old.get("forecast_daily_demand"),
                    "v2_forecast_daily": row["forecast_daily_demand"],
                    "demand_class": row["demand_class"],
                    "demand_confidence": row["demand_confidence"],
                    "seasonality_source": row["seasonality_source"],
                    "reason": row["reason"],
                }
            )
    comparisons.sort(key=lambda row: (row["v1_status"] == row["v2_status"], -abs(row["target_delta"]), -abs(row["suggested_delta"])))
    summary = {
        "v1_estimated_value": v1["summary"]["estimated_value"],
        "v2_estimated_value": v2["summary"]["estimated_value"],
        "estimated_value_delta": round(v2["summary"]["estimated_value"] - v1["summary"]["estimated_value"], 2),
        "v1_buy_now": v1["summary"]["buy_now"],
        "v2_buy_now": v2["summary"]["buy_now"],
        "status_changes": sum(1 for row in comparisons if row["v1_status"] != row["v2_status"]),
        "quantity_changes": sum(1 for row in comparisons if row["suggested_delta"] != 0),
        "comparison_rows": len(comparisons),
    }
    focus_codes = {"00000357", "00003725", "357", "3725"}
    focus_rows = [row for row in comparisons if row["source_code"] in focus_codes or row["supplier_name"].upper() == "OU"]
    return {
        "contract": "replenishment_v2_compare.v1",
        "period": period,
        "summary": summary,
        "focus_rows": focus_rows[:40],
        "rows": comparisons[:limit] if limit else comparisons,
    }
