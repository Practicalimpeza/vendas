from __future__ import annotations

import argparse
import json
import math
import mimetypes
import re
import sqlite3
import threading
import unicodedata
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from statistics import pstdev
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

from db_helpers import (
    date_where,
    max_activity_date,
    one,
    parse_decimal,
    parse_int,
    resolve_period,
    rows,
    scalar_text,
)
from pricing import api_pricing, update_product_pricing


ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "web"
NEXO_SKILLS_DIR = ROOT / "nexo_skills"
SCHEMA_LOCK = threading.Lock()


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")
    with SCHEMA_LOCK:
        ensure_schema_upgrades(conn)
    return conn


def ensure_schema_upgrades(conn: sqlite3.Connection) -> None:
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
    seed_brand_suppliers(conn)
    conn.commit()


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "_", text.strip().lower())
    return text.strip("_")


def make_supplier_id(org: str, name: str) -> str:
    return f"{org}:supplier:{normalize(name) or 'sem_fornecedor'}"


def clean_phone(value: str) -> str:
    phone = re.sub(r"\s+", " ", (value or "").strip())
    return phone[:40]


def round_to_package(quantity: float, package_size: float) -> float:
    if quantity <= 0:
        return 0.0
    if package_size and package_size > 1:
        return float(math.ceil(quantity / package_size) * package_size)
    return float(quantity)


