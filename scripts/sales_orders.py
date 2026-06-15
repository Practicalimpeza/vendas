from __future__ import annotations

import re
import sqlite3
from datetime import datetime

from app_config import default_company_name
from db_helpers import one, parse_decimal, rows, scalar_text
from quotes import (
    _build_pdf,
    _format_pdf_money,
    _format_pdf_quantity,
    _load_pdf_logo,
    _pdf_fill_rect,
    _pdf_image,
    _pdf_line,
    _pdf_stroke_rect,
    _pdf_text,
    _pdf_text_right,
    _quote_pdf_profile,
    _safe_pdf_filename,
    _wrap_pdf_text,
)


def _customer(conn: sqlite3.Connection, customer_id: str) -> dict:
    if not customer_id:
        raise ValueError("Cliente e obrigatorio para gerar pedido de venda.")
    customer = one(
        conn,
        """
        SELECT id, organization_id, source_code, name, canonical_name, document, customer_type
        FROM customers
        WHERE id = ?
        """,
        (customer_id,),
    )
    if not customer:
        raise ValueError("Cliente nao encontrado.")
    return customer


def _last_price_sql() -> str:
    return """
        SELECT ps.sale_price
        FROM price_snapshots ps
        WHERE ps.organization_id = p.organization_id
          AND ps.product_id = p.id
        ORDER BY ps.snapshot_date DESC, ps.id DESC
        LIMIT 1
    """


def _product_item_map(conn: sqlite3.Connection, customer: dict, product_ids: list[str]) -> dict[str, dict]:
    if not product_ids:
        return {}
    placeholders = ",".join("?" for _ in product_ids)
    data = rows(
        conn,
        f"""
        SELECT
            p.id AS product_id,
            p.source_code,
            p.name,
            p.unit,
            COALESCE(b.name, '') AS brand_name,
            COALESCE(cci.negotiated_price, 0) AS negotiated_price,
            COALESCE(cci.minimum_quantity, 0) AS minimum_quantity,
            COALESCE(cci.package_size, 1) AS package_size,
            COALESCE(cci.public_notes, '') AS public_notes,
            CASE WHEN cci.id IS NULL THEN 0 ELSE 1 END AS in_customer_catalog,
            COALESCE(({_last_price_sql()}), 0) AS sale_price
        FROM products p
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN customer_catalog_items cci
          ON cci.product_id = p.id
         AND cci.customer_id = ?
         AND cci.organization_id = p.organization_id
         AND cci.status <> 'archived'
        WHERE p.organization_id = ?
          AND p.id IN ({placeholders})
        """,
        (customer["id"], customer["organization_id"], *product_ids),
    )
    return {row["product_id"]: row for row in data}


def _requested_items(conn: sqlite3.Connection, customer: dict, payload: dict) -> list[dict]:
    raw_items = payload.get("items")
    if not isinstance(raw_items, list):
        raise ValueError("Itens do pedido sao obrigatorios.")
    requested: list[dict] = []
    product_ids: list[str] = []
    quantities: dict[str, float] = {}
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        product_id = scalar_text(raw.get("product_id"))
        quantity = parse_decimal(raw.get("quantity"), None)
        if not product_id or quantity is None or quantity <= 0:
            continue
        if product_id not in quantities:
            product_ids.append(product_id)
            quantities[product_id] = 0.0
        quantities[product_id] += float(quantity)
    item_map = _product_item_map(conn, customer, product_ids)
    for product_id in product_ids:
        item = item_map.get(product_id)
        if not item:
            continue
        unit_price = float(item.get("negotiated_price") or item.get("sale_price") or 0)
        quantity = round(float(quantities[product_id]), 3)
        source_note = "Catalogo do cliente" if int(item.get("in_customer_catalog") or 0) else "Item avulso"
        requested.append(
            {
                **item,
                "order_source_note": source_note,
                "quantity": quantity,
                "unit_price": unit_price,
                "line_total": round(quantity * unit_price, 2),
            }
        )
    if not requested:
        raise ValueError("Selecione ao menos um item com quantidade para gerar o pedido.")
    return requested


def _company_profile(conn: sqlite3.Connection, organization_id: str) -> dict:
    profile = _quote_pdf_profile(conn, organization_id)
    return profile or {}


