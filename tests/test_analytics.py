from __future__ import annotations

import unittest
from datetime import date
from decimal import Decimal

from nexovarejo.analytics.abc import ABCInput, classify_abc
from nexovarejo.analytics.purchasing import suggest_purchase
from nexovarejo.analytics.rfm import CustomerSale, build_rfm_segments


class AnalyticsTest(unittest.TestCase):
    def test_purchase_suggestion_respects_package_size(self):
        suggestion = suggest_purchase(
            product_id="p1",
            stock_on_hand=Decimal("5"),
            pending_purchase_quantity=Decimal("0"),
            average_daily_demand=Decimal("1.2"),
            target_coverage_days=10,
            package_size=Decimal("6"),
        )
        self.assertEqual(suggestion.status, "comprar")
        self.assertEqual(suggestion.suggested_boxes, Decimal("2"))
        self.assertEqual(suggestion.suggested_quantity, Decimal("12"))

    def test_abc_classification_orders_by_amount(self):
        rows = classify_abc([
            ABCInput("baixo", Decimal("10")),
            ABCInput("alto", Decimal("90")),
        ])
        self.assertEqual(rows[0].product_id, "alto")
        self.assertEqual(rows[-1].abc_class, "C")

    def test_rfm_marks_old_customer_as_risk(self):
        rows = build_rfm_segments(
            [CustomerSale("c1", date(2025, 1, 1), Decimal("100"))],
            reference_date=date(2025, 5, 1),
        )
        self.assertEqual(rows[0].segment, "em_risco")


if __name__ == "__main__":
    unittest.main()