def load_json_file(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def load_nexo_skills() -> dict:
    manifest = load_json_file(NEXO_SKILLS_DIR / "manifest.json")
    loaded = []
    for item in manifest.get("skills", []):
        skill = load_json_file(NEXO_SKILLS_DIR / item.get("file", ""))
        if skill:
            loaded.append({**item, "content": skill})
    return {**manifest, "skills": loaded}


def action_rules() -> dict:
    return load_json_file(NEXO_SKILLS_DIR / "action_center.json").get("actions", {})


def nexo_skill_name(skill_id: str) -> str:
    for item in load_nexo_skills().get("skills", []):
        if item.get("id") == skill_id:
            return item.get("name") or skill_id
    return skill_id.replace("_", " ").title()


class SafeTemplateData(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


def render_skill_template(template: str, context: dict) -> str:
    values = SafeTemplateData({key: "" if value is None else value for key, value in context.items()})
    return (template or "").format_map(values)


def api_nexo_skills() -> dict:
    skills = load_nexo_skills()
    return {
        "schema_version": skills.get("schema_version"),
        "product": skills.get("product"),
        "description": skills.get("description"),
        "skills": [
            {
                "id": item.get("id"),
                "version": item.get("version"),
                "name": item.get("name"),
                "principles": item.get("content", {}).get("principles", []),
            }
            for item in skills.get("skills", [])
        ],
        "action_rules": [
            {
                "id": key,
                "skill_id": rule.get("skill_id"),
                "title": rule.get("title"),
                "priority": rule.get("priority"),
                "view": rule.get("view"),
            }
            for key, rule in action_rules().items()
        ],
    }


def seed_brand_suppliers(conn: sqlite3.Connection) -> None:
    brands = conn.execute("SELECT id, organization_id, name, normalized_name FROM brands").fetchall()
    for brand in brands:
        sid = make_supplier_id(brand["organization_id"], brand["name"])
        conn.execute(
            """
            INSERT OR IGNORE INTO suppliers
                (id, organization_id, name, normalized_name, contact_phone, order_review_cycle_days)
            VALUES (?, ?, ?, ?, '', 14)
            """,
            (sid, brand["organization_id"], brand["name"], brand["normalized_name"]),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO brand_supplier_rules
                (organization_id, brand_id, supplier_id, notes)
            VALUES (?, ?, ?, 'Fornecedor padrao criado a partir da marca.')
            """,
            (brand["organization_id"], brand["id"], sid),
        )
    conn.execute(
        """
        UPDATE product_settings
        SET preferred_supplier_id = (
            SELECT bsr.supplier_id
            FROM products p
            JOIN brand_supplier_rules bsr
              ON bsr.organization_id = p.organization_id
             AND bsr.brand_id = p.brand_id
            WHERE p.id = product_settings.product_id
              AND p.organization_id = product_settings.organization_id
        )
        WHERE preferred_supplier_id IS NULL
          AND EXISTS (
              SELECT 1
              FROM products p
              JOIN brand_supplier_rules bsr
                ON bsr.organization_id = p.organization_id
               AND bsr.brand_id = p.brand_id
              WHERE p.id = product_settings.product_id
                AND p.organization_id = product_settings.organization_id
          )
        """
    )


def api_summary(conn: sqlite3.Connection, period: dict | None = None) -> dict:
    period = period or resolve_period(conn, {"period_days": "all"})
    product_where, product_params = date_where("sold_at", period, "WHERE")
    service_where, service_params = date_where("emitted_at", period, "WHERE")
    return {
        "kpis": one(
            conn,
            f"""
            SELECT
                (SELECT COUNT(*) FROM products) AS products,
                (SELECT COUNT(*) FROM customers) AS customers,
                (SELECT ROUND(COALESCE(SUM(gross_amount), 0), 2) FROM product_sales {product_where}) AS product_revenue,
                (SELECT ROUND(COALESCE(SUM(gross_amount), 0), 2) FROM service_sales {service_where}) AS service_revenue,
                (SELECT ROUND(COALESCE(SUM(quantity_on_hand), 0), 2) FROM inventory_snapshots) AS stock_units,
                (SELECT COUNT(*) FROM implementation_tasks WHERE status = 'open') AS open_tasks
            """,
            (*product_params, *service_params),
        ),
        "monthly": rows(
            conn,
            f"""
            SELECT month, ROUND(SUM(product_revenue), 2) AS product_revenue, ROUND(SUM(service_revenue), 2) AS service_revenue
            FROM (
                SELECT substr(sold_at, 1, 7) AS month, SUM(gross_amount) AS product_revenue, 0 AS service_revenue
                FROM product_sales {product_where} GROUP BY substr(sold_at, 1, 7)
                UNION ALL
                SELECT substr(emitted_at, 1, 7) AS month, 0, SUM(gross_amount)
                FROM service_sales {service_where} GROUP BY substr(emitted_at, 1, 7)
            )
            GROUP BY month
            ORDER BY month
            """,
            (*product_params, *service_params),
        ),
        "tasks": rows(
            conn,
            """
            SELECT task_type, title, priority, status
            FROM implementation_tasks
            ORDER BY priority, id
            LIMIT 8
            """
        ),
        "period": period,
    }


def pct(part: float, total: float) -> float:
    return round((part / total * 100.0), 1) if total else 0.0


def maturity_stage(score: int) -> dict:
    if score >= 80:
        return {"level": 5, "name": "Otimizacao", "label": "Hub cerebral em otimizacao"}
    if score >= 65:
        return {"level": 4, "name": "Inteligencia comercial", "label": "BI acionavel em expansao"}
    if score >= 45:
        return {"level": 3, "name": "Rotina de gestao", "label": "Operacao aprendendo com o uso"}
    if score >= 25:
        return {"level": 2, "name": "Compra assistida", "label": "Cotacao e reposicao desbloqueadas"}
    return {"level": 1, "name": "Leitura", "label": "Dados basicos entendidos"}


def capability(title: str, body: str, status: str, impact: str = "", action: str = "", view: str = "") -> dict:
    return {
        "title": title,
        "body": body,
        "status": status,
        "impact": impact,
        "action": action,
        "view": view,
    }


def focus_action(title: str, body: str, impact: str, action: str, view: str, scope: str, evidence: str = "") -> dict:
    return {
        "title": title,
        "body": body,
        "impact": impact,
        "action": action,
        "view": view,
        "scope": scope,
        "evidence": evidence,
    }


def mission(
    key: str,
    title: str,
    body: str,
    reward: str,
    unlocks: str,
    effort: str,
    progress: float,
    status: str,
    action: str,
    view: str,
    evidence: str = "",
) -> dict:
    return {
        "key": key,
        "title": title,
        "body": body,
        "reward": reward,
        "unlocks": unlocks,
        "effort": effort,
        "progress": round(clamp(progress, 0, 100), 1),
        "status": status,
        "action": action,
        "view": view,
        "evidence": evidence,
    }


def api_maturity(conn: sqlite3.Connection) -> dict:
    data = one(
        conn,
        """
        SELECT
            (SELECT COUNT(*) FROM products WHERE active = 1) AS products,
            (SELECT COUNT(*) FROM product_sales) AS product_sales,
            (SELECT COUNT(DISTINCT product_id) FROM product_sales) AS products_with_sales,
            (SELECT COUNT(*) FROM service_sales) AS service_sales,
            (SELECT COUNT(*) FROM customers) AS customers,
            (SELECT COUNT(DISTINCT product_id) FROM inventory_snapshots) AS products_with_stock,
            (SELECT COUNT(DISTINCT product_id) FROM cost_snapshots) AS products_with_cost,
            (SELECT COUNT(DISTINCT product_id) FROM product_identifiers WHERE identifier_type = 'supplier_reference') AS products_with_reference,
            (SELECT COUNT(*) FROM brands) AS brands,
            (SELECT COUNT(*) FROM brand_supplier_rules WHERE active = 1) AS brands_with_supplier,
            (SELECT COUNT(*) FROM suppliers WHERE COALESCE(contact_phone, '') <> '') AS suppliers_with_phone,
            (SELECT COUNT(*) FROM suppliers WHERE COALESCE(minimum_order_value, 0) > 0) AS suppliers_with_minimum,
            (SELECT COUNT(*) FROM suppliers) AS suppliers,
            (SELECT COUNT(DISTINCT supplier_id) FROM brand_supplier_rules WHERE active = 1) AS distinct_brand_suppliers,
            (SELECT COUNT(*) FROM brand_supplier_rules WHERE active = 1 AND notes LIKE 'Fornecedor padrao criado%') AS inferred_brand_supplier_rules,
            (SELECT COUNT(*) FROM quote_requests) AS quotes,
            (SELECT COUNT(*) FROM quote_requests WHERE status = 'sent') AS sent_quotes,
            (SELECT COUNT(*) FROM quote_requests WHERE status IN ('responded', 'approved')) AS learned_quotes,
            (SELECT COUNT(*) FROM action_items WHERE status = 'completed') AS completed_actions,
            (SELECT COUNT(*) FROM action_items WHERE status IN ('open', 'in_progress')) AS open_actions,
            (SELECT COUNT(*) FROM product_settings WHERE COALESCE(package_size, 1) > 1) AS products_with_package,
            (SELECT COUNT(DISTINCT substr(sold_at, 1, 7)) FROM product_sales) AS sales_months
        """
    )
    quote_draft = api_quote_drafts(conn)
    commercial = api_commercial_intelligence(conn)
    commercial_summary = commercial.get("summary", {})
    products = int(data.get("products") or 0)
    brands = int(data.get("brands") or 0)
    suppliers = int(data.get("suppliers") or 0)
    quotes = int(data.get("quotes") or 0)
    quote_suppliers = int(quote_draft["summary"]["supplier_count"])
    quote_items = int(quote_draft["summary"]["item_count"])
    at_risk_customers = int(commercial_summary.get("at_risk_customers") or 0)
    due_customers = int(commercial_summary.get("due_customers") or 0)
    completed_actions = int(data.get("completed_actions") or 0)
    distinct_brand_suppliers = int(data.get("distinct_brand_suppliers") or 0)
    inferred_supplier_count = int(data.get("brands_with_supplier") or 0)
    inferred_brand_supplier_rules = int(data.get("inferred_brand_supplier_rules") or 0)

    score = 0
    if products:
        score += 5
    if int(data.get("product_sales") or 0):
        score += 7
    if int(data.get("products_with_stock") or 0):
        score += 5
    if int(data.get("products_with_cost") or 0):
        score += 5
    if int(data.get("customers") or 0):
        score += 4
    score += min(8, int(round(pct(data.get("products_with_reference") or 0, products) / 12.5)))
    score += min(8, int(round(pct(data.get("brands_with_supplier") or 0, brands) / 12.5)))
    score += 10 if quote_suppliers else 0
    score += min(8, int(round(pct(data.get("suppliers_with_phone") or 0, suppliers) / 12.5)))
    score += min(8, int(round(pct(data.get("products_with_package") or 0, products) / 12.5)))
    score += 7 if quotes else 0
    score += 5 if int(data.get("sent_quotes") or 0) else 0
    score += 6 if int(data.get("learned_quotes") or 0) else 0
    score += 4 if int(data.get("sales_months") or 0) >= 6 else 0
    score += 6 if at_risk_customers or due_customers else 0
    score += min(6, completed_actions * 2)
    score = int(clamp(score, 0, 100))

    unlocked = []
    next_actions = []
    improvements = []

    unlocked.append(
        capability(
            "Leitura operacional importada",
            f"{products} produtos, {data.get('product_sales') or 0} vendas de produtos e {data.get('customers') or 0} clientes foram entendidos.",
            "unlocked" if products else "locked",
            "Base minima para BI e reposicao.",
            "Ver importacao",
            "imports",
        )
    )
    if quote_suppliers:
        unlocked.append(
            capability(
                "Cotacao por fornecedor desbloqueada",
                f"{quote_suppliers} fornecedores tem {quote_items} itens prontos para cotacao com os dados atuais.",
                "unlocked",
                "Transforma dados importados em acao de compra.",
                "Abrir cotacoes",
                "quotes",
            )
        )
    feasible_actions = []
    if inferred_brand_supplier_rules and quote_suppliers:
        feasible_actions.append(
            focus_action(
                "Agrupar marcas por fornecedor real",
                "Se um fornecedor atende varias marcas, comece juntando essas marcas antes de preencher dados comerciais.",
                "Melhora o agrupamento da cotacao e revela melhor o tamanho do pedido.",
                "Configurar fornecedores",
                "suppliers",
                "algumas marcas",
                "Os fornecedores iniciais foram inferidos por marca.",
            )
        )
    if quote_suppliers:
        feasible_actions.append(
            focus_action(
                "Gerar uma cotacao piloto",
                "Comece por um fornecedor ja detectado como cotavel. A cotacao tambem pode revelar caixa, divisor e disponibilidade.",
                "Entrega valor imediato e cria o primeiro dado operacional real.",
                "Abrir cotacoes",
                "quotes",
                "1 fornecedor",
                f"{quote_suppliers} fornecedores prontos; escolha 1.",
            )
        )
    if int(data.get("products_with_reference") or 0):
        unlocked.append(
            capability(
                "Referencia de fornecedor reconhecida",
                f"{data.get('products_with_reference')} produtos ja tem referencia para usar na cotacao.",
                "unlocked",
                "Evita enviar codigo interno como se fosse codigo do fornecedor.",
                "Ver reposicao",
                "stock",
            )
        )
    if int(data.get("sales_months") or 0) >= 6:
        unlocked.append(
            capability(
                "Historico suficiente para tendencia",
                f"{data.get('sales_months')} meses com vendas importadas.",
                "unlocked",
                "Permite comparar giro recente contra historico.",
                "Ver oportunidades",
                "opportunities",
            )
        )
    if at_risk_customers or due_customers:
        unlocked.append(
            capability(
                "Inteligencia comercial inicial",
                f"{at_risk_customers} clientes em risco e {due_customers} com recompra proxima foram detectados.",
                "unlocked",
                "Transforma historico em acao comercial simples.",
                "Ver oportunidades",
                "opportunities",
            )
        )
        feasible_actions.append(
            focus_action(
                "Recuperar um cliente em risco",
                "Escolha um cliente relevante que saiu da cadencia e faca um contato simples antes de tentar criar campanhas complexas.",
                "Mostra valor comercial do BI logo na implantacao.",
                "Ver oportunidades",
                "opportunities",
                "1 cliente",
                f"{at_risk_customers} clientes estao fora do ritmo esperado.",
            )
        )
    if quotes:
        improvements.append(
            capability(
                "O Nexo comecou a aprender com cotações",
                f"{quotes} cotacao(oes) registradas; {data.get('sent_quotes') or 0} marcada(s) como enviada(s).",
                "improved",
                "Abre caminho para comparar sugerido, cotado e comprado.",
                "Abrir cotacoes",
                "quotes",
            )
        )
    if completed_actions:
        improvements.append(
            capability(
                "Rotina operacional registrada",
                f"{completed_actions} acao(oes) concluidas na mesa do gestor.",
                "improved",
                "O Nexo deixa de ser so leitura e passa a guardar execucao.",
                "Abrir hoje",
                "actions",
            )
        )

    reference_pct = pct(data.get("products_with_reference") or 0, products)
    phone_pct = pct(data.get("suppliers_with_phone") or 0, suppliers)
    minimum_pct = pct(data.get("suppliers_with_minimum") or 0, suppliers)
    package_pct = pct(data.get("products_with_package") or 0, products)
    supplier_pct = pct(data.get("brands_with_supplier") or 0, brands)

    if phone_pct < 60 and suppliers:
        top_supplier = (quote_draft["suppliers"] or [{}])[0]
        if minimum_pct < 60:
            next_actions.append(
                capability(
                    "Cadastrar pedido minimo do fornecedor piloto",
                    f"Comece por {top_supplier.get('supplier_name') or 'um fornecedor prioritario'}, sem tentar completar todos os fornecedores.",
                    "next",
                    "Melhora a decisao de quando vale fechar uma cotacao.",
                    "Configurar fornecedores",
                    "suppliers",
                )
            )
            feasible_actions.append(
                focus_action(
                    "Informar pedido minimo do fornecedor piloto",
                    "Esse dado pode vir antes ou depois da primeira cotacao, dependendo de como o fornecedor trabalha.",
                    "A reposicao fica mais realista para o fornecedor escolhido.",
                    "Configurar fornecedores",
                    "suppliers",
                    "1 valor minimo",
                    f"{top_supplier.get('supplier_name') or 'Fornecedor prioritario'} aparece na fila de cotacao.",
                )
            )
        next_actions.append(
            capability(
                "Preencher telefone do primeiro fornecedor cotavel",
                f"Comece por {top_supplier.get('supplier_name') or 'um fornecedor prioritario'}, que ja tem itens para cotar.",
                "next",
                "Torna a rotina de cotacao mais fluida sem exigir cadastro completo.",
                "Configurar fornecedores",
                "suppliers",
            )
        )
        feasible_actions.append(
            focus_action(
                "Completar contato do fornecedor piloto",
                "Preencha o telefone apenas do fornecedor que voce vai cotar primeiro.",
                "Prepara o caminho para WhatsApp e reduz atrito na rotina.",
                "Configurar fornecedores",
                "suppliers",
                "1 telefone",
                f"{top_supplier.get('supplier_name') or 'Fornecedor prioritario'} aparece na fila de cotacao.",
            )
        )
    if package_pct < 25 and products:
        next_actions.append(
            capability(
                "Configurar embalagens de poucos itens prioritarios",
                "Comece pelos itens do fornecedor piloto antes de tentar corrigir a base inteira.",
                "next",
                "Melhora sugestao por caixa, fardo, saco ou pacote.",
                "Ver reposicao",
                "stock",
            )
        )
        feasible_actions.append(
            focus_action(
                "Ajustar embalagens dos itens da primeira cotacao",
                "Se voce ainda nao sabe o divisor, deixe a cotacao descobrir: 31 un pode voltar como caixa 12x1L.",
                "A sugestao fica mais realista ja no primeiro pedido.",
                "Ver reposicao",
                "stock",
                "aprendizado por item",
                "O divisor pode ser aprendido com a resposta do fornecedor.",
            )
        )
    if reference_pct < 80 and products:
        next_actions.append(
            capability(
                "Aumentar cobertura de referencias de fornecedor",
                f"{reference_pct}% dos produtos tem referencia importada.",
                "next",
                "Reduz atrito e erro na cotacao.",
                "Ver importacao",
                "imports",
            )
        )
    if quote_suppliers and not quotes:
        next_actions.insert(
            0,
            capability(
                "Gerar a primeira cotacao real",
                f"O sistema ja detectou {quote_suppliers} fornecedores prontos.",
                "next",
                "Cria o primeiro ciclo de aprendizado operacional.",
                "Abrir cotacoes",
                "quotes",
            ),
        )
    if at_risk_customers or due_customers:
        next_actions.append(
            capability(
                "Rodar uma acao comercial pequena",
                f"Comece com 1 dos {at_risk_customers + due_customers} clientes detectados.",
                "next",
                "Valida o BI como rotina de venda, nao apenas como relatorio.",
                "Ver oportunidades",
                "opportunities",
            )
        )
    if supplier_pct < 100 and brands:
        next_actions.append(
            capability(
                "Revisar fornecedor por marca",
                f"{supplier_pct}% das marcas tem regra ativa.",
                "next",
                "Garante agrupamento correto das sugestoes.",
                "Configurar fornecedores",
                "suppliers",
            )
        )

    return {
        "score": score,
        "stage": maturity_stage(score),
        "metrics": {
            "products": products,
            "customers": int(data.get("customers") or 0),
            "sales_months": int(data.get("sales_months") or 0),
            "reference_pct": reference_pct,
            "supplier_pct": supplier_pct,
            "phone_pct": phone_pct,
            "minimum_pct": minimum_pct,
            "package_pct": package_pct,
            "quote_suppliers": quote_suppliers,
            "quote_items": quote_items,
            "quotes": quotes,
            "at_risk_customers": at_risk_customers,
            "due_customers": due_customers,
            "open_actions": int(data.get("open_actions") or 0),
            "completed_actions": completed_actions,
            "distinct_brand_suppliers": distinct_brand_suppliers,
            "inferred_brand_supplier_rules": inferred_brand_supplier_rules,
        },
        "unlocked": unlocked[:6],
        "improvements": improvements[:4],
        "next_actions": next_actions[:6],
        "focus": {
            "headline": "Comece pelo que ja da resultado",
            "body": "Com os dados atuais, o melhor caminho e fazer uma cotacao piloto e melhorar apenas o necessario para esse fornecedor.",
            "actions": feasible_actions[:3],
        },
        "missions": [
            mission(
                "quote_pilot",
                "Cotacao piloto",
                "Gere a primeira cotacao de um fornecedor que ja tem itens sugeridos.",
                "Primeiro ciclo real de compra assistida.",
                "Historico de cotacoes, comparacao sugerido vs cotado e aprendizado de embalagem.",
                "Baixo",
                100 if quotes else 0,
                "done" if quotes else "available",
                "Abrir cotacoes",
                "quotes",
                f"{quote_suppliers} fornecedores prontos e {quote_items} itens cotaveis.",
            ),
            mission(
                "supplier_brand_mapping",
                "Mapa fornecedor x marcas",
                "Confirme ou agrupe marcas que pertencem ao mesmo fornecedor real.",
                "Cotas mais limpas e menos pedidos quebrados.",
                "Analise de fornecedor 360 e pedido minimo por mix real.",
                "Medio",
                100 - pct(inferred_brand_supplier_rules, max(inferred_supplier_count, 1)),
                "available" if inferred_brand_supplier_rules else "done",
                "Configurar fornecedores",
                "suppliers",
                f"{inferred_brand_supplier_rules} regras ainda foram inferidas automaticamente.",
            ),
            mission(
                "supplier_minimum",
                "Pedido minimo do fornecedor piloto",
                "Informe o minimo de um fornecedor prioritario ou descubra isso na primeira cotacao.",
                "Melhor decisao entre cotar agora ou esperar formar pedido.",
                "Dificuldade real do fornecedor e alvo de estoque mais preciso.",
                "Baixo",
                minimum_pct,
                "available" if minimum_pct < 100 else "done",
                "Configurar fornecedores",
                "suppliers",
                f"{minimum_pct}% dos fornecedores tem minimo cadastrado.",
            ),
            mission(
                "clean_active_mix",
                "Limpar foco do mix ativo",
                "Separe produtos sem estoque e sem venda recente da rotina principal.",
                "Menos ruido na tela de reposicao e cotacao.",
                "Trilhas de reativacao ou descontinuacao de produtos.",
                "Automatico",
                100,
                "done",
                "Ver reposicao",
                "stock",
                "Produtos fora do mix ja sao ocultados por padrao.",
            ),
            mission(
                "commercial_reactivation",
                "Recuperar cliente em risco",
                "Use a lista de oportunidades para fazer uma acao com um cliente que saiu da cadencia.",
                "Receita recuperada e prova rapida de valor comercial.",
                "Historico de acoes, lembretes e recomendacoes por cliente.",
                "Baixo",
                0,
                "available" if at_risk_customers else "locked",
                "Ver oportunidades",
                "opportunities",
                f"{at_risk_customers} clientes em risco detectados pela cadencia historica.",
            ),
            mission(
                "supplier_reference",
                "Referencia para cotacao",
                "Aumente a cobertura de referencias de fornecedor nos itens cotaveis.",
                "Cotacoes mais claras para o fornecedor.",
                "Menos retrabalho e mais confianca no envio por WhatsApp.",
                "Medio",
                reference_pct,
                "available" if reference_pct < 90 else "done",
                "Ver importacao",
                "imports",
                f"{reference_pct}% dos produtos tem referencia de fornecedor.",
            ),
        ],
    }


def api_top_products(conn: sqlite3.Connection, period: dict | None = None) -> list[dict]:
    period = period or resolve_period(conn, {"period_days": "all"})
    where_sql, params = date_where("s.sold_at", period, "WHERE")
    return rows(
        conn,
        f"""
        SELECT
            p.id,
            p.organization_id,
            p.source_code,
            p.name,
            ROUND(SUM(s.quantity), 2) AS quantity,
            ROUND(SUM(s.gross_amount), 2) AS revenue,
            ROUND(SUM(s.gross_amount) * 100.0 / NULLIF((SELECT SUM(gross_amount) FROM product_sales s {where_sql}), 0), 2) AS share
        FROM product_sales s
        JOIN products p ON p.id = s.product_id
        {where_sql}
        GROUP BY p.id
        ORDER BY revenue DESC
        LIMIT 50
        """,
        (*params, *params),
    )


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def round_package(quantity: float, package_size: float) -> float:
    package = package_size if package_size and package_size > 0 else 1.0
    if quantity <= 0:
        return 0.0
    return math.ceil(quantity / package) * package


def status_label(status: str) -> str:
    labels = {
        "buy_now": "Comprar agora",
        "urgent": "Ruptura iminente",
        "mix_review": "Decidir mix",
        "watch": "Monitorar",
        "ok": "Estoque ok",
        "excess": "Excesso",
        "no_demand": "Sem demanda",
        "blocked": "Bloqueado",
        "ignored": "Ignorado",
        "out_of_mix": "Fora do mix",
    }
    return labels.get(status, status)


def abc_classes(product_revenue: dict[str, float]) -> dict[str, str]:
    total = sum(product_revenue.values())
    if total <= 0:
        return {product_id: "C" for product_id in product_revenue}
    cumulative = 0.0
    result = {}
    for product_id, revenue in sorted(product_revenue.items(), key=lambda item: item[1], reverse=True):
        cumulative += revenue / total
        if cumulative <= 0.80:
            result[product_id] = "A"
        elif cumulative <= 0.95:
            result[product_id] = "B"
        else:
            result[product_id] = "C"
    return result


def api_replenishment(conn: sqlite3.Connection, limit: int = 300, period: dict | None = None) -> dict:
    period = period or resolve_period(conn, {"period_days": "all"})
    products = rows(
        conn,
        """
        SELECT
            p.id,
            p.organization_id,
            p.source_code,
            (
                SELECT pi.identifier_value
                FROM product_identifiers pi
                WHERE pi.organization_id = p.organization_id
                  AND pi.product_id = p.id
                  AND pi.identifier_type = 'supplier_reference'
                ORDER BY pi.id DESC
                LIMIT 1
            ) AS supplier_reference,
            p.name,
            p.unit,
            p.brand_id,
            b.name AS brand_name,
            COALESCE(bsr.supplier_id, ps.preferred_supplier_id) AS effective_supplier_id,
            COALESCE(ps.package_size, 1) AS package_size,
            COALESCE(ps.target_coverage_days, 45) AS configured_target_days,
            COALESCE(ps.minimum_stock, 0) AS minimum_stock,
            COALESCE(ps.maximum_stock, 0) AS maximum_stock,
            COALESCE(ps.blocked_for_purchase, 0) AS blocked_for_purchase,
            COALESCE(ps.ignored_in_purchase_reports, 0) AS ignored_in_purchase_reports,
            COALESCE(ps.marker, '') AS marker,
            COALESCE(ps.notes, '') AS operational_notes,
            s.name AS supplier_name,
            s.contact_phone AS supplier_phone,
            COALESCE(s.minimum_order_value, 0) AS minimum_order_value,
            COALESCE(s.target_order_value, 0) AS target_order_value,
            COALESCE(s.average_lead_time_days, 7) AS lead_time_days,
            s.order_review_cycle_days,
            COALESCE(s.target_coverage_adjustment_days, 0) AS target_coverage_adjustment_days,
            COALESCE(s.order_difficulty, 'auto') AS order_difficulty
        FROM products p
        LEFT JOIN product_settings ps ON ps.product_id = p.id AND ps.organization_id = p.organization_id
        LEFT JOIN brand_supplier_rules bsr ON bsr.organization_id = p.organization_id AND bsr.brand_id = p.brand_id AND bsr.active = 1
        LEFT JOIN suppliers s ON s.id = COALESCE(bsr.supplier_id, ps.preferred_supplier_id)
        LEFT JOIN brands b ON b.id = p.brand_id
        WHERE p.active = 1
        """,
    )
    period_sql, period_params = date_where("sold_at", period, "AND")
    sales = rows(
        conn,
        f"SELECT product_id, sold_at, quantity, gross_amount FROM product_sales WHERE quantity > 0{period_sql}",
        period_params,
    )
    if not sales:
        return {"summary": {"period_label": period.get("label", "")}, "rows": []}

    max_date_text = max(row["sold_at"] for row in sales)
    ref = date.fromisoformat(max_date_text)
    min_date_text = min(row["sold_at"] for row in sales)
    first_sale = date.fromisoformat(min_date_text)
    observed_days = max((ref - first_sale).days + 1, 1)

    stock = {
        row["product_id"]: float(row["stock_units"] or 0)
        for row in rows(
            conn,
            """
            SELECT product_id, SUM(quantity_on_hand) AS stock_units
            FROM inventory_snapshots
            GROUP BY product_id
            """,
        )
    }
    costs = {
        row["product_id"]: float(row["unit_cost"] or 0)
        for row in rows(
            conn,
            """
            SELECT product_id, MAX(total_cost) AS unit_cost
            FROM cost_snapshots
            GROUP BY product_id
            """,
        )
    }
    prices = {
        row["product_id"]: float(row["sale_price"] or 0)
        for row in rows(
            conn,
            """
            SELECT product_id, MAX(sale_price) AS sale_price
            FROM price_snapshots
            GROUP BY product_id
            """,
        )
    }

    by_product: dict[str, list[dict]] = {}
    revenue_by_product: dict[str, float] = {}
    for sale in sales:
        product_id = sale["product_id"]
        by_product.setdefault(product_id, []).append(sale)
        revenue_by_product[product_id] = revenue_by_product.get(product_id, 0.0) + float(sale["gross_amount"] or 0)
    abc = abc_classes(revenue_by_product)

    def window_qty(product_sales: list[dict], days: int) -> float:
        start = ref - timedelta(days=days - 1)
        return sum(float(sale["quantity"] or 0) for sale in product_sales if date.fromisoformat(sale["sold_at"]) >= start)

    def supplier_group(product: dict) -> tuple[str, str, bool]:
        if product["effective_supplier_id"]:
            return f"supplier:{product['effective_supplier_id']}", product["supplier_name"] or "Fornecedor sem nome", True
        if product["brand_id"]:
            return f"brand:{product['brand_id']}", f"Marca {product['brand_name'] or 'sem marca'} - fornecedor a configurar", False
        return "unassigned", "Fornecedor a configurar", False

    supplier_profiles: dict[str, dict] = {}
    for product in products:
        group_key, group_name, configured = supplier_group(product)
        product_sales = by_product.get(product["id"], [])
        qty_365 = window_qty(product_sales, min(365, observed_days))
        unit_cost = costs.get(product["id"], 0.0)
        sale_price = prices.get(product["id"], 0.0)
        purchase_unit_value = unit_cost if unit_cost > 0 else sale_price * 0.60
        daily_purchase_value = (qty_365 / max(min(365, observed_days), 1)) * purchase_unit_value
        profile = supplier_profiles.setdefault(
            group_key,
            {
                "supplier_key": group_key,
                "supplier_name": group_name,
                "configured": configured,
                "daily_purchase_value": 0.0,
                "active_skus": 0,
                "minimum_order_value": float(product["minimum_order_value"] or 0),
                "target_order_value": float(product["target_order_value"] or 0),
                "lead_time_days": int(product["lead_time_days"] or 7),
                "manual_review_cycle_days": product["order_review_cycle_days"],
                "manual_adjustment_days": int(product["target_coverage_adjustment_days"] or 0),
                "manual_difficulty": product["order_difficulty"] or "auto",
                "contact_phone": product["supplier_phone"] or "",
            },
        )
        profile["daily_purchase_value"] += daily_purchase_value
        if qty_365 > 0:
            profile["active_skus"] += 1

    for profile in supplier_profiles.values():
        minimum = float(profile["minimum_order_value"] or 0)
        target = float(profile["target_order_value"] or 0)
        threshold = target if target > minimum else minimum
        daily_value = float(profile["daily_purchase_value"] or 0)
        if threshold > 0 and daily_value > 0:
            days_to_order = threshold / daily_value
        elif profile["configured"]:
            days_to_order = 21.0
        else:
            days_to_order = None

        if not profile["configured"]:
            difficulty = "configure"
            cycle_days = 14
            adjustment_days = 0
        elif profile["manual_difficulty"] in {"easy", "normal", "hard"}:
            difficulty = profile["manual_difficulty"]
        elif days_to_order is None:
            difficulty = "normal"
        elif minimum <= 0 and target <= 0:
            difficulty = "unknown"
        elif days_to_order <= 14:
            difficulty = "easy"
        elif days_to_order <= 35:
            difficulty = "normal"
        else:
            difficulty = "hard"

        if profile["configured"]:
            if profile["manual_review_cycle_days"]:
                cycle_days = int(profile["manual_review_cycle_days"])
            elif days_to_order is not None:
                cycle_days = int(clamp(days_to_order, 7, 60))
            else:
                cycle_days = 14
            adjustment_days = int(profile["manual_adjustment_days"] or 0)
            if not adjustment_days:
                adjustment_days = {"easy": -7, "normal": 0, "hard": 18, "unknown": 0}.get(difficulty, 0)

        profile["days_to_order"] = round(days_to_order, 1) if days_to_order is not None else None
        profile["difficulty"] = difficulty
        profile["review_cycle_days"] = int(clamp(cycle_days, 7, 60))
        profile["target_adjustment_days"] = int(clamp(adjustment_days, -14, 45))

    result = []
    for product in products:
        product_sales = by_product.get(product["id"], [])
        group_key, supplier_name, supplier_configured = supplier_group(product)
        supplier_profile = supplier_profiles[group_key]
        stock_units = stock.get(product["id"], 0.0)
        revenue = revenue_by_product.get(product["id"], 0.0)
        abc_class = abc.get(product["id"], "C")
        package_size = float(product["package_size"] or 1) or 1.0
        lead_time_days = int(product["lead_time_days"] or 7)
        review_cycle_days = int(supplier_profile["review_cycle_days"])
        minimum_stock = float(product["minimum_stock"] or 0)
        maximum_stock = float(product["maximum_stock"] or 0)
        marker = product["marker"] or ""

        qty_30 = window_qty(product_sales, min(30, observed_days))
        qty_60 = window_qty(product_sales, min(60, observed_days))
        qty_90 = window_qty(product_sales, min(90, observed_days))
        qty_180 = window_qty(product_sales, min(180, observed_days))
        qty_365 = window_qty(product_sales, min(365, observed_days))
        qty_all = sum(float(sale["quantity"] or 0) for sale in product_sales)
        dall = qty_all / observed_days
        out_of_current_mix = stock_units <= 0 and qty_180 <= 0
        if out_of_current_mix:
            status = "out_of_mix"
            reason = "Sem estoque e sem venda recente; tratado como fora do mix ativo ate nova evidencia."
            result.append(
                {
                    "product_id": product["id"],
                    "organization_id": product["organization_id"],
                    "source_code": product["source_code"],
                    "supplier_reference": product["supplier_reference"] or "",
                    "quote_code": product["supplier_reference"] or product["source_code"],
                    "name": product["name"],
                    "unit": product["unit"],
                    "brand_id": product["brand_id"] or "",
                    "brand_name": product["brand_name"] or "Sem marca",
                    "abc_class": abc_class,
                    "status": status,
                    "status_label": status_label(status),
                    "priority": 0,
                    "stock_units": round(stock_units, 2),
                    "forecast_daily_demand": 0,
                    "avg_daily_demand": round(dall, 4),
                    "demand_30": round(qty_30, 2),
                    "demand_90": round(qty_90, 2),
                    "demand_180": round(qty_180, 2),
                    "coverage_days": None,
                    "lead_time_days": lead_time_days,
                    "review_cycle_days": int(supplier_profile["review_cycle_days"]),
                    "target_coverage_days": 0,
                    "safety_stock": 0,
                    "reorder_point": 0,
                    "order_up_to": 0,
                    "suggested_quantity": 0,
                    "package_size": round(package_size, 2),
                    "estimated_value": 0,
                    "unit_cost": round(costs.get(product["id"], 0.0), 2),
                    "sale_price": round(prices.get(product["id"], 0.0), 2),
                    "margin_pct": None,
                    "trend_index": 1,
                    "variability": 0,
                    "intermittent": False,
                    "revenue": round(revenue, 2),
                    "reason": reason,
                    "supplier_id": product["effective_supplier_id"] or "",
                    "supplier_name": supplier_name,
                    "supplier_phone": supplier_profile["contact_phone"],
                    "supplier_configured": supplier_configured,
                    "supplier_difficulty": supplier_profile["difficulty"],
                    "supplier_daily_purchase_value": round(supplier_profile["daily_purchase_value"], 2),
                    "supplier_days_to_order": supplier_profile["days_to_order"],
                    "supplier_target_adjustment_days": supplier_profile["target_adjustment_days"],
                    "supplier_active_skus": supplier_profile["active_skus"],
                    "out_of_current_mix": True,
                    "mix_decision_required": False,
                    "forced_purchase": False,
                }
            )
            continue
        sale_days_180 = len({
            sale["sold_at"]
            for sale in product_sales
            if date.fromisoformat(sale["sold_at"]) >= ref - timedelta(days=min(180, observed_days) - 1)
        })

        d30 = qty_30 / max(min(30, observed_days), 1)
        d60 = qty_60 / max(min(60, observed_days), 1)
        d90 = qty_90 / max(min(90, observed_days), 1)
        d180 = qty_180 / max(min(180, observed_days), 1)
        d365 = qty_365 / max(min(365, observed_days), 1)
        weighted = (0.30 * d30) + (0.25 * d60) + (0.20 * d90) + (0.15 * d180) + (0.10 * d365)
        trend_index = d90 / d365 if d365 > 0 else (1.4 if d90 > 0 else 1.0)
        trend_factor = clamp(0.85 + (trend_index * 0.15), 0.75, 1.25)
        forecast_daily = max(weighted * trend_factor, dall * 0.65)

        intermittent = sale_days_180 <= 4 and qty_180 > 0
        if intermittent:
            forecast_daily = min(forecast_daily, max(d180, dall) * 0.85)

        daily_values = []
        daily_start = ref - timedelta(days=min(180, observed_days) - 1)
        daily_map: dict[str, float] = {}
        for sale in product_sales:
            sale_date = date.fromisoformat(sale["sold_at"])
            if sale_date >= daily_start:
                daily_map[sale["sold_at"]] = daily_map.get(sale["sold_at"], 0.0) + float(sale["quantity"] or 0)
        for offset in range(min(180, observed_days)):
            day = (daily_start + timedelta(days=offset)).isoformat()
            daily_values.append(daily_map.get(day, 0.0))
        std_daily = pstdev(daily_values) if len(daily_values) > 1 else 0.0
        variability = std_daily / forecast_daily if forecast_daily > 0 else 0.0

        target_by_abc = {"A": 45, "B": 35, "C": 25}[abc_class]
        configured_target = int(product["configured_target_days"] or target_by_abc)
        target_coverage_days = configured_target if configured_target != 45 or abc_class == "A" else target_by_abc
        target_coverage_days = int(clamp(target_coverage_days + int(supplier_profile["target_adjustment_days"]), 14, 120))
        service_z = {"A": 1.65, "B": 1.28, "C": 0.84}[abc_class]
        safety_stock = service_z * std_daily * math.sqrt(max(lead_time_days + review_cycle_days, 1))
        if intermittent:
            safety_stock *= 0.55

        reorder_point = (forecast_daily * (lead_time_days + review_cycle_days)) + safety_stock + minimum_stock
        order_up_to = (forecast_daily * (lead_time_days + review_cycle_days + target_coverage_days)) + safety_stock + minimum_stock
        if maximum_stock > 0:
            order_up_to = min(order_up_to, maximum_stock)
        raw_need = max(order_up_to - stock_units, 0)

        coverage_days = None if forecast_daily <= 0 else stock_units / forecast_daily
        suggested_quantity = 0.0
        status = "ok"
        reason = "Estoque cobre a demanda projetada dentro da politica atual."
        forced_purchase = marker == "force_one_more_purchase"
        low_confidence_repurchase = (
            stock_units <= max(package_size, 3.0)
            and (
                forecast_daily <= 0.03
                or qty_90 <= 0
                or (sale_days_180 <= 2 and qty_180 <= max(package_size * 2, 4.0))
                or (coverage_days is not None and coverage_days <= 30 and intermittent)
            )
        )

        if int(product["blocked_for_purchase"] or 0):
            status = "blocked"
            reason = "Produto bloqueado para compra nas configuracoes operacionais."
        elif int(product["ignored_in_purchase_reports"] or 0):
            status = "ignored"
            reason = "Produto marcado para nao entrar nos relatorios de compra."
        elif forced_purchase:
            status = "buy_now"
            suggested_quantity = round_package(max(raw_need, package_size), package_size)
            reason = "Operador decidiu forcar mais uma compra antes de retirar o produto do mix."
        elif low_confidence_repurchase:
            status = "mix_review"
            reason = "Estoque esta acabando, mas a demanda nao justifica recompra automatica. Operador decide se tira do mix ou forca mais uma compra."
        elif forecast_daily <= 0:
            status = "no_demand"
            reason = "Sem demanda historica suficiente no periodo importado."
        elif stock_units <= forecast_daily * max(lead_time_days, 1):
            status = "urgent"
            suggested_quantity = round_package(raw_need, package_size)
            reason = "Estoque atual nao cobre o prazo estimado ate reposicao."
        elif stock_units <= reorder_point:
            status = "buy_now"
            suggested_quantity = round_package(raw_need, package_size)
            reason = "Estoque abaixo do ponto de pedido calculado."
        elif stock_units > max(order_up_to * 1.8, forecast_daily * 120) and revenue > 0:
            status = "excess"
            reason = "Estoque acima da cobertura alvo e do consumo projetado."
        elif coverage_days is not None and coverage_days <= target_coverage_days:
            status = "watch"
            reason = "Cobertura abaixo da meta, mas ainda acima do ponto de pedido."

        unit_cost = costs.get(product["id"], 0.0)
        sale_price = prices.get(product["id"], 0.0)
        estimated_value = suggested_quantity * unit_cost if unit_cost > 0 else 0.0
        margin_pct = ((sale_price - unit_cost) / sale_price * 100.0) if sale_price > 0 and unit_cost > 0 else None
        priority = 0.0
        priority += {"urgent": 100, "buy_now": 85, "mix_review": 70, "watch": 45, "excess": 20, "ok": 5, "no_demand": 0, "blocked": 0, "ignored": 0}[status]
        priority += {"A": 18, "B": 9, "C": 2}[abc_class]
        priority += clamp(revenue / 10000.0, 0, 18)
        if coverage_days is not None:
            priority += clamp((target_coverage_days - coverage_days) / max(target_coverage_days, 1) * 20, -10, 20)

        result.append(
            {
                "product_id": product["id"],
                "organization_id": product["organization_id"],
                "source_code": product["source_code"],
                "supplier_reference": product["supplier_reference"] or "",
                "quote_code": product["supplier_reference"] or product["source_code"],
                "name": product["name"],
                "unit": product["unit"],
                "brand_id": product["brand_id"] or "",
                "brand_name": product["brand_name"] or "Sem marca",
                "abc_class": abc_class,
                "status": status,
                "status_label": status_label(status),
                "priority": round(priority, 1),
                "stock_units": round(stock_units, 2),
                "forecast_daily_demand": round(forecast_daily, 4),
                "avg_daily_demand": round(dall, 4),
                "demand_30": round(qty_30, 2),
                "demand_90": round(qty_90, 2),
                "demand_180": round(qty_180, 2),
                "coverage_days": round(coverage_days, 1) if coverage_days is not None else None,
                "lead_time_days": lead_time_days,
                "review_cycle_days": review_cycle_days,
                "target_coverage_days": target_coverage_days,
                "safety_stock": round(safety_stock, 2),
                "reorder_point": round(reorder_point, 2),
                "order_up_to": round(order_up_to, 2),
                "suggested_quantity": round(suggested_quantity, 2),
                "package_size": round(package_size, 2),
                "estimated_value": round(estimated_value, 2),
                "unit_cost": round(unit_cost, 2),
                "sale_price": round(sale_price, 2),
                "margin_pct": round(margin_pct, 1) if margin_pct is not None else None,
                "trend_index": round(trend_index, 2),
                "variability": round(variability, 2),
                "intermittent": intermittent,
                "revenue": round(revenue, 2),
                "reason": reason,
                "supplier_id": product["effective_supplier_id"] or "",
                "supplier_name": supplier_name,
                "supplier_phone": supplier_profile["contact_phone"],
                "supplier_configured": supplier_configured,
                "supplier_difficulty": supplier_profile["difficulty"],
                "supplier_daily_purchase_value": round(supplier_profile["daily_purchase_value"], 2),
                "supplier_days_to_order": supplier_profile["days_to_order"],
                "supplier_target_adjustment_days": supplier_profile["target_adjustment_days"],
                "supplier_active_skus": supplier_profile["active_skus"],
                "out_of_current_mix": False,
                "mix_decision_required": status == "mix_review",
                "forced_purchase": forced_purchase,
            }
        )

    status_order = {"urgent": 0, "buy_now": 1, "mix_review": 2, "watch": 3, "excess": 4, "ok": 5, "no_demand": 6, "blocked": 7, "ignored": 8, "out_of_mix": 9}
    result.sort(key=lambda row: (status_order.get(row["status"], 9), -row["priority"], -row["revenue"]))
    summary = {
        "reference_date": ref.isoformat(),
        "observed_days": observed_days,
        "buy_now": sum(1 for row in result if row["status"] in {"urgent", "buy_now"}),
        "mix_review": sum(1 for row in result if row["status"] == "mix_review"),
        "watch": sum(1 for row in result if row["status"] == "watch"),
        "excess": sum(1 for row in result if row["status"] == "excess"),
        "no_demand": sum(1 for row in result if row["status"] == "no_demand"),
        "out_of_current_mix": sum(1 for row in result if row["status"] == "out_of_mix"),
        "critical_a": sum(1 for row in result if row["abc_class"] == "A" and row["status"] in {"urgent", "buy_now"}),
        "suggested_units": round(sum(row["suggested_quantity"] for row in result), 2),
        "estimated_value": round(sum(row["estimated_value"] for row in result), 2),
        "hard_suppliers": sum(1 for profile in supplier_profiles.values() if profile["difficulty"] == "hard"),
        "unknown_minimum_suppliers": sum(1 for profile in supplier_profiles.values() if profile["difficulty"] == "unknown"),
        "unconfigured_supplier_groups": sum(1 for profile in supplier_profiles.values() if not profile["configured"]),
    }
    return {"summary": summary, "rows": result[:limit] if limit else result}


def api_stock(conn: sqlite3.Connection) -> list[dict]:
    return api_replenishment(conn)["rows"][:80]


def api_customers(conn: sqlite3.Connection, period: dict | None = None) -> list[dict]:
    period = period or resolve_period(conn, {"period_days": "all"})
    period_sql, params = date_where("s.sold_at", period, "AND")
    return rows(
        conn,
        f"""
        SELECT
            c.name,
            COUNT(*) AS purchases,
            MAX(s.sold_at) AS last_purchase,
            ROUND(SUM(s.gross_amount), 2) AS revenue
        FROM product_sales s
        JOIN customers c ON c.id = s.customer_id
        WHERE UPPER(c.name) <> 'CONSUMIDOR'{period_sql}
        GROUP BY c.id
        ORDER BY revenue DESC
        LIMIT 50
        """,
        params,
    )


def customer_commercial_rows(conn: sqlite3.Connection, period: dict | None = None) -> list[dict]:
    period = period or resolve_period(conn, {"period_days": "all"})
    product_period_sql, product_params = date_where("sold_at", period, "AND")
    service_period_sql, service_params = date_where("emitted_at", period, "AND")
    return rows(
        conn,
        f"""
        WITH all_events AS (
            SELECT
                customer_id,
                substr(sold_at, 1, 10) AS event_date,
                SUM(gross_amount) AS product_revenue,
                0 AS service_revenue
            FROM product_sales
            WHERE customer_id IS NOT NULL{product_period_sql}
            GROUP BY customer_id, substr(sold_at, 1, 10)
            UNION ALL
            SELECT
                customer_id,
                substr(emitted_at, 1, 10) AS event_date,
                0 AS product_revenue,
                SUM(gross_amount) AS service_revenue
            FROM service_sales
            WHERE customer_id IS NOT NULL{service_period_sql}
            GROUP BY customer_id, substr(emitted_at, 1, 10)
        ),
        daily AS (
            SELECT
                customer_id,
                event_date,
                SUM(product_revenue) AS product_revenue,
                SUM(service_revenue) AS service_revenue,
                SUM(product_revenue + service_revenue) AS revenue
            FROM all_events
            GROUP BY customer_id, event_date
        ),
        max_date AS (
            SELECT MAX(event_date) AS max_event_date FROM daily
        )
        SELECT
            c.id,
            c.name,
            COUNT(*) AS purchase_days,
            MIN(d.event_date) AS first_purchase,
            MAX(d.event_date) AS last_purchase,
            ROUND(SUM(d.revenue), 2) AS revenue,
            ROUND(SUM(d.product_revenue), 2) AS product_revenue,
            ROUND(SUM(d.service_revenue), 2) AS service_revenue,
            ROUND(AVG(d.revenue), 2) AS avg_ticket,
            ROUND(julianday((SELECT max_event_date FROM max_date)) - julianday(MAX(d.event_date)), 1) AS days_since,
            ROUND(
                CASE
                    WHEN COUNT(*) > 1 THEN (julianday(MAX(d.event_date)) - julianday(MIN(d.event_date))) / (COUNT(*) - 1)
                    ELSE NULL
                END,
                1
            ) AS avg_gap_days
        FROM daily d
        JOIN customers c ON c.id = d.customer_id
        WHERE UPPER(c.name) <> 'CONSUMIDOR'
        GROUP BY c.id
        HAVING SUM(d.revenue) > 0
        ORDER BY revenue DESC
        """,
        (*product_params, *service_params),
    )


def classify_customer(row: dict) -> dict:
    revenue = float(row.get("revenue") or 0)
    purchase_days = int(row.get("purchase_days") or 0)
    days_since = float(row.get("days_since") or 0)
    avg_gap = row.get("avg_gap_days")
    avg_gap = float(avg_gap) if avg_gap is not None else None
    expected_gap = avg_gap if avg_gap and avg_gap > 0 else 90.0
    expected_gap = float(clamp(expected_gap, 21, 180))
    due_in = round(expected_gap - days_since, 1)
    overdue_factor = days_since / expected_gap if expected_gap else 0
    frequency_factor = min(1.0, purchase_days / 8.0)
    value_factor = min(1.0, revenue / 5000.0)
    risk_score = int(round(clamp((overdue_factor - 0.75) * 55 + frequency_factor * 25 + value_factor * 20, 0, 100)))
    if purchase_days < 2:
        status = "novo"
        label = "Cliente novo"
        reason = "Ainda nao existe cadencia suficiente para prever recompra."
    elif overdue_factor >= 1.8:
        status = "lost"
        label = "Possivel perda"
        reason = "Passou muito do intervalo medio de recompra."
    elif overdue_factor >= 1.15:
        status = "risk"
        label = "Em risco"
        reason = "Ja passou do intervalo esperado de recompra."
    elif -14 <= due_in <= 14:
        status = "due"
        label = "Recompra proxima"
        reason = "Esta perto da janela normal de nova compra."
    else:
        status = "healthy"
        label = "Em ritmo"
        reason = "Compra recente dentro da cadencia observada."
    row.update(
        {
            "expected_gap_days": round(expected_gap, 1),
            "due_in_days": due_in,
            "risk_score": risk_score,
            "status": status,
            "status_label": label,
            "reason": reason,
            "estimated_next_purchase": (
                datetime.strptime(row["last_purchase"], "%Y-%m-%d").date() + timedelta(days=round(expected_gap))
            ).isoformat()
            if row.get("last_purchase")
            else "",
        }
    )
    return row


def momentum_rows(conn: sqlite3.Connection, level: str, limit: int = 12, period: dict | None = None) -> list[dict]:
    period = period or resolve_period(conn, {"period_days": "all"})
    if level == "brand":
        select_id = "COALESCE(b.id, 'sem_marca') AS entity_id"
        select_name = "COALESCE(b.name, 'Sem marca') AS name"
        join = "JOIN products p ON p.id = s.product_id LEFT JOIN brands b ON b.id = p.brand_id"
        group = "COALESCE(b.id, 'sem_marca'), COALESCE(b.name, 'Sem marca')"
    else:
        select_id = "p.id AS entity_id"
        select_name = "p.name AS name"
        join = "JOIN products p ON p.id = s.product_id"
        group = "p.id, p.name"
    date_ceiling = "date((SELECT max_sold_at FROM max_date))"
    params: tuple = (limit,)
    if period.get("date_to"):
        date_ceiling = "date(?)"
        params = tuple([period["date_to"]] * 6 + [limit])
    return rows(
        conn,
        f"""
        WITH max_date AS (
            SELECT MAX(substr(sold_at, 1, 10)) AS max_sold_at FROM product_sales
        ),
        period AS (
            SELECT
                {select_id},
                {select_name},
                SUM(CASE
                    WHEN substr(s.sold_at, 1, 10) > date({date_ceiling}, '-90 day')
                     AND substr(s.sold_at, 1, 10) <= {date_ceiling}
                    THEN s.gross_amount ELSE 0 END
                ) AS recent_revenue,
                SUM(CASE
                    WHEN substr(s.sold_at, 1, 10) <= date({date_ceiling}, '-90 day')
                     AND substr(s.sold_at, 1, 10) > date({date_ceiling}, '-180 day')
                    THEN s.gross_amount ELSE 0 END
                ) AS previous_revenue,
                SUM(CASE
                    WHEN substr(s.sold_at, 1, 10) > date({date_ceiling}, '-90 day')
                     AND substr(s.sold_at, 1, 10) <= {date_ceiling}
                    THEN s.quantity ELSE 0 END
                ) AS recent_quantity
            FROM product_sales s
            {join}
            GROUP BY {group}
        )
        SELECT
            entity_id,
            name,
            ROUND(recent_revenue, 2) AS recent_revenue,
            ROUND(previous_revenue, 2) AS previous_revenue,
            ROUND(recent_revenue - previous_revenue, 2) AS delta_revenue,
            ROUND(recent_quantity, 2) AS recent_quantity,
            ROUND(
                CASE
                    WHEN previous_revenue > 0 THEN (recent_revenue - previous_revenue) * 100.0 / previous_revenue
                    WHEN recent_revenue > 0 THEN 100.0
                    ELSE 0
                END,
                1
            ) AS trend_pct
        FROM period
        WHERE recent_revenue > 0 OR previous_revenue > 0
        ORDER BY ABS(delta_revenue) DESC
        LIMIT ?
        """,
        params,
    )


def api_commercial_intelligence(conn: sqlite3.Connection, period: dict | None = None) -> dict:
    period = period or resolve_period(conn, {"period_days": "all"})
    customers = [classify_customer(row) for row in customer_commercial_rows(conn, period)]
    total_customers = len(customers)
    total_revenue = round(sum(float(row.get("revenue") or 0) for row in customers), 2)
    risk_customers = [
        row for row in customers if row["status"] in {"risk", "lost"} and int(row.get("purchase_days") or 0) >= 2
    ]
    risk_customers.sort(key=lambda row: (-row["risk_score"], -float(row.get("revenue") or 0)))
    due_customers = [
        row for row in customers if row["status"] == "due" and int(row.get("purchase_days") or 0) >= 2
    ]
    due_customers.sort(key=lambda row: (abs(float(row.get("due_in_days") or 0)), -float(row.get("revenue") or 0)))
    champions = [
        row
        for row in customers
        if row["status"] == "healthy" and int(row.get("purchase_days") or 0) >= 3 and float(row.get("revenue") or 0) > 0
    ][:12]
    product_momentum = momentum_rows(conn, "product", 16, period)
    brand_momentum = momentum_rows(conn, "brand", 12, period)
    growth_products = [row for row in product_momentum if float(row.get("delta_revenue") or 0) > 0]
    drop_products = [row for row in product_momentum if float(row.get("delta_revenue") or 0) < 0]
    last_sale = one(
        conn,
        """
        SELECT MAX(max_date) AS last_sale_date
        FROM (
            SELECT MAX(substr(sold_at, 1, 10)) AS max_date FROM product_sales
            UNION ALL
            SELECT MAX(substr(emitted_at, 1, 10)) AS max_date FROM service_sales
        )
        """,
    ).get("last_sale_date")
    return {
        "summary": {
            "customers": total_customers,
            "revenue": total_revenue,
            "at_risk_customers": len(risk_customers),
            "at_risk_revenue": round(sum(float(row.get("revenue") or 0) for row in risk_customers), 2),
            "due_customers": len(due_customers),
            "due_revenue": round(sum(float(row.get("revenue") or 0) for row in due_customers), 2),
            "growth_products": len(growth_products),
            "drop_products": len(drop_products),
            "last_sale_date": last_sale,
            "period_label": period.get("label", ""),
        },
        "risk_customers": risk_customers[:20],
        "repurchase_opportunities": due_customers[:20],
        "champions": champions,
        "product_momentum": product_momentum,
        "brand_momentum": brand_momentum,
        "explanations": [
            {
                "title": "Cliente em risco",
                "body": "Compara os dias desde a ultima compra com a cadencia historica daquele cliente. Se passou muito do padrao dele, entra em risco.",
            },
            {
                "title": "Recompra proxima",
                "body": "Mostra clientes perto da janela esperada de nova compra. E uma acao pequena, boa para contato comercial sem depender de cadastro novo.",
            },
            {
                "title": "Ganho e queda de ritmo",
                "body": "Compara os ultimos 90 dias da base com os 90 dias anteriores, sempre pela data mais recente importada.",
            },
        ],
    }


def api_services(conn: sqlite3.Connection, period: dict | None = None) -> list[dict]:
    period = period or resolve_period(conn, {"period_days": "all"})
    period_sql, params = date_where("ss.emitted_at", period, "WHERE")
    return rows(
        conn,
        f"""
        SELECT
            sv.name,
            ROUND(SUM(ss.quantity), 2) AS quantity,
            ROUND(SUM(ss.gross_amount), 2) AS revenue,
            ROUND(SUM(ss.net_amount), 2) AS net_revenue
        FROM service_sales ss
        JOIN services sv ON sv.id = ss.service_id
        {period_sql}
        GROUP BY sv.id
        ORDER BY revenue DESC
        LIMIT 50
        """,
        params,
    )


def api_imports(conn: sqlite3.Connection) -> dict:
    return {
        "batches": rows(conn, "SELECT id, source_system, status, source_period_start, source_period_end, finished_at, summary_json FROM import_batches ORDER BY started_at DESC LIMIT 5"),
        "issues": rows(conn, "SELECT severity, code, message, source_line FROM import_issues ORDER BY id DESC LIMIT 50"),
        "changes": rows(conn, "SELECT entity_type, source_code, field_name, previous_value, new_value, review_status, created_at FROM source_entity_changes ORDER BY id DESC LIMIT 50"),
    }


def api_brand_suppliers(conn: sqlite3.Connection) -> list[dict]:
    return rows(
        conn,
        """
        WITH product_revenue AS (
            SELECT product_id, SUM(gross_amount) AS revenue
            FROM product_sales
            GROUP BY product_id
        ),
        stock AS (
            SELECT product_id, SUM(quantity_on_hand) AS stock_units
            FROM inventory_snapshots
            GROUP BY product_id
        )
        SELECT
            b.organization_id,
            b.id AS brand_id,
            b.name AS brand_name,
            COALESCE(s.id, '') AS supplier_id,
            COALESCE(s.name, b.name) AS supplier_name,
            COALESCE(s.contact_phone, '') AS contact_phone,
            COALESCE(s.minimum_order_value, 0) AS minimum_order_value,
            COALESCE(bsr.notes, '') AS supplier_rule_notes,
            CASE
                WHEN bsr.supplier_id IS NULL THEN 'missing'
                WHEN bsr.notes LIKE 'Fornecedor padrao criado%' THEN 'inferred'
                ELSE 'manual'
            END AS supplier_rule_origin,
            CASE
                WHEN bsr.supplier_id IS NULL THEN 'Sem fornecedor'
                WHEN bsr.notes LIKE 'Fornecedor padrao criado%' THEN 'Inferido pela marca'
                ELSE 'Confirmado no Nexo'
            END AS supplier_rule_label,
            CASE
                WHEN bsr.supplier_id IS NULL THEN 0.0
                WHEN bsr.notes LIKE 'Fornecedor padrao criado%' THEN 0.45
                ELSE 1.0
            END AS supplier_rule_confidence,
            COUNT(DISTINCT p.id) AS product_count,
            ROUND(COALESCE(SUM(product_revenue.revenue), 0), 2) AS revenue,
            ROUND(COALESCE(SUM(stock.stock_units), 0), 2) AS stock_units
        FROM brands b
        LEFT JOIN brand_supplier_rules bsr
          ON bsr.organization_id = b.organization_id
         AND bsr.brand_id = b.id
         AND bsr.active = 1
        LEFT JOIN suppliers s ON s.id = bsr.supplier_id
        LEFT JOIN products p
          ON p.organization_id = b.organization_id
         AND p.brand_id = b.id
         AND p.active = 1
        LEFT JOIN product_revenue ON product_revenue.product_id = p.id
        LEFT JOIN stock ON stock.product_id = p.id
        GROUP BY b.organization_id, b.id, b.name, s.id, s.name, s.contact_phone, s.minimum_order_value, bsr.notes, bsr.supplier_id
        ORDER BY revenue DESC, product_count DESC, brand_name
        """,
    )


def update_brand_supplier(conn: sqlite3.Connection, payload: dict) -> dict:
    organization_id = scalar_text(payload.get("organization_id"))
    brand_id = scalar_text(payload.get("brand_id"))
    supplier_name = scalar_text(payload.get("supplier_name"))
    contact_phone = clean_phone(scalar_text(payload.get("contact_phone")))
    minimum_order_value = float(str(scalar_text(payload.get("minimum_order_value")) or "0").replace(".", "").replace(",", ".") or 0)
    if not organization_id or not brand_id or not supplier_name:
        raise ValueError("organization_id, brand_id e supplier_name sao obrigatorios.")

    brand = conn.execute(
        "SELECT id FROM brands WHERE organization_id = ? AND id = ?",
        (organization_id, brand_id),
    ).fetchone()
    if not brand:
        raise ValueError("Marca nao encontrada.")

    supplier_id = make_supplier_id(organization_id, supplier_name)
    conn.execute(
        """
        INSERT INTO suppliers
            (id, organization_id, name, normalized_name, contact_phone, minimum_order_value, order_review_cycle_days)
        VALUES (?, ?, ?, ?, ?, ?, 14)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            normalized_name = excluded.normalized_name,
            contact_phone = excluded.contact_phone,
            minimum_order_value = excluded.minimum_order_value
        """,
        (supplier_id, organization_id, supplier_name, normalize(supplier_name), contact_phone, minimum_order_value),
    )
    conn.execute(
        """
        INSERT INTO brand_supplier_rules
            (organization_id, brand_id, supplier_id, active, notes, updated_at)
        VALUES (?, ?, ?, 1, 'Configurado manualmente no Nexo.', CURRENT_TIMESTAMP)
        ON CONFLICT(organization_id, brand_id) DO UPDATE SET
            supplier_id = excluded.supplier_id,
            active = 1,
            notes = excluded.notes,
            updated_at = CURRENT_TIMESTAMP
        """,
        (organization_id, brand_id, supplier_id),
    )
    conn.execute(
        """
        UPDATE product_settings
        SET preferred_supplier_id = ?
        WHERE organization_id = ?
          AND product_id IN (
              SELECT id
              FROM products
              WHERE organization_id = ?
                AND brand_id = ?
          )
        """,
        (supplier_id, organization_id, organization_id, brand_id),
    )
    conn.commit()
    return {
        "ok": True,
        "organization_id": organization_id,
        "brand_id": brand_id,
        "supplier_id": supplier_id,
        "supplier_name": supplier_name,
        "contact_phone": contact_phone,
        "minimum_order_value": minimum_order_value,
    }


def update_supplier_profile(conn: sqlite3.Connection, payload: dict) -> dict:
    organization_id = scalar_text(payload.get("organization_id"))
    supplier_id = scalar_text(payload.get("supplier_id"))
    supplier_name = scalar_text(payload.get("supplier_name"))
    contact_phone = clean_phone(scalar_text(payload.get("contact_phone")))
    minimum_order_value = float(str(scalar_text(payload.get("minimum_order_value")) or "0").replace(".", "").replace(",", ".") or 0)
    if not organization_id or (not supplier_id and not supplier_name):
        raise ValueError("organization_id e supplier_id ou supplier_name sao obrigatorios.")
    if not supplier_id:
        supplier_id = make_supplier_id(organization_id, supplier_name)
    supplier = conn.execute(
        "SELECT id, name, contact_phone, minimum_order_value FROM suppliers WHERE organization_id = ? AND id = ?",
        (organization_id, supplier_id),
    ).fetchone()
    if not supplier:
        if not supplier_name:
            raise ValueError("Fornecedor nao encontrado.")
        conn.execute(
            """
            INSERT INTO suppliers
                (id, organization_id, name, normalized_name, contact_phone, minimum_order_value, order_review_cycle_days)
            VALUES (?, ?, ?, ?, ?, ?, 14)
            """,
            (supplier_id, organization_id, supplier_name, normalize(supplier_name), contact_phone, minimum_order_value),
        )
    else:
        supplier_name = supplier_name or supplier["name"]
        conn.execute(
            """
            UPDATE suppliers
            SET name = ?,
                normalized_name = ?,
                contact_phone = ?,
                minimum_order_value = ?
            WHERE organization_id = ?
              AND id = ?
            """,
            (supplier_name, normalize(supplier_name), contact_phone, minimum_order_value, organization_id, supplier_id),
        )
    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, 'supplier_profile_update', 'supplier', ?, '{}', ?)
        """,
        (
            organization_id,
            supplier_id,
            json.dumps({"supplier_name": supplier_name, "contact_phone": contact_phone, "minimum_order_value": minimum_order_value}, ensure_ascii=False),
        ),
    )
    conn.commit()
    return {
        "ok": True,
        "organization_id": organization_id,
        "supplier_id": supplier_id,
        "supplier_name": supplier_name,
        "contact_phone": contact_phone,
        "minimum_order_value": minimum_order_value,
    }


def update_product_mix_decision(conn: sqlite3.Connection, payload: dict) -> dict:
    organization_id = scalar_text(payload.get("organization_id"))
    product_id = scalar_text(payload.get("product_id"))
    decision = scalar_text(payload.get("decision"))
    allowed = {"drop", "force_buy", "clear"}
    if not organization_id or not product_id or decision not in allowed:
        raise ValueError("organization_id, product_id e decision valida sao obrigatorios.")
    product = conn.execute(
        "SELECT id, name FROM products WHERE organization_id = ? AND id = ?",
        (organization_id, product_id),
    ).fetchone()
    if not product:
        raise ValueError("Produto nao encontrado.")

    if decision == "drop":
        marker = "out_of_mix_permanent"
        blocked = 1
        ignored = 1
        note = "Operador decidiu retirar permanentemente da lista de compra/estoque no Nexo."
        action = "product_mix_drop"
    elif decision == "force_buy":
        marker = "force_one_more_purchase"
        blocked = 0
        ignored = 0
        note = "Operador decidiu forcar mais uma compra antes de retirar do mix."
        action = "product_mix_force_buy"
    else:
        marker = ""
        blocked = 0
        ignored = 0
        note = "Decisao de mix limpa pelo operador."
        action = "product_mix_clear"

    conn.execute(
        """
        INSERT INTO product_settings
            (organization_id, product_id, blocked_for_purchase, ignored_in_purchase_reports, marker, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, product_id) DO UPDATE SET
            blocked_for_purchase = excluded.blocked_for_purchase,
            ignored_in_purchase_reports = excluded.ignored_in_purchase_reports,
            marker = excluded.marker,
            notes = excluded.notes
        """,
        (organization_id, product_id, blocked, ignored, marker, note),
    )
    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, ?, 'product', ?, '{}', ?)
        """,
        (
            organization_id,
            action,
            product_id,
            json.dumps({"decision": decision, "marker": marker, "notes": note}, ensure_ascii=False),
        ),
    )
    if decision in {"drop", "force_buy"}:
        conn.execute(
            """
            UPDATE action_items
            SET status = 'completed',
                completed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE organization_id = ?
              AND target_type = 'product'
              AND target_id = ?
              AND action_type = 'product_mix_decision'
              AND status IN ('open', 'in_progress')
            """,
            (organization_id, product_id),
        )
    conn.commit()
    return {
        "ok": True,
        "organization_id": organization_id,
        "product_id": product_id,
        "product_name": product["name"],
        "decision": decision,
        "marker": marker,
        "blocked_for_purchase": blocked,
        "ignored_in_purchase_reports": ignored,
    }


QUOTE_STATUSES = {"urgent", "buy_now"}


def quote_candidate_rows(conn: sqlite3.Connection) -> list[dict]:
    return quote_candidate_rows_from_replenishment(api_replenishment(conn, limit=0)["rows"])


def quote_candidate_rows_from_replenishment(replenishment_rows: list[dict]) -> list[dict]:
    candidates = []
    for row in replenishment_rows:
        if row["status"] not in QUOTE_STATUSES:
            continue
        if not row["supplier_configured"] or not row["supplier_id"]:
            continue
        if float(row["suggested_quantity"] or 0) <= 0:
            continue
        candidates.append(row)
    return candidates


def quote_mix_decision_rows(conn: sqlite3.Connection) -> list[dict]:
    return quote_mix_decision_rows_from_replenishment(api_replenishment(conn, limit=0)["rows"])


def quote_mix_decision_rows_from_replenishment(replenishment_rows: list[dict]) -> list[dict]:
    return [row for row in replenishment_rows if row["status"] == "mix_review" and row["supplier_configured"] and row["supplier_id"]]


def quote_message(supplier_name: str, items: list[dict]) -> str:
    lines = [
        "Ola, tudo bem? Pode cotar os itens abaixo?",
        "",
    ]
    for index, item in enumerate(items, start=1):
        quantity = f"{float(item['suggested_quantity'] or 0):g}"
        unit = item.get("unit") or "un"
        ref = item.get("quote_code") or item.get("source_code")
        lines.append(f"{index}. Ref {ref} - {item['name']} - {quantity} {unit}")
    lines.extend(
        [
            "",
            "Por favor informar preco, disponibilidade, prazo de entrega e validade da cotacao.",
            "Obrigado.",
        ]
    )
    return "\n".join(lines)


def api_quote_drafts(conn: sqlite3.Connection) -> dict:
    replenishment_rows = api_replenishment(conn, limit=0)["rows"]
    candidates = quote_candidate_rows_from_replenishment(replenishment_rows)
    decision_items = quote_mix_decision_rows_from_replenishment(replenishment_rows)
    grouped: dict[str, dict] = {}
    for item in candidates:
        supplier_id = item["supplier_id"]
        group = grouped.setdefault(
            supplier_id,
            {
                "organization_id": item["organization_id"],
                "supplier_id": supplier_id,
                "supplier_name": item["supplier_name"],
                "contact_phone": item["supplier_phone"],
                "item_count": 0,
                "estimated_value": 0.0,
                "urgent_count": 0,
                "buy_now_count": 0,
                "mix_decision_count": 0,
                "mix_decision_items": [],
                "items": [],
            },
        )
        group["item_count"] += 1
        group["estimated_value"] += float(item["estimated_value"] or 0)
        if item["status"] == "urgent":
            group["urgent_count"] += 1
        if item["status"] == "buy_now":
            group["buy_now_count"] += 1
        group["items"].append(item)
    for item in decision_items:
        supplier_id = item["supplier_id"]
        if supplier_id not in grouped:
            continue
        group = grouped.setdefault(
            supplier_id,
            {
                "organization_id": item["organization_id"],
                "supplier_id": supplier_id,
                "supplier_name": item["supplier_name"],
                "contact_phone": item["supplier_phone"],
                "item_count": 0,
                "estimated_value": 0.0,
                "urgent_count": 0,
                "buy_now_count": 0,
                "mix_decision_count": 0,
                "mix_decision_items": [],
                "items": [],
            },
        )
        group["mix_decision_count"] += 1
        group["mix_decision_items"].append(item)

    suppliers = []
    for group in grouped.values():
        group["estimated_value"] = round(group["estimated_value"], 2)
        group["items"] = sorted(group["items"], key=lambda row: (-float(row["priority"] or 0), -float(row["estimated_value"] or 0)))[:80]
        group["mix_decision_items"] = sorted(group["mix_decision_items"], key=lambda row: (-float(row["priority"] or 0), -float(row["stock_units"] or 0)))[:40]
        group["message_preview"] = quote_message(group["supplier_name"], group["items"][:20])
        suppliers.append(group)
    suppliers.sort(key=lambda row: (-row["urgent_count"], -row["estimated_value"], -row["mix_decision_count"], row["supplier_name"]))
    return {
        "summary": {
            "supplier_count": len(suppliers),
            "item_count": sum(row["item_count"] for row in suppliers),
            "estimated_value": round(sum(row["estimated_value"] for row in suppliers), 2),
            "urgent_count": sum(row["urgent_count"] for row in suppliers),
            "mix_decision_count": sum(row["mix_decision_count"] for row in suppliers),
        },
        "suppliers": suppliers,
    }


def api_quotes(conn: sqlite3.Connection, status: str = "") -> list[dict]:
    sql = """
        SELECT
            id,
            organization_id,
            supplier_id,
            supplier_name,
            contact_phone,
            status,
            created_at,
            sent_at,
            responded_at,
            approved_at,
            cancelled_at,
            total_estimated_amount,
            item_count,
            notes,
            (SELECT po.id FROM purchase_orders po WHERE po.quote_request_id = quote_requests.id LIMIT 1) AS purchase_order_id,
            (SELECT po.status FROM purchase_orders po WHERE po.quote_request_id = quote_requests.id LIMIT 1) AS purchase_order_status,
            (SELECT po.total_amount FROM purchase_orders po WHERE po.quote_request_id = quote_requests.id LIMIT 1) AS purchase_order_total
        FROM quote_requests
    """
    params: tuple = ()
    if status:
        sql += " WHERE status = ?"
        params = (status,)
    sql += " ORDER BY created_at DESC LIMIT 80"
    return rows(conn, sql, params)


def api_quote_detail(conn: sqlite3.Connection, quote_id: str) -> dict:
    quote = one(
        conn,
        """
        SELECT *
        FROM quote_requests
        WHERE id = ?
        """,
        (quote_id,),
    )
    if not quote:
        raise ValueError("Cotacao nao encontrada.")
    quote["items"] = rows(
        conn,
        """
        SELECT *
        FROM quote_request_items
        WHERE quote_request_id = ?
        ORDER BY id
        """,
        (quote_id,),
    )
    responded_count = 0
    quoted_total = 0.0
    learned_packages = 0
    lead_times = []
    for item in quote["items"]:
        unit_price = item.get("quoted_unit_price")
        requested = float(item.get("requested_quantity") or 0)
        item["quoted_total_amount"] = round(float(unit_price or 0) * requested, 2) if unit_price is not None else None
        if unit_price is not None or item.get("availability") or item.get("quoted_lead_time_days") is not None or item.get("quoted_package_size") is not None:
            responded_count += 1
        if item["quoted_total_amount"] is not None:
            quoted_total += float(item["quoted_total_amount"] or 0)
        if float(item.get("quoted_package_size") or 0) > 1:
            learned_packages += 1
        if item.get("quoted_lead_time_days") is not None:
            lead_times.append(int(item["quoted_lead_time_days"]))
    quote["response_summary"] = {
        "responded_count": responded_count,
        "pending_count": max(len(quote["items"]) - responded_count, 0),
        "quoted_total_amount": round(quoted_total, 2),
        "learned_packages": learned_packages,
        "average_lead_time_days": round(sum(lead_times) / len(lead_times), 1) if lead_times else None,
    }
    supplier = one(
        conn,
        """
        SELECT minimum_order_value
        FROM suppliers
        WHERE id = ?
        """,
        (quote.get("supplier_id") or "",),
    )
    quote["supplier_terms"] = {
        "minimum_order_value": float(supplier.get("minimum_order_value") or 0),
    }
    order = one(
        conn,
        """
        SELECT *
        FROM purchase_orders
        WHERE quote_request_id = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (quote_id,),
    )
    if order:
        order["items"] = rows(
            conn,
            """
            SELECT *
            FROM purchase_order_items
            WHERE purchase_order_id = ?
            ORDER BY id
            """,
            (order["id"],),
        )
        quote["purchase_order"] = order
    else:
        quote["purchase_order"] = None
    return quote