def export_sales_order_pdf(conn: sqlite3.Connection, payload: dict) -> tuple[str, bytes]:
    customer = _customer(conn, scalar_text(payload.get("customer_id")))
    items = _requested_items(conn, customer, payload)
    profile = _company_profile(conn, customer["organization_id"])
    company_name = (
        profile.get("trade_name")
        or profile.get("legal_name")
        or profile.get("organization_name")
        or default_company_name()
    )
    company_doc = profile.get("document") or profile.get("organization_document") or ""
    company_contact = " | ".join(
        part
        for part in [
            profile.get("contact_name") or "",
            profile.get("phone") or "",
            profile.get("email") or "",
            profile.get("website") or "",
        ]
        if part
    )
    generated_at = datetime.now().strftime("%d/%m/%Y %H:%M")
    order_ref = datetime.now().strftime("%Y%m%d-%H%M")
    seller_name = scalar_text(payload.get("seller_name"))[:120]
    notes = scalar_text(payload.get("notes"))[:700]
    total_amount = round(sum(float(item["line_total"] or 0) for item in items), 2)
    total_quantity = round(sum(float(item["quantity"] or 0) for item in items), 3)
    logo = _load_pdf_logo(profile.get("logo_path"))
    images = [logo] if logo else []

    ink = (0.075, 0.086, 0.082)
    muted = (0.390, 0.420, 0.405)
    subtle = (0.690, 0.725, 0.705)
    border = (0.860, 0.875, 0.865)
    hairline = (0.920, 0.932, 0.925)
    surface = (0.992, 0.994, 0.992)
    soft = (0.950, 0.955, 0.952)
    panel = (0.978, 0.982, 0.979)
    accent = (0.120, 0.500, 0.390)
    white = (1, 1, 1)

    pages: list[list[bytes]] = []

    def fit_text(value: object, limit: int) -> str:
        text = re.sub(r"\s+", " ", scalar_text(value)).strip()
        if len(text) <= limit:
            return text
        return text[: max(0, limit - 3)].rstrip() + "..."

    def draw_logo(parts: list[bytes], x: float, y: float, w: float, h: float) -> None:
        if logo:
            ratio = min(w / logo["width"], h / logo["height"])
            image_w = logo["width"] * ratio
            image_h = logo["height"] * ratio
            _pdf_image(parts, logo["name"], x + (w - image_w) / 2, y + (h - image_h) / 2, image_w, image_h)
            return
        initials = "".join(part[:1] for part in scalar_text(company_name).split()[:2]).upper() or "NV"
        _pdf_fill_rect(parts, x + 7, y + 7, 42, 42, accent)
        _pdf_text(parts, x + 16, y + 26, initials[:2], 11, "F2", white)

    def draw_metric(parts: list[bytes], x: float, y: float, w: float, label: str, value: object) -> None:
        _pdf_fill_rect(parts, x, y, w, 34, panel)
        _pdf_stroke_rect(parts, x, y, w, 34, border, 0.3)
        _pdf_text(parts, x + 9, y + 20, label.upper(), 5, "F2", subtle)
        _pdf_text(parts, x + 9, y + 8, fit_text(value, 20), 9, "F2", ink)

    def new_page(continuation: bool = False) -> list[bytes]:
        parts: list[bytes] = []
        pages.append(parts)
        _pdf_fill_rect(parts, 0, 0, 595, 842, surface)
        _pdf_fill_rect(parts, 0, 744, 595, 82, white)
        _pdf_fill_rect(parts, 36, 736, 523, 3, accent)
        _pdf_line(parts, 36, 728, 559, 728, 0.30, border)
        draw_logo(parts, 40, 762, 118, 52)
        _pdf_text(parts, 190, 798, "Pedido de venda", 19, "F2", ink)
        for index, line in enumerate(_wrap_pdf_text(company_name, 58)[:2]):
            _pdf_text(parts, 191, 779 - (index * 10), fit_text(line, 58), 8, "F2", muted)
        _pdf_fill_rect(parts, 428, 779, 131, 28, panel)
        _pdf_stroke_rect(parts, 428, 779, 131, 28, border, 0.3)
        _pdf_text(parts, 439, 796, f"Ref. {order_ref}", 8, "F2", ink)
        _pdf_text(parts, 439, 785, f"Emissao {generated_at[:10]}", 7, "F1", muted)
        if continuation:
            _pdf_text(parts, 478, 712, "continuacao", 8, "F2", muted)
        return parts

    first = new_page()
    _pdf_text(first, 36, 704, "Cliente", 8, "F2", subtle)
    _pdf_text(first, 36, 690, fit_text(customer.get("name") or "Cliente", 74), 12, "F2", ink)
    _pdf_text(first, 36, 675, fit_text(" | ".join(part for part in [customer.get("document") or "", customer.get("source_code") or ""] if part) or "-", 82), 8, "F1", muted)
    _pdf_text(first, 320, 704, "Vendedor", 8, "F2", subtle)
    _pdf_text(first, 320, 690, fit_text(seller_name or "A preencher", 34), 11, "F2", ink)
    _pdf_text(first, 320, 675, fit_text(company_contact or company_doc or "-", 42), 8, "F1", muted)
    draw_metric(first, 36, 625, 126, "Itens", len(items))
    draw_metric(first, 172, 625, 126, "Quantidade", _format_pdf_quantity(total_quantity))
    draw_metric(first, 308, 625, 126, "Total", _format_pdf_money(total_amount))
    draw_metric(first, 444, 625, 115, "Lancamento", "Manual")

    def draw_table_header(parts: list[bytes], y: float) -> None:
        _pdf_fill_rect(parts, 36, y - 9, 523, 25, soft)
        _pdf_stroke_rect(parts, 36, y - 9, 523, 25, border, 0.25)
        _pdf_fill_rect(parts, 36, y + 14, 523, 2, accent)
        _pdf_text(parts, 48, y, "#", 7, "F2", ink)
        _pdf_text(parts, 72, y, "CODIGO", 7, "F2", ink)
        _pdf_text(parts, 136, y, "PRODUTO", 7, "F2", ink)
        _pdf_text_right(parts, 408, y, "QTD.", 7, "F2", ink)
        _pdf_text_right(parts, 482, y, "UNIT.", 7, "F2", ink)
        _pdf_text_right(parts, 548, y, "TOTAL", 7, "F2", ink)

    current = first
    y = 590
    draw_table_header(current, y)
    y -= 18
    for index, item in enumerate(items, start=1):
        lines = _wrap_pdf_text(item.get("name") or "", 36)[:2]
        note = " | ".join(part for part in [item.get("order_source_note"), item.get("public_notes")] if scalar_text(part))
        row_height = 31 + (len(lines) - 1) * 9 + (9 if note else 0)
        if y - row_height < 86:
            current = new_page(True)
            y = 704
            draw_table_header(current, y)
            y -= 18
        row_bottom = y - row_height + 8
        _pdf_fill_rect(current, 36, row_bottom, 523, row_height, white if index % 2 else panel)
        _pdf_fill_rect(current, 36, row_bottom, 3, row_height, accent if index % 2 else hairline)
        _pdf_text(current, 48, y - 8, str(index), 8, "F2", ink)
        _pdf_text(current, 72, y - 8, fit_text(item.get("source_code") or item.get("product_id") or "-", 12), 8, "F2", ink)
        for line_index, line in enumerate(lines):
            _pdf_text(current, 136, y - 8 - (line_index * 9), fit_text(line, 38), 8, "F2" if line_index == 0 else "F1", ink if line_index == 0 else muted)
        if note:
            _pdf_text(current, 136, y - 8 - (len(lines) * 9), fit_text(note, 58), 6, "F1", muted)
        _pdf_text_right(current, 408, y - 8, _format_pdf_quantity(item.get("quantity")), 8, "F2", ink)
        _pdf_text_right(current, 482, y - 8, _format_pdf_money(item.get("unit_price")), 8, "F1", ink)
        _pdf_text_right(current, 548, y - 8, _format_pdf_money(item.get("line_total")), 8, "F2", ink)
        y -= row_height + 3

    footer_lines = _wrap_pdf_text(notes or "Pedido operacional para lancamento manual pelo financeiro. Conferir disponibilidade, condicoes e dados fiscais antes de faturar.", 92)[:3]
    for page_index, parts in enumerate(pages, start=1):
        _pdf_fill_rect(parts, 0, 0, 595, 52, soft)
        _pdf_line(parts, 36, 46, 559, 46, 0.45, border)
        _pdf_text(parts, 36, 31, f"Gerado em {generated_at}", 8, "F2", ink)
        if footer_lines:
            _pdf_text(parts, 160, 31, footer_lines[0], 7, "F1", muted)
        _pdf_text_right(parts, 559, 31, f"Pagina {page_index}/{len(pages)}", 8, "F2", ink)

    filename = f"pedido-venda-{_safe_pdf_filename(customer.get('name') or 'cliente')}-{order_ref}.pdf"
    return filename, _build_pdf([b"".join(parts) for parts in pages], images)
