from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Iterable


@dataclass(frozen=True)
class ABCInput:
    product_id: str
    amount: Decimal


@dataclass(frozen=True)
class ABCRow:
    product_id: str
    amount: Decimal
    share: Decimal
    cumulative_share: Decimal
    abc_class: str


def classify_abc(rows: Iterable[ABCInput], a_limit: Decimal = Decimal("0.80"), b_limit: Decimal = Decimal("0.95")) -> list[ABCRow]:
    ordered = sorted(rows, key=lambda row: row.amount, reverse=True)
    total = sum((row.amount for row in ordered), Decimal("0"))
    if total <= 0:
        return [
            ABCRow(row.product_id, row.amount, Decimal("0"), Decimal("0"), "C")
            for row in ordered
        ]

    cumulative = Decimal("0")
    result: list[ABCRow] = []
    for row in ordered:
        share = row.amount / total
        cumulative += share
        abc_class = "A" if cumulative <= a_limit else "B" if cumulative <= b_limit else "C"
        result.append(ABCRow(row.product_id, row.amount, share, cumulative, abc_class))
    return result