def create_quote_request(conn: sqlite3.Connection, payload: dict) -> dict:
    supplier_id = scalar_text(payload.get("supplier_id"))
    if not supplier_id:
        raise ValueError("supplier_id e obrigatorio.")

    draft = None
    for group in api_quote_drafts(conn)["suppliers"]:
        if group["supplier_id"] == supplier_id:
            draft = group
            break
    if not draft:
        raise ValueError("Fornecedor sem itens prontos para cotacao.")

    selected_items = draft["items"]
    if not selected_items:
        raise ValueError("Fornecedor tem apenas decisoes de mix. Decida tirar do mix ou forcar compra antes de gerar cotacao.")
    quote_id = f"{draft['organization_id']}:quote:{datetime.now().strftime('%Y%m%d%H%M%S')}:{uuid4().hex[:8]}"
    message = quote_message(draft["supplier_name"], selected_items)
    total = round(sum(float(item["estimated_value"] or 0) for item in selected_items), 2)
    conn.execute(
        """
        INSERT INTO quote_requests
            (id, organization_id, supplier_id, supplier_name, contact_phone, status,
             total_estimated_amount, item_count, message_text, notes)
        VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)
        """,
        (
            quote_id,
            draft["organization_id"],
            draft["supplier_id"],
            draft["supplier_name"],
            draft["contact_phone"],
            total,
            len(selected_items),
            message,
            scalar_text(payload.get("notes")),
        ),
    )
    for item in selected_items:
        conn.execute(
            """
            INSERT INTO quote_request_items
                (quote_request_id, product_id, source_code, supplier_reference, quote_code,
                 product_name, unit, suggested_quantity, requested_quantity,
                 estimated_unit_cost, estimated_total_amount, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                quote_id,
                item["product_id"],
                item["source_code"],
                item["supplier_reference"],
                item["quote_code"],
                item["name"],
                item["unit"],
                item["suggested_quantity"],
                item["suggested_quantity"],
                item["unit_cost"],
                item["estimated_value"],
                item["reason"],
            ),
        )
    conn.commit()
    return api_quote_detail(conn, quote_id)


def update_quote_request(conn: sqlite3.Connection, payload: dict) -> dict:
    quote_id = scalar_text(payload.get("id"))
    status = scalar_text(payload.get("status"))
    allowed = {"draft", "sent", "responded", "approved", "cancelled"}
    if not quote_id or status not in allowed:
        raise ValueError("id e status valido sao obrigatorios.")
    timestamp_columns = {
        "sent": "sent_at",
        "responded": "responded_at",
        "approved": "approved_at",
        "cancelled": "cancelled_at",
    }
    column = timestamp_columns.get(status)
    if column:
        cursor = conn.execute(f"UPDATE quote_requests SET status = ?, {column} = CURRENT_TIMESTAMP WHERE id = ?", (status, quote_id))
    else:
        cursor = conn.execute("UPDATE quote_requests SET status = ? WHERE id = ?", (status, quote_id))
    if cursor.rowcount == 0:
        raise ValueError("Cotacao nao encontrada.")
    conn.commit()
    return api_quote_detail(conn, quote_id)


def update_quote_response(conn: sqlite3.Connection, payload: dict) -> dict:
    quote_id = scalar_text(payload.get("id"))
    item_payloads = payload.get("items") or []
    if not quote_id or not isinstance(item_payloads, list):
        raise ValueError("id da cotacao e lista de itens sao obrigatorios.")
    quote = one(conn, "SELECT * FROM quote_requests WHERE id = ?", (quote_id,))
    if not quote:
        raise ValueError("Cotacao nao encontrada.")

    availability_allowed = {"", "available", "partial", "unavailable", "no_quote"}
    updated_items = 0
    learned_items = 0
    response_items = 0
    for raw in item_payloads:
        if not isinstance(raw, dict):
            continue
        item_id = parse_int(raw.get("item_id") or raw.get("id"), None)
        if item_id is None:
            continue
        item = one(
            conn,
            """
            SELECT *
            FROM quote_request_items
            WHERE id = ?
              AND quote_request_id = ?
            """,
            (item_id, quote_id),
        )
        if not item:
            continue

        quoted_unit_price = parse_decimal(raw.get("quoted_unit_price"), None)
        quoted_package_size = parse_decimal(raw.get("quoted_package_size"), None)
        quoted_lead_time_days = parse_int(raw.get("quoted_lead_time_days"), None)
        availability = scalar_text(raw.get("availability"))[:40]
        notes = scalar_text(raw.get("notes"))[:500]
        if availability not in availability_allowed:
            raise ValueError("Disponibilidade invalida na resposta da cotacao.")
        if quoted_unit_price is not None and quoted_unit_price < 0:
            raise ValueError("Preco cotado nao pode ser negativo.")
        if quoted_package_size is not None and quoted_package_size < 0:
            raise ValueError("Embalagem/divisor nao pode ser negativo.")
        if quoted_lead_time_days is not None and quoted_lead_time_days < 0:
            raise ValueError("Prazo nao pode ser negativo.")

        conn.execute(
            """
            UPDATE quote_request_items
            SET quoted_unit_price = ?,
                quoted_package_size = ?,
                quoted_lead_time_days = ?,
                availability = ?,
                notes = ?
            WHERE id = ?
              AND quote_request_id = ?
            """,
            (
                quoted_unit_price,
                quoted_package_size,
                quoted_lead_time_days,
                availability,
                notes,
                item_id,
                quote_id,
            ),
        )
        updated_items += 1

        has_response = (
            quoted_unit_price is not None
            or (quoted_package_size is not None and quoted_package_size > 0)
            or quoted_lead_time_days is not None
            or bool(availability)
            or bool(notes)
        )
        if has_response:
            response_items += 1

        learnable = (
            quote.get("supplier_id")
            and (
                quoted_unit_price is not None
                or (quoted_package_size is not None and quoted_package_size > 1)
                or quoted_lead_time_days is not None
            )
        )
        if learnable:
            supplier_sku = item.get("supplier_reference") or item.get("quote_code") or ""
            note = "Aprendido pela resposta de cotacao."
            conn.execute(
                """
                INSERT INTO supplier_product_rules
                    (organization_id, supplier_id, product_id, supplier_sku, package_size,
                     lead_time_days, last_purchase_cost, active, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
                ON CONFLICT(organization_id, supplier_id, product_id) DO UPDATE SET
                    supplier_sku = CASE
                        WHEN excluded.supplier_sku <> '' THEN excluded.supplier_sku
                        ELSE supplier_product_rules.supplier_sku
                    END,
                    package_size = CASE
                        WHEN excluded.package_size > 1 THEN excluded.package_size
                        ELSE supplier_product_rules.package_size
                    END,
                    lead_time_days = COALESCE(excluded.lead_time_days, supplier_product_rules.lead_time_days),
                    last_purchase_cost = COALESCE(excluded.last_purchase_cost, supplier_product_rules.last_purchase_cost),
                    active = 1,
                    notes = excluded.notes
                """,
                (
                    quote["organization_id"],
                    quote["supplier_id"],
                    item["product_id"],
                    supplier_sku,
                    quoted_package_size if quoted_package_size and quoted_package_size > 1 else 1,
                    quoted_lead_time_days,
                    quoted_unit_price,
                    note,
                ),
            )
            conn.execute(
                """
                INSERT INTO product_settings
                    (organization_id, product_id, preferred_supplier_id, package_size, notes)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(organization_id, product_id) DO UPDATE SET
                    preferred_supplier_id = COALESCE(product_settings.preferred_supplier_id, excluded.preferred_supplier_id),
                    package_size = CASE
                        WHEN excluded.package_size > 1 AND COALESCE(product_settings.package_size, 1) <= 1
                        THEN excluded.package_size
                        ELSE product_settings.package_size
                    END,
                    notes = CASE
                        WHEN excluded.package_size > 1 AND COALESCE(product_settings.package_size, 1) <= 1
                        THEN excluded.notes
                        ELSE product_settings.notes
                    END
                """,
                (
                    quote["organization_id"],
                    item["product_id"],
                    quote["supplier_id"],
                    quoted_package_size if quoted_package_size and quoted_package_size > 1 else 1,
                    note,
                ),
            )
            learned_items += 1

    if updated_items == 0:
        raise ValueError("Nenhum item valido para atualizar.")

    if response_items and payload.get("mark_responded", True):
        conn.execute(
            """
            UPDATE quote_requests
            SET status = CASE WHEN status IN ('draft', 'sent') THEN 'responded' ELSE status END,
                responded_at = COALESCE(responded_at, CURRENT_TIMESTAMP)
            WHERE id = ?
            """,
            (quote_id,),
        )
        conn.execute(
            """
            UPDATE action_items
            SET status = 'completed',
                completed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE organization_id = ?
              AND target_type = 'quote'
              AND target_id = ?
              AND action_type IN ('quote_response', 'quote_send')
              AND status IN ('open', 'in_progress')
            """,
            (quote["organization_id"], quote_id),
        )

    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, 'quote_response_saved', 'quote', ?, '{}', ?)
        """,
        (
            quote["organization_id"],
            quote_id,
            json.dumps(
                {
                    "updated_items": updated_items,
                    "response_items": response_items,
                    "learned_items": learned_items,
                },
                ensure_ascii=False,
            ),
        ),
    )
    conn.commit()
    return api_quote_detail(conn, quote_id)


def api_purchase_orders(conn: sqlite3.Connection, status: str = "") -> list[dict]:
    sql = """
        SELECT
            id,
            organization_id,
            quote_request_id,
            supplier_id,
            supplier_name,
            status,
            created_at,
            approved_at,
            expected_delivery_date,
            minimum_order_value,
            minimum_order_met,
            total_amount,
            item_count,
            approved_item_count,
            notes
        FROM purchase_orders
    """
    params: tuple = ()
    if status:
        sql += " WHERE status = ?"
        params = (status,)
    sql += " ORDER BY created_at DESC LIMIT 80"
    return rows(conn, sql, params)


def close_purchase_order(conn: sqlite3.Connection, payload: dict) -> dict:
    quote_id = scalar_text(payload.get("id") or payload.get("quote_id"))
    item_payloads = payload.get("items") or []
    if not quote_id or not isinstance(item_payloads, list):
        raise ValueError("id da cotacao e lista de itens sao obrigatorios.")
    quote = one(conn, "SELECT * FROM quote_requests WHERE id = ?", (quote_id,))
    if not quote:
        raise ValueError("Cotacao nao encontrada.")
    if quote.get("status") not in {"responded", "approved"}:
        raise ValueError("Feche o pedido apenas depois de registrar a resposta da cotacao.")
    existing = one(conn, "SELECT id FROM purchase_orders WHERE organization_id = ? AND quote_request_id = ?", (quote["organization_id"], quote_id))
    if existing:
        raise ValueError("Essa cotacao ja gerou um pedido de compra.")

    quote_items = {
        int(item["id"]): item
        for item in rows(
            conn,
            """
            SELECT *
            FROM quote_request_items
            WHERE quote_request_id = ?
            ORDER BY id
            """,
            (quote_id,),
        )
    }
    if not quote_items:
        raise ValueError("Cotacao sem itens.")

    decisions = {int(parse_int(item.get("item_id") or item.get("id"), 0) or 0): item for item in item_payloads if isinstance(item, dict)}
    allowed_decisions = {"buy", "skip", "review"}
    order_id = f"{quote['organization_id']}:po:{datetime.now().strftime('%Y%m%d%H%M%S')}:{uuid4().hex[:8]}"
    supplier_terms = one(conn, "SELECT minimum_order_value FROM suppliers WHERE id = ?", (quote.get("supplier_id") or "",))
    minimum_order_value = float(supplier_terms.get("minimum_order_value") or 0)
    store_id = one(conn, "SELECT id FROM stores WHERE organization_id = ? ORDER BY id LIMIT 1", (quote["organization_id"],)).get("id") or ""
    expected_days = [
        int(item["quoted_lead_time_days"])
        for item in quote_items.values()
        if item.get("quoted_lead_time_days") is not None
    ]
    expected_delivery_date = ""
    if expected_days:
        expected_delivery_date = (date.today() + timedelta(days=max(expected_days))).isoformat()

    prepared_items = []
    total_amount = 0.0
    approved_count = 0
    for item_id, item in quote_items.items():
        raw = decisions.get(item_id, {})
        decision = scalar_text(raw.get("decision") or "")
        availability = scalar_text(item.get("availability"))
        default_decision = "skip" if availability in {"unavailable", "no_quote"} else "buy"
        if not decision:
            decision = default_decision
        if decision not in allowed_decisions:
            raise ValueError("Decisao de item invalida.")

        package_size = parse_decimal(raw.get("package_size"), None)
        if package_size is None or package_size <= 0:
            package_size = float(item.get("quoted_package_size") or 1)
        unit_price = parse_decimal(raw.get("unit_price"), None)
        if unit_price is None:
            unit_price = float(item.get("quoted_unit_price") or 0)
        final_quantity = parse_decimal(raw.get("final_quantity"), None)
        if final_quantity is None:
            final_quantity = round_to_package(float(item.get("requested_quantity") or 0), float(package_size or 1))
        if decision != "buy":
            final_quantity = 0.0
        if final_quantity < 0 or unit_price < 0 or package_size < 0:
            raise ValueError("Quantidade, preco e embalagem nao podem ser negativos.")

        item_total = round(final_quantity * unit_price, 2) if decision == "buy" else 0.0
        if decision == "buy" and final_quantity > 0:
            total_amount += item_total
            approved_count += 1
        prepared_items.append(
            {
                "quote_request_item_id": item_id,
                "product_id": item["product_id"],
                "source_code": item["source_code"],
                "supplier_reference": item.get("supplier_reference") or "",
                "quote_code": item["quote_code"],
                "product_name": item["product_name"],
                "unit": item.get("unit") or "",
                "suggested_quantity": float(item.get("suggested_quantity") or 0),
                "requested_quantity": float(item.get("requested_quantity") or 0),
                "final_quantity": round(final_quantity, 3),
                "package_size": float(package_size or 1),
                "unit_price": float(unit_price or 0),
                "total_amount": item_total,
                "decision": decision,
                "availability": availability,
                "lead_time_days": item.get("quoted_lead_time_days"),
                "reason": item.get("reason") or "",
                "notes": scalar_text(raw.get("notes") or item.get("notes"))[:500],
            }
        )

    minimum_order_met = 1 if minimum_order_value <= 0 or total_amount >= minimum_order_value else 0
    conn.execute(
        """
        INSERT INTO purchase_orders
            (id, organization_id, store_id, quote_request_id, supplier_id, supplier_name, contact_phone,
             status, approved_at, expected_delivery_date, minimum_order_value, minimum_order_met,
             total_amount, item_count, approved_item_count, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            order_id,
            quote["organization_id"],
            store_id,
            quote_id,
            quote.get("supplier_id"),
            quote["supplier_name"],
            quote.get("contact_phone") or "",
            expected_delivery_date,
            minimum_order_value,
            minimum_order_met,
            round(total_amount, 2),
            len(prepared_items),
            approved_count,
            scalar_text(payload.get("notes"))[:500],
        ),
    )
    for item in prepared_items:
        conn.execute(
            """
            INSERT INTO purchase_order_items
                (purchase_order_id, quote_request_item_id, product_id, source_code, supplier_reference,
                 quote_code, product_name, unit, suggested_quantity, requested_quantity,
                 final_quantity, package_size, unit_price, total_amount, decision, availability,
                 lead_time_days, reason, notes)
            VALUES
                (:purchase_order_id, :quote_request_item_id, :product_id, :source_code, :supplier_reference,
                 :quote_code, :product_name, :unit, :suggested_quantity, :requested_quantity,
                 :final_quantity, :package_size, :unit_price, :total_amount, :decision, :availability,
                 :lead_time_days, :reason, :notes)
            """,
            {"purchase_order_id": order_id, **item},
        )

    conn.execute(
        """
        UPDATE quote_requests
        SET status = 'approved',
            approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP)
        WHERE id = ?
        """,
        (quote_id,),
    )
    conn.execute(
        """
        UPDATE action_items
        SET status = 'completed',
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE organization_id = ?
          AND target_type = 'quote'
          AND target_id = ?
          AND action_type = 'quote_close'
          AND status IN ('open', 'in_progress')
        """,
        (quote["organization_id"], quote_id),
    )
    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, 'purchase_order_closed', 'purchase_order', ?, '{}', ?)
        """,
        (
            quote["organization_id"],
            order_id,
            json.dumps(
                {
                    "quote_request_id": quote_id,
                    "total_amount": round(total_amount, 2),
                    "approved_item_count": approved_count,
                    "minimum_order_value": minimum_order_value,
                    "minimum_order_met": bool(minimum_order_met),
                },
                ensure_ascii=False,
            ),
        ),
    )
    conn.commit()
    return api_quote_detail(conn, quote_id)


