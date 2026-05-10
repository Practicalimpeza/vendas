from __future__ import annotations

import json
import math
import re
import sqlite3
import textwrap
from datetime import date, datetime, timedelta
from uuid import uuid4

from db_helpers import one, parse_decimal, parse_int, rows, scalar_text
from replenishment import api_replenishment


def round_to_package(quantity: float, package_size: float) -> float:
    if quantity <= 0:
        return 0.0
    if package_size and package_size > 1:
        return float(math.ceil(quantity / package_size) * package_size)
    return float(quantity)


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


def display_product_code(value: object) -> str:
    text = scalar_text(value)
    return re.sub(r"^0+(?=.)", "", text)


def quote_message(supplier_name: str, items: list[dict]) -> str:
    lines = [
        "Ola, tudo bem? Pode cotar os itens abaixo?",
        "",
    ]
    for index, item in enumerate(items, start=1):
        quantity = f"{float(item['suggested_quantity'] or 0):g}"
        unit = item.get("purchase_unit") or item.get("unit") or "un"
        ref = item.get("supplier_reference") or display_product_code(item.get("quote_code") or item.get("source_code"))
        lines.append(f"{index}. Ref {ref} - {item['name']} - {quantity} {unit}")
    lines.extend(
        [
            "",
            "Por favor informar preco, disponibilidade, prazo de entrega e validade da cotacao.",
            "Obrigado.",
        ]
    )
    return "\n".join(lines)


def _format_pdf_quantity(value: object) -> str:
    number = float(value or 0)
    if number.is_integer():
        return str(int(number))
    return f"{number:.2f}".rstrip("0").rstrip(".").replace(".", ",")


def _pdf_literal(value: object) -> bytes:
    raw = scalar_text(value).replace("\r", " ").replace("\n", " ").encode("cp1252", errors="replace")
    raw = raw.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")
    return b"(" + raw + b")"


def _pdf_text(parts: list[bytes], x: float, y: float, text: object, size: int = 10, font: str = "F1") -> None:
    parts.append(f"BT /{font} {size} Tf 1 0 0 1 {x:.2f} {y:.2f} Tm ".encode("ascii"))
    parts.append(_pdf_literal(text))
    parts.append(b" Tj ET\n")


def _pdf_line(parts: list[bytes], x1: float, y1: float, x2: float, y2: float, width: float = 0.5) -> None:
    parts.append(f"{width:.2f} w {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S\n".encode("ascii"))


def _wrap_pdf_text(value: object, width: int) -> list[str]:
    text = re.sub(r"\s+", " ", scalar_text(value))
    if not text:
        return [""]
    return textwrap.wrap(text, width=width, break_long_words=True, replace_whitespace=True) or [text]


def _safe_pdf_filename(value: object) -> str:
    text = scalar_text(value).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text, flags=re.IGNORECASE).strip("-")
    return text[:60] or "fornecedor"


def _quote_pdf_profile(conn: sqlite3.Connection, organization_id: str) -> dict:
    profile = one(
        conn,
        """
        SELECT op.*, o.name AS organization_name, o.document AS organization_document
        FROM organizations o
        LEFT JOIN organization_profiles op ON op.organization_id = o.id
        WHERE o.id = ?
        """,
        (organization_id,),
    )
    if not profile:
        return {}
    return profile


def _build_pdf(content_streams: list[bytes]) -> bytes:
    catalog_id = 1
    pages_id = 2
    font_regular_id = 3
    font_bold_id = 4
    next_id = 5
    content_ids = []
    page_ids = []
    for _ in content_streams:
        content_ids.append(next_id)
        next_id += 1
        page_ids.append(next_id)
        next_id += 1

    objects: dict[int, bytes] = {
        catalog_id: b"<< /Type /Catalog /Pages 2 0 R >>",
        font_regular_id: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        font_bold_id: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    }
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[pages_id] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("ascii")
    for index, stream in enumerate(content_streams):
        content_id = content_ids[index]
        page_id = page_ids[index]
        objects[content_id] = b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream"
        objects[page_id] = (
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 {font_regular_id} 0 R /F2 {font_bold_id} 0 R >> >> "
            f"/Contents {content_id} 0 R >>"
        ).encode("ascii")

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for object_id in range(1, max(objects) + 1):
        offsets.append(len(output))
        output.extend(f"{object_id} 0 obj\n".encode("ascii"))
        output.extend(objects[object_id])
        output.extend(b"\nendobj\n")
    xref_at = len(output)
    output.extend(f"xref\n0 {len(offsets)}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        f"trailer\n<< /Size {len(offsets)} /Root {catalog_id} 0 R >>\nstartxref\n{xref_at}\n%%EOF\n".encode("ascii")
    )
    return bytes(output)


