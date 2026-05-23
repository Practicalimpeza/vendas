from __future__ import annotations

import json
import sqlite3
import threading
from datetime import date

from app_config import app_name, default_organization_slug
from commercial import api_commercial_intelligence
from db_helpers import one, resolve_period, rows, scalar_text
from nexo_skills_runtime import action_rules, action_rules_version, nexo_skill_name, render_skill_template
from pricing import api_pricing
from quote_cache import cached_api_payload, replenishment_v2_full_payload
from quotes import latest_purchase_costs, quote_auto_suggestion
from supplier_ops import api_brand_suppliers
from text_utils import normalize


_GENERATED_ACTIONS_REFRESHING: set[str] = set()
_GENERATED_ACTIONS_REFRESH_LOCK = threading.Lock()


def _database_path(conn: sqlite3.Connection) -> str:
    db_info = conn.execute("PRAGMA database_list").fetchone()
    return (db_info["file"] if isinstance(db_info, sqlite3.Row) else db_info[2]) or ":memory:"


def _background_connection(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA cache_size = -32768")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA mmap_size = 268435456")
    return conn


def action_item(
    organization_id: str,
    key: str,
    action_type: str,
    target_type: str,
    target_id: str,
    title: str,
    body: str,
    reason: str,
    priority: int,
    impact_label: str,
    view: str,
    estimated_value: float = 0,
    due_date: str = "",
    metadata: dict | None = None,
) -> dict:
    return {
        "id": f"{organization_id}:action:{key}:{normalize(target_id) or 'geral'}",
        "organization_id": organization_id,
        "source_kind": "generated",
        "action_type": action_type,
        "target_type": target_type,
        "target_id": target_id,
        "title": title,
        "body": body,
        "reason": reason,
        "priority": priority,
        "impact_label": impact_label,
        "estimated_value": round(float(estimated_value or 0), 2),
        "due_date": due_date,
        "view": view,
        "metadata_json": json.dumps(metadata or {}, ensure_ascii=False),
    }


def skill_action_item(
    organization_id: str,
    key: str,
    target_type: str,
    target_id: str,
    context: dict,
    estimated_value: float = 0,
    due_date: str = "",
    metadata: dict | None = None,
) -> dict:
    rule = action_rules().get(key, {})
    if not rule:
        raise ValueError(f"Regra de acao nao encontrada: {key}")
    payload_metadata = {
        **(metadata or {}),
        "skill_id": rule.get("skill_id", ""),
        "skill_label": nexo_skill_name(rule.get("skill_id", "")),
        "rule_id": key,
        "rule_version": action_rules_version(),
        "template_context": context,
    }
    return action_item(
        organization_id,
        key,
        rule.get("action_type", key),
        target_type,
        target_id,
        render_skill_template(rule.get("title", ""), context),
        render_skill_template(rule.get("body", ""), context),
        render_skill_template(rule.get("reason", ""), context),
        int(rule.get("priority", 3)),
        render_skill_template(rule.get("impact", ""), context),
        rule.get("view", ""),
        estimated_value,
        due_date,
        payload_metadata,
    )


def quote_action_drafts(conn: sqlite3.Connection, period: dict) -> dict:
    replenishment_rows = replenishment_v2_full_payload(conn, period).get("rows") or []
    purchase_costs = latest_purchase_costs(conn)
    grouped: dict[str, dict] = {}
    for raw_item in replenishment_rows:
        if not quote_auto_suggestion(raw_item):
            continue
        item = dict(raw_item)
        item["estimated_value"] = round(
            float(item.get("suggested_quantity") or 0) * purchase_costs.get(item["product_id"], 0.0),
            2,
        )
        supplier_id = item["supplier_id"]
        group = grouped.setdefault(
            supplier_id,
            {
                "supplier_id": supplier_id,
                "supplier_name": item["supplier_name"],
                "item_count": 0,
                "estimated_value": 0.0,
                "urgent_count": 0,
                "mix_decision_items": [],
            },
        )
        group["item_count"] += 1
        group["estimated_value"] += float(item["estimated_value"] or 0)
        if item["status"] == "urgent":
            group["urgent_count"] += 1

    for item in replenishment_rows:
        supplier_id = item.get("supplier_id") or ""
        if supplier_id not in grouped:
            continue
        if (
            item.get("status") == "mix_review"
            and item.get("supplier_configured")
            and supplier_id
            and not quote_auto_suggestion(item)
        ):
            grouped[supplier_id]["mix_decision_items"].append(item)

    suppliers = []
    for group in grouped.values():
        group["estimated_value"] = round(group["estimated_value"], 2)
        group["mix_decision_items"] = sorted(
            group["mix_decision_items"],
            key=lambda row: (-float(row.get("priority") or 0), float(row.get("stock_units") or 0)),
        )[:40]
        suppliers.append(group)
    suppliers.sort(key=lambda row: (-row["urgent_count"], -row["estimated_value"], len(row["mix_decision_items"]), row["supplier_name"]))
    return {"suppliers": suppliers}


