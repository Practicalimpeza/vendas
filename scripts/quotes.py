from __future__ import annotations

import json
import math
import re
import sqlite3
import struct
import textwrap
import zlib
from datetime import date, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from app_config import app_name, default_company_name
from db_helpers import normalize_code, one, parse_decimal, parse_int, rows, scalar_text
from quote_cache import quote_replenishment_payload


def round_to_package(quantity: float, package_size: float) -> float:
    if quantity <= 0:
        return 0.0
    if package_size and package_size > 1:
        return float(math.ceil(quantity / package_size) * package_size)
    return float(quantity)


QUOTE_STATUSES = {"urgent", "buy_now"}


def quote_auto_suggestion(row: dict) -> bool:
    if not row.get("supplier_configured") or not row.get("supplier_id"):
        return False
    if float(row.get("suggested_quantity") or 0) <= 0:
        return False
    if row.get("out_of_current_mix") or row.get("status") in {"blocked", "ignored", "out_of_mix"}:
        return False
    if row.get("package_blocks_auto"):
        return False
    if row.get("status") in QUOTE_STATUSES:
        return True
    return row.get("status") == "mix_review" and float(row.get("demand_30") or 0) > 0


def _first_present(rows_: list[dict], key: str, default=None):
    for row in rows_:
        value = row.get(key)
        if value not in (None, ""):
            return value
    return default


def _money_br(value: float) -> str:
    return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def supplier_order_formation_plan(
    *,
    supplier: dict,
    supplier_rows: list[dict],
    current_value: float,
    auto_value: float,
    urgent_count: int,
    buy_now_count: int,
    alert_count: int,
) -> dict:
    minimum = float(supplier.get("minimum_order_value") or 0)
    target = float(supplier.get("target_order_value") or 0)
    threshold = target if target > minimum else minimum
    threshold_kind = "target" if target > minimum else "minimum"
    days_to_order = _first_present(supplier_rows, "supplier_days_to_order")
    review_cycle_days = _first_present(supplier_rows, "review_cycle_days")
    lead_time_days = _first_present(supplier_rows, "lead_time_days", supplier.get("average_lead_time_days"))
    difficulty = str(_first_present(supplier_rows, "supplier_difficulty", "") or "")
    daily_purchase_value = float(_first_present(supplier_rows, "supplier_daily_purchase_value", 0) or 0)
    active_skus = int(_first_present(supplier_rows, "supplier_active_skus", 0) or 0)

    days_to_order_value = float(days_to_order) if days_to_order not in (None, "") else None
    review_cycle_value = int(float(review_cycle_days or 0)) if review_cycle_days not in (None, "") else None
    lead_time_value = int(float(lead_time_days or 0)) if lead_time_days not in (None, "") else None
    missing = max(threshold - current_value, 0.0)
    auto_missing = max(threshold - auto_value, 0.0)
    progress_pct = (current_value / threshold * 100.0) if threshold > 0 else (100.0 if current_value > 0 else 0.0)

    status = "no_minimum"
    label = "Sem minimo"
    rank = "no_min"
    recommendation = "Cadastrar pedido minimo"
    strategy = "configure_minimum"
    reason = f"Sem pedido minimo cadastrado; o {app_name()} nao sabe quando vale formar pedido ou aguardar acumulo."

    if threshold <= 0:
        if current_value > 0:
            status = "no_minimum_with_demand"
            label = "Sem minimo"
            recommendation = "Revisar cadastro"
            reason = "Ha demanda tecnica, mas sem minimo cadastrado para decidir se o pedido fecha bem."
    elif current_value >= threshold:
        status = "ready"
        label = "Pronto"
        rank = "ready"
        recommendation = "Cotar agora"
        strategy = "quote_now"
        reason = "A demanda tecnica ja atinge o valor minimo do fornecedor."
    elif urgent_count > 0:
        status = "risk_below_minimum"
        label = "Risco abaixo do minimo"
        rank = "risk"
        recommendation = "Revisar urgencia"
        strategy = "risk_review"
        reason = (
            f"Existem {urgent_count} item(ns) urgente(s), mas ainda faltam {_money_br(missing)} "
            "para fechar o minimo; pode exigir compra tatica, substituto ou negociacao."
        )
    elif days_to_order_value is not None and days_to_order_value >= 120:
        status = "long_cycle_below_minimum"
        label = "Ciclo dificil"
        rank = "below_min"
        recommendation = "Acumular ou negociar"
        strategy = "wait_or_negotiate"
        active_text = f"{active_skus} itens ativos" if active_skus else "itens ativos"
        reason = (
            f"Mesmo somando a demanda anual dos {active_text}, "
            f"o fornecedor tende a formar pedido em cerca de {days_to_order_value:.0f} dias; "
            "nao convem completar minimo automaticamente."
        )
    elif difficulty == "hard" or (days_to_order_value is not None and days_to_order_value >= 60):
        status = "forming_order"
        label = "Formando pedido"
        rank = "below_min"
        recommendation = "Completar com criterio"
        strategy = "candidate_review"
        cycle_text = f"cerca de {days_to_order_value:.0f} dias" if days_to_order_value is not None else "ciclo longo"
        reason = (
            f"O fornecedor ainda esta abaixo do minimo e tem {cycle_text} para formar pedido; "
            "complete apenas com itens de giro, ruptura ou mix estrategico."
        )
    else:
        status = "below_minimum"
        label = "Abaixo do minimo"
        rank = "below_min"
        recommendation = "Completar minimo"
        strategy = "complete_minimum"
        reason = "O pedido esta abaixo do minimo, mas o ciclo do fornecedor nao parece longo."

    return {
        "status": status,
        "label": label,
        "rank": rank,
        "recommendation": recommendation,
        "strategy": strategy,
        "reason": reason,
        "threshold_value": round(threshold, 2),
        "threshold_kind": threshold_kind,
        "current_value": round(current_value, 2),
        "auto_value": round(auto_value, 2),
        "missing_value": round(missing, 2),
        "auto_missing_value": round(auto_missing, 2),
        "progress_pct": round(progress_pct, 1),
        "days_to_order": round(days_to_order_value, 1) if days_to_order_value is not None else None,
        "review_cycle_days": review_cycle_value,
        "lead_time_days": lead_time_value,
        "difficulty": difficulty,
        "daily_purchase_value": round(daily_purchase_value, 2),
        "active_skus": active_skus,
        "urgent_count": urgent_count,
        "buy_now_count": buy_now_count,
        "alert_count": alert_count,
    }


def supplier_order_formation_fields(plan: dict) -> dict:
    return {
        "order_formation_status": plan["status"],
        "order_formation_label": plan["label"],
        "order_formation_rank": plan["rank"],
        "order_formation_recommendation": plan["recommendation"],
        "order_formation_strategy": plan["strategy"],
        "order_formation_reason": plan["reason"],
        "order_formation_threshold_value": plan["threshold_value"],
        "order_formation_missing_value": plan["missing_value"],
        "order_formation_progress_pct": plan["progress_pct"],
        "supplier_difficulty": plan["difficulty"],
        "supplier_days_to_order": plan["days_to_order"],
        "supplier_review_cycle_days": plan["review_cycle_days"],
        "supplier_daily_purchase_value": plan["daily_purchase_value"],
    }


def minimum_fill_profile(row: dict) -> dict:
    cost = float(row.get("cost_no_tax") or row.get("unit_cost") or 0)
    suggested_quantity = float(row.get("suggested_quantity") or 0)
    technical_quantity = float(row.get("technical_quantity") or row.get("rounded_need") or 0)
    raw_need = float(row.get("raw_need") or 0)
    package_size = float(row.get("purchase_package_size") or row.get("package_size") or 1) or 1.0
    demand_90 = float(row.get("demand_90") or 0)
    demand_180 = float(row.get("demand_180") or 0)
    sale_days_180 = int(row.get("sale_days_180") or 0)
    package_days = float(row.get("package_coverage_days") or 0)
    status = row.get("status") or ""
    in_mix = row.get("mix_status", "in_mix") == "in_mix"
    open_order_quantity = float(row.get("open_order_quantity") or 0)
    forecast_daily = float(row.get("forecast_daily_demand") or row.get("avg_daily_window") or 0)
    projected_stock_units = float(row.get("projected_stock_units") or row.get("stock_units") or 0)
    target_days = float(row.get("order_horizon_days") or row.get("target_coverage_days") or 0)

    base = {
        "order_formation_role": "defer",
        "minimum_fill_candidate": False,
        "minimum_fill_auto_safe": False,
        "minimum_fill_quantity": 0.0,
        "minimum_fill_value": 0.0,
        "minimum_fill_reason": "",
        "minimum_fill_rank": 0,
    }
    if row.get("quote_suggestion_eligible") or quote_auto_suggestion(row):
        quantity = suggested_quantity
        return {
            **base,
            "order_formation_role": "required",
            "minimum_fill_quantity": round(quantity, 2),
            "minimum_fill_value": round(quantity * cost, 2),
            "minimum_fill_reason": "Item obrigatorio pela necessidade tecnica calculada.",
            "minimum_fill_rank": 1000 + int(float(row.get("priority") or 0)),
        }
    if not in_mix or status in {"blocked", "ignored", "out_of_mix", "no_demand", "excess"}:
        return base
    if open_order_quantity > 0:
        return {**base, "minimum_fill_reason": "Ja existe pedido aberto; evite duplicar para completar minimo."}
    if cost <= 0:
        return {**base, "minimum_fill_reason": "Sem custo de compra para calcular complemento do minimo."}
    if demand_90 <= 0 and demand_180 <= 0 and sale_days_180 <= 0:
        return {**base, "minimum_fill_reason": "Sem venda recente suficiente para completar pedido minimo."}
    if raw_need <= 0 and technical_quantity <= 0:
        return {**base, "minimum_fill_reason": "Alvo tecnico ja coberto; nao usar para completar minimo."}

    quantity = technical_quantity if technical_quantity > 0 else suggested_quantity if suggested_quantity > 0 else package_size
    value = quantity * cost
    candidate_after_days = (projected_stock_units + quantity) / forecast_daily if forecast_daily > 0 else None
    excess_days_after_fill = (
        max(candidate_after_days - target_days, 0.0)
        if candidate_after_days is not None and target_days > 0
        else 0.0
    )
    candidate = raw_need > 0 and (demand_90 > 0 or sale_days_180 >= 2)
    auto_safe = (
        candidate
        and status in {"watch", "ok"}
        and not row.get("package_blocks_auto")
        and (package_days <= 0 or package_days <= 120)
        and (candidate_after_days is None or target_days <= 0 or candidate_after_days <= max(target_days * 1.35, target_days + 21))
    )
    reason = "Candidato para completar minimo por ter venda recente."
    if excess_days_after_fill > 0:
        reason = f"Candidato: completaria minimo com cerca de {excess_days_after_fill:.0f} dia(s) acima do alvo."
    if row.get("package_blocks_auto"):
        reason = "Candidato manual: a caixa pesa no estoque e precisa decisao do comprador."
    elif status == "mix_review":
        reason = "Candidato manual: a regra de embalagem pede revisao antes de comprar."
    return {
        **base,
        "order_formation_role": "fill_candidate" if candidate else "defer",
        "minimum_fill_candidate": candidate,
        "minimum_fill_auto_safe": auto_safe,
        "minimum_fill_quantity": round(quantity, 2),
        "minimum_fill_value": round(value, 2),
        "minimum_fill_reason": reason,
        "minimum_fill_rank": int(float(row.get("priority") or 0)) + (80 if auto_safe else 30) + int(demand_90) - int(excess_days_after_fill),
    }


