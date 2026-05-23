from __future__ import annotations

import json
import sqlite3
from base64 import b64decode
from datetime import datetime
from hashlib import sha1
from uuid import uuid4

from app_config import (
    CONFIG_SCHEMA,
    active_tenant,
    asset_public_path,
    asset_storage_dir,
    app_public_config,
    default_company_name,
    default_country,
    default_organization_slug,
    default_store_name,
    is_default_database_path,
    local_config_path,
)
from auth import MIN_PASSWORD_LENGTH, _default_permissions, _find_login_any_org, _normalize_email, _normalize_login, _set_permissions, _user_payload, create_session, hash_password, has_users
from db_helpers import one, scalar_text
from text_utils import normalize


ONBOARDING_SETTING_KEY = "onboarding.state"


def _now() -> str:
    return datetime.now().replace(microsecond=0).isoformat()


def _setting(conn: sqlite3.Connection, key: str) -> dict:
    row = conn.execute("SELECT value_json FROM app_settings WHERE key = ?", (key,)).fetchone()
    if not row:
        return {}
    try:
        value = json.loads(row["value_json"] or "{}")
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def _save_setting(conn: sqlite3.Connection, key: str, value: dict) -> None:
    conn.execute(
        """
        INSERT INTO app_settings (key, value_json, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at = CURRENT_TIMESTAMP
        """,
        (key, json.dumps(value, ensure_ascii=False, sort_keys=True)),
    )


def _count(conn: sqlite3.Connection, table: str) -> int:
    return int(one(conn, f"SELECT COUNT(*) AS total FROM {table}").get("total") or 0)


def _first_organization(conn: sqlite3.Connection) -> dict:
    return one(
        conn,
        """
        SELECT id, name, document
        FROM organizations
        ORDER BY created_at, id
        LIMIT 1
        """,
    )


def _first_store(conn: sqlite3.Connection, organization_id: str) -> dict:
    return one(
        conn,
        """
        SELECT id, name, city, state
        FROM stores
        WHERE organization_id = ?
        ORDER BY id
        LIMIT 1
        """,
        (organization_id,),
    )


def _profile(conn: sqlite3.Connection, organization_id: str) -> dict:
    if not organization_id:
        return {}
    return one(
        conn,
        """
        SELECT trade_name, legal_name, document, phone, email, city, state, country, logo_path
        FROM organization_profiles
        WHERE organization_id = ?
        """,
        (organization_id,),
    )


def _onboarding_status(conn: sqlite3.Connection) -> dict:
    org = _first_organization(conn)
    organization_id = org.get("id") or ""
    profile = _profile(conn, organization_id)
    store = _first_store(conn, organization_id)
    setting = _setting(conn, ONBOARDING_SETTING_KEY)
    imported_rows = _count(conn, "import_batches")
    products = _count(conn, "products")
    steps = [
        {"key": "operation", "label": "Boas-vindas", "done": bool(store)},
        {"key": "company", "label": "Empresa", "done": bool(organization_id and (profile or org))},
        {"key": "admin", "label": "Acesso", "done": has_users(conn)},
        {"key": "branding", "label": "Documentos", "done": bool(app_public_config().get("app_name"))},
        {"key": "data", "label": "Dados", "done": bool(imported_rows or products), "optional": True},
    ]
    completed = bool(setting.get("completed_at")) or all(step["done"] or step.get("optional") for step in steps)
    return {
        "contract": "onboarding.v1",
        "required": not completed,
        "completed": completed,
        "completed_at": setting.get("completed_at") or "",
        "current_step": setting.get("current_step") or next((step["key"] for step in steps if not step["done"] and not step.get("optional")), "data"),
        "steps": steps,
        "password_min_length": MIN_PASSWORD_LENGTH,
        "organization": org,
        "profile": profile,
        "store": store,
        "operation": setting.get("operation") or {},
        "data": {"import_batches": imported_rows, "products": products},
        "public_config": app_public_config(),
    }


def api_onboarding(conn: sqlite3.Connection) -> dict:
    return _onboarding_status(conn)


def _clean_slug(value: object, fallback: str) -> str:
    raw = scalar_text(value)
    slug = normalize(raw).replace(" ", "_")
    return slug or fallback


def _clean_company(payload: dict) -> dict:
    company = payload.get("company") if isinstance(payload.get("company"), dict) else {}
    trade_name = scalar_text(company.get("trade_name"))[:160]
    legal_name = scalar_text(company.get("legal_name"))[:200]
    name = trade_name or legal_name or default_company_name()
    organization_id = _clean_slug(company.get("organization_id"), "")
    if not organization_id or organization_id == default_organization_slug():
        organization_id = _clean_slug(name, default_organization_slug())
    return {
        "organization_id": organization_id,
        "trade_name": trade_name or name,
        "legal_name": legal_name,
        "document": scalar_text(company.get("document"))[:40],
        "phone": scalar_text(company.get("phone"))[:60],
        "email": scalar_text(company.get("email"))[:160],
        "website": scalar_text(company.get("website"))[:180],
        "city": scalar_text(company.get("city"))[:120],
        "state": scalar_text(company.get("state"))[:40],
        "country": scalar_text(company.get("country"))[:80] or default_country(),
    }