def generated_actions(conn: sqlite3.Connection) -> list[dict]:
    org = one(conn, "SELECT id FROM organizations ORDER BY created_at LIMIT 1").get("id") or default_organization_slug()
    today = date.today().isoformat()
    period = resolve_period(conn, {"period_days": "180"})
    cache_period_params = {"query": {"period_days": ["180"]}, "period": period}
    actions: list[dict] = []
    quote_draft = cached_api_payload(
        conn,
        "actions:quote_drafts",
        cache_period_params,
        lambda: quote_action_drafts(conn, period),
        ttl_seconds=180,
    )
    quote_groups = quote_draft.get("suppliers") or []
    quotes_open = rows(
        conn,
        """
        SELECT id, supplier_name, item_count, total_estimated_amount, status
        FROM quote_requests
        WHERE status IN ('draft', 'sent', 'responded')
        ORDER BY created_at DESC
        LIMIT 5
        """,
    )
    quotes_count = conn.execute("SELECT COUNT(*) FROM quote_requests").fetchone()[0]
    if quote_groups and not quotes_count:
        top = quote_groups[0]
        actions.append(
            skill_action_item(
                org,
                "quote_pilot",
                "supplier",
                top["supplier_id"],
                {
                    "supplier_name": top["supplier_name"],
                    "item_count": top["item_count"],
                    "urgent_count": top["urgent_count"],
                },
                top.get("estimated_value") or 0,
                today,
                {"supplier_name": top["supplier_name"], "item_count": top["item_count"]},
            )
        )
    mix_review_items = [
        item
        for group in quote_groups
        for item in (group.get("mix_decision_items") or [])
    ]
    if mix_review_items:
        item = sorted(mix_review_items, key=lambda row: (-float(row.get("priority") or 0), float(row.get("stock_units") or 0)))[0]
        actions.append(
            skill_action_item(
                org,
                "mix_review",
                "product",
                item["product_id"],
                {"product_name": item["name"]},
                item.get("estimated_value") or 0,
                today,
                {"supplier_name": item["supplier_name"], "stock_units": item["stock_units"]},
            )
        )
    for quote in quotes_open[:1]:
        if quote["status"] == "draft":
            actions.append(
                skill_action_item(
                    org,
                    "send_quote",
                    "quote",
                    quote["id"],
                    {"supplier_name": quote["supplier_name"], "item_count": quote["item_count"]},
                    quote.get("total_estimated_amount") or 0,
                    today,
                    {"supplier_name": quote["supplier_name"]},
                )
            )
        elif quote["status"] == "sent":
            actions.append(
                skill_action_item(
                    org,
                    "quote_response",
                    "quote",
                    quote["id"],
                    {"supplier_name": quote["supplier_name"], "item_count": quote["item_count"]},
                    quote.get("total_estimated_amount") or 0,
                    today,
                    {"supplier_name": quote["supplier_name"]},
                )
            )
    pending_po_summary = rows(
        conn,
        """
        SELECT id, supplier_name, item_count, total_amount
        FROM purchase_orders
        WHERE status = 'pending_confirmation'
        ORDER BY created_at DESC
        LIMIT 1
        """,
    )
    for po in pending_po_summary:
        actions.append(
            skill_action_item(
                org,
                "confirm_purchase_order",
                "purchase_order",
                po["id"],
                {"supplier_name": po["supplier_name"], "item_count": po["item_count"]},
                po.get("total_amount") or 0,
                today,
                {"supplier_name": po["supplier_name"]},
            )
        )

    supplier_rows = cached_api_payload(conn, "actions:brand_suppliers", {}, lambda: api_brand_suppliers(conn))
    supplier_seen: set[str] = set()
    missing_minimum: list[dict] = []
    inferred_rules = 0
    for row in supplier_rows:
        if row.get("supplier_rule_origin") == "inferred":
            inferred_rules += 1
        sid = row.get("supplier_id") or row.get("supplier_name") or ""
        if not sid or sid in supplier_seen:
            continue
        supplier_seen.add(sid)
        if float(row.get("minimum_order_value") or 0) <= 0:
            missing_minimum.append(row)
    missing_minimum.sort(key=lambda item: -float(item.get("revenue") or 0))
    if missing_minimum:
        supplier = missing_minimum[0]
        actions.append(
            skill_action_item(
                org,
                "supplier_minimum",
                "supplier",
                supplier.get("supplier_id") or supplier.get("supplier_name") or "",
                {"supplier_name": supplier["supplier_name"], "product_count": supplier["product_count"]},
                0,
                "",
                {"supplier_name": supplier["supplier_name"], "brand_name": supplier["brand_name"], "revenue_context": round(float(supplier.get("revenue") or 0), 2)},
            )
        )
    if inferred_rules:
        top_inferred = next((row for row in supplier_rows if row.get("supplier_rule_origin") == "inferred"), supplier_rows[0] if supplier_rows else {})
        actions.append(
            skill_action_item(
                org,
                "confirm_brand_supplier",
                "brand",
                top_inferred.get("brand_id") or "",
                {
                    "inferred_rules": inferred_rules,
                    "brand_name": top_inferred.get("brand_name") or "uma marca relevante",
                },
                0,
                "",
                {"brand_name": top_inferred.get("brand_name"), "supplier_name": top_inferred.get("supplier_name"), "revenue_context": round(float(top_inferred.get("revenue") or 0), 2)},
            )
        )

    commercial = cached_api_payload(
        conn,
        "/api/commercial/intelligence",
        cache_period_params,
        lambda: api_commercial_intelligence(conn, period),
    )
    risk = commercial.get("risk_customers") or []
    due = commercial.get("repurchase_opportunities") or []
    drops = [row for row in (commercial.get("product_momentum") or []) if float(row.get("delta_revenue") or 0) < 0]
    if risk:
        customer = risk[0]
        actions.append(
            skill_action_item(
                org,
                "customer_risk",
                "customer",
                customer["id"],
                {
                    "customer_name": customer["name"],
                    "days_since": customer["days_since"],
                    "risk_score": customer["risk_score"],
                    "reason": customer["reason"],
                },
                customer.get("revenue") or 0,
                today,
                {"customer_name": customer["name"], "last_purchase": customer["last_purchase"]},
            )
        )
    if due:
        customer = due[0]
        actions.append(
            skill_action_item(
                org,
                "customer_due",
                "customer",
                customer["id"],
                {"customer_name": customer["name"]},
                customer.get("revenue") or 0,
                "",
                {"customer_name": customer["name"], "estimated_next_purchase": customer["estimated_next_purchase"]},
            )
        )
    if drops:
        product = sorted(drops, key=lambda item: float(item.get("delta_revenue") or 0))[0]
        actions.append(
            skill_action_item(
                org,
                "product_drop",
                "product",
                product["entity_id"],
                {
                    "product_name": product["name"],
                    "delta_revenue_abs": f"{abs(float(product['delta_revenue'] or 0)):.2f}",
                },
                abs(float(product.get("delta_revenue") or 0)),
                "",
                {"product_name": product["name"], "trend_pct": product["trend_pct"]},
            )
        )
    return actions[:10]


