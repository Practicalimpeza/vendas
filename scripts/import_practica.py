from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
import unicodedata
from datetime import date, datetime, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "schema" / "canonical.sql"


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "_", text.strip().lower())
    return text.strip("_")


def money(value: str) -> float:
    text = str(value or "").strip()
    if not text:
        return 0.0
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return 0.0


def excel_date(value: str) -> str:
    number = money(value)
    if not number:
        return ""
    return (date(1899, 12, 30) + timedelta(days=int(number))).isoformat()


def read_rows(path: Path) -> list[list[str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        return [[cell.strip() for cell in row] for row in csv.reader(file)]


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def product_id(org: str, code: str) -> str:
    return f"{org}:product:{code}"


def brand_id(org: str, name: str) -> str:
    return f"{org}:brand:{normalize(name) or 'sem_marca'}"


def supplier_id(org: str, name: str) -> str:
    return f"{org}:supplier:{normalize(name) or 'sem_fornecedor'}"


def customer_id(org: str, code: str, name: str) -> str:
    key = code.strip() or normalize(name) or "sem_cliente"
    return f"{org}:customer:{key}"


def service_id(org: str, name: str) -> str:
    return f"{org}:service:{normalize(name) or 'sem_servico'}"


def begin_db(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    return conn


def insert_source_file(conn: sqlite3.Connection, batch_id: str, source_dir: Path, file_name: str, role: str) -> str:
    path = source_dir / file_name
    source_file_id = f"{batch_id}:{role}"
    conn.execute(
        """
        INSERT OR REPLACE INTO source_files
            (id, import_batch_id, file_name, file_role, file_size_bytes, content_hash, encoding, row_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            source_file_id,
            batch_id,
            file_name,
            role,
            path.stat().st_size if path.exists() else 0,
            hash_file(path) if path.exists() else "",
            "utf-8",
            len(read_rows(path)) if path.exists() else 0,
        ),
    )
    return source_file_id


def issue(conn: sqlite3.Connection, batch_id: str, source_file_id: str, severity: str, code: str, message: str, line: int | None = None) -> None:
    conn.execute(
        """
        INSERT INTO import_issues
            (import_batch_id, source_file_id, severity, code, message, source_line)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (batch_id, source_file_id, severity, code, message, line),
    )


def source_change(
    conn: sqlite3.Connection,
    *,
    org: str,
    batch_id: str,
    entity_type: str,
    entity_id: str,
    source_code: str,
    field_name: str,
    previous: str,
    new: str,
    review_status: str = "not_required",
) -> None:
    if str(previous or "") == str(new or ""):
        return
    conn.execute(
        """
        INSERT INTO source_entity_changes
            (organization_id, import_batch_id, entity_type, entity_id, source_system, source_code,
             field_name, previous_value, new_value, review_status)
        VALUES (?, ?, ?, ?, 'practica_csv', ?, ?, ?, ?, ?)
        """,
        (org, batch_id, entity_type, entity_id, source_code, field_name, str(previous or ""), str(new or ""), review_status),
    )


def upsert_brand(conn: sqlite3.Connection, org: str, name: str) -> str | None:
    clean = name.strip()
    if not clean:
        return None
    bid = brand_id(org, clean)
    conn.execute(
        """
        INSERT INTO brands (id, organization_id, name, normalized_name, source_kind, source_system)
        VALUES (?, ?, ?, ?, 'imported', 'practica_csv')
        ON CONFLICT(organization_id, normalized_name) DO UPDATE SET
            name = excluded.name,
            source_kind = excluded.source_kind,
            source_system = excluded.source_system
        """,
        (bid, org, clean, normalize(clean)),
    )
    return bid


def seed_brand_suppliers(conn: sqlite3.Connection, org: str) -> None:
    for brand in conn.execute("SELECT id, name, normalized_name FROM brands WHERE organization_id = ?", (org,)).fetchall():
        sid = supplier_id(org, brand["name"])
        conn.execute(
            """
            INSERT OR IGNORE INTO suppliers
                (id, organization_id, name, normalized_name, contact_phone, order_review_cycle_days)
            VALUES (?, ?, ?, ?, '', 14)
            """,
            (sid, org, brand["name"], brand["normalized_name"]),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO brand_supplier_rules
                (organization_id, brand_id, supplier_id, notes)
            VALUES (?, ?, ?, 'Fornecedor padrao criado a partir da marca.')
            """,
            (org, brand["id"], sid),
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
        WHERE organization_id = ?
          AND preferred_supplier_id IS NULL
          AND EXISTS (
              SELECT 1
              FROM products p
              JOIN brand_supplier_rules bsr
                ON bsr.organization_id = p.organization_id
               AND bsr.brand_id = p.brand_id
              WHERE p.id = product_settings.product_id
                AND p.organization_id = product_settings.organization_id
          )
        """,
        (org,),
    )


def upsert_product(
    conn: sqlite3.Connection,
    *,
    org: str,
    batch_id: str,
    code: str,
    name: str,
    unit: str = "UN",
    brand: str = "",
    payload: dict | None = None,
) -> str:
    pid = product_id(org, code)
    existing = conn.execute("SELECT name, unit, brand_id FROM products WHERE id = ?", (pid,)).fetchone()
    bid = upsert_brand(conn, org, brand)
    if existing:
        source_change(conn, org=org, batch_id=batch_id, entity_type="product", entity_id=pid, source_code=code, field_name="name", previous=existing["name"], new=name)
        source_change(conn, org=org, batch_id=batch_id, entity_type="product", entity_id=pid, source_code=code, field_name="unit", previous=existing["unit"], new=unit or "UN")
        if existing["brand_id"] != bid:
            source_change(
                conn,
                org=org,
                batch_id=batch_id,
                entity_type="product",
                entity_id=pid,
                source_code=code,
                field_name="brand_id",
                previous=existing["brand_id"] or "",
                new=bid or "",
                review_status="needs_review",
            )
    conn.execute(
        """
        INSERT INTO products
            (id, organization_id, source_code, name, normalized_name, unit, brand_id,
             first_seen_import_batch_id, last_seen_import_batch_id, source_payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, source_code) DO UPDATE SET
            name = excluded.name,
            normalized_name = excluded.normalized_name,
            unit = excluded.unit,
            brand_id = excluded.brand_id,
            last_seen_import_batch_id = excluded.last_seen_import_batch_id,
            source_payload_json = excluded.source_payload_json,
            updated_at = CURRENT_TIMESTAMP
        """,
        (pid, org, code, name, normalize(name), unit or "UN", bid, batch_id, batch_id, json.dumps(payload or {}, ensure_ascii=False)),
    )
    conn.execute("INSERT OR IGNORE INTO product_settings (organization_id, product_id) VALUES (?, ?)", (org, pid))
    return pid


def upsert_customer(conn: sqlite3.Connection, org: str, batch_id: str, code: str, name: str) -> str | None:
    clean = name.strip()
    if not clean:
        return None
    cid = customer_id(org, code, clean)
    conn.execute(
        """
        INSERT INTO customers
            (id, organization_id, source_code, name, normalized_name, first_seen_import_batch_id, last_seen_import_batch_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, source_code, normalized_name) DO UPDATE SET
            name = excluded.name,
            last_seen_import_batch_id = excluded.last_seen_import_batch_id
        """,
        (cid, org, code, clean, normalize(clean), batch_id, batch_id),
    )
    return cid


def upsert_service(conn: sqlite3.Connection, org: str, batch_id: str, name: str) -> str | None:
    clean = name.strip()
    if not clean:
        return None
    sid = service_id(org, clean)
    conn.execute(
        """
        INSERT INTO services
            (id, organization_id, name, normalized_name, first_seen_import_batch_id, last_seen_import_batch_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, normalized_name) DO UPDATE SET
            name = excluded.name,
            last_seen_import_batch_id = excluded.last_seen_import_batch_id
        """,
        (sid, org, clean, normalize(clean), batch_id, batch_id),
    )
    return sid


def import_products(conn: sqlite3.Connection, source_dir: Path, org: str, store: str, batch_id: str) -> None:
    source_file_id = insert_source_file(conn, batch_id, source_dir, "produtopreco__Sheet1.csv", "product_price")
    rows = read_rows(source_dir / "produtopreco__Sheet1.csv")
    for line, row in enumerate(rows[1:], start=2):
        if len(row) < 7 or not row[0].isdigit():
            continue
        code, barcode, name, unit, brand, stock, price = row[:7]
        pid = upsert_product(conn, org=org, batch_id=batch_id, code=code, name=name, unit=unit or "UN", brand=brand, payload={"source_line": line})
        if barcode:
            conn.execute(
                """
                INSERT OR IGNORE INTO product_identifiers
                    (organization_id, product_id, identifier_type, identifier_value, source_system)
                VALUES (?, ?, 'barcode', ?, 'practica_csv')
                """,
                (org, pid, barcode),
            )
        conn.execute(
            """
            INSERT OR IGNORE INTO inventory_snapshots
                (import_batch_id, organization_id, store_id, product_id, snapshot_date, quantity_on_hand, source_line)
            VALUES (?, ?, ?, ?, CURRENT_DATE, ?, ?)
            """,
            (batch_id, org, store, pid, money(stock), line),
        )
        conn.execute(
            """
            INSERT INTO price_snapshots
                (import_batch_id, organization_id, store_id, product_id, snapshot_date, sale_price, source_line)
            VALUES (?, ?, ?, ?, CURRENT_DATE, ?, ?)
            """,
            (batch_id, org, store, pid, money(price), line),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO source_records
                (import_batch_id, source_file_id, record_type, source_line, source_key, raw_payload_json)
            VALUES (?, ?, 'product_price', ?, ?, ?)
            """,
            (batch_id, source_file_id, line, code, json.dumps(row, ensure_ascii=False)),
        )


def import_costs(conn: sqlite3.Connection, source_dir: Path, org: str, batch_id: str) -> None:
    source_file_id = insert_source_file(conn, batch_id, source_dir, "produtocusto__Sheet1.csv", "product_cost")
    rows = read_rows(source_dir / "produtocusto__Sheet1.csv")
    for line, row in enumerate(rows[1:], start=2):
        if len(row) < 8 or not row[0].isdigit():
            continue
        code, supplier_reference, name, purchase, freight, icms, ipi, total = row[:8]
        pid = product_id(org, code)
        if not conn.execute("SELECT 1 FROM products WHERE id = ?", (pid,)).fetchone():
            pid = upsert_product(conn, org=org, batch_id=batch_id, code=code, name=name, payload={"source_line": line})
        if supplier_reference:
            conn.execute(
                """
                INSERT OR IGNORE INTO product_identifiers
                    (organization_id, product_id, identifier_type, identifier_value, source_system)
                VALUES (?, ?, 'supplier_reference', ?, 'practica_csv')
                """,
                (org, pid, supplier_reference),
            )
        conn.execute(
            """
            INSERT INTO cost_snapshots
                (import_batch_id, organization_id, product_id, snapshot_date, purchase_cost, freight_cost,
                 icms_cost, ipi_cost, total_cost, source_line)
            VALUES (?, ?, ?, CURRENT_DATE, ?, ?, ?, ?, ?, ?)
            """,
            (batch_id, org, pid, money(purchase), money(freight), money(icms), money(ipi), money(total), line),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO source_records
                (import_batch_id, source_file_id, record_type, source_line, source_key, raw_payload_json)
            VALUES (?, ?, 'product_cost', ?, ?, ?)
            """,
            (batch_id, source_file_id, line, code, json.dumps(row, ensure_ascii=False)),
        )


def import_product_sales(conn: sqlite3.Connection, source_dir: Path, org: str, store: str, batch_id: str) -> None:
    source_file_id = insert_source_file(conn, batch_id, source_dir, "saidaprod__Sheet1.csv", "product_sales")
    rows = read_rows(source_dir / "saidaprod__Sheet1.csv")
    imported = 0
    for line, row in enumerate(rows[1:], start=2):
        if len(row) < 8 or not row[0].isdigit():
            continue
        code, product_name, serial, qty, amount, movement, customer_code, customer_name = row[:8]
        sold_at = excel_date(serial)
        if not sold_at:
            issue(conn, batch_id, source_file_id, "warning", "invalid_sale_date", "Venda com data invalida", line)
            continue
        pid = product_id(org, code)
        if not conn.execute("SELECT 1 FROM products WHERE id = ?", (pid,)).fetchone():
            pid = upsert_product(conn, org=org, batch_id=batch_id, code=code, name=product_name, payload={"source_line": line})
        cid = upsert_customer(conn, org, batch_id, customer_code, customer_name)
        conn.execute(
            """
            INSERT INTO product_sales
                (import_batch_id, organization_id, store_id, product_id, customer_id, sold_at,
                 quantity, gross_amount, movement_type, source_line, source_payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (batch_id, org, store, pid, cid, sold_at, money(qty), money(amount), movement, line, json.dumps(row, ensure_ascii=False)),
        )
        imported += 1
    issue(conn, batch_id, source_file_id, "info", "product_sales_imported", f"{imported} vendas de produtos importadas")


def import_service_sales(conn: sqlite3.Connection, source_dir: Path, org: str, store: str, batch_id: str) -> None:
    source_file_id = insert_source_file(conn, batch_id, source_dir, "servico__Sheet1.csv", "service_sales")
    rows = read_rows(source_dir / "servico__Sheet1.csv")
    imported = 0
    for line, row in enumerate(rows[2:], start=3):
        if len(row) < 8 or not row[0].replace(".", "", 1).isdigit():
            continue
        emitted_at = excel_date(row[0])
        if not emitted_at:
            continue
        order_number, service_name, customer_name = row[1], row[2], row[3]
        sid = upsert_service(conn, org, batch_id, service_name)
        cid = upsert_customer(conn, org, batch_id, "", customer_name)
        conn.execute(
            """
            INSERT INTO service_sales
                (import_batch_id, organization_id, store_id, service_id, customer_id, emitted_at,
                 order_number, quantity, gross_amount, tax_amount, net_amount, source_line, source_payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (batch_id, org, store, sid, cid, emitted_at, order_number, money(row[4]), money(row[5]), money(row[6]), money(row[7]), line, json.dumps(row, ensure_ascii=False)),
        )
        imported += 1
    issue(conn, batch_id, source_file_id, "info", "service_sales_imported", f"{imported} vendas de servicos importadas")


def import_profit_summary(conn: sqlite3.Connection, source_dir: Path, org: str, batch_id: str) -> None:
    source_file_id = insert_source_file(conn, batch_id, source_dir, "saidaprodlucro__Sheet1.csv", "product_profit")
    rows = read_rows(source_dir / "saidaprodlucro__Sheet1.csv")
    for line, row in enumerate(rows[1:], start=2):
        if len(row) < 9 or not row[0].isdigit():
            continue
        code, name = row[0], row[1]
        pid = product_id(org, code)
        if not conn.execute("SELECT 1 FROM products WHERE id = ?", (pid,)).fetchone():
            pid = upsert_product(conn, org=org, batch_id=batch_id, code=code, name=name, payload={"source_line": line})
        conn.execute(
            """
            INSERT INTO product_profit_summaries
                (import_batch_id, organization_id, product_id, quantity, gross_amount, cost_amount,
                 tax_amount, operating_cost_amount, gross_profit_amount, net_profit_amount, source_line)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (batch_id, org, pid, money(row[2]), money(row[3]), money(row[4]), money(row[5]), money(row[6]), money(row[7]), money(row[8]), line),
        )


def create_operational_tasks(conn: sqlite3.Connection, org: str, store: str, batch_id: str) -> None:
    project_id = f"{org}:implementation"
    conn.execute(
        """
        INSERT OR IGNORE INTO implementation_projects
            (id, organization_id, store_id, source_system, status, first_batch_approved_at)
        VALUES (?, ?, ?, 'practica_csv', 'configuration', CURRENT_TIMESTAMP)
        """,
        (project_id, org, store),
    )
    tasks = [
        ("supplier_rules", "Cadastrar fornecedores preferenciais para marcas/produtos"),
        ("package_sizes", "Definir embalagem de compra dos produtos A"),
        ("coverage_targets", "Definir cobertura alvo por categoria ou produto"),
        ("generic_customer", "Separar cliente CONSUMIDOR das analises relacionais"),
    ]
    for task_type, title in tasks:
        conn.execute(
            """
            INSERT INTO implementation_tasks
                (implementation_project_id, organization_id, task_type, title, priority)
            SELECT ?, ?, ?, ?, 1
            WHERE NOT EXISTS (
                SELECT 1 FROM implementation_tasks
                WHERE implementation_project_id = ? AND task_type = ?
            )
            """,
            (project_id, org, task_type, title, project_id, task_type),
        )


def clear_imported_facts(conn: sqlite3.Connection, org: str) -> None:
    for table in (
        "product_sales",
        "service_sales",
        "inventory_snapshots",
        "price_snapshots",
        "cost_snapshots",
        "product_profit_summaries",
    ):
        conn.execute(f"DELETE FROM {table} WHERE organization_id = ?", (org,))


def import_all(source_dir: Path, db_path: Path, org: str, store: str) -> None:
    conn = begin_db(db_path)
    batch_id = f"{org}:batch:{datetime.now().strftime('%Y%m%d%H%M%S')}"
    with conn:
        conn.execute("INSERT OR IGNORE INTO organizations (id, name) VALUES (?, ?)", (org, "Empresa teste"))
        conn.execute("INSERT OR IGNORE INTO stores (id, organization_id, name) VALUES (?, ?, ?)", (store, org, "Loja principal"))
        clear_imported_facts(conn, org)
        conn.execute(
            """
            INSERT INTO import_batches
                (id, organization_id, store_id, source_system, status, import_mode, source_period_start, source_period_end, finished_at)
            VALUES (?, ?, ?, 'practica_csv', 'finished', 'full_refresh', '2024-04-01', '2026-04-30', CURRENT_TIMESTAMP)
            """,
            (batch_id, org, store),
        )
        import_products(conn, source_dir, org, store, batch_id)
        seed_brand_suppliers(conn, org)
        import_costs(conn, source_dir, org, batch_id)
        import_product_sales(conn, source_dir, org, store, batch_id)
        import_service_sales(conn, source_dir, org, store, batch_id)
        import_profit_summary(conn, source_dir, org, batch_id)
        create_operational_tasks(conn, org, store, batch_id)
        summary = {
            "products": conn.execute("SELECT COUNT(*) FROM products WHERE organization_id = ?", (org,)).fetchone()[0],
            "product_sales": conn.execute("SELECT COUNT(*) FROM product_sales WHERE organization_id = ?", (org,)).fetchone()[0],
            "service_sales": conn.execute("SELECT COUNT(*) FROM service_sales WHERE organization_id = ?", (org,)).fetchone()[0],
            "customers": conn.execute("SELECT COUNT(*) FROM customers WHERE organization_id = ?", (org,)).fetchone()[0],
        }
        conn.execute("UPDATE import_batches SET summary_json = ? WHERE id = ?", (json.dumps(summary), batch_id))
    conn.close()
    print(f"Importacao concluida em {db_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Importa os CSVs de exemplo da Practica para SQLite.")
    parser.add_argument("--source-dir", default=".", help="Pasta onde estao os CSVs.")
    parser.add_argument("--db", default="data/nexovarejo.db", help="Caminho do SQLite.")
    parser.add_argument("--organization-id", default="org_teste")
    parser.add_argument("--store-id", default="loja_1")
    args = parser.parse_args()
    import_all(Path(args.source_dir), Path(args.db), args.organization_id, args.store_id)


if __name__ == "__main__":
    main()