def action_item(
    organization_id: str,
    key: str,
    action_type: str,
    target_type: str,
    target_id: str,
    title: str,
    body: str,
    reason: str,
    priority: int,
    impact_label: str,
    view: str,
    estimated_value: float = 0,
    due_date: str = "",
    metadata: dict | None = None,
) -> dict:
    return {
        "id": f"{organization_id}:action:{key}:{normalize(target_id) or 'geral'}",
        "organization_id": organization_id,
        "source_kind": "generated",
        "action_type": action_type,
        "target_type": target_type,
        "target_id": target_id,
        "title": title,
        "body": body,
        "reason": reason,
        "priority": priority,
        "impact_label": impact_label,
        "estimated_value": round(float(estimated_value or 0), 2),
        "due_date": due_date,
        "view": view,
        "metadata_json": json.dumps(metadata or {}, ensure_ascii=False),
    }


def skill_action_item(
    organization_id: str,
    key: str,
    target_type: str,
    target_id: str,
    context: dict,
    estimated_value: float = 0,
    due_date: str = "",
    metadata: dict | None = None,
) -> dict:
    rule = action_rules().get(key, {})
    if not rule:
        raise ValueError(f"Regra de acao nao encontrada: {key}")
    payload_metadata = {
        **(metadata or {}),
        "skill_id": rule.get("skill_id", ""),
        "skill_label": nexo_skill_name(rule.get("skill_id", "")),
        "rule_id": key,
        "rule_version": load_json_file(NEXO_SKILLS_DIR / "action_center.json").get("version", ""),
        "template_context": context,
    }
    return action_item(
        organization_id,
        key,
        rule.get("action_type", key),
        target_type,
        target_id,
        render_skill_template(rule.get("title", ""), context),
        render_skill_template(rule.get("body", ""), context),
        render_skill_template(rule.get("reason", ""), context),
        int(rule.get("priority", 3)),
        render_skill_template(rule.get("impact", ""), context),
        rule.get("view", ""),
        estimated_value,
        due_date,
        payload_metadata,
    )