def export_quote_pdf(conn: sqlite3.Connection, quote_id: str) -> tuple[str, bytes]:
    quote = api_quote_detail(conn, quote_id)
    profile = _quote_pdf_profile(conn, quote.get("organization_id") or "")
    company_name = (
        profile.get("trade_name")
        or profile.get("legal_name")
        or profile.get("organization_name")
        or "NexoVarejo"
    )
    company_doc = profile.get("document") or profile.get("organization_document") or ""
    company_contact = " | ".join(
        part
        for part in [
            profile.get("phone") or "",
            profile.get("email") or "",
            " ".join(part for part in [profile.get("city") or "", profile.get("state") or ""] if part).strip(),
        ]
        if part
    )
    supplier_name = quote.get("supplier_name") or "Fornecedor"
    created_at = scalar_text(quote.get("created_at"))[:10] or date.today().isoformat()
    quote_short_id = re.sub(r"[^A-Za-z0-9]+", "-", quote.get("id") or "").strip("-")[-18:]
    generated_at = datetime.now().strftime("%d/%m/%Y %H:%M")

    pages: list[list[bytes]] = []

    def table_header(parts: list[bytes], y: float) -> float:
        _pdf_line(parts, 40, y + 9, 555, y + 9, 0.8)
        _pdf_text(parts, 42, y, "Ref./codigo", 9, "F2")
        _pdf_text(parts, 145, y, "Produto", 9, "F2")
        _pdf_text(parts, 462, y, "Qtd.", 9, "F2")
        _pdf_text(parts, 520, y, "Un.", 9, "F2")
        _pdf_line(parts, 40, y - 6, 555, y - 6, 0.8)
        return y - 24

    def new_page(first: bool) -> tuple[list[bytes], float]:
        parts: list[bytes] = []
        if first:
            _pdf_text(parts, 40, 804, "Pedido de cotacao", 18, "F2")
            _pdf_text(parts, 40, 782, company_name, 11, "F2")
            if company_doc:
                _pdf_text(parts, 40, 766, f"Documento: {company_doc}", 9)
            if company_contact:
                _pdf_text(parts, 40, 752, company_contact, 9)
            _pdf_text(parts, 395, 804, f"Cotacao: {quote_short_id or '-'}", 9, "F2")
            _pdf_text(parts, 395, 790, f"Data: {created_at}", 9)
            _pdf_text(parts, 395, 776, f"Itens: {len(quote.get('items') or [])}", 9)
            _pdf_line(parts, 40, 738, 555, 738, 0.8)
            _pdf_text(parts, 40, 715, "Fornecedor", 10, "F2")
            _pdf_text(parts, 40, 699, supplier_name, 12, "F2")
            if quote.get("contact_phone"):
                _pdf_text(parts, 40, 683, f"Contato: {quote.get('contact_phone')}", 9)
            _pdf_text(parts, 40, 661, "Itens e quantidades para montagem do pedido no sistema do fornecedor.", 9)
            return parts, table_header(parts, 628)
        _pdf_text(parts, 40, 804, f"Pedido de cotacao - {supplier_name}", 13, "F2")
        _pdf_text(parts, 40, 786, f"Cotacao: {quote_short_id or '-'}", 9)
        return parts, table_header(parts, 758)

    current, y = new_page(True)
    items = quote.get("items") or []
    if not items:
        _pdf_text(current, 40, y, "Nenhum item registrado nesta cotacao.", 10)
    for item in items:
        product_lines = _wrap_pdf_text(item.get("product_name") or "", 56)
        ref = item.get("supplier_reference") or display_product_code(item.get("quote_code") or item.get("source_code"))
        ref_lines = _wrap_pdf_text(ref, 15)
        line_count = max(len(product_lines), len(ref_lines), 1)
        row_height = max(24, 12 * line_count + 10)
        if y - row_height < 62:
            pages.append(current)
            current, y = new_page(False)
        row_top = y
        for index, line in enumerate(ref_lines):
            _pdf_text(current, 42, row_top - (index * 12), line, 9)
        for index, line in enumerate(product_lines):
            _pdf_text(current, 145, row_top - (index * 12), line, 9)
        _pdf_text(current, 462, row_top, _format_pdf_quantity(item.get("requested_quantity")), 10, "F2")
        _pdf_text(current, 520, row_top, item.get("purchase_unit") or item.get("unit") or "UN", 9)
        y -= row_height
        _pdf_line(current, 40, y + 7, 555, y + 7, 0.35)
    pages.append(current)

    footer = profile.get("document_footer") or ""
    for index, parts in enumerate(pages, start=1):
        _pdf_line(parts, 40, 44, 555, 44, 0.5)
        _pdf_text(parts, 40, 30, f"Gerado pelo NexoVarejo em {generated_at}", 8)
        if footer:
            _pdf_text(parts, 205, 30, scalar_text(footer)[:72], 8)
        _pdf_text(parts, 515, 30, f"Pagina {index}", 8)

    filename = f"cotacao-{_safe_pdf_filename(supplier_name)}-{created_at.replace('-', '')}-{quote_short_id or 'pedido'}.pdf"
    return filename, _build_pdf([b"".join(parts) for parts in pages])


