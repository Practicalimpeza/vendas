from __future__ import annotations

import sqlite3

from action_center import api_actions_today, update_action_status
from api_contracts import api_health
from app_config import app_public_config
from commercial import api_commercial_intelligence, api_customer_mix, api_customers, api_sales, api_services
from company_profile import api_company_profile, update_company_profile
from customer_catalog import (
    api_customer_catalog,
    api_products_search,
    archive_customer_catalog_item,
    upsert_customer_catalog,
    upsert_customer_catalog_item,
    upsert_product_media,
)
from customer_crm import api_customer_crm, upsert_customer_crm
from db_helpers import parse_int, scalar_text
from erp_import_flow import api_erp_import_commit, api_erp_import_preview, api_import_reference_folder, api_import_refresh_local, api_imports
from installation_state import api_installation_state
from nexo_skills_runtime import api_nexo_skills
from onboarding import api_onboarding
from operational_decisions import record_operational_decision, record_quick_action
from pricing import api_pricing, update_product_pricing
from product_views import (
    api_maturity,
    api_product_detail,
    api_summary,
    api_top_products,
    upsert_product_profile,
    update_product_purchase_settings,
    update_product_supplier_reference,
)
from quote_cache import cached_api_payload, invalidate_runtime_caches, replenishment_v2_payload
from quotes import (
    api_purchase_order_detail,
    api_purchase_orders,
    api_quote_detail,
    api_quote_drafts,
    api_quotes,
    api_supplier_workbench,
    api_supplier_workbench_list,
    confirm_purchase_order,
    create_quote_request,
    discard_pending_purchase_order,
    export_quote_pdf,
    generate_purchase_order_from_quote,
    receive_purchase_order,
    update_pending_purchase_order,
    update_quote_request,
    update_quote_response,
    upsert_quote_item,
)
from relationship_imports import api_link_commit, api_link_inspect, api_link_preview
from replenishment import api_replenishment, api_stock
from replenishment_v2 import api_replenishment_v2_compare
from sales_orders import export_sales_order_pdf
from supplier_ops import (
    api_brand_suppliers,
    update_brand_supplier,
    update_product_mix_decision,
    update_products_mix_decision_bulk,
    update_supplier_profile,
)
from whatsapp_crm import (
    api_whatsapp_conversation_detail,
    api_whatsapp_conversations,
    send_whatsapp_message,
    update_whatsapp_conversation,
    upsert_whatsapp_agent,
)


CACHEABLE_GET_ROUTES = {
    "/api/summary",
    "/api/intelligence/maturity",
    "/api/products/top",
    "/api/replenishment",
    "/api/replenishment-v2",
    "/api/replenishment-v2/compare",
    "/api/commercial/intelligence",
    "/api/sales",
    "/api/actions/today",
    "/api/customers/top",
    "/api/services/top",
    "/api/suppliers/brands",
    "/api/pricing",
    "/api/quotes/draft",
    "/api/supplier-workbench/suppliers",
    "/api/supplier-workbench",
    "/api/purchase-orders",
}


def cache_params_for_route(route: str, query: dict, period: dict) -> object:
    if route in {
        "/api/intelligence/maturity",
        "/api/actions/today",
        "/api/suppliers/brands",
        "/api/quotes/draft",
        "/api/supplier-workbench/suppliers",
    }:
        return {}
    if route == "/api/supplier-workbench":
        return {
            "supplier_id": scalar_text(query.get("supplier_id")),
            "window_days": parse_int(scalar_text(query.get("window_days")), 90) or 90,
        }
    if route == "/api/purchase-orders":
        return {"status": scalar_text(query.get("status"))}
    return {"query": query, "period": period}