def upsert_generated_actions(conn: sqlite3.Connection, actions: list[dict]) -> None:
    for action in actions:
        conn.execute(
            """
            INSERT INTO action_items
                (id, organization_id, source_kind, action_type, target_type, target_id,
                 title, body, reason, priority, impact_label, estimated_value, due_date,
                 view, metadata_json)
            VALUES
                (:id, :organization_id, :source_kind, :action_type, :target_type, :target_id,
                 :title, :body, :reason, :priority, :impact_label, :estimated_value, :due_date,
                 :view, :metadata_json)
            ON CONFLICT(id) DO UPDATE SET
                source_kind = excluded.source_kind,
                action_type = excluded.action_type,
                target_type = excluded.target_type,
                target_id = excluded.target_id,
                title = excluded.title,
                body = excluded.body,
                reason = excluded.reason,
                priority = excluded.priority,
                impact_label = excluded.impact_label,
                estimated_value = excluded.estimated_value,
                due_date = excluded.due_date,
                view = excluded.view,
                metadata_json = excluded.metadata_json,
                status = CASE WHEN action_items.status IN ('superseded', 'completed') THEN 'open' ELSE action_items.status END,
                updated_at = CURRENT_TIMESTAMP
            """,
            action,
        )
    current_ids = [action["id"] for action in actions]
    if current_ids:
        placeholders = ",".join("?" for _ in current_ids)
        conn.execute(
            f"""
            UPDATE action_items
            SET status = 'superseded',
                updated_at = CURRENT_TIMESTAMP
            WHERE source_kind = 'generated'
              AND status IN ('open', 'in_progress')
              AND id NOT IN ({placeholders})
            """,
            tuple(current_ids),
        )
    conn.commit()


def generated_actions_are_fresh(conn: sqlite3.Connection, max_age_seconds: int = 3600) -> bool:
    summary = one(
        conn,
        """
        SELECT COUNT(*) AS total
        FROM action_items
        WHERE source_kind = 'generated'
          AND updated_at >= datetime('now', ?)
        """,
        (f"-{int(max_age_seconds)} seconds",),
    )
    return int(summary.get("total") or 0) > 0


def generated_action_count(conn: sqlite3.Connection) -> int:
    summary = one(conn, "SELECT COUNT(*) AS total FROM action_items WHERE source_kind = 'generated'")
    return int(summary.get("total") or 0)


def refresh_generated_actions_async(conn: sqlite3.Connection) -> bool:
    db_path = _database_path(conn)
    with _GENERATED_ACTIONS_REFRESH_LOCK:
        if db_path in _GENERATED_ACTIONS_REFRESHING:
            return False
        _GENERATED_ACTIONS_REFRESHING.add(db_path)

    def worker() -> None:
        bg_conn = _background_connection(db_path)
        try:
            upsert_generated_actions(bg_conn, generated_actions(bg_conn))
        except Exception:
            pass
        finally:
            bg_conn.close()
            with _GENERATED_ACTIONS_REFRESH_LOCK:
                _GENERATED_ACTIONS_REFRESHING.discard(db_path)

    threading.Thread(target=worker, name="nexo-actions-refresh", daemon=True).start()
    return True


