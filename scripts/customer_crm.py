from __future__ import annotations

import json
import sqlite3

from db_helpers import one, rows, scalar_text


CRM_STATUSES = {"active", "follow_up", "negotiating", "risk", "inactive"}
CRM_PRIORITIES = {"low", "normal", "high", "urgent"}
CRM_NEXT_ACTIONS = {"", "call", "whatsapp", "send_catalog", "visit", "review_terms", "follow_up"}


def _choice(value: object, allowed: set[str], default: str) -> str:
    text = scalar_text(value).lower()
    return text if text in allowed else default


def _customer(conn: sqlite3.Connection, customer_id: str) -> dict:
    if not customer_id:
        raise ValueError("Parametro id do cliente e obrigatorio.")
    customer = one(
        conn,
        """
        SELECT id, organization_id, source_code, name, canonical_name, normalized_name, document, customer_type, active
        FROM customers
        WHERE id = ?
        """,
        (customer_id,),
    )
    if not customer:
        raise ValueError("Cliente nao encontrado.")
    return customer


def _tags(value: object) -> list[str]:
    if isinstance(value, list):
        raw = value
    else:
        text = scalar_text(value)
        raw = text.replace(";", ",").split(",") if text else []
    result: list[str] = []
    seen: set[str] = set()
    for item in raw:
        tag = scalar_text(item)[:40]
        key = tag.lower()
        if tag and key not in seen:
            result.append(tag)
            seen.add(key)
    return result[:12]


def _default_profile(customer: dict) -> dict:
    return {
        "organization_id": customer["organization_id"],
        "customer_id": customer["id"],
        "customer_canonical_name": customer.get("canonical_name") or customer.get("normalized_name") or customer.get("name") or "",
        "owner_user_id": "",
        "owner_name": "",
        "commercial_status": "follow_up",
        "priority": "normal",
        "next_action": "",
        "next_action_at": "",
        "internal_notes": "",
        "tags": [],
        "created_at": "",
        "updated_at": "",
        "persisted": False,
    }


def _profile(conn: sqlite3.Connection, customer: dict) -> dict:
    profile = one(
        conn,
        """
        SELECT *
        FROM customer_crm_profiles
        WHERE organization_id = ?
          AND customer_id = ?
        """,
        (customer["organization_id"], customer["id"]),
    )
    if not profile:
        return _default_profile(customer)
    try:
        tags = json.loads(profile.get("tags_json") or "[]")
    except json.JSONDecodeError:
        tags = []
    profile["tags"] = _tags(tags)
    profile["persisted"] = True
    return profile


def api_customer_crm(conn: sqlite3.Connection, customer_id: str) -> dict:
    customer = _customer(conn, customer_id)
    profile = _profile(conn, customer)
    open_actions = rows(
        conn,
        """
        SELECT id, action_type, title, due_at, status, priority, owner_name, notes, created_at, updated_at
        FROM customer_actions
        WHERE organization_id = ?
          AND customer_id = ?
          AND status <> 'archived'
        ORDER BY
          CASE status WHEN 'open' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
          due_at = '',
          due_at,
          updated_at DESC
        LIMIT 12
        """,
        (customer["organization_id"], customer["id"]),
    )
    return {
        "contract": "customer_crm.v1",
        "customer": {
            "id": customer["id"],
            "organization_id": customer["organization_id"],
            "source_code": customer.get("source_code") or "",
            "name": customer.get("name") or "",
            "canonical_name": customer.get("canonical_name") or "",
            "document": customer.get("document") or "",
            "customer_type": customer.get("customer_type") or "",
        },
        "profile": {
            "organization_id": profile["organization_id"],
            "customer_id": profile["customer_id"],
            "owner_user_id": profile.get("owner_user_id") or "",
            "owner_name": profile.get("owner_name") or "",
            "commercial_status": profile.get("commercial_status") or "follow_up",
            "priority": profile.get("priority") or "normal",
            "next_action": profile.get("next_action") or "",
            "next_action_at": profile.get("next_action_at") or "",
            "internal_notes": profile.get("internal_notes") or "",
            "tags": profile.get("tags") or [],
            "updated_at": profile.get("updated_at") or "",
            "persisted": bool(profile.get("persisted")),
        },
        "actions": open_actions,
    }


def upsert_customer_crm(conn: sqlite3.Connection, payload: dict) -> dict:
    customer = _customer(conn, scalar_text(payload.get("customer_id") or payload.get("id")))
    canonical_name = customer.get("canonical_name") or customer.get("normalized_name") or customer.get("name") or ""
    commercial_status = _choice(payload.get("commercial_status"), CRM_STATUSES, "follow_up")
    priority = _choice(payload.get("priority"), CRM_PRIORITIES, "normal")
    next_action = _choice(payload.get("next_action"), CRM_NEXT_ACTIONS, "")
    tags = _tags(payload.get("tags"))
    conn.execute(
        """
        INSERT INTO customer_crm_profiles
            (organization_id, customer_id, customer_canonical_name, owner_user_id, owner_name,
             commercial_status, priority, next_action, next_action_at, internal_notes, tags_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, customer_id) DO UPDATE SET
            customer_canonical_name = excluded.customer_canonical_name,
            owner_user_id = excluded.owner_user_id,
            owner_name = excluded.owner_name,
            commercial_status = excluded.commercial_status,
            priority = excluded.priority,
            next_action = excluded.next_action,
            next_action_at = excluded.next_action_at,
            internal_notes = excluded.internal_notes,
            tags_json = excluded.tags_json,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            customer["organization_id"],
            customer["id"],
            canonical_name,
            scalar_text(payload.get("owner_user_id"))[:120],
            scalar_text(payload.get("owner_name"))[:160],
            commercial_status,
            priority,
            next_action,
            scalar_text(payload.get("next_action_at"))[:10],
            scalar_text(payload.get("internal_notes"))[:4000],
            json.dumps(tags, ensure_ascii=True),
        ),
    )
    conn.commit()
    return api_customer_crm(conn, customer["id"])