def generated_actions(conn: sqlite3.Connection) -> list[dict]:
    org = one(conn, "SELECT id FROM organizations ORDER BY created_at LIMIT 1").get("id") or "org_teste"
    today = date.today().isoformat()
    actions: list[dict] = []
    quote_draft = api_quote_drafts(conn)
    quote_groups = quote_draft.get("suppliers") or []
    quotes_open = rows(
        conn,
        """
        SELECT id, supplier_name, item_count, total_estimated_amount, status
        FROM quote_requests
        WHERE status IN ('draft', 'sent', 'responded')
        ORDER BY created_at DESC
        LIMIT 5
        """,
    )
    quotes_count = conn.execute("SELECT COUNT(*) FROM quote_requests").fetchone()[0]
    if quote_groups and not quotes_count:
        top = quote_groups[0]
        actions.append(
            skill_action_item(
                org,
                "quote_pilot",
                "supplier",
                top["supplier_id"],
                {
                    "supplier_name": top["supplier_name"],
                    "item_count": top["item_count"],
                    "urgent_count": top["urgent_count"],
                },
                top.get("estimated_value") or 0,
                today,
                {"supplier_name": top["supplier_name"], "item_count": top["item_count"]},
            )
        )
    mix_review_items = [
        item
        for group in quote_groups
        for item in (group.get("mix_decision_items") or [])
    ]
    if mix_review_items:
        item = sorted(mix_review_items, key=lambda row: (-float(row.get("priority") or 0), float(row.get("stock_units") or 0)))[0]
        actions.append(
            skill_action_item(
                org,
                "mix_review",
                "product",
                item["product_id"],
                {"product_name": item["name"]},
                item.get("estimated_value") or 0,
                today,
                {"supplier_name": item["supplier_name"], "stock_units": item["stock_units"]},
            )
        )
    for quote in quotes_open[:1]:
        if quote["status"] == "draft":
            actions.append(
                skill_action_item(
                    org,
                    "send_quote",
                    "quote",
                    quote["id"],
                    {"supplier_name": quote["supplier_name"], "item_count": quote["item_count"]},
                    quote.get("total_estimated_amount") or 0,
                    today,
                    {"supplier_name": quote["supplier_name"]},
                )
            )
        elif quote["status"] == "sent":
            actions.append(
                skill_action_item(
                    org,
                    "quote_response",
                    "quote",
                    quote["id"],
                    {"supplier_name": quote["supplier_name"], "item_count": quote["item_count"]},
                    quote.get("total_estimated_amount") or 0,
                    today,
                    {"supplier_name": quote["supplier_name"]},
                )
            )
        elif quote["status"] == "responded":
            actions.append(
                skill_action_item(
                    org,
                    "close_purchase_order",
                    "quote",
                    quote["id"],
                    {"supplier_name": quote["supplier_name"], "item_count": quote["item_count"]},
                    quote.get("total_estimated_amount") or 0,
                    today,
                    {"supplier_name": quote["supplier_name"]},
                )
            )

    supplier_rows = api_brand_suppliers(conn)
    supplier_seen: set[str] = set()
    missing_minimum: list[dict] = []
    inferred_rules = 0
    for row in supplier_rows:
        if row.get("supplier_rule_origin") == "inferred":
            inferred_rules += 1
        sid = row.get("supplier_id") or row.get("supplier_name") or ""
        if not sid or sid in supplier_seen:
            continue
        supplier_seen.add(sid)
        if float(row.get("minimum_order_value") or 0) <= 0:
            missing_minimum.append(row)
    missing_minimum.sort(key=lambda item: -float(item.get("revenue") or 0))
    if missing_minimum:
        supplier = missing_minimum[0]
        actions.append(
            skill_action_item(
                org,
                "supplier_minimum",
                "supplier",
                supplier.get("supplier_id") or supplier.get("supplier_name") or "",
                {"supplier_name": supplier["supplier_name"], "product_count": supplier["product_count"]},
                0,
                "",
                {"supplier_name": supplier["supplier_name"], "brand_name": supplier["brand_name"], "revenue_context": round(float(supplier.get("revenue") or 0), 2)},
            )
        )
    if inferred_rules:
        top_inferred = next((row for row in supplier_rows if row.get("supplier_rule_origin") == "inferred"), supplier_rows[0] if supplier_rows else {})
        actions.append(
            skill_action_item(
                org,
                "confirm_brand_supplier",
                "brand",
                top_inferred.get("brand_id") or "",
                {
                    "inferred_rules": inferred_rules,
                    "brand_name": top_inferred.get("brand_name") or "uma marca relevante",
                },
                0,
                "",
                {"brand_name": top_inferred.get("brand_name"), "supplier_name": top_inferred.get("supplier_name"), "revenue_context": round(float(top_inferred.get("revenue") or 0), 2)},
            )
        )

    commercial = api_commercial_intelligence(conn)
    risk = commercial.get("risk_customers") or []
    due = commercial.get("repurchase_opportunities") or []
    drops = [row for row in (commercial.get("product_momentum") or []) if float(row.get("delta_revenue") or 0) < 0]
    if risk:
        customer = risk[0]
        actions.append(
            skill_action_item(
                org,
                "customer_risk",
                "customer",
                customer["id"],
                {
                    "customer_name": customer["name"],
                    "days_since": customer["days_since"],
                    "risk_score": customer["risk_score"],
                    "reason": customer["reason"],
                },
                customer.get("revenue") or 0,
                today,
                {"customer_name": customer["name"], "last_purchase": customer["last_purchase"]},
            )
        )
    if due:
        customer = due[0]
        actions.append(
            skill_action_item(
                org,
                "customer_due",
                "customer",
                customer["id"],
                {"customer_name": customer["name"]},
                customer.get("revenue") or 0,
                "",
                {"customer_name": customer["name"], "estimated_next_purchase": customer["estimated_next_purchase"]},
            )
        )
    if drops:
        product = sorted(drops, key=lambda item: float(item.get("delta_revenue") or 0))[0]
        actions.append(
            skill_action_item(
                org,
                "product_drop",
                "product",
                product["entity_id"],
                {
                    "product_name": product["name"],
                    "delta_revenue_abs": f"{abs(float(product['delta_revenue'] or 0)):.2f}",
                },
                abs(float(product.get("delta_revenue") or 0)),
                "",
                {"product_name": product["name"], "trend_pct": product["trend_pct"]},
            )
        )
    return actions[:10]


