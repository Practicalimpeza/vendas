from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_CEILING


@dataclass(frozen=True)
class PurchaseSuggestion:
    product_id: str
    target_stock: Decimal
    projected_stock: Decimal
    suggested_quantity: Decimal
    suggested_boxes: Decimal
    coverage_days: Decimal
    status: str


def _ceil_decimal(value: Decimal) -> Decimal:
    return value.to_integral_value(rounding=ROUND_CEILING)


def suggest_purchase(
    *,
    product_id: str,
    stock_on_hand: Decimal,
    pending_purchase_quantity: Decimal,
    average_daily_demand: Decimal,
    target_coverage_days: int = 45,
    package_size: Decimal = Decimal("1"),
    blocked: bool = False,
) -> PurchaseSuggestion:
    projected_stock = stock_on_hand + pending_purchase_quantity
    target_stock = _ceil_decimal(average_daily_demand * Decimal(target_coverage_days))
    package_size = package_size if package_size > 0 else Decimal("1")

    if average_daily_demand <= 0:
        status = "sem_demanda"
        suggested_boxes = Decimal("0")
    elif blocked:
        status = "bloqueado"
        suggested_boxes = Decimal("0")
    elif projected_stock >= target_stock:
        status = "estoque_ok"
        suggested_boxes = Decimal("0")
    else:
        needed_units = target_stock - projected_stock
        suggested_boxes = _ceil_decimal(needed_units / package_size)
        status = "comprar"

    suggested_quantity = suggested_boxes * package_size
    coverage_days = Decimal("999999") if average_daily_demand <= 0 else projected_stock / average_daily_demand
    return PurchaseSuggestion(
        product_id=product_id,
        target_stock=target_stock,
        projected_stock=projected_stock,
        suggested_quantity=suggested_quantity,
        suggested_boxes=suggested_boxes,
        coverage_days=coverage_days,
        status=status,
    )
