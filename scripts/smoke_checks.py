from __future__ import annotations

import json
import os
import re
import sqlite3
import struct
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / "scripts"
SCHEMA_PATH = ROOT / "schema" / "canonical.sql"
WEB_DIR = ROOT / "web"

sys.path.insert(0, str(SCRIPTS_DIR))

import import_practica  # noqa: E402
import app_config  # noqa: E402
import serve_app  # noqa: E402
from api_contracts import (  # noqa: E402
    api_health,
    assert_app_config_contract,
    assert_actions_today_contract,
    assert_commercial_intelligence_contract,
    assert_customer_catalog_contract,
    assert_customer_crm_contract,
    assert_customers_top_contract,
    assert_health_contract,
    assert_imports_contract,
    assert_installation_contract,
    assert_onboarding_contract,
    assert_pricing_contract,
    assert_products_search_contract,
    assert_products_top_contract,
    assert_purchase_order_detail_contract,
    assert_purchase_orders_contract,
    assert_quote_detail_contract,
    assert_quotes_list_contract,
    assert_replenishment_contract,
    assert_replenishment_v2_contract,
    assert_services_top_contract,
    assert_summary_contract,
    assert_supplier_workbench_suppliers_contract,
    assert_supplier_workbench_contract,
)
from action_center import api_actions_today  # noqa: E402
from app_config import app_public_config, white_label_config  # noqa: E402
from auth import api_auth_me, upsert_user  # noqa: E402
from commercial import api_commercial_intelligence, api_customers, api_services  # noqa: E402
from customer_catalog import api_customer_catalog, api_products_search, upsert_customer_catalog_item  # noqa: E402
from customer_crm import api_customer_crm, upsert_customer_crm  # noqa: E402
from db_helpers import normalize_code  # noqa: E402
from db_helpers import mark_app_controlled_fields  # noqa: E402
from erp_import_flow import (  # noqa: E402
    api_imports,
    apply_erp_product_context,
    materialize_erp_inventory_snapshot,
    materialize_erp_price_snapshot,
    materialize_erp_product_sale,
    materialize_erp_product_settings,
    materialize_erp_supplier_profile,
    parse_biff_sheet,
    parse_biff_sst,
    upsert_erp_customer,
    upsert_erp_product_from_record,
)
from nexo_skills_runtime import api_nexo_skills  # noqa: E402
from pricing import api_pricing, update_product_pricing  # noqa: E402
from product_views import api_product_detail, api_summary, api_top_products, upsert_product_profile  # noqa: E402
from quotes import (  # noqa: E402
    api_quote_detail,
    api_quotes,
    api_purchase_order_detail,
    api_purchase_orders,
    api_supplier_workbench_list,
    api_supplier_workbench,
    update_pending_purchase_order,
    export_quote_pdf,
    latest_purchase_costs,
    receive_purchase_order,
    update_quote_request,
    update_quote_response,
    upsert_quote_item,
)
from replenishment import api_replenishment  # noqa: E402
from replenishment_v2 import api_replenishment_v2  # noqa: E402
from replenishment_v2_scenarios import run as run_replenishment_v2_scenarios  # noqa: E402
from sales_orders import export_sales_order_pdf  # noqa: E402
from schema_upgrades import ensure_schema_upgrades  # noqa: E402
from schema_upgrades import LEGACY_SCHEMA_MIGRATION_ID  # noqa: E402
from schema_upgrades import OPERATIONAL_DATA_SOURCES_MIGRATION_ID  # noqa: E402
from schema_upgrades import CORRUPT_PRODUCT_CODE_QUARANTINE_MIGRATION_ID  # noqa: E402
from schema_upgrades import _safe_legacy_source_code  # noqa: E402


ORG_ID = "org_smoke"
STORE_ID = "store_smoke"
BRAND_ID = "brand_smoke"
SUPPLIER_ID = "supplier_smoke"
PRODUCT_FAST = "product_fast"
PRODUCT_NO_SALES = "product_no_sales"
CUSTOMER_FAST = "customer_fast"


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def smoke_code_normalization() -> None:
    check(normalize_code("000123") == "123", "Normalizacao nao removeu zeros iniciais numericos.")
    check(normalize_code("ABC000123") == "ABC123", "Normalizacao nao removeu zeros antes do primeiro numero.")
    check(import_practica.product_id("org", "000123") == "org:product:123", "ID de produto deve ignorar zeros a esquerda.")
    check(_safe_legacy_source_code("00000080") == "00000080", "Codigo legado numerico valido foi rejeitado.")
    check(_safe_legacy_source_code("080 7890000000000 NOBRE") == "", "Codigo legado concatenado nao foi bloqueado.")
    check(_safe_legacy_source_code("㌀㐀㔀 JAGUAR 789695") == "", "Codigo legado corrompido nao foi bloqueado.")


def open_memory_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    ensure_schema_upgrades(conn)
    return conn


def open_file_db(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    ensure_schema_upgrades(conn)
    return conn


def seed_fixture(conn: sqlite3.Connection) -> None:
    conn.execute("INSERT INTO organizations (id, name) VALUES (?, ?)", (ORG_ID, "Loja Smoke"))
    conn.execute("INSERT INTO stores (id, organization_id, name) VALUES (?, ?, ?)", (STORE_ID, ORG_ID, "Matriz"))
    conn.execute(
        "INSERT INTO brands (id, organization_id, name, normalized_name) VALUES (?, ?, ?, ?)",
        (BRAND_ID, ORG_ID, "Marca Smoke", "marca_smoke"),
    )
    conn.execute(
        """
        INSERT INTO suppliers
            (id, organization_id, name, normalized_name, minimum_order_value, average_lead_time_days, order_review_cycle_days)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (SUPPLIER_ID, ORG_ID, "Fornecedor Smoke", "fornecedor_smoke", 200, 3, 7),
    )
    conn.execute(
        """
        INSERT INTO brand_supplier_rules (organization_id, brand_id, supplier_id, notes)
        VALUES (?, ?, ?, ?)
        """,
        (ORG_ID, BRAND_ID, SUPPLIER_ID, "Fornecedor ficticio para smoke check."),
    )
    conn.execute(
        """
        INSERT INTO customers (id, organization_id, source_code, name, normalized_name, canonical_name)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (CUSTOMER_FAST, ORG_ID, "C001", "Cliente Smoke", "cliente_smoke", "cliente smoke"),
    )
    products = [
        (PRODUCT_FAST, ORG_ID, "P001", "Produto Giro Rapido", "produto_giro_rapido", "UN", BRAND_ID),
        (PRODUCT_NO_SALES, ORG_ID, "P002", "Produto Sem Venda", "produto_sem_venda", "UN", BRAND_ID),
    ]
    conn.executemany(
        """
        INSERT INTO products
            (id, organization_id, source_code, name, normalized_name, unit, brand_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        products,
    )
    conn.executemany(
        """
        INSERT INTO product_settings
            (organization_id, product_id, preferred_supplier_id, package_size, target_coverage_days)
        VALUES (?, ?, ?, ?, ?)
        """,
        [
            (ORG_ID, PRODUCT_FAST, SUPPLIER_ID, 6, 30),
            (ORG_ID, PRODUCT_NO_SALES, SUPPLIER_ID, 4, 30),
        ],
    )
    for day in range(1, 11):
        conn.execute(
            """
            INSERT INTO product_sales
                (organization_id, store_id, product_id, customer_id, sold_at, quantity, gross_amount)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (ORG_ID, STORE_ID, PRODUCT_FAST, CUSTOMER_FAST, f"2026-01-{day:02d}", 4, 40),
        )
    conn.executemany(
        """
        INSERT INTO inventory_snapshots
            (organization_id, store_id, product_id, snapshot_date, quantity_on_hand)
        VALUES (?, ?, ?, ?, ?)
        """,
        [
            (ORG_ID, STORE_ID, PRODUCT_FAST, "2025-12-31", 999),
            (ORG_ID, STORE_ID, PRODUCT_FAST, "2026-01-11", 0),
            (ORG_ID, STORE_ID, PRODUCT_NO_SALES, "2026-01-11", 5),
        ],
    )
    conn.executemany(
        """
        INSERT INTO price_snapshots
            (organization_id, store_id, product_id, snapshot_date, sale_price)
        VALUES (?, ?, ?, ?, ?)
        """,
        [
            (ORG_ID, STORE_ID, PRODUCT_FAST, "2026-01-11", 10),
            (ORG_ID, STORE_ID, PRODUCT_NO_SALES, "2026-01-11", 16),
        ],
    )
    conn.execute(
        """
        INSERT INTO cost_snapshots
            (organization_id, product_id, snapshot_date, purchase_cost, total_cost)
        VALUES (?, ?, ?, ?, ?)
        """,
        (ORG_ID, PRODUCT_FAST, "2026-01-11", 12, 12),
    )
    conn.execute(
        """
        INSERT INTO product_identifiers
            (organization_id, product_id, identifier_type, identifier_value, source_system)
        VALUES (?, ?, 'supplier_reference', ?, 'manual')
        """,
        (ORG_ID, PRODUCT_FAST, "MANUAL-P001"),
    )
    conn.execute(
        """
        INSERT INTO quote_requests
            (id, organization_id, supplier_id, supplier_name, contact_phone, status, total_estimated_amount, item_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("quote_smoke", ORG_ID, SUPPLIER_ID, "Fornecedor Smoke", "", "draft", 72, 1),
    )
    conn.execute(
        """
        INSERT INTO quote_request_items
            (quote_request_id, product_id, source_code, supplier_reference, quote_code, product_name, unit,
             purchase_unit, purchase_package_size, coverage_target_days,
             suggested_quantity, requested_quantity, estimated_unit_cost, estimated_total_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("quote_smoke", PRODUCT_FAST, "P001", "MANUAL-P001", "MANUAL-P001", "Produto Giro Rapido", "UN", "CX", 6, 45, 6, 6, 12, 72),
    )
    conn.commit()


def smoke_schema_and_import_bootstrap() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        db_path = Path(tmp_dir) / "nexovarejo_smoke.db"
        conn = import_practica.begin_db(db_path)
        try:
            tables = {
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                ).fetchall()
            }
            for table in {
                "products",
                "product_sales",
                "quote_requests",
                "purchase_orders",
                "audit_log",
                "schema_migrations",
                "operational_data_sources",
                "entity_source_links",
                "entity_field_controls",
            }:
                check(table in tables, f"Tabela esperada ausente no schema: {table}")
            migration = conn.execute(
                "SELECT id FROM schema_migrations WHERE id = ?",
                (LEGACY_SCHEMA_MIGRATION_ID,),
            ).fetchone()
            check(migration is not None, "Schema sem registro de migracao legada aplicada.")
            operational_sources_migration = conn.execute(
                "SELECT id FROM schema_migrations WHERE id = ?",
                (OPERATIONAL_DATA_SOURCES_MIGRATION_ID,),
            ).fetchone()
            check(
                operational_sources_migration is not None,
                "Schema sem registro da base de fontes operacionais.",
            )
            quarantine_migration = conn.execute(
                "SELECT id FROM schema_migrations WHERE id = ?",
                (CORRUPT_PRODUCT_CODE_QUARANTINE_MIGRATION_ID,),
            ).fetchone()
            check(
                quarantine_migration is not None,
                "Schema sem registro da quarentena de produtos corrompidos.",
            )
            check(import_practica.money("1.234,56") == 1234.56, "Parser de dinheiro perdeu formato brasileiro.")
            check(import_practica.normalize("\u00c1lcool 70%") == "alcool_70", "Normalizacao da importacao mudou.")
            cp1252_csv = Path(tmp_dir) / "cp1252.csv"
            cp1252_csv.write_bytes(b"codigo,nome\n1,\xc1lcool\n")
            check(import_practica.read_rows(cp1252_csv)[1][1] == "\u00c1lcool", "Leitor CSV legado nao aceitou cp1252.")
        finally:
            conn.close()


def smoke_corrupt_product_code_quarantine() -> None:
    conn = open_memory_db()
    try:
        conn.execute("INSERT INTO organizations (id, name) VALUES (?, ?)", (ORG_ID, "Org Smoke"))
        corrupt_code = "080 \x0178996827764188\x01NOBRE"
        product_id = f"{ORG_ID}:product:{corrupt_code}"
        conn.execute(
            """
            INSERT INTO products (id, organization_id, source_code, name, normalized_name, unit)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (product_id, ORG_ID, corrupt_code, "Produto com codigo quebrado", "produto_com_codigo_quebrado", "UN"),
        )
        conn.execute(
            """
            INSERT INTO cost_snapshots (organization_id, product_id, snapshot_date, purchase_cost, total_cost)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ORG_ID, product_id, "2026-05-22", 10, 10),
        )
        ensure_schema_upgrades(conn)
        product = conn.execute("SELECT id, source_code, name, active FROM products WHERE source_code LIKE 'corrupt_%'").fetchone()
        check(product is not None, "Produto corrompido nao foi isolado.")
        check(int(product["active"]) == 0, "Produto corrompido nao foi inativado.")
        check(str(product["source_code"]).startswith("corrupt_"), "Produto corrompido nao recebeu marcador seguro.")
        cost_count = conn.execute("SELECT COUNT(*) AS total FROM cost_snapshots WHERE product_id = ?", (product["id"],)).fetchone()
        check(int(cost_count["total"] or 0) == 1, "Quarentena removeu snapshots do produto corrompido.")
        audit = conn.execute(
            "SELECT action FROM audit_log WHERE target_id = ? AND action = ?",
            (product["id"], "product_corrupt_code_quarantined"),
        ).fetchone()
        check(audit is not None, "Quarentena nao registrou auditoria.")
    finally:
        conn.close()