def upsert_generated_actions(conn: sqlite3.Connection, actions: list[dict]) -> None:
    for action in actions:
        conn.execute(
            """
            INSERT INTO action_items
                (id, organization_id, source_kind, action_type, target_type, target_id,
                 title, body, reason, priority, impact_label, estimated_value, due_date,
                 view, metadata_json)
            VALUES
                (:id, :organization_id, :source_kind, :action_type, :target_type, :target_id,
                 :title, :body, :reason, :priority, :impact_label, :estimated_value, :due_date,
                 :view, :metadata_json)
            ON CONFLICT(id) DO UPDATE SET
                source_kind = excluded.source_kind,
                action_type = excluded.action_type,
                target_type = excluded.target_type,
                target_id = excluded.target_id,
                title = excluded.title,
                body = excluded.body,
                reason = excluded.reason,
                priority = excluded.priority,
                impact_label = excluded.impact_label,
                estimated_value = excluded.estimated_value,
                due_date = excluded.due_date,
                view = excluded.view,
                metadata_json = excluded.metadata_json,
                status = CASE WHEN action_items.status IN ('superseded', 'completed') THEN 'open' ELSE action_items.status END,
                updated_at = CURRENT_TIMESTAMP
            """,
            action,
        )
    current_ids = [action["id"] for action in actions]
    if current_ids:
        placeholders = ",".join("?" for _ in current_ids)
        conn.execute(
            f"""
            UPDATE action_items
            SET status = 'superseded',
                updated_at = CURRENT_TIMESTAMP
            WHERE source_kind = 'generated'
              AND status IN ('open', 'in_progress')
              AND id NOT IN ({placeholders})
            """,
            tuple(current_ids),
        )
    conn.commit()


