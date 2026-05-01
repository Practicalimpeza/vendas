from __future__ import annotations

import json
import sqlite3
import uuid
from dataclasses import dataclass

from nexovarejo.ingestion.contracts import CanonicalBatch


@dataclass(frozen=True)
class PersistResult:
    import_batch_id: str
    products: int
    inventory: int
    sales: int
    service_sales: int
    customers: int
    issues: int


def persist_batch(conn: sqlite3.Connection, batch: CanonicalBatch, import_batch_id: str | None = None) -> PersistResult:
    batch_id = import_batch_id or str(uuid.uuid4())
    with conn:
        conn.execute(
            """
            INSERT INTO organizations (id, name)
            VALUES (?, ?)
            ON CONFLICT(id) DO NOTHING
            """,
            (batch.organization_id, batch.organization_id),
        )
        conn.execute(
            """
            INSERT INTO stores (id, organization_id, name)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO NOTHING
            """,
            (batch.store_id, batch.organization_id, batch.store_id),
        )
        conn.execute(
            """
            INSERT INTO import_batches
                (id, organization_id, store_id, source_system, status, issues_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                batch_id,
                batch.organization_id,
                batch.store_id,
                batch.source_system,
                "error" if batch.has_errors else "loaded",
                json.dumps([issue.__dict__ for issue in batch.issues], ensure_ascii=False),
            ),
        )

        for product in batch.products:
            conn.execute(
                """
                INSERT INTO products
                    (id, organization_id, source_code, barcode, name, brand, category_level_1, category_level_2, unit)
                VALUES
                    (:id, :organization_id, :source_code, :barcode, :name, :brand, :category_level_1, :category_level_2, :unit)
                ON CONFLICT(organization_id, source_code) DO UPDATE SET
                    barcode = excluded.barcode,
                    name = excluded.name,
                    brand = excluded.brand,
                    unit = excluded.unit
                """,
                {
                    "id": product["id"],
                    "organization_id": product["organization_id"],
                    "source_code": product["source_code"],
                    "barcode": product.get("barcode", ""),
                    "name": product["name"],
                    "brand": product.get("brand", ""),
                    "category_level_1": product.get("category_level_1", ""),
                    "category_level_2": product.get("category_level_2", ""),
                    "unit": product.get("unit", "UN") or "UN",
                },
            )

        for customer in batch.customers:
            conn.execute(
                """
                INSERT INTO customers (id, organization_id, source_code, name, document)
                VALUES (:id, :organization_id, :source_code, :name, :document)
                ON CONFLICT(organization_id, source_code) DO UPDATE SET
                    name = excluded.name,
                    document = excluded.document
                """,
                {
                    "id": customer["id"],
                    "organization_id": customer["organization_id"],
                    "source_code": customer["source_code"],
                    "name": customer["name"],
                    "document": customer.get("document", ""),
                },
            )

        for item in batch.inventory:
            conn.execute(
                """
                INSERT INTO inventory_snapshots
                    (import_batch_id, organization_id, store_id, product_id, quantity_on_hand, average_cost, sale_price)
                VALUES
                    (:import_batch_id, :organization_id, :store_id, :product_id, :quantity_on_hand, :average_cost, :sale_price)
                """,
                {
                    "import_batch_id": batch_id,
                    "organization_id": item["organization_id"],
                    "store_id": item["store_id"],
                    "product_id": item["product_id"],
                    "quantity_on_hand": item.get("quantity_on_hand", "0"),
                    "average_cost": item.get("average_cost", "0"),
                    "sale_price": item.get("sale_price", "0"),
                },
            )

        for sale in batch.sales:
            _ensure_product_stub(conn, batch.organization_id, sale["product_id"])
            conn.execute(
                """
                INSERT INTO sales
                    (import_batch_id, organization_id, store_id, product_id, customer_id, sold_at, quantity, gross_amount, net_amount)
                VALUES
                    (:import_batch_id, :organization_id, :store_id, :product_id, :customer_id, :sold_at, :quantity, :gross_amount, :net_amount)
                """,
                {
                    "import_batch_id": batch_id,
                    "organization_id": sale["organization_id"],
                    "store_id": sale["store_id"],
                    "product_id": sale["product_id"],
                    "customer_id": sale.get("customer_id"),
                    "sold_at": sale["sold_at"],
                    "quantity": sale["quantity"],
                    "gross_amount": sale["gross_amount"],
                    "net_amount": sale.get("net_amount"),
                },
            )

        for service in batch.service_sales:
            conn.execute(
                """
                INSERT INTO service_sales
                    (import_batch_id, organization_id, store_id, customer_id, customer_name, order_number, service_name,
                     emitted_at, quantity, gross_amount, tax_amount, net_amount)
                VALUES
                    (:import_batch_id, :organization_id, :store_id, :customer_id, :customer_name, :order_number, :service_name,
                     :emitted_at, :quantity, :gross_amount, :tax_amount, :net_amount)
                """,
                {
                    "import_batch_id": batch_id,
                    "organization_id": service["organization_id"],
                    "store_id": service["store_id"],
                    "customer_id": service.get("customer_id"),
                    "customer_name": service.get("customer_name", ""),
                    "order_number": service.get("order_number", ""),
                    "service_name": service["service_name"],
                    "emitted_at": service["emitted_at"],
                    "quantity": service.get("quantity", "1"),
                    "gross_amount": service.get("gross_amount", "0"),
                    "tax_amount": service.get("tax_amount", "0"),
                    "net_amount": service.get("net_amount", "0"),
                },
            )

    return PersistResult(
        import_batch_id=batch_id,
        products=len(batch.products),
        inventory=len(batch.inventory),
        sales=len(batch.sales),
        service_sales=len(batch.service_sales),
        customers=len(batch.customers),
        issues=len(batch.issues),
    )


def _ensure_product_stub(conn: sqlite3.Connection, organization_id: str, product_id: str) -> None:
    exists = conn.execute("SELECT 1 FROM products WHERE id = ?", (product_id,)).fetchone()
    if exists:
        return
    source_code = product_id.split(":", 1)[1] if ":" in product_id else product_id
    conn.execute(
        """
        INSERT INTO products (id, organization_id, source_code, name, active)
        VALUES (?, ?, ?, ?, 0)
        ON CONFLICT(id) DO NOTHING
        """,
        (product_id, organization_id, source_code, f"Produto importado {source_code}"),
    )
