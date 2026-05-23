from __future__ import annotations

import hashlib
import hmac
import json
import os
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime
from uuid import uuid4

from db_helpers import default_organization_id, parse_int, scalar_text

WHATSAPP_STATUSES = [
    {"id": "novo", "label": "Novo"},
    {"id": "em_atendimento", "label": "Em atendimento"},
    {"id": "aguardando_cliente", "label": "Aguardando cliente"},
    {"id": "orcamento_enviado", "label": "Orcamento enviado"},
    {"id": "follow_up", "label": "Follow-up"},
    {"id": "fechado", "label": "Fechado"},
    {"id": "perdido", "label": "Perdido"},
]

def whatsapp_config() -> dict:
    access_token = os.environ.get("WHATSAPP_ACCESS_TOKEN", "").strip()
    phone_number_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    return {
        "access_token_configured": bool(access_token),
        "phone_number_id_configured": bool(phone_number_id),
        "verify_token_configured": bool(os.environ.get("WHATSAPP_VERIFY_TOKEN", "").strip()),
        "app_secret_configured": bool(os.environ.get("WHATSAPP_APP_SECRET", "").strip()),
        "graph_version": os.environ.get("WHATSAPP_GRAPH_VERSION", "v23.0").strip() or "v23.0",
        "mode": "api" if access_token and phone_number_id else "simulado",
    }


def _json(value: object) -> str:
    return json.dumps(value or {}, ensure_ascii=False)


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _message_timestamp(value: object) -> str:
    text = scalar_text(value)
    if not text:
        return _now()
    try:
        return datetime.fromtimestamp(int(text)).isoformat(timespec="seconds")
    except (TypeError, ValueError, OSError):
        return _now()


def _agent_by_id(conn: sqlite3.Connection, organization_id: str, agent_id: str) -> dict:
    if not agent_id:
        return {}
    row = conn.execute(
        """
        SELECT id, name, department, active, sort_order
        FROM whatsapp_agents
        WHERE organization_id = ? AND id = ? AND active = 1
        """,
        (organization_id, agent_id),
    ).fetchone()
    return dict(row) if row else {}


def api_whatsapp_agents(conn: sqlite3.Connection, organization_id: str = "") -> list[dict]:
    organization_id = organization_id or default_organization_id(conn)
    return [
        dict(row)
        for row in conn.execute(
            """
            SELECT id, name, department, active, sort_order
            FROM whatsapp_agents
            WHERE organization_id = ? AND active = 1
            ORDER BY sort_order, name
            """,
            (organization_id,),
        ).fetchall()
    ]


def api_whatsapp_departments(conn: sqlite3.Connection, organization_id: str = "") -> list[str]:
    organization_id = organization_id or default_organization_id(conn)
    rows = conn.execute(
        """
        SELECT department FROM whatsapp_agents
        WHERE organization_id = ? AND active = 1 AND department <> ''
        UNION
        SELECT department FROM whatsapp_conversations
        WHERE organization_id = ? AND department <> ''
        ORDER BY department
        """,
        (organization_id, organization_id),
    ).fetchall()
    return [row["department"] for row in rows]


def _normalize_phone(value: object) -> str:
    return "".join(char for char in scalar_text(value) if char.isdigit())