def action_rows(conn: sqlite3.Connection, where: str = "1 = 1", params: tuple = ()) -> list[dict]:
    result = rows(
        conn,
        f"""
        SELECT
            id, organization_id, source_kind, action_type, target_type, target_id,
            title, body, reason, status, priority, impact_label, estimated_value,
            due_date, view, metadata_json, created_at, updated_at, completed_at, ignored_at
        FROM action_items
        WHERE {where}
        ORDER BY
            CASE status WHEN 'in_progress' THEN 0 WHEN 'open' THEN 1 ELSE 2 END,
            priority,
            estimated_value DESC,
            created_at DESC
        LIMIT 50
        """,
        params,
    )
    for row in result:
        try:
            row["metadata"] = json.loads(row.get("metadata_json") or "{}")
        except json.JSONDecodeError:
            row["metadata"] = {}
    return result


def api_actions_today(conn: sqlite3.Connection) -> dict:
    upsert_generated_actions(conn, generated_actions(conn))
    summary = one(
        conn,
        """
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'ignored' THEN 1 ELSE 0 END) AS ignored,
            ROUND(SUM(CASE WHEN status IN ('open', 'in_progress') THEN estimated_value ELSE 0 END), 2) AS open_estimated_value
        FROM action_items
        WHERE status <> 'superseded'
        """
    )
    open_actions = action_rows(conn, "status IN ('open', 'in_progress')")
    done_actions = action_rows(conn, "status IN ('completed', 'ignored')")
    return {"summary": summary, "actions": open_actions[:12], "history": done_actions[:8]}


