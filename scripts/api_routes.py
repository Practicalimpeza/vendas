from __future__ import annotations

import sqlite3

from action_center import api_actions_today, update_action_status
from api_contracts import api_health
from commercial import api_commercial_intelligence, api_customers, api_services
from company_profile import api_company_profile, update_company_profile
from db_helpers import parse_int, scalar_text
from erp_import_flow import api_erp_import_commit, api_erp_import_preview, api_imports
from nexo_skills_runtime import api_nexo_skills
from operational_decisions import record_operational_decision, record_quick_action
from pricing import api_pricing, update_product_pricing
from product_views import (
    api_maturity,
    api_product_detail,
    api_summary,
    api_top_products,
    update_product_supplier_reference,
)
from quotes import (
    api_purchase_order_detail,
    api_purchase_orders,
    api_quote_detail,
    api_quote_drafts,
    api_quotes,
    api_supplier_workbench,
    api_supplier_workbench_list,
    close_purchase_order,
    create_quote_request,
    export_quote_pdf,
    receive_purchase_order,
    update_quote_request,
    update_quote_response,
    upsert_quote_item,
)
from relationship_imports import api_link_commit, api_link_inspect, api_link_preview
from replenishment import api_replenishment, api_stock
from supplier_ops import (
    api_brand_suppliers,
    update_brand_supplier,
    update_product_mix_decision,
    update_products_mix_decision_bulk,
    update_supplier_profile,
)


def get_api_payload(route: str, conn: sqlite3.Connection, query: dict, period: dict) -> object:
    handlers = {
        "/api/health": lambda: api_health(conn),
        "/api/summary": lambda: api_summary(conn, period),
        "/api/intelligence/maturity": lambda: api_maturity(conn),
        "/api/nexo/skills": api_nexo_skills,
        "/api/products/top": lambda: api_top_products(conn, period),
        "/api/products/stock": lambda: api_stock(conn),
        "/api/product": lambda: api_product_detail(conn, scalar_text(query.get("id"))),
        "/api/replenishment": lambda: api_replenishment(conn, period=period),
        "/api/commercial/intelligence": lambda: api_commercial_intelligence(conn, period),
        "/api/actions/today": lambda: api_actions_today(conn),
        "/api/customers/top": lambda: api_customers(conn, period),
        "/api/services/top": lambda: api_services(conn, period),
        "/api/imports": lambda: api_imports(conn),
        "/api/company-profile": lambda: api_company_profile(conn),
        "/api/suppliers/brands": lambda: api_brand_suppliers(conn),
        "/api/pricing": lambda: api_pricing(conn, period),
        "/api/quotes/draft": lambda: api_quote_drafts(conn),
        "/api/supplier-workbench/suppliers": lambda: api_supplier_workbench_list(conn),
        "/api/supplier-workbench": lambda: api_supplier_workbench(
            conn,
            scalar_text(query.get("supplier_id")),
            parse_int(scalar_text(query.get("window_days")), 90) or 90,
        ),
        "/api/quotes": lambda: api_quotes(conn, scalar_text(query.get("status"))),
        "/api/quote": lambda: api_quote_detail(conn, scalar_text(query.get("id"))),
        "/api/purchase-orders": lambda: api_purchase_orders(conn, scalar_text(query.get("status"))),
        "/api/purchase-order": lambda: api_purchase_order_detail(conn, scalar_text(query.get("id"))),
    }
    if route not in handlers:
        raise KeyError(route)
    return handlers[route]()


def post_api_payload(route: str, conn: sqlite3.Connection, payload: dict) -> object:
    handlers = {
        "/api/erp/import-preview": api_erp_import_preview,
        "/api/erp/import-commit": api_erp_import_commit,
        "/api/links/inspect": api_link_inspect,
        "/api/links/preview": api_link_preview,
        "/api/links/commit": api_link_commit,
        "/api/suppliers/brand": update_brand_supplier,
        "/api/suppliers/profile": update_supplier_profile,
        "/api/products/mix-decision": update_product_mix_decision,
        "/api/products/mix-decision-bulk": update_products_mix_decision_bulk,
        "/api/products/supplier-reference": update_product_supplier_reference,
        "/api/company-profile": update_company_profile,
        "/api/pricing/product": update_product_pricing,
        "/api/quotes/create": create_quote_request,
        "/api/quote-item/upsert": upsert_quote_item,
        "/api/quotes/status": update_quote_request,
        "/api/quotes/response": update_quote_response,
        "/api/purchase-orders/close": close_purchase_order,
        "/api/purchase-orders/receive": receive_purchase_order,
        "/api/actions/status": update_action_status,
        "/api/quick-actions": record_quick_action,
        "/api/operational-decisions": record_operational_decision,
    }
    if route not in handlers:
        raise KeyError(route)
    return handlers[route](conn, payload)


def get_quote_pdf(conn: sqlite3.Connection, query: dict) -> tuple[str, bytes]:
    return export_quote_pdf(conn, scalar_text(query.get("id")))