def supplier_basket_plan(*, supplier: dict, workbench_rows: list[dict], formation: dict) -> dict:
    threshold = float(formation.get("threshold_value") or 0)
    selected_fill_ids: set[str] = set()
    required_value = 0.0
    required_items = 0
    def is_required(row: dict) -> bool:
        return bool(row.get("quote_suggestion_eligible")) or quote_auto_suggestion(row)

    for row in workbench_rows:
        if is_required(row):
            quantity = float(row.get("suggested_quantity") or 0)
            value = quantity * float(row.get("cost_no_tax") or 0)
            required_value += value
            required_items += 1

    recommended_value = required_value
    strategy = str(formation.get("strategy") or "")
    can_complete = threshold > 0 and strategy in {"complete_minimum", "candidate_review", "risk_review", "quote_now"}
    if can_complete and recommended_value < threshold:
        candidates = [
            row
            for row in workbench_rows
            if row.get("minimum_fill_auto_safe")
            and not is_required(row)
            and not row.get("in_quote")
            and float(row.get("minimum_fill_quantity") or 0) > 0
            and float(row.get("cost_no_tax") or 0) > 0
        ]

        def candidate_score(row: dict) -> tuple:
            quantity = float(row.get("minimum_fill_quantity") or 0)
            cost = float(row.get("cost_no_tax") or 0)
            value = quantity * cost
            forecast_daily = float(row.get("forecast_daily_demand") or row.get("avg_daily_window") or 0)
            projected_stock_units = float(row.get("projected_stock_units") or row.get("stock_units") or 0)
            projected_days = (projected_stock_units + quantity) / forecast_daily if forecast_daily > 0 else float(row.get("projected_coverage_days") or 0)
            target_days = float(row.get("order_horizon_days") or row.get("target_coverage_days") or 0)
            package_days = float(row.get("package_coverage_days") or 0)
            excess_penalty = max(projected_days - target_days, 0.0) * 0.25 if target_days > 0 else 0.0
            package_penalty = max(package_days - 90, 0.0) * 0.50 if package_days > 0 else 0.0
            stockout_bonus = float(row.get("risk_gap_days") or 0) * 0.80
            gap_fit = min(value / max(threshold - recommended_value, 1.0), 1.2)
            score = (
                float(row.get("minimum_fill_rank") or 0)
                + float(row.get("priority") or 0) * 0.30
                + float(row.get("demand_90") or 0) * 0.20
                + stockout_bonus
                + gap_fit * 35
                - excess_penalty
                - package_penalty
            )
            return (score, -value, str(row.get("name") or ""))

        for row in sorted(candidates, key=candidate_score, reverse=True):
            if recommended_value >= threshold:
                break
            quantity = float(row.get("minimum_fill_quantity") or 0)
            value = quantity * float(row.get("cost_no_tax") or 0)
            selected_fill_ids.add(row["product_id"])
            recommended_value += value

    selected_fill_value = 0.0
    selected_fill_count = 0
    for row in workbench_rows:
        required = is_required(row)
        selected_fill = row["product_id"] in selected_fill_ids
        cost = float(row.get("cost_no_tax") or 0)
        if required:
            quantity = float(row.get("suggested_quantity") or 0)
            role = "required"
            label = row.get("purchase_decision_label") or "Essencial"
            reason = row.get("purchase_decision_reason") or row.get("reason") or "Item entra pela necessidade tecnica calculada."
            score = 1000 + float(row.get("priority") or 0)
        elif selected_fill:
            quantity = float(row.get("minimum_fill_quantity") or 0)
            value = quantity * cost
            selected_fill_count += 1
            selected_fill_value += value
            role = "fill_selected"
            label = "Completa minimo"
            reason = (
                f"{row.get('minimum_fill_reason') or 'Candidato seguro para completar minimo.'} "
                "Selecionado pela cesta para aproximar o fornecedor do minimo com baixo risco de excesso."
            )
            score = 700 + float(row.get("minimum_fill_rank") or 0)
        elif row.get("minimum_fill_candidate"):
            quantity = float(row.get("minimum_fill_quantity") or 0)
            role = "fill_candidate"
            label = "Candidato"
            reason = row.get("minimum_fill_reason") or "Pode ajudar na formacao do pedido minimo, mas pede revisao."
            score = 300 + float(row.get("minimum_fill_rank") or 0)
        elif row.get("purchase_decision") in {"blocked", "excess", "no_demand"}:
            quantity = 0.0
            role = row.get("purchase_decision") or "defer"
            label = row.get("purchase_decision_label") or "Aguardar"
            reason = row.get("purchase_decision_reason") or row.get("reason") or ""
            score = 0.0
        else:
            quantity = 0.0
            role = "defer"
            label = row.get("purchase_decision_label") or "Aguardar"
            reason = row.get("purchase_decision_reason") or row.get("reason") or ""
            score = float(row.get("priority") or 0)

        value = quantity * cost
        row.update(
            {
                "basket_role": role,
                "basket_selected": required or selected_fill,
                "basket_decision_label": label,
                "basket_decision_reason": reason,
                "basket_score": round(score, 1),
                "recommended_quote_quantity": round(quantity, 2),
                "recommended_quote_value": round(value, 2),
            }
        )

    return {
        "threshold_value": round(threshold, 2),
        "required_value": round(required_value, 2),
        "required_items": required_items,
        "selected_fill_count": selected_fill_count,
        "selected_fill_value": round(selected_fill_value, 2),
        "recommended_value": round(recommended_value, 2),
        "recommended_gap_value": round(max(threshold - recommended_value, 0.0), 2),
        "strategy": strategy,
    }


def quote_candidate_rows(conn: sqlite3.Connection) -> list[dict]:
    return quote_candidate_rows_from_replenishment(quote_replenishment_rows(conn))


def quote_replenishment_rows(conn: sqlite3.Connection) -> list[dict]:
    return quote_replenishment_payload(conn)["rows"]


def quote_candidate_rows_from_replenishment(replenishment_rows: list[dict]) -> list[dict]:
    candidates = []
    for row in replenishment_rows:
        if not quote_auto_suggestion(row):
            continue
        candidates.append(row)
    return candidates


def quote_mix_decision_rows(conn: sqlite3.Connection) -> list[dict]:
    return quote_mix_decision_rows_from_replenishment(quote_replenishment_rows(conn))


def quote_mix_decision_rows_from_replenishment(replenishment_rows: list[dict]) -> list[dict]:
    return [
        row
        for row in replenishment_rows
        if row["status"] == "mix_review" and row["supplier_configured"] and row["supplier_id"] and not quote_auto_suggestion(row)
    ]


def display_product_code(value: object) -> str:
    return normalize_code(value)


def quote_message(supplier_name: str, items: list[dict]) -> str:
    lines = [
        "Ola, tudo bem? Pode cotar os itens abaixo?",
        "",
    ]
    for index, item in enumerate(items, start=1):
        quantity = f"{float(item['suggested_quantity'] or 0):g}"
        unit = item.get("purchase_unit") or item.get("unit") or "un"
        ref = normalize_code(item.get("supplier_reference") or "") or "sem referencia"
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


def _format_pdf_money(value: object) -> str:
    amount = float(value or 0)
    return f"R$ {amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def _pdf_package_unit(value: object) -> str:
    raw = scalar_text(value).upper() or "CX"
    return {"UN": "CX"}.get(raw, raw)


def _pdf_base_unit_label(_value: object) -> str:
    return "UNIDADES"


def _quote_status_pdf_label(status: object) -> str:
    return {
        "draft": "Rascunho",
        "sent": "Enviado",
        "responded": "Respondido",
        "approved": "Aprovado",
        "cancelled": "Cancelado",
    }.get(scalar_text(status), scalar_text(status) or "-")


def _pdf_literal(value: object) -> bytes:
    raw = scalar_text(value).replace("\r", " ").replace("\n", " ").encode("cp1252", errors="replace")
    raw = raw.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)")
    return b"(" + raw + b")"


def _pdf_text(
    parts: list[bytes],
    x: float,
    y: float,
    text: object,
    size: int = 10,
    font: str = "F1",
    color: tuple[float, float, float] | None = None,
) -> None:
    if color:
        parts.append(f"q {color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg ".encode("ascii"))
    parts.append(f"BT /{font} {size} Tf 1 0 0 1 {x:.2f} {y:.2f} Tm ".encode("ascii"))
    parts.append(_pdf_literal(text))
    parts.append(b" Tj ET")
    parts.append(b" Q\n" if color else b"\n")


def _pdf_text_right(
    parts: list[bytes],
    right_x: float,
    y: float,
    text: object,
    size: int = 10,
    font: str = "F1",
    color: tuple[float, float, float] | None = None,
) -> None:
    # Approximation is enough for tabular numeric alignment with Helvetica.
    x = right_x - (len(scalar_text(text)) * size * 0.52)
    _pdf_text(parts, max(0, x), y, text, size, font, color)


def _pdf_line(
    parts: list[bytes],
    x1: float,
    y1: float,
    x2: float,
    y2: float,
    width: float = 0.5,
    color: tuple[float, float, float] | None = None,
) -> None:
    if color:
        parts.append(f"q {color[0]:.3f} {color[1]:.3f} {color[2]:.3f} RG ".encode("ascii"))
    parts.append(f"{width:.2f} w {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S".encode("ascii"))
    parts.append(b" Q\n" if color else b"\n")


def _pdf_fill_rect(parts: list[bytes], x: float, y: float, w: float, h: float, color: tuple[float, float, float]) -> None:
    parts.append(f"q {color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg {x:.2f} {y:.2f} {w:.2f} {h:.2f} re f Q\n".encode("ascii"))


def _pdf_stroke_rect(
    parts: list[bytes],
    x: float,
    y: float,
    w: float,
    h: float,
    color: tuple[float, float, float],
    width: float = 0.5,
) -> None:
    parts.append(f"q {color[0]:.3f} {color[1]:.3f} {color[2]:.3f} RG {width:.2f} w {x:.2f} {y:.2f} {w:.2f} {h:.2f} re S Q\n".encode("ascii"))


