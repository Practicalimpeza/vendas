from __future__ import annotations

import json
import sqlite3
from hashlib import sha1

from db_helpers import normalize_code
from supplier_ops import seed_brand_suppliers
from text_utils import canonical_customer_key, normalize


LEGACY_SCHEMA_MIGRATION_ID = "20260508_legacy_idempotent_schema_upgrades"
WHATSAPP_SCHEMA_MIGRATION_ID = "20260514_whatsapp_crm_pilot"
AUTH_SCHEMA_MIGRATION_ID = "20260514_login_permissions"
PERFORMANCE_INDEX_MIGRATION_ID = "20260515_date_expression_performance_indexes"
QUOTE_RESPONSE_QUANTITY_MIGRATION_ID = "20260516_quote_response_confirmed_quantity"
SUPPLIER_REFERENCE_NORMALIZATION_MIGRATION_ID = "20260518_supplier_reference_zero_normalization"
PRODUCT_CODE_NORMALIZATION_MIGRATION_ID = "20260520_product_code_zero_unification"
APP_SETTINGS_SCHEMA_MIGRATION_ID = "20260520_app_settings"
PRODUCT_LEGACY_IDENTIFIER_CLEANUP_MIGRATION_ID = "20260522_product_legacy_identifier_cleanup"
OPERATIONAL_DATA_SOURCES_MIGRATION_ID = "20260522_operational_data_sources"
CORRUPT_PRODUCT_CODE_QUARANTINE_MIGRATION_ID = "20260522_corrupt_product_code_quarantine"
PRODUCT_COVERAGE_AUTO_DEFAULT_MIGRATION_ID = "20260522_product_coverage_auto_default"
CUSTOMER_CATALOG_MIGRATION_ID = "20260610_customer_catalog"
CUSTOMER_CRM_PROFILE_MIGRATION_ID = "20260611_customer_crm_profile"


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
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS entity_field_controls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            field_name TEXT NOT NULL,
            control_kind TEXT NOT NULL DEFAULT 'app',
            source_view TEXT NOT NULL DEFAULT '',
            actor_user_id TEXT DEFAULT '',
            last_local_value TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (organization_id, entity_type, entity_id, field_name)
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


def _ensure_app_settings_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def _ensure_operational_data_sources_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS operational_data_sources (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            source_kind TEXT NOT NULL DEFAULT 'system',
            name TEXT NOT NULL,
            external_system TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'active',
            last_seen_at TEXT,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (organization_id, source_kind, name)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS entity_source_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            data_source_id TEXT NOT NULL REFERENCES operational_data_sources(id),
            external_id TEXT DEFAULT '',
            external_code TEXT DEFAULT '',
            link_status TEXT NOT NULL DEFAULT 'active',
            first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TEXT,
            source_payload_json TEXT NOT NULL DEFAULT '{}',
            UNIQUE (organization_id, entity_type, entity_id, data_source_id)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_operational_data_sources_org "
        "ON operational_data_sources(organization_id, source_kind, status)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_entity_source_links_entity "
        "ON entity_source_links(organization_id, entity_type, entity_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_entity_source_links_source "
        "ON entity_source_links(organization_id, data_source_id, external_code)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_entity_field_controls_entity "
        "ON entity_field_controls(organization_id, entity_type, entity_id, control_kind)"
    )


def _backfill_customer_canonical_name(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        "SELECT id, name, canonical_name FROM customers WHERE canonical_name IS NULL OR canonical_name = ''"
    ).fetchall()
    for row in rows:
        key = canonical_customer_key(row["name"]) or row["name"].strip().lower() or "sem_cliente"
        conn.execute("UPDATE customers SET canonical_name = ? WHERE id = ?", (key, row["id"]))


def _run_legacy_idempotent_upgrades(conn: sqlite3.Connection) -> None:
    product_setting_columns = {row["name"] for row in conn.execute("PRAGMA table_info(product_settings)").fetchall()}
    if "target_coverage_mode" not in product_setting_columns:
        conn.execute("ALTER TABLE product_settings ADD COLUMN target_coverage_mode TEXT NOT NULL DEFAULT 'auto'")
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
            confirmed_quantity NUMERIC,
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
        "confirmed_quantity": "ALTER TABLE quote_request_items ADD COLUMN confirmed_quantity NUMERIC",
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
        "purchase_unit": "ALTER TABLE purchase_order_items ADD COLUMN purchase_unit TEXT DEFAULT ''",
        "purchase_package_size": "ALTER TABLE purchase_order_items ADD COLUMN purchase_package_size NUMERIC NOT NULL DEFAULT 1",
        "coverage_target_days": "ALTER TABLE purchase_order_items ADD COLUMN coverage_target_days INTEGER",
        "suggested_quantity": "ALTER TABLE purchase_order_items ADD COLUMN suggested_quantity NUMERIC NOT NULL DEFAULT 0",
        "requested_quantity": "ALTER TABLE purchase_order_items ADD COLUMN requested_quantity NUMERIC NOT NULL DEFAULT 0",
        "ordered_quantity": "ALTER TABLE purchase_order_items ADD COLUMN ordered_quantity NUMERIC NOT NULL DEFAULT 0",
        "final_quantity": "ALTER TABLE purchase_order_items ADD COLUMN final_quantity NUMERIC NOT NULL DEFAULT 0",
        "received_quantity": "ALTER TABLE purchase_order_items ADD COLUMN received_quantity NUMERIC NOT NULL DEFAULT 0",
        "package_size": "ALTER TABLE purchase_order_items ADD COLUMN package_size NUMERIC NOT NULL DEFAULT 1",
        "unit_cost": "ALTER TABLE purchase_order_items ADD COLUMN unit_cost NUMERIC NOT NULL DEFAULT 0",
        "unit_price": "ALTER TABLE purchase_order_items ADD COLUMN unit_price NUMERIC NOT NULL DEFAULT 0",
        "total_amount": "ALTER TABLE purchase_order_items ADD COLUMN total_amount NUMERIC NOT NULL DEFAULT 0",
        "decision": "ALTER TABLE purchase_order_items ADD COLUMN decision TEXT NOT NULL DEFAULT 'buy'",
        "availability": "ALTER TABLE purchase_order_items ADD COLUMN availability TEXT DEFAULT ''",
        "lead_time_days": "ALTER TABLE purchase_order_items ADD COLUMN lead_time_days INTEGER",
        "reason": "ALTER TABLE purchase_order_items ADD COLUMN reason TEXT DEFAULT ''",
        "notes": "ALTER TABLE purchase_order_items ADD COLUMN notes TEXT DEFAULT ''",
        "reason_json": "ALTER TABLE purchase_order_items ADD COLUMN reason_json TEXT NOT NULL DEFAULT '{}'",
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


