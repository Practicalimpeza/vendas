from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from nexovarejo.ingestion.contracts import CanonicalBatch
from nexovarejo.storage import connect, initialize_database, persist_batch


class StorageTest(unittest.TestCase):
    def test_schema_creates_multi_tenant_tables(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = initialize_database(Path(tmp) / "test.db")
            conn = sqlite3.connect(db_path)
            tables = {
                row[0]
                for row in conn.execute("select name from sqlite_master where type='table'")
            }
            conn.close()
            self.assertIn("organizations", tables)
            self.assertIn("stores", tables)
            self.assertIn("products", tables)
            self.assertIn("sales", tables)
            self.assertIn("purchase_settings", tables)

    def test_persist_batch_writes_canonical_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = initialize_database(Path(tmp) / "test.db")
            conn = connect(db_path)
            batch = CanonicalBatch("org", "loja", "teste")
            batch.products.append({
                "id": "org:1",
                "organization_id": "org",
                "source_code": "1",
                "name": "Produto",
            })
            batch.inventory.append({
                "organization_id": "org",
                "store_id": "loja",
                "product_id": "org:1",
                "quantity_on_hand": "3",
            })
            result = persist_batch(conn, batch, import_batch_id="batch-1")
            self.assertEqual(result.products, 1)
            self.assertEqual(conn.execute("select count(*) from products").fetchone()[0], 1)
            self.assertEqual(conn.execute("select count(*) from inventory_snapshots").fetchone()[0], 1)
            conn.close()


if __name__ == "__main__":
    unittest.main()