def upsert_whatsapp_agent(conn: sqlite3.Connection, payload: dict) -> dict:
    organization_id = scalar_text(payload.get("organization_id")) or default_organization_id(conn)
    if not organization_id:
        raise ValueError("organization_id obrigatorio.")
    agent_id = scalar_text(payload.get("id"))
    name = scalar_text(payload.get("name"))
    department = scalar_text(payload.get("department"))
    active = 0 if scalar_text(payload.get("active")).lower() in {"0", "false", "nao", "não", "no"} else 1
    sort_order = parse_int(payload.get("sort_order"), 0) or 0
    if not name:
        raise ValueError("Nome do atendente obrigatorio.")
    if agent_id:
        conn.execute(
            """
            UPDATE whatsapp_agents
            SET name = ?, department = ?, active = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND organization_id = ?
            """,
            (name, department, active, sort_order, agent_id, organization_id),
        )
    else:
        agent_id = f"{organization_id}:wa_agent:{uuid4().hex[:12]}"
        conn.execute(
            """
            INSERT INTO whatsapp_agents
                (id, organization_id, name, department, active, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (agent_id, organization_id, name, department, active, sort_order),
        )
    conn.commit()
    agent = _agent_by_id(conn, organization_id, agent_id) or {"id": agent_id, "name": name, "department": department, "active": active, "sort_order": sort_order}
    return {"ok": True, "agent": agent}


def _message_body(message: dict) -> str:
    msg_type = scalar_text(message.get("type")) or "unknown"
    if msg_type == "text":
        return scalar_text((message.get("text") or {}).get("body"))
    if msg_type == "button":
        return scalar_text((message.get("button") or {}).get("text"))
    if msg_type == "interactive":
        interactive = message.get("interactive") or {}
        if interactive.get("button_reply"):
            return scalar_text(interactive["button_reply"].get("title"))
        if interactive.get("list_reply"):
            return scalar_text(interactive["list_reply"].get("title"))
    if msg_type in {"image", "video", "document"}:
        media = message.get(msg_type) or {}
        return scalar_text(media.get("caption")) or scalar_text(media.get("filename")) or f"[{msg_type}]"
    return f"[{msg_type}]"


def _record_event(
    conn: sqlite3.Connection,
    organization_id: str,
    conversation_id: str,
    event_type: str,
    note: str = "",
    actor_name: str = "",
    metadata: dict | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO whatsapp_conversation_events
            (id, organization_id, conversation_id, event_type, actor_name, note, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (f"{organization_id}:wa_event:{uuid4().hex[:12]}", organization_id, conversation_id, event_type, actor_name, note, _json(metadata or {})),
    )


def _ensure_contact(conn: sqlite3.Connection, organization_id: str, wa_id: str, display_name: str = "") -> str:
    if not wa_id:
        raise ValueError("wa_id obrigatorio para contato WhatsApp.")
    contact = conn.execute(
        """
        SELECT id FROM whatsapp_contacts
        WHERE organization_id = ? AND wa_id = ?
        """,
        (organization_id, wa_id),
    ).fetchone()
    if contact:
        conn.execute(
            """
            UPDATE whatsapp_contacts
            SET display_name = COALESCE(NULLIF(?, ''), display_name),
                phone_number = COALESCE(NULLIF(?, ''), phone_number),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (display_name, _normalize_phone(wa_id), contact["id"]),
        )
        return contact["id"]
    contact_id = f"{organization_id}:wa_contact:{uuid4().hex[:12]}"
    conn.execute(
        """
        INSERT INTO whatsapp_contacts
            (id, organization_id, wa_id, display_name, phone_number)
        VALUES (?, ?, ?, ?, ?)
        """,
        (contact_id, organization_id, wa_id, display_name, _normalize_phone(wa_id)),
    )
    return contact_id