def _ensure_whatsapp_crm_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS whatsapp_contacts (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            wa_id TEXT NOT NULL,
            display_name TEXT NOT NULL DEFAULT '',
            phone_number TEXT NOT NULL DEFAULT '',
            customer_id TEXT REFERENCES customers(id),
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (organization_id, wa_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS whatsapp_agents (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            name TEXT NOT NULL,
            department TEXT NOT NULL DEFAULT '',
            active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (organization_id, name)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS whatsapp_conversations (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            contact_id TEXT REFERENCES whatsapp_contacts(id),
            customer_id TEXT REFERENCES customers(id),
            contact_wa_id TEXT NOT NULL,
            contact_name TEXT NOT NULL DEFAULT '',
            channel_phone_number_id TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'novo',
            owner_user_id TEXT NOT NULL DEFAULT '',
            owner_name TEXT NOT NULL DEFAULT '',
            department TEXT NOT NULL DEFAULT '',
            priority INTEGER NOT NULL DEFAULT 3,
            last_message_at TEXT,
            last_inbound_at TEXT,
            last_outbound_at TEXT,
            follow_up_at TEXT,
            quote_request_id TEXT REFERENCES quote_requests(id),
            purchase_order_id TEXT REFERENCES purchase_orders(id),
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            closed_at TEXT,
            UNIQUE (organization_id, contact_wa_id, channel_phone_number_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS whatsapp_messages (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            conversation_id TEXT NOT NULL REFERENCES whatsapp_conversations(id),
            wa_message_id TEXT,
            direction TEXT NOT NULL,
            message_type TEXT NOT NULL DEFAULT 'text',
            body TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT '',
            sender_name TEXT NOT NULL DEFAULT '',
            sender_wa_id TEXT NOT NULL DEFAULT '',
            sent_at TEXT,
            received_at TEXT,
            raw_payload_json TEXT NOT NULL DEFAULT '{}',
            error_text TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (organization_id, wa_message_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS whatsapp_conversation_events (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            conversation_id TEXT NOT NULL REFERENCES whatsapp_conversations(id),
            event_type TEXT NOT NULL,
            actor_name TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_whatsapp_agents_org_active ON whatsapp_agents(organization_id, active, sort_order, name)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_org_status ON whatsapp_conversations(organization_id, status, last_message_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_owner ON whatsapp_conversations(organization_id, owner_user_id, status)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON whatsapp_messages(conversation_id, created_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_id ON whatsapp_messages(organization_id, wa_message_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_whatsapp_events_conversation ON whatsapp_conversation_events(conversation_id, created_at)")


def _ensure_auth_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS app_users (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            name TEXT NOT NULL,
            login_name TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_login_at TEXT
        )
        """
    )
    app_user_columns = {row["name"] for row in conn.execute("PRAGMA table_info(app_users)").fetchall()}
    if "login_name" not in app_user_columns:
        conn.execute("ALTER TABLE app_users ADD COLUMN login_name TEXT NOT NULL DEFAULT ''")
        conn.execute("UPDATE app_users SET login_name = lower(email) WHERE login_name = ''")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS app_user_module_permissions (
            user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            module_key TEXT NOT NULL,
            can_access INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, module_key)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS app_sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            user_agent TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at TEXT NOT NULL
        )
        """
    )
    conn.execute("DROP INDEX IF EXISTS idx_app_users_email")
    conn.execute("DROP INDEX IF EXISTS idx_app_users_org_login")
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_login ON app_users(login_name)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_app_users_org_active ON app_users(organization_id, active, role, name)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_app_sessions_user ON app_sessions(user_id, expires_at)")


def _ensure_performance_indexes(conn: sqlite3.Connection) -> None:
    conn.execute("CREATE INDEX IF NOT EXISTS idx_product_sales_sold_day ON product_sales(substr(sold_at, 1, 10))")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_product_sales_product_day ON product_sales(product_id, substr(sold_at, 1, 10))")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_product_sales_customer_day ON product_sales(customer_id, substr(sold_at, 1, 10))")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_service_sales_emitted_day ON service_sales(substr(emitted_at, 1, 10))")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_service_sales_customer_day ON service_sales(customer_id, substr(emitted_at, 1, 10))")


def _ensure_quote_response_quantity_schema(conn: sqlite3.Connection) -> None:
    quote_item_columns = {row["name"] for row in conn.execute("PRAGMA table_info(quote_request_items)").fetchall()}
    if "confirmed_quantity" not in quote_item_columns:
        conn.execute("ALTER TABLE quote_request_items ADD COLUMN confirmed_quantity NUMERIC")


def _normalize_supplier_reference_values(conn: sqlite3.Connection) -> None:
    for table, id_column in (
        ("quote_request_items", "id"),
        ("purchase_order_items", "id"),
        ("supplier_product_rules", "rowid"),
    ):
        columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        target_column = "supplier_sku" if table == "supplier_product_rules" else "supplier_reference"
        if target_column not in columns:
            continue
        for row in conn.execute(
            f"SELECT {id_column} AS row_id, {target_column} AS code FROM {table} WHERE COALESCE({target_column}, '') <> ''"
        ).fetchall():
            normalized = normalize_code(row["code"])
            if normalized and normalized != row["code"]:
                conn.execute(
                    f"UPDATE {table} SET {target_column} = ? WHERE {id_column} = ?",
                    (normalized, row["row_id"]),
                )
                if table in {"quote_request_items", "purchase_order_items"} and "quote_code" in columns:
                    conn.execute(
                        f"UPDATE {table} SET quote_code = ? WHERE {id_column} = ?",
                        (normalized, row["row_id"]),
                    )

    for row in conn.execute(
        """
        SELECT id, organization_id, product_id, identifier_value
        FROM product_identifiers
        WHERE identifier_type = 'supplier_reference'
          AND COALESCE(identifier_value, '') <> ''
        ORDER BY id
        """
    ).fetchall():
        normalized = normalize_code(row["identifier_value"])
        if not normalized or normalized == row["identifier_value"]:
            continue
        existing = conn.execute(
            """
            SELECT id, product_id
            FROM product_identifiers
            WHERE organization_id = ?
              AND identifier_type = 'supplier_reference'
              AND identifier_value = ?
            LIMIT 1
            """,
            (row["organization_id"], normalized),
        ).fetchone()
        if not existing:
            conn.execute("UPDATE product_identifiers SET identifier_value = ? WHERE id = ?", (normalized, row["id"]))
        elif existing["product_id"] == row["product_id"]:
            conn.execute("DELETE FROM product_identifiers WHERE id = ?", (row["id"],))


def _canonical_product_id(organization_id: str, source_code: object) -> tuple[str, str]:
    canonical_code = normalize_code(source_code) or str(source_code or "").strip()
    return f"{organization_id}:product:{canonical_code}", canonical_code


def _safe_legacy_source_code(source_code: object) -> str:
    text = str(source_code or "").strip()
    if not text or len(text) > 32:
        return ""
    if any(char.isspace() for char in text):
        return ""
    if any((ord(char) < 32 or ord(char) > 126) for char in text):
        return ""
    return text


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    return bool(conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)).fetchone())


def _neutralize_auto_target_coverage_days(conn: sqlite3.Connection) -> None:
    if not _table_exists(conn, "product_settings"):
        return
    columns = _table_columns(conn, "product_settings")
    if "target_coverage_days" not in columns:
        return
    if "target_coverage_mode" in columns:
        conn.execute(
            """
            UPDATE product_settings
            SET target_coverage_days = 0
            WHERE COALESCE(target_coverage_mode, 'auto') <> 'manual'
              AND COALESCE(target_coverage_days, 0) <> 0
            """
        )
        return
    conn.execute(
        """
        UPDATE product_settings
        SET target_coverage_days = 0
        WHERE COALESCE(target_coverage_days, 0) <> 0
        """
    )


def _ensure_customer_catalog_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS product_media (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            product_id TEXT NOT NULL REFERENCES products(id),
            media_type TEXT NOT NULL DEFAULT 'image',
            public_path TEXT NOT NULL,
            alt_text TEXT DEFAULT '',
            is_primary INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            source_kind TEXT NOT NULL DEFAULT 'upload',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (organization_id, product_id, public_path)
        );

        CREATE TABLE IF NOT EXISTS customer_catalogs (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            customer_id TEXT NOT NULL REFERENCES customers(id),
            customer_canonical_name TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL DEFAULT 'Catalogo do cliente',
            status TEXT NOT NULL DEFAULT 'draft',
            owner_user_id TEXT DEFAULT '',
            owner_name TEXT DEFAULT '',
            valid_from TEXT DEFAULT '',
            valid_until TEXT DEFAULT '',
            review_at TEXT DEFAULT '',
            public_notes TEXT DEFAULT '',
            internal_notes TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (organization_id, customer_id, name)
        );

        CREATE TABLE IF NOT EXISTS customer_catalog_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            catalog_id TEXT NOT NULL REFERENCES customer_catalogs(id),
            customer_id TEXT NOT NULL REFERENCES customers(id),
            product_id TEXT NOT NULL REFERENCES products(id),
            product_name_snapshot TEXT NOT NULL DEFAULT '',
            source_code_snapshot TEXT NOT NULL DEFAULT '',
            unit_snapshot TEXT NOT NULL DEFAULT '',
            negotiated_price NUMERIC,
            discount_pct NUMERIC,
            minimum_quantity NUMERIC NOT NULL DEFAULT 0,
            package_size NUMERIC NOT NULL DEFAULT 1,
            valid_from TEXT DEFAULT '',
            valid_until TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'draft',
            origin TEXT NOT NULL DEFAULT 'manual',
            public_notes TEXT DEFAULT '',
            internal_notes TEXT DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (catalog_id, product_id)
        );

        CREATE TABLE IF NOT EXISTS customer_catalog_events (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            catalog_id TEXT NOT NULL REFERENCES customer_catalogs(id),
            item_id INTEGER,
            customer_id TEXT NOT NULL REFERENCES customers(id),
            event_type TEXT NOT NULL,
            actor_user_id TEXT DEFAULT '',
            actor_name TEXT DEFAULT '',
            note TEXT DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_product_media_product ON product_media(organization_id, product_id, is_primary, sort_order);
        CREATE INDEX IF NOT EXISTS idx_customer_catalogs_customer ON customer_catalogs(organization_id, customer_id, status);
        CREATE INDEX IF NOT EXISTS idx_customer_catalog_items_catalog ON customer_catalog_items(catalog_id, status, sort_order);
        CREATE INDEX IF NOT EXISTS idx_customer_catalog_items_product ON customer_catalog_items(organization_id, product_id, status);
        CREATE INDEX IF NOT EXISTS idx_customer_catalog_events_catalog ON customer_catalog_events(catalog_id, created_at);
        """
    )


def _ensure_customer_crm_profile_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS customer_crm_profiles (
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            customer_id TEXT NOT NULL REFERENCES customers(id),
            customer_canonical_name TEXT NOT NULL DEFAULT '',
            owner_user_id TEXT DEFAULT '',
            owner_name TEXT DEFAULT '',
            commercial_status TEXT NOT NULL DEFAULT 'follow_up',
            priority TEXT NOT NULL DEFAULT 'normal',
            next_action TEXT DEFAULT '',
            next_action_at TEXT DEFAULT '',
            internal_notes TEXT DEFAULT '',
            tags_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (organization_id, customer_id)
        );

        CREATE TABLE IF NOT EXISTS customer_actions (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            customer_id TEXT NOT NULL REFERENCES customers(id),
            customer_canonical_name TEXT NOT NULL DEFAULT '',
            action_type TEXT NOT NULL DEFAULT 'follow_up',
            title TEXT NOT NULL DEFAULT '',
            due_at TEXT DEFAULT '',
            status TEXT NOT NULL DEFAULT 'open',
            priority TEXT NOT NULL DEFAULT 'normal',
            owner_user_id TEXT DEFAULT '',
            owner_name TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            completed_at TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_customer_crm_profiles_status ON customer_crm_profiles(organization_id, commercial_status, priority, next_action_at);
        CREATE INDEX IF NOT EXISTS idx_customer_actions_customer ON customer_actions(organization_id, customer_id, status, due_at);
        CREATE INDEX IF NOT EXISTS idx_customer_actions_due ON customer_actions(organization_id, status, due_at, priority);
        """
    )


def _product_tables(conn: sqlite3.Connection) -> list[str]:
    tables = [
        row["name"]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").fetchall()
    ]
    return [table for table in tables if "product_id" in _table_columns(conn, table)]


def _copy_product_as_canonical(conn: sqlite3.Connection, source_row: sqlite3.Row, canonical_id: str, canonical_code: str) -> None:
    columns = [row["name"] for row in conn.execute("PRAGMA table_info(products)").fetchall()]
    values = dict(source_row)
    values["id"] = canonical_id
    values["source_code"] = canonical_code
    placeholders = ", ".join("?" for _ in columns)
    conn.execute(
        f"INSERT INTO products ({', '.join(columns)}) VALUES ({placeholders})",
        tuple(values.get(column) for column in columns),
    )


def _merge_product_settings(conn: sqlite3.Connection, organization_id: str, old_id: str, canonical_id: str) -> None:
    old = conn.execute(
        "SELECT * FROM product_settings WHERE organization_id = ? AND product_id = ?",
        (organization_id, old_id),
    ).fetchone()
    if not old:
        return
    current = conn.execute(
        "SELECT * FROM product_settings WHERE organization_id = ? AND product_id = ?",
        (organization_id, canonical_id),
    ).fetchone()
    if not current:
        conn.execute("UPDATE product_settings SET product_id = ? WHERE organization_id = ? AND product_id = ?", (canonical_id, organization_id, old_id))
        return
    conn.execute(
        """
        UPDATE product_settings
        SET preferred_supplier_id = COALESCE(preferred_supplier_id, ?),
            package_size = CASE WHEN COALESCE(package_size, 1) <= 1 AND ? > 1 THEN ? ELSE package_size END,
            target_coverage_days = CASE
                WHEN COALESCE(target_coverage_mode, 'auto') <> 'manual' AND ? = 'manual' THEN ?
                ELSE target_coverage_days
            END,
            target_coverage_mode = CASE
                WHEN COALESCE(target_coverage_mode, 'auto') <> 'manual' AND ? = 'manual' THEN 'manual'
                ELSE target_coverage_mode
            END,
            minimum_stock = CASE WHEN COALESCE(minimum_stock, 0) = 0 AND ? > 0 THEN ? ELSE minimum_stock END,
            maximum_stock = COALESCE(maximum_stock, ?),
            weight = COALESCE(weight, ?),
            expires = MAX(COALESCE(expires, 0), ?),
            blocked_for_purchase = MAX(COALESCE(blocked_for_purchase, 0), ?),
            ignored_in_purchase_reports = MAX(COALESCE(ignored_in_purchase_reports, 0), ?),
            marker = CASE WHEN COALESCE(marker, '') = '' THEN ? ELSE marker END,
            notes = CASE WHEN COALESCE(notes, '') = '' THEN ? ELSE notes END
        WHERE organization_id = ? AND product_id = ?
        """,
        (
            old["preferred_supplier_id"],
            float(old["package_size"] or 1),
            float(old["package_size"] or 1),
            old["target_coverage_mode"] or "auto",
            old["target_coverage_days"],
            old["target_coverage_mode"] or "auto",
            float(old["minimum_stock"] or 0),
            float(old["minimum_stock"] or 0),
            old["maximum_stock"],
            old["weight"],
            int(old["expires"] or 0),
            int(old["blocked_for_purchase"] or 0),
            int(old["ignored_in_purchase_reports"] or 0),
            old["marker"] or "",
            old["notes"] or "",
            organization_id,
            canonical_id,
        ),
    )
    conn.execute("DELETE FROM product_settings WHERE organization_id = ? AND product_id = ?", (organization_id, old_id))


def _merge_product_pricing_settings(conn: sqlite3.Connection, organization_id: str, old_id: str, canonical_id: str) -> None:
    old = conn.execute(
        "SELECT * FROM product_pricing_settings WHERE organization_id = ? AND product_id = ?",
        (organization_id, old_id),
    ).fetchone()
    if not old:
        return
    current = conn.execute(
        "SELECT * FROM product_pricing_settings WHERE organization_id = ? AND product_id = ?",
        (organization_id, canonical_id),
    ).fetchone()
    if not current:
        conn.execute("UPDATE product_pricing_settings SET product_id = ? WHERE organization_id = ? AND product_id = ?", (canonical_id, organization_id, old_id))
        return
    conn.execute(
        """
        UPDATE product_pricing_settings
        SET cost_price = COALESCE(cost_price, ?),
            product_role = CASE WHEN COALESCE(product_role, 'normal') = 'normal' AND ? <> 'normal' THEN ? ELSE product_role END,
            notes = CASE WHEN COALESCE(notes, '') = '' THEN ? ELSE notes END,
            updated_at = CURRENT_TIMESTAMP
        WHERE organization_id = ? AND product_id = ?
        """,
        (old["cost_price"], old["product_role"] or "normal", old["product_role"] or "normal", old["notes"] or "", organization_id, canonical_id),
    )
    conn.execute("DELETE FROM product_pricing_settings WHERE organization_id = ? AND product_id = ?", (organization_id, old_id))


def _merge_supplier_product_rules(conn: sqlite3.Connection, organization_id: str, old_id: str, canonical_id: str) -> None:
    for old in conn.execute(
        "SELECT * FROM supplier_product_rules WHERE organization_id = ? AND product_id = ?",
        (organization_id, old_id),
    ).fetchall():
        current = conn.execute(
            """
            SELECT * FROM supplier_product_rules
            WHERE organization_id = ? AND supplier_id = ? AND product_id = ?
            """,
            (organization_id, old["supplier_id"], canonical_id),
        ).fetchone()
        if not current:
            conn.execute(
                """
                UPDATE supplier_product_rules
                SET product_id = ?
                WHERE organization_id = ? AND supplier_id = ? AND product_id = ?
                """,
                (canonical_id, organization_id, old["supplier_id"], old_id),
            )
            continue
        conn.execute(
            """
            UPDATE supplier_product_rules
            SET supplier_sku = CASE WHEN COALESCE(supplier_sku, '') = '' THEN ? ELSE supplier_sku END,
                package_size = CASE WHEN COALESCE(package_size, 1) <= 1 AND ? > 1 THEN ? ELSE package_size END,
                minimum_quantity = CASE WHEN COALESCE(minimum_quantity, 0) = 0 AND ? > 0 THEN ? ELSE minimum_quantity END,
                lead_time_days = COALESCE(lead_time_days, ?),
                last_purchase_cost = COALESCE(last_purchase_cost, ?),
                active = MAX(COALESCE(active, 0), ?),
                notes = CASE WHEN COALESCE(notes, '') = '' THEN ? ELSE notes END
            WHERE organization_id = ? AND supplier_id = ? AND product_id = ?
            """,
            (
                old["supplier_sku"] or "",
                float(old["package_size"] or 1),
                float(old["package_size"] or 1),
                float(old["minimum_quantity"] or 0),
                float(old["minimum_quantity"] or 0),
                old["lead_time_days"],
                old["last_purchase_cost"],
                int(old["active"] or 0),
                old["notes"] or "",
                organization_id,
                old["supplier_id"],
                canonical_id,
            ),
        )
        conn.execute(
            "DELETE FROM supplier_product_rules WHERE organization_id = ? AND supplier_id = ? AND product_id = ?",
            (organization_id, old["supplier_id"], old_id),
        )


def _merge_product_identifiers(conn: sqlite3.Connection, organization_id: str, old_id: str, canonical_id: str, old_source_code: str) -> None:
    safe_source_code = _safe_legacy_source_code(old_source_code)
    if safe_source_code:
        conn.execute(
            """
            INSERT OR IGNORE INTO product_identifiers
                (organization_id, product_id, identifier_type, identifier_value, source_system)
            VALUES (?, ?, 'legacy_source_code', ?, 'product_code_normalization')
            """,
            (organization_id, canonical_id, safe_source_code),
        )
    for old in conn.execute("SELECT * FROM product_identifiers WHERE product_id = ?", (old_id,)).fetchall():
        existing = conn.execute(
            """
            SELECT id FROM product_identifiers
            WHERE organization_id = ? AND identifier_type = ? AND identifier_value = ?
            LIMIT 1
            """,
            (old["organization_id"], old["identifier_type"], old["identifier_value"]),
        ).fetchone()
        if existing:
            conn.execute("DELETE FROM product_identifiers WHERE id = ?", (old["id"],))
        else:
            conn.execute("UPDATE product_identifiers SET product_id = ? WHERE id = ?", (canonical_id, old["id"]))


def _merge_inventory_snapshots(conn: sqlite3.Connection, organization_id: str, old_id: str, canonical_id: str) -> None:
    for old in conn.execute("SELECT * FROM inventory_snapshots WHERE organization_id = ? AND product_id = ?", (organization_id, old_id)).fetchall():
        if old["import_batch_id"] is None:
            existing = conn.execute(
                """
                SELECT id, quantity_on_hand FROM inventory_snapshots
                WHERE organization_id = ? AND store_id = ? AND product_id = ? AND snapshot_date = ? AND import_batch_id IS NULL
                LIMIT 1
                """,
                (organization_id, old["store_id"], canonical_id, old["snapshot_date"]),
            ).fetchone()
        else:
            existing = conn.execute(
                """
                SELECT id, quantity_on_hand FROM inventory_snapshots
                WHERE organization_id = ? AND store_id = ? AND product_id = ? AND snapshot_date = ? AND import_batch_id = ?
                LIMIT 1
                """,
                (organization_id, old["store_id"], canonical_id, old["snapshot_date"], old["import_batch_id"]),
            ).fetchone()
        if existing:
            if float(existing["quantity_on_hand"] or 0) == 0 and float(old["quantity_on_hand"] or 0) != 0:
                conn.execute("UPDATE inventory_snapshots SET quantity_on_hand = ? WHERE id = ?", (old["quantity_on_hand"], existing["id"]))
            conn.execute("DELETE FROM inventory_snapshots WHERE id = ?", (old["id"],))
        else:
            conn.execute("UPDATE inventory_snapshots SET product_id = ? WHERE id = ?", (canonical_id, old["id"]))


def _merge_product_code_duplicate(conn: sqlite3.Connection, old: sqlite3.Row, canonical_id: str, canonical_code: str) -> None:
    old_id = old["id"]
    organization_id = old["organization_id"]
    if old_id == canonical_id:
        if old["source_code"] != canonical_code:
            conn.execute("UPDATE products SET source_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (canonical_code, canonical_id))
        return
    _merge_product_settings(conn, organization_id, old_id, canonical_id)
    _merge_product_pricing_settings(conn, organization_id, old_id, canonical_id)
    _merge_supplier_product_rules(conn, organization_id, old_id, canonical_id)
    _merge_product_identifiers(conn, organization_id, old_id, canonical_id, old["source_code"] or "")
    _merge_inventory_snapshots(conn, organization_id, old_id, canonical_id)

    special_tables = {"product_settings", "product_pricing_settings", "supplier_product_rules", "product_identifiers", "inventory_snapshots"}
    for table in _product_tables(conn):
        if table in special_tables:
            continue
        columns = _table_columns(conn, table)
        if "source_code" in columns:
            conn.execute(f"UPDATE {table} SET source_code = ? WHERE product_id = ?", (canonical_code, old_id))
        conn.execute(f"UPDATE {table} SET product_id = ? WHERE product_id = ?", (canonical_id, old_id))

    conn.execute(
        "UPDATE source_entity_changes SET entity_id = ?, source_code = ? WHERE entity_type = 'product' AND entity_id = ?",
        (canonical_id, canonical_code, old_id),
    )
    conn.execute("UPDATE action_items SET target_id = ? WHERE target_type = 'product' AND target_id = ?", (canonical_id, old_id))
    conn.execute("UPDATE operational_decisions SET entity_id = ? WHERE entity_type = 'product' AND entity_id = ?", (canonical_id, old_id))
    conn.execute("UPDATE audit_log SET target_id = ? WHERE target_type = 'product' AND target_id = ?", (canonical_id, old_id))
    conn.execute(
        """
        UPDATE products
        SET name = CASE WHEN name = ? AND ? <> '' THEN ? ELSE name END,
            normalized_name = CASE WHEN name = ? AND ? <> '' THEN ? ELSE normalized_name END,
            brand_id = COALESCE(brand_id, ?),
            first_seen_import_batch_id = COALESCE(first_seen_import_batch_id, ?),
            last_seen_import_batch_id = COALESCE(?, last_seen_import_batch_id),
            active = MAX(COALESCE(active, 0), ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (
            f"Produto {canonical_code}",
            old["name"] or "",
            old["name"] or "",
            f"Produto {canonical_code}",
            old["name"] or "",
            normalize(old["name"] or ""),
            old["brand_id"],
            old["first_seen_import_batch_id"],
            old["last_seen_import_batch_id"],
            int(old["active"] or 0),
            canonical_id,
        ),
    )
    conn.execute("DELETE FROM products WHERE id = ?", (old_id,))


def _unify_product_codes(conn: sqlite3.Connection) -> None:
    product_rows = conn.execute("SELECT * FROM products ORDER BY organization_id, source_code, id").fetchall()
    groups: dict[tuple[str, str], list[sqlite3.Row]] = {}
    for row in product_rows:
        _canonical_id, canonical_code = _canonical_product_id(row["organization_id"], row["source_code"])
        if canonical_code:
            groups.setdefault((row["organization_id"], canonical_code), []).append(row)

    for (organization_id, canonical_code), group in groups.items():
        canonical_id, _ = _canonical_product_id(organization_id, canonical_code)
        needs_merge = len(group) > 1 or any(row["id"] != canonical_id or row["source_code"] != canonical_code for row in group)
        if not needs_merge:
            continue
        canonical = next((row for row in group if row["id"] == canonical_id), None)
        if not canonical:
            canonical = next((row for row in group if row["source_code"] == canonical_code), None)
        if not canonical:
            canonical = sorted(group, key=lambda row: (len(row["source_code"] or ""), row["source_code"] or "", row["id"]))[0]
        if not conn.execute("SELECT 1 FROM products WHERE id = ?", (canonical_id,)).fetchone():
            conn.execute(
                "UPDATE products SET source_code = '__migrating__' || id "
                "WHERE organization_id = ? AND source_code = ? AND id <> ?",
                (organization_id, canonical_code, canonical_id),
            )
            _copy_product_as_canonical(conn, canonical, canonical_id, canonical_code)
        for row in group:
            _merge_product_code_duplicate(conn, row, canonical_id, canonical_code)
        conn.execute("INSERT OR IGNORE INTO product_settings (organization_id, product_id) VALUES (?, ?)", (organization_id, canonical_id))


def _cleanup_invalid_legacy_product_identifiers(conn: sqlite3.Connection) -> None:
    for row in conn.execute(
        """
        SELECT id, identifier_value
        FROM product_identifiers
        WHERE identifier_type = 'legacy_source_code'
        """
    ).fetchall():
        if not _safe_legacy_source_code(row["identifier_value"]):
            conn.execute("DELETE FROM product_identifiers WHERE id = ?", (row["id"],))


def _restore_generic_product_names_from_source_records(conn: sqlite3.Connection) -> None:
    if not conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'source_records'").fetchone():
        return
    names: dict[tuple[str, str], str] = {}
    for row in conn.execute(
        """
        SELECT ib.organization_id, sr.source_key, sr.raw_payload_json
        FROM source_records sr
        JOIN import_batches ib ON ib.id = sr.import_batch_id
        WHERE sr.record_type IN ('product_price', 'product_cost')
          AND COALESCE(sr.source_key, '') <> ''
        ORDER BY sr.id
        """
    ).fetchall():
        try:
            payload = json.loads(row["raw_payload_json"] or "[]")
        except json.JSONDecodeError:
            continue
        if not isinstance(payload, list) or len(payload) < 3:
            continue
        name = str(payload[2] or "").strip()
        canonical_code = normalize_code(row["source_key"]) or row["source_key"]
        if name and canonical_code:
            names[(row["organization_id"], canonical_code)] = name
    for (organization_id, canonical_code), name in names.items():
        conn.execute(
            """
            UPDATE products
            SET name = ?,
                normalized_name = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE organization_id = ?
              AND source_code = ?
              AND name = ?
            """,
            (name, normalize(name), organization_id, canonical_code, f"Produto {canonical_code}"),
        )


def _is_corrupt_product_source_code(source_code: object) -> bool:
    text = str(source_code or "")
    if not text.strip():
        return False
    if len(text) > 80:
        return True
    return any(ord(char) < 32 or ord(char) > 126 for char in text)


def _product_fact_count(conn: sqlite3.Connection, table: str, product_id: str) -> int:
    if not _table_exists(conn, table) or "product_id" not in _table_columns(conn, table):
        return 0
    row = conn.execute(f"SELECT COUNT(*) AS total FROM {table} WHERE product_id = ?", (product_id,)).fetchone()
    return int(row["total"] or 0)


def _product_has_commercial_facts(conn: sqlite3.Connection, product_id: str) -> bool:
    return any(
        _product_fact_count(conn, table, product_id) > 0
        for table in ("product_sales", "quote_request_items", "purchase_order_items")
    )


def _corrupt_product_code(conn: sqlite3.Connection, product_id: str, source_code: str) -> str:
    digest = sha1(f"{product_id}|{source_code}".encode("utf-8", "surrogatepass")).hexdigest()[:10]
    candidate = f"corrupt_{digest}"
    suffix = 1
    while conn.execute("SELECT 1 FROM products WHERE source_code = ? AND id <> ?", (candidate, product_id)).fetchone():
        candidate = f"corrupt_{digest}_{suffix}"
        suffix += 1
    return candidate


def _snapshot_fact_counts(conn: sqlite3.Connection, product_id: str) -> dict[str, int]:
    return {
        table: _product_fact_count(conn, table, product_id)
        for table in ("inventory_snapshots", "price_snapshots", "cost_snapshots")
    }


def _quarantine_corrupt_product_codes(conn: sqlite3.Connection) -> None:
    if not _table_exists(conn, "products"):
        return
    rows = conn.execute(
        """
        SELECT id, organization_id, source_code, name, active
        FROM products
        WHERE COALESCE(active, 1) = 1
        """
    ).fetchall()
    for row in rows:
        source_code = str(row["source_code"] or "")
        if not _is_corrupt_product_source_code(source_code):
            continue
        if _product_has_commercial_facts(conn, row["id"]):
            continue
        new_code = _corrupt_product_code(conn, row["id"], source_code)
        new_name = f"Produto corrompido isolado {new_code[-10:]}"
        before_json = json.dumps(
            {
                "source_code_length": len(source_code),
                "name_length": len(str(row["name"] or "")),
                "active": int(row["active"] or 0),
                "snapshots": _snapshot_fact_counts(conn, row["id"]),
            },
            ensure_ascii=True,
        )
        after_json = json.dumps({"source_code": new_code, "name": new_name, "active": 0}, ensure_ascii=True)
        conn.execute(
            """
            UPDATE products
            SET source_code = ?,
                name = ?,
                normalized_name = ?,
                active = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (new_code, new_name, normalize(new_name), row["id"]),
        )
        if _table_exists(conn, "audit_log"):
            conn.execute(
                """
                INSERT INTO audit_log
                    (organization_id, action, target_type, target_id, before_json, after_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    row["organization_id"],
                    "product_corrupt_code_quarantined",
                    "product",
                    row["id"],
                    before_json,
                    after_json,
                ),
            )


def ensure_schema_upgrades(conn: sqlite3.Connection) -> None:
    ensure_schema_migrations_table(conn)
    _run_legacy_idempotent_upgrades(conn)
    record_schema_migration(
        conn,
        LEGACY_SCHEMA_MIGRATION_ID,
        "Upgrades idempotentes legados consolidados antes do versionamento formal.",
    )
    _ensure_whatsapp_crm_schema(conn)
    record_schema_migration(
        conn,
        WHATSAPP_SCHEMA_MIGRATION_ID,
        "Piloto da central de atendimento WhatsApp com conversas, mensagens e eventos.",
    )
    _ensure_auth_schema(conn)
    record_schema_migration(
        conn,
        AUTH_SCHEMA_MIGRATION_ID,
        "Login, sessoes e permissoes por modulo.",
    )
    _ensure_app_settings_schema(conn)
    record_schema_migration(
        conn,
        APP_SETTINGS_SCHEMA_MIGRATION_ID,
        "Configuracoes locais do app e estado de onboarding.",
    )
    _ensure_operational_data_sources_schema(conn)
    record_schema_migration(
        conn,
        OPERATIONAL_DATA_SOURCES_MIGRATION_ID,
        "Fontes operacionais e vinculos de origem para uso integrado ou standalone.",
    )
    _ensure_performance_indexes(conn)
    record_schema_migration(
        conn,
        PERFORMANCE_INDEX_MIGRATION_ID,
        "Indices de data normalizada para acelerar consultas por periodo.",
    )
    _ensure_quote_response_quantity_schema(conn)
    record_schema_migration(
        conn,
        QUOTE_RESPONSE_QUANTITY_MIGRATION_ID,
        "Quantidade confirmada na resposta da cotacao antes da geracao do pedido.",
    )
    _normalize_supplier_reference_values(conn)
    record_schema_migration(
        conn,
        SUPPLIER_REFERENCE_NORMALIZATION_MIGRATION_ID,
        "Normalizacao de referencia do fornecedor removendo zeros antes do primeiro numero.",
    )
    _unify_product_codes(conn)
    _cleanup_invalid_legacy_product_identifiers(conn)
    record_schema_migration(
        conn,
        PRODUCT_LEGACY_IDENTIFIER_CLEANUP_MIGRATION_ID,
        "Limpeza de legacy_source_code corrompido ou concatenado apos normalizacao de produtos.",
    )
    _restore_generic_product_names_from_source_records(conn)
    record_schema_migration(
        conn,
        PRODUCT_CODE_NORMALIZATION_MIGRATION_ID,
        "Unificacao de produtos por codigo normalizado, ignorando zeros a esquerda.",
    )
    _quarantine_corrupt_product_codes(conn)
    record_schema_migration(
        conn,
        CORRUPT_PRODUCT_CODE_QUARANTINE_MIGRATION_ID,
        "Quarentena segura de produtos com codigo de origem corrompido e sem fatos comerciais.",
    )
    _neutralize_auto_target_coverage_days(conn)
    record_schema_migration(
        conn,
        PRODUCT_COVERAGE_AUTO_DEFAULT_MIGRATION_ID,
        "Dias de cobertura automaticos neutralizados; horizonte passa a ser calculado pelo motor.",
    )
    _ensure_customer_catalog_schema(conn)
    record_schema_migration(
        conn,
        CUSTOMER_CATALOG_MIGRATION_ID,
        "Cria catalogo negociado por cliente, itens, eventos e midias de produto.",
    )
    _ensure_customer_crm_profile_schema(conn)
    record_schema_migration(
        conn,
        CUSTOMER_CRM_PROFILE_MIGRATION_ID,
        "Cria perfil CRM manual do cliente e trilho inicial de acoes comerciais.",
    )
    conn.commit()
