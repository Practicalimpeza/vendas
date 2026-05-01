from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Iterable


@dataclass(frozen=True)
class CustomerSale:
    customer_id: str
    sold_at: date
    amount: Decimal


@dataclass(frozen=True)
class RFMRow:
    customer_id: str
    recency_days: int
    frequency: int
    monetary: Decimal
    segment: str


def build_rfm_segments(sales: Iterable[CustomerSale], reference_date: date) -> list[RFMRow]:
    grouped: dict[str, list[CustomerSale]] = {}
    for sale in sales:
        grouped.setdefault(sale.customer_id, []).append(sale)

    rows: list[RFMRow] = []
    for customer_id, items in grouped.items():
        last_purchase = max(item.sold_at for item in items)
        recency = (reference_date - last_purchase).days
        frequency = len(items)
        monetary = sum((item.amount for item in items), Decimal("0"))
        if recency <= 30 and frequency >= 4:
            segment = "fiel"
        elif recency > 90 and monetary > 0:
            segment = "em_risco"
        elif frequency == 1:
            segment = "novo_ou_pontual"
        else:
            segment = "ativo"
        rows.append(RFMRow(customer_id, recency, frequency, monetary, segment))
    return sorted(rows, key=lambda row: (row.segment != "em_risco", -row.monetary))
