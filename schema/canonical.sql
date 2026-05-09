PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    document TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL DEFAULT '',
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    document TEXT DEFAULT '',
    city TEXT DEFAULT '',
    state TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    store_id TEXT REFERENCES stores(id),
    source_system TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'created',
    import_mode TEXT NOT NULL DEFAULT 'full_refresh',
    supersedes_batch_id TEXT REFERENCES import_batches(id),
    source_period_start TEXT,
    source_period_end TEXT,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    summary_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS source_files (
    id TEXT PRIMARY KEY,
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
    file_name TEXT NOT NULL,
    file_role TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL DEFAULT 0,
    content_hash TEXT DEFAULT '',
    encoding TEXT DEFAULT '',
    row_count INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS source_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
    source_file_id TEXT NOT NULL REFERENCES source_files(id),
    record_type TEXT NOT NULL,
    source_line INTEGER,
    source_key TEXT DEFAULT '',
    raw_payload_json TEXT NOT NULL DEFAULT '{}',
    normalized_payload_json TEXT NOT NULL DEFAULT '{}',
    record_hash TEXT DEFAULT '',
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (source_file_id, source_line, record_type)
);

CREATE TABLE IF NOT EXISTS source_entity_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    source_system TEXT NOT NULL,
    source_code TEXT DEFAULT '',
    field_name TEXT NOT NULL,
    previous_value TEXT DEFAULT '',
    new_value TEXT DEFAULT '',
    change_type TEXT NOT NULL DEFAULT 'source_update',
    review_status TEXT NOT NULL DEFAULT 'not_required',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_batch_id TEXT NOT NULL REFERENCES import_batches(id),
    source_file_id TEXT REFERENCES source_files(id),
    severity TEXT NOT NULL,
    code TEXT NOT NULL,
    message TEXT NOT NULL,
    source_line INTEGER,
    source_field TEXT DEFAULT '',
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS implementation_projects (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    store_id TEXT REFERENCES stores(id),
    source_system TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'diagnosis',
    internal_owner_user_id TEXT DEFAULT '',
    customer_owner_name TEXT DEFAULT '',
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    first_files_received_at TEXT,
    first_batch_approved_at TEXT,
    first_dashboard_delivered_at TEXT,
    first_purchase_routine_at TEXT,
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS implementation_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    implementation_project_id TEXT NOT NULL REFERENCES implementation_projects(id),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    task_type TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    priority INTEGER NOT NULL DEFAULT 2,
    target_type TEXT DEFAULT '',
    target_id TEXT DEFAULT '',
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS brands (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    source_kind TEXT NOT NULL DEFAULT 'imported',
    source_system TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE (organization_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    parent_id TEXT REFERENCES categories(id),
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    source_kind TEXT NOT NULL DEFAULT 'manual',
    source_system TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE (organization_id, parent_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    document TEXT DEFAULT '',
    contact_name TEXT DEFAULT '',
    contact_phone TEXT DEFAULT '',
    contact_email TEXT DEFAULT '',
    minimum_order_value NUMERIC NOT NULL DEFAULT 0,
    target_order_value NUMERIC NOT NULL DEFAULT 0,
    average_lead_time_days INTEGER,
    order_review_cycle_days INTEGER,
    target_coverage_adjustment_days INTEGER NOT NULL DEFAULT 0,
    order_difficulty TEXT NOT NULL DEFAULT 'auto',
    notes TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE (organization_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS brand_supplier_rules (
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    brand_id TEXT NOT NULL REFERENCES brands(id),
    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, brand_id)
);

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    source_code TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'UN',
    brand_id TEXT REFERENCES brands(id),
    category_id TEXT REFERENCES categories(id),
    active INTEGER NOT NULL DEFAULT 1,
    first_seen_import_batch_id TEXT REFERENCES import_batches(id),
    last_seen_import_batch_id TEXT REFERENCES import_batches(id),
    source_payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, source_code)
);

CREATE TABLE IF NOT EXISTS product_identifiers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    identifier_type TEXT NOT NULL,
    identifier_value TEXT NOT NULL,
    source_system TEXT DEFAULT '',
    UNIQUE (organization_id, identifier_type, identifier_value)
);

CREATE TABLE IF NOT EXISTS product_settings (
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    preferred_supplier_id TEXT REFERENCES suppliers(id),
    package_size NUMERIC NOT NULL DEFAULT 1,
    target_coverage_days INTEGER NOT NULL DEFAULT 45,
    minimum_stock NUMERIC NOT NULL DEFAULT 0,
    maximum_stock NUMERIC,
    weight NUMERIC,
    expires INTEGER NOT NULL DEFAULT 0,
    blocked_for_purchase INTEGER NOT NULL DEFAULT 0,
    ignored_in_purchase_reports INTEGER NOT NULL DEFAULT 0,
    marker TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    PRIMARY KEY (organization_id, product_id)
);

CREATE TABLE IF NOT EXISTS product_pricing_settings (
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    cost_price NUMERIC,
    product_role TEXT NOT NULL DEFAULT 'normal',
    notes TEXT DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, product_id)
);

