from __future__ import annotations

import sqlite3


REQUIRED_HEALTH_TABLES = {
    "products",
    "product_sales",
    "schema_migrations",
    "quote_requests",
    "quote_request_items",
    "purchase_orders",
    "purchase_order_items",
    "import_batches",
    "action_items",
}

COVERED_CONTRACTS = [
    "summary.v1",
    "replenishment.v1",
    "pricing.v1",
    "supplier_workbench_suppliers.v1",
    "supplier_workbench.v1",
    "quote_detail.v1",
    "purchase_order_detail.v1",
    "imports.v1",
]


def api_health(conn: sqlite3.Connection) -> dict:
    present = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ({})".format(
                ",".join("?" for _ in REQUIRED_HEALTH_TABLES)
            ),
            tuple(sorted(REQUIRED_HEALTH_TABLES)),
        ).fetchall()
    }
    missing = sorted(REQUIRED_HEALTH_TABLES - present)
    return {
        "contract": "health.v1",
        "ok": not missing,
        "checks": {
            "database": "ok" if not missing else "blocked",
            "schema": "ok" if not missing else "missing_tables",
            "api_contracts": "ok",
        },
        "schema": {
            "required_tables": sorted(REQUIRED_HEALTH_TABLES),
            "missing_tables": missing,
        },
        "contracts": COVERED_CONTRACTS,
    }


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def require_keys(payload: dict, keys: set[str], label: str) -> None:
    missing = sorted(keys - set(payload))
    check(not missing, f"{label} sem chaves obrigatorias: {missing}")


def require_row_keys(rows: list[dict], keys: set[str], label: str) -> None:
    check(isinstance(rows, list), f"{label} deveria retornar rows como lista.")
    if rows:
        require_keys(rows[0], keys, f"{label}.rows[0]")


def assert_summary_contract(payload: dict) -> None:
    require_keys(payload, {"contract", "period", "kpis", "monthly", "monthly_granularity", "tasks"}, "summary.v1")
    check(payload["contract"] == "summary.v1", "Contrato de /api/summary mudou sem nova versao.")
    require_keys(
        payload["kpis"],
        {"products", "customers", "product_revenue", "service_revenue", "stock_units", "open_tasks"},
        "summary.v1.kpis",
    )
    require_keys(payload["period"], {"date_from", "date_to", "period_days", "label"}, "summary.v1.period")
    check(payload["monthly_granularity"] in {"day", "month"}, "summary.v1.monthly_granularity invalida.")
    require_row_keys(payload["monthly"], {"month", "product_revenue", "service_revenue"}, "summary.v1.monthly")


def assert_replenishment_contract(payload: dict) -> None:
    require_keys(payload, {"contract", "period", "summary", "rows"}, "replenishment.v1")
    check(payload["contract"] == "replenishment.v1", "Contrato de /api/replenishment mudou sem nova versao.")
    require_keys(payload["period"], {"date_from", "date_to", "period_days", "label"}, "replenishment.v1.period")
    require_keys(
        payload["summary"],
        {
            "reference_date",
            "observed_days",
            "buy_now",
            "mix_review",
            "watch",
            "excess",
            "no_demand",
            "out_of_current_mix",
            "critical_a",
            "suggested_units",
            "estimated_value",
        },
        "replenishment.v1.summary",
    )
    require_row_keys(
        payload["rows"],
        {
            "product_id",
            "organization_id",
            "source_code",
            "quote_code",
            "name",
            "unit",
            "abc_class",
            "status",
            "status_label",
            "stock_units",
            "open_order_quantity",
            "open_order_value",
            "open_order_count",
            "projected_stock_units",
            "demand_30",
            "demand_90",
            "demand_180",
            "projected_coverage_days",
            "suggested_quantity",
            "estimated_value",
            "supplier_id",
            "supplier_name",
            "supplier_configured",
            "reason",
        },
        "replenishment.v1",
    )


def assert_supplier_workbench_contract(payload: dict) -> None:
    require_keys(payload, {"contract", "supplier", "current_quote", "quote_history", "window_days", "rows", "totals"}, "supplier_workbench.v1")
    check(payload["contract"] == "supplier_workbench.v1", "Contrato de /api/supplier-workbench mudou sem nova versao.")
    require_keys(payload["supplier"], {"id", "name", "contact_phone", "minimum_order_value", "target_order_value", "lead_time_days"}, "supplier_workbench.v1.supplier")
    require_keys(payload["totals"], {"items_in_quote", "estimated_value_in_quote", "total_products", "alerts_count"}, "supplier_workbench.v1.totals")
    require_row_keys(
        payload["rows"],
        {
            "product_id",
            "organization_id",
            "source_code",
            "supplier_reference",
            "name",
            "unit",
            "purchase_unit",
            "purchase_package_size",
            "package_size",
            "stock_units",
            "demand_window",
            "avg_daily_window",
            "suggested_quantity",
            "cost_no_tax",
            "cost_with_tax",
            "status",
            "mix_status",
            "in_quote",
            "quote_quantity",
            "quote_coverage_target_days",
            "quote_notes",
            "alerts",
            "reason",
        },
        "supplier_workbench.v1",
    )