def action_rows(conn: sqlite3.Connection, where: str = "1 = 1", params: tuple = ()) -> list[dict]:
    result = rows(
        conn,
        f"""
        SELECT
            id, organization_id, source_kind, action_type, target_type, target_id,
            title, body, reason, status, priority, impact_label, estimated_value,
            due_date, view, metadata_json, created_at, updated_at, completed_at, ignored_at
        FROM action_items
        WHERE {where}
        ORDER BY
            CASE status WHEN 'in_progress' THEN 0 WHEN 'open' THEN 1 ELSE 2 END,
            priority,
            estimated_value DESC,
            created_at DESC
        """,
        params,
    )
    for row in result:
        try:
            row["metadata"] = json.loads(row.get("metadata_json") or "{}")
        except json.JSONDecodeError:
            row["metadata"] = {}
    return result


def lightweight_operational_intelligence(open_actions: list[dict], limit: int = 6) -> dict:
    cards = []
    for action in open_actions[:limit]:
        cards.append(
            intelligence_item(
                "acao",
                "danger" if int(action.get("priority") or 0) <= 2 else "warn",
                action.get("title") or "Acao pendente",
                action.get("body") or action.get("reason") or "",
                action.get("impact_label") or "Impacto operacional pendente.",
                "Abrir a acao e decidir o proximo passo.",
                action.get("view") or "actions",
                [action.get("reason") or "Acao ja existente reaproveitada enquanto a inteligencia atualiza."],
                action.get("target_type") or "",
                action.get("target_id") or "",
                100 - int(action.get("priority") or 5),
                action.get("metadata") or {},
            )
        )
    if not cards:
        cards.append(
            intelligence_item(
                "rotina",
                "good",
                "Aguardando atualizacao da inteligencia",
                "A tela abriu com os dados salvos e a leitura cruzada segue atualizando em segundo plano.",
                "Evita travar a navegacao enquanto o sistema recalcula compra, preco e comercial.",
                "Continuar navegando; os sinais atualizam na proxima leitura.",
                "actions",
                ["Atualizacao pesada desacoplada da abertura da tela."],
                score=10,
            )
        )
    return {
        "summary": {
            "signals": len(cards),
            "critical": sum(1 for item in cards if item.get("tone") == "danger"),
            "watch": sum(1 for item in cards if item.get("tone") == "warn"),
            "data_gaps": 0,
        },
        "cards": cards,
    }


def api_actions_today(conn: sqlite3.Connection) -> dict:
    refreshing_actions = False
    if not generated_actions_are_fresh(conn):
        if generated_action_count(conn) > 0:
            refreshing_actions = refresh_generated_actions_async(conn)
        else:
            upsert_generated_actions(conn, generated_actions(conn))
    summary = one(
        conn,
        """
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'ignored' THEN 1 ELSE 0 END) AS ignored,
            ROUND(SUM(CASE WHEN status IN ('open', 'in_progress') THEN estimated_value ELSE 0 END), 2) AS open_estimated_value
        FROM action_items
        WHERE status <> 'superseded'
        """
    )
    open_actions = action_rows(conn, "status IN ('open', 'in_progress')")
    done_actions = action_rows(conn, "status IN ('completed', 'ignored')")
    intelligence = (
        lightweight_operational_intelligence(open_actions)
        if refreshing_actions
        else operational_intelligence(conn)
    )
    return {
        "contract": "actions_today.v1",
        "summary": summary,
        "actions": open_actions[:12],
        "history": done_actions[:8],
        "pulse": operational_pulse(conn, summary),
        "intelligence": intelligence,
        "timeline": operational_timeline(conn),
    }


def intelligence_item(
    kind: str,
    tone: str,
    title: str,
    body: str,
    impact: str,
    next_step: str,
    view: str,
    evidence: list[str] | None = None,
    target_type: str = "",
    target_id: str = "",
    score: float = 0,
    metadata: dict | None = None,
) -> dict:
    return {
        "kind": kind,
        "tone": tone,
        "title": title,
        "body": body,
        "impact": impact,
        "next_step": next_step,
        "view": view,
        "evidence": evidence or [],
        "target_type": target_type,
        "target_id": target_id,
        "score": round(float(score or 0), 1),
        "metadata": metadata or {},
    }