def _ensure_conversation(
    conn: sqlite3.Connection,
    organization_id: str,
    contact_id: str,
    wa_id: str,
    phone_number_id: str,
    display_name: str = "",
) -> str:
    conversation = conn.execute(
        """
        SELECT id FROM whatsapp_conversations
        WHERE organization_id = ?
          AND contact_wa_id = ?
          AND channel_phone_number_id = ?
        """,
        (organization_id, wa_id, phone_number_id),
    ).fetchone()
    if conversation:
        conn.execute(
            """
            UPDATE whatsapp_conversations
            SET contact_id = ?,
                contact_name = COALESCE(NULLIF(?, ''), contact_name),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (contact_id, display_name, conversation["id"]),
        )
        return conversation["id"]
    conversation_id = f"{organization_id}:wa_conv:{uuid4().hex[:12]}"
    conn.execute(
        """
        INSERT INTO whatsapp_conversations
            (id, organization_id, contact_id, contact_wa_id, contact_name,
             channel_phone_number_id, status, priority, last_message_at)
        VALUES (?, ?, ?, ?, ?, ?, 'novo', 3, CURRENT_TIMESTAMP)
        """,
        (conversation_id, organization_id, contact_id, wa_id, display_name, phone_number_id),
    )
    _record_event(conn, organization_id, conversation_id, "created", "Conversa criada pelo webhook.")
    return conversation_id


def _insert_message(
    conn: sqlite3.Connection,
    organization_id: str,
    conversation_id: str,
    *,
    wa_message_id: str = "",
    direction: str,
    message_type: str,
    body: str,
    status: str,
    sender_name: str = "",
    sender_wa_id: str = "",
    sent_at: str = "",
    received_at: str = "",
    raw_payload: dict | None = None,
    error_text: str = "",
) -> str:
    message_id = f"{organization_id}:wa_msg:{uuid4().hex[:12]}"
    conn.execute(
        """
        INSERT OR IGNORE INTO whatsapp_messages
            (id, organization_id, conversation_id, wa_message_id, direction,
             message_type, body, status, sender_name, sender_wa_id,
             sent_at, received_at, raw_payload_json, error_text)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            message_id,
            organization_id,
            conversation_id,
            wa_message_id or None,
            direction,
            message_type,
            body,
            status,
            sender_name,
            sender_wa_id,
            sent_at,
            received_at,
            _json(raw_payload or {}),
            error_text,
        ),
    )
    row = conn.execute(
        """
        SELECT id FROM whatsapp_messages
        WHERE id = ?
           OR (organization_id = ? AND wa_message_id = ?)
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (message_id, organization_id, wa_message_id or None),
    ).fetchone()
    return row["id"] if row else message_id


def verify_webhook_challenge(query: dict) -> str:
    mode = scalar_text(query.get("hub.mode"))
    token = scalar_text(query.get("hub.verify_token"))
    challenge = scalar_text(query.get("hub.challenge"))
    expected = os.environ.get("WHATSAPP_VERIFY_TOKEN", "").strip()
    if mode != "subscribe" or not challenge:
        raise ValueError("Desafio de webhook invalido.")
    if not expected:
        raise ValueError("WHATSAPP_VERIFY_TOKEN nao configurado.")
    if not hmac.compare_digest(token, expected):
        raise ValueError("Verify token do WhatsApp nao confere.")
    return challenge


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    app_secret = os.environ.get("WHATSAPP_APP_SECRET", "").strip()
    if not app_secret:
        return True
    expected = "sha256=" + hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature or "", expected)


def receive_whatsapp_webhook(conn: sqlite3.Connection, payload: dict) -> dict:
    organization_id = default_organization_id(conn)
    if not organization_id:
        raise ValueError("Nenhuma organizacao cadastrada.")
    saved_messages = 0
    saved_statuses = 0
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            metadata = value.get("metadata") or {}
            phone_number_id = scalar_text(metadata.get("phone_number_id")) or os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip()
            contact_names = {
                scalar_text(contact.get("wa_id")): scalar_text((contact.get("profile") or {}).get("name"))
                for contact in value.get("contacts") or []
            }
            for message in value.get("messages") or []:
                wa_id = scalar_text(message.get("from"))
                display_name = contact_names.get(wa_id, "")
                contact_id = _ensure_contact(conn, organization_id, wa_id, display_name)
                conversation_id = _ensure_conversation(conn, organization_id, contact_id, wa_id, phone_number_id, display_name)
                received_at = _message_timestamp(message.get("timestamp"))
                _insert_message(
                    conn,
                    organization_id,
                    conversation_id,
                    wa_message_id=scalar_text(message.get("id")),
                    direction="inbound",
                    message_type=scalar_text(message.get("type")) or "unknown",
                    body=_message_body(message),
                    status="received",
                    sender_name=display_name,
                    sender_wa_id=wa_id,
                    received_at=received_at,
                    raw_payload=message,
                )
                conn.execute(
                    """
                    UPDATE whatsapp_conversations
                    SET last_message_at = ?,
                        last_inbound_at = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (received_at, received_at, conversation_id),
                )
                saved_messages += 1
            for status in value.get("statuses") or []:
                wa_message_id = scalar_text(status.get("id"))
                message_status = scalar_text(status.get("status"))
                if not wa_message_id or not message_status:
                    continue
                conn.execute(
                    """
                    UPDATE whatsapp_messages
                    SET status = ?, error_text = ?, raw_payload_json = ?
                    WHERE organization_id = ? AND wa_message_id = ?
                    """,
                    (
                        message_status,
                        scalar_text(((status.get("errors") or [{}])[0] or {}).get("message")) if status.get("errors") else "",
                        _json(status),
                        organization_id,
                        wa_message_id,
                    ),
                )
                saved_statuses += 1
    conn.commit()
    return {"ok": True, "saved_messages": saved_messages, "saved_statuses": saved_statuses}


