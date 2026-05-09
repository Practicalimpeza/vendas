from __future__ import annotations

import json
import sqlite3

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

DEFAULT_LOGO_PATH = "/logo-practica-transparent.png"


def _clean_profile_payload(payload: dict) -> dict:
    cleaned = {}
    for field in PROFILE_FIELDS:
        value = scalar_text(payload.get(field))
        cleaned[field] = value[: MAX_LENGTHS[field]]
    if not cleaned["country"]:
        cleaned["country"] = "Brasil"
    if not cleaned["logo_path"]:
        cleaned["logo_path"] = DEFAULT_LOGO_PATH
    return cleaned


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
            "logo_path": DEFAULT_LOGO_PATH,
            "country": "Brasil",
        }
    return {
        "organization_id": org["id"],
        "organization_name": org["name"] or "",
        "trade_name": org["name"] or "",
        "legal_name": org["name"] or "",
        "document": org["document"] or "",
        "logo_path": DEFAULT_LOGO_PATH,
        "country": "Brasil",
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
        organization_id = "org_teste"
    cleaned = _clean_profile_payload(payload)
    before = api_company_profile(conn, organization_id) if default_organization_id(conn) else {}
    organization_name = cleaned["trade_name"] or cleaned["legal_name"] or "Empresa teste"
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