def operational_intelligence(conn: sqlite3.Connection, limit: int = 6) -> dict:
    period = resolve_period(conn, {"period_days": "180"})
    cache_period_params = {"query": {"period_days": ["180"]}, "period": period}
    stock_payload = replenishment_v2_full_payload(conn, period)
    stock_rows = stock_payload.get("rows") or []
    pricing_rows = cached_api_payload(conn, "/api/pricing", cache_period_params, lambda: api_pricing(conn, period)).get("rows") or []
    pricing_by_product = {row.get("product_id"): row for row in pricing_rows}
    commercial = cached_api_payload(conn, "/api/commercial/intelligence", cache_period_params, lambda: api_commercial_intelligence(conn, period))
    momentum_by_product = {
        row.get("entity_id"): row
        for row in (commercial.get("product_momentum") or [])
        if row.get("entity_id")
    }
    stock_by_product = {row.get("product_id"): row for row in stock_rows}
    insights: list[dict] = []

    critical_restock = [
        row
        for row in stock_rows
        if row.get("status") in {"urgent", "buy_now"} and row.get("abc_class") in {"A", "B"}
    ]
    critical_restock.sort(key=lambda row: (-float(row.get("priority") or 0), -float(row.get("revenue") or 0)))
    if critical_restock:
        top = critical_restock[0]
        total_value = sum(float(row.get("estimated_value") or 0) for row in critical_restock)
        insights.append(
            intelligence_item(
                "ruptura",
                "danger",
                "Risco real de ruptura em itens relevantes",
                f"{len(critical_restock)} produto(s) A/B estao em compra imediata. O primeiro da fila e {top.get('name')}.",
                f"{timeline_money(total_value)} em compra sugerida sobre itens com peso comercial.",
                "Priorizar a fila de compra antes de olhar itens C ou cadastros menos urgentes.",
                "quotes",
                [
                    f"ABC {top.get('abc_class')} com cobertura {top.get('coverage_days') if top.get('coverage_days') is not None else 'sem leitura'} dia(s).",
                    f"Fornecedor: {top.get('supplier_name') or 'a configurar'}.",
                ],
                "product",
                top.get("product_id") or "",
                120 + total_value / 1000,
            )
        )

    bad_margin_restock = []
    for row in stock_rows:
        pricing = pricing_by_product.get(row.get("product_id"))
        if not pricing:
            continue
        if row.get("status") in {"urgent", "buy_now", "watch"} and pricing.get("signal") in {"margem_negativa", "margem_baixa", "sem_custo", "sem_preco"}:
            bad_margin_restock.append((row, pricing))
    bad_margin_restock.sort(key=lambda pair: (-float(pair[0].get("revenue") or 0), -float(pair[0].get("priority") or 0)))
    if bad_margin_restock:
        stock, pricing = bad_margin_restock[0]
        insights.append(
            intelligence_item(
                "preco_compra",
                "danger" if pricing.get("severity") == "danger" else "warn",
                "Compra e preco estao contando historias diferentes",
                f"{stock.get('name')} pede reposicao, mas o sinal de preco e {pricing.get('signal_label')}.",
                "Comprar sem revisar margem pode repor um problema, nao uma oportunidade.",
                "Revisar preco/custo no ERP antes de fechar uma compra grande desse item.",
                "pricing",
                [
                    f"Margem atual: {pricing.get('margin_pct') if pricing.get('margin_pct') is not None else 'sem calculo'}%.",
                    f"Compra sugerida: {timeline_money(stock.get('estimated_value'))}.",
                ],
                "product",
                stock.get("product_id") or "",
                112 + float(stock.get("estimated_value") or 0) / 1000,
            )
        )

    dropped_with_stock = []
    for product_id, momentum in momentum_by_product.items():
        stock = stock_by_product.get(product_id)
        if not stock:
            continue
        if float(momentum.get("delta_revenue") or 0) < 0 and float(stock.get("stock_units") or 0) > 0:
            dropped_with_stock.append((stock, momentum))
    dropped_with_stock.sort(key=lambda pair: (float(pair[1].get("delta_revenue") or 0), -float(pair[0].get("stock_units") or 0)))
    if dropped_with_stock:
        stock, momentum = dropped_with_stock[0]
        loss = abs(float(momentum.get("delta_revenue") or 0))
        insights.append(
            intelligence_item(
                "demanda_estoque",
                "warn",
                "Queda comercial com estoque parado",
                f"{stock.get('name')} caiu {timeline_money(loss)} em receita e ainda tem {stock.get('stock_units')} un. em estoque ERP.",
                "Pode ser ruptura anterior, preco, substituicao ou perda de demanda. Sem investigar, o estoque vira silencio caro.",
                "Abrir a leitura comercial antes de comprar mais ou liquidar no escuro.",
                "opportunities",
                [
                    f"Tendencia: {momentum.get('trend_pct')}%.",
                    f"Status de reposicao: {stock.get('status_label')}.",
                ],
                "product",
                stock.get("product_id") or "",
                96 + loss / 1000,
            )
        )

    excess_rows = [row for row in stock_rows if row.get("status") == "excess" and float(row.get("stock_units") or 0) > 0]
    excess_rows.sort(key=lambda row: -float(row.get("stock_units") or 0) * float(row.get("unit_cost") or 0))
    if excess_rows:
        top = excess_rows[0]
        excess_value = sum(float(row.get("stock_units") or 0) * float(row.get("unit_cost") or 0) for row in excess_rows)
        insights.append(
            intelligence_item(
                "caixa_estoque",
                "warn",
                "Caixa preso em excesso de estoque",
                f"{len(excess_rows)} produto(s) aparecem com cobertura acima da politica. O maior sinal e {top.get('name')}.",
                f"Valor aproximado em estoque desses itens: {timeline_money(excess_value)}.",
                "Separar excesso que deve vender, liquidar ou virar bloqueio de compra.",
                "products",
                [
                    f"{top.get('stock_units')} un. no estoque ERP.",
                    f"Cobertura: {top.get('coverage_days') if top.get('coverage_days') is not None else 'sem leitura'} dia(s).",
                ],
                "product",
                top.get("product_id") or "",
                82 + excess_value / 1000,
            )
        )

    supplier_blockers = [
        row
        for row in stock_rows
        if row.get("status") in {"urgent", "buy_now", "watch"}
        and (not row.get("supplier_configured") or row.get("supplier_difficulty") in {"configure", "unknown"})
    ]
    supplier_blockers.sort(key=lambda row: (-float(row.get("priority") or 0), -float(row.get("revenue") or 0)))
    if supplier_blockers:
        top = supplier_blockers[0]
        insights.append(
            intelligence_item(
                "fornecedor",
                "warn",
                "A inteligencia de compra esta limitada pelo fornecedor",
                f"{len(supplier_blockers)} item(ns) com demanda dependem de fornecedor a configurar ou pedido minimo desconhecido.",
                f"Sem esse dado, o {app_name()} acerta a urgencia do produto, mas erra o tamanho economico do pedido.",
                "Configurar fornecedor/pedido minimo antes de transformar sugestao em rotina.",
                "suppliers",
                [
                    f"Primeiro item: {top.get('name')}.",
                    f"Grupo atual: {top.get('supplier_name') or 'sem fornecedor'}.",
                ],
                "supplier",
                top.get("supplier_id") or top.get("brand_id") or "",
                78 + len(supplier_blockers),
            )
        )

    missing_cost = [
        row
        for row in pricing_rows
        if row.get("signal") in {"sem_custo", "sem_preco"} and float(row.get("revenue") or 0) > 0
    ]
    missing_cost.sort(key=lambda row: -float(row.get("revenue") or 0))
    if missing_cost:
        top = missing_cost[0]
        revenue = sum(float(row.get("revenue") or 0) for row in missing_cost)
        insights.append(
            intelligence_item(
                "dados",
                "info",
                "Falta dado que muda decisao, nao so cadastro",
                f"{len(missing_cost)} produto(s) com venda nao tem custo/preco suficiente para validar margem. O maior e {top.get('name')}.",
                f"{timeline_money(revenue)} de receita esta com leitura de margem incompleta.",
                "Pedir ao ERP exportacao de custo/preco ou ajustar manualmente os itens de maior receita.",
                "imports",
                [
                    f"Sinal principal: {top.get('signal_label')}.",
                    f"Receita afetada: {timeline_money(top.get('revenue'))}.",
                ],
                "product",
                top.get("product_id") or "",
                72 + revenue / 1000,
            )
        )

    quote_status = rows(
        conn,
        """
        SELECT status, COUNT(*) AS count, ROUND(COALESCE(SUM(total_estimated_amount), 0), 2) AS value
        FROM quote_requests
        WHERE status IN ('sent', 'responded')
        GROUP BY status
        """,
    )
    quote_map = {row["status"]: row for row in quote_status}
    pending_orders = one(
        conn,
        """
        SELECT COUNT(*) AS count, ROUND(COALESCE(SUM(total_amount), 0), 2) AS value
        FROM purchase_orders
        WHERE status = 'pending_confirmation'
        """,
    )
    if pending_orders and (pending_orders.get("count") or 0) > 0:
        insights.append(
            intelligence_item(
                "ciclo_compra",
                "good",
                "Pedido aguardando conferencia",
                f"{pending_orders.get('count')} pedido(s) pendente(s) de confirmacao.",
                f"{timeline_money(pending_orders.get('value'))} provisionado no aguardo do fornecedor.",
                "Conferir valores e quantidades contra a resposta do fornecedor antes de confirmar.",
                "purchase_orders",
                [f"{pending_orders.get('count')} pedido(s) provisorio(s) na fila."],
                "quote",
                "",
                88 + float(pending_orders.get("value") or 0) / 1000,
            )
        )

    insights.sort(key=lambda item: -float(item.get("score") or 0))
    if not insights:
        insights.append(
            intelligence_item(
                "rotina",
                "good",
                "Nenhuma contradicao forte encontrada",
                "Compra, preco, estoque e comercial nao apontam conflito critico nos dados atuais.",
                "A inteligencia deve continuar acompanhando novas importacoes e decisoes.",
                "Manter a rotina e revisar novamente apos o proximo lote do ERP.",
                "actions",
                ["Radar cruzou reposicao, precificacao e oportunidades comerciais."],
                score=10,
            )
        )
    cards = insights[:limit]
    return {
        "summary": {
            "signals": len(insights),
            "critical": sum(1 for item in insights if item.get("tone") == "danger"),
            "watch": sum(1 for item in insights if item.get("tone") == "warn"),
            "data_gaps": sum(1 for item in insights if item.get("kind") == "dados"),
        },
        "cards": cards,
    }