CREATE TABLE IF NOT EXISTS supplier_product_rules (
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    supplier_sku TEXT DEFAULT '',
    package_size NUMERIC NOT NULL DEFAULT 1,
    minimum_quantity NUMERIC NOT NULL DEFAULT 0,
    lead_time_days INTEGER,
    last_purchase_cost NUMERIC,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT DEFAULT '',
    PRIMARY KEY (organization_id, supplier_id, product_id)
);

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    source_code TEXT DEFAULT '',
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    document TEXT DEFAULT '',
    customer_type TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    first_seen_import_batch_id TEXT REFERENCES import_batches(id),
    last_seen_import_batch_id TEXT REFERENCES import_batches(id),
    source_payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (organization_id, source_code, normalized_name)
);

CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    first_seen_import_batch_id TEXT REFERENCES import_batches(id),
    last_seen_import_batch_id TEXT REFERENCES import_batches(id),
    source_payload_json TEXT NOT NULL DEFAULT '{}',
    UNIQUE (organization_id, normalized_name)
);

CREATE TABLE IF NOT EXISTS inventory_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_batch_id TEXT REFERENCES import_batches(id),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    store_id TEXT NOT NULL REFERENCES stores(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    snapshot_date TEXT NOT NULL,
    quantity_on_hand NUMERIC NOT NULL DEFAULT 0,
    source_line INTEGER,
    UNIQUE (organization_id, store_id, product_id, snapshot_date, import_batch_id)
);

CREATE TABLE IF NOT EXISTS price_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_batch_id TEXT REFERENCES import_batches(id),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    store_id TEXT REFERENCES stores(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    snapshot_date TEXT NOT NULL,
    sale_price NUMERIC NOT NULL DEFAULT 0,
    source_line INTEGER
);

CREATE TABLE IF NOT EXISTS cost_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_batch_id TEXT REFERENCES import_batches(id),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    snapshot_date TEXT NOT NULL,
    purchase_cost NUMERIC NOT NULL DEFAULT 0,
    freight_cost NUMERIC NOT NULL DEFAULT 0,
    icms_cost NUMERIC NOT NULL DEFAULT 0,
    ipi_cost NUMERIC NOT NULL DEFAULT 0,
    total_cost NUMERIC NOT NULL DEFAULT 0,
    source_line INTEGER
);

CREATE TABLE IF NOT EXISTS product_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_batch_id TEXT REFERENCES import_batches(id),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    store_id TEXT NOT NULL REFERENCES stores(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    customer_id TEXT REFERENCES customers(id),
    sold_at TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    gross_amount NUMERIC NOT NULL,
    movement_type TEXT DEFAULT '',
    source_line INTEGER,
    source_payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS service_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_batch_id TEXT REFERENCES import_batches(id),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    store_id TEXT NOT NULL REFERENCES stores(id),
    service_id TEXT REFERENCES services(id),
    customer_id TEXT REFERENCES customers(id),
    emitted_at TEXT NOT NULL,
    order_number TEXT DEFAULT '',
    quantity NUMERIC NOT NULL DEFAULT 1,
    gross_amount NUMERIC NOT NULL DEFAULT 0,
    tax_amount NUMERIC NOT NULL DEFAULT 0,
    net_amount NUMERIC NOT NULL DEFAULT 0,
    source_line INTEGER,
    source_payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS product_profit_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_batch_id TEXT REFERENCES import_batches(id),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    period_start TEXT,
    period_end TEXT,
    quantity NUMERIC NOT NULL DEFAULT 0,
    gross_amount NUMERIC NOT NULL DEFAULT 0,
    cost_amount NUMERIC NOT NULL DEFAULT 0,
    tax_amount NUMERIC NOT NULL DEFAULT 0,
    operating_cost_amount NUMERIC NOT NULL DEFAULT 0,
    gross_profit_amount NUMERIC NOT NULL DEFAULT 0,
    net_profit_amount NUMERIC NOT NULL DEFAULT 0,
    source_line INTEGER
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    store_id TEXT REFERENCES stores(id),
    quote_request_id TEXT REFERENCES quote_requests(id),
    supplier_id TEXT REFERENCES suppliers(id),
    supplier_name TEXT NOT NULL DEFAULT '',
    contact_phone TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    source_kind TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TEXT,
    sent_at TEXT,
    confirmed_at TEXT,
    received_at TEXT,
    expected_delivery_date TEXT,
    minimum_order_value NUMERIC NOT NULL DEFAULT 0,
    minimum_order_met INTEGER NOT NULL DEFAULT 1,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    item_count INTEGER NOT NULL DEFAULT 0,
    approved_item_count INTEGER NOT NULL DEFAULT 0,
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
    quote_request_item_id INTEGER REFERENCES quote_request_items(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    source_code TEXT NOT NULL DEFAULT '',
    supplier_reference TEXT DEFAULT '',
    quote_code TEXT NOT NULL DEFAULT '',
    product_name TEXT NOT NULL DEFAULT '',
    unit TEXT DEFAULT '',
    purchase_unit TEXT DEFAULT '',
    purchase_package_size NUMERIC NOT NULL DEFAULT 1,
    coverage_target_days INTEGER,
    suggested_quantity NUMERIC NOT NULL DEFAULT 0,
    requested_quantity NUMERIC NOT NULL DEFAULT 0,
    ordered_quantity NUMERIC NOT NULL DEFAULT 0,
    final_quantity NUMERIC NOT NULL DEFAULT 0,
    received_quantity NUMERIC NOT NULL DEFAULT 0,
    package_size NUMERIC NOT NULL DEFAULT 1,
    unit_cost NUMERIC NOT NULL DEFAULT 0,
    unit_price NUMERIC NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    decision TEXT NOT NULL DEFAULT 'buy',
    availability TEXT DEFAULT '',
    lead_time_days INTEGER,
    reason TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    reason_json TEXT NOT NULL DEFAULT '{}'
);

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
);

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
);

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
);

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
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    actor_user_id TEXT DEFAULT '',
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    before_json TEXT NOT NULL DEFAULT '{}',
    after_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_import_issues_batch ON import_issues(import_batch_id, severity);