def api_whatsapp_conversations(conn: sqlite3.Connection) -> dict:
    organization_id = default_organization_id(conn)
    agents = api_whatsapp_agents(conn, organization_id)
    departments = api_whatsapp_departments(conn, organization_id)
    rows = [
        dict(row)
        for row in conn.execute(
            """
            SELECT
                c.id, c.contact_name, c.contact_wa_id, c.status, c.owner_user_id,
                c.owner_name, c.department, c.priority, c.last_message_at,
                c.last_inbound_at, c.last_outbound_at, c.follow_up_at,
                c.notes, c.created_at,
                COALESCE(m.body, '') AS last_message_body,
                COALESCE(m.direction, '') AS last_message_direction
            FROM whatsapp_conversations c
            LEFT JOIN whatsapp_messages m ON m.id = (
                SELECT id FROM whatsapp_messages
                WHERE conversation_id = c.id
                ORDER BY COALESCE(received_at, sent_at, created_at) DESC, created_at DESC
                LIMIT 1
            )
            WHERE c.organization_id = ?
            ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
            LIMIT 200
            """,
            (organization_id,),
        ).fetchall()
    ]
    metrics = {
        "open": sum(1 for row in rows if row["status"] not in {"fechado", "perdido"}),
        "new": sum(1 for row in rows if row["status"] == "novo"),
        "unassigned": sum(1 for row in rows if not row["owner_user_id"] and row["status"] not in {"fechado", "perdido"}),
        "follow_up": sum(1 for row in rows if row["status"] == "follow_up"),
    }
    return {
        "contract": "whatsapp_conversations.v1",
        "rows": rows,
        "metrics": metrics,
        "agents": agents,
        "users": agents,
        "statuses": WHATSAPP_STATUSES,
        "departments": departments,
        "config": whatsapp_config(),
    }


def api_whatsapp_conversation_detail(conn: sqlite3.Connection, conversation_id: str) -> dict:
    if not conversation_id:
        raise ValueError("id da conversa obrigatorio.")
    conversation = conn.execute("SELECT * FROM whatsapp_conversations WHERE id = ?", (conversation_id,)).fetchone()
    if not conversation:
        raise ValueError("Conversa WhatsApp nao encontrada.")
    organization_id = conversation["organization_id"]
    agents = api_whatsapp_agents(conn, organization_id)
    departments = api_whatsapp_departments(conn, organization_id)
    messages = [
        dict(row)
        for row in conn.execute(
            """
            SELECT id, wa_message_id, direction, message_type, body, status,
                   sender_name, sender_wa_id, sent_at, received_at, error_text, created_at
            FROM whatsapp_messages
            WHERE conversation_id = ?
            ORDER BY COALESCE(received_at, sent_at, created_at), created_at
            """,
            (conversation_id,),
        ).fetchall()
    ]
    events = [
        dict(row)
        for row in conn.execute(
            """
            SELECT id, event_type, actor_name, note, created_at
            FROM whatsapp_conversation_events
            WHERE conversation_id = ?
            ORDER BY created_at DESC
            LIMIT 30
            """,
            (conversation_id,),
        ).fetchall()
    ]
    return {
        "contract": "whatsapp_conversation_detail.v1",
        "conversation": dict(conversation),
        "messages": messages,
        "events": events,
        "agents": agents,
        "users": agents,
        "statuses": WHATSAPP_STATUSES,
        "departments": departments,
        "config": whatsapp_config(),
    }