def timeline_item(kind: str, tone: str, title: str, body: str, occurred_at: str, target_type: str = "", target_id: str = "", metadata: dict | None = None) -> dict:
    return {
        "kind": kind,
        "tone": tone,
        "title": title,
        "body": body,
        "occurred_at": occurred_at or "",
        "target_type": target_type,
        "target_id": target_id,
        "metadata": metadata or {},
    }


def timeline_money(value: object) -> str:
    amount = float(value or 0)
    formatted = f"{amount:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"R$ {formatted}"


def timeline_import_body(mapped: int, start: str | None, end: str | None) -> str:
    if start and end:
        return f"{mapped} linha(s) mapeadas no periodo {start} a {end}."
    if start or end:
        return f"{mapped} linha(s) mapeadas com referencia {start or end}."
    return f"{mapped} linha(s) mapeadas."


def operational_timeline(conn: sqlite3.Connection, limit: int = 28) -> list[dict]:
    items: list[dict] = []
    for batch in rows(
        conn,
        """
        SELECT id, source_system, status, source_period_start, source_period_end, finished_at, summary_json
        FROM import_batches
        WHERE finished_at IS NOT NULL
        ORDER BY finished_at DESC
        LIMIT 6
        """,
    ):
        summary = {}
        if batch.get("summary_json"):
            try:
                summary = json.loads(batch["summary_json"])
            except json.JSONDecodeError:
                summary = {}
        mapped = int(summary.get("mapped_rows") or summary.get("imported_rows") or summary.get("rows") or 0)
        items.append(timeline_item(
            "import",
            "info" if batch.get("status") == "completed" else "warn",
            "Importacao concluida" if batch.get("status") == "completed" else "Importacao com atencao",
            timeline_import_body(mapped, batch.get("source_period_start"), batch.get("source_period_end")),
            batch.get("finished_at") or "",
            "import_batch",
            batch.get("id") or "",
            {"source_system": batch.get("source_system") or ""},
        ))

    for quote in rows(
        conn,
        """
        SELECT id, supplier_name, status, created_at, sent_at, responded_at, approved_at, cancelled_at,
               item_count, total_estimated_amount
        FROM quote_requests
        ORDER BY created_at DESC
        LIMIT 18
        """,
    ):
        status = quote.get("status") or "draft"
        occurred = {
            "sent": quote.get("sent_at"),
            "responded": quote.get("responded_at"),
            "approved": quote.get("approved_at"),
            "cancelled": quote.get("cancelled_at"),
        }.get(status) or quote.get("created_at")
        tone = {"draft": "muted", "sent": "warn", "responded": "info", "approved": "good", "cancelled": "danger"}.get(status, "muted")
        title = {
            "draft": "Cotacao em rascunho",
            "sent": "Cotacao enviada",
            "responded": "Resposta de cotacao registrada",
            "approved": "Cotacao virou pedido",
            "cancelled": "Cotacao cancelada",
        }.get(status, "Cotacao atualizada")
        items.append(timeline_item(
            "quote",
            tone,
            title,
            f"{quote.get('supplier_name') or 'Fornecedor'} - {int(quote.get('item_count') or 0)} item(ns), {timeline_money(quote.get('total_estimated_amount'))}.",
            occurred or "",
            "quote",
            quote.get("id") or "",
            {"status": status},
        ))

    for order in rows(
        conn,
        """
        SELECT id, supplier_name, status, created_at, approved_at, sent_at, received_at,
               expected_delivery_date, total_amount, approved_item_count
        FROM purchase_orders
        ORDER BY created_at DESC
        LIMIT 18
        """,
    ):
        status = order.get("status") or "approved"
        occurred = order.get("received_at") if status in {"received", "partial_received"} else order.get("approved_at") or order.get("sent_at") or order.get("created_at")
        tone = {"approved": "info", "sent": "info", "partial_received": "warn", "received": "good", "cancelled": "danger"}.get(status, "info")
        title = {
            "approved": "Pedido aprovado",
            "sent": "Pedido enviado",
            "partial_received": "Chegada parcial registrada",
            "received": "Chegada registrada",
            "cancelled": "Pedido cancelado",
        }.get(status, "Pedido atualizado")
        items.append(timeline_item(
            "purchase_order",
            tone,
            title,
            f"{order.get('supplier_name') or 'Fornecedor'} - {int(order.get('approved_item_count') or 0)} item(ns), {timeline_money(order.get('total_amount'))}. Estoque segue vindo do ERP.",
            occurred or "",
            "purchase_order",
            order.get("id") or "",
            {"status": status, "expected_delivery_date": order.get("expected_delivery_date") or ""},
        ))

    for decision in rows(
        conn,
        """
        SELECT entity_type, entity_id, entity_label, decision_type, decision_value, scope_label, notes, created_at
        FROM operational_decisions
        ORDER BY created_at DESC
        LIMIT 18
        """,
    ):
        label = decision.get("entity_label") or decision.get("scope_label") or decision.get("entity_id") or "Operacao"
        value = decision.get("decision_value") or decision.get("decision_type") or "Decisao registrada"
        note = f" - {decision.get('notes')}" if decision.get("notes") else ""
        items.append(timeline_item(
            "decision",
            "good",
            value,
            f"{label}{note}",
            decision.get("created_at") or "",
            decision.get("entity_type") or "",
            decision.get("entity_id") or "",
            {"decision_type": decision.get("decision_type") or ""},
        ))

    for action in action_rows(conn, "status IN ('completed', 'ignored', 'in_progress')")[:16]:
        tone = "good" if action.get("status") == "completed" else "warn" if action.get("status") == "in_progress" else "muted"
        occurred = action.get("completed_at") or action.get("ignored_at") or action.get("updated_at") or action.get("created_at")
        items.append(timeline_item(
            "action",
            tone,
            "Acao concluida" if action.get("status") == "completed" else "Acao ignorada" if action.get("status") == "ignored" else "Acao em andamento",
            action.get("title") or "",
            occurred or "",
            action.get("target_type") or "",
            action.get("target_id") or "",
            {"action_type": action.get("action_type") or "", "status": action.get("status") or ""},
        ))

    for event in rows(
        conn,
        """
        SELECT action, target_type, target_id, created_at
        FROM audit_log
        WHERE action NOT IN ('purchase_order_closed', 'purchase_order_received', 'quote_response_saved')
        ORDER BY created_at DESC
        LIMIT 14
        """,
    ):
        items.append(timeline_item(
            "audit",
            "muted",
            "Evento registrado",
            f"{event.get('action') or 'evento'} em {event.get('target_type') or 'registro'}.",
            event.get("created_at") or "",
            event.get("target_type") or "",
            event.get("target_id") or "",
            {"action": event.get("action") or ""},
        ))

    items = [item for item in items if item["occurred_at"]]
    items.sort(key=lambda item: item["occurred_at"], reverse=True)
    return items[:limit]