CREATE INDEX IF NOT EXISTS idx_source_records_batch ON source_records(import_batch_id, record_type, source_key);
CREATE INDEX IF NOT EXISTS idx_source_entity_changes_entity ON source_entity_changes(organization_id, entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_source_entity_changes_review ON source_entity_changes(organization_id, review_status, change_type);
CREATE INDEX IF NOT EXISTS idx_implementation_projects_org ON implementation_projects(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_implementation_tasks_project ON implementation_tasks(implementation_project_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_brand_supplier_rules_supplier ON brand_supplier_rules(organization_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_org_name ON products(organization_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_inventory_product_date ON inventory_snapshots(organization_id, store_id, product_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_price_product_date ON price_snapshots(organization_id, product_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_cost_product_date ON cost_snapshots(organization_id, product_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_product_sales_date ON product_sales(organization_id, store_id, sold_at);
CREATE INDEX IF NOT EXISTS idx_product_sales_product ON product_sales(organization_id, product_id, sold_at);
CREATE INDEX IF NOT EXISTS idx_product_sales_customer ON product_sales(organization_id, customer_id, sold_at);
CREATE INDEX IF NOT EXISTS idx_service_sales_date ON service_sales(organization_id, store_id, emitted_at);
CREATE INDEX IF NOT EXISTS idx_service_sales_customer ON service_sales(organization_id, customer_id, emitted_at);
CREATE INDEX IF NOT EXISTS idx_pricing_settings_product ON product_pricing_settings(organization_id, product_id);
CREATE INDEX IF NOT EXISTS idx_quote_requests_org_status ON quote_requests(organization_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_request_items(quote_request_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_org_status ON purchase_orders(organization_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_quote ON purchase_orders(organization_id, quote_request_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_action_items_org_status ON action_items(organization_id, status, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_action_items_target ON action_items(organization_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_operational_decisions_org_created ON operational_decisions(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_operational_decisions_entity ON operational_decisions(organization_id, entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_operational_decisions_type ON operational_decisions(organization_id, decision_type, decision_value, created_at);

CREATE VIEW IF NOT EXISTS v_products_effective AS
SELECT
    p.id,
    p.organization_id,
    p.source_code,
    p.name,
    p.normalized_name,
    p.unit,
    p.brand_id,
    p.category_id,
    p.active,
    ps.preferred_supplier_id,
    ps.package_size,
    ps.target_coverage_days,
    ps.minimum_stock,
    ps.maximum_stock,
    ps.blocked_for_purchase,
    ps.ignored_in_purchase_reports,
    ps.marker,
    ps.notes AS operational_notes,
    p.first_seen_import_batch_id,
    p.last_seen_import_batch_id
FROM products p
LEFT JOIN product_settings ps
    ON ps.organization_id = p.organization_id
   AND ps.product_id = p.id;

CREATE VIEW IF NOT EXISTS v_customers_effective AS
SELECT
    c.id,
    c.organization_id,
    c.source_code,
    c.name,
    c.normalized_name,
    c.document,
    c.customer_type,
    c.active,
    c.first_seen_import_batch_id,
    c.last_seen_import_batch_id
FROM customers c;

CREATE VIEW IF NOT EXISTS v_services_effective AS
SELECT
    s.id,
    s.organization_id,
    s.name,
    s.normalized_name,
    s.active,
    s.first_seen_import_batch_id,
    s.last_seen_import_batch_id
FROM services s;