def update_action_status(conn: sqlite3.Connection, payload: dict) -> dict:
    action_id = scalar_text(payload.get("id"))
    status = scalar_text(payload.get("status"))
    notes = scalar_text(payload.get("notes"))
    allowed = {"open", "in_progress", "completed", "ignored"}
    if not action_id or status not in allowed:
        raise ValueError("id e status valido sao obrigatorios.")
    timestamp_sql = {
        "completed": ", completed_at = CURRENT_TIMESTAMP, ignored_at = NULL",
        "ignored": ", ignored_at = CURRENT_TIMESTAMP, completed_at = NULL",
        "open": ", completed_at = NULL, ignored_at = NULL",
        "in_progress": "",
    }[status]
    row = conn.execute(
        "SELECT organization_id, action_type, target_type, target_id, metadata_json FROM action_items WHERE id = ?",
        (action_id,),
    ).fetchone()
    if not row:
        raise ValueError("Acao nao encontrada.")
    try:
        metadata = json.loads(row["metadata_json"] or "{}")
    except json.JSONDecodeError:
        metadata = {}
    if status == "completed" and row["action_type"] == "supplier_config":
        supplier_id = row["target_id"]
        supplier = conn.execute(
            "SELECT minimum_order_value FROM suppliers WHERE organization_id = ? AND id = ?",
            (row["organization_id"], supplier_id),
        ).fetchone()
        if not supplier or float(supplier["minimum_order_value"] or 0) <= 0:
            raise ValueError("Preencha o pedido minimo desse fornecedor antes de concluir a acao.")
    if notes:
        metadata["last_note"] = notes
    conn.execute(
        f"""
        UPDATE action_items
        SET status = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP {timestamp_sql}
        WHERE id = ?
        """,
        (status, json.dumps(metadata, ensure_ascii=False), action_id),
    )
    conn.commit()
    return {"ok": True, "action": action_rows(conn, "id = ?", (action_id,))[0]}


class AppHandler(BaseHTTPRequestHandler):
    db_path: Path

    def send_json(self, payload: object, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or "0")
        if length <= 0:
            return {}
        body = self.rfile.read(length).decode("utf-8")
        return json.loads(body or "{}")

    def send_file(self, path: Path) -> None:
        if not path.exists() or not path.is_file():
            self.send_error(404)
            return
        body = path.read_bytes()
        content_type = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        route = parsed.path
        query = parse_qs(parsed.query)
        if route.startswith("/api/"):
            conn = connect(self.db_path)
            try:
                period = resolve_period(conn, query, 180)
                if route == "/api/summary":
                    self.send_json(api_summary(conn, period))
                elif route == "/api/intelligence/maturity":
                    self.send_json(api_maturity(conn))
                elif route == "/api/nexo/skills":
                    self.send_json(api_nexo_skills())
                elif route == "/api/products/top":
                    self.send_json(api_top_products(conn, period))
                elif route == "/api/products/stock":
                    self.send_json(api_stock(conn))
                elif route == "/api/replenishment":
                    self.send_json(api_replenishment(conn, period=period))
                elif route == "/api/commercial/intelligence":
                    self.send_json(api_commercial_intelligence(conn, period))
                elif route == "/api/actions/today":
                    self.send_json(api_actions_today(conn))
                elif route == "/api/customers/top":
                    self.send_json(api_customers(conn, period))
                elif route == "/api/services/top":
                    self.send_json(api_services(conn, period))
                elif route == "/api/imports":
                    self.send_json(api_imports(conn))
                elif route == "/api/suppliers/brands":
                    self.send_json(api_brand_suppliers(conn))
                elif route == "/api/pricing":
                    self.send_json(api_pricing(conn, period))
                elif route == "/api/quotes/draft":
                    self.send_json(api_quote_drafts(conn))
                elif route == "/api/quotes":
                    self.send_json(api_quotes(conn, scalar_text(query.get("status"))))
                elif route == "/api/quote":
                    self.send_json(api_quote_detail(conn, scalar_text(query.get("id"))))
                elif route == "/api/purchase-orders":
                    self.send_json(api_purchase_orders(conn, scalar_text(query.get("status"))))
                else:
                    self.send_error(404)
            finally:
                conn.close()
            return

        if route == "/":
            self.send_file(WEB_DIR / "index.html")
            return
        target = (WEB_DIR / route.lstrip("/")).resolve()
        if WEB_DIR.resolve() not in target.parents and target != WEB_DIR.resolve():
            self.send_error(403)
            return
        self.send_file(target)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        route = parsed.path
        if route not in {"/api/suppliers/brand", "/api/suppliers/profile", "/api/products/mix-decision", "/api/pricing/product", "/api/quotes/create", "/api/quotes/status", "/api/quotes/response", "/api/purchase-orders/close", "/api/actions/status"}:
            self.send_error(404)
            return
        conn = connect(self.db_path)
        try:
            try:
                payload = self.read_json()
                if route == "/api/suppliers/brand":
                    self.send_json(update_brand_supplier(conn, payload))
                elif route == "/api/suppliers/profile":
                    self.send_json(update_supplier_profile(conn, payload))
                elif route == "/api/products/mix-decision":
                    self.send_json(update_product_mix_decision(conn, payload))
                elif route == "/api/pricing/product":
                    self.send_json(update_product_pricing(conn, payload))
                elif route == "/api/quotes/create":
                    self.send_json(create_quote_request(conn, payload))
                elif route == "/api/quotes/status":
                    self.send_json(update_quote_request(conn, payload))
                elif route == "/api/quotes/response":
                    self.send_json(update_quote_response(conn, payload))
                elif route == "/api/purchase-orders/close":
                    self.send_json(close_purchase_order(conn, payload))
                elif route == "/api/actions/status":
                    self.send_json(update_action_status(conn, payload))
            except (json.JSONDecodeError, ValueError, TypeError, AttributeError) as exc:
                self.send_json({"ok": False, "error": str(exc)}, status=400)
        finally:
            conn.close()

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve o app local NexoVarejo.")
    parser.add_argument("--db", default="data/nexovarejo.db")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8010)
    args = parser.parse_args()
    AppHandler.db_path = Path(args.db)
    server = ThreadingHTTPServer((args.host, args.port), AppHandler)
    print(f"NexoVarejo em http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