def latest_purchase_costs(conn: sqlite3.Connection) -> dict[str, float]:
    """Ultimo custo sem impostos por produto, usado para montar pedido minimo do fornecedor."""
    return {
        r["product_id"]: float(r["purchase_cost"] or 0)
        for r in rows(
            conn,
            """
            SELECT product_id, purchase_cost
            FROM cost_snapshots cs
            WHERE cs.id = (
                SELECT cs2.id
                FROM cost_snapshots cs2
                WHERE cs2.organization_id = cs.organization_id
                  AND cs2.product_id = cs.product_id
                ORDER BY cs2.snapshot_date DESC, cs2.id DESC
                LIMIT 1
            )
            """,
        )
    }


def api_supplier_workbench_list(conn: sqlite3.Connection) -> list[dict]:
    """Lista de fornecedores ativos com metricas para o seletor da mesa de cotacao."""
    suppliers_data = rows(
        conn,
        """
        SELECT id, name, contact_phone, minimum_order_value, target_order_value, active
        FROM suppliers
        WHERE active = 1
        ORDER BY name
        """,
    )
    full = api_replenishment(conn, limit=0)
    purchase_costs = latest_purchase_costs(conn)
    open_quotes_by_supplier = {
        row["supplier_id"]: row
        for row in rows(
            conn,
            """
            SELECT
                supplier_id,
                COUNT(*) AS open_quote_count,
                MAX(created_at) AS latest_quote_at
            FROM quote_requests
            WHERE status IN ('draft', 'sent', 'responded')
            GROUP BY supplier_id
            """,
        )
    }
    open_orders_by_product = {
        row["product_id"]: row
        for row in rows(
            conn,
            """
            SELECT
                poi.product_id,
                ROUND(COALESCE(SUM(CASE WHEN poi.decision = 'buy' THEN MAX(poi.final_quantity - COALESCE(poi.received_quantity, 0), 0) ELSE 0 END), 0), 2) AS open_order_quantity
            FROM purchase_orders po
            JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
            WHERE po.status IN ('approved', 'sent', 'partial_received')
            GROUP BY poi.product_id
            """,
        )
    }
    metrics: dict[str, dict] = {}
    for row in full["rows"]:
        sid = row.get("supplier_id") or ""
        if not sid:
            continue
        m = metrics.setdefault(
            sid,
            {"active_skus": 0, "buy_now": 0, "urgent": 0, "out_of_mix": 0, "value": 0.0, "alerts": 0},
        )
        m["active_skus"] += 1
        if row["status"] == "buy_now":
            m["buy_now"] += 1
            m["value"] += float(row["suggested_quantity"] or 0) * purchase_costs.get(row["product_id"], 0.0)
        elif row["status"] == "urgent":
            m["urgent"] += 1
            m["value"] += float(row["suggested_quantity"] or 0) * purchase_costs.get(row["product_id"], 0.0)
        elif row.get("out_of_current_mix") or row["status"] in {"blocked", "ignored", "out_of_mix"}:
            m["out_of_mix"] += 1
        silent_no_buy = row.get("out_of_current_mix") or row["status"] in {"blocked", "ignored", "out_of_mix"}
        has_alert = False
        pending_order = open_orders_by_product.get(row["product_id"]) or {}
        if float(pending_order.get("open_order_quantity") or 0) > 0 and float(row["suggested_quantity"] or 0) > 0:
            has_alert = True
        if not silent_no_buy:
            if float(row["suggested_quantity"] or 0) <= 0 and float(row["demand_30"] or 0) > 0:
                has_alert = True
            if float(row["stock_units"] or 0) <= 0 and float(row["demand_90"] or 0) > 0:
                has_alert = True
        if row.get("intermittent") and not silent_no_buy:
            has_alert = True
        if row.get("marker") == "force_one_more_purchase":
            has_alert = True
        if has_alert:
            m["alerts"] += 1
    out = []
    for s in suppliers_data:
        m = metrics.get(
            s["id"],
            {"active_skus": 0, "buy_now": 0, "urgent": 0, "out_of_mix": 0, "value": 0.0, "alerts": 0},
        )
        quote_info = open_quotes_by_supplier.get(s["id"]) or {}
        out.append(
            {
                "supplier_id": s["id"],
                "supplier_name": s["name"],
                "contact_phone": s["contact_phone"] or "",
                "minimum_order_value": float(s["minimum_order_value"] or 0),
                "target_order_value": float(s["target_order_value"] or 0),
                "active_skus": m["active_skus"],
                "buy_now_count": m["buy_now"],
                "urgent_count": m["urgent"],
                "out_of_mix_count": m["out_of_mix"],
                "alert_count": m["alerts"],
                "open_quote_count": int(quote_info.get("open_quote_count") or 0),
                "latest_quote_at": quote_info.get("latest_quote_at") or "",
                "estimated_value": round(m["value"], 2),
            }
        )
    out.sort(key=lambda x: (-x["urgent_count"], -x["buy_now_count"], x["supplier_name"]))
    return out


