from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from nexovarejo.ingestion.contracts import CanonicalBatch
from nexovarejo.services import abc_report, customer_rfm, executive_summary, purchase_suggestions, top_products
from nexovarejo.storage import connect, initialize_database, persist_batch


class ServicesTest(unittest.TestCase):
    def test_reports_read_from_canonical_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = initialize_database(Path(tmp) / "test.db")
            conn = None
            try:
                conn = connect(db_path)
                batch = CanonicalBatch("org", "loja", "teste")
                batch.products.extend([
                    {"id": "org:1", "organization_id": "org", "source_code": "1", "name": "Produto A", "brand": "Marca"},
                    {"id": "org:2", "organization_id": "org", "source_code": "2", "name": "Produto B", "brand": "Marca"},
                ])
                batch.customers.append({
                    "id": "org:cliente:1",
                    "organization_id": "org",
                    "source_code": "1",
                    "name": "Cliente 1",
                })
                batch.inventory.extend([
                    {"organization_id": "org", "store_id": "loja", "product_id": "org:1", "quantity_on_hand": "1", "sale_price": "10"},
                    {"organization_id": "org", "store_id": "loja", "product_id": "org:2", "quantity_on_hand": "100", "sale_price": "20"},
                ])
                batch.sales.extend([
                    {"organization_id": "org", "store_id": "loja", "product_id": "org:1", "customer_id": "org:cliente:1", "sold_at": "2026-01-01", "quantity": "10", "gross_amount": "100"},
                    {"organization_id": "org", "store_id": "loja", "product_id": "org:2", "customer_id": "org:cliente:1", "sold_at": "2026-01-02", "quantity": "1", "gross_amount": "20"},
                ])
                persist_batch(conn, batch, import_batch_id="batch")

                summary = executive_summary(conn, "org", "loja")
                self.assertEqual(summary["products"], 2)
                self.assertEqual(summary["customers"], 1)
                self.assertEqual(summary["sales_lines"], 2)

                top = top_products(conn, "org", store_id="loja")
                self.assertEqual(top[0]["name"], "Produto A")

                abc = abc_report(conn, "org", store_id="loja")
                self.assertEqual(abc[0]["abc_class"], "B")

                suggestions = purchase_suggestions(conn, "org", store_id="loja")
                self.assertEqual(suggestions[0]["source_code"], "1")

                rfm = customer_rfm(conn, "org")
                self.assertEqual(rfm[0]["customer_name"], "Cliente 1")
            finally:
                if conn is not None:
                    conn.close()


if __name__ == "__main__":
    unittest.main()