def _clean_branding(payload: dict) -> dict:
    branding = payload.get("branding") if isinstance(payload.get("branding"), dict) else {}
    current = app_public_config()
    return {
        "app_name": scalar_text(branding.get("app_name"))[:80] or current["app_name"],
        "app_subtitle": scalar_text(branding.get("app_subtitle"))[:120] or current["app_subtitle"],
        "logo_path": scalar_text(branding.get("logo_path"))[:220] or current["logo_path"],
        "logo_upload": branding.get("logo_upload") if isinstance(branding.get("logo_upload"), dict) else {},
    }


def _save_uploaded_logo(conn: sqlite3.Connection, branding: dict) -> dict:
    upload = branding.pop("logo_upload", {}) or {}
    if not upload or not _using_default_database(conn):
        return branding
    data_url = scalar_text(upload.get("data_url"))
    mime_type = scalar_text(upload.get("mime_type")).lower()
    if not data_url:
        return branding
    header, sep, encoded = data_url.partition(",")
    if not sep or ";base64" not in header:
        raise ValueError("Logo inválida. Envie uma imagem PNG, JPG, WEBP ou SVG.")
    mime_type = mime_type or header.replace("data:", "").split(";")[0].lower()
    extensions = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
    }
    extension = extensions.get(mime_type)
    if not extension:
        raise ValueError("Formato de logo não suportado. Use PNG, JPG, WEBP ou SVG.")
    try:
        content = b64decode(encoded, validate=True)
    except ValueError as exc:
        raise ValueError("Logo inválida. Não foi possível ler o arquivo.") from exc
    if not content or len(content) > 2_000_000:
        raise ValueError("A logo precisa ter até 2 MB.")
    digest = sha1(content).hexdigest()[:12]
    file_name = f"logo_{digest}{extension}"
    folder = asset_storage_dir()
    folder.mkdir(parents=True, exist_ok=True)
    (folder / file_name).write_bytes(content)
    branding["logo_path"] = asset_public_path(file_name)
    return branding


def _clean_operation(payload: dict) -> dict:
    operation = payload.get("operation") if isinstance(payload.get("operation"), dict) else {}
    def clean_int(key: str) -> int:
        raw = scalar_text(operation.get(key)).replace(".", "").replace(",", "")
        return int(raw) if raw.isdigit() else 0

    def clean_bool(key: str, default: bool = False) -> bool:
        value = operation.get(key, default)
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "sim", "yes", "on"}
        return bool(value)

    return {
        "store_name": scalar_text(operation.get("store_name"))[:120] or default_store_name(),
        "segment": scalar_text(operation.get("segment"))[:120],
        "store_count": clean_int("store_count"),
        "sku_count": clean_int("sku_count"),
        "supplier_count": clean_int("supplier_count"),
        "sells_products": clean_bool("sells_products", True),
        "sells_services": clean_bool("sells_services", False),
        "sells_online": clean_bool("sells_online", False),
        "has_delivery": clean_bool("has_delivery", False),
        "tracks_inventory_by_store": clean_bool("tracks_inventory_by_store", True),
        "uses_customer_history": clean_bool("uses_customer_history", True),
        "purchase_cycle": scalar_text(operation.get("purchase_cycle"))[:40] or "weekly",
        "replenishment_style": scalar_text(operation.get("replenishment_style"))[:40] or "mixed",
        "minimum_order_policy": scalar_text(operation.get("minimum_order_policy"))[:40] or "by_supplier",
        "pricing_strategy": scalar_text(operation.get("pricing_strategy"))[:40] or "margin",
        "data_priority": scalar_text(operation.get("data_priority"))[:80] or "produtos_estoque",
        "source_system": scalar_text(operation.get("source_system"))[:120] or "ready_files",
        "next_after_onboarding": scalar_text(operation.get("next_after_onboarding"))[:40] or "imports",
    }


def _clean_admin(payload: dict) -> dict:
    admin = payload.get("admin") if isinstance(payload.get("admin"), dict) else {}
    name = scalar_text(admin.get("name"))[:120] or "Administrador"
    login_name = _normalize_login(admin.get("login_name") or admin.get("login") or admin.get("email") or name)
    return {
        "name": name,
        "login_name": login_name,
        "email": _normalize_email(admin.get("email"))[:160],
        "password": str(admin.get("password") or ""),
    }


def _using_default_database(conn: sqlite3.Connection) -> bool:
    if active_tenant():
        return True
    row = conn.execute("PRAGMA database_list").fetchone()
    if not row:
        return False
    db_file = row["file"] if isinstance(row, sqlite3.Row) else row[2]
    if not db_file:
        return False
    return is_default_database_path(db_file)


