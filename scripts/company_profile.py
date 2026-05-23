from __future__ import annotations

from base64 import b64decode
from hashlib import sha1
import json
import sqlite3

from app_config import (
    asset_public_path,
    asset_storage_dir,
    default_company_name,
    default_country,
    default_logo_path,
    default_organization_slug,
    update_public_logo_path,
)
from db_helpers import default_organization_id, scalar_text


PROFILE_FIELDS = [
    "trade_name",
    "legal_name",
    "document",
    "state_registration",
    "municipal_registration",
    "contact_name",
    "phone",
    "email",
    "website",
    "address_line",
    "address_number",
    "address_complement",
    "district",
    "city",
    "state",
    "postal_code",
    "country",
    "logo_path",
    "document_footer",
    "default_payment_terms",
    "notes",
]

MAX_LENGTHS = {
    "trade_name": 160,
    "legal_name": 200,
    "document": 40,
    "state_registration": 40,
    "municipal_registration": 40,
    "contact_name": 120,
    "phone": 60,
    "email": 160,
    "website": 180,
    "address_line": 200,
    "address_number": 40,
    "address_complement": 120,
    "district": 120,
    "city": 120,
    "state": 40,
    "postal_code": 30,
    "country": 80,
    "logo_path": 220,
    "document_footer": 500,
    "default_payment_terms": 300,
    "notes": 700,
}

MAX_LOGO_UPLOAD_BYTES = 2_000_000


def _clean_profile_payload(payload: dict) -> dict:
    cleaned = {}
    for field in PROFILE_FIELDS:
        value = scalar_text(payload.get(field))
        cleaned[field] = value[: MAX_LENGTHS[field]]
    if not cleaned["country"]:
        cleaned["country"] = default_country()
    return cleaned


def _save_uploaded_logo(payload: dict, cleaned: dict) -> bool:
    upload = payload.get("logo_upload")
    if not isinstance(upload, dict):
        return False
    data_url = scalar_text(upload.get("data_url"))
    if not data_url:
        return False
    if "," not in data_url:
        raise ValueError("Logo inválida. Envie uma imagem PNG, JPG, WEBP ou SVG.")
    header, encoded = data_url.split(",", 1)
    mime_type = scalar_text(upload.get("mime_type")).lower()
    if not mime_type and header.startswith("data:"):
        mime_type = header.split(";", 1)[0].replace("data:", "").strip().lower()
    extensions = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
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
    if not content or len(content) > MAX_LOGO_UPLOAD_BYTES:
        raise ValueError("A logo precisa ter até 2 MB.")
    digest = sha1(content).hexdigest()[:12]
    file_name = f"company_logo_{digest}{extension}"
    folder = asset_storage_dir()
    folder.mkdir(parents=True, exist_ok=True)
    (folder / file_name).write_bytes(content)
    cleaned["logo_path"] = asset_public_path(file_name)
    return True


def _default_profile(conn: sqlite3.Connection, organization_id: str = "") -> dict:
    organization_id = organization_id or default_organization_id(conn)
    org = conn.execute(
        "SELECT id, name, document FROM organizations WHERE id = ?",
        (organization_id,),
    ).fetchone()
    if not org:
        return {
            "organization_id": organization_id,
            "organization_name": "",
            "trade_name": "",
            "legal_name": "",
            "document": "",
            "logo_path": default_logo_path(),
            "country": default_country(),
        }
    return {
        "organization_id": org["id"],
        "organization_name": org["name"] or "",
        "trade_name": org["name"] or "",
        "legal_name": org["name"] or "",
        "document": org["document"] or "",
        "logo_path": default_logo_path(),
        "country": default_country(),
    }


def api_company_profile(conn: sqlite3.Connection, organization_id: str = "") -> dict:
    organization_id = organization_id or default_organization_id(conn)
    profile = _default_profile(conn, organization_id)
    row = conn.execute(
        """
        SELECT *
        FROM organization_profiles
        WHERE organization_id = ?
        """,
        (organization_id,),
    ).fetchone()
    if row:
        profile.update({field: row[field] or "" for field in PROFILE_FIELDS})
        profile["updated_at"] = row["updated_at"]
    return profile


def update_company_profile(conn: sqlite3.Connection, payload: dict) -> dict:
    organization_id = scalar_text(payload.get("organization_id")) or default_organization_id(conn)
    if not organization_id:
        organization_id = default_organization_slug()
    cleaned = _clean_profile_payload(payload)
    logo_uploaded = _save_uploaded_logo(payload, cleaned)
    if logo_uploaded:
        update_public_logo_path(cleaned["logo_path"])
    before = api_company_profile(conn, organization_id) if default_organization_id(conn) else {}
    organization_name = cleaned["trade_name"] or cleaned["legal_name"] or default_company_name()
    conn.execute(
        """
        INSERT INTO organizations (id, name, document)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            document = excluded.document
        """,
        (organization_id, organization_name, cleaned["document"]),
    )
    conn.execute(
        """
        INSERT INTO organization_profiles
            (organization_id, trade_name, legal_name, document, state_registration,
             municipal_registration, contact_name, phone, email, website,
             address_line, address_number, address_complement, district, city, state,
             postal_code, country, logo_path, document_footer, default_payment_terms,
             notes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(organization_id) DO UPDATE SET
            trade_name = excluded.trade_name,
            legal_name = excluded.legal_name,
            document = excluded.document,
            state_registration = excluded.state_registration,
            municipal_registration = excluded.municipal_registration,
            contact_name = excluded.contact_name,
            phone = excluded.phone,
            email = excluded.email,
            website = excluded.website,
            address_line = excluded.address_line,
            address_number = excluded.address_number,
            address_complement = excluded.address_complement,
            district = excluded.district,
            city = excluded.city,
            state = excluded.state,
            postal_code = excluded.postal_code,
            country = excluded.country,
            logo_path = excluded.logo_path,
            document_footer = excluded.document_footer,
            default_payment_terms = excluded.default_payment_terms,
            notes = excluded.notes,
            updated_at = CURRENT_TIMESTAMP
        """,
        (organization_id, *[cleaned[field] for field in PROFILE_FIELDS]),
    )
    conn.execute(
        """
        INSERT INTO audit_log
            (organization_id, action, target_type, target_id, before_json, after_json)
        VALUES (?, 'company_profile_update', 'organization', ?, ?, ?)
        """,
        (
            organization_id,
            organization_id,
            json.dumps(before, ensure_ascii=False),
            json.dumps(cleaned, ensure_ascii=False),
        ),
    )
    conn.commit()
    return {"ok": True, **api_company_profile(conn, organization_id)}