def operational_pulse(conn: sqlite3.Connection, action_summary: dict | None = None) -> dict:
    latest_import = one(
        conn,
        """
        SELECT id, source_system, status, source_period_start, source_period_end, finished_at, summary_json
        FROM import_batches
        ORDER BY started_at DESC
        LIMIT 1
        """,
    )
    changes_count = one(
        conn,
        """
        SELECT COUNT(*) AS count
        FROM source_entity_changes
        WHERE created_at >= datetime('now', '-7 days')
        """,
    )
    issues_count = one(
        conn,
        """
        SELECT
            SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) AS errors,
            SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) AS warnings
        FROM import_issues
        """,
    )
    quote_counts = one(
        conn,
        """
        SELECT
            SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS draft,
            SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
            SUM(CASE WHEN status = 'responded' THEN 1 ELSE 0 END) AS responded,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved
        FROM quote_requests
        """,
    )
    order_counts = one(
        conn,
        """
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'pending_confirmation' THEN 1 ELSE 0 END) AS pending_confirmation,
            SUM(CASE WHEN status IN ('approved', 'sent') THEN 1 ELSE 0 END) AS open,
            ROUND(COALESCE(SUM(CASE WHEN status IN ('approved', 'sent') THEN total_amount ELSE 0 END), 0), 2) AS open_value
        FROM purchase_orders
        """,
    )
    events = rows(
        conn,
        """
        SELECT action, target_type, target_id, created_at
        FROM audit_log
        ORDER BY created_at DESC
        LIMIT 6
        """,
    )
    summary_json = {}
    if latest_import and latest_import.get("summary_json"):
        try:
            summary_json = json.loads(latest_import["summary_json"])
        except json.JSONDecodeError:
            summary_json = {}
    return {
        "latest_import": dict(latest_import) if latest_import else None,
        "latest_import_summary": summary_json,
        "changes_last_7d": int(changes_count.get("count") or 0),
        "import_issues": {
            "errors": int(issues_count.get("errors") or 0),
            "warnings": int(issues_count.get("warnings") or 0),
        },
        "quotes": {
            "draft": int(quote_counts.get("draft") or 0),
            "sent": int(quote_counts.get("sent") or 0),
            "responded": int(quote_counts.get("responded") or 0),
            "approved": int(quote_counts.get("approved") or 0),
        },
        "orders": {
            "total": int(order_counts.get("total") or 0),
            "open": int(order_counts.get("open") or 0),
            "open_value": float(order_counts.get("open_value") or 0),
        },
        "actions_open": int((action_summary or {}).get("open") or 0),
        "events": [dict(event) for event in events],
    }


