from __future__ import annotations

import json
import re
import sqlite3
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / "scripts"
SCHEMA_PATH = ROOT / "schema" / "canonical.sql"
WEB_DIR = ROOT / "web"

sys.path.insert(0, str(SCRIPTS_DIR))

import import_practica  # noqa: E402
import serve_app  # noqa: E402
from api_contracts import (  # noqa: E402
    api_health,
    assert_actions_today_contract,
    assert_commercial_intelligence_contract,
    assert_customers_top_contract,
    assert_health_contract,
    assert_imports_contract,
    assert_pricing_contract,
    assert_products_top_contract,
    assert_purchase_order_detail_contract,
    assert_purchase_orders_contract,
    assert_quote_detail_contract,
    assert_quotes_list_contract,
    assert_replenishment_contract,
    assert_services_top_contract,
    assert_summary_contract,
    assert_supplier_workbench_suppliers_contract,
    assert_supplier_workbench_contract,
)
from action_center import api_actions_today  # noqa: E402
from commercial import api_commercial_intelligence, api_customers, api_services  # noqa: E402
from erp_import_flow import (  # noqa: E402
    api_imports,
    apply_erp_product_context,
    materialize_erp_inventory_snapshot,
    materialize_erp_price_snapshot,
    materialize_erp_product_sale,
    materialize_erp_product_settings,
)
from nexo_skills_runtime import api_nexo_skills  # noqa: E402
from pricing import api_pricing, update_product_pricing  # noqa: E402
from product_views import api_summary, api_top_products  # noqa: E402
from quotes import (  # noqa: E402
    api_quote_detail,
    api_quotes,
    api_purchase_order_detail,
    api_purchase_orders,
    api_supplier_workbench_list,
    api_supplier_workbench,
    close_purchase_order,
    export_quote_pdf,
    latest_purchase_costs,
    receive_purchase_order,
    update_quote_request,
    update_quote_response,
    upsert_quote_item,
)
from replenishment import api_replenishment  # noqa: E402
from schema_upgrades import ensure_schema_upgrades  # noqa: E402
from schema_upgrades import LEGACY_SCHEMA_MIGRATION_ID  # noqa: E402


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
            (quote_request_id, product_id, source_code, quote_code, product_name, unit,
             purchase_unit, purchase_package_size, coverage_target_days,
             suggested_quantity, requested_quantity, estimated_unit_cost, estimated_total_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("quote_smoke", PRODUCT_FAST, "P001", "P001", "Produto Giro Rapido", "UN", "CX", 6, 45, 6, 6, 12, 72),
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
            for table in {"products", "product_sales", "quote_requests", "purchase_orders", "audit_log", "schema_migrations"}:
                check(table in tables, f"Tabela esperada ausente no schema: {table}")
            migration = conn.execute(
                "SELECT id FROM schema_migrations WHERE id = ?",
                (LEGACY_SCHEMA_MIGRATION_ID,),
            ).fetchone()
            check(migration is not None, "Schema sem registro de migracao legada aplicada.")
            check(import_practica.money("1.234,56") == 1234.56, "Parser de dinheiro perdeu formato brasileiro.")
            check(import_practica.normalize("\u00c1lcool 70%") == "alcool_70", "Normalizacao da importacao mudou.")
        finally:
            conn.close()


def smoke_static_assets() -> None:
    html = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    js = "\n".join(
        (WEB_DIR / script_name).read_text(encoding="utf-8")
        for script_name in ("app_core.js", "app_charts.js", "app_tables.js", "app_ui.js", "app.js")
    )
    backend = (SCRIPTS_DIR / "serve_app.py").read_text(encoding="utf-8")
    api_routes = (SCRIPTS_DIR / "api_routes.py").read_text(encoding="utf-8")
    schema_upgrades = (SCRIPTS_DIR / "schema_upgrades.py").read_text(encoding="utf-8")
    canonical_schema = SCHEMA_PATH.read_text(encoding="utf-8")
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
        "erpImportUpdateMode",
        "linkImportAnalyze",
        "linkImportFile",
        "linkImportPreview",
        "linkImportStatus",
    }
    missing_ids = sorted(static_selectors - html_ids - template_ids - optional_feature_ids)
    check(not missing_ids, f"JS usa IDs estaticos ausentes no HTML/templates: {missing_ids}")


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
        check(
            materialize_erp_price_snapshot(conn, org=ORG_ID, batch_id="batch_context_smoke", store_id=STORE_ID, record=second, row_number=2) == "inserted",
            "Preco ERP com contexto nao foi materializado.",
        )
        check(
            materialize_erp_inventory_snapshot(conn, org=ORG_ID, batch_id="batch_context_smoke", store_id=STORE_ID, record=second, row_number=2) == "inserted",
            "Estoque ERP com contexto nao foi materializado.",
        )
        check(
            materialize_erp_product_sale(conn, org=ORG_ID, batch_id="batch_context_smoke", store_id=STORE_ID, record=second, row_number=2) == "inserted",
            "Venda ERP com contexto nao foi materializada.",
        )
    finally:
        conn.close()


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
    check(int(detail["items"][0]["coverage_target_days"]) == 45, "Cobertura alvo da cotacao nao foi preservada.")
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
    check(int(detail["items"][0]["coverage_target_days"]) == 30, "Upsert nao atualizou cobertura alvo da cotacao.")
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
            "items": [
                {
                    "item_id": item_id,
                    "quoted_unit_price": 11.5,
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
    check(float(learned["last_purchase_cost"]) == 11.5, "Custo aprendido da cotacao ficou incorreto.")


def smoke_supplier_workbench_contract(conn: sqlite3.Connection) -> None:
    suppliers = api_supplier_workbench_list(conn)
    assert_supplier_workbench_suppliers_contract(suppliers)
    supplier_row = next((row for row in suppliers if row["supplier_id"] == SUPPLIER_ID), None)
    check(supplier_row is not None, "Lista da mesa de fornecedores nao retornou fornecedor do fixture.")
    check(supplier_row["open_quote_count"] >= 1, "Lista da mesa de fornecedores nao contou cotacao em aberto.")
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

    services = api_services(conn)
    assert_services_top_contract(services)

    commercial = api_commercial_intelligence(conn)
    assert_commercial_intelligence_contract(commercial)

    actions = api_actions_today(conn)
    assert_actions_today_contract(actions)

    imports = api_imports(conn)
    assert_imports_contract(imports)
    check(imports["quality"]["status"] in {"ready", "attention", "blocked", "no_imports"}, "Status de importacao invalido.")


def smoke_quote_pdf(conn: sqlite3.Connection) -> None:
    filename, body = export_quote_pdf(conn, "quote_smoke")
    check(filename.endswith(".pdf"), "PDF de cotacao nao retornou nome de arquivo PDF.")
    check(body.startswith(b"%PDF-1.4"), "PDF de cotacao nao retornou cabecalho PDF.")
    check(b"Produto Giro Rapido" in body, "PDF de cotacao nao inclui nome do produto.")
    check(b"P001" in body, "PDF de cotacao nao inclui referencia/codigo do produto.")
    check(b"Preco" not in body and b"Prazo" not in body, "PDF de cotacao incluiu campos de resposta do fornecedor.")


def smoke_purchase_order_cycle(conn: sqlite3.Connection) -> None:
    quote = api_quote_detail(conn, "quote_smoke")
    item = quote["items"][0]
    order_payload = {
        "id": "quote_smoke",
        "items": [
            {
                "item_id": item["id"],
                "decision": "buy",
                "final_quantity": 6,
                "unit_price": item.get("quoted_unit_price") or 11.5,
                "package_size": item.get("quoted_package_size") or 6,
            }
        ],
        "notes": "Pedido ficticio para smoke check.",
    }
    quote_with_order = close_purchase_order(conn, order_payload)
    order = quote_with_order.get("purchase_order")
    check(order is not None, "Fechamento de cotacao nao gerou pedido de compra.")
    assert_purchase_order_detail_contract(order)
    check(order["status"] == "approved", "Pedido gerado nao ficou aprovado.")
    check(order["approved_item_count"] == 1, "Pedido gerado nao contou item aprovado.")
    check(float(order["total_amount"]) == 69.0, "Total do pedido gerado ficou incorreto.")
    assert_purchase_orders_contract(api_purchase_orders(conn, "open"))
    assert_purchase_order_detail_contract(api_purchase_order_detail(conn, order["id"]))
    replenishment_with_open_order = api_replenishment(conn, period={"period_days": "all", "date_from": "", "date_to": "", "label": "Todo periodo"})
    assert_replenishment_contract(replenishment_with_open_order)
    fast_row = {row["product_id"]: row for row in replenishment_with_open_order["rows"]}[PRODUCT_FAST]
    check(fast_row["open_order_quantity"] == 6.0, "Reposicao nao considerou quantidade em pedido aberto.")
    check(fast_row["projected_stock_units"] == 6.0, "Reposicao nao somou pedido aberto ao estoque projetado.")
    check(fast_row["suggested_quantity"] == 126.0, "Reposicao nao abateu pedido aberto da nova sugestao complementar.")

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

            routes = {
                "/api/health": "checks",
                "/api/summary": "kpis",
                "/api/intelligence/maturity": "score",
                "/api/products/top?period_days=all": None,
                "/api/products/stock": None,
                f"/api/product?id={PRODUCT_FAST}": "settings",
                "/api/replenishment?period_days=all": "summary",
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
            assert_summary_contract(get_json("/api/summary?period_days=all"))
            assert_health_contract(get_json("/api/health"))
            assert_replenishment_contract(get_json("/api/replenishment?period_days=all"))
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
            item_id = sent_quote["items"][0]["id"]
            quote_response = post_json(
                "/api/quotes/response",
                {
                    "id": "quote_smoke",
                    "items": [
                        {
                            "item_id": item_id,
                            "quoted_unit_price": 11.5,
                            "quoted_package_size": 6,
                            "quoted_lead_time_days": 4,
                            "availability": "available",
                        }
                    ],
                },
            )
            check(quote_response.get("status") == "responded", "POST /api/quotes/response nao marcou cotacao respondida.")
            item_id = quote_response["items"][0]["id"]
            closed_quote = post_json(
                "/api/purchase-orders/close",
                {
                    "id": "quote_smoke",
                    "items": [
                        {
                            "item_id": item_id,
                            "decision": "buy",
                            "final_quantity": 6,
                            "unit_price": 11.5,
                            "package_size": 6,
                        }
                    ],
                },
            )
            order = closed_quote.get("purchase_order")
            check(order and order.get("status") == "approved", "POST /api/purchase-orders/close nao gerou pedido aprovado.")
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
    smoke_schema_and_import_bootstrap()
    smoke_static_assets()
    smoke_skills()
    smoke_imported_settings_guardrails()
    smoke_erp_context_materialization()
    smoke_latest_purchase_cost_by_snapshot_date()
    conn = open_memory_db()
    try:
        seed_fixture(conn)
        smoke_summary_period_contract(conn)
        smoke_replenishment(conn)
        smoke_pricing(conn)
        smoke_customer_import_contracts(conn)
        smoke_quotes(conn)
        smoke_supplier_workbench_contract(conn)
        smoke_quote_pdf(conn)
        smoke_purchase_order_cycle(conn)
    finally:
        conn.close()
    smoke_http_server()


def main() -> int:
    checks = [
        "schema/importacao",
        "assets/contratos frontend",
        "skills",
        "configuracao importada",
        "materializacao ERP contextual",
        "custo por data",
        "resumo por periodo",
        "reposicao",
        "precificacao",
        "clientes/importacao contratos",
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
