from __future__ import annotations

import json
import sqlite3
from uuid import uuid4

from db_helpers import default_organization_id, parse_int, scalar_text


def insert_operational_decision(conn: sqlite3.Connection, payload: dict) -> dict:
    organization_id = scalar_text(payload.get("organization_id"))
    if not organization_id:
        organization_id = default_organization_id(conn)
    entity_type = scalar_text(payload.get("entity_type")) or scalar_text(payload.get("target_type")) or "workspace"
    entity_id = scalar_text(payload.get("entity_id")) or scalar_text(payload.get("target_id")) or "general"
    entity_label = scalar_text(payload.get("entity_label")) or scalar_text(payload.get("scope"))
    decision_type = scalar_text(payload.get("decision_type")) or scalar_text(payload.get("action")) or "quick_decision"
    decision_value = scalar_text(payload.get("decision_value")) or scalar_text(payload.get("decision"))
    notes = scalar_text(payload.get("notes"))
    reason = scalar_text(payload.get("reason"))
    source_view = scalar_text(payload.get("source_view"))
    scope_label = scalar_text(payload.get("scope_label")) or scalar_text(payload.get("scope"))
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    target_ids = payload.get("target_ids") if isinstance(payload.get("target_ids"), list) else []
    target_ids = [scalar_text(item) for item in target_ids if scalar_text(item)]
    if target_ids:
        metadata = {**metadata, "target_ids": target_ids[:200]}
    applied_to_count = parse_int(payload.get("applied_to_count"), len(target_ids) or 1) or 1
    scope_type = scalar_text(payload.get("scope_type")) or ("bulk" if applied_to_count > 1 else "single")
    if not organization_id:
        raise ValueError("organization_id obrigatorio.")
    if not entity_type or not decision_type:
        raise ValueError("entity_type e decision_type sao obrigatorios.")
    decision_id = str(uuid4())
    conn.execute(
        """
        INSERT INTO operational_decisions
            (id, organization_id, actor_user_id, source_kind, source_view,
             entity_type, entity_id, entity_label, decision_type, decision_value,
             scope_type, scope_label, applied_to_count, reason, notes, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            decision_id,
            organization_id,
            scalar_text(payload.get("actor_user_id")),
            scalar_text(payload.get("source_kind")) or "user",
            source_view,
            entity_type,
            entity_id,
            entity_label,
            decision_type,
            decision_value,
            scope_type,
            scope_label,
            applied_to_count,
            reason,
            notes,
            json.dumps(metadata, ensure_ascii=False),
        ),
    )
    return {
        "id": decision_id,
        "organization_id": organization_id,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "decision_type": decision_type,
        "decision_value": decision_value,
        "applied_to_count": applied_to_count,
    }


def record_operational_decision(conn: sqlite3.Connection, payload: dict) -> dict:
    decision = insert_operational_decision(conn, payload)
    conn.commit()
    return {"ok": True, "decision": decision}


def record_quick_action(conn: sqlite3.Connection, payload: dict) -> dict:
    decision = insert_operational_decision(conn, payload)
    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, ?, ?, ?, '{}', ?)
        """,
        (
            decision["organization_id"],
            decision["decision_type"],
            decision["entity_type"],
            decision["entity_id"],
            json.dumps({"operational_decision_id": decision["id"], "decision": decision["decision_value"]}, ensure_ascii=False),
        ),
    )
    conn.commit()
    return {"ok": True, "saved": 1, "target_count": decision["applied_to_count"], "decision": decision}
