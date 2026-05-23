from __future__ import annotations

import json
import sqlite3

from app_config import app_name
from db_helpers import mark_app_controlled_fields, parse_int, rows, scalar_text
from operational_decisions import insert_operational_decision
from text_utils import clean_phone, make_supplier_id, normalize


def seed_brand_suppliers(conn: sqlite3.Connection) -> None:
    brands = conn.execute("SELECT id, organization_id, name, normalized_name FROM brands").fetchall()
    for brand in brands:
        sid = make_supplier_id(brand["organization_id"], brand["name"])
        conn.execute(
            """
            INSERT OR IGNORE INTO suppliers
                (id, organization_id, name, normalized_name, contact_phone, order_review_cycle_days)
            VALUES (?, ?, ?, ?, '', 14)
            """,
            (sid, brand["organization_id"], brand["name"], brand["normalized_name"]),
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO brand_supplier_rules
                (organization_id, brand_id, supplier_id, notes)
            VALUES (?, ?, ?, 'Fornecedor padrao criado a partir da marca.')
            """,
            (brand["organization_id"], brand["id"], sid),
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
        WHERE preferred_supplier_id IS NULL
          AND EXISTS (
              SELECT 1
              FROM products p
              JOIN brand_supplier_rules bsr
                ON bsr.organization_id = p.organization_id
               AND bsr.brand_id = p.brand_id
              WHERE p.id = product_settings.product_id
                AND p.organization_id = product_settings.organization_id
          )
        """
    )


def api_brand_suppliers(conn: sqlite3.Connection) -> list[dict]:
    result = rows(
        conn,
        """
        WITH product_revenue AS (
            SELECT product_id, SUM(gross_amount) AS revenue
            FROM product_sales
            GROUP BY product_id
        ),
        stock AS (
            SELECT product_id, SUM(quantity_on_hand) AS stock_units
            FROM inventory_snapshots inv
            WHERE inv.id = (
                SELECT inv2.id
                FROM inventory_snapshots inv2
                WHERE inv2.organization_id = inv.organization_id
                  AND inv2.store_id = inv.store_id
                  AND inv2.product_id = inv.product_id
                ORDER BY inv2.snapshot_date DESC, inv2.id DESC
                LIMIT 1
            )
            GROUP BY product_id
        )
        SELECT
            b.organization_id,
            b.id AS brand_id,
            b.name AS brand_name,
            COALESCE(s.id, '') AS supplier_id,
            COALESCE(s.name, b.name) AS supplier_name,
            COALESCE(s.contact_name, '') AS contact_name,
            COALESCE(s.contact_phone, '') AS contact_phone,
            COALESCE(s.contact_email, '') AS contact_email,
            COALESCE(s.minimum_order_value, 0) AS minimum_order_value,
            COALESCE(s.target_order_value, 0) AS target_order_value,
            COALESCE(s.average_lead_time_days, 0) AS average_lead_time_days,
            COALESCE(s.order_review_cycle_days, 0) AS order_review_cycle_days,
            COALESCE(s.target_coverage_adjustment_days, 0) AS target_coverage_adjustment_days,
            COALESCE(s.order_difficulty, 'auto') AS order_difficulty,
            COALESCE(s.notes, '') AS supplier_notes,
            COALESCE(bsr.notes, '') AS supplier_rule_notes,
            CASE
                WHEN bsr.supplier_id IS NULL THEN 'missing'
                WHEN bsr.notes LIKE 'Fornecedor padrao criado%' THEN 'inferred'
                ELSE 'manual'
            END AS supplier_rule_origin,
            CASE
                WHEN bsr.supplier_id IS NULL THEN 'Sem fornecedor'
                WHEN bsr.notes LIKE 'Fornecedor padrao criado%' THEN 'Inferido pela marca'
                ELSE 'Confirmado'
            END AS supplier_rule_label,
            CASE
                WHEN bsr.supplier_id IS NULL THEN 0.0
                WHEN bsr.notes LIKE 'Fornecedor padrao criado%' THEN 0.45
                ELSE 1.0
            END AS supplier_rule_confidence,
            COUNT(DISTINCT p.id) AS product_count,
            ROUND(COALESCE(SUM(product_revenue.revenue), 0), 2) AS revenue,
            ROUND(COALESCE(SUM(stock.stock_units), 0), 2) AS stock_units
        FROM brands b
        LEFT JOIN brand_supplier_rules bsr
          ON bsr.organization_id = b.organization_id
         AND bsr.brand_id = b.id
         AND bsr.active = 1
        LEFT JOIN suppliers s ON s.id = bsr.supplier_id
        LEFT JOIN products p
          ON p.organization_id = b.organization_id
         AND p.brand_id = b.id
         AND p.active = 1
        LEFT JOIN product_revenue ON product_revenue.product_id = p.id
        LEFT JOIN stock ON stock.product_id = p.id
        GROUP BY b.organization_id, b.id, b.name, s.id, s.name, s.contact_name, s.contact_phone, s.contact_email,
                 s.minimum_order_value, s.target_order_value, s.average_lead_time_days, s.order_review_cycle_days,
                 s.target_coverage_adjustment_days, s.order_difficulty, s.notes, bsr.notes, bsr.supplier_id
        ORDER BY revenue DESC, product_count DESC, brand_name
        """,
    )
    for row in result:
        if row.get("supplier_rule_origin") == "manual":
            row["supplier_rule_label"] = f"Confirmado no {app_name()}"
    return result