def _write_local_branding_config(conn: sqlite3.Connection, branding: dict, company: dict, operation: dict) -> None:
    if not _using_default_database(conn):
        return
    payload = {
        "schema": CONFIG_SCHEMA,
        "public": {
            "app_name": branding["app_name"],
            "app_subtitle": branding["app_subtitle"],
            "logo_path": branding["logo_path"],
        },
        "defaults": {
            "organization_id": company["organization_id"],
            "company_name": company["trade_name"] or company["legal_name"] or default_company_name(),
            "imported_company_name": company["trade_name"] or company["legal_name"] or default_company_name(),
            "store_name": operation["store_name"],
            "country": company["country"],
        },
    }
    path = local_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _upsert_company(conn: sqlite3.Connection, company: dict, branding: dict) -> None:
    organization_name = company["trade_name"] or company["legal_name"] or default_company_name()
    conn.execute(
        """
        INSERT INTO organizations (id, name, document)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            document = excluded.document
        """,
        (company["organization_id"], organization_name, company["document"]),
    )
    conn.execute(
        """
        INSERT INTO organization_profiles
            (organization_id, trade_name, legal_name, document, phone, email, website,
             city, state, country, logo_path, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(organization_id) DO UPDATE SET
            trade_name = excluded.trade_name,
            legal_name = excluded.legal_name,
            document = excluded.document,
            phone = excluded.phone,
            email = excluded.email,
            website = excluded.website,
            city = excluded.city,
            state = excluded.state,
            country = excluded.country,
            logo_path = excluded.logo_path,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            company["organization_id"],
            company["trade_name"],
            company["legal_name"],
            company["document"],
            company["phone"],
            company["email"],
            company["website"],
            company["city"],
            company["state"],
            company["country"],
            branding["logo_path"],
        ),
    )


def _upsert_store(conn: sqlite3.Connection, organization_id: str, operation: dict) -> str:
    store_name = operation["store_name"]
    store_id = f"{organization_id}:store:principal"
    existing = conn.execute(
        "SELECT id FROM stores WHERE id = ? OR (organization_id = ? AND name = ?) LIMIT 1",
        (store_id, organization_id, store_name),
    ).fetchone()
    if existing:
        store_id = existing["id"]
        conn.execute("UPDATE stores SET name = ?, active = 1 WHERE id = ?", (store_name, store_id))
    else:
        conn.execute(
            "INSERT INTO stores (id, organization_id, name) VALUES (?, ?, ?)",
            (store_id, organization_id, store_name),
        )
    return store_id


def _create_admin_if_needed(conn: sqlite3.Connection, organization_id: str, admin: dict, handler: object | None) -> tuple[dict | None, str]:
    if has_users(conn):
        return None, ""
    if not admin["login_name"]:
        raise ValueError("Informe um login para o administrador.")
    if _find_login_any_org(conn, admin["login_name"]):
        raise ValueError("Esse login já existe.")
    if len(admin["password"]) < MIN_PASSWORD_LENGTH:
        raise ValueError("A senha do administrador precisa ter pelo menos 6 caracteres.")
    user_id = f"{organization_id}:user:{uuid4().hex[:12]}"
    conn.execute(
        """
        INSERT INTO app_users (id, organization_id, name, login_name, email, password_hash, role, active)
        VALUES (?, ?, ?, ?, ?, ?, 'admin', 1)
        """,
        (user_id, organization_id, admin["name"], admin["login_name"], admin["email"], hash_password(admin["password"])),
    )
    _set_permissions(conn, user_id, _default_permissions("admin"))
    token = create_session(conn, user_id, handler)
    user = _user_payload(conn, conn.execute("SELECT * FROM app_users WHERE id = ?", (user_id,)).fetchone())
    return user, token


def complete_onboarding(conn: sqlite3.Connection, payload: dict, current_user: dict | None = None, handler: object | None = None) -> tuple[dict, str]:
    current_user = current_user or {}
    if has_users(conn) and current_user.get("role") != "admin":
        raise PermissionError("Apenas administradores podem alterar a configuração inicial.")
    company = _clean_company(payload)
    branding = _clean_branding(payload)
    operation = _clean_operation(payload)
    admin = _clean_admin(payload)
    branding = _save_uploaded_logo(conn, branding)
    if not operation["store_name"] or operation["store_name"] == default_store_name():
        operation["store_name"] = company["trade_name"] or company["legal_name"] or default_store_name()
    _upsert_company(conn, company, branding)
    _upsert_store(conn, company["organization_id"], operation)
    user, token = _create_admin_if_needed(conn, company["organization_id"], admin, handler)
    _write_local_branding_config(conn, branding, company, operation)
    state = {
        "completed_at": _now(),
        "current_step": "done",
        "company": {"organization_id": company["organization_id"], "name": company["trade_name"]},
        "branding": branding,
        "operation": operation,
    }
    _save_setting(conn, ONBOARDING_SETTING_KEY, state)
    conn.execute(
        """
        INSERT INTO audit_log (organization_id, actor_user_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, ?, 'onboarding_completed', 'organization', ?, '{}', ?)
        """,
        (
            company["organization_id"],
            (user or current_user or {}).get("id", ""),
            company["organization_id"],
            json.dumps(state, ensure_ascii=False, sort_keys=True),
        ),
    )
    conn.commit()
    response = _onboarding_status(conn)
    response.update({"ok": True, "user": user, "public_config": app_public_config()})
    return response, token