def assert_supplier_workbench_suppliers_contract(payload: list[dict]) -> None:
    require_row_keys(
        payload,
        {
            "supplier_id",
            "supplier_name",
            "contact_phone",
            "minimum_order_value",
            "target_order_value",
            "active_skus",
            "buy_now_count",
            "urgent_count",
            "out_of_mix_count",
            "alert_count",
            "open_quote_count",
            "latest_quote_at",
            "latest_quote_id",
            "estimated_value",
        },
        "supplier_workbench_suppliers.v1",
    )


def assert_pricing_contract(payload: dict) -> None:
    require_keys(payload, {"contract", "period", "summary", "rows"}, "pricing.v1")
    check(payload["contract"] == "pricing.v1", "Contrato de /api/pricing mudou sem nova versao.")
    require_keys(payload["period"], {"date_from", "date_to", "period_days", "label"}, "pricing.v1.period")
    require_keys(payload["summary"], {"products", "negative_margin", "low_margin", "missing_cost", "opportunities", "period_label"}, "pricing.v1.summary")
    require_row_keys(
        payload["rows"],
        {
            "product_id",
            "organization_id",
            "source_code",
            "name",
            "quantity",
            "revenue",
            "sale_price",
            "effective_cost",
            "cost_origin",
            "product_role",
            "signal",
            "signal_label",
            "severity",
            "min_margin_pct",
            "role_label",
            "reason",
            "target_price",
            "suggested_price_delta",
            "nexo_action",
        },
        "pricing.v1",
    )


def assert_customers_top_contract(payload: list[dict]) -> None:
    require_row_keys(payload, {"name", "purchases", "last_purchase", "revenue"}, "customers_top.v1")


def assert_products_top_contract(payload: list[dict]) -> None:
    require_row_keys(
        payload,
        {"id", "organization_id", "source_code", "name", "brand_name", "supplier_id", "supplier_name", "quantity", "revenue", "share"},
        "products_top.v1",
    )


def assert_services_top_contract(payload: list[dict]) -> None:
    require_row_keys(payload, {"name", "quantity", "revenue", "net_revenue"}, "services_top.v1")


def assert_commercial_intelligence_contract(payload: dict) -> None:
    require_keys(
        payload,
        {
            "contract",
            "period",
            "summary",
            "risk_customers",
            "repurchase_opportunities",
            "champions",
            "product_momentum",
            "brand_momentum",
            "explanations",
        },
        "commercial_intelligence.v1",
    )
    check(payload["contract"] == "commercial_intelligence.v1", "Contrato de /api/commercial/intelligence mudou sem nova versao.")
    require_keys(payload["period"], {"date_from", "date_to", "period_days", "label"}, "commercial_intelligence.v1.period")
    require_keys(
        payload["summary"],
        {
            "customers",
            "revenue",
            "at_risk_customers",
            "at_risk_revenue",
            "due_customers",
            "due_revenue",
            "growth_products",
            "drop_products",
            "last_sale_date",
            "period_label",
        },
        "commercial_intelligence.v1.summary",
    )
    require_row_keys(
        payload["product_momentum"],
        {"entity_id", "name", "recent_revenue", "previous_revenue", "delta_revenue", "recent_quantity", "trend_pct"},
        "commercial_intelligence.v1.product_momentum",
    )


def assert_actions_today_contract(payload: dict) -> None:
    require_keys(payload, {"contract", "summary", "actions", "history", "pulse", "intelligence", "timeline"}, "actions_today.v1")
    check(payload["contract"] == "actions_today.v1", "Contrato de /api/actions/today mudou sem nova versao.")
    require_keys(payload["summary"], {"total", "open", "in_progress", "completed", "ignored", "open_estimated_value"}, "actions_today.v1.summary")
    require_row_keys(payload["actions"], {"id", "action_type", "target_type", "title", "body", "status", "priority"}, "actions_today.v1.actions")


def assert_health_contract(payload: dict) -> None:
    require_keys(payload, {"contract", "ok", "checks", "schema", "contracts"}, "health.v1")
    check(payload["contract"] == "health.v1", "Contrato de /api/health mudou sem nova versao.")
    check(payload["ok"] is True, "Health check deveria estar ok no banco de smoke.")
    require_keys(payload["checks"], {"database", "schema", "api_contracts"}, "health.v1.checks")
    require_keys(payload["schema"], {"required_tables", "missing_tables"}, "health.v1.schema")
    check(not payload["schema"]["missing_tables"], "Health check encontrou tabela obrigatoria ausente.")