def update_brand_supplier(conn: sqlite3.Connection, payload: dict) -> dict:
    organization_id = scalar_text(payload.get("organization_id"))
    brand_id = scalar_text(payload.get("brand_id"))
    supplier_name = scalar_text(payload.get("supplier_name"))
    contact_phone = clean_phone(scalar_text(payload.get("contact_phone")))
    minimum_order_value = float(str(scalar_text(payload.get("minimum_order_value")) or "0").replace(".", "").replace(",", ".") or 0)
    if not organization_id or not brand_id or not supplier_name:
        raise ValueError("organization_id, brand_id e supplier_name sao obrigatorios.")

    brand = conn.execute(
        "SELECT id FROM brands WHERE organization_id = ? AND id = ?",
        (organization_id, brand_id),
    ).fetchone()
    if not brand:
        raise ValueError("Marca nao encontrada.")

    normalized_supplier = normalize(supplier_name)
    existing_supplier = conn.execute(
        "SELECT id FROM suppliers WHERE organization_id = ? AND normalized_name = ?",
        (organization_id, normalized_supplier),
    ).fetchone()
    supplier_id = existing_supplier["id"] if existing_supplier else make_supplier_id(organization_id, supplier_name)
    conn.execute(
        """
        INSERT INTO suppliers
            (id, organization_id, name, normalized_name, contact_phone, minimum_order_value, order_review_cycle_days)
        VALUES (?, ?, ?, ?, ?, ?, 14)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            normalized_name = excluded.normalized_name,
            contact_phone = excluded.contact_phone,
            minimum_order_value = excluded.minimum_order_value
        """,
        (supplier_id, organization_id, supplier_name, normalized_supplier, contact_phone, minimum_order_value),
    )
    mark_app_controlled_fields(
        conn,
        organization_id=organization_id,
        entity_type="supplier",
        entity_id=supplier_id,
        source_view="brand_supplier",
        values={
            "name": supplier_name,
            "contact_phone": contact_phone,
            "minimum_order_value": minimum_order_value,
        },
    )
    note = f"Configurado manualmente no {app_name()}."
    conn.execute(
        """
        INSERT INTO brand_supplier_rules
            (organization_id, brand_id, supplier_id, active, notes, updated_at)
        VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(organization_id, brand_id) DO UPDATE SET
            supplier_id = excluded.supplier_id,
            active = 1,
            notes = excluded.notes,
            updated_at = CURRENT_TIMESTAMP
        """,
        (organization_id, brand_id, supplier_id, note),
    )
    conn.execute(
        """
        UPDATE product_settings
        SET preferred_supplier_id = ?
        WHERE organization_id = ?
          AND product_id IN (
              SELECT id
              FROM products
              WHERE organization_id = ?
                AND brand_id = ?
          )
        """,
        (supplier_id, organization_id, organization_id, brand_id),
    )
    conn.commit()
    return {
        "ok": True,
        "organization_id": organization_id,
        "brand_id": brand_id,
        "supplier_id": supplier_id,
        "supplier_name": supplier_name,
        "contact_phone": contact_phone,
        "minimum_order_value": minimum_order_value,
    }


