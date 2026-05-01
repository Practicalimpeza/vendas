PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    document TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    document TEXT DEFAULT '',
    city TEXT DEFAULT '',
    state TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    store_id TEXT NOT NULL REFERENCES stores(id),
    source_system TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'created',
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT,
    issues_json TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL,
    document TEXT DEFAULT '',
    minimum_order_value NUMERIC NOT NULL DEFAULT 0,
    average_lead_time_days INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    source_code TEXT NOT NULL,
    barcode TEXT DEFAULT '',
    name TEXT NOT NULL,
    brand TEXT DEFAULT '',
    category_level_1 TEXT DEFAULT '',
    category_level_2 TEXT DEFAULT '',
    unit TEXT NOT NULL DEFAULT 'UN',
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE (organization_id, source_code)
);

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    source_code TEXT NOT NULL,
    name TEXT NOT NULL,
    document TEXT DEFAULT '',
    UNIQUE (organization_id, source_code)
);

CREATE TABLE IF NOT EXISTS brand_supplier_rules (
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    brand TEXT NOT NULL,
    supplier_id TEXT REFERENCES suppliers(id),
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT DEFAULT '',
    PRIMARY KEY (organization_id, brand)
);

CREATE TABLE IF NOT EXISTS purchase_settings (
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    supplier_id TEXT REFERENCES suppliers(id),
    package_size NUMERIC NOT NULL DEFAULT 1,
    target_coverage_days INTEGER NOT NULL DEFAULT 45,
    blocked INTEGER NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    PRIMARY KEY (organization_id, product_id)
);

CREATE TABLE IF NOT EXISTS inventory_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_batch_id TEXT REFERENCES import_batches(id),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    store_id TEXT NOT NULL REFERENCES stores(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    snapshot_date TEXT NOT NULL DEFAULT CURRENT_DATE,
    quantity_on_hand NUMERIC NOT NULL DEFAULT 0,
    average_cost NUMERIC NOT NULL DEFAULT 0,
    sale_price NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_inventory_org_store_product
    ON inventory_snapshots(organization_id, store_id, product_id, snapshot_date);

CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_batch_id TEXT REFERENCES import_batches(id),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    store_id TEXT NOT NULL REFERENCES stores(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    customer_id TEXT REFERENCES customers(id),
    sold_at TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    gross_amount NUMERIC NOT NULL,
    net_amount NUMERIC
);
CREATE INDEX IF NOT EXISTS idx_sales_org_store_date
    ON sales(organization_id, store_id, sold_at);
CREATE INDEX IF NOT EXISTS idx_sales_org_customer
    ON sales(organization_id, customer_id, sold_at);

CREATE TABLE IF NOT EXISTS service_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_batch_id TEXT REFERENCES import_batches(id),
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    store_id TEXT NOT NULL REFERENCES stores(id),
    customer_id TEXT REFERENCES customers(id),
    customer_name TEXT DEFAULT '',
    order_number TEXT DEFAULT '',
    service_name TEXT NOT NULL,
    emitted_at TEXT NOT NULL,
    quantity NUMERIC NOT NULL DEFAULT 1,
    gross_amount NUMERIC NOT NULL DEFAULT 0,
    tax_amount NUMERIC NOT NULL DEFAULT 0,
    net_amount NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    store_id TEXT NOT NULL REFERENCES stores(id),
    supplier_id TEXT REFERENCES suppliers(id),
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TEXT,
    confirmed_at TEXT,
    received_at TEXT,
    total_amount NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    quantity NUMERIC NOT NULL,
    unit_cost NUMERIC NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id TEXT NOT NULL REFERENCES organizations(id),
    actor_user_id TEXT DEFAULT '',
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
