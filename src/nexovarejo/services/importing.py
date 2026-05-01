from __future__ import annotations

from dataclasses import dataclass
import csv
from pathlib import Path
from decimal import Decimal

from nexovarejo.ingestion.connectors import PracticaCsvConnector
from nexovarejo.storage import PersistResult, connect, initialize_database, persist_batch
from nexovarejo.ingestion.contracts import normalize_header


@dataclass(frozen=True)
class ImportPracticaResult:
    database_path: Path
    persist_result: PersistResult


def import_practica_directory(
    source_dir: Path,
    *,
    database_path: Path,
    organization_id: str,
    store_id: str,
    import_batch_id: str | None = None,
    manual_dir: Path | None = None,
) -> ImportPracticaResult:
    initialize_database(database_path)
    batch = PracticaCsvConnector().load(
        source_dir,
        organization_id=organization_id,
        store_id=store_id,
    )
    conn = connect(database_path)
    try:
        persist_result = persist_batch(conn, batch, import_batch_id=import_batch_id)
        if manual_dir and manual_dir.exists():
            import_practica_manual_configs(conn, manual_dir, organization_id=organization_id)
    finally:
        conn.close()
    return ImportPracticaResult(database_path=database_path, persist_result=persist_result)


def import_practica_manual_configs(conn, manual_dir: Path, *, organization_id: str) -> None:
    suppliers_path = manual_dir / "fornecedores.csv"
    if suppliers_path.exists():
        with suppliers_path.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                name = (row.get("fornecedor") or "").strip()
                if not name:
                    continue
                supplier_id = f"{organization_id}:fornecedor:{normalize_header(name)}"
                conn.execute(
                    """
                    INSERT INTO suppliers
                        (id, organization_id, name, minimum_order_value, average_lead_time_days, active)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(organization_id, name) DO UPDATE SET
                        minimum_order_value = excluded.minimum_order_value,
                        average_lead_time_days = excluded.average_lead_time_days,
                        active = excluded.active
                    """,
                    (
                        supplier_id,
                        organization_id,
                        name,
                        _decimal(row.get("pedido_minimo")),
                        int(float(row.get("prazo_medio_entrega") or 0)) if row.get("prazo_medio_entrega") else None,
                        1 if str(row.get("ativo", "1")).strip() != "0" else 0,
                    ),
                )

    brands_path = manual_dir / "marcas.csv"
    if brands_path.exists():
        with brands_path.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                brand = (row.get("marca") or "").strip()
                supplier_name = (row.get("fornecedor") or "").strip()
                if not brand:
                    continue
                supplier_id = f"{organization_id}:fornecedor:{normalize_header(supplier_name)}" if supplier_name else None
                if supplier_id and not conn.execute("SELECT 1 FROM suppliers WHERE id = ?", (supplier_id,)).fetchone():
                    conn.execute(
                        "INSERT INTO suppliers (id, organization_id, name) VALUES (?, ?, ?)",
                        (supplier_id, organization_id, supplier_name),
                    )
                conn.execute(
                    """
                    INSERT INTO brand_supplier_rules (organization_id, brand, supplier_id, active)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(organization_id, brand) DO UPDATE SET
                        supplier_id = excluded.supplier_id,
                        active = excluded.active
                    """,
                    (organization_id, brand, supplier_id, 1 if str(row.get("ativa", "1")).strip() != "0" else 0),
                )

    settings_path = manual_dir / "configuracoes_produto_compra.csv"
    if settings_path.exists():
        with settings_path.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                code = str(row.get("codigo_produto") or "").strip()
                if not code:
                    continue
                product_id = f"{organization_id}:{int(code) if code.isdigit() else code}"
                if not conn.execute("SELECT 1 FROM products WHERE id = ?", (product_id,)).fetchone():
                    continue
                conn.execute(
                    """
                    INSERT INTO purchase_settings
                        (organization_id, product_id, package_size, target_coverage_days, blocked, notes)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(organization_id, product_id) DO UPDATE SET
                        package_size = excluded.package_size,
                        blocked = excluded.blocked,
                        notes = excluded.notes
                    """,
                    (
                        organization_id,
                        product_id,
                        max(_decimal(row.get("caixa")), Decimal("1")),
                        45,
                        1 if (row.get("marcador") or "").strip().upper() == "N" else 0,
                        row.get("observacoes") or "",
                    ),
                )
    conn.commit()


def _decimal(value) -> Decimal:
    text = str(value or "").strip()
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    return Decimal(text or "0")