def smoke_import_preserves_app_controlled_fields() -> None:
    conn = open_memory_db()
    try:
        conn.execute("INSERT INTO organizations (id, name) VALUES (?, ?)", (ORG_ID, "Org Smoke"))
        conn.execute(
            "INSERT INTO import_batches (id, organization_id, source_system, status, import_mode) VALUES (?, ?, ?, ?, ?)",
            ("batch_local_guard", ORG_ID, "erp_planilha", "finished", "incremental_sync"),
        )
        conn.execute(
            "INSERT INTO import_batches (id, organization_id, source_system, status, import_mode) VALUES (?, ?, ?, ?, ?)",
            ("batch_local_guard_new", ORG_ID, "erp_planilha", "created", "incremental_sync"),
        )
        conn.execute(
            """
            INSERT INTO products
                (id, organization_id, source_code, name, normalized_name, unit, first_seen_import_batch_id, last_seen_import_batch_id)
            VALUES (?, ?, ?, ?, ?, 'UN', ?, ?)
            """,
            ("product_local_guard", ORG_ID, "PLOCAL", "Nome ajustado no app", "nome_ajustado_no_app", "batch_local_guard", "batch_local_guard"),
        )
        mark_app_controlled_fields(
            conn,
            organization_id=ORG_ID,
            entity_type="product",
            entity_id="product_local_guard",
            source_view="smoke",
            values={"name": "Nome ajustado no app"},
        )
        upsert_erp_product_from_record(
            conn,
            org=ORG_ID,
            batch_id="batch_local_guard_new",
            code="PLOCAL",
            name="Nome vindo da planilha",
            payload={"source": "smoke"},
        )
        product = conn.execute("SELECT name, last_seen_import_batch_id FROM products WHERE id = ?", ("product_local_guard",)).fetchone()
        check(product["name"] == "Nome ajustado no app", "Importacao sobrescreveu nome de produto controlado no app.")
        check(product["last_seen_import_batch_id"] == "batch_local_guard_new", "Importacao nao atualizou presenca do produto preservado.")

        conn.execute(
            """
            INSERT INTO customers
                (id, organization_id, source_code, name, normalized_name, canonical_name, first_seen_import_batch_id, last_seen_import_batch_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "customer_local_guard",
                ORG_ID,
                "CLOCAL",
                "Cliente ajustado no app",
                "cliente_ajustado_no_app",
                "cliente_ajustado_no_app",
                "batch_local_guard",
                "batch_local_guard",
            ),
        )
        mark_app_controlled_fields(
            conn,
            organization_id=ORG_ID,
            entity_type="customer",
            entity_id="customer_local_guard",
            source_view="smoke",
            values={"name": "Cliente ajustado no app"},
        )
        customer_id = upsert_erp_customer(conn, ORG_ID, "batch_local_guard_new", "CLOCAL", "Cliente vindo da planilha")
        customers = conn.execute("SELECT id, name FROM customers WHERE organization_id = ? AND source_code = ?", (ORG_ID, "CLOCAL")).fetchall()
        check(customer_id == "customer_local_guard", "Importacao nao reutilizou cliente controlado por codigo externo.")
        check(len(customers) == 1, "Importacao criou cliente duplicado ao receber nome diferente.")
        check(customers[0]["name"] == "Cliente ajustado no app", "Importacao sobrescreveu nome de cliente controlado no app.")

        customer_a = upsert_erp_customer(conn, ORG_ID, "batch_local_guard_new", "", "Cliente Sem Codigo - Matriz")
        customer_b = upsert_erp_customer(conn, ORG_ID, "batch_local_guard_new", "", "Cliente Sem Codigo - Filial")
        canonical_customers = conn.execute(
            "SELECT id, name FROM customers WHERE organization_id = ? AND id = ?",
            (ORG_ID, customer_a),
        ).fetchall()
        check(customer_a == customer_b, "Clientes sem codigo e mesmo canonico nao foram agrupados.")
        check(len(canonical_customers) == 1, "Importacao criou duplicidade para cliente sem codigo.")

        conn.execute(
            """
            INSERT INTO suppliers
                (id, organization_id, name, normalized_name, contact_phone)
            VALUES (?, ?, ?, ?, ?)
            """,
            ("supplier_local_guard", ORG_ID, "Fornecedor Local", "fornecedor_local", "11999990000"),
        )
        mark_app_controlled_fields(
            conn,
            organization_id=ORG_ID,
            entity_type="supplier",
            entity_id="supplier_local_guard",
            source_view="smoke",
            values={"contact_phone": "11999990000"},
        )
        materialize_erp_supplier_profile(
            conn,
            org=ORG_ID,
            record={
                "normalized": {
                    "fornecedor.nome_fornecedor": "Fornecedor Local",
                    "fornecedor.telefone": "11888880000",
                    "fornecedor.email": "novo@example.com",
                }
            },
        )
        supplier = conn.execute(
            "SELECT contact_phone, contact_email FROM suppliers WHERE id = ?",
            ("supplier_local_guard",),
        ).fetchone()
        check(supplier["contact_phone"] == "11999990000", "Importacao sobrescreveu telefone de fornecedor controlado no app.")
        check(supplier["contact_email"] == "novo@example.com", "Importacao deixou de atualizar campo livre do fornecedor.")
    finally:
        conn.close()


def smoke_product_profile_upsert() -> None:
    conn = open_memory_db()
    try:
        conn.execute("INSERT INTO organizations (id, name) VALUES (?, ?)", (ORG_ID, "Org Smoke"))
        result = upsert_product_profile(
            conn,
            {
                "organization_id": ORG_ID,
                "source_code": "APP001",
                "name": "Produto criado no app",
                "unit": "UN",
                "brand_name": "Marca App",
                "category_name": "Categoria App",
                "supplier_name": "Fornecedor App",
                "barcode": "7890000000001",
                "supplier_reference": "000REF-001",
                "package_size": 12,
                "minimum_stock": 2,
                "maximum_stock": 60,
                "expires": True,
                "notes": "Cadastro standalone.",
            },
        )
        product = result["product"]
        check(product["id"], "Cadastro de produto nao retornou id.")
        check(product["brand_name"] == "Marca App", "Cadastro de produto nao vinculou marca.")
        check(product["category_name"] == "Categoria App", "Cadastro de produto nao vinculou categoria.")
        check(product["supplier_reference"] == "REF-1", "Cadastro de produto nao normalizou referencia do fornecedor.")
        check(float(product["settings"]["package_size"]) == 12.0, "Cadastro de produto nao salvou embalagem.")
        check(int(product["settings"]["target_coverage_days"]) == 0, "Cadastro de produto nao manteve cobertura automatica neutra.")
        check(product["settings"]["target_coverage_mode"] == "auto", "Cadastro de produto nao manteve cobertura calculada pelo motor.")
        detail = api_product_detail(conn, product["id"])
        controlled = {(row["entity_type"], row["field_name"]) for row in detail["controlled_fields"]}
        check(("product", "name") in controlled, "Cadastro de produto nao marcou nome como controlado pelo app.")
        check(("product_settings", "package_size") in controlled, "Cadastro de produto nao marcou compra como controlada pelo app.")
        catalog = api_top_products(conn, {"period_days": "all", "date_from": "", "date_to": "", "label": "Todo periodo"})
        check(any(row["id"] == product["id"] and float(row["revenue"] or 0) == 0.0 for row in catalog), "Produto sem venda nao apareceu na base do mix.")
    finally:
        conn.close()


def smoke_static_assets() -> None:
    html = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    js = "\n".join(
        (WEB_DIR / script_name).read_text(encoding="utf-8")
        for script_name in (
            "app_core.js",
            "app_state.js",
            "app_charts.js",
            "app_tables.js",
            "app_ui.js",
            "app_dashboard.js",
            "app_products.js",
            "app_period_data.js",
            "app_quotes_suppliers.js",
            "app_quote_dashboard.js",
            "app_purchase_orders.js",
            "app_quote_workbench.js",
            "app_quote_cycle.js",
            "app_quote_formula.js",
            "app_commercial.js",
            "app_pricing.js",
            "app_imports.js",
            "app_customers.js",
            "app_seller_portal.js",
            "app_company_profile.js",
            "app_actions_engine.js",
            "app_auth.js",
            "app_distribution.js",
            "app_implementation.js",
            "app_inventory_suppliers.js",
            "app_quote_tools.js",
            "app.js",
            "app_boot.js",
        )
    )
    backend = (SCRIPTS_DIR / "serve_app.py").read_text(encoding="utf-8")
    api_routes = (SCRIPTS_DIR / "api_routes.py").read_text(encoding="utf-8")
    schema_upgrades = (SCRIPTS_DIR / "schema_upgrades.py").read_text(encoding="utf-8")
    canonical_schema = SCHEMA_PATH.read_text(encoding="utf-8")
    white_label = white_label_config()
    assert_app_config_contract(app_public_config())
    check(white_label.get("schema") == "pulso.white_label.v1", "Config white-label sem schema esperado.")
    check((ROOT / "config" / "white_label" / "default.json").exists(), "Perfil white-label base ausente.")
    check((ROOT / "config" / "partners" / "default.json").exists(), "Perfil de parceiro base ausente.")
    check((ROOT / "config" / "distribution" / "default.json").exists(), "Perfil de distribuicao base ausente.")
    check((SCRIPTS_DIR / "partner_distribution.py").exists(), "Aplicador de perfil de distribuicao ausente.")
    check((ROOT / "docs" / "24_fluxo_parceiros_distribuicao.md").exists(), "Fluxo de parceiros/distribuicao nao documentado.")
    check((WEB_DIR / "brand" / "pulso.svg").exists(), "Logo white-label base ausente.")
    check((SCRIPTS_DIR / "http_helpers.py").exists(), "Helpers HTTP deveriam estar em scripts/http_helpers.py.")
    check((SCRIPTS_DIR / "api_contracts.py").exists(), "Contratos deveriam estar em scripts/api_contracts.py.")
    check((SCRIPTS_DIR / "api_routes.py").exists(), "Rotas API deveriam estar em scripts/api_routes.py.")
    check("from http_helpers import" in backend, "serve_app.py deveria usar helpers HTTP extraidos.")
    check("from api_routes import" in backend, "serve_app.py deveria usar roteador de API extraido.")
    check("from api_contracts import" in api_routes, "api_routes.py deveria usar contratos extraidos.")
    forbidden_domain_imports = [
        "from pricing import",
        "from quotes import",
        "from commercial import",
        "from replenishment import",
        "from product_views import",
        "from supplier_ops import",
        "from action_center import",
        "from erp_import_flow import",
    ]
    leaked_imports = [item for item in forbidden_domain_imports if item in backend]
    check(not leaked_imports, f"serve_app.py voltou a importar dominios: {leaked_imports}")
    check("schema_migrations" in schema_upgrades and "schema_migrations" in canonical_schema, "Schema sem trilho de migracoes versionadas.")
    assets = sorted(set(re.findall(r'(?:src|href)="(/[^"#?]+)(?:\?[^"]*)?"', html)))
    for asset in assets:
        if asset.startswith("/api/"):
            continue
        path = Path(asset)
        if path.suffix:
            target = (WEB_DIR / asset.lstrip("/")).resolve()
            check(WEB_DIR.resolve() in target.parents or target == WEB_DIR.resolve(), f"Asset fora de web/: {asset}")
            check(target.exists(), f"Asset referenciado no HTML nao existe: {asset}")
        elif asset != "/":
            check(asset in serve_app.SPA_ROUTES, f"Rota SPA referenciada no HTML nao existe no servidor: {asset}")

    nav_views = set(re.findall(r'data-view="([^"]+)"', html))
    view_sections = {
        match.group(1)
        for match in re.finditer(r'<section\s+id="([^"]+)"\s+class="([^"]*)"', html)
        if "view" in match.group(2).split()
    }
    missing_sections = sorted(nav_views - view_sections)
    check(not missing_sections, f"Navegacao aponta para views ausentes: {missing_sections}")
    view_routes_match = re.search(r"const VIEW_ROUTES = \{(?P<body>.*?)\};", js, re.DOTALL)
    check(view_routes_match is not None, "VIEW_ROUTES nao encontrado no frontend.")
    if view_routes_match is not None:
        for route in sorted(set(re.findall(r':\s*"(/[^"]+)"', view_routes_match.group("body")))):
            check(route in serve_app.SPA_ROUTES, f"Rota de tela nao existe no servidor: {route}")
    for vendor in {"echarts.min.js", "lucide.min.js"}:
        check((WEB_DIR / "vendor" / vendor).exists(), f"Vendor asset ausente: {vendor}")

    js_api_routes = set(re.findall(r"""[`"'](/api/[A-Za-z0-9_./-]+)""", js))
    backend_api_routes = set(re.findall(r'"(/api/[A-Za-z0-9_./-]+)"', backend + "\n" + api_routes))
    missing_routes = sorted(js_api_routes - backend_api_routes)
    check(not missing_routes, f"Frontend chama rotas API ausentes no backend: {missing_routes}")
    check("send_api_error" in backend, "Servidor perdeu envelope padrao de erro de API.")
    check("appErrorBanner" in html and "showAppError" in js, "Frontend perdeu aviso global de erro.")
    check("quoteJourney" in html and "renderQuoteJourney" in js, "Fase 3 perdeu jornada guiada de compras.")
    check("customerRelationshipQueue" in html and "renderCustomerRelationshipQueue" in js, "Fase 3 perdeu fila de relacionamento de clientes.")
    check("stockDecisionQueue" in html and "renderStockDecisionQueue" in js, "Fase 3 perdeu fila de decisao de estoque.")
    for expected in {
        "apiContract",
        "apiRows",
        "summary.v1",
        "replenishment.v1",
        "commercial_intelligence.v1",
        "customer_catalog.v1",
        "customer_crm.v1",
        "products_search.v1",
        "pricing.v1",
        "actions_today.v1",
        "imports.v1",
    }:
        check(expected in js, f"Frontend perdeu guarda de contrato: {expected}")

    html_ids = set(re.findall(r'id="([^"]+)"', html))
    template_ids = set(re.findall(r'id="([^"]+)"', js))
    static_selectors = set(re.findall(r"""querySelector(?:All)?\(["']#([A-Za-z0-9_-]+)["']\)""", js))
    static_selectors |= set(re.findall(r"""getElementById\(["']([A-Za-z0-9_-]+)["']\)""", js))
    optional_feature_ids = {
        "dashboardBlockControls",
        "dashboardEditPanel",
        "dashboardOperatorBoard",
        "dashboardPotentialBody",
        "erpImportUpdateMode",
        "generalMapCards",
        "generalMapHero",
        "kpis",
        "linkImportAnalyze",
        "linkImportFile",
        "linkImportPreview",
        "linkImportStatus",
        "maturity",
        "maturityNextButton",
        "missions",
        "operatorMovements",
        "operatorTools",
        "tasks",
    }
    missing_ids = sorted(static_selectors - html_ids - template_ids - optional_feature_ids)
    check(not missing_ids, f"JS usa IDs estaticos ausentes no HTML/templates: {missing_ids}")


def smoke_new_tenant_isolation() -> None:
    env_names = [
        "PULSO_CONFIG",
        "NEXOVAREJO_CONFIG",
        "PULSO_APP_NAME",
        "NEXOVAREJO_APP_NAME",
        "PULSO_DEFAULT_ORG_ID",
        "NEXOVAREJO_DEFAULT_ORG_ID",
        "PULSO_DEFAULT_COMPANY_NAME",
        "NEXOVAREJO_DEFAULT_COMPANY_NAME",
        "PULSO_IMPORTED_COMPANY_NAME",
        "NEXOVAREJO_IMPORTED_COMPANY_NAME",
        "PULSO_DEFAULT_STORE_NAME",
        "NEXOVAREJO_DEFAULT_STORE_NAME",
    ]
    saved_env = {name: os.environ.get(name) for name in env_names}
    original_tenants_dir = app_config.TENANTS_DIR
    original_legacy_config = app_config.LEGACY_LOCAL_CONFIG_PATH
    try:
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_root = Path(tmp_dir)
            global_config = tmp_root / "practica_global.json"
            global_config.write_text(
                json.dumps(
                    {
                        "schema": "pulso.white_label.v1",
                        "public": {"app_name": "Practica Gestao", "logo_path": "/brand/practica.svg"},
                        "defaults": {
                            "organization_id": "practica",
                            "company_name": "Practica",
                            "imported_company_name": "Practica",
                            "store_name": "Practica",
                        },
                    }
                ),
                encoding="utf-8",
            )
            os.environ["PULSO_CONFIG"] = str(global_config)
            os.environ["PULSO_APP_NAME"] = "Practica Gestao"
            os.environ["PULSO_DEFAULT_ORG_ID"] = "practica"
            os.environ["PULSO_DEFAULT_COMPANY_NAME"] = "Practica"
            app_config.TENANTS_DIR = tmp_root / "tenants"
            app_config.LEGACY_LOCAL_CONFIG_PATH = tmp_root / "local" / "app_config.json"
            tenant_dir = app_config.TENANTS_DIR / "cliente_novo"
            tenant_dir.mkdir(parents=True)

            app_config.set_active_tenant("cliente_novo")
            check(app_config.local_config_path() == tenant_dir / "app_config.json", "Config local de tenant novo saiu da pasta do tenant.")
            check(app_config.import_config_path() == tenant_dir / "import_reference.json", "Referencia de importacao nao ficou isolada por tenant.")
            check(app_config.default_organization_slug() == "org_default", "Tenant novo herdou organization_id global indevido.")
            check(app_config.default_company_name() == "Empresa", "Tenant novo herdou empresa global indevida.")
            check("Practica" not in app_config.app_public_config().get("app_name", ""), "Tenant novo herdou app_name da Practica.")

            (tenant_dir / "app_config.json").write_text(
                json.dumps(
                    {
                        "schema": "pulso.white_label.v1",
                        "public": {"app_name": "Cliente Novo", "app_subtitle": "", "logo_path": ""},
                        "defaults": {
                            "organization_id": "cliente_novo",
                            "company_name": "Cliente Novo",
                            "imported_company_name": "Cliente Novo",
                            "store_name": "Cliente Novo",
                            "country": "Brasil",
                        },
                    }
                ),
                encoding="utf-8",
            )
            check(app_config.default_organization_slug() == "cliente_novo", "Tenant nao aplicou organization_id proprio.")
            check(app_config.default_company_name() == "Cliente Novo", "Tenant nao aplicou empresa propria.")

            conn = open_memory_db()
            try:
                conn.executemany(
                    "INSERT INTO organizations (id, name) VALUES (?, ?)",
                    [("practica", "Practica"), ("cliente_novo", "Cliente Novo")],
                )
                conn.executemany(
                    """
                    INSERT INTO import_batches (id, organization_id, source_system, status, import_mode, finished_at)
                    VALUES (?, ?, 'erp_planilha', 'completed', 'smoke', CURRENT_TIMESTAMP)
                    """,
                    [("batch_practica", "practica"), ("batch_cliente", "cliente_novo")],
                )
                conn.executemany(
                    """
                    INSERT INTO source_files (id, import_batch_id, file_name, file_role, row_count)
                    VALUES (?, ?, ?, 'principal', 1)
                    """,
                    [("file_practica", "batch_practica", "practica.csv"), ("file_cliente", "batch_cliente", "cliente.csv")],
                )
                conn.execute(
                    "INSERT INTO import_issues (import_batch_id, source_file_id, severity, code, message) VALUES (?, ?, 'warning', 'smoke', 'vazamento')",
                    ("batch_practica", "file_practica"),
                )
                conn.execute(
                    """
                    INSERT INTO source_entity_changes
                        (organization_id, import_batch_id, entity_type, entity_id, source_system, field_name)
                    VALUES ('practica', 'batch_practica', 'produto', 'p1', 'erp_planilha', 'name')
                    """,
                )
                imports = api_imports(conn)
                check([batch["id"] for batch in imports["batches"]] == ["batch_cliente"], "Importacoes de outro tenant apareceram no onboarding/importacao.")
                file_names = [item["file_name"] for item in imports["local_reference"]["files"]]
                check(file_names == ["cliente.csv"], "Referencia local listou arquivo importado por outro tenant.")
                check(not imports["issues"], "Avisos de outro tenant vazaram para importacao.")
                check(not imports["changes"], "Mudancas de outro tenant vazaram para importacao.")
            finally:
                conn.close()
    finally:
        for name, value in saved_env.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        app_config.TENANTS_DIR = original_tenants_dir
        app_config.LEGACY_LOCAL_CONFIG_PATH = original_legacy_config
        app_config.set_active_tenant("")


def smoke_finished_import_status_compat() -> None:
    conn = open_memory_db()
    try:
        conn.execute("INSERT INTO organizations (id, name) VALUES (?, ?)", (ORG_ID, "Loja Smoke"))
        conn.execute(
            """
            INSERT INTO import_batches
                (id, organization_id, source_system, status, import_mode, finished_at, summary_json)
            VALUES (?, ?, 'practica_csv', 'finished', 'incremental_sync', CURRENT_TIMESTAMP, ?)
            """,
            ("batch_finished_smoke", ORG_ID, json.dumps({"rows": 5, "mapped_rows": 5})),
        )
        conn.execute(
            """
            INSERT INTO source_files (id, import_batch_id, file_name, file_role, row_count)
            VALUES (?, ?, ?, 'product_price', 5)
            """,
            ("file_finished_smoke", "batch_finished_smoke", "smoke_finished.csv"),
        )
        imports = api_imports(conn)
        check(imports["quality"]["status"] == "ready", "Lote finished legado nao foi tratado como concluido.")
        file_names = [item["file_name"] for item in imports["local_reference"]["files"]]
        check("smoke_finished.csv" in file_names, "Lote finished legado nao apareceu na referencia local.")
    finally:
        conn.close()


def smoke_skills() -> None:
    payload = api_nexo_skills()
    skills = payload.get("skills") or []
    check(payload.get("schema_version"), "Skills sem schema_version.")
    check(len(skills) >= 8, "Menos skills carregadas que o esperado.")
    required_fields = {"id", "version", "name", "purpose", "inputs", "outputs", "guardrails"}
    for skill in skills:
        missing = [field for field in required_fields if not skill.get(field)]
        check(not missing, f"Skill {skill.get('id')} sem campos enriquecidos: {missing}")
    check(payload.get("action_rules"), "Regras da Central de Acoes nao foram carregadas.")


def smoke_replenishment(conn: sqlite3.Connection) -> None:
    result = api_replenishment(conn, period={"period_days": "all", "date_from": "", "date_to": "", "label": "Todo periodo"})
    assert_replenishment_contract(result)
    by_product = {row["product_id"]: row for row in result["rows"]}
    check(PRODUCT_FAST in by_product, "Reposicao nao retornou produto com venda.")
    check(PRODUCT_NO_SALES in by_product, "Reposicao nao retornou produto sem venda no periodo.")
    check(by_product[PRODUCT_FAST]["stock_units"] == 0, "Reposicao nao usou o snapshot de estoque mais recente.")
    check(by_product[PRODUCT_FAST]["status"] in {"urgent", "buy_now"}, "Produto sem estoque e com giro nao virou compra.")
    check(by_product[PRODUCT_NO_SALES]["status"] == "no_demand", "Produto com estoque e sem venda deveria ficar sem demanda.")
    check(result["summary"]["buy_now"] >= 1, "Resumo de reposicao nao contou compra sugerida.")
    result_v2 = api_replenishment_v2(conn, period={"period_days": "all", "date_from": "", "date_to": "", "label": "Todo periodo"})
    assert_replenishment_v2_contract(result_v2)
    by_product_v2 = {row["product_id"]: row for row in result_v2["rows"]}
    check(by_product_v2[PRODUCT_FAST]["product_age_days"] > 0, "Reposicao V2 nao calculou idade comercial.")
    check(by_product_v2[PRODUCT_FAST]["demand_class"], "Reposicao V2 nao classificou demanda.")
    check(by_product_v2[PRODUCT_FAST]["demand_quantile_used"] in {"p50", "p75", "p90"}, "Reposicao V2 nao escolheu quantil de demanda.")


def smoke_replenishment_sparse_guardrail() -> None:
    conn = open_memory_db()
    try:
        seed_fixture(conn)
        product_id = "product_sparse_burst"
        slow_covered_id = "product_slow_covered"
        conn.execute(
            """
            INSERT INTO products (id, organization_id, source_code, name, normalized_name, unit, brand_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (product_id, ORG_ID, "P999", "Produto Rajada", "produto_rajada", "UN", BRAND_ID),
        )
        conn.execute(
            """
            INSERT INTO products (id, organization_id, source_code, name, normalized_name, unit, brand_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (slow_covered_id, ORG_ID, "P998", "Produto Lento Coberto", "produto_lento_coberto", "UN", BRAND_ID),
        )
        conn.execute(
            """
            INSERT INTO product_settings
                (organization_id, product_id, preferred_supplier_id, package_size, target_coverage_days)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ORG_ID, product_id, SUPPLIER_ID, 1, 45),
        )
        conn.execute(
            """
            INSERT INTO product_settings
                (organization_id, product_id, preferred_supplier_id, package_size, target_coverage_days)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ORG_ID, slow_covered_id, SUPPLIER_ID, 12, 45),
        )
        for sold_at, quantity in [("2025-07-15", 1), ("2026-01-09", 200), ("2026-01-10", 200)]:
            conn.execute(
                """
                INSERT INTO product_sales
                    (organization_id, store_id, product_id, sold_at, quantity, gross_amount)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (ORG_ID, STORE_ID, product_id, sold_at, quantity, quantity * 10),
            )
        for sold_at in ["2025-01-10", "2025-03-10", "2025-05-10"]:
            conn.execute(
                """
                INSERT INTO product_sales
                    (organization_id, store_id, product_id, sold_at, quantity, gross_amount)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (ORG_ID, STORE_ID, slow_covered_id, sold_at, 1, 10),
            )
        conn.execute(
            """
            INSERT INTO inventory_snapshots
                (organization_id, store_id, product_id, snapshot_date, quantity_on_hand)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ORG_ID, STORE_ID, product_id, "2026-01-11", 0),
        )
        conn.execute(
            """
            INSERT INTO inventory_snapshots
                (organization_id, store_id, product_id, snapshot_date, quantity_on_hand)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ORG_ID, STORE_ID, slow_covered_id, "2026-01-11", 5),
        )
        result = api_replenishment(conn, period={"period_days": "all", "date_from": "", "date_to": "", "label": "Todo periodo"})
        by_product = {row["product_id"]: row for row in result["rows"]}
        row = by_product[product_id]
        check(row["demand_signal"] in {"sparse", "burst"}, "Reposicao nao marcou historico esparso/rajada.")
        check(row["forecast_guardrail"] is True, "Reposicao nao aplicou trava de alvo para rajada esparsa.")
        check(row["target_coverage_days"] <= 30, "Rajada esparsa nao deveria usar cobertura longa automatica.")
        check(row["order_up_to"] <= 400, "Alvo de pedido ignorou limite por evidencia de demanda.")
        check(row["suggested_quantity"] <= 400, "Sugestao de pedido ignorou limite por evidencia de demanda.")
        covered_row = by_product[slow_covered_id]
        check(covered_row["stock_units"] > covered_row["order_up_to"], "Fixture de produto lento nao ficou com estoque acima do alvo.")
        check(covered_row["suggested_quantity"] == 0, "Produto lento com estoque acima do alvo nao deveria sugerir uma caixa.")
    finally:
        conn.close()


def smoke_supplier_cycle_drives_replenishment_v2() -> None:
    conn = open_memory_db()
    try:
        conn.execute("INSERT INTO organizations (id, name) VALUES (?, ?)", (ORG_ID, "Loja Smoke"))
        conn.execute("INSERT INTO stores (id, organization_id, name) VALUES (?, ?, ?)", (STORE_ID, ORG_ID, "Matriz"))
        supplier_id = "supplier_cycle_smoke"
        product_id = "product_cycle_smoke"
        conn.execute(
            """
            INSERT INTO suppliers
                (id, organization_id, name, normalized_name, minimum_order_value, average_lead_time_days, order_review_cycle_days)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (supplier_id, ORG_ID, "Fornecedor Ciclo", "fornecedor_ciclo", 300, 10, 14),
        )
        conn.execute(
            """
            INSERT INTO products (id, organization_id, source_code, name, normalized_name, unit)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (product_id, ORG_ID, "CICLO1", "Produto Ciclo Fornecedor", "produto_ciclo_fornecedor", "UN"),
        )
        conn.execute(
            """
            INSERT INTO product_settings
                (organization_id, product_id, preferred_supplier_id, package_size, target_coverage_days)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ORG_ID, product_id, supplier_id, 1, 90),
        )
        first_day = date(2026, 1, 1)
        for offset in range(90):
            sold_at = first_day + timedelta(days=offset)
            conn.execute(
                """
                INSERT INTO product_sales
                    (organization_id, store_id, product_id, sold_at, quantity, gross_amount)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (ORG_ID, STORE_ID, product_id, sold_at.isoformat(), 2, 40),
            )
        conn.execute(
            """
            INSERT INTO inventory_snapshots
                (organization_id, store_id, product_id, snapshot_date, quantity_on_hand)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ORG_ID, STORE_ID, product_id, "2026-03-31", 75),
        )
        conn.execute(
            """
            INSERT INTO cost_snapshots (organization_id, product_id, snapshot_date, purchase_cost, total_cost)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ORG_ID, product_id, "2026-03-31", 10, 10),
        )
        result = api_replenishment_v2(conn, period={"period_days": "all", "date_from": "", "date_to": "", "label": "Todo periodo"})
        row = {item["product_id"]: item for item in result["rows"]}[product_id]
        check(row["order_horizon_source"] == "supplier_cycle", "Reposicao V2 deixou cobertura automatica vencer o ciclo do fornecedor.")
        check(row["order_horizon_days"] <= 30, "Reposicao V2 alongou fornecedor facil para uma cobertura longa.")
        check(row["suggested_quantity"] == 0, "Produto coberto ate a proxima rodada do fornecedor entrou em compra.")
        check(row["projected_coverage_days"] > row["order_horizon_days"], "Fixture nao ficou coberto ate a proxima rodada.")
    finally:
        conn.close()


def smoke_imported_settings_guardrails() -> None:
    conn = open_memory_db()
    try:
        conn.execute("INSERT INTO organizations (id, name) VALUES (?, ?)", (ORG_ID, "Loja Smoke"))
        conn.execute(
            """
            INSERT INTO import_batches (id, organization_id, source_system, status, import_mode)
            VALUES (?, ?, 'erp_planilha', 'running', 'smoke')
            """,
            ("batch_settings_smoke", ORG_ID),
        )
        record = {
            "normalized": {
                "produto.codigo_produto": "P900",
                "produto.nome_produto": "Produto Configuracao",
                "configuracao.preferred_supplier": "Fornecedor Configuracao",
            },
            "raw": {},
        }
        result = materialize_erp_product_settings(
            conn,
            org=ORG_ID,
            batch_id="batch_settings_smoke",
            record=record,
            row_number=1,
            sheet_name="Config",
            manual_choices={},
        )
        check(result["status"] == "updated", "Fornecedor ERP em produto novo virou conflito manual indevido.")
        setting = conn.execute(
            """
            SELECT preferred_supplier_id
            FROM product_settings
            WHERE organization_id = ?
              AND product_id = ?
            """,
            (ORG_ID, f"{ORG_ID}:product:P900"),
        ).fetchone()
        check(setting and setting["preferred_supplier_id"], "Fornecedor preferencial importado nao foi gravado.")
    finally:
        conn.close()


def smoke_erp_context_materialization() -> None:
    conn = open_memory_db()
    try:
        conn.execute("INSERT INTO organizations (id, name) VALUES (?, ?)", (ORG_ID, "Loja Smoke"))
        conn.execute("INSERT INTO stores (id, organization_id, name) VALUES (?, ?, ?)", (STORE_ID, ORG_ID, "Principal"))
        conn.execute(
            """
            INSERT INTO import_batches (id, organization_id, store_id, source_system, status, import_mode)
            VALUES (?, ?, ?, 'erp_planilha', 'running', 'smoke')
            """,
            ("batch_context_smoke", ORG_ID, STORE_ID),
        )
        context = {}
        first = {
            "normalized": {
                "produto.codigo_produto": "P901",
                "produto.nome_produto": "Produto Contexto",
                "preco.preco_venda": "10,00",
                "estoque.estoque_atual": "5",
                "venda.data_venda": "2026-05-01",
                "venda.quantidade_vendida": "1",
                "venda.valor_venda": "10,00",
            },
            "raw": {},
        }
        second = {
            "normalized": {
                "produto.codigo_produto": "",
                "produto.nome_produto": "",
                "preco.preco_venda": "12,00",
                "estoque.estoque_atual": "4",
                "venda.data_venda": "2026-05-02",
                "venda.quantidade_vendida": "2",
                "venda.valor_venda": "24,00",
            },
            "raw": {},
        }
        context = apply_erp_product_context(first, context)
        context = apply_erp_product_context(second, context)
        check(second["normalized"]["produto.codigo_produto"] == "P901", "Contexto de produto nao preencheu linha subsequente.")
        check(second["normalized"]["_meta.product_code_inherited"] == "1", "Contexto de produto nao marcou codigo herdado.")
        check(
            materialize_erp_price_snapshot(conn, org=ORG_ID, batch_id="batch_context_smoke", store_id=STORE_ID, record=second, row_number=2) == "inserted",
            "Preco ERP com contexto nao foi materializado.",
        )
        check(
            materialize_erp_inventory_snapshot(conn, org=ORG_ID, batch_id="batch_context_smoke", store_id=STORE_ID, record=second, row_number=2) == "inserted",
            "Estoque ERP com contexto nao foi materializado.",
        )
        check(
            materialize_erp_product_sale(conn, org=ORG_ID, batch_id="batch_context_smoke", store_id=STORE_ID, record=second, row_number=2) == "inserted_inherited",
            "Venda ERP agrupada deveria aceitar produto herdado da linha anterior.",
        )
        conn.execute(
            """
            INSERT INTO products (id, organization_id, source_code, name, normalized_name)
            VALUES (?, ?, ?, ?, ?)
            """,
            (PRODUCT_FAST, ORG_ID, "P001", "Produto Giro Rapido", "produto_giro_rapido"),
        )
        conn.execute(
            """
            INSERT INTO product_sales (organization_id, store_id, product_id, sold_at, quantity, gross_amount)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (ORG_ID, STORE_ID, PRODUCT_FAST, "2026-05-10", 1, 10),
        )
        older_sale = {
            "normalized": {
                "produto.codigo_produto": "P902",
                "produto.nome_produto": "Produto Venda Antiga",
                "venda.data_venda": "2026-05-01",
                "venda.quantidade_vendida": "1",
                "venda.valor_venda": "10,00",
            },
            "raw": {"codigo_produto": "P902", "data_venda": "2026-05-01"},
        }
        check(
            materialize_erp_product_sale(conn, org=ORG_ID, batch_id="batch_context_smoke", store_id=STORE_ID, record=older_sale, row_number=3) == "inserted",
            "Venda ERP antiga e nova nao deve virar duplicada pela maior data global.",
        )
    finally:
        conn.close()


def smoke_erp_biff_formula_text() -> None:
    def sst_text(value: str) -> bytes:
        encoded = value.encode("cp1252")
        return struct.pack("<H", len(encoded)) + b"\x00" + encoded

    sst = struct.pack("<II", 2, 2) + sst_text("P904") + sst_text("Produto SST")
    shared = parse_biff_sst(sst[:14] + sst[14:])
    check(shared == ["P904", "Produto SST"], "Parser XLS nao leu textos de SST continuada.")

    formula_body = struct.pack("<HHH", 1, 0, 0) + (b"\x00" * 6 + b"\xff\xff") + b"\x00" * 6
    string_body = struct.pack("<H", 4) + b"\x00" + b"P902"
    rich_text_body = struct.pack("<HHH", 2, 0, 0) + struct.pack("<H", 4) + b"\x00" + b"P903"
    workbook = (
        struct.pack("<HH", 0x0006, len(formula_body))
        + formula_body
        + struct.pack("<HH", 0x0207, len(string_body))
        + string_body
        + struct.pack("<HH", 0x00D6, len(rich_text_body))
        + rich_text_body
        + struct.pack("<HH", 0x000A, 0)
    )
    rows = parse_biff_sheet(workbook, 0, [])
    check(rows[1][0] == "P902", "Parser XLS nao leu texto calculado de formula BIFF.")
    check(rows[2][0] == "P903", "Parser XLS nao leu texto rico BIFF.")


def smoke_latest_purchase_cost_by_snapshot_date() -> None:
    conn = open_memory_db()
    try:
        conn.execute("INSERT INTO organizations (id, name) VALUES (?, ?)", (ORG_ID, "Loja Smoke"))
        conn.execute(
            """
            INSERT INTO products (id, organization_id, source_code, name, normalized_name)
            VALUES (?, ?, ?, ?, ?)
            """,
            (PRODUCT_FAST, ORG_ID, "P001", "Produto Giro Rapido", "produto_giro_rapido"),
        )
        conn.execute(
            """
            INSERT INTO cost_snapshots
                (organization_id, product_id, snapshot_date, purchase_cost, total_cost)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ORG_ID, PRODUCT_FAST, "2026-01-10", 10, 10),
        )
        conn.execute(
            """
            INSERT INTO cost_snapshots
                (organization_id, product_id, snapshot_date, purchase_cost, total_cost)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ORG_ID, PRODUCT_FAST, "2025-01-10", 99, 99),
        )
        costs = latest_purchase_costs(conn)
        check(costs[PRODUCT_FAST] == 10, "Custo mais recente foi escolhido por insercao, nao por data do snapshot.")
    finally:
        conn.close()


def smoke_summary_period_contract(conn: sqlite3.Connection) -> None:
    summary = api_summary(conn, {"period_days": "all", "date_from": "", "date_to": "", "label": "Todo periodo"})
    assert_summary_contract(summary)
    kpis = summary["kpis"]
    check(kpis["products"] == 1, "Resumo deveria contar produtos movimentados, nao produtos cadastrados.")
    check(kpis["customers"] == 1, "Resumo deveria contar clientes movimentados, nao clientes cadastrados.")


def smoke_pricing(conn: sqlite3.Connection) -> None:
    before = api_pricing(conn, {"period_days": "all", "date_from": "", "date_to": "", "label": "Todo periodo"})
    assert_pricing_contract(before)
    by_product = {row["product_id"]: row for row in before["rows"]}
    check(by_product[PRODUCT_FAST]["signal"] == "margem_negativa", "Preco abaixo do custo nao virou margem negativa.")
    check(by_product[PRODUCT_NO_SALES]["signal"] == "sem_custo", "Produto com preco e sem custo deveria sinalizar sem custo.")

    update_product_pricing(
        conn,
        {
            "organization_id": ORG_ID,
            "product_id": PRODUCT_NO_SALES,
            "cost_price": 13,
            "product_role": "marca_propria",
            "notes": "Custo manual ficticio para smoke check.",
        },
    )
    after = api_pricing(conn, {"period_days": "all", "date_from": "", "date_to": "", "label": "Todo periodo"})
    updated = {row["product_id"]: row for row in after["rows"]}[PRODUCT_NO_SALES]
    check(updated["cost_origin"] == "manual", "Precificacao nao priorizou custo manual.")
    check(updated["signal"] == "margem_baixa", "Papel marca propria nao aplicou margem minima esperada.")


def smoke_quotes(conn: sqlite3.Connection) -> None:
    quotes = api_quotes(conn, "draft")
    assert_quotes_list_contract(quotes)
    check(any(quote["id"] == "quote_smoke" for quote in quotes), "Lista de cotacoes nao retornou rascunho.")
    detail = api_quote_detail(conn, "quote_smoke")
    assert_quote_detail_contract(detail)
    item_id = detail["items"][0]["id"]
    check(detail["items"][0]["purchase_unit"] == "CX", "Unidade de compra da cotacao nao foi preservada.")
    check(float(detail["items"][0]["purchase_package_size"]) == 6.0, "Embalagem de compra da cotacao nao foi preservada.")
    check(int(detail["items"][0]["coverage_target_days"]) == 45, "Cobertura da cotacao nao foi preservada.")
    upsert_quote_item(
        conn,
        {
            "organization_id": ORG_ID,
            "supplier_id": SUPPLIER_ID,
            "product_id": PRODUCT_FAST,
            "requested_quantity": 6,
            "purchase_unit": "FD",
            "purchase_package_size": 3,
            "coverage_target_days": 30,
            "notes": "validade longa",
        },
    )
    detail = api_quote_detail(conn, "quote_smoke")
    assert_quote_detail_contract(detail)
    check(detail["items"][0]["purchase_unit"] == "FD", "Upsert nao atualizou unidade de compra da cotacao.")
    check(float(detail["items"][0]["purchase_package_size"]) == 3.0, "Upsert nao atualizou embalagem de compra da cotacao.")
    check(int(detail["items"][0]["coverage_target_days"]) == 30, "Upsert nao atualizou cobertura da cotacao.")
    check(detail["items"][0]["notes"] == "validade longa", "Upsert nao preservou observacao do item.")
    conn.execute(
        """
        INSERT INTO quote_requests
            (id, organization_id, supplier_id, supplier_name, contact_phone, status, total_estimated_amount, item_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("quote_discard_smoke", ORG_ID, SUPPLIER_ID, "Fornecedor Smoke", "", "draft", 13, 1),
    )
    conn.execute(
        """
        INSERT INTO quote_request_items
            (quote_request_id, product_id, source_code, quote_code, product_name, unit,
             suggested_quantity, requested_quantity, estimated_unit_cost, estimated_total_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("quote_discard_smoke", PRODUCT_NO_SALES, "P002", "P002", "Produto Sem Venda", "UN", 1, 1, 13, 13),
    )
    discarded = update_quote_request(conn, {"id": "quote_discard_smoke", "status": "cancelled"})
    check(discarded.get("deleted") is True, "Cotacao descartada deveria ser removida, nao mantida como historico.")
    check(
        conn.execute("SELECT COUNT(*) FROM quote_requests WHERE id = ?", ("quote_discard_smoke",)).fetchone()[0] == 0,
        "Cotacao descartada continuou em quote_requests.",
    )
    check(
        conn.execute("SELECT COUNT(*) FROM quote_request_items WHERE quote_request_id = ?", ("quote_discard_smoke",)).fetchone()[0] == 0,
        "Itens da cotacao descartada continuaram no banco.",
    )
    item_id = detail["items"][0]["id"]
    response = update_quote_response(
        conn,
        {
            "id": "quote_smoke",
            "auto_confirm_order": False,
            "items": [
                {
                    "item_id": item_id,
                    "confirmed_quantity": 6,
                    "quoted_package_size": 6,
                    "quoted_lead_time_days": 4,
                    "availability": "available",
                }
            ],
        },
    )
    check(response["status"] == "responded", "Resposta de cotacao nao marcou status responded.")
    assert_quote_detail_contract(response)
    check(response["response_summary"]["responded_count"] == 1, "Resumo da cotacao nao contou item respondido.")
    check(float(response["items"][0]["confirmed_quantity"]) == 6.0, "Resposta nao preservou quantidade confirmada.")
    learned = conn.execute(
        """
        SELECT last_purchase_cost, package_size, lead_time_days
        FROM supplier_product_rules
        WHERE organization_id = ?
          AND supplier_id = ?
          AND product_id = ?
        """,
        (ORG_ID, SUPPLIER_ID, PRODUCT_FAST),
    ).fetchone()
    check(learned is not None, "Resposta de cotacao nao gerou aprendizado fornecedor-produto.")
    check(learned["last_purchase_cost"] is None, "Resposta de cotacao nao deve aprender preco de compra.")
    check(float(learned["package_size"]) == 6.0, "Embalagem aprendida da cotacao ficou incorreta.")
    check(int(learned["lead_time_days"]) == 4, "Prazo aprendido da cotacao ficou incorreto.")


def smoke_supplier_workbench_contract(conn: sqlite3.Connection) -> None:
    suppliers = api_supplier_workbench_list(conn)
    assert_supplier_workbench_suppliers_contract(suppliers)
    supplier_row = next((row for row in suppliers if row["supplier_id"] == SUPPLIER_ID), None)
    check(supplier_row is not None, "Lista da mesa de fornecedores nao retornou fornecedor do fixture.")
    open_or_pending = (supplier_row.get("open_quote_count") or 0) + (supplier_row.get("pending_order_count") or 0)
    check(open_or_pending >= 1, "Lista da mesa de fornecedores nao contou cotacao em aberto nem pedido pendente.")
    check("alert_count" in supplier_row, "Lista da mesa de fornecedores nao trouxe alert_count.")
    workbench = api_supplier_workbench(conn, SUPPLIER_ID, 90)
    assert_supplier_workbench_contract(workbench)
    check(workbench["totals"]["total_products"] >= 1, "Mesa de fornecedor deveria retornar produto do fixture.")


def smoke_customer_import_contracts(conn: sqlite3.Connection) -> None:
    assert_health_contract(api_health(conn))

    products = api_top_products(conn)
    assert_products_top_contract(products)
    check(any(row["id"] == PRODUCT_FAST for row in products), "Ranking de produtos nao retornou produto do fixture.")

    customers = api_customers(conn)
    assert_customers_top_contract(customers)
    check(any(row["name"] == "Cliente Smoke" for row in customers), "Ranking de clientes nao retornou cliente do fixture.")

    crm = api_customer_crm(conn, CUSTOMER_FAST)
    assert_customer_crm_contract(crm)
    check(crm["profile"]["commercial_status"] == "follow_up", "CRM do cliente deveria iniciar em acompanhamento.")
    crm = upsert_customer_crm(
        conn,
        {
            "customer_id": CUSTOMER_FAST,
            "owner_name": "Vendedor Smoke",
            "commercial_status": "negotiating",
            "priority": "high",
            "next_action": "call",
            "next_action_at": "2026-01-20",
            "tags": ["recorrente", "condicao especial"],
            "internal_notes": "Observacao ficticia do smoke.",
        },
    )
    assert_customer_crm_contract(crm)
    check(crm["profile"]["owner_name"] == "Vendedor Smoke", "CRM do cliente nao salvou responsavel.")
    customers = api_customers(conn)
    customer_row = next((row for row in customers if row["id"] == CUSTOMER_FAST), None)
    check(customer_row is not None, "Ranking de clientes perdeu cliente apos upsert CRM.")
    check(customer_row.get("crm_status") == "negotiating", "Ranking de clientes nao agregou status CRM.")
    check(customer_row.get("crm_next_action_at") == "2026-01-20", "Ranking de clientes nao agregou proxima acao CRM.")

    catalog = api_customer_catalog(conn, CUSTOMER_FAST)
    assert_customer_catalog_contract(catalog)
    check(catalog["summary"]["candidate_items"] >= 1, "Catalogo do cliente nao sugeriu produto recorrente do historico.")
    catalog = upsert_customer_catalog_item(
        conn,
        {
            "customer_id": CUSTOMER_FAST,
            "product_id": PRODUCT_NO_SALES,
            "status": "active",
            "origin": "manual",
            "negotiated_price": 15.5,
            "minimum_quantity": 2,
        },
    )
    assert_customer_catalog_contract(catalog)
    check(any(row["product_id"] == PRODUCT_NO_SALES for row in catalog["items"]), "Catalogo nao aceitou produto sem compra historica.")
    filename, pdf_body = export_sales_order_pdf(
        conn,
        {
            "customer_id": CUSTOMER_FAST,
            "seller_name": "Vendedor Smoke",
            "notes": "Pedido ficticio para validar PDF.",
            "items": [{"product_id": PRODUCT_NO_SALES, "quantity": 2}, {"product_id": PRODUCT_FAST, "quantity": 1}],
        },
    )
    check(filename.endswith(".pdf"), "Pedido de venda nao retornou nome PDF.")
    check(pdf_body.startswith(b"%PDF-"), "Pedido de venda nao gerou corpo PDF valido.")
    search = api_products_search(conn, "Sem Venda", 5)
    assert_products_search_contract(search)
    check(any(row["product_id"] == PRODUCT_NO_SALES for row in search["rows"]), "Busca de produtos nao encontrou produto sem venda.")

    services = api_services(conn)
    assert_services_top_contract(services)

    commercial = api_commercial_intelligence(conn)
    assert_commercial_intelligence_contract(commercial)

    actions = api_actions_today(conn)
    assert_actions_today_contract(actions)

    imports = api_imports(conn)
    assert_imports_contract(imports)
    check(imports["quality"]["status"] in {"ready", "attention", "blocked", "no_imports"}, "Status de importacao invalido.")


class _SmokeServer:
    server_address = ("127.0.0.1", 8010)


class _SmokeHandler:
    headers = {"Host": "127.0.0.1:8010"}
    client_address = ("127.0.0.1", 50000)
    server = _SmokeServer()


def smoke_dev_auth_bypass(conn: sqlite3.Connection) -> None:
    previous_bypass = os.environ.get("PULSO_DEV_AUTH_BYPASS")
    previous_allow = os.environ.get("PULSO_ALLOW_NETWORK")
    previous_legacy_allow = os.environ.get("NEXOVAREJO_ALLOW_NETWORK")
    try:
        os.environ["PULSO_DEV_AUTH_BYPASS"] = "1"
        os.environ.pop("PULSO_ALLOW_NETWORK", None)
        os.environ.pop("NEXOVAREJO_ALLOW_NETWORK", None)
        payload = api_auth_me(conn, _SmokeHandler())
        check(payload["authenticated"] is True, "Bypass local deveria autenticar usuario temporario.")
        check(payload["dev_auth_bypass"] is True, "Bypass local deveria sinalizar dev_auth_bypass.")
        check(payload["user"]["role"] == "admin", "Bypass local deveria liberar papel admin temporario.")

        os.environ["PULSO_ALLOW_NETWORK"] = "1"
        blocked = api_auth_me(conn, _SmokeHandler())
        check(blocked["dev_auth_bypass"] is False, "Bypass nao pode funcionar com PULSO_ALLOW_NETWORK ativo.")
    finally:
        if previous_bypass is None:
            os.environ.pop("PULSO_DEV_AUTH_BYPASS", None)
        else:
            os.environ["PULSO_DEV_AUTH_BYPASS"] = previous_bypass
        if previous_allow is None:
            os.environ.pop("PULSO_ALLOW_NETWORK", None)
        else:
            os.environ["PULSO_ALLOW_NETWORK"] = previous_allow
        if previous_legacy_allow is None:
            os.environ.pop("NEXOVAREJO_ALLOW_NETWORK", None)
        else:
            os.environ["NEXOVAREJO_ALLOW_NETWORK"] = previous_legacy_allow


def smoke_seller_user_role(conn: sqlite3.Connection) -> None:
    admin = {
        "id": "admin_smoke",
        "organization_id": ORG_ID,
        "role": "admin",
        "permissions": ["admin"],
    }
    payload = {
        "name": "Vendedor Smoke",
        "login_name": "vendedor.smoke",
        "password": "123456",
        "role": "seller",
        "active": True,
        "permissions": ["admin", "imports", "seller", "customers"],
    }
    result = upsert_user(conn, payload, admin)
    seller = next((user for user in result["users"] if user["login_name"] == "vendedor.smoke"), None)
    check(seller is not None, "Cadastro de vendedor externo nao retornou usuario criado.")
    check(seller["role"] == "seller", "Usuario vendedor deveria manter papel seller.")
    permissions = set(seller["permissions"])
    check({"seller", "customers", "products", "opportunities"}.issubset(permissions), "Vendedor externo sem permissoes operacionais minimas.")
    check(not {"admin", "imports", "engine"}.intersection(permissions), "Vendedor externo recebeu permissoes administrativas.")


def smoke_quote_pdf(conn: sqlite3.Connection) -> None:
    filename, body = export_quote_pdf(conn, "quote_smoke")
    check(filename.endswith(".pdf"), "PDF de cotacao nao retornou nome de arquivo PDF.")
    check(body.startswith(b"%PDF-1.4"), "PDF de cotacao nao retornou cabecalho PDF.")
    check(b"Produto Giro Rapido" in body, "PDF de cotacao nao inclui nome do produto.")
    check(b"MANUAL-P1" in body, "PDF de cotacao nao inclui referencia normalizada do fornecedor.")
    check(b"Preco" not in body and b"Prazo" not in body, "PDF de cotacao incluiu campos de resposta do fornecedor.")


def smoke_purchase_order_cycle(conn: sqlite3.Connection) -> None:
    sent_quote = update_quote_request(conn, {"id": "quote_smoke", "status": "sent"})
    check(sent_quote.get("purchase_order") is None, "Envio da cotacao nao deve gerar pedido provisorio.")
    responded_quote = update_quote_response(
        conn,
        {
            "id": "quote_smoke",
            "items": [
                {
                    "item_id": sent_quote["items"][0]["id"],
                    "supplier_reference": "000RESP-000001",
                    "confirmed_quantity": 6,
                    "quoted_package_size": 6,
                    "quoted_lead_time_days": 4,
                    "availability": "available",
                }
            ],
        },
    )
    check(responded_quote.get("purchase_order") is not None, "Resposta da cotacao deve gerar pedido aprovado automaticamente.")
    check(responded_quote["items"][0]["supplier_reference"] == "RESP-1", "Resposta nao normalizou referencia do fornecedor no item.")
    order = responded_quote["purchase_order"]
    check(order["status"] == "approved", "Pedido gerado pela resposta nao ficou aprovado.")
    assert_purchase_order_detail_contract(order)
    check(order["approved_item_count"] == 1, "Pedido aprovado automaticamente nao contou item aprovado.")
    check(float(order["total_amount"]) == 72.0, "Total do pedido aprovado automaticamente ficou incorreto.")
    assert_purchase_orders_contract(api_purchase_orders(conn, "open"))
    assert_purchase_order_detail_contract(api_purchase_order_detail(conn, order["id"]))

    replenishment_with_open_order = api_replenishment(conn, period={"period_days": "all", "date_from": "", "date_to": "", "label": "Todo periodo"})
    assert_replenishment_contract(replenishment_with_open_order)
    fast_row = {row["product_id"]: row for row in replenishment_with_open_order["rows"]}[PRODUCT_FAST]
    check(fast_row["open_order_quantity"] == 6.0, "Reposicao nao considerou quantidade em pedido aberto.")
    check(fast_row["projected_stock_units"] == 6.0, "Reposicao nao somou pedido aberto ao estoque projetado.")
    check(fast_row["suggested_quantity"] == 36.0, "Reposicao nao abateu pedido aberto da nova sugestao complementar.")

    received = receive_purchase_order(
        conn,
        {
            "id": order["id"],
            "items": [{"item_id": order["items"][0]["id"], "received_quantity": 6}],
            "notes": "Recebimento ficticio para smoke check.",
        },
    )
    check(received["status"] == "received", "Recebimento total nao encerrou o pedido.")
    assert_purchase_order_detail_contract(received)
    check(float(received["items"][0]["received_quantity"]) == 6.0, "Quantidade recebida nao foi persistida.")


def smoke_http_server() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        db_path = Path(tmp_dir) / "nexovarejo_http_smoke.db"
        conn = open_file_db(db_path)
        try:
            seed_fixture(conn)
        finally:
            conn.close()

        serve_app.AppHandler.db_path = db_path
        serve_app.AppHandler.log_message = lambda self, format, *args: None
        server = serve_app.ThreadingHTTPServer(("127.0.0.1", 0), serve_app.AppHandler)
        host, port = server.server_address
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base_url = f"http://{host}:{port}"

        def get_json(route: str) -> dict | list:
            try:
                body = urllib.request.urlopen(f"{base_url}{route}", timeout=10).read()
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                raise AssertionError(f"GET {route} falhou com HTTP {exc.code}: {detail}") from exc
            return json.loads(body.decode("utf-8"))

        def get_binary(route: str) -> tuple[str, bytes]:
            try:
                response = urllib.request.urlopen(f"{base_url}{route}", timeout=10)
                return response.headers.get("Content-Type", ""), response.read()
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                raise AssertionError(f"GET {route} falhou com HTTP {exc.code}: {detail}") from exc

        def get_error(route: str) -> tuple[int, dict]:
            try:
                urllib.request.urlopen(f"{base_url}{route}", timeout=10)
            except urllib.error.HTTPError as exc:
                body = exc.read().decode("utf-8", errors="replace")
                return exc.code, json.loads(body)
            raise AssertionError(f"GET {route} deveria falhar.")

        def post_json(route: str, payload: dict) -> dict | list:
            body = json.dumps(payload).encode("utf-8")
            request = urllib.request.Request(
                f"{base_url}{route}",
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                response = urllib.request.urlopen(request, timeout=10).read()
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="replace")
                raise AssertionError(f"POST {route} falhou com HTTP {exc.code}: {detail}") from exc
            return json.loads(response.decode("utf-8"))

        try:
            index = urllib.request.urlopen(f"{base_url}/", timeout=10).read()
            check(b"<html" in index.lower() and len(index) > 1000, "Pagina inicial nao retornou HTML esperado.")
            check(get_json("/healthz").get("ok") is True, "Healthcheck publico /healthz nao retornou ok.")
            for spa_route, marker in {"/implantacao": b"implementationSteps", "/distribuicao": b"distributionSummary"}.items():
                page = urllib.request.urlopen(f"{base_url}{spa_route}", timeout=10).read()
                check(marker in page, f"Rota SPA nao retornou a tela esperada: {spa_route}")

            routes = {
                "/api/app-config": "app_name",
                "/api/installation": "installation",
                "/api/onboarding": "steps",
                "/api/health": "checks",
                "/api/summary": "kpis",
                "/api/intelligence/maturity": "score",
                "/api/products/top?period_days=all": None,
                "/api/products/stock": None,
                f"/api/product?id={PRODUCT_FAST}": "settings",
                "/api/replenishment?period_days=all": "summary",
                "/api/replenishment-v2?period_days=all": "summary",
                "/api/replenishment-v2/compare?period_days=all": "summary",
                "/api/commercial/intelligence?period_days=all": "summary",
                "/api/customers/top?period_days=all": None,
                "/api/services/top?period_days=all": None,
                "/api/imports": "readiness",
                "/api/suppliers/brands": None,
                "/api/pricing?period_days=all": "summary",
                "/api/nexo/skills": "skills",
                "/api/actions/today": "actions",
                "/api/quotes/draft": "suppliers",
                "/api/quotes?status=draft": None,
                "/api/quote?id=quote_smoke": "items",
                "/api/supplier-workbench/suppliers": None,
                f"/api/supplier-workbench?supplier_id={SUPPLIER_ID}": "rows",
                "/api/purchase-orders?status=open": None,
            }
            for route, required_key in routes.items():
                payload = get_json(route)
                if required_key:
                    check(required_key in payload, f"Rota HTTP sem chave esperada {required_key}: {route}")
            assert_app_config_contract(get_json("/api/app-config"))
            assert_installation_contract(get_json("/api/installation"))
            assert_onboarding_contract(get_json("/api/onboarding"))
            assert_summary_contract(get_json("/api/summary?period_days=all"))
            assert_health_contract(get_json("/api/health"))
            assert_replenishment_contract(get_json("/api/replenishment?period_days=all"))
            assert_replenishment_v2_contract(get_json("/api/replenishment-v2?period_days=all"))
            assert_supplier_workbench_suppliers_contract(get_json("/api/supplier-workbench/suppliers"))
            assert_supplier_workbench_contract(get_json(f"/api/supplier-workbench?supplier_id={SUPPLIER_ID}&window_days=90"))
            assert_pricing_contract(get_json("/api/pricing?period_days=all"))
            assert_products_top_contract(get_json("/api/products/top?period_days=all"))
            assert_customers_top_contract(get_json("/api/customers/top?period_days=all"))
            assert_services_top_contract(get_json("/api/services/top?period_days=all"))
            assert_commercial_intelligence_contract(get_json("/api/commercial/intelligence?period_days=all"))
            assert_actions_today_contract(get_json("/api/actions/today"))
            assert_imports_contract(get_json("/api/imports"))
            assert_quotes_list_contract(get_json("/api/quotes?status=draft"))
            assert_quote_detail_contract(get_json("/api/quote?id=quote_smoke"))
            status, error_payload = get_error("/api/rota-inexistente")
            check(status == 404, "Erro de rota API desconhecida deveria ser 404.")
            check(error_payload.get("ok") is False and error_payload.get("code") == "not_found", "404 de API sem envelope padrao.")
            status, error_payload = get_error("/api/quote?id=nao_existe")
            check(status == 400, "Erro de parametro invalido deveria ser 400.")
            check(error_payload.get("ok") is False and error_payload.get("code") == "bad_request", "400 de API sem envelope padrao.")
            content_type, pdf_body = get_binary("/api/quote/pdf?id=quote_smoke")
            check(content_type.startswith("application/pdf"), "GET /api/quote/pdf nao retornou application/pdf.")
            check(pdf_body.startswith(b"%PDF-1.4"), "GET /api/quote/pdf nao retornou PDF valido.")

            erp_content = "codigo_produto,nome_produto,codigo_fornecedor\nP001,Produto Giro Rapido,ERP-P001\n"
            erp_mappings = [
                {
                    "sheet_index": 0,
                    "sheet_name": "Planilha 1",
                    "columns": [
                        {
                            "index": 0,
                            "header": "codigo_produto",
                            "entity": "produto",
                            "field": "codigo_produto",
                            "label": "Produto - codigo",
                        },
                        {
                            "index": 1,
                            "header": "nome_produto",
                            "entity": "produto",
                            "field": "nome_produto",
                            "label": "Produto - nome/descricao",
                        },
                        {
                            "index": 2,
                            "header": "codigo_fornecedor",
                            "entity": "identificador",
                            "field": "supplier_reference",
                            "label": "Fornecedor - codigo do item",
                        },
                    ],
                }
            ]
            preview = post_json(
                "/api/erp/import-preview",
                {
                    "file_name": "smoke.csv",
                    "content": erp_content,
                },
            )
            check(preview.get("ok") is True and preview.get("sheets"), "POST /api/erp/import-preview nao analisou CSV ficticio.")
            import_check = post_json(
                "/api/erp/import-commit",
                {
                    "file_name": "smoke.csv",
                    "content": erp_content,
                    "conflict_check_only": "true",
                    "mappings": erp_mappings,
                },
            )
            check(import_check.get("ok") is True, "POST /api/erp/import-commit em modo conflito nao retornou ok.")
            check(import_check.get("requires_manual_resolution") is True, "Importacao ERP ficticia nao detectou conflito manual.")
            conflict_key = f"{PRODUCT_FAST}|supplier_reference"
            check(
                any(conflict.get("key") == conflict_key for conflict in import_check.get("manual_conflicts", [])),
                "Importacao ERP nao retornou conflito da referencia manual esperada.",
            )
            import_commit = post_json(
                "/api/erp/import-commit",
                {
                    "file_name": "smoke.csv",
                    "content": erp_content,
                    "mappings": erp_mappings,
                    "manual_conflict_choices": {conflict_key: "erp"},
                },
            )
            summary = import_commit.get("summary") or {}
            check(import_commit.get("ok") is True, "POST /api/erp/import-commit resolvido nao retornou ok.")
            check(summary.get("manual_conflicts_resolved") == 1, "Importacao ERP nao registrou conflito manual resolvido.")
            check(summary.get("manual_conflicts_pending") == 0, "Importacao ERP manteve conflito pendente apos escolha.")
            imports_after_commit = get_json("/api/imports")
            quality = imports_after_commit.get("quality") or {}
            quality_summary = quality.get("summary") or {}
            check(quality.get("status") == "ready", "Qualidade da importacao nao ficou pronta apos conflito resolvido.")
            check(quality_summary.get("mapped_rows") == 1, "Reconciliacao da importacao nao contou linha mapeada.")
            check(quality_summary.get("manual_conflicts_resolved") == 1, "Reconciliacao nao refletiu conflito manual resolvido.")

            actions_payload = get_json("/api/actions/today")
            if actions_payload.get("actions"):
                action_status = post_json(
                    "/api/actions/status",
                    {"id": actions_payload["actions"][0]["id"], "status": "in_progress"},
                )
                check(action_status.get("ok") is True, "POST /api/actions/status nao retornou ok.")

            supplier_profile = post_json(
                "/api/suppliers/profile",
                {
                    "organization_id": ORG_ID,
                    "supplier_id": SUPPLIER_ID,
                    "contact_name": "Contato Smoke",
                    "average_lead_time_days": 5,
                    "order_review_cycle_days": 7,
                },
            )
            check(supplier_profile.get("ok") is True, "POST /api/suppliers/profile nao retornou ok.")

            pricing_update = post_json(
                "/api/pricing/product",
                {
                    "organization_id": ORG_ID,
                    "product_id": PRODUCT_NO_SALES,
                    "cost_price": 13,
                    "product_role": "marca_propria",
                    "notes": "Custo manual ficticio via HTTP smoke.",
                },
            )
            check(pricing_update.get("ok") is True, "POST /api/pricing/product nao retornou ok.")

            reference_update = post_json(
                "/api/products/supplier-reference",
                {
                    "organization_id": ORG_ID,
                    "product_id": PRODUCT_NO_SALES,
                    "value": "REF-SMOKE",
                },
            )
            check(
                reference_update.get("supplier_reference") == "REF-SMOKE",
                "POST /api/products/supplier-reference nao salvou referencia.",
            )

            quote_item = post_json(
                "/api/quote-item/upsert",
                {
                    "organization_id": ORG_ID,
                    "supplier_id": SUPPLIER_ID,
                    "product_id": PRODUCT_FAST,
                    "requested_quantity": 6,
                },
            )
            check(quote_item.get("ok") is True, "POST /api/quote-item/upsert nao retornou ok.")

            sent_quote = post_json("/api/quotes/status", {"id": "quote_smoke", "status": "sent"})
            check(sent_quote.get("status") == "sent", "POST /api/quotes/status nao marcou cotacao como enviada.")
            check(sent_quote.get("purchase_order") is None, "POST /api/quotes/status nao deve gerar pedido provisorio.")
            item_id = sent_quote["items"][0]["id"]
            quote_response = post_json(
                "/api/quotes/response",
                {
                    "id": "quote_smoke",
                    "items": [
                        {
                            "item_id": item_id,
                            "confirmed_quantity": 6,
                            "quoted_package_size": 6,
                            "quoted_lead_time_days": 4,
                            "availability": "available",
                        }
                    ],
                },
            )
            check(quote_response.get("status") == "approved", "POST /api/quotes/response nao aprovou a cotacao respondida.")
            order = quote_response.get("purchase_order")
            check(order and order.get("status") == "approved", "POST /api/quotes/response deve gerar pedido aprovado automaticamente.")
            assert_purchase_order_detail_contract(order)
            assert_purchase_orders_contract(get_json("/api/purchase-orders?status=open"))
            order_detail = get_json(f"/api/purchase-order?id={order['id']}")
            assert_purchase_order_detail_contract(order_detail)
            check(order_detail.get("items"), "GET /api/purchase-order nao retornou itens do pedido.")
            received_order = post_json(
                "/api/purchase-orders/receive",
                {
                    "id": order["id"],
                    "items": [{"item_id": order["items"][0]["id"], "received_quantity": 6}],
                },
            )
            check(received_order.get("status") == "received", "POST /api/purchase-orders/receive nao encerrou pedido recebido.")
            created_quote = post_json("/api/quotes/create", {"supplier_id": SUPPLIER_ID, "notes": "Cotacao ficticia via HTTP smoke."})
            check(created_quote.get("id"), "POST /api/quotes/create nao retornou cotacao criada.")

            mix_decision = post_json(
                "/api/products/mix-decision",
                {
                    "organization_id": ORG_ID,
                    "product_id": PRODUCT_NO_SALES,
                    "decision": "force_buy",
                },
            )
            check(mix_decision.get("ok") is True, "POST /api/products/mix-decision nao retornou ok.")
            mix_bulk = post_json(
                "/api/products/mix-decision-bulk",
                {
                    "organization_id": ORG_ID,
                    "product_ids": [PRODUCT_NO_SALES],
                    "decision": "clear",
                },
            )
            check(mix_bulk.get("ok") is True and mix_bulk.get("updated") == 1, "POST /api/products/mix-decision-bulk nao atualizou item.")
            brand_supplier = post_json(
                "/api/suppliers/brand",
                {
                    "organization_id": ORG_ID,
                    "brand_id": BRAND_ID,
                    "supplier_name": "Fornecedor Smoke",
                    "contact_phone": "11 99999-0000",
                    "minimum_order_value": 100,
                },
            )
            check(brand_supplier.get("ok") is True, "POST /api/suppliers/brand nao retornou ok.")
            quick_action = post_json(
                "/api/quick-actions",
                {
                    "organization_id": ORG_ID,
                    "entity_type": "product",
                    "entity_id": PRODUCT_FAST,
                    "decision_type": "smoke_quick_action",
                    "decision_value": "ok",
                },
            )
            check(quick_action.get("ok") is True, "POST /api/quick-actions nao retornou ok.")
            operational_decision = post_json(
                "/api/operational-decisions",
                {
                    "organization_id": ORG_ID,
                    "entity_type": "workspace",
                    "entity_id": "smoke",
                    "decision_type": "smoke_decision",
                    "decision_value": "registrada",
                },
            )
            check(operational_decision.get("ok") is True, "POST /api/operational-decisions nao retornou ok.")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


def run() -> None:
    smoke_code_normalization()
    smoke_schema_and_import_bootstrap()
    smoke_corrupt_product_code_quarantine()
    smoke_import_preserves_app_controlled_fields()
    smoke_product_profile_upsert()
    smoke_static_assets()
    smoke_new_tenant_isolation()
    smoke_finished_import_status_compat()
    smoke_skills()
    smoke_imported_settings_guardrails()
    smoke_erp_context_materialization()
    smoke_erp_biff_formula_text()
    smoke_latest_purchase_cost_by_snapshot_date()
    conn = open_memory_db()
    try:
        seed_fixture(conn)
        smoke_summary_period_contract(conn)
        smoke_replenishment(conn)
        smoke_replenishment_sparse_guardrail()
        smoke_supplier_cycle_drives_replenishment_v2()
        run_replenishment_v2_scenarios()
        smoke_pricing(conn)
        smoke_customer_import_contracts(conn)
        smoke_dev_auth_bypass(conn)
        smoke_seller_user_role(conn)
        smoke_quotes(conn)
        smoke_supplier_workbench_contract(conn)
        smoke_quote_pdf(conn)
        smoke_purchase_order_cycle(conn)
    finally:
        conn.close()
    smoke_http_server()


def main() -> int:
    checks = [
        "normalizacao codigos",
        "schema/importacao",
        "quarentena produto corrompido",
        "importacao preserva edicoes locais",
        "cadastro produto standalone",
        "assets/contratos frontend",
        "isolamento tenant novo",
        "status finished legado",
        "skills",
        "configuracao importada",
        "materializacao ERP contextual",
        "parser XLS formula texto",
        "custo por data",
        "resumo por periodo",
        "reposicao",
        "guardrail reposicao",
        "ciclo fornecedor na compra",
        "cenarios motor v2",
        "precificacao",
        "clientes/importacao contratos",
        "auth bypass desenvolvimento",
        "perfil vendedor externo",
        "cotacao",
        "contrato mesa fornecedor",
        "pdf de cotacao",
        "pedido de compra",
        "http/fluxo beta",
    ]
    try:
        run()
    except Exception as exc:
        print(f"SMOKE FAIL: {exc}", file=sys.stderr)
        return 1
    print(json.dumps({"ok": True, "checks": checks}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