def update_supplier_profile(conn: sqlite3.Connection, payload: dict) -> dict:
    organization_id = scalar_text(payload.get("organization_id"))
    supplier_id = scalar_text(payload.get("supplier_id"))
    supplier_name = scalar_text(payload.get("supplier_name"))
    contact_name = scalar_text(payload.get("contact_name"))
    contact_phone = clean_phone(scalar_text(payload.get("contact_phone")))
    contact_email = scalar_text(payload.get("contact_email"))
    minimum_order_value = float(str(scalar_text(payload.get("minimum_order_value")) or "0").replace(".", "").replace(",", ".") or 0)
    target_order_value = float(str(scalar_text(payload.get("target_order_value")) or "0").replace(".", "").replace(",", ".") or 0)
    average_lead_time_days = parse_int(payload.get("average_lead_time_days"), 0) or 0
    order_review_cycle_days = parse_int(payload.get("order_review_cycle_days"), 0) or 0
    target_coverage_adjustment_days = parse_int(payload.get("target_coverage_adjustment_days"), 0) or 0
    order_difficulty = scalar_text(payload.get("order_difficulty")) or "auto"
    if order_difficulty not in {"auto", "easy", "normal", "hard", "unknown"}:
        order_difficulty = "auto"
    notes = scalar_text(payload.get("notes"))[:500]
    if not organization_id or (not supplier_id and not supplier_name):
        raise ValueError("organization_id e supplier_id ou supplier_name sao obrigatorios.")
    if not supplier_id:
        normalized_supplier = normalize(supplier_name)
        existing_supplier = conn.execute(
            "SELECT id FROM suppliers WHERE organization_id = ? AND normalized_name = ?",
            (organization_id, normalized_supplier),
        ).fetchone()
        supplier_id = existing_supplier["id"] if existing_supplier else make_supplier_id(organization_id, supplier_name)
    supplier = conn.execute(
        "SELECT * FROM suppliers WHERE organization_id = ? AND id = ?",
        (organization_id, supplier_id),
    ).fetchone()
    if not supplier:
        if not supplier_name:
            raise ValueError("Fornecedor nao encontrado.")
        conn.execute(
            """
            INSERT INTO suppliers
                (id, organization_id, name, normalized_name, contact_name, contact_phone, contact_email,
                 minimum_order_value, target_order_value, average_lead_time_days, order_review_cycle_days,
                 target_coverage_adjustment_days, order_difficulty, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                supplier_id,
                organization_id,
                supplier_name,
                normalize(supplier_name),
                contact_name,
                contact_phone,
                contact_email,
                minimum_order_value,
                target_order_value,
                average_lead_time_days,
                order_review_cycle_days or 14,
                target_coverage_adjustment_days,
                order_difficulty,
                notes,
            ),
        )
        controlled_values = {
            "name": supplier_name,
            "contact_name": contact_name,
            "contact_phone": contact_phone,
            "contact_email": contact_email,
            "minimum_order_value": minimum_order_value,
            "target_order_value": target_order_value,
            "average_lead_time_days": average_lead_time_days,
            "order_review_cycle_days": order_review_cycle_days or 14,
            "target_coverage_adjustment_days": target_coverage_adjustment_days,
            "order_difficulty": order_difficulty,
            "notes": notes,
        }
    else:
        supplier_name = supplier_name or supplier["name"]
        provided_fields = {
            "supplier_name": "name",
            "contact_name": "contact_name",
            "contact_phone": "contact_phone",
            "contact_email": "contact_email",
            "minimum_order_value": "minimum_order_value",
            "target_order_value": "target_order_value",
            "average_lead_time_days": "average_lead_time_days",
            "order_review_cycle_days": "order_review_cycle_days",
            "target_coverage_adjustment_days": "target_coverage_adjustment_days",
            "order_difficulty": "order_difficulty",
            "notes": "notes",
        }
        contact_name = contact_name if "contact_name" in payload else (supplier["contact_name"] or "")
        contact_phone = contact_phone if "contact_phone" in payload else (supplier["contact_phone"] or "")
        contact_email = contact_email if "contact_email" in payload else (supplier["contact_email"] or "")
        minimum_order_value = minimum_order_value if "minimum_order_value" in payload else float(supplier["minimum_order_value"] or 0)
        target_order_value = target_order_value if "target_order_value" in payload else float(supplier["target_order_value"] or 0)
        average_lead_time_days = (
            average_lead_time_days
            if "average_lead_time_days" in payload
            else int(supplier["average_lead_time_days"] or 0)
        )
        order_review_cycle_days = (
            order_review_cycle_days
            if "order_review_cycle_days" in payload
            else int(supplier["order_review_cycle_days"] or 14)
        )
        target_coverage_adjustment_days = (
            target_coverage_adjustment_days
            if "target_coverage_adjustment_days" in payload
            else int(supplier["target_coverage_adjustment_days"] or 0)
        )
        order_difficulty = order_difficulty if "order_difficulty" in payload else (supplier["order_difficulty"] or "auto")
        notes = notes if "notes" in payload else (supplier["notes"] or "")
        conn.execute(
            """
            UPDATE suppliers
            SET name = ?,
                normalized_name = ?,
                contact_name = ?,
                contact_phone = ?,
                contact_email = ?,
                minimum_order_value = ?,
                target_order_value = ?,
                average_lead_time_days = ?,
                order_review_cycle_days = ?,
                target_coverage_adjustment_days = ?,
                order_difficulty = ?,
                notes = ?
            WHERE organization_id = ?
              AND id = ?
            """,
            (
                supplier_name,
                normalize(supplier_name),
                contact_name,
                contact_phone,
                contact_email,
                minimum_order_value,
                target_order_value,
                average_lead_time_days,
                order_review_cycle_days,
                target_coverage_adjustment_days,
                order_difficulty,
                notes,
                organization_id,
                supplier_id,
            ),
        )
        final_values = {
            "name": supplier_name,
            "contact_name": contact_name,
            "contact_phone": contact_phone,
            "contact_email": contact_email,
            "minimum_order_value": minimum_order_value,
            "target_order_value": target_order_value,
            "average_lead_time_days": average_lead_time_days,
            "order_review_cycle_days": order_review_cycle_days,
            "target_coverage_adjustment_days": target_coverage_adjustment_days,
            "order_difficulty": order_difficulty,
            "notes": notes,
        }
        controlled_values = {
            field_name: final_values[field_name]
            for payload_key, field_name in provided_fields.items()
            if payload_key in payload
        }
    if controlled_values:
        mark_app_controlled_fields(
            conn,
            organization_id=organization_id,
            entity_type="supplier",
            entity_id=supplier_id,
            source_view="supplier_profile",
            values=controlled_values,
        )
    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, 'supplier_profile_update', 'supplier', ?, '{}', ?)
        """,
        (
            organization_id,
            supplier_id,
            json.dumps(
                {
                    "supplier_name": supplier_name,
                    "contact_name": contact_name,
                    "contact_phone": contact_phone,
                    "contact_email": contact_email,
                    "minimum_order_value": minimum_order_value,
                    "target_order_value": target_order_value,
                    "average_lead_time_days": average_lead_time_days,
                    "order_review_cycle_days": order_review_cycle_days,
                    "target_coverage_adjustment_days": target_coverage_adjustment_days,
                    "order_difficulty": order_difficulty,
                    "notes": notes,
                },
                ensure_ascii=False,
            ),
        ),
    )
    conn.commit()
    return {
        "ok": True,
        "organization_id": organization_id,
        "supplier_id": supplier_id,
        "supplier_name": supplier_name,
        "contact_name": contact_name,
        "contact_phone": contact_phone,
        "contact_email": contact_email,
        "minimum_order_value": minimum_order_value,
        "target_order_value": target_order_value,
        "average_lead_time_days": average_lead_time_days,
        "order_review_cycle_days": order_review_cycle_days,
        "target_coverage_adjustment_days": target_coverage_adjustment_days,
        "order_difficulty": order_difficulty,
        "supplier_notes": notes,
    }