def api_supplier_workbench(conn: sqlite3.Connection, supplier_id: str, window_days: int = 90) -> dict:
    """Mesa de cotacao por fornecedor: todos os produtos do fornecedor com sinais de compra."""
    if not supplier_id:
        raise ValueError("supplier_id e obrigatorio.")
    if window_days not in (30, 90, 180):
        window_days = 90
    supplier = one(conn, "SELECT * FROM suppliers WHERE id = ?", (supplier_id,))
    if not supplier:
        raise ValueError("Fornecedor nao encontrado.")
    full = api_replenishment(conn, limit=0)
    supplier_rows = [r for r in full["rows"] if (r.get("supplier_id") or "") == supplier_id]

    purchase_costs = latest_purchase_costs(conn)
    open_orders_by_product = {
        row["product_id"]: row
        for row in rows(
            conn,
            """
            SELECT
                poi.product_id,
                COUNT(DISTINCT po.id) AS open_order_count,
                ROUND(COALESCE(SUM(CASE WHEN poi.decision = 'buy' THEN MAX(poi.final_quantity - COALESCE(poi.received_quantity, 0), 0) ELSE 0 END), 0), 2) AS open_order_quantity,
                ROUND(COALESCE(SUM(CASE WHEN poi.decision = 'buy' THEN MAX(poi.final_quantity - COALESCE(poi.received_quantity, 0), 0) * poi.unit_price ELSE 0 END), 0), 2) AS open_order_value
            FROM purchase_orders po
            JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
            WHERE po.supplier_id = ?
              AND po.status IN ('approved', 'sent', 'partial_received')
            GROUP BY poi.product_id
            """,
            (supplier_id,),
        )
    }

    current_quote = one(
        conn,
        """
        SELECT * FROM quote_requests
        WHERE supplier_id = ? AND status IN ('draft', 'sent', 'responded')
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (supplier_id,),
    )
    quote_items_map: dict[str, dict] = {}
    if current_quote:
        for qi in rows(
            conn,
            """
            SELECT id, product_id, requested_quantity, suggested_quantity,
                   purchase_unit, purchase_package_size, coverage_target_days, notes
            FROM quote_request_items
            WHERE quote_request_id = ?
            """,
            (current_quote["id"],),
        ):
            quote_items_map[qi["product_id"]] = qi

    quote_history = rows(
        conn,
        """
        SELECT id, status, created_at, sent_at, responded_at, approved_at,
               item_count, total_estimated_amount
        FROM quote_requests
        WHERE supplier_id = ?
        ORDER BY created_at DESC
        LIMIT 12
        """,
        (supplier_id,),
    )

    out_rows = []
    for r in supplier_rows:
        pid = r["product_id"]
        quote_item = quote_items_map.get(pid)
        base_package_size = float(r["package_size"] or 1) or 1.0
        package_size = float(quote_item.get("purchase_package_size") or base_package_size) if quote_item else base_package_size
        marker = r.get("marker") or ""
        if marker == "out_of_mix_permanent":
            mix_status = "drop"
        elif marker == "force_one_more_purchase":
            mix_status = "force_buy"
        elif r.get("out_of_current_mix"):
            mix_status = "out_of_mix"
        else:
            mix_status = "in_mix"

        if window_days == 30:
            window_demand = float(r["demand_30"] or 0)
        elif window_days == 180:
            window_demand = float(r["demand_180"] or 0)
        else:
            window_demand = float(r["demand_90"] or 0)
        avg_daily_window = window_demand / max(window_days, 1)

        cost_no_tax = round(purchase_costs.get(pid, 0.0), 4)
        cost_with_tax = round(float(r["unit_cost"] or 0), 4)
        pending_order = open_orders_by_product.get(pid) or {}

        alerts: list[str] = []
        silent_no_buy = mix_status in {"drop", "out_of_mix"} or r["status"] in {"blocked", "ignored", "out_of_mix"}
        if float(pending_order.get("open_order_quantity") or 0) > 0 and float(r["suggested_quantity"] or 0) > 0:
            alerts.append("pedido_aberto")
        if mix_status == "in_mix" and not silent_no_buy:
            if float(r["suggested_quantity"] or 0) <= 0 and float(r["demand_30"] or 0) > 0:
                alerts.append("sem_sugestao_com_demanda")
            if float(r["stock_units"] or 0) <= 0 and float(r["demand_90"] or 0) > 0:
                alerts.append("estoque_zero_com_demanda")
        if r.get("intermittent") and not silent_no_buy:
            alerts.append("vendas_intermitentes")
        if mix_status == "force_buy":
            alerts.append("forcar_compra")

        out_rows.append(
            {
                "product_id": pid,
                "organization_id": r["organization_id"],
                "source_code": r["source_code"],
                "supplier_reference": r.get("supplier_reference") or "",
                "name": r["name"],
                "brand_name": r["brand_name"] or "",
                "unit": r["unit"] or "UN",
                "purchase_unit": (quote_item.get("purchase_unit") if quote_item else "") or r["unit"] or "UN",
                "purchase_package_size": round(package_size, 2),
                "package_size": round(package_size, 2),
                "stock_units": round(float(r["stock_units"] or 0), 2),
                "demand_window": round(window_demand, 2),
                "avg_daily_window": round(avg_daily_window, 4),
                "forecast_daily_demand": round(float(r.get("forecast_daily_demand") or 0), 4),
                "demand_total": round(float(r.get("demand_total") or 0), 2),
                "max_single_sale": round(float(r.get("max_single_sale") or 0), 2),
                "demand_30": round(float(r["demand_30"] or 0), 2),
                "demand_90": round(float(r["demand_90"] or 0), 2),
                "demand_180": round(float(r["demand_180"] or 0), 2),
                "coverage_days": r.get("coverage_days"),
                "target_coverage_days": r.get("target_coverage_days"),
                "quote_coverage_target_days": quote_item.get("coverage_target_days") if quote_item else None,
                "reorder_point": r.get("reorder_point"),
                "order_up_to": r.get("order_up_to"),
                "safety_stock": r.get("safety_stock"),
                "suggested_quantity": round(float(r["suggested_quantity"] or 0), 2),
                "cost_no_tax": cost_no_tax,
                "cost_with_tax": cost_with_tax,
                "sale_price": round(float(r.get("sale_price") or 0), 2),
                "margin_pct": r.get("margin_pct"),
                "priority": round(float(r.get("priority") or 0), 1),
                "revenue": round(float(r.get("revenue") or 0), 2),
                "abc_class": r.get("abc_class") or "C",
                "status": r["status"],
                "status_label": r.get("status_label") or "",
                "open_order_quantity": round(float(pending_order.get("open_order_quantity") or 0), 2),
                "open_order_value": round(float(pending_order.get("open_order_value") or 0), 2),
                "open_order_count": int(pending_order.get("open_order_count") or 0),
                "mix_status": mix_status,
                "marker": marker,
                "in_quote": quote_item is not None,
                "quote_quantity": float(quote_item["requested_quantity"]) if quote_item else 0.0,
                "quote_item_id": quote_item["id"] if quote_item else None,
                "quote_notes": quote_item.get("notes") if quote_item else "",
                "alerts": alerts,
                "reason": r.get("reason") or "",
            }
        )

    def sort_key(row):
        in_q = 0 if row["in_quote"] else 1
        priority = 0 if row["alerts"] else 1
        return (in_q, priority, -row["suggested_quantity"], row["name"])

    out_rows.sort(key=sort_key)

    items_in_quote = sum(1 for r in out_rows if r["in_quote"])
    estimated_in_quote = round(
        sum(r["quote_quantity"] * r["cost_no_tax"] for r in out_rows if r["in_quote"]), 2
    )

    return {
        "contract": "supplier_workbench.v1",
        "supplier": {
            "id": supplier_id,
            "name": supplier["name"],
            "contact_phone": supplier["contact_phone"] or "",
            "minimum_order_value": float(supplier["minimum_order_value"] or 0),
            "target_order_value": float(supplier["target_order_value"] or 0),
            "lead_time_days": supplier["average_lead_time_days"],
        },
        "current_quote": {
            "id": current_quote["id"],
            "status": current_quote["status"],
            "created_at": current_quote["created_at"],
            "sent_at": current_quote["sent_at"],
            "responded_at": current_quote["responded_at"],
            "approved_at": current_quote["approved_at"],
            "item_count": items_in_quote,
            "estimated_value": estimated_in_quote,
        }
        if current_quote
        else None,
        "quote_history": quote_history,
        "window_days": window_days,
        "rows": out_rows,
        "totals": {
            "items_in_quote": items_in_quote,
            "estimated_value_in_quote": estimated_in_quote,
            "total_products": len(out_rows),
            "alerts_count": sum(1 for r in out_rows if r["alerts"]),
        },
    }


def upsert_quote_item(conn: sqlite3.Connection, payload: dict) -> dict:
    """Adiciona, atualiza ou remove um item da cotacao em rascunho do fornecedor."""
    organization_id = scalar_text(payload.get("organization_id"))
    supplier_id = scalar_text(payload.get("supplier_id"))
    product_id = scalar_text(payload.get("product_id"))
    requested_quantity = parse_decimal(payload.get("requested_quantity"), 0) or 0
    purchase_unit = scalar_text(payload.get("purchase_unit"))[:20]
    purchase_package_size = parse_decimal(payload.get("purchase_package_size"), None)
    coverage_target_days = parse_int(payload.get("coverage_target_days"), None)
    notes_provided = "notes" in payload
    notes = scalar_text(payload.get("notes"))[:500]
    if not organization_id or not supplier_id or not product_id:
        raise ValueError("organization_id, supplier_id e product_id sao obrigatorios.")
    if requested_quantity < 0:
        raise ValueError("Quantidade nao pode ser negativa.")
    if purchase_package_size is not None and purchase_package_size <= 0:
        raise ValueError("Embalagem de compra deve ser maior que zero.")
    if coverage_target_days is not None and coverage_target_days < 0:
        raise ValueError("Cobertura alvo nao pode ser negativa.")

    current = one(
        conn,
        """
        SELECT * FROM quote_requests
        WHERE organization_id = ? AND supplier_id = ? AND status = 'draft'
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (organization_id, supplier_id),
    )
    if not current and requested_quantity <= 0:
        return {"ok": True, "current_quote_id": None, "item_count": 0, "estimated_total": 0.0}

    product = one(
        conn,
        """
        SELECT id, source_code, name, unit
        FROM products
        WHERE organization_id = ? AND id = ?
        """,
        (organization_id, product_id),
    )
    if not product:
        raise ValueError("Produto nao encontrado.")

    cost_row = one(
        conn,
        """
        SELECT purchase_cost FROM cost_snapshots
        WHERE organization_id = ?
          AND product_id = ?
        ORDER BY snapshot_date DESC, id DESC
        LIMIT 1
        """,
        (organization_id, product_id),
    )
    unit_cost = float(cost_row["purchase_cost"] or 0) if cost_row else 0.0

    sup_ref_row = one(
        conn,
        """
        SELECT identifier_value FROM product_identifiers
        WHERE product_id = ? AND identifier_type = 'supplier_reference'
        ORDER BY id DESC LIMIT 1
        """,
        (product_id,),
    )
    supplier_reference = sup_ref_row["identifier_value"] if sup_ref_row else ""
    quote_code = supplier_reference or product["source_code"]

    if not current:
        supplier = one(
            conn,
            "SELECT name, contact_phone FROM suppliers WHERE id = ?",
            (supplier_id,),
        )
        if not supplier:
            raise ValueError("Fornecedor nao encontrado.")
        quote_id = (
            f"{organization_id}:quote:{datetime.now().strftime('%Y%m%d%H%M%S')}:{uuid4().hex[:8]}"
        )
        conn.execute(
            """
            INSERT INTO quote_requests
                (id, organization_id, supplier_id, supplier_name, contact_phone, status,
                 total_estimated_amount, item_count, message_text, notes)
            VALUES (?, ?, ?, ?, ?, 'draft', 0, 0, '', '')
            """,
            (quote_id, organization_id, supplier_id, supplier["name"], supplier["contact_phone"] or ""),
        )
        current = {"id": quote_id}

    existing = one(
        conn,
        "SELECT * FROM quote_request_items WHERE quote_request_id = ? AND product_id = ?",
        (current["id"], product_id),
    )

    if requested_quantity <= 0:
        if existing:
            conn.execute("DELETE FROM quote_request_items WHERE id = ?", (existing["id"],))
    else:
        if not purchase_unit:
            purchase_unit = scalar_text(existing.get("purchase_unit") if existing else "") or product["unit"] or "UN"
        if purchase_package_size is None:
            purchase_package_size = float(existing.get("purchase_package_size") or 1) if existing else 1.0
        if existing and not notes_provided:
            notes = scalar_text(existing.get("notes"))[:500]
        estimated_total = round(unit_cost * requested_quantity, 2)
        if existing:
            conn.execute(
                """
                UPDATE quote_request_items
                SET requested_quantity = ?,
                    purchase_unit = ?,
                    purchase_package_size = ?,
                    coverage_target_days = ?,
                    estimated_unit_cost = ?,
                    estimated_total_amount = ?,
                    notes = ?
                WHERE id = ?
                """,
                (requested_quantity, purchase_unit, float(purchase_package_size or 1), coverage_target_days, unit_cost, estimated_total, notes, existing["id"]),
            )
        else:
            conn.execute(
                """
                INSERT INTO quote_request_items
                    (quote_request_id, product_id, source_code, supplier_reference, quote_code,
                     product_name, unit, purchase_unit, purchase_package_size, coverage_target_days,
                     suggested_quantity, requested_quantity,
                     estimated_unit_cost, estimated_total_amount, reason, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    current["id"],
                    product_id,
                    product["source_code"],
                    supplier_reference,
                    quote_code,
                    product["name"],
                    product["unit"] or "UN",
                    purchase_unit or product["unit"] or "UN",
                    float(purchase_package_size or 1),
                    coverage_target_days,
                    requested_quantity,
                    requested_quantity,
                    unit_cost,
                    estimated_total,
                    "Item adicionado pela mesa de cotacao.",
                    notes,
                ),
            )

    totals = one(
        conn,
        """
        SELECT COUNT(*) AS item_count, COALESCE(SUM(estimated_total_amount), 0) AS total
        FROM quote_request_items
        WHERE quote_request_id = ?
        """,
        (current["id"],),
    ) or {"item_count": 0, "total": 0}
    item_count = int(totals["item_count"] or 0)
    total_estimated = float(totals["total"] or 0)

    if item_count == 0:
        conn.execute("DELETE FROM quote_requests WHERE id = ?", (current["id"],))
        current_quote_id = None
    else:
        conn.execute(
            """
            UPDATE quote_requests
            SET item_count = ?, total_estimated_amount = ?
            WHERE id = ?
            """,
            (item_count, total_estimated, current["id"]),
        )
        current_quote_id = current["id"]

    conn.commit()
    return {
        "ok": True,
        "current_quote_id": current_quote_id,
        "item_count": item_count,
        "estimated_total": round(total_estimated, 2),
    }


def api_quote_drafts(conn: sqlite3.Connection) -> dict:
    replenishment_rows = api_replenishment(conn, limit=0)["rows"]
    candidates = quote_candidate_rows_from_replenishment(replenishment_rows)
    decision_items = quote_mix_decision_rows_from_replenishment(replenishment_rows)
    purchase_costs = latest_purchase_costs(conn)
    grouped: dict[str, dict] = {}
    for raw_item in candidates:
        item = dict(raw_item)
        unit_cost = purchase_costs.get(item["product_id"], 0.0)
        item["unit_cost"] = unit_cost
        item["estimated_value"] = round(float(item["suggested_quantity"] or 0) * unit_cost, 2)
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
    sql += " ORDER BY created_at DESC"
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
    quote["contract"] = "quote_detail.v1"
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
        order["contract"] = "purchase_order_detail.v1"
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
        raise ValueError("Fornecedor tem apenas decisoes de mix. Decida descontinuar ou forcar compra antes de gerar cotacao.")
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
    if status == "cancelled":
        quote = one(conn, "SELECT id, status FROM quote_requests WHERE id = ?", (quote_id,))
        if not quote:
            raise ValueError("Cotacao nao encontrada.")
        if quote["status"] not in {"draft", "sent", "responded"}:
            raise ValueError("Apenas cotacoes em aberto podem ser descartadas.")
        purchase_order = one(conn, "SELECT id FROM purchase_orders WHERE quote_request_id = ? LIMIT 1", (quote_id,))
        if purchase_order:
            raise ValueError("Cotacao ja tem pedido vinculado e nao pode ser descartada.")
        conn.execute("DELETE FROM quote_request_items WHERE quote_request_id = ?", (quote_id,))
        conn.execute("DELETE FROM quote_requests WHERE id = ?", (quote_id,))
        conn.commit()
        return {"ok": True, "id": quote_id, "status": "discarded", "deleted": True}
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
            received_at,
            minimum_order_value,
            minimum_order_met,
            total_amount,
            item_count,
            approved_item_count,
            notes,
            CASE
                WHEN expected_delivery_date IS NOT NULL
                 AND expected_delivery_date <> ''
                 AND received_at IS NULL
                 AND date(expected_delivery_date) < date('now')
                THEN 1 ELSE 0
            END AS overdue
        FROM purchase_orders
    """
    params: tuple = ()
    if status:
        if status == "open":
            sql += " WHERE status IN ('approved', 'sent', 'partial_received')"
            params = ()
        else:
            sql += " WHERE status = ?"
            params = (status,)
    sql += " ORDER BY created_at DESC"
    return rows(conn, sql, params)


def api_purchase_order_detail(conn: sqlite3.Connection, order_id: str) -> dict:
    order = one(conn, "SELECT * FROM purchase_orders WHERE id = ?", (order_id,))
    if not order:
        raise ValueError("Pedido nao encontrado.")
    order["contract"] = "purchase_order_detail.v1"
    order["items"] = rows(
        conn,
        """
        SELECT *
        FROM purchase_order_items
        WHERE purchase_order_id = ?
        ORDER BY id
        """,
        (order_id,),
    )
    return order


def receive_purchase_order(conn: sqlite3.Connection, payload: dict) -> dict:
    order_id = scalar_text(payload.get("id") or payload.get("purchase_order_id"))
    item_payloads = payload.get("items") or []
    if not order_id or not isinstance(item_payloads, list):
        raise ValueError("id do pedido e lista de itens sao obrigatorios.")
    order = one(conn, "SELECT * FROM purchase_orders WHERE id = ?", (order_id,))
    if not order:
        raise ValueError("Pedido nao encontrado.")
    if order.get("status") in {"received", "cancelled"}:
        raise ValueError("Pedido ja esta encerrado.")
    item_map = {
        int(item["id"]): item
        for item in rows(conn, "SELECT * FROM purchase_order_items WHERE purchase_order_id = ?", (order_id,))
    }
    if not item_map:
        raise ValueError("Pedido sem itens.")
    payload_map = {
        int(parse_int(item.get("item_id") or item.get("id"), 0) or 0): item
        for item in item_payloads
        if isinstance(item, dict)
    }
    total_expected = 0.0
    total_received = 0.0
    divergent_items = 0
    for item_id, item in item_map.items():
        raw = payload_map.get(item_id, {})
        received_quantity = parse_decimal(raw.get("received_quantity"), None)
        if received_quantity is None:
            received_quantity = float(item.get("final_quantity") or item.get("ordered_quantity") or 0)
        if received_quantity < 0:
            raise ValueError("Quantidade recebida nao pode ser negativa.")
        notes = scalar_text(raw.get("notes") or item.get("notes"))[:500]
        expected_quantity = float(item.get("final_quantity") or item.get("ordered_quantity") or 0)
        total_expected += expected_quantity
        total_received += float(received_quantity)
        if abs(float(received_quantity) - expected_quantity) > 0.0001:
            divergent_items += 1
        conn.execute(
            """
            UPDATE purchase_order_items
            SET received_quantity = ?,
                notes = ?
            WHERE id = ?
            """,
            (float(received_quantity), notes, item_id),
        )
    status = "received" if divergent_items == 0 else "partial_received"
    conn.execute(
        """
        UPDATE purchase_orders
        SET status = ?,
            received_at = CURRENT_TIMESTAMP,
            notes = ?
        WHERE id = ?
        """,
        (status, scalar_text(payload.get("notes") or order.get("notes"))[:500], order_id),
    )
    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, 'purchase_order_received', 'purchase_order', ?, '{}', ?)
        """,
        (
            order["organization_id"],
            order_id,
            json.dumps(
                {
                    "status": status,
                    "expected_quantity": round(total_expected, 3),
                    "received_quantity": round(total_received, 3),
                    "divergent_items": divergent_items,
                    "stock_source": "erp_import",
                },
                ensure_ascii=False,
            ),
        ),
    )
    conn.commit()
    return api_purchase_order_detail(conn, order_id)


def close_purchase_order(conn: sqlite3.Connection, payload: dict) -> dict:
    quote_id = scalar_text(payload.get("id") or payload.get("quote_id"))
    item_payloads = payload.get("items") or []
    if not quote_id or not isinstance(item_payloads, list):
        raise ValueError("id da cotacao e lista de itens sao obrigatorios.")
    quote = one(conn, "SELECT * FROM quote_requests WHERE id = ?", (quote_id,))
    if not quote:
        raise ValueError("Cotacao nao encontrada.")
    if quote.get("status") not in {"draft", "sent", "responded", "approved"}:
        raise ValueError("Cotacao em status invalido para gerar pedido.")
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
            package_size = float(item.get("quoted_package_size") or item.get("purchase_package_size") or 1)
        unit_price = parse_decimal(raw.get("unit_price"), None)
        if unit_price is None:
            unit_price = float(item.get("quoted_unit_price") or item.get("estimated_unit_cost") or 0)
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
                "unit": item.get("purchase_unit") or item.get("unit") or "",
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