def assert_quotes_list_contract(payload: list[dict]) -> None:
    require_row_keys(
        payload,
        {
            "id",
            "organization_id",
            "supplier_id",
            "supplier_name",
            "status",
            "created_at",
            "total_estimated_amount",
            "item_count",
            "purchase_order_id",
            "purchase_order_status",
            "purchase_order_total",
        },
        "quotes_list.v1",
    )


def assert_quote_detail_contract(payload: dict) -> None:
    require_keys(
        payload,
        {
            "contract",
            "id",
            "supplier_id",
            "supplier_name",
            "status",
            "items",
            "response_summary",
            "supplier_terms",
            "purchase_order",
        },
        "quote_detail.v1",
    )
    check(payload["contract"] == "quote_detail.v1", "Contrato de /api/quote mudou sem nova versao.")
    require_row_keys(
        payload["items"],
        {
            "id",
            "quote_request_id",
            "product_id",
            "source_code",
            "supplier_reference",
            "product_name",
            "unit",
            "purchase_unit",
            "purchase_package_size",
            "coverage_target_days",
            "requested_quantity",
            "quoted_total_amount",
        },
        "quote_detail.v1.items",
    )
    require_keys(
        payload["response_summary"],
        {"responded_count", "pending_count", "quoted_total_amount", "learned_packages", "average_lead_time_days"},
        "quote_detail.v1.response_summary",
    )
    require_keys(payload["supplier_terms"], {"minimum_order_value"}, "quote_detail.v1.supplier_terms")


def assert_purchase_orders_contract(payload: list[dict]) -> None:
    require_row_keys(
        payload,
        {
            "id",
            "organization_id",
            "quote_request_id",
            "supplier_id",
            "supplier_name",
            "status",
            "created_at",
            "expected_delivery_date",
            "received_at",
            "total_amount",
            "item_count",
            "approved_item_count",
            "overdue",
        },
        "purchase_orders_list.v1",
    )


def assert_purchase_order_detail_contract(payload: dict) -> None:
    require_keys(
        payload,
        {
            "contract",
            "id",
            "quote_request_id",
            "supplier_id",
            "supplier_name",
            "status",
            "total_amount",
            "item_count",
            "approved_item_count",
            "items",
        },
        "purchase_order_detail.v1",
    )
    check(payload["contract"] == "purchase_order_detail.v1", "Contrato de /api/purchase-order mudou sem nova versao.")
    require_row_keys(
        payload["items"],
        {
            "id",
            "purchase_order_id",
            "quote_request_item_id",
            "product_id",
            "source_code",
            "supplier_reference",
            "product_name",
            "unit",
            "final_quantity",
            "unit_price",
            "total_amount",
        },
        "purchase_order_detail.v1.items",
    )


def assert_imports_contract(payload: dict) -> None:
    require_keys(payload, {"contract", "batches", "issues", "changes", "refresh_targets", "local_reference", "readiness", "quality"}, "imports.v1")
    check(payload["contract"] == "imports.v1", "Contrato de /api/imports mudou sem nova versao.")
    require_row_keys(payload["batches"], {"id", "source_system", "status", "started_at", "finished_at", "summary_json", "files", "stats"}, "imports.v1.batches")
    require_row_keys(payload["issues"], {"severity", "code", "message", "source_line"}, "imports.v1.issues")
    require_row_keys(payload["changes"], {"entity_type", "source_code", "field_name", "previous_value", "new_value", "review_status", "created_at"}, "imports.v1.changes")
    require_keys(payload["local_reference"], {"configured", "folder", "folder_exists", "files"}, "imports.v1.local_reference")
    require_row_keys(
        payload["local_reference"]["files"],
        {"file_name", "exists", "modified", "needs_update", "size", "modified_at", "last_imported_at", "last_batch_id", "rows_imported"},
        "imports.v1.local_reference.files",
    )
    require_keys(payload["readiness"], {"coverage", "plan"}, "imports.v1.readiness")
    require_row_keys(payload["readiness"]["plan"], {"id", "priority", "title", "expected_files", "what_to_send", "used_for", "coverage"}, "imports.v1.readiness.plan")
    require_keys(payload["quality"], {"status", "score", "latest_batch_id", "summary", "checks", "next_step"}, "imports.v1.quality")
    require_keys(
        payload["quality"]["summary"],
        {"rows", "mapped_rows", "unmapped_rows", "files", "issues", "changes_pending", "manual_conflicts_pending"},
        "imports.v1.quality.summary",
    )