def update_product_mix_decision(conn: sqlite3.Connection, payload: dict) -> dict:
    organization_id = scalar_text(payload.get("organization_id"))
    product_id = scalar_text(payload.get("product_id"))
    decision = scalar_text(payload.get("decision"))
    allowed = {"drop", "force_buy", "clear"}
    if not organization_id or not product_id or decision not in allowed:
        raise ValueError("organization_id, product_id e decision valida sao obrigatorios.")
    product = conn.execute(
        "SELECT id, name FROM products WHERE organization_id = ? AND id = ?",
        (organization_id, product_id),
    ).fetchone()
    if not product:
        raise ValueError("Produto nao encontrado.")

    if decision == "drop":
        marker = "out_of_mix_permanent"
        blocked = 1
        ignored = 1
        note = "Operador marcou como descontinuado. Produto continua visivel se houver estoque, mas nao entra em compra futura."
        action = "product_mix_drop"
    elif decision == "force_buy":
        marker = "force_one_more_purchase"
        blocked = 0
        ignored = 0
        note = "Operador decidiu forcar mais uma compra antes de descontinuar."
        action = "product_mix_force_buy"
    else:
        marker = ""
        blocked = 0
        ignored = 0
        note = "Decisao de mix limpa pelo operador."
        action = "product_mix_clear"

    conn.execute(
        """
        INSERT INTO product_settings
            (organization_id, product_id, blocked_for_purchase, ignored_in_purchase_reports, marker, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, product_id) DO UPDATE SET
            blocked_for_purchase = excluded.blocked_for_purchase,
            ignored_in_purchase_reports = excluded.ignored_in_purchase_reports,
            marker = excluded.marker,
            notes = excluded.notes
        """,
        (organization_id, product_id, blocked, ignored, marker, note),
    )
    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, ?, 'product', ?, '{}', ?)
        """,
        (
            organization_id,
            action,
            product_id,
            json.dumps({"decision": decision, "marker": marker, "notes": note}, ensure_ascii=False),
        ),
    )
    if decision in {"drop", "force_buy"}:
        conn.execute(
            """
            UPDATE action_items
            SET status = 'completed',
                completed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE organization_id = ?
              AND target_type = 'product'
              AND target_id = ?
              AND action_type = 'product_mix_decision'
              AND status IN ('open', 'in_progress')
            """,
            (organization_id, product_id),
        )
    conn.commit()
    return {
        "ok": True,
        "organization_id": organization_id,
        "product_id": product_id,
        "product_name": product["name"],
        "decision": decision,
        "marker": marker,
        "blocked_for_purchase": blocked,
        "ignored_in_purchase_reports": ignored,
    }


def update_products_mix_decision_bulk(conn: sqlite3.Connection, payload: dict) -> dict:
    organization_id = scalar_text(payload.get("organization_id"))
    decision = scalar_text(payload.get("decision"))
    extra_notes = scalar_text(payload.get("notes"))
    product_ids = payload.get("product_ids") if isinstance(payload.get("product_ids"), list) else []
    product_ids = [scalar_text(product_id) for product_id in product_ids if scalar_text(product_id)]
    allowed = {"drop", "force_buy", "clear"}
    if not organization_id or decision not in allowed or not product_ids:
        raise ValueError("organization_id, product_ids e decision valida sao obrigatorios.")
    if len(product_ids) > 200:
        raise ValueError("Limite de 200 produtos por edicao em massa.")
    if decision == "drop":
        marker = "out_of_mix_permanent"
        blocked = 1
        ignored = 1
        note = "Operador marcou em massa como descontinuado. Produtos continuam visiveis se houver estoque, mas nao entram em compra futura."
        action = "product_mix_drop_bulk"
    elif decision == "force_buy":
        marker = "force_one_more_purchase"
        blocked = 0
        ignored = 0
        note = "Operador decidiu forcar mais uma compra em massa antes de descontinuar."
        action = "product_mix_force_buy_bulk"
    else:
        marker = ""
        blocked = 0
        ignored = 0
        note = "Decisao de mix limpa em massa pelo operador."
        action = "product_mix_clear_bulk"
    if extra_notes:
        note = f"{note} Observacao: {extra_notes}"
    placeholders = ",".join("?" for _ in product_ids)
    valid_rows = conn.execute(
        f"SELECT id, name FROM products WHERE organization_id = ? AND id IN ({placeholders})",
        (organization_id, *product_ids),
    ).fetchall()
    valid_ids = [row["id"] for row in valid_rows]
    if not valid_ids:
        raise ValueError("Nenhum produto encontrado para edicao em massa.")
    conn.executemany(
        """
        INSERT INTO product_settings
            (organization_id, product_id, blocked_for_purchase, ignored_in_purchase_reports, marker, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, product_id) DO UPDATE SET
            blocked_for_purchase = excluded.blocked_for_purchase,
            ignored_in_purchase_reports = excluded.ignored_in_purchase_reports,
            marker = excluded.marker,
            notes = excluded.notes
        """,
        [(organization_id, product_id, blocked, ignored, marker, note) for product_id in valid_ids],
    )
    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, ?, 'product_group', ?, '{}', ?)
        """,
        (
            organization_id,
            action,
            f"bulk:{decision}",
            json.dumps({"decision": decision, "count": len(valid_ids), "product_ids": valid_ids, "notes": note}, ensure_ascii=False),
        ),
    )
    decision_record = insert_operational_decision(
        conn,
        {
            "organization_id": organization_id,
            "source_view": "products",
            "entity_type": "product_group",
            "entity_id": f"bulk:{decision}",
            "entity_label": "Edicao em massa de mix",
            "decision_type": action,
            "decision_value": decision,
            "scope_type": "bulk",
            "scope_label": "Produtos selecionados por filtro",
            "applied_to_count": len(valid_ids),
            "notes": note,
            "metadata": {"product_ids": valid_ids, "marker": marker},
        },
    )
    if decision in {"drop", "force_buy"}:
        placeholders = ",".join("?" for _ in valid_ids)
        conn.execute(
            f"""
            UPDATE action_items
            SET status = 'completed',
                completed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE organization_id = ?
              AND target_type = 'product'
              AND target_id IN ({placeholders})
              AND action_type = 'product_mix_decision'
              AND status IN ('open', 'in_progress')
            """,
            (organization_id, *valid_ids),
        )
    conn.commit()
    return {"ok": True, "updated": len(valid_ids), "decision": decision, "operational_decision_id": decision_record["id"]}
