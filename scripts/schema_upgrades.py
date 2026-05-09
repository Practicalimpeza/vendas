from __future__ import annotations

import sqlite3

from supplier_ops import seed_brand_suppliers
from text_utils import canonical_customer_key


LEGACY_SCHEMA_MIGRATION_ID = "20260508_legacy_idempotent_schema_upgrades"


def ensure_schema_migrations_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            description TEXT NOT NULL DEFAULT '',
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def record_schema_migration(conn: sqlite3.Connection, migration_id: str, description: str) -> None:
    conn.execute(
        """
        INSERT OR IGNORE INTO schema_migrations (id, description)
        VALUES (?, ?)
        """,
        (migration_id, description),
    )


def _backfill_customer_canonical_name(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        "SELECT id, name, canonical_name FROM customers WHERE canonical_name IS NULL OR canonical_name = ''"
    ).fetchall()
    for row in rows:
        key = canonical_customer_key(row["name"]) or row["name"].strip().lower() or "sem_cliente"
        conn.execute("UPDATE customers SET canonical_name = ? WHERE id = ?", (key, row["id"]))


def _run_legacy_idempotent_upgrades(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS organization_profiles (
            organization_id TEXT PRIMARY KEY REFERENCES organizations(id),
            trade_name TEXT DEFAULT '',
            legal_name TEXT DEFAULT '',
            document TEXT DEFAULT '',
            state_registration TEXT DEFAULT '',
            municipal_registration TEXT DEFAULT '',
            contact_name TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            email TEXT DEFAULT '',
            website TEXT DEFAULT '',
            address_line TEXT DEFAULT '',
            address_number TEXT DEFAULT '',
            address_complement TEXT DEFAULT '',
            district TEXT DEFAULT '',
            city TEXT DEFAULT '',
            state TEXT DEFAULT '',
            postal_code TEXT DEFAULT '',
            country TEXT DEFAULT 'Brasil',
            logo_path TEXT DEFAULT '',
            document_footer TEXT DEFAULT '',
            default_payment_terms TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    supplier_columns = {row["name"] for row in conn.execute("PRAGMA table_info(suppliers)").fetchall()}
    upgrades = {
        "order_review_cycle_days": "ALTER TABLE suppliers ADD COLUMN order_review_cycle_days INTEGER",
        "target_coverage_adjustment_days": "ALTER TABLE suppliers ADD COLUMN target_coverage_adjustment_days INTEGER NOT NULL DEFAULT 0",
        "order_difficulty": "ALTER TABLE suppliers ADD COLUMN order_difficulty TEXT NOT NULL DEFAULT 'auto'",
    }
    for column, statement in upgrades.items():
        if column not in supplier_columns:
            conn.execute(statement)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS brand_supplier_rules (
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            brand_id TEXT NOT NULL REFERENCES brands(id),
            supplier_id TEXT NOT NULL REFERENCES suppliers(id),
            active INTEGER NOT NULL DEFAULT 1,
            notes TEXT DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (organization_id, brand_id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_brand_supplier_rules_supplier ON brand_supplier_rules(organization_id, supplier_id)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS quote_requests (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            supplier_id TEXT REFERENCES suppliers(id),
            supplier_name TEXT NOT NULL,
            contact_phone TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'draft',
            source_kind TEXT NOT NULL DEFAULT 'replenishment',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            sent_at TEXT,
            responded_at TEXT,
            approved_at TEXT,
            cancelled_at TEXT,
            total_estimated_amount NUMERIC NOT NULL DEFAULT 0,
            item_count INTEGER NOT NULL DEFAULT 0,
            message_text TEXT NOT NULL DEFAULT '',
            notes TEXT DEFAULT ''
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS quote_request_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quote_request_id TEXT NOT NULL REFERENCES quote_requests(id),
            product_id TEXT NOT NULL REFERENCES products(id),
            source_code TEXT NOT NULL,
            supplier_reference TEXT DEFAULT '',
            quote_code TEXT NOT NULL,
            product_name TEXT NOT NULL,
            unit TEXT DEFAULT '',
            purchase_unit TEXT DEFAULT '',
            purchase_package_size NUMERIC NOT NULL DEFAULT 1,
            coverage_target_days INTEGER,
            suggested_quantity NUMERIC NOT NULL DEFAULT 0,
            requested_quantity NUMERIC NOT NULL DEFAULT 0,
            estimated_unit_cost NUMERIC NOT NULL DEFAULT 0,
            estimated_total_amount NUMERIC NOT NULL DEFAULT 0,
            reason TEXT DEFAULT '',
            quoted_unit_price NUMERIC,
            quoted_package_size NUMERIC,
            quoted_lead_time_days INTEGER,
            availability TEXT DEFAULT '',
            notes TEXT DEFAULT ''
        )
        """
    )
    quote_item_columns = {row["name"] for row in conn.execute("PRAGMA table_info(quote_request_items)").fetchall()}
    quote_item_upgrades = {
        "purchase_unit": "ALTER TABLE quote_request_items ADD COLUMN purchase_unit TEXT DEFAULT ''",
        "purchase_package_size": "ALTER TABLE quote_request_items ADD COLUMN purchase_package_size NUMERIC NOT NULL DEFAULT 1",
        "coverage_target_days": "ALTER TABLE quote_request_items ADD COLUMN coverage_target_days INTEGER",
        "quoted_package_size": "ALTER TABLE quote_request_items ADD COLUMN quoted_package_size NUMERIC",
    }
    for column, statement in quote_item_upgrades.items():
        if column not in quote_item_columns:
            conn.execute(statement)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_quote_requests_org_status ON quote_requests(organization_id, status, created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_request_items(quote_request_id)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS purchase_orders (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            store_id TEXT REFERENCES stores(id),
            quote_request_id TEXT NOT NULL REFERENCES quote_requests(id),
            supplier_id TEXT REFERENCES suppliers(id),
            supplier_name TEXT NOT NULL,
            contact_phone TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'approved',
            source_kind TEXT NOT NULL DEFAULT 'quote_response',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            approved_at TEXT,
            expected_delivery_date TEXT,
            minimum_order_value NUMERIC NOT NULL DEFAULT 0,
            minimum_order_met INTEGER NOT NULL DEFAULT 1,
            total_amount NUMERIC NOT NULL DEFAULT 0,
            item_count INTEGER NOT NULL DEFAULT 0,
            approved_item_count INTEGER NOT NULL DEFAULT 0,
            notes TEXT DEFAULT '',
            UNIQUE (organization_id, quote_request_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS purchase_order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
            quote_request_item_id INTEGER REFERENCES quote_request_items(id),
            product_id TEXT NOT NULL REFERENCES products(id),
            source_code TEXT NOT NULL,
            supplier_reference TEXT DEFAULT '',
            quote_code TEXT NOT NULL,
            product_name TEXT NOT NULL,
            unit TEXT DEFAULT '',
            suggested_quantity NUMERIC NOT NULL DEFAULT 0,
            requested_quantity NUMERIC NOT NULL DEFAULT 0,
            final_quantity NUMERIC NOT NULL DEFAULT 0,
            package_size NUMERIC NOT NULL DEFAULT 1,
            unit_price NUMERIC NOT NULL DEFAULT 0,
            total_amount NUMERIC NOT NULL DEFAULT 0,
            decision TEXT NOT NULL DEFAULT 'buy',
            availability TEXT DEFAULT '',
            lead_time_days INTEGER,
            reason TEXT DEFAULT '',
            notes TEXT DEFAULT ''
        )
        """
    )
    purchase_order_columns = {row["name"] for row in conn.execute("PRAGMA table_info(purchase_orders)").fetchall()}
    purchase_order_upgrades = {
        "store_id": "ALTER TABLE purchase_orders ADD COLUMN store_id TEXT",
        "quote_request_id": "ALTER TABLE purchase_orders ADD COLUMN quote_request_id TEXT",
        "supplier_name": "ALTER TABLE purchase_orders ADD COLUMN supplier_name TEXT NOT NULL DEFAULT ''",
        "contact_phone": "ALTER TABLE purchase_orders ADD COLUMN contact_phone TEXT DEFAULT ''",
        "source_kind": "ALTER TABLE purchase_orders ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'manual'",
        "expected_delivery_date": "ALTER TABLE purchase_orders ADD COLUMN expected_delivery_date TEXT",
        "minimum_order_value": "ALTER TABLE purchase_orders ADD COLUMN minimum_order_value NUMERIC NOT NULL DEFAULT 0",
        "minimum_order_met": "ALTER TABLE purchase_orders ADD COLUMN minimum_order_met INTEGER NOT NULL DEFAULT 1",
        "item_count": "ALTER TABLE purchase_orders ADD COLUMN item_count INTEGER NOT NULL DEFAULT 0",
        "approved_item_count": "ALTER TABLE purchase_orders ADD COLUMN approved_item_count INTEGER NOT NULL DEFAULT 0",
    }
    for column, statement in purchase_order_upgrades.items():
        if column not in purchase_order_columns:
            conn.execute(statement)
    purchase_order_item_columns = {row["name"] for row in conn.execute("PRAGMA table_info(purchase_order_items)").fetchall()}
    purchase_order_item_upgrades = {
        "quote_request_item_id": "ALTER TABLE purchase_order_items ADD COLUMN quote_request_item_id INTEGER",
        "source_code": "ALTER TABLE purchase_order_items ADD COLUMN source_code TEXT NOT NULL DEFAULT ''",
        "supplier_reference": "ALTER TABLE purchase_order_items ADD COLUMN supplier_reference TEXT DEFAULT ''",
        "quote_code": "ALTER TABLE purchase_order_items ADD COLUMN quote_code TEXT NOT NULL DEFAULT ''",
        "product_name": "ALTER TABLE purchase_order_items ADD COLUMN product_name TEXT NOT NULL DEFAULT ''",
        "unit": "ALTER TABLE purchase_order_items ADD COLUMN unit TEXT DEFAULT ''",
        "requested_quantity": "ALTER TABLE purchase_order_items ADD COLUMN requested_quantity NUMERIC NOT NULL DEFAULT 0",
        "final_quantity": "ALTER TABLE purchase_order_items ADD COLUMN final_quantity NUMERIC NOT NULL DEFAULT 0",
        "package_size": "ALTER TABLE purchase_order_items ADD COLUMN package_size NUMERIC NOT NULL DEFAULT 1",
        "unit_price": "ALTER TABLE purchase_order_items ADD COLUMN unit_price NUMERIC NOT NULL DEFAULT 0",
        "decision": "ALTER TABLE purchase_order_items ADD COLUMN decision TEXT NOT NULL DEFAULT 'buy'",
        "availability": "ALTER TABLE purchase_order_items ADD COLUMN availability TEXT DEFAULT ''",
        "lead_time_days": "ALTER TABLE purchase_order_items ADD COLUMN lead_time_days INTEGER",
        "reason": "ALTER TABLE purchase_order_items ADD COLUMN reason TEXT DEFAULT ''",
        "notes": "ALTER TABLE purchase_order_items ADD COLUMN notes TEXT DEFAULT ''",
    }
    for column, statement in purchase_order_item_upgrades.items():
        if column not in purchase_order_item_columns:
            conn.execute(statement)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_purchase_orders_org_status ON purchase_orders(organization_id, status, created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_purchase_orders_quote ON purchase_orders(organization_id, quote_request_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order ON purchase_order_items(purchase_order_id)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS product_pricing_settings (
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            product_id TEXT NOT NULL REFERENCES products(id),
            cost_price NUMERIC,
            product_role TEXT NOT NULL DEFAULT 'normal',
            notes TEXT DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (organization_id, product_id)
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_pricing_settings_product ON product_pricing_settings(organization_id, product_id)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS action_items (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            source_kind TEXT NOT NULL DEFAULT 'generated',
            action_type TEXT NOT NULL,
            target_type TEXT NOT NULL DEFAULT '',
            target_id TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            reason TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open',
            priority INTEGER NOT NULL DEFAULT 3,
            impact_label TEXT NOT NULL DEFAULT '',
            estimated_value NUMERIC NOT NULL DEFAULT 0,
            due_date TEXT DEFAULT '',
            view TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at TEXT,
            ignored_at TEXT
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_action_items_org_status ON action_items(organization_id, status, priority, created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_action_items_target ON action_items(organization_id, target_type, target_id)")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS operational_decisions (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            actor_user_id TEXT DEFAULT '',
            source_kind TEXT NOT NULL DEFAULT 'user',
            source_view TEXT NOT NULL DEFAULT '',
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL DEFAULT '',
            entity_label TEXT NOT NULL DEFAULT '',
            decision_type TEXT NOT NULL,
            decision_value TEXT NOT NULL DEFAULT '',
            scope_type TEXT NOT NULL DEFAULT 'single',
            scope_label TEXT NOT NULL DEFAULT '',
            applied_to_count INTEGER NOT NULL DEFAULT 1,
            reason TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_operational_decisions_org_created ON operational_decisions(organization_id, created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_operational_decisions_entity ON operational_decisions(organization_id, entity_type, entity_id, created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_operational_decisions_type ON operational_decisions(organization_id, decision_type, decision_value, created_at)")
    customer_columns = {row["name"] for row in conn.execute("PRAGMA table_info(customers)").fetchall()}
    if "canonical_name" not in customer_columns:
        conn.execute("ALTER TABLE customers ADD COLUMN canonical_name TEXT NOT NULL DEFAULT ''")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_customers_canonical_name ON customers(organization_id, canonical_name)")
    _backfill_customer_canonical_name(conn)
    seed_brand_suppliers(conn)


def ensure_schema_upgrades(conn: sqlite3.Connection) -> None:
    ensure_schema_migrations_table(conn)
    _run_legacy_idempotent_upgrades(conn)
    record_schema_migration(
        conn,
        LEGACY_SCHEMA_MIGRATION_ID,
        "Upgrades idempotentes legados consolidados antes do versionamento formal.",
    )
    conn.commit()