def get_api_payload(route: str, conn: sqlite3.Connection, query: dict, period: dict) -> object:
    handlers = {
        "/api/app-config": app_public_config,
        "/api/installation": api_installation_state,
        "/api/onboarding": lambda: api_onboarding(conn),
        "/api/health": lambda: api_health(conn),
        "/api/summary": lambda: api_summary(conn, period),
        "/api/intelligence/maturity": lambda: api_maturity(conn),
        "/api/nexo/skills": api_nexo_skills,
        "/api/products/top": lambda: api_top_products(conn, period),
        "/api/products/search": lambda: api_products_search(
            conn,
            scalar_text(query.get("q") or query.get("query")),
            parse_int(scalar_text(query.get("limit")), 30) or 30,
        ),
        "/api/products/stock": lambda: api_stock(conn),
        "/api/product": lambda: api_product_detail(conn, scalar_text(query.get("id"))),
        "/api/replenishment": lambda: api_replenishment(conn, period=period),
        "/api/replenishment-v2": lambda: replenishment_v2_payload(conn, period=period),
        "/api/replenishment-v2/compare": lambda: api_replenishment_v2_compare(conn, period=period),
        "/api/commercial/intelligence": lambda: api_commercial_intelligence(conn, period),
        "/api/sales": lambda: api_sales(conn, period, parse_int(scalar_text(query.get("limit")), 1000) or 1000),
        "/api/actions/today": lambda: api_actions_today(conn),
        "/api/customers/top": lambda: api_customers(conn, period),
        "/api/customer/mix": lambda: api_customer_mix(conn, scalar_text(query.get("id")), period),
        "/api/customer/crm": lambda: api_customer_crm(conn, scalar_text(query.get("id"))),
        "/api/customer/catalog": lambda: api_customer_catalog(conn, scalar_text(query.get("id")), period),
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
        "/api/whatsapp/conversations": lambda: api_whatsapp_conversations(conn),
        "/api/whatsapp/conversation": lambda: api_whatsapp_conversation_detail(conn, scalar_text(query.get("id"))),
    }
    if route not in handlers:
        raise KeyError(route)
    if route in CACHEABLE_GET_ROUTES:
        return cached_api_payload(conn, route, cache_params_for_route(route, query, period), handlers[route])
    return handlers[route]()


def post_api_payload(route: str, conn: sqlite3.Connection, payload: dict) -> object:
    handlers = {
        "/api/erp/import-preview": api_erp_import_preview,
        "/api/erp/import-commit": api_erp_import_commit,
        "/api/imports/reference-folder": api_import_reference_folder,
        "/api/imports/refresh-local": api_import_refresh_local,
        "/api/links/inspect": api_link_inspect,
        "/api/links/preview": api_link_preview,
        "/api/links/commit": api_link_commit,
        "/api/suppliers/brand": update_brand_supplier,
        "/api/suppliers/profile": update_supplier_profile,
        "/api/products/mix-decision": update_product_mix_decision,
        "/api/products/mix-decision-bulk": update_products_mix_decision_bulk,
        "/api/products/upsert": upsert_product_profile,
        "/api/product/media/upsert": upsert_product_media,
        "/api/products/purchase-settings": update_product_purchase_settings,
        "/api/products/supplier-reference": update_product_supplier_reference,
        "/api/customer/catalog/upsert": upsert_customer_catalog,
        "/api/customer/catalog/item/upsert": upsert_customer_catalog_item,
        "/api/customer/catalog/item/delete": archive_customer_catalog_item,
        "/api/customer/crm/upsert": upsert_customer_crm,
        "/api/company-profile": update_company_profile,
        "/api/pricing/product": update_product_pricing,
        "/api/quotes/create": create_quote_request,
        "/api/quote-item/upsert": upsert_quote_item,
        "/api/quotes/status": update_quote_request,
        "/api/quotes/response": update_quote_response,
        "/api/quotes/generate-order": generate_purchase_order_from_quote,
        "/api/purchase-orders/update": update_pending_purchase_order,
        "/api/purchase-orders/confirm": confirm_purchase_order,
        "/api/purchase-orders/discard": discard_pending_purchase_order,
        "/api/purchase-orders/receive": receive_purchase_order,
        "/api/actions/status": update_action_status,
        "/api/quick-actions": record_quick_action,
        "/api/operational-decisions": record_operational_decision,
        "/api/whatsapp/conversations/update": update_whatsapp_conversation,
        "/api/whatsapp/messages/send": send_whatsapp_message,
        "/api/whatsapp/agents/upsert": upsert_whatsapp_agent,
    }
    if route not in handlers:
        raise KeyError(route)
    result = handlers[route](conn, payload)
    invalidate_runtime_caches()
    return result


def get_quote_pdf(conn: sqlite3.Connection, query: dict) -> tuple[str, bytes]:
    return export_quote_pdf(conn, scalar_text(query.get("id")))


def post_sales_order_pdf(conn: sqlite3.Connection, payload: dict) -> tuple[str, bytes]:
    return export_sales_order_pdf(conn, payload)