def _pdf_image(parts: list[bytes], name: str, x: float, y: float, w: float, h: float) -> None:
    parts.append(f"q {w:.2f} 0 0 {h:.2f} {x:.2f} {y:.2f} cm /{name} Do Q\n".encode("ascii"))


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


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def _png_rows(path: Path) -> tuple[int, int, int, bytes] | None:
    try:
        data = path.read_bytes()
    except OSError:
        return None
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    cursor = 8
    width = height = bit_depth = color_type = 0
    idat = bytearray()
    while cursor + 8 <= len(data):
        length = struct.unpack(">I", data[cursor : cursor + 4])[0]
        chunk_type = data[cursor + 4 : cursor + 8]
        chunk = data[cursor + 8 : cursor + 8 + length]
        cursor += 12 + length
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, _compression, _filter, interlace = struct.unpack(">IIBBBBB", chunk)
            if bit_depth != 8 or color_type not in {2, 6} or interlace:
                return None
        elif chunk_type == b"IDAT":
            idat.extend(chunk)
        elif chunk_type == b"IEND":
            break
    if not width or not height or not idat:
        return None
    channels = 4 if color_type == 6 else 3
    stride = width * channels
    try:
        raw = zlib.decompress(bytes(idat))
    except zlib.error:
        return None
    rows_out = bytearray()
    previous = bytearray(stride)
    offset = 0
    for _row_index in range(height):
        if offset + 1 + stride > len(raw):
            return None
        filter_type = raw[offset]
        offset += 1
        row = bytearray(raw[offset : offset + stride])
        offset += stride
        for index in range(stride):
            left = row[index - channels] if index >= channels else 0
            up = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_type == 1:
                row[index] = (row[index] + left) & 0xFF
            elif filter_type == 2:
                row[index] = (row[index] + up) & 0xFF
            elif filter_type == 3:
                row[index] = (row[index] + ((left + up) // 2)) & 0xFF
            elif filter_type == 4:
                row[index] = (row[index] + _paeth(left, up, upper_left)) & 0xFF
            elif filter_type != 0:
                return None
        rows_out.extend(row)
        previous = row
    return width, height, channels, bytes(rows_out)


def _resolve_pdf_logo_path(logo_path: object) -> Path | None:
    raw = scalar_text(logo_path)
    base = Path(__file__).resolve().parents[1]
    candidates = []
    if raw:
        if raw.startswith("/"):
            candidates.append(base / "web" / raw.lstrip("/"))
        else:
            candidates.append(base / raw)
            candidates.append(base / "web" / raw)
    candidates.extend(
        [
            base / "web" / "logo-practica-transparent.png",
            base / "LOGO PRACTICA.png",
        ]
    )
    for candidate in candidates:
        if candidate.exists() and candidate.suffix.lower() == ".png":
            return candidate
    return None


def _load_pdf_logo(logo_path: object, max_width: int = 640, max_height: int = 360) -> dict | None:
    path = _resolve_pdf_logo_path(logo_path)
    if not path:
        return None
    parsed = _png_rows(path)
    if not parsed:
        return None
    width, height, channels, pixels = parsed
    if channels == 4:
        min_x, min_y = width, height
        max_x = max_y = -1
        for y in range(height):
            for x in range(width):
                alpha = pixels[(y * width + x) * channels + 3]
                if alpha > 8:
                    min_x = min(min_x, x)
                    min_y = min(min_y, y)
                    max_x = max(max_x, x)
                    max_y = max(max_y, y)
        if max_x >= min_x and max_y >= min_y:
            crop_w = max_x - min_x + 1
            crop_h = max_y - min_y + 1
            cropped = bytearray()
            for y in range(min_y, max_y + 1):
                start = (y * width + min_x) * channels
                end = start + (crop_w * channels)
                cropped.extend(pixels[start:end])
            width, height, pixels = crop_w, crop_h, bytes(cropped)
    step = max(1, math.ceil(max(width / max_width, height / max_height)))
    out_w = max(1, width // step)
    out_h = max(1, height // step)
    rgb = bytearray()
    alpha = bytearray()
    has_alpha = False
    for y in range(out_h):
        source_y = min(height - 1, y * step)
        for x in range(out_w):
            source_x = min(width - 1, x * step)
            index = (source_y * width + source_x) * channels
            rgb.extend(pixels[index : index + 3])
            a = pixels[index + 3] if channels == 4 else 255
            alpha.append(a)
            has_alpha = has_alpha or a < 255
    return {
        "name": "ImLogo",
        "width": out_w,
        "height": out_h,
        "rgb": zlib.compress(bytes(rgb)),
        "alpha": zlib.compress(bytes(alpha)) if has_alpha else b"",
    }


def _build_pdf(content_streams: list[bytes], images: list[dict] | None = None) -> bytes:
    catalog_id = 1
    pages_id = 2
    font_regular_id = 3
    font_bold_id = 4
    next_id = 5
    images = images or []
    image_refs = []
    for image in images:
        alpha_id = None
        if image.get("alpha"):
            alpha_id = next_id
            next_id += 1
        image_id = next_id
        next_id += 1
        image_refs.append({**image, "object_id": image_id, "alpha_id": alpha_id})
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
    for image in image_refs:
        if image.get("alpha_id"):
            objects[image["alpha_id"]] = (
                f"<< /Type /XObject /Subtype /Image /Width {image['width']} /Height {image['height']} "
                f"/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length {len(image['alpha'])} >>\nstream\n"
            ).encode("ascii") + image["alpha"] + b"\nendstream"
        smask = f" /SMask {image['alpha_id']} 0 R" if image.get("alpha_id") else ""
        objects[image["object_id"]] = (
            f"<< /Type /XObject /Subtype /Image /Width {image['width']} /Height {image['height']} "
            f"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode{smask} /Length {len(image['rgb'])} >>\nstream\n"
        ).encode("ascii") + image["rgb"] + b"\nendstream"
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[pages_id] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("ascii")
    xobject_resource = ""
    if image_refs:
        xobjects = " ".join(f"/{image['name']} {image['object_id']} 0 R" for image in image_refs)
        xobject_resource = f" /XObject << {xobjects} >>"
    for index, stream in enumerate(content_streams):
        content_id = content_ids[index]
        page_id = page_ids[index]
        objects[content_id] = b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream"
        objects[page_id] = (
            f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 {font_regular_id} 0 R /F2 {font_bold_id} 0 R >>{xobject_resource} >> "
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
    supplier = one(
        conn,
        """
        SELECT document, contact_name, contact_phone, contact_email, minimum_order_value, average_lead_time_days
        FROM suppliers
        WHERE id = ?
        """,
        (quote.get("supplier_id") or "",),
    ) or {}

    company_name = (
        profile.get("trade_name")
        or profile.get("legal_name")
        or profile.get("organization_name")
        or default_company_name()
    )
    legal_name = profile.get("legal_name") or profile.get("organization_name") or company_name
    company_doc = profile.get("document") or profile.get("organization_document") or ""
    company_address = ", ".join(
        part
        for part in [
            " ".join(part for part in [profile.get("address_line") or "", profile.get("address_number") or ""] if part).strip(),
            profile.get("address_complement") or "",
            profile.get("district") or "",
            " - ".join(part for part in [profile.get("city") or "", profile.get("state") or ""] if part).strip(),
            profile.get("postal_code") or "",
        ]
        if part
    )
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
    supplier_name = quote.get("supplier_name") or "Fornecedor"
    supplier_contact = " | ".join(
        part
        for part in [
            supplier.get("contact_name") or "",
            quote.get("contact_phone") or supplier.get("contact_phone") or "",
            supplier.get("contact_email") or "",
        ]
        if part
    )
    created_at = scalar_text(quote.get("created_at"))[:10] or date.today().isoformat()
    quote_short_id = re.sub(r"[^A-Za-z0-9]+", "-", quote.get("id") or "").strip("-")[-18:]
    generated_at = datetime.now().strftime("%d/%m/%Y %H:%M")
    items = quote.get("items") or []
    total_quantity = sum(float(item.get("requested_quantity") or 0) for item in items)
    logo = _load_pdf_logo(profile.get("logo_path"))
    logo_images = [logo] if logo else []
    payment_terms = profile.get("default_payment_terms") or ""
    footer = profile.get("document_footer") or ""

    ink = (0.075, 0.086, 0.082)
    muted = (0.390, 0.420, 0.405)
    subtle = (0.690, 0.725, 0.705)
    border = (0.860, 0.875, 0.865)
    hairline = (0.920, 0.932, 0.925)
    surface = (0.992, 0.994, 0.992)
    soft = (0.950, 0.955, 0.952)
    panel = (0.978, 0.982, 0.979)
    accent = (0.260, 0.735, 0.720)
    texture = (0.965, 0.974, 0.970)
    white = (1, 1, 1)

    pages: list[list[bytes]] = []

    def fit_text(value: object, limit: int) -> str:
        text = re.sub(r"\s+", " ", scalar_text(value)).strip()
        if len(text) <= limit:
            return text
        return text[: max(0, limit - 3)].rstrip() + "..."

    def limited_lines(value: object, width: int, max_lines: int, placeholder: str = "-") -> list[str]:
        lines = _wrap_pdf_text(value or placeholder, width)[:max_lines]
        if len(_wrap_pdf_text(value or placeholder, width)) > max_lines and lines:
            lines[-1] = fit_text(lines[-1], max(4, width))
        return lines or [placeholder]

    def centered_baseline(row_top: float, row_height: float, lines: list[str], size: int = 8, line_gap: int = 10) -> float:
        visual_mid = row_top + 8 - (row_height / 2)
        return visual_mid + ((max(len(lines), 1) - 1) * line_gap / 2) - (size * 0.33)

    def draw_centered_lines(
        parts: list[bytes],
        x: float,
        row_top: float,
        row_height: float,
        lines: list[str],
        size: int = 8,
        font: str = "F1",
        color: tuple[float, float, float] | None = None,
        line_gap: int = 10,
    ) -> None:
        start_y = centered_baseline(row_top, row_height, lines, size, line_gap)
        for index, line in enumerate(lines):
            _pdf_text(parts, x, start_y - (index * line_gap), line, size, font, color)

    def draw_page_texture(parts: list[bytes]) -> None:
        for x in range(-160, 610, 56):
            _pdf_line(parts, x, 52, x + 235, 842, 0.08, texture)
        for y_line in range(110, 720, 108):
            _pdf_line(parts, 36, y_line, 559, y_line, 0.08, texture)

    def draw_logo_mark(parts: list[bytes], x: float, y: float, w: float, h: float) -> None:
        if logo:
            ratio = min(w / logo["width"], h / logo["height"])
            image_w = logo["width"] * ratio
            image_h = logo["height"] * ratio
            _pdf_image(parts, logo["name"], x + (w - image_w) / 2, y + (h - image_h) / 2, image_w, image_h)
        else:
            initials = "".join(part[0] for part in company_name.split()[:2]).upper() or "NV"
            mark = min(w - 22, h - 8)
            mark_x = x + (w - mark) / 2
            mark_y = y + (h - mark) / 2
            _pdf_fill_rect(parts, mark_x, mark_y, mark, mark, ink)
            _pdf_text(parts, mark_x + max(4, mark * 0.20), mark_y + max(8, mark * 0.36), initials[:2], 8, "F2", white)

    def draw_label_value(
        parts: list[bytes],
        x: float,
        y: float,
        label: str,
        value: object,
        width: int,
        max_lines: int = 2,
        line_gap: int = 10,
    ) -> float:
        _pdf_text(parts, x, y, label.upper(), 6, "F2", subtle)
        y -= 10
        for line in limited_lines(value, width, max_lines):
            _pdf_text(parts, x, y, line, 8, "F1", ink)
            y -= line_gap
        return y - 4

    def draw_panel(parts: list[bytes], x: float, y: float, w: float, h: float, title: str, tone: str = "") -> None:
        _pdf_fill_rect(parts, x, y, w, h, white)
        _pdf_stroke_rect(parts, x, y, w, h, border, 0.45)
        _pdf_fill_rect(parts, x, y + h - 4, w, 4, accent if tone == "green" else hairline)
        _pdf_text(parts, x + 14, y + h - 20, title.upper(), 7, "F2", ink)
        _pdf_line(parts, x + 14, y + h - 29, x + w - 14, y + h - 29, 0.35)

    def draw_metric(parts: list[bytes], x: float, y: float, w: float, label: str, value: object, tone: str = "green") -> None:
        _pdf_fill_rect(parts, x, y, w, 34, panel)
        _pdf_stroke_rect(parts, x, y, w, 34, border, 0.3)
        _pdf_text(parts, x + 9, y + 20, label.upper(), 5, "F2", subtle)
        _pdf_text(parts, x + 9, y + 8, fit_text(value, 20), 9, "F2", ink)

    def document_header(parts: list[bytes], page_index: int) -> None:
        _pdf_fill_rect(parts, 0, 0, 595, 842, surface)
        draw_page_texture(parts)
        _pdf_fill_rect(parts, 0, 744, 595, 82, white)
        _pdf_fill_rect(parts, 36, 736, 523, 3, accent)
        _pdf_line(parts, 36, 728, 559, 728, 0.30, border)
        draw_logo_mark(parts, 36, 760, 128, 52)
        _pdf_text(parts, 190, 798, "Pedido de cotacao", 19, "F2", ink)
        company_lines = _wrap_pdf_text(company_name, 58)[:2] or [company_name]
        for line_index, line in enumerate(company_lines):
            _pdf_text(parts, 191, 779 - (line_index * 10), fit_text(line, 58), 8, "F2", muted)
        _pdf_fill_rect(parts, 428, 779, 131, 28, panel)
        _pdf_stroke_rect(parts, 428, 779, 131, 28, border, 0.3)
        _pdf_text(parts, 439, 796, f"Cotacao {quote_short_id or '-'}", 8, "F2", ink)
        _pdf_text(parts, 439, 785, f"Emissao {created_at}", 7, "F1", muted)
        if page_index > 1:
            _pdf_text(parts, 478, 712, "continuacao", 8, "F2", muted)

    def table_header(parts: list[bytes], y: float) -> float:
        _pdf_fill_rect(parts, 36, y - 9, 523, 25, soft)
        _pdf_stroke_rect(parts, 36, y - 9, 523, 25, border, 0.25)
        _pdf_fill_rect(parts, 36, y + 14, 523, 2, accent)
        _pdf_text(parts, 48, y, "#", 7, "F2", ink)
        _pdf_text(parts, 72, y, "REFERENCIA", 7, "F2", ink)
        _pdf_text(parts, 156, y, "PRODUTO SOLICITADO", 7, "F2", ink)
        _pdf_text_right(parts, 455, y, "QTD. COMPRA", 7, "F2", ink)
        _pdf_text(parts, 477, y, "UNIDADES", 7, "F2", ink)
        return y - 24

    def new_page(page_index: int) -> tuple[list[bytes], float]:
        parts: list[bytes] = []
        document_header(parts, page_index)
        if page_index == 1:
            draw_panel(parts, 36, 584, 252, 138, "Empresa solicitante", "green")
            buyer_y = 684
            buyer_y = draw_label_value(parts, 50, buyer_y, "Razao social", legal_name, 40, 2)
            buyer_y = draw_label_value(parts, 50, buyer_y, "Documento", company_doc or "-", 40, 1)
            buyer_y = draw_label_value(parts, 50, buyer_y, "Endereco", company_address or "-", 44, 1)
            draw_label_value(parts, 50, buyer_y, "Contato", company_contact or "-", 44, 1)

            draw_panel(parts, 307, 584, 252, 138, "Fornecedor cotado", "blue")
            supplier_y = 684
            supplier_y = draw_label_value(parts, 321, supplier_y, "Fornecedor", supplier_name, 40, 2)
            supplier_y = draw_label_value(parts, 321, supplier_y, "Documento", supplier.get("document") or "-", 40, 1)
            draw_label_value(parts, 321, supplier_y, "Contato", supplier_contact or "-", 44, 2)

            _pdf_fill_rect(parts, 36, 520, 523, 42, white)
            _pdf_stroke_rect(parts, 36, 520, 523, 42, border, 0.35)
            draw_metric(parts, 47, 524, 114, "Itens", str(len(items)))
            draw_metric(parts, 169, 524, 114, "Quantidade total", _format_pdf_quantity(total_quantity))
            draw_metric(parts, 291, 524, 257, "Condicoes", payment_terms or "A combinar")

            return parts, table_header(parts, 484)
        return parts, table_header(parts, 708)

    current, y = new_page(1)
    if not items:
        _pdf_text(current, 48, y, "Nenhum item registrado nesta cotacao.", 10, "F2", muted)
    for row_index, item in enumerate(items):
        product_lines = limited_lines(item.get("product_name") or "", 46, 4)
        ref = normalize_code(item.get("supplier_reference") or "")
        ref_lines = limited_lines(ref, 15, 3, "")
        package_size = float(item.get("purchase_package_size") or item.get("package_size") or 0)
        purchase_unit = item.get("purchase_unit") or item.get("unit") or "UN"
        requested_quantity = float(item.get("requested_quantity") or 0)
        qty_label = _format_pdf_quantity(requested_quantity)
        unit_label = ""
        if package_size > 1:
            qty_label = f"{_format_pdf_quantity(requested_quantity / package_size)} {_pdf_package_unit(purchase_unit)}"
            unit_label = f"{_format_pdf_quantity(requested_quantity)} {_pdf_base_unit_label(item.get('unit'))}"
        elif purchase_unit:
            unit_label = scalar_text(purchase_unit).upper()
        unit_lines = limited_lines(unit_label, 14, 2, "")
        line_count = max(len(product_lines), len(ref_lines), len(unit_lines), 1)
        row_height = max(38, 10 * line_count + 18)
        if y - row_height < 62:
            pages.append(current)
            current, y = new_page(len(pages) + 1)
        row_top = y
        row_bottom = y - row_height + 8
        if row_index % 2 == 0:
            _pdf_fill_rect(current, 36, row_bottom, 523, row_height, white)
        else:
            _pdf_fill_rect(current, 36, row_bottom, 523, row_height, panel)
        _pdf_fill_rect(current, 36, row_bottom, 3, row_height, accent if row_index % 2 == 0 else hairline)
        draw_centered_lines(current, 48, row_top, row_height, [str(row_index + 1)], 8, "F2", muted)
        draw_centered_lines(current, 72, row_top, row_height, ref_lines, 8, "F1", ink)
        draw_centered_lines(current, 156, row_top, row_height, product_lines, 8, "F1", ink)
        _pdf_text_right(current, 455, centered_baseline(row_top, row_height, [qty_label], 9), qty_label, 9, "F2", ink)
        draw_centered_lines(current, 477, row_top, row_height, unit_lines, 8, "F1", ink)
        y -= row_height
        _pdf_line(current, 36, y + 8, 559, y + 8, 0.18)
    pages.append(current)

    for index, parts in enumerate(pages, start=1):
        _pdf_fill_rect(parts, 0, 0, 595, 48, soft)
        _pdf_line(parts, 36, 42, 559, 42, 0.45)
        _pdf_text(parts, 36, 28, f"Gerado em {generated_at}", 8, "F2", ink)
        if footer:
            footer_lines = limited_lines(footer, 74, 1)
            _pdf_text(parts, 160, 28, footer_lines[0][:88], 7, "F1", muted)
        _pdf_text_right(parts, 559, 28, f"Pagina {index}/{len(pages)}", 8, "F2", ink)

    filename = f"pedido-cotacao-{_safe_pdf_filename(supplier_name)}-{created_at.replace('-', '')}-{quote_short_id or 'cotacao'}.pdf"
    return filename, _build_pdf([b"".join(parts) for parts in pages], logo_images)


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
        SELECT id, organization_id, name, contact_name, contact_phone, contact_email,
               minimum_order_value, target_order_value, average_lead_time_days,
               order_review_cycle_days, target_coverage_adjustment_days,
               order_difficulty, notes, active
        FROM suppliers
        WHERE active = 1
        ORDER BY name
        """,
    )
    full = quote_replenishment_payload(conn)
    purchase_costs = latest_purchase_costs(conn)
    open_quotes_by_supplier = {
        row["supplier_id"]: row
        for row in rows(
            conn,
            """
            SELECT
                supplier_id,
                COUNT(*) AS open_quote_count,
                ROUND(COALESCE(SUM(total_estimated_amount), 0), 2) AS open_quote_estimated_value,
                MAX(created_at) AS latest_quote_at,
                (
                    SELECT qr2.id
                    FROM quote_requests qr2
                    WHERE qr2.supplier_id = quote_requests.supplier_id
                      AND qr2.status IN ('draft', 'sent', 'responded')
                    ORDER BY qr2.created_at DESC
                    LIMIT 1
                ) AS latest_quote_id,
                (
                    SELECT qr2.status
                    FROM quote_requests qr2
                    WHERE qr2.supplier_id = quote_requests.supplier_id
                      AND qr2.status IN ('draft', 'sent', 'responded')
                    ORDER BY qr2.created_at DESC
                    LIMIT 1
                ) AS latest_quote_status
            FROM quote_requests
            WHERE status IN ('draft', 'sent', 'responded')
            GROUP BY supplier_id
            """,
        )
    }
    pending_orders_by_supplier = {
        row["supplier_id"]: row
        for row in rows(
            conn,
            """
            SELECT supplier_id, COUNT(*) AS pending_order_count
            FROM purchase_orders
            WHERE status = 'pending_confirmation'
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
            WHERE po.status IN ('pending_confirmation', 'approved', 'sent', 'partial_received')
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
            {
                "active_skus": 0,
                "buy_now": 0,
                "urgent": 0,
                "out_of_mix": 0,
                "value": 0.0,
                "alerts": 0,
                "stock_value": 0.0,
                "ideal_value": 0.0,
                "quota_value": 0.0,
                "turnover_value": 0.0,
                "rows": [],
                "difficulty": row.get("supplier_difficulty") or "",
                "days_to_order": row.get("supplier_days_to_order"),
                "review_cycle_days": row.get("review_cycle_days"),
                "daily_purchase_value": row.get("supplier_daily_purchase_value"),
            },
        )
        m["rows"].append(row)
        m["active_skus"] += 1
        unit_cost = purchase_costs.get(row["product_id"], 0.0)
        stock_units = max(float(row.get("stock_units") or 0), 0.0)
        projected_units = max(float(row.get("projected_stock_units") or stock_units), 0.0)
        suggested_units = max(float(row.get("suggested_quantity") or 0), 0.0)
        ideal_units = max(float(row.get("order_up_to") or 0), 0.0)
        ideal_purchase_units = max(ideal_units - projected_units, suggested_units, 0.0)
        after_units = max(float(row.get("after_purchase_stock_units") or (projected_units + suggested_units)), 0.0)
        if unit_cost > 0:
            m["stock_value"] += stock_units * unit_cost
            m["ideal_value"] += ideal_purchase_units * unit_cost
            m["quota_value"] += after_units * unit_cost
            demand_30_units = max(float(row.get("demand_30") or 0), 0.0)
            demand_90_units = max(float(row.get("demand_90") or 0), 0.0)
            demand_180_units = max(float(row.get("demand_180") or 0), 0.0)
            if demand_180_units > 0:
                monthly_turnover_units = demand_180_units / 6
            elif demand_90_units > 0:
                monthly_turnover_units = demand_90_units / 3
            else:
                monthly_turnover_units = demand_30_units
            m["turnover_value"] += monthly_turnover_units * unit_cost
        if row["status"] == "buy_now":
            m["buy_now"] += 1
        elif row["status"] == "urgent":
            m["urgent"] += 1
        if quote_auto_suggestion(row):
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
            {
                "active_skus": 0,
                "buy_now": 0,
                "urgent": 0,
                "out_of_mix": 0,
                "value": 0.0,
                "alerts": 0,
                "stock_value": 0.0,
                "ideal_value": 0.0,
                "quota_value": 0.0,
                "turnover_value": 0.0,
                "rows": [],
                "difficulty": "",
                "days_to_order": None,
                "review_cycle_days": None,
                "daily_purchase_value": 0,
            },
        )
        quote_info = open_quotes_by_supplier.get(s["id"]) or {}
        pending_info = pending_orders_by_supplier.get(s["id"]) or {}
        open_quote_value = float(quote_info.get("open_quote_estimated_value") or 0)
        pending_order_count = int(pending_info.get("pending_order_count") or 0)
        if m["active_skus"] <= 0 and int(quote_info.get("open_quote_count") or 0) <= 0 and pending_order_count <= 0:
            continue
        formation = supplier_order_formation_plan(
            supplier=dict(s),
            supplier_rows=m["rows"],
            current_value=round(m["value"], 2),
            auto_value=round(m["value"], 2),
            urgent_count=int(m["urgent"]),
            buy_now_count=int(m["buy_now"]),
            alert_count=int(m["alerts"]),
        )
        minimum_value = float(s["minimum_order_value"] or 0)
        daily_purchase_value = float(formation.get("daily_purchase_value") or 0)
        manual_cycle_days = int(s["order_review_cycle_days"] or 0)
        days_to_minimum = None
        if minimum_value > 0 and daily_purchase_value > 0:
            days_to_minimum = minimum_value / daily_purchase_value
        health_cycle_days = float(manual_cycle_days or days_to_minimum or 0)
        health_value = daily_purchase_value * health_cycle_days if health_cycle_days > 0 else 0.0
        health_pct = (health_value / minimum_value * 100.0) if minimum_value > 0 else None
        out.append(
            {
                "supplier_id": s["id"],
                "organization_id": s["organization_id"],
                "supplier_name": s["name"],
                "contact_name": s["contact_name"] or "",
                "contact_phone": s["contact_phone"] or "",
                "contact_email": s["contact_email"] or "",
                "minimum_order_value": float(s["minimum_order_value"] or 0),
                "target_order_value": float(s["target_order_value"] or 0),
                "average_lead_time_days": int(s["average_lead_time_days"] or 0),
                "order_review_cycle_days": int(s["order_review_cycle_days"] or 0),
                "target_coverage_adjustment_days": int(s["target_coverage_adjustment_days"] or 0),
                "order_difficulty": s["order_difficulty"] or "auto",
                "supplier_notes": s["notes"] or "",
                "active_skus": m["active_skus"],
                "buy_now_count": m["buy_now"],
                "urgent_count": m["urgent"],
                "out_of_mix_count": m["out_of_mix"],
                "alert_count": m["alerts"],
                "open_quote_count": int(quote_info.get("open_quote_count") or 0),
                "pending_order_count": pending_order_count,
                "latest_quote_at": quote_info.get("latest_quote_at") or "",
                "latest_quote_id": quote_info.get("latest_quote_id") or "",
                "latest_quote_status": quote_info.get("latest_quote_status") or "",
                "estimated_value": round(m["value"], 2),
                "suggested_value": round(m["value"], 2),
                "stock_value": round(m["stock_value"], 2),
                "ideal_value": round(m["ideal_value"], 2),
                "quota_value": round(m["quota_value"], 2),
                "turnover_value": round(daily_purchase_value * 30, 2) if daily_purchase_value > 0 else round(m["turnover_value"], 2),
                "supplier_days_to_minimum": round(days_to_minimum, 1) if days_to_minimum is not None else None,
                "supplier_health_cycle_days": round(health_cycle_days, 1) if health_cycle_days > 0 else None,
                "supplier_health_cycle_manual": bool(manual_cycle_days),
                "supplier_health_value": round(health_value, 2),
                "supplier_health_pct": round(health_pct, 1) if health_pct is not None else None,
                "open_quote_estimated_value": round(open_quote_value, 2),
                **supplier_order_formation_fields(formation),
            }
        )
    out.sort(key=lambda x: (-x["urgent_count"], -x["buy_now_count"], x["supplier_name"]))
    return out


def sync_automatic_quote_items(
    conn: sqlite3.Connection,
    current_quote: dict | None,
    supplier_rows: list[dict],
    purchase_costs: dict[str, float],
) -> dict | None:
    if not current_quote or current_quote.get("status") != "draft":
        return current_quote

    rows_by_product = {row["product_id"]: row for row in supplier_rows}
    changed = False
    for item in rows(
        conn,
        """
        SELECT *
        FROM quote_request_items
        WHERE quote_request_id = ?
        """,
        (current_quote["id"],),
    ):
        product_row = rows_by_product.get(item["product_id"])
        if not product_row:
            continue
        requested = float(item["requested_quantity"] or 0)
        previous_suggestion = float(item["suggested_quantity"] or 0)
        product_package_size = float(product_row.get("package_size") or 1)
        item_package_size = float(item.get("purchase_package_size") or 1)
        product_purchase_unit = scalar_text(product_row.get("unit") or "UN").upper()
        item_purchase_unit = scalar_text(item.get("purchase_unit") or product_purchase_unit).upper()
        manually_changed = (
            abs(requested - previous_suggestion) > 0.0001
            or item_purchase_unit != product_purchase_unit
            or abs(item_package_size - product_package_size) > 0.0001
            or bool(scalar_text(item.get("notes")))
            or item.get("coverage_target_days") is not None
        )
        if manually_changed:
            continue

        next_suggestion = float(product_row.get("suggested_quantity") or 0) if quote_auto_suggestion(product_row) else 0.0
        if next_suggestion <= 0:
            conn.execute("DELETE FROM quote_request_items WHERE id = ?", (item["id"],))
            changed = True
            continue
        if abs(next_suggestion - requested) <= 0.0001 and abs(next_suggestion - previous_suggestion) <= 0.0001:
            continue

        unit_cost = purchase_costs.get(item["product_id"], 0.0)
        estimated_total = round(unit_cost * next_suggestion, 2)
        conn.execute(
            """
            UPDATE quote_request_items
            SET suggested_quantity = ?,
                requested_quantity = ?,
                purchase_unit = ?,
                purchase_package_size = ?,
                estimated_unit_cost = ?,
                estimated_total_amount = ?,
                reason = ?
            WHERE id = ?
            """,
            (
                next_suggestion,
                next_suggestion,
                item.get("purchase_unit") or product_row.get("unit") or "UN",
                item_package_size,
                unit_cost,
                estimated_total,
                product_row.get("reason") or item.get("reason") or "",
                item["id"],
            ),
        )
        changed = True

    if not changed:
        return current_quote

    totals = one(
        conn,
        """
        SELECT COUNT(*) AS item_count, COALESCE(SUM(estimated_total_amount), 0) AS total
        FROM quote_request_items
        WHERE quote_request_id = ?
        """,
        (current_quote["id"],),
    ) or {"item_count": 0, "total": 0}
    item_count = int(totals["item_count"] or 0)
    if item_count <= 0:
        conn.execute("DELETE FROM quote_requests WHERE id = ? AND status = 'draft'", (current_quote["id"],))
        conn.commit()
        return None

    conn.execute(
        """
        UPDATE quote_requests
        SET item_count = ?, total_estimated_amount = ?
        WHERE id = ?
        """,
        (item_count, round(float(totals["total"] or 0), 2), current_quote["id"]),
    )
    conn.commit()
    return one(conn, "SELECT * FROM quote_requests WHERE id = ?", (current_quote["id"],))


def api_supplier_workbench(conn: sqlite3.Connection, supplier_id: str, window_days: int = 90) -> dict:
    """Mesa de cotacao por fornecedor: todos os produtos do fornecedor com sinais de compra."""
    if not supplier_id:
        raise ValueError("supplier_id e obrigatorio.")
    if window_days not in (30, 90, 180):
        window_days = 90
    supplier = one(conn, "SELECT * FROM suppliers WHERE id = ?", (supplier_id,))
    if not supplier:
        raise ValueError("Fornecedor nao encontrado.")
    full = quote_replenishment_payload(conn)
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
              AND po.status IN ('pending_confirmation', 'approved', 'sent', 'partial_received')
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
    current_quote = sync_automatic_quote_items(conn, current_quote, supplier_rows, purchase_costs)
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
                "supplier_reference": normalize_code(r.get("supplier_reference") or ""),
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
                "demand_daily_p50": round(float(r.get("demand_daily_p50") or 0), 4),
                "demand_daily_p75": round(float(r.get("demand_daily_p75") or 0), 4),
                "demand_daily_p90": round(float(r.get("demand_daily_p90") or 0), 4),
                "demand_quantile_used": r.get("demand_quantile_used") or "",
                "demand_class": r.get("demand_class") or "",
                "demand_class_label": r.get("demand_class_label") or "",
                "demand_confidence": r.get("demand_confidence") or "",
                "demand_method": r.get("demand_method") or "",
                "demand_signal": r.get("demand_signal") or "",
                "demand_total": round(float(r.get("demand_total") or 0), 2),
                "max_single_sale": round(float(r.get("max_single_sale") or 0), 2),
                "demand_30": round(float(r["demand_30"] or 0), 2),
                "demand_90": round(float(r["demand_90"] or 0), 2),
                "demand_180": round(float(r["demand_180"] or 0), 2),
                "sale_days_180": int(r.get("sale_days_180") or 0),
                "sale_lines_180": int(r.get("sale_lines_180") or 0),
                "first_sale_date": r.get("first_sale_date") or "",
                "last_sale_date": r.get("last_sale_date") or "",
                "days_since_last_sale": r.get("days_since_last_sale"),
                "product_age_days": r.get("product_age_days"),
                "adi_days_180": r.get("adi_days_180"),
                "cv2_180": r.get("cv2_180"),
                "coverage_days": r.get("coverage_days"),
                "projected_stock_units": r.get("projected_stock_units"),
                "stock_for_need": r.get("stock_for_need"),
                "negative_stock_limited": bool(r.get("negative_stock_limited")),
                "projected_coverage_days": r.get("projected_coverage_days"),
                "lead_time_days": r.get("lead_time_days"),
                "review_cycle_days": r.get("review_cycle_days"),
                "order_horizon_days": r.get("order_horizon_days"),
                "order_horizon_source": r.get("order_horizon_source") or "",
                "order_horizon_cycle_days": r.get("order_horizon_cycle_days"),
                "order_horizon_protection_days": r.get("order_horizon_protection_days"),
                "order_horizon_target_days": r.get("order_horizon_target_days"),
                "order_horizon_receipt_coverage_days": r.get("order_horizon_receipt_coverage_days"),
                "target_coverage_days": r.get("target_coverage_days"),
                "target_coverage_base_days": r.get("target_coverage_base_days"),
                "target_coverage_mode": r.get("target_coverage_mode") or "auto",
                "coverage_identity": r.get("coverage_identity") or "",
                "coverage_identity_label": r.get("coverage_identity_label") or "",
                "coverage_identity_reason": r.get("coverage_identity_reason") or "",
                "package_coverage_days": r.get("package_coverage_days"),
                "product_rebuy_interval_days": r.get("product_rebuy_interval_days"),
                "product_rebuy_interval_source": r.get("product_rebuy_interval_source") or "",
                "product_rebuy_interval_label": r.get("product_rebuy_interval_label") or "",
                "product_rebuy_interval_reason": r.get("product_rebuy_interval_reason") or "",
                "quote_coverage_target_days": quote_item.get("coverage_target_days") if quote_item else None,
                "reorder_point": r.get("reorder_point"),
                "order_up_to": r.get("order_up_to"),
                "safety_stock": r.get("safety_stock"),
                "raw_need": r.get("raw_need"),
                "rounded_need": r.get("rounded_need"),
                "technical_quantity": r.get("technical_quantity"),
                "suggested_quantity": round(float(r["suggested_quantity"] or 0), 2),
                "risk_gap_days": r.get("risk_gap_days"),
                "stockout_risk_days": r.get("stockout_risk_days"),
                "after_purchase_stock_units": r.get("after_purchase_stock_units"),
                "after_purchase_coverage_days": r.get("after_purchase_coverage_days"),
                "after_purchase_excess_days": r.get("after_purchase_excess_days"),
                "after_purchase_excess_units": r.get("after_purchase_excess_units"),
                "purchase_decision": r.get("purchase_decision") or "",
                "purchase_decision_label": r.get("purchase_decision_label") or "",
                "purchase_decision_reason": r.get("purchase_decision_reason") or "",
                "quote_suggestion_eligible": quote_auto_suggestion(r),
                "package_excess_units": r.get("package_excess_units", 0),
                "package_target_ratio": r.get("package_target_ratio", 0),
                "package_review_required": r.get("package_review_required", False),
                "package_blocks_auto": r.get("package_blocks_auto", False),
                "cost_no_tax": cost_no_tax,
                "cost_with_tax": cost_with_tax,
                "sale_price": round(float(r.get("sale_price") or 0), 2),
                "margin_pct": r.get("margin_pct"),
                "priority": round(float(r.get("priority") or 0), 1),
                "revenue": round(float(r.get("revenue") or 0), 2),
                "abc_class": r.get("abc_class") or "C",
                "status": r["status"],
                "status_label": r.get("status_label") or "",
                "forecast_guardrail": bool(r.get("forecast_guardrail")),
                "trend_index": r.get("trend_index"),
                "variability": r.get("variability"),
                "seasonality_factor": r.get("seasonality_factor"),
                "seasonality_factor_applied": r.get("seasonality_factor_applied"),
                "seasonality_confidence": r.get("seasonality_confidence") or "",
                "seasonality_source": r.get("seasonality_source") or "",
                "seasonality_years": r.get("seasonality_years"),
                "seasonality_reason": r.get("seasonality_reason") or "",
                "supplier_difficulty": r.get("supplier_difficulty") or "",
                "supplier_days_to_order": r.get("supplier_days_to_order"),
                "supplier_daily_purchase_value": r.get("supplier_daily_purchase_value"),
                "supplier_target_adjustment_days": r.get("supplier_target_adjustment_days"),
                "operation_profile_key": r.get("operation_profile_key") or "",
                "operation_profile_label": r.get("operation_profile_label") or "",
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

    for row in out_rows:
        row.update(minimum_fill_profile(row))

    def sort_key(row):
        in_q = 0 if row["in_quote"] else 1
        priority = 0 if row["alerts"] else 1
        fill_rank = -int(row.get("minimum_fill_rank") or 0)
        return (in_q, priority, fill_rank, -row["suggested_quantity"], row["name"])

    out_rows.sort(key=sort_key)

    items_in_quote = sum(1 for r in out_rows if r["in_quote"])
    estimated_in_quote = round(
        sum(r["quote_quantity"] * r["cost_no_tax"] for r in out_rows if r["in_quote"]), 2
    )
    auto_value = round(
        sum(float(r["suggested_quantity"] or 0) * float(r["cost_no_tax"] or 0) for r in out_rows if r["quote_suggestion_eligible"]), 2
    )
    alert_count = sum(1 for r in out_rows if r["alerts"])
    formation = supplier_order_formation_plan(
        supplier=dict(supplier),
        supplier_rows=supplier_rows,
        current_value=estimated_in_quote if items_in_quote else auto_value,
        auto_value=auto_value,
        urgent_count=sum(1 for r in supplier_rows if r.get("status") == "urgent"),
        buy_now_count=sum(1 for r in supplier_rows if r.get("status") == "buy_now"),
        alert_count=alert_count,
    )
    basket = supplier_basket_plan(supplier=dict(supplier), workbench_rows=out_rows, formation=formation)
    out_rows.sort(key=sort_key)

    return {
        "contract": "supplier_workbench.v1",
        "engine": {
            "name": "Motor V2",
            "operation_profile": (full.get("summary") or {}).get("operation_profile") or {},
            "reference_date": (full.get("summary") or {}).get("reference_date") or "",
            "observed_days": (full.get("summary") or {}).get("observed_days") or 0,
        },
        "supplier": {
            "id": supplier_id,
            "organization_id": supplier["organization_id"],
            "name": supplier["name"],
            "contact_name": supplier["contact_name"] or "",
            "contact_phone": supplier["contact_phone"] or "",
            "contact_email": supplier["contact_email"] or "",
            "minimum_order_value": float(supplier["minimum_order_value"] or 0),
            "target_order_value": float(supplier["target_order_value"] or 0),
            "lead_time_days": int(supplier["average_lead_time_days"] or 0),
            "average_lead_time_days": int(supplier["average_lead_time_days"] or 0),
            "order_review_cycle_days": int(supplier["order_review_cycle_days"] or 0),
            "target_coverage_adjustment_days": int(supplier["target_coverage_adjustment_days"] or 0),
            "order_difficulty": supplier["order_difficulty"] or "auto",
            "supplier_notes": supplier["notes"] or "",
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
        "order_formation": formation,
        "basket": basket,
        "rows": out_rows,
        "totals": {
            "items_in_quote": items_in_quote,
            "estimated_value_in_quote": estimated_in_quote,
            "total_products": len(out_rows),
            "alerts_count": alert_count,
            "auto_suggested_value": auto_value,
            "minimum_fill_candidates": sum(1 for r in out_rows if r.get("minimum_fill_candidate")),
            "minimum_fill_auto_safe": sum(1 for r in out_rows if r.get("minimum_fill_auto_safe")),
            "basket_recommended_items": sum(1 for r in out_rows if r.get("basket_selected")),
            "basket_recommended_value": basket["recommended_value"],
            "basket_fill_items": basket["selected_fill_count"],
            "basket_gap_value": basket["recommended_gap_value"],
        },
    }


def upsert_quote_item(conn: sqlite3.Connection, payload: dict) -> dict:
    """Adiciona, atualiza ou remove um item de cotacao aberta do fornecedor."""
    organization_id = scalar_text(payload.get("organization_id"))
    supplier_id = scalar_text(payload.get("supplier_id"))
    product_id = scalar_text(payload.get("product_id"))
    quote_id = scalar_text(payload.get("quote_id") or payload.get("quote_request_id"))
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
        raise ValueError("Cobertura da cotacao nao pode ser negativa.")

    if quote_id:
        current = one(
            conn,
            """
            SELECT * FROM quote_requests
            WHERE id = ?
              AND organization_id = ?
              AND supplier_id = ?
              AND status IN ('draft', 'sent', 'responded')
            """,
            (quote_id, organization_id, supplier_id),
        )
        if not current:
            raise ValueError("Cotacao aberta nao encontrada para incluir o item.")
    else:
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
    supplier_reference = normalize_code(sup_ref_row["identifier_value"] if sup_ref_row else "")
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
    replenishment_rows = quote_replenishment_rows(conn)
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
    confirmed_quantity_total = 0.0
    learned_packages = 0
    lead_times = []
    for item in quote["items"]:
        item["supplier_reference"] = normalize_code(item.get("supplier_reference") or "")
        if item["supplier_reference"]:
            item["quote_code"] = item["supplier_reference"]
        unit_price = item.get("quoted_unit_price")
        confirmed_quantity = item.get("confirmed_quantity")
        requested = float(item.get("requested_quantity") or 0)
        item["quoted_total_amount"] = round(float(unit_price or 0) * requested, 2) if unit_price is not None else None
        if (
            confirmed_quantity is not None
            or unit_price is not None
            or item.get("availability")
            or item.get("quoted_lead_time_days") is not None
            or item.get("quoted_package_size") is not None
            or item.get("notes")
        ):
            responded_count += 1
        if confirmed_quantity is not None:
            confirmed_quantity_total += float(confirmed_quantity or 0)
        if item["quoted_total_amount"] is not None:
            quoted_total += float(item["quoted_total_amount"] or 0)
        if float(item.get("quoted_package_size") or 0) > 1:
            learned_packages += 1
        if item.get("quoted_lead_time_days") is not None:
            lead_times.append(int(item["quoted_lead_time_days"]))
    quote["response_summary"] = {
        "responded_count": responded_count,
        "pending_count": max(len(quote["items"]) - responded_count, 0),
        "confirmed_quantity": round(confirmed_quantity_total, 3),
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
        purchase_order = one(conn, "SELECT id, status FROM purchase_orders WHERE quote_request_id = ? LIMIT 1", (quote_id,))
        if purchase_order and purchase_order["status"] != "pending_confirmation":
            raise ValueError("Cotacao ja tem pedido confirmado e nao pode ser descartada.")
        if purchase_order:
            conn.execute("DELETE FROM purchase_order_items WHERE purchase_order_id = ?", (purchase_order["id"],))
            conn.execute("DELETE FROM purchase_orders WHERE id = ?", (purchase_order["id"],))
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


def _create_pending_purchase_order(conn: sqlite3.Connection, quote_id: str) -> str:
    """Cria pedido em 'pending_confirmation' a partir da cotacao respondida.

    Usa a quantidade confirmada pelo fornecedor quando ela existir. O custo do
    pedido continua sendo uma estimativa interna ate a entrada no ERP.
    """
    quote = one(conn, "SELECT * FROM quote_requests WHERE id = ?", (quote_id,))
    if not quote:
        raise ValueError("Cotacao nao encontrada.")
    items = rows(
        conn,
        "SELECT * FROM quote_request_items WHERE quote_request_id = ? ORDER BY id",
        (quote_id,),
    )
    if not items:
        raise ValueError("Cotacao sem itens para virar pedido.")

    supplier_terms = one(
        conn,
        "SELECT minimum_order_value FROM suppliers WHERE id = ?",
        (quote.get("supplier_id") or "",),
    ) or {}
    minimum_order_value = float(supplier_terms.get("minimum_order_value") or 0)
    store_row = one(
        conn,
        "SELECT id FROM stores WHERE organization_id = ? ORDER BY id LIMIT 1",
        (quote["organization_id"],),
    ) or {}
    store_id = store_row.get("id") or ""

    order_id = f"{quote['organization_id']}:po:{datetime.now().strftime('%Y%m%d%H%M%S')}:{uuid4().hex[:8]}"
    prepared: list[dict] = []
    total_amount = 0.0
    approved_count = 0
    for item in items:
        availability = scalar_text(item.get("availability"))
        confirmed_quantity = item.get("confirmed_quantity")
        has_confirmed_quantity = confirmed_quantity is not None
        base_quantity = (
            float(confirmed_quantity or 0)
            if has_confirmed_quantity
            else float(item.get("requested_quantity") or item.get("suggested_quantity") or 0)
        )
        explicit_keep = availability in {"available", "partial"} or (has_confirmed_quantity and base_quantity > 0)
        decision = "buy" if explicit_keep and availability not in {"unavailable", "no_quote"} else "skip"
        package_size = float(item.get("quoted_package_size") or item.get("purchase_package_size") or 1) or 1
        unit_price = float(item.get("estimated_unit_cost") or 0)
        final_quantity = base_quantity if has_confirmed_quantity else round_to_package(base_quantity, package_size)
        final_quantity = final_quantity if decision == "buy" else 0.0
        item_total = round(final_quantity * unit_price, 2) if decision == "buy" else 0.0
        if decision == "buy" and final_quantity > 0:
            total_amount += item_total
            approved_count += 1
        prepared.append(
            {
                "quote_request_item_id": item["id"],
                "product_id": item["product_id"],
                "source_code": item["source_code"],
        "supplier_reference": normalize_code(item.get("supplier_reference") or ""),
                "quote_code": item["quote_code"],
                "product_name": item["product_name"],
                "unit": item.get("purchase_unit") or item.get("unit") or "",
                "purchase_unit": item.get("purchase_unit") or item.get("unit") or "UN",
                "purchase_package_size": float(item.get("purchase_package_size") or package_size or 1),
                "suggested_quantity": float(item.get("suggested_quantity") or 0),
                "requested_quantity": float(item.get("requested_quantity") or 0),
                "final_quantity": round(final_quantity, 3),
                "package_size": package_size,
                "unit_price": unit_price,
                "total_amount": item_total,
                "decision": decision,
                "availability": availability,
                "lead_time_days": item.get("quoted_lead_time_days"),
                "reason": item.get("reason") or "",
                "notes": scalar_text(item.get("notes"))[:500],
            }
        )

    expected_days = [
        int(item["quoted_lead_time_days"])
        for item in items
        if item.get("quoted_lead_time_days") is not None
    ]
    expected_delivery_date = (date.today() + timedelta(days=max(expected_days))).isoformat() if expected_days else ""

    if approved_count == 0:
        raise ValueError("Nenhum item confirmado para gerar pedido.")

    minimum_order_met = 1 if minimum_order_value <= 0 or total_amount >= minimum_order_value else 0
    conn.execute(
        """
        INSERT INTO purchase_orders
            (id, organization_id, store_id, quote_request_id, supplier_id, supplier_name, contact_phone,
             status, source_kind, expected_delivery_date, minimum_order_value, minimum_order_met,
             total_amount, item_count, approved_item_count, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_confirmation', 'quote', ?, ?, ?, ?, ?, ?, ?)
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
            len(prepared),
            approved_count,
            "",
        ),
    )
    for item in prepared:
        conn.execute(
            """
            INSERT INTO purchase_order_items
                (purchase_order_id, quote_request_item_id, product_id, source_code, supplier_reference,
                 quote_code, product_name, unit, purchase_unit, purchase_package_size,
                 suggested_quantity, requested_quantity, final_quantity, package_size,
                 unit_price, total_amount, decision, availability, lead_time_days, reason, notes)
            VALUES
                (:purchase_order_id, :quote_request_item_id, :product_id, :source_code, :supplier_reference,
                 :quote_code, :product_name, :unit, :purchase_unit, :purchase_package_size,
                 :suggested_quantity, :requested_quantity, :final_quantity, :package_size,
                 :unit_price, :total_amount, :decision, :availability, :lead_time_days, :reason, :notes)
            """,
            {"purchase_order_id": order_id, **item},
        )
    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, 'purchase_order_pending', 'purchase_order', ?, '{}', ?)
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
    return order_id


def generate_purchase_order_from_quote(conn: sqlite3.Connection, payload: dict) -> dict:
    quote_id = scalar_text(payload.get("id") or payload.get("quote_request_id"))
    if not quote_id:
        raise ValueError("id da cotacao e obrigatorio.")
    quote = one(conn, "SELECT id, status FROM quote_requests WHERE id = ?", (quote_id,))
    if not quote:
        raise ValueError("Cotacao nao encontrada.")
    existing_order = one(
        conn,
        "SELECT id FROM purchase_orders WHERE quote_request_id = ? LIMIT 1",
        (quote_id,),
    )
    if existing_order:
        return api_purchase_order_detail(conn, existing_order["id"])
    if quote.get("status") != "responded":
        raise ValueError("Registre a resposta do fornecedor antes de gerar o pedido.")
    order_id = _create_pending_purchase_order(conn, quote_id)
    conn.commit()
    return api_purchase_order_detail(conn, order_id)


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
        confirmed_quantity = parse_decimal(raw.get("confirmed_quantity"), None)
        quoted_lead_time_days = parse_int(raw.get("quoted_lead_time_days"), None)
        supplier_reference_provided = "supplier_reference" in raw
        supplier_reference = normalize_code(raw.get("supplier_reference"))[:120] if supplier_reference_provided else normalize_code(item.get("supplier_reference") or "")
        availability = scalar_text(raw.get("availability"))[:40]
        notes = scalar_text(raw.get("notes"))[:500]
        if availability not in availability_allowed:
            raise ValueError("Disponibilidade invalida na resposta da cotacao.")
        if quoted_unit_price is not None and quoted_unit_price < 0:
            raise ValueError("Preco cotado nao pode ser negativo.")
        if quoted_package_size is not None and quoted_package_size < 0:
            raise ValueError("Embalagem/divisor nao pode ser negativo.")
        if confirmed_quantity is not None and confirmed_quantity < 0:
            raise ValueError("Quantidade confirmada nao pode ser negativa.")
        if quoted_lead_time_days is not None and quoted_lead_time_days < 0:
            raise ValueError("Prazo nao pode ser negativo.")
        if supplier_reference_provided and supplier_reference:
            reference_candidates = rows(
                conn,
                """
                SELECT product_id, identifier_value
                FROM product_identifiers
                WHERE organization_id = ?
                  AND identifier_type = 'supplier_reference'
                  AND product_id <> ?
                """,
                (quote["organization_id"], item["product_id"]),
            )
            existing_reference = next(
                (row for row in reference_candidates if normalize_code(row.get("identifier_value")) == supplier_reference),
                None,
            )
            if existing_reference:
                raise ValueError("Referencia do fornecedor ja vinculada a outro produto.")

        conn.execute(
            """
            UPDATE quote_request_items
            SET quoted_unit_price = ?,
                quoted_package_size = ?,
                confirmed_quantity = ?,
                quoted_lead_time_days = ?,
                supplier_reference = ?,
                quote_code = ?,
                availability = ?,
                notes = ?
            WHERE id = ?
              AND quote_request_id = ?
            """,
            (
                quoted_unit_price,
                quoted_package_size,
                confirmed_quantity,
                quoted_lead_time_days,
                supplier_reference,
                supplier_reference or item["source_code"],
                availability,
                notes,
                item_id,
                quote_id,
            ),
        )
        if supplier_reference_provided and supplier_reference != (item.get("supplier_reference") or ""):
            conn.execute(
                """
                DELETE FROM product_identifiers
                WHERE organization_id = ?
                  AND product_id = ?
                  AND identifier_type = 'supplier_reference'
                """,
                (quote["organization_id"], item["product_id"]),
            )
            if supplier_reference:
                conn.execute(
                    """
                    INSERT INTO product_identifiers
                        (organization_id, product_id, identifier_type, identifier_value, source_system)
                    VALUES (?, ?, 'supplier_reference', ?, 'manual')
                    """,
                    (quote["organization_id"], item["product_id"], supplier_reference),
                )
        updated_items += 1

        has_response = (
            confirmed_quantity is not None
            or quoted_unit_price is not None
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
                (quoted_package_size is not None and quoted_package_size > 1)
                or quoted_lead_time_days is not None
            )
        )
        if learnable:
            supplier_sku = supplier_reference or normalize_code(item.get("supplier_reference") or "") or item.get("quote_code") or ""
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
                    None,
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

    if response_items and payload.get("auto_confirm_order", True):
        existing_order = one(
            conn,
            "SELECT id, status FROM purchase_orders WHERE quote_request_id = ? ORDER BY created_at DESC LIMIT 1",
            (quote_id,),
        )
        if not existing_order:
            generated_order = generate_purchase_order_from_quote(conn, {"id": quote_id})
            if generated_order.get("status") == "pending_confirmation":
                confirm_purchase_order(conn, {"id": generated_order["id"]})
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
            confirmed_at,
            sent_at,
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
            sql += " WHERE status IN ('pending_confirmation', 'approved', 'sent', 'partial_received')"
            params = ()
        elif status == "pending":
            sql += " WHERE status = 'pending_confirmation'"
            params = ()
        else:
            sql += " WHERE status = ?"
            params = (status,)
    sql += " ORDER BY created_at DESC"
    order_rows = rows(conn, sql, params)
    if status in {"", "open", "pending"}:
        quote_statuses = ("sent", "responded") if status in {"", "open"} else ("sent", "responded")
        quote_placeholders = ",".join("?" for _ in quote_statuses)
        open_quote_rows = rows(
            conn,
            f"""
            SELECT
                qr.id AS id,
                qr.organization_id,
                qr.id AS quote_request_id,
                qr.supplier_id,
                qr.supplier_name,
                CASE
                    WHEN qr.status = 'sent' THEN 'awaiting_supplier_confirmation'
                    WHEN qr.status = 'responded' THEN 'quote_response_registered'
                    ELSE qr.status
                END AS status,
                qr.created_at,
                NULL AS approved_at,
                NULL AS confirmed_at,
                qr.sent_at,
                NULL AS expected_delivery_date,
                NULL AS received_at,
                COALESCE(s.minimum_order_value, 0) AS minimum_order_value,
                CASE
                    WHEN COALESCE(s.minimum_order_value, 0) <= 0
                      OR COALESCE(qr.total_estimated_amount, 0) >= COALESCE(s.minimum_order_value, 0)
                    THEN 1 ELSE 0
                END AS minimum_order_met,
                COALESCE(qr.total_estimated_amount, 0) AS total_amount,
                COALESCE(qr.item_count, 0) AS item_count,
                COALESCE(qr.item_count, 0) AS approved_item_count,
                qr.notes,
                0 AS overdue,
                'quote_request' AS row_type
            FROM quote_requests qr
            LEFT JOIN suppliers s ON s.id = qr.supplier_id
            WHERE qr.status IN ({quote_placeholders})
              AND NOT EXISTS (
                  SELECT 1
                  FROM purchase_orders po
                  WHERE po.quote_request_id = qr.id
              )
            ORDER BY qr.sent_at DESC, qr.created_at DESC
            """,
            quote_statuses,
        )
        order_rows.extend(open_quote_rows)
        order_rows.sort(key=lambda row: row.get("created_at") or "", reverse=True)
    return order_rows


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
    supplier = one(
        conn,
        "SELECT minimum_order_value, target_order_value, average_lead_time_days FROM suppliers WHERE id = ?",
        (order.get("supplier_id") or "",),
    ) or {}
    order["supplier_terms"] = {
        "minimum_order_value": float(supplier.get("minimum_order_value") or 0),
        "target_order_value": float(supplier.get("target_order_value") or 0),
        "lead_time_days": supplier.get("average_lead_time_days"),
    }
    quote_id = order.get("quote_request_id")
    quote_response = None
    if quote_id:
        quote_response = one(
            conn,
            """
            SELECT id, status, sent_at, responded_at, total_estimated_amount, item_count
            FROM quote_requests
            WHERE id = ?
            """,
            (quote_id,),
        )
        if quote_response:
            quote_response["items"] = rows(
                conn,
                """
                SELECT id, product_id, requested_quantity, confirmed_quantity,
                       quoted_unit_price, quoted_package_size, quoted_lead_time_days,
                       availability, notes, estimated_unit_cost
                FROM quote_request_items
                WHERE quote_request_id = ?
                """,
                (quote_id,),
            )
    order["quote_response"] = quote_response
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


def update_pending_purchase_order(conn: sqlite3.Connection, payload: dict) -> dict:
    """Edita itens (qtd, preco, embalagem, decisao) de um pedido em pending_confirmation.

    Permite tambem adicionar e remover itens. Nao move status — usar
    confirm_purchase_order para finalizar.
    """
    order_id = scalar_text(payload.get("id") or payload.get("purchase_order_id"))
    item_payloads = payload.get("items")
    if not order_id or not isinstance(item_payloads, list):
        raise ValueError("id do pedido e lista de itens sao obrigatorios.")
    order = one(conn, "SELECT * FROM purchase_orders WHERE id = ?", (order_id,))
    if not order:
        raise ValueError("Pedido nao encontrado.")
    if order.get("status") != "pending_confirmation":
        raise ValueError("Pedido nao esta pendente de confirmacao.")

    existing_items = {
        int(item["id"]): item
        for item in rows(
            conn,
            "SELECT * FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY id",
            (order_id,),
        )
    }
    seen_item_ids: set[int] = set()
    allowed_decisions = {"buy", "skip", "review"}
    total_amount = 0.0
    approved_count = 0

    for raw in item_payloads:
        if not isinstance(raw, dict):
            continue
        item_id = parse_int(raw.get("item_id") or raw.get("id"), None)
        new_product_id = scalar_text(raw.get("product_id"))
        decision = scalar_text(raw.get("decision") or "buy") or "buy"
        if decision not in allowed_decisions:
            raise ValueError("Decisao de item invalida.")
        package_size = parse_decimal(raw.get("package_size"), None)
        unit_price = parse_decimal(raw.get("unit_price"), None)
        final_quantity = parse_decimal(raw.get("final_quantity"), None)
        notes = scalar_text(raw.get("notes"))[:500]
        lead_time_days = parse_int(raw.get("lead_time_days"), None)

        if item_id and item_id in existing_items:
            current = existing_items[item_id]
            seen_item_ids.add(item_id)
            if package_size is None or package_size <= 0:
                package_size = float(current.get("package_size") or current.get("purchase_package_size") or 1)
            if unit_price is None:
                unit_price = float(current.get("unit_price") or 0)
            if final_quantity is None:
                final_quantity = float(current.get("final_quantity") or 0)
            if decision != "buy":
                final_quantity = 0.0
            if final_quantity < 0 or unit_price < 0 or package_size <= 0:
                raise ValueError("Quantidade, preco e embalagem nao podem ser negativos.")
            item_total = round(float(final_quantity) * float(unit_price), 2) if decision == "buy" else 0.0
            if decision == "buy" and float(final_quantity) > 0:
                total_amount += item_total
                approved_count += 1
            conn.execute(
                """
                UPDATE purchase_order_items
                SET final_quantity = ?,
                    package_size = ?,
                    purchase_package_size = ?,
                    unit_price = ?,
                    total_amount = ?,
                    decision = ?,
                    lead_time_days = ?,
                    notes = ?
                WHERE id = ?
                """,
                (
                    round(float(final_quantity), 3),
                    float(package_size),
                    float(package_size),
                    float(unit_price),
                    item_total,
                    decision,
                    lead_time_days if lead_time_days is not None else current.get("lead_time_days"),
                    notes,
                    item_id,
                ),
            )
        elif new_product_id:
            product = one(
                conn,
                "SELECT id, source_code, name, unit FROM products WHERE organization_id = ? AND id = ?",
                (order["organization_id"], new_product_id),
            )
            if not product:
                raise ValueError("Produto novo nao encontrado.")
            if package_size is None or package_size <= 0:
                package_size = 1.0
            if unit_price is None:
                unit_price = 0.0
            if final_quantity is None:
                final_quantity = 0.0
            if decision != "buy":
                final_quantity = 0.0
            if final_quantity < 0 or unit_price < 0:
                raise ValueError("Quantidade e preco nao podem ser negativos.")
            sup_ref_row = one(
                conn,
                """
                SELECT identifier_value FROM product_identifiers
                WHERE product_id = ? AND identifier_type = 'supplier_reference'
                ORDER BY id DESC LIMIT 1
                """,
                (new_product_id,),
            )
            supplier_reference = normalize_code(sup_ref_row["identifier_value"] if sup_ref_row else "")
            item_total = round(float(final_quantity) * float(unit_price), 2) if decision == "buy" else 0.0
            if decision == "buy" and float(final_quantity) > 0:
                total_amount += item_total
                approved_count += 1
            conn.execute(
                """
                INSERT INTO purchase_order_items
                    (purchase_order_id, product_id, source_code, supplier_reference, quote_code,
                     product_name, unit, purchase_unit, purchase_package_size, package_size,
                     suggested_quantity, requested_quantity, final_quantity, unit_price,
                     total_amount, decision, lead_time_days, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)
                """,
                (
                    order_id,
                    new_product_id,
                    product["source_code"],
                    supplier_reference,
                    supplier_reference or product["source_code"],
                    product["name"],
                    product["unit"] or "UN",
                    product["unit"] or "UN",
                    float(package_size),
                    float(package_size),
                    round(float(final_quantity), 3),
                    float(unit_price),
                    item_total,
                    decision,
                    lead_time_days,
                    notes,
                ),
            )
        # itens sem id e sem product_id sao ignorados silenciosamente

    removed_ids = set(existing_items.keys()) - seen_item_ids
    if removed_ids:
        conn.execute(
            f"DELETE FROM purchase_order_items WHERE id IN ({','.join(['?'] * len(removed_ids))})",
            tuple(removed_ids),
        )

    minimum_order_value = float(order.get("minimum_order_value") or 0)
    minimum_order_met = 1 if minimum_order_value <= 0 or total_amount >= minimum_order_value else 0
    item_count_after = conn.execute(
        "SELECT COUNT(*) AS n FROM purchase_order_items WHERE purchase_order_id = ?",
        (order_id,),
    ).fetchone()[0]
    conn.execute(
        """
        UPDATE purchase_orders
        SET total_amount = ?,
            item_count = ?,
            approved_item_count = ?,
            minimum_order_met = ?,
            notes = ?
        WHERE id = ?
        """,
        (
            round(total_amount, 2),
            item_count_after,
            approved_count,
            minimum_order_met,
            scalar_text(payload.get("notes") or order.get("notes"))[:500],
            order_id,
        ),
    )
    conn.commit()
    return api_purchase_order_detail(conn, order_id)


def confirm_purchase_order(conn: sqlite3.Connection, payload: dict) -> dict:
    """Move pedido pending_confirmation para approved.

    Aceita lista opcional 'items' para aplicar ajustes finais no mesmo movimento
    (equivalente a salvar conferencia e fechar de uma vez).
    """
    order_id = scalar_text(payload.get("id") or payload.get("purchase_order_id"))
    if not order_id:
        raise ValueError("id do pedido e obrigatorio.")
    order = one(conn, "SELECT * FROM purchase_orders WHERE id = ?", (order_id,))
    if not order:
        raise ValueError("Pedido nao encontrado.")
    if order.get("status") != "pending_confirmation":
        raise ValueError("Pedido nao esta pendente de confirmacao.")

    if isinstance(payload.get("items"), list):
        update_pending_purchase_order(conn, {"id": order_id, "items": payload["items"], "notes": payload.get("notes")})
        order = one(conn, "SELECT * FROM purchase_orders WHERE id = ?", (order_id,))

    has_buy_item = conn.execute(
        "SELECT 1 FROM purchase_order_items WHERE purchase_order_id = ? AND decision = 'buy' AND final_quantity > 0 LIMIT 1",
        (order_id,),
    ).fetchone()
    if not has_buy_item:
        raise ValueError("Pedido nao tem itens para comprar. Ajuste ou descarte.")

    conn.execute(
        """
        UPDATE purchase_orders
        SET status = 'approved',
            approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP),
            confirmed_at = CURRENT_TIMESTAMP,
            notes = ?
        WHERE id = ?
        """,
        (scalar_text(payload.get("notes") or order.get("notes"))[:500], order_id),
    )
    quote_id = order.get("quote_request_id")
    if quote_id:
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
              AND action_type IN ('quote_close', 'purchase_order_confirm')
              AND status IN ('open', 'in_progress')
            """,
            (order["organization_id"], quote_id),
        )
    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, 'purchase_order_confirmed', 'purchase_order', ?, '{}', ?)
        """,
        (
            order["organization_id"],
            order_id,
            json.dumps(
                {
                    "quote_request_id": quote_id,
                    "total_amount": float(order.get("total_amount") or 0),
                    "approved_item_count": int(order.get("approved_item_count") or 0),
                },
                ensure_ascii=False,
            ),
        ),
    )
    conn.commit()
    return api_purchase_order_detail(conn, order_id)


def discard_pending_purchase_order(conn: sqlite3.Connection, payload: dict) -> dict:
    """Descarta um pedido em pending_confirmation. A cotacao volta para 'sent'
    (sem PO vinculado) e pode ser cancelada ou ter novo pedido gerado depois.
    """
    order_id = scalar_text(payload.get("id") or payload.get("purchase_order_id"))
    if not order_id:
        raise ValueError("id do pedido e obrigatorio.")
    order = one(conn, "SELECT * FROM purchase_orders WHERE id = ?", (order_id,))
    if not order:
        raise ValueError("Pedido nao encontrado.")
    if order.get("status") != "pending_confirmation":
        raise ValueError("Apenas pedidos pendentes podem ser descartados aqui.")
    conn.execute("DELETE FROM purchase_order_items WHERE purchase_order_id = ?", (order_id,))
    conn.execute("DELETE FROM purchase_orders WHERE id = ?", (order_id,))
    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, 'purchase_order_pending_discarded', 'purchase_order', ?, '{}', '{}')
        """,
        (order["organization_id"], order_id),
    )
    conn.commit()
    return {"ok": True, "id": order_id, "discarded": True}
