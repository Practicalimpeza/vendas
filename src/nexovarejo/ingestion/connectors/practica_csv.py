from __future__ import annotations

import csv
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Iterable

from nexovarejo.ingestion.connectors.base import ERPConnector
from nexovarejo.ingestion.contracts import CanonicalBatch, ImportIssue, normalize_header


def _decimal(value: str) -> Decimal:
    text = str(value or "").strip()
    if "," in text:
        text = text.replace(".", "").replace(",", ".")
    if not text:
        return Decimal("0")
    try:
        return Decimal(text)
    except InvalidOperation:
        return Decimal("0")


def _code(value: str) -> str:
    text = str(value or "").strip()
    if text.isdigit():
        return str(int(text))
    return text


def _date(value: str):
    text = str(value or "").strip()
    if text.replace(".", "", 1).isdigit():
        # Datas exportadas do Excel antigo podem vir como serial numerico.
        return (date(1899, 12, 30) + timedelta(days=int(float(text)))).isoformat()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return ""


def _is_plausible_business_date(value: str) -> bool:
    if not value:
        return False
    parsed = date.fromisoformat(value)
    return 2000 <= parsed.year <= (date.today().year + 2)


def _read_csv(path: Path) -> Iterable[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            yield {normalize_header(k): v for k, v in row.items()}


class PracticaCsvConnector(ERPConnector):
    """Conector inicial para as exportacoes CSV usadas pelo MVP da Practica.

    Este conector serve como adaptador de referencia. Novos ERPs devem criar
    classes proprias e entregar o mesmo `CanonicalBatch`.
    """

    source_system = "practica_csv"

    def load(self, source_dir: Path, *, organization_id: str, store_id: str) -> CanonicalBatch:
        batch = CanonicalBatch(
            organization_id=organization_id,
            store_id=store_id,
            source_system=self.source_system,
        )
        self._load_products(source_dir, batch)
        self._load_sales(source_dir, batch)
        self._load_services(source_dir, batch)
        return batch

    def _load_products(self, source_dir: Path, batch: CanonicalBatch) -> None:
        path = source_dir / "produtopreco__Sheet1.csv"
        if not path.exists():
            batch.issues.append(ImportIssue("error", "missing_products", f"Arquivo nao encontrado: {path.name}"))
            return
        for index, row in enumerate(_read_csv(path), start=2):
            raw_code = str(row.get("codigo") or "").strip()
            if not raw_code.isdigit():
                continue
            code = _code(raw_code)
            name = str(row.get("produto") or "").strip()
            if not code or not name:
                batch.issues.append(ImportIssue("warning", "product_missing_key", "Produto sem codigo ou nome", index))
                continue
            product_id = f"{batch.organization_id}:{code}"
            batch.products.append({
                "id": product_id,
                "organization_id": batch.organization_id,
                "source_code": code,
                "barcode": str(row.get("cod_barras") or "").strip(),
                "name": name,
                "brand": str(row.get("marca") or "").strip(),
                "unit": str(row.get("und") or "UN").strip() or "UN",
            })
            batch.inventory.append({
                "organization_id": batch.organization_id,
                "store_id": batch.store_id,
                "product_id": product_id,
                "quantity_on_hand": str(_decimal(row.get("estoque", ""))),
                "sale_price": str(_decimal(row.get("preco_de_venda", ""))),
            })

    def _load_sales(self, source_dir: Path, batch: CanonicalBatch) -> None:
        path = source_dir / "saidaprod__Sheet1.csv"
        if not path.exists():
            batch.issues.append(ImportIssue("warning", "missing_sales", f"Arquivo nao encontrado: {path.name}"))
            return
        seen_customers: set[str] = set()
        for index, row in enumerate(_read_csv(path), start=2):
            raw_code = str(row.get("codigo") or "").strip()
            if not raw_code.isdigit():
                continue
            code = _code(raw_code)
            sold_at = _date(row.get("data", ""))
            shifted_legacy_export = False
            if not sold_at or not _is_plausible_business_date(sold_at):
                sold_at = _date(row.get("qtd", ""))
                shifted_legacy_export = bool(sold_at and _is_plausible_business_date(sold_at))
            if not code or not sold_at or not _is_plausible_business_date(sold_at):
                continue
            quantity_source = row.get("valor_saida", "") if shifted_legacy_export else row.get("qtd", "")
            amount_source = row.get("tipo", "") if shifted_legacy_export else row.get("valor_saida", "")
            customer_name = str(
                row.get("")
                or row.get("cliente_funcionario_fornecedor")
                or row.get("cliente")
                or ""
            ).strip()
            customer_id = f"{batch.organization_id}:cliente:{normalize_header(customer_name)}" if customer_name else None
            if customer_id:
                if customer_id not in seen_customers:
                    seen_customers.add(customer_id)
                    batch.customers.append({
                        "id": customer_id,
                        "organization_id": batch.organization_id,
                        "source_code": normalize_header(customer_name),
                        "name": customer_name,
                    })
            batch.sales.append({
                "organization_id": batch.organization_id,
                "store_id": batch.store_id,
                "product_id": f"{batch.organization_id}:{code}",
                "customer_id": customer_id,
                "sold_at": sold_at,
                "quantity": str(_decimal(quantity_source)),
                "gross_amount": str(_decimal(amount_source)),
            })

    def _load_services(self, source_dir: Path, batch: CanonicalBatch) -> None:
        path = source_dir / "servico__Sheet1.csv"
        if not path.exists():
            return
        seen_customers = {customer["id"] for customer in batch.customers}
        with path.open("r", encoding="utf-8-sig", newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)
        for index, columns in enumerate(rows[2:], start=3):
            if len(columns) < 8:
                continue
            emitted_at = _date(columns[0])
            if not emitted_at or not _is_plausible_business_date(emitted_at):
                continue
            order_number = str(columns[1] or "").strip()
            service_name = str(columns[2] or "").strip()
            customer_name = str(columns[3] or "").strip()
            if not service_name:
                continue
            customer_id = f"{batch.organization_id}:cliente:{normalize_header(customer_name)}" if customer_name else None
            if customer_id and customer_id not in seen_customers:
                seen_customers.add(customer_id)
                batch.customers.append({
                    "id": customer_id,
                    "organization_id": batch.organization_id,
                    "source_code": normalize_header(customer_name),
                    "name": customer_name,
                })
            batch.service_sales.append({
                "organization_id": batch.organization_id,
                "store_id": batch.store_id,
                "customer_id": customer_id,
                "order_number": order_number,
                "service_name": service_name,
                "customer_name": customer_name,
                "emitted_at": emitted_at,
                "quantity": str(_decimal(columns[4])),
                "gross_amount": str(_decimal(columns[5])),
                "tax_amount": str(_decimal(columns[6])),
                "net_amount": str(_decimal(columns[7])),
            })