def update_action_status(conn: sqlite3.Connection, payload: dict) -> dict:
    action_id = scalar_text(payload.get("id"))
    status = scalar_text(payload.get("status"))
    notes = scalar_text(payload.get("notes"))
    allowed = {"open", "in_progress", "completed", "ignored"}
    if not action_id or status not in allowed:
        raise ValueError("id e status valido sao obrigatorios.")
    timestamp_sql = {
        "completed": ", completed_at = CURRENT_TIMESTAMP, ignored_at = NULL",
        "ignored": ", ignored_at = CURRENT_TIMESTAMP, completed_at = NULL",
        "open": ", completed_at = NULL, ignored_at = NULL",
        "in_progress": "",
    }[status]
    row = conn.execute(
        "SELECT organization_id, action_type, target_type, target_id, metadata_json FROM action_items WHERE id = ?",
        (action_id,),
    ).fetchone()
    if not row:
        raise ValueError("Acao nao encontrada.")
    try:
        metadata = json.loads(row["metadata_json"] or "{}")
    except json.JSONDecodeError:
        metadata = {}
    if status == "completed" and row["action_type"] == "supplier_config":
        supplier_id = row["target_id"]
        supplier = conn.execute(
            "SELECT minimum_order_value FROM suppliers WHERE organization_id = ? AND id = ?",
            (row["organization_id"], supplier_id),
        ).fetchone()
        if not supplier or float(supplier["minimum_order_value"] or 0) <= 0:
            raise ValueError("Preencha o pedido minimo desse fornecedor antes de concluir a acao.")
    if notes:
        metadata["last_note"] = notes
    conn.execute(
        f"""
        UPDATE action_items
        SET status = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP {timestamp_sql}
        WHERE id = ?
        """,
        (status, json.dumps(metadata, ensure_ascii=False), action_id),
    )
    conn.commit()
    return {"ok": True, "action": action_rows(conn, "id = ?", (action_id,))[0]}