def update_whatsapp_conversation(conn: sqlite3.Connection, payload: dict) -> dict:
    conversation_id = scalar_text(payload.get("id"))
    if not conversation_id:
        raise ValueError("id da conversa obrigatorio.")
    current = conn.execute("SELECT * FROM whatsapp_conversations WHERE id = ?", (conversation_id,)).fetchone()
    if not current:
        raise ValueError("Conversa WhatsApp nao encontrada.")
    owner_user_id = scalar_text(payload.get("owner_user_id"))
    owner = _agent_by_id(conn, current["organization_id"], owner_user_id)
    if owner_user_id and not owner:
        raise ValueError("Atendente WhatsApp nao cadastrado para esta empresa.")
    status = scalar_text(payload.get("status")) or current["status"]
    valid_statuses = {row["id"] for row in WHATSAPP_STATUSES}
    if status not in valid_statuses:
        raise ValueError("Status WhatsApp invalido.")
    department = scalar_text(payload.get("department")) or owner.get("department") or current["department"]
    priority = parse_int(payload.get("priority"), current["priority"]) or 3
    notes = scalar_text(payload.get("notes")) if "notes" in payload else current["notes"]
    follow_up_at = scalar_text(payload.get("follow_up_at")) if "follow_up_at" in payload else current["follow_up_at"]
    closed_at = _now() if status in {"fechado", "perdido"} and not current["closed_at"] else current["closed_at"]
    conn.execute(
        """
        UPDATE whatsapp_conversations
        SET status = ?,
            owner_user_id = ?,
            owner_name = ?,
            department = ?,
            priority = ?,
            notes = ?,
            follow_up_at = ?,
            closed_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (
            status,
            owner_user_id,
            owner.get("name", "") if owner_user_id else "",
            department,
            priority,
            notes,
            follow_up_at,
            closed_at,
            conversation_id,
        ),
    )
    _record_event(
        conn,
        current["organization_id"],
        conversation_id,
        "updated",
        scalar_text(payload.get("event_note")) or "Atendimento atualizado.",
        owner.get("name", "") if owner_user_id else "",
        {"status": status, "owner_user_id": owner_user_id, "department": department},
    )
    conn.commit()
    return api_whatsapp_conversation_detail(conn, conversation_id)


def _send_cloud_api_message(to_wa_id: str, body: str) -> tuple[str, str]:
    config = whatsapp_config()
    access_token = os.environ.get("WHATSAPP_ACCESS_TOKEN", "").strip()
    phone_number_id = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip()
    if not access_token or not phone_number_id:
        return "", "simulado"
    url = f"https://graph.facebook.com/{config['graph_version']}/{phone_number_id}/messages"
    request_body = _json(
        {
            "messaging_product": "whatsapp",
            "to": to_wa_id,
            "type": "text",
            "text": {"preview_url": False, "body": body},
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=request_body,
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise ValueError(f"WhatsApp Cloud API recusou o envio: {error_body[:500]}") from exc
    except urllib.error.URLError as exc:
        raise ValueError(f"Falha de rede ao enviar WhatsApp: {exc.reason}") from exc
    message_id = scalar_text(((payload.get("messages") or [{}])[0] or {}).get("id"))
    return message_id, "sent"


def send_whatsapp_message(conn: sqlite3.Connection, payload: dict) -> dict:
    conversation_id = scalar_text(payload.get("conversation_id") or payload.get("id"))
    body = scalar_text(payload.get("body"))
    actor_user_id = scalar_text(payload.get("actor_user_id"))
    if not conversation_id:
        raise ValueError("conversation_id obrigatorio.")
    if not body:
        raise ValueError("Mensagem obrigatoria.")
    conversation = conn.execute("SELECT * FROM whatsapp_conversations WHERE id = ?", (conversation_id,)).fetchone()
    if not conversation:
        raise ValueError("Conversa WhatsApp nao encontrada.")
    owner = _agent_by_id(conn, conversation["organization_id"], actor_user_id) or _agent_by_id(
        conn,
        conversation["organization_id"],
        conversation["owner_user_id"],
    )
    error_text = ""
    try:
        wa_message_id, status = _send_cloud_api_message(conversation["contact_wa_id"], body)
    except ValueError as exc:
        wa_message_id = ""
        status = "erro"
        error_text = str(exc)
    sent_at = _now()
    _insert_message(
        conn,
        conversation["organization_id"],
        conversation_id,
        wa_message_id=wa_message_id,
        direction="outbound",
        message_type="text",
        body=body,
        status=status,
        sender_name=owner.get("name", "Empresa"),
        sent_at=sent_at,
        error_text=error_text,
    )
    conn.execute(
        """
        UPDATE whatsapp_conversations
        SET status = CASE WHEN status = 'novo' THEN 'em_atendimento' ELSE status END,
            owner_user_id = COALESCE(NULLIF(owner_user_id, ''), ?),
            owner_name = COALESCE(NULLIF(owner_name, ''), ?),
            department = COALESCE(NULLIF(department, ''), ?),
            last_message_at = ?,
            last_outbound_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (owner.get("id", actor_user_id), owner.get("name", ""), owner.get("department", ""), sent_at, sent_at, conversation_id),
    )
    if error_text:
        _record_event(conn, conversation["organization_id"], conversation_id, "send_error", error_text, owner.get("name", ""))
    conn.commit()
    detail = api_whatsapp_conversation_detail(conn, conversation_id)
    detail["ok"] = not error_text
    detail["send_status"] = status
    detail["error"] = error_text
    return detail
