"""Importacao generica de vinculos entre entidades.

Cada tipo de vinculo declara:
- entidade origem (como achar no banco, se cria quando nao existe)
- entidade destino (idem)
- como persistir o vinculo (UPDATE em coluna ou UPSERT em tabela de regra)

Para adicionar um vinculo novo basta acrescentar uma entrada em LINK_TYPES.
"""

from __future__ import annotations

import sqlite3

from app_config import default_organization_slug
from db_helpers import default_organization_id, parse_decimal, scalar_text
from erp_import_flow import parse_erp_file_bytes, upsert_imported_supplier
from text_utils import clean_phone, make_supplier_id, normalize


# ---------------------------------------------------------------- entidades


def _norm_text(value) -> str:
    return str(value or "").strip()


def _lookup_brand(conn: sqlite3.Connection, org: str, name: str) -> dict | None:
    norm = normalize(name)
    if not norm:
        return None
    row = conn.execute(
        "SELECT id, name FROM brands WHERE organization_id = ? AND normalized_name = ? LIMIT 1",
        (org, norm),
    ).fetchone()
    return dict(row) if row else None


def _create_brand(conn: sqlite3.Connection, org: str, name: str) -> dict:
    brand_id_value = f"{org}:brand:{normalize(name) or 'sem_marca'}"
    conn.execute(
        """
        INSERT INTO brands (id, organization_id, name, normalized_name, source_kind, source_system)
        VALUES (?, ?, ?, ?, 'imported', 'link_import')
        ON CONFLICT(organization_id, normalized_name) DO UPDATE SET
            name = excluded.name
        """,
        (brand_id_value, org, name, normalize(name)),
    )
    return {"id": brand_id_value, "name": name}


def _lookup_supplier(conn: sqlite3.Connection, org: str, name: str) -> dict | None:
    sid = make_supplier_id(org, name)
    row = conn.execute(
        "SELECT id, name FROM suppliers WHERE id = ? LIMIT 1",
        (sid,),
    ).fetchone()
    return dict(row) if row else None


def _create_supplier(conn: sqlite3.Connection, org: str, name: str) -> dict:
    sid = upsert_imported_supplier(conn, org=org, name=name)
    return {"id": sid, "name": name}


def _read_supplier_profile(conn: sqlite3.Connection, org: str, name: str) -> dict | None:
    norm = normalize(name)
    if not norm:
        return None
    row = conn.execute(
        """
        SELECT id, name, contact_name, contact_phone, contact_email, minimum_order_value
        FROM suppliers
        WHERE organization_id = ? AND normalized_name = ?
        LIMIT 1
        """,
        (org, norm),
    ).fetchone()
    return dict(row) if row else None


def _lookup_product(conn: sqlite3.Connection, org: str, key: str) -> dict | None:
    text = _norm_text(key)
    if not text:
        return None
    row = conn.execute(
        "SELECT id, name FROM products WHERE organization_id = ? AND source_code = ? LIMIT 1",
        (org, text.lstrip("0") or text),
    ).fetchone()
    if row:
        return dict(row)
    row = conn.execute(
        "SELECT id, name FROM products WHERE organization_id = ? AND source_code = ? LIMIT 1",
        (org, text),
    ).fetchone()
    if row:
        return dict(row)
    norm = normalize(text)
    row = conn.execute(
        "SELECT id, name FROM products WHERE organization_id = ? AND normalized_name = ? LIMIT 1",
        (org, norm),
    ).fetchone()
    return dict(row) if row else None


# --------------------------------------------------------- aplicadores de vinculo


def _apply_brand_supplier(conn: sqlite3.Connection, org: str, source: dict, target: dict) -> None:
    conn.execute(
        """
        INSERT INTO brand_supplier_rules (organization_id, brand_id, supplier_id, active, notes)
        VALUES (?, ?, ?, 1, 'Vinculo importado de planilha de relacionamento.')
        ON CONFLICT(organization_id, brand_id) DO UPDATE SET
            supplier_id = excluded.supplier_id,
            active = 1,
            notes = excluded.notes,
            updated_at = CURRENT_TIMESTAMP
        """,
        (org, source["id"], target["id"]),
    )


def _read_brand_supplier(conn: sqlite3.Connection, org: str, source: dict) -> dict | None:
    row = conn.execute(
        """
        SELECT bsr.supplier_id AS target_id, s.name AS target_name
        FROM brand_supplier_rules bsr
        LEFT JOIN suppliers s ON s.id = bsr.supplier_id
        WHERE bsr.organization_id = ? AND bsr.brand_id = ? AND bsr.active = 1
        LIMIT 1
        """,
        (org, source["id"]),
    ).fetchone()
    return dict(row) if row else None


def _apply_product_brand(conn: sqlite3.Connection, org: str, source: dict, target: dict) -> None:
    conn.execute(
        "UPDATE products SET brand_id = ? WHERE id = ?",
        (target["id"], source["id"]),
    )


def _read_product_brand(conn: sqlite3.Connection, org: str, source: dict) -> dict | None:
    row = conn.execute(
        """
        SELECT b.id AS target_id, b.name AS target_name
        FROM products p
        LEFT JOIN brands b ON b.id = p.brand_id
        WHERE p.id = ? AND p.brand_id IS NOT NULL
        LIMIT 1
        """,
        (source["id"],),
    ).fetchone()
    return dict(row) if row else None


def _apply_product_preferred_supplier(conn: sqlite3.Connection, org: str, source: dict, target: dict) -> None:
    conn.execute(
        """
        INSERT INTO product_settings (organization_id, product_id, preferred_supplier_id)
        VALUES (?, ?, ?)
        ON CONFLICT(organization_id, product_id) DO UPDATE SET
            preferred_supplier_id = excluded.preferred_supplier_id
        """,
        (org, source["id"], target["id"]),
    )


def _read_product_preferred_supplier(conn: sqlite3.Connection, org: str, source: dict) -> dict | None:
    row = conn.execute(
        """
        SELECT s.id AS target_id, s.name AS target_name
        FROM product_settings ps
        LEFT JOIN suppliers s ON s.id = ps.preferred_supplier_id
        WHERE ps.organization_id = ? AND ps.product_id = ? AND ps.preferred_supplier_id IS NOT NULL
        LIMIT 1
        """,
        (org, source["id"]),
    ).fetchone()
    return dict(row) if row else None


# ------------------------------------------------------------ catalogo de tipos


LINK_TYPES = {
    "marca_fornecedor": {
        "label": "Marca -> Fornecedor",
        "description": "Define qual fornecedor padrao atende cada marca.",
        "source": {
            "label": "Marca",
            "keywords": ["marca", "marcas", "fabricante", "brand"],
            "lookup": _lookup_brand,
            "create": _create_brand,
            "create_label": "marca",
        },
        "target": {
            "label": "Fornecedor",
            "keywords": ["fornecedor", "fornecedores", "distribuidor", "supplier", "vendor"],
            "lookup": _lookup_supplier,
            "create": _create_supplier,
            "create_label": "fornecedor",
        },
        "apply": _apply_brand_supplier,
        "read_existing": _read_brand_supplier,
    },
    "produto_marca": {
        "label": "Produto -> Marca",
        "description": "Reclassifica produtos para a marca informada.",
        "source": {
            "label": "Produto (codigo ou nome)",
            "keywords": ["produto", "codigo", "sku", "item", "referencia"],
            "lookup": _lookup_product,
            "create": None,
            "create_label": "produto",
        },
        "target": {
            "label": "Marca",
            "keywords": ["marca", "marcas", "fabricante", "brand"],
            "lookup": _lookup_brand,
            "create": _create_brand,
            "create_label": "marca",
        },
        "apply": _apply_product_brand,
        "read_existing": _read_product_brand,
    },
    "produto_fornecedor_preferencial": {
        "label": "Produto -> Fornecedor preferencial",
        "description": "Define o fornecedor preferencial em product_settings.",
        "source": {
            "label": "Produto (codigo ou nome)",
            "keywords": ["produto", "codigo", "sku", "item", "referencia"],
            "lookup": _lookup_product,
            "create": None,
            "create_label": "produto",
        },
        "target": {
            "label": "Fornecedor",
            "keywords": ["fornecedor", "fornecedores", "distribuidor", "supplier", "vendor"],
            "lookup": _lookup_supplier,
            "create": _create_supplier,
            "create_label": "fornecedor",
        },
        "apply": _apply_product_preferred_supplier,
        "read_existing": _read_product_preferred_supplier,
    },
    "fornecedor_dados_comerciais": {
        "mode": "supplier_profile",
        "label": "Fornecedor -> Dados comerciais",
        "description": "Atualiza pedido minimo e contato do fornecedor a partir de uma planilha.",
        "columns": [
            {
                "id": "supplier",
                "label": "Fornecedor",
                "required": True,
                "keywords": ["fornecedor", "fornecedores", "supplier", "vendor", "distribuidor"],
            },
            {
                "id": "minimum_order_value",
                "label": "Pedido minimo",
                "required": False,
                "keywords": [
                    "pedido minimo",
                    "pedido_minimo",
                    "valor minimo",
                    "minimo pedido",
                    "minimo",
                    "minimum_order",
                    "minimum_order_value",
                ],
            },
            {
                "id": "contact",
                "label": "Contato geral",
                "required": False,
                "keywords": ["contato", "contact"],
            },
            {
                "id": "contact_name",
                "label": "Nome do contato",
                "required": False,
                "keywords": ["nome contato", "contato nome", "responsavel", "vendedor", "contact_name"],
            },
            {
                "id": "contact_phone",
                "label": "Telefone/WhatsApp",
                "required": False,
                "keywords": ["telefone", "fone", "celular", "whatsapp", "phone", "contact_phone"],
            },
            {
                "id": "contact_email",
                "label": "E-mail",
                "required": False,
                "keywords": ["email", "e-mail", "mail", "contact_email"],
            },
        ],
    },
}


# --------------------------------------------------------------- helpers parsing


def _payload_to_bytes(payload: dict) -> tuple[str, bytes]:
    file_name = scalar_text(payload.get("file_name")) or "planilha"
    raw = payload.get("_file_bytes")
    if isinstance(raw, bytes):
        return file_name, raw
    raise ValueError("Envie a planilha pelo formulario para que o sistema possa lela.")


def _first_sheet_data(sheets: list[dict]) -> tuple[list[str], list[list[str]]]:
    if not sheets:
        return [], []
    rows = list(sheets[0].get("rows") or [])
    if not rows:
        return [], []
    headers = [_norm_text(cell) for cell in rows[0]]
    data_rows = [list(row) for row in rows[1:] if any(_norm_text(cell) for cell in row)]
    return headers, data_rows


def _suggest_column(headers: list[str], keywords: list[str], used: set[int]) -> int:
    normalized_keywords = [normalize(keyword) for keyword in keywords]
    for index, header in enumerate(headers):
        if index in used:
            continue
        norm_header = normalize(header)
        if not norm_header:
            continue
        parts = set(norm_header.split("_"))
        if any(keyword in parts or keyword == norm_header for keyword in normalized_keywords):
            return index
    return -1


def _suggest_columns(spec: dict, headers: list[str]) -> dict:
    if spec.get("mode") == "supplier_profile":
        used: set[int] = set()
        fields: dict[str, int] = {}
        for field in spec["columns"]:
            index = _suggest_column(headers, field["keywords"], used)
            fields[field["id"]] = index
            if index >= 0:
                used.add(index)
        return {"fields": fields}
    used: set[int] = set()
    src = _suggest_column(headers, spec["source"]["keywords"], used)
    if src >= 0:
        used.add(src)
    tgt = _suggest_column(headers, spec["target"]["keywords"], used)
    return {"source_index": src, "target_index": tgt}


def _suggestion_score(spec: dict, suggestion: dict) -> int:
    if spec.get("mode") == "supplier_profile":
        fields = suggestion.get("fields") or {}
        required_ok = all(fields.get(field["id"], -1) >= 0 for field in spec["columns"] if field.get("required"))
        if not required_ok:
            return 0
        data_count = sum(1 for field in PROFILE_DATA_COLUMNS if fields.get(field, -1) >= 0)
        if data_count <= 0:
            return 0
        return 10 + data_count
    if suggestion.get("source_index", -1) >= 0 and suggestion.get("target_index", -1) >= 0:
        return 5
    return 0


# -------------------------------------------------------------- diff & commit


def _resolve(spec_role: dict, conn: sqlite3.Connection, org: str, value: str) -> tuple[dict | None, bool]:
    """Returns (entity, was_already_existing)."""
    found = spec_role["lookup"](conn, org, value)
    if found:
        return found, True
    return None, False


def _build_diff(spec: dict, conn: sqlite3.Connection, org: str, pairs: list[dict]) -> dict:
    new_source: list[str] = []
    new_source_seen: set[str] = set()
    new_target: list[str] = []
    new_target_seen: set[str] = set()
    new_links: list[dict] = []
    overrides: list[dict] = []
    unresolved_source: list[dict] = []
    unchanged = 0
    for pair in pairs:
        src_value = pair["source"]
        tgt_value = pair["target"]
        source_entity, source_existed = _resolve(spec["source"], conn, org, src_value)
        target_entity, target_existed = _resolve(spec["target"], conn, org, tgt_value)
        if not source_entity:
            if spec["source"]["create"] is None:
                unresolved_source.append({"line": pair.get("line"), "value": src_value})
                continue
            key = normalize(src_value)
            if key not in new_source_seen:
                new_source_seen.add(key)
                new_source.append(src_value)
        if not target_entity:
            if spec["target"]["create"] is None:
                unresolved_source.append({"line": pair.get("line"), "value": tgt_value})
                continue
            key = normalize(tgt_value)
            if key not in new_target_seen:
                new_target_seen.add(key)
                new_target.append(tgt_value)
        if not source_entity:
            new_links.append({"source": src_value, "target": tgt_value})
            continue
        existing = spec["read_existing"](conn, org, source_entity)
        target_id_for_compare = target_entity["id"] if target_entity else (
            make_supplier_id(org, tgt_value) if spec["target"]["create_label"] == "fornecedor" else f"{org}:brand:{normalize(tgt_value) or 'sem_marca'}"
        )
        if existing and existing.get("target_id") == target_id_for_compare:
            unchanged += 1
        elif existing:
            overrides.append({
                "source": source_entity["name"],
                "from": existing.get("target_name") or existing.get("target_id") or "?",
                "to": tgt_value,
            })
        else:
            new_links.append({"source": source_entity["name"], "target": tgt_value})
    return {
        "pairs_total": len(pairs),
        "new_source": new_source,
        "new_target": new_target,
        "new_links": new_links,
        "overrides": overrides,
        "unresolved": unresolved_source,
        "unchanged": unchanged,
    }


def _build_pairs(rows: list[list[str]], source_index: int, target_index: int) -> list[dict]:
    pairs: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for line, raw_row in enumerate(rows, start=2):
        src = _norm_text(raw_row[source_index] if source_index < len(raw_row) else "")
        tgt = _norm_text(raw_row[target_index] if target_index < len(raw_row) else "")
        if not src or not tgt:
            continue
        key = (normalize(src), normalize(tgt))
        if key in seen:
            continue
        seen.add(key)
        pairs.append({"line": line, "source": src, "target": tgt})
    return pairs


def _commit_pairs(spec: dict, conn: sqlite3.Connection, org: str, pairs: list[dict]) -> dict:
    created_source = 0
    created_target = 0
    upserted = 0
    skipped_source = 0
    for pair in pairs:
        src_value = pair["source"]
        tgt_value = pair["target"]
        source_entity = spec["source"]["lookup"](conn, org, src_value)
        if not source_entity:
            if spec["source"]["create"] is None:
                skipped_source += 1
                continue
            source_entity = spec["source"]["create"](conn, org, src_value)
            created_source += 1
        target_entity = spec["target"]["lookup"](conn, org, tgt_value)
        if not target_entity:
            if spec["target"]["create"] is None:
                skipped_source += 1
                continue
            target_entity = spec["target"]["create"](conn, org, tgt_value)
            created_target += 1
        spec["apply"](conn, org, source_entity, target_entity)
        upserted += 1
    conn.commit()
    return {
        "created_source": created_source,
        "created_target": created_target,
        "upserted": upserted,
        "skipped_unresolved": skipped_source,
    }


PROFILE_FIELD_LABELS = {
    "minimum_order_value": "Pedido minimo",
    "contact_name": "Nome do contato",
    "contact_phone": "Telefone/WhatsApp",
    "contact_email": "E-mail",
}

PROFILE_DATA_COLUMNS = {"minimum_order_value", "contact", "contact_name", "contact_phone", "contact_email"}


def _profile_cell(row: list[str], index: int) -> str:
    if index < 0 or index >= len(row):
        return ""
    return _norm_text(row[index])


def _display_profile_value(field: str, value: object) -> str:
    if field == "minimum_order_value":
        formatted = f"{float(value or 0):,.2f}"
        return formatted.replace(",", "#").replace(".", ",").replace("#", ".")
    return _norm_text(value)


def _classify_contact(value: str) -> dict:
    text = _norm_text(value)
    if not text:
        return {}
    if "@" in text:
        return {"contact_email": text[:160]}
    digits = "".join(char for char in text if char.isdigit())
    if len(digits) >= 7:
        return {"contact_phone": clean_phone(text)}
    return {"contact_name": text[:120]}


def _resolve_profile_indexes(payload: dict, headers: list[str], spec: dict) -> dict[str, int]:
    suggestion = (_suggest_columns(spec, headers).get("fields") or {})
    indexes: dict[str, int] = {}
    used: dict[int, str] = {}
    for field in spec["columns"]:
        field_id = field["id"]
        payload_key = f"column_{field_id}"
        provided = payload_key in payload
        raw = scalar_text(payload.get(payload_key))
        try:
            index = int(raw) if raw not in ("", None) else -1
        except ValueError:
            index = -1
        if index < 0 and not provided:
            index = suggestion.get(field_id, -1)
        if index >= len(headers):
            index = -1
        if field.get("required") and index < 0:
            raise ValueError(f"Indique a coluna de {field['label']}.")
        if index >= 0:
            if index in used:
                raise ValueError(
                    f"A coluna {headers[index] or index + 1} foi selecionada para mais de um campo."
                )
            used[index] = field_id
        indexes[field_id] = index
    if not any(indexes.get(field, -1) >= 0 for field in PROFILE_DATA_COLUMNS):
        raise ValueError("Indique pelo menos uma coluna de pedido minimo ou contato para atualizar.")
    return indexes


def _build_supplier_profile_records(rows: list[list[str]], indexes: dict[str, int]) -> list[dict]:
    records: list[dict] = []
    for line, raw_row in enumerate(rows, start=2):
        supplier = _profile_cell(raw_row, indexes.get("supplier", -1))
        if not supplier:
            continue
        values: dict[str, object] = {}
        invalid: list[dict] = []
        minimum_raw = _profile_cell(raw_row, indexes.get("minimum_order_value", -1))
        if minimum_raw:
            parsed = parse_decimal(minimum_raw, None)
            if parsed is None:
                invalid.append({"field": "Pedido minimo", "value": minimum_raw})
            else:
                values["minimum_order_value"] = parsed
        contact_raw = _profile_cell(raw_row, indexes.get("contact", -1))
        if contact_raw:
            values.update(_classify_contact(contact_raw))
        contact_name = _profile_cell(raw_row, indexes.get("contact_name", -1))
        if contact_name:
            values["contact_name"] = contact_name[:120]
        contact_phone = _profile_cell(raw_row, indexes.get("contact_phone", -1))
        if contact_phone:
            values["contact_phone"] = clean_phone(contact_phone)
        contact_email = _profile_cell(raw_row, indexes.get("contact_email", -1))
        if contact_email:
            values["contact_email"] = contact_email[:160]
        if values or invalid:
            records.append({"line": line, "supplier": supplier, "values": values, "invalid": invalid})
    return records


def _profile_fields_preview(values: dict) -> list[dict]:
    return [
        {
            "field": field,
            "label": PROFILE_FIELD_LABELS[field],
            "to": _display_profile_value(field, value),
        }
        for field, value in values.items()
        if field in PROFILE_FIELD_LABELS
    ]


def _profile_changes(supplier: dict, values: dict) -> list[dict]:
    changes: list[dict] = []
    for field, imported in values.items():
        if field not in PROFILE_FIELD_LABELS:
            continue
        current = supplier.get(field)
        if field == "minimum_order_value":
            current_number = float(current or 0)
            imported_number = float(imported or 0)
            if abs(current_number - imported_number) < 0.005:
                continue
        else:
            if _norm_text(current) == _norm_text(imported):
                continue
        changes.append(
            {
                "field": field,
                "label": PROFILE_FIELD_LABELS[field],
                "from": _display_profile_value(field, current),
                "to": _display_profile_value(field, imported),
            }
        )
    return changes


def _build_supplier_profile_diff(conn: sqlite3.Connection, org: str, records: list[dict]) -> dict:
    new_suppliers: list[dict] = []
    updates: list[dict] = []
    skipped: list[dict] = []
    unchanged = 0
    for record in records:
        for invalid in record["invalid"]:
            skipped.append(
                {
                    "line": record["line"],
                    "supplier": record["supplier"],
                    "reason": f"{invalid['field']} invalido: {invalid['value']}",
                }
            )
        if not record["values"]:
            skipped.append({"line": record["line"], "supplier": record["supplier"], "reason": "sem dados para atualizar"})
            continue
        supplier = _read_supplier_profile(conn, org, record["supplier"])
        if not supplier:
            new_suppliers.append(
                {
                    "line": record["line"],
                    "supplier": record["supplier"],
                    "fields": _profile_fields_preview(record["values"]),
                }
            )
            continue
        changes = _profile_changes(supplier, record["values"])
        if changes:
            updates.append({"line": record["line"], "supplier": supplier["name"], "changes": changes})
        else:
            unchanged += 1
    return {
        "records_total": len(records),
        "new_suppliers": new_suppliers,
        "updates": updates,
        "skipped": skipped,
        "unchanged": unchanged,
    }


def _commit_supplier_profiles(conn: sqlite3.Connection, org: str, records: list[dict]) -> dict:
    created_suppliers = 0
    updated_suppliers = 0
    unchanged = 0
    skipped = 0
    for record in records:
        values = {field: value for field, value in record["values"].items() if field in PROFILE_FIELD_LABELS}
        if not values:
            skipped += 1
            continue
        supplier = _read_supplier_profile(conn, org, record["supplier"])
        created = False
        if not supplier:
            supplier_id = upsert_imported_supplier(conn, org=org, name=record["supplier"])
            supplier = _read_supplier_profile(conn, org, record["supplier"]) or {"id": supplier_id, "name": record["supplier"]}
            created = True
        changes = _profile_changes(supplier, values)
        if not created and not changes:
            unchanged += 1
            continue
        assignments = [f"{field} = ?" for field in values]
        conn.execute(
            f"""
            UPDATE suppliers
            SET {", ".join(assignments)}
            WHERE organization_id = ? AND id = ?
            """,
            (*values.values(), org, supplier["id"]),
        )
        if created:
            created_suppliers += 1
        else:
            updated_suppliers += 1
    conn.commit()
    return {
        "mode": "supplier_profile",
        "created_suppliers": created_suppliers,
        "updated_suppliers": updated_suppliers,
        "unchanged": unchanged,
        "skipped": skipped,
        "upserted": created_suppliers + updated_suppliers,
    }


# -------------------------------------------------------------- entrypoints


def _link_catalog() -> list[dict]:
    catalog: list[dict] = []
    for type_id, spec in LINK_TYPES.items():
        item = {
            "id": type_id,
            "label": spec["label"],
            "description": spec["description"],
            "mode": spec.get("mode", "link"),
        }
        if spec.get("mode") == "supplier_profile":
            item["columns"] = [
                {
                    "id": field["id"],
                    "label": field["label"],
                    "required": bool(field.get("required")),
                }
                for field in spec["columns"]
            ]
        else:
            item.update({
                "source": {
                    "label": spec["source"]["label"],
                    "can_create": spec["source"]["create"] is not None,
                    "create_label": spec["source"]["create_label"],
                },
                "target": {
                    "label": spec["target"]["label"],
                    "can_create": spec["target"]["create"] is not None,
                    "create_label": spec["target"]["create_label"],
                },
            })
        catalog.append(item)
    return catalog


def api_link_inspect(conn: sqlite3.Connection, payload: dict) -> dict:
    file_name, raw_bytes = _payload_to_bytes(payload)
    name, sheets, _metadata, _hash, _size = parse_erp_file_bytes(file_name, raw_bytes)
    headers, data_rows = _first_sheet_data(sheets)
    if not headers:
        raise ValueError("Planilha vazia ou sem cabecalho na primeira aba.")
    suggestions = {
        type_id: _suggest_columns(spec, headers)
        for type_id, spec in LINK_TYPES.items()
    }
    default_link_type = max(
        LINK_TYPES,
        key=lambda type_id: _suggestion_score(LINK_TYPES[type_id], suggestions[type_id]),
    )
    if _suggestion_score(LINK_TYPES[default_link_type], suggestions[default_link_type]) <= 0:
        default_link_type = next(iter(LINK_TYPES))
    sample = data_rows[:5]
    return {
        "ok": True,
        "file_name": name,
        "headers": headers,
        "sample_rows": sample,
        "row_count": len(data_rows),
        "link_types": _link_catalog(),
        "default_link_type": default_link_type,
        "suggestions": suggestions,
    }


def _resolve_indexes(payload: dict, headers: list[str], spec: dict) -> tuple[int, int]:
    src_raw = scalar_text(payload.get("source_column"))
    tgt_raw = scalar_text(payload.get("target_column"))
    try:
        src = int(src_raw) if src_raw not in ("", None) else -1
    except ValueError:
        src = -1
    try:
        tgt = int(tgt_raw) if tgt_raw not in ("", None) else -1
    except ValueError:
        tgt = -1
    if src < 0 or tgt < 0:
        suggestion = _suggest_columns(spec, headers)
        if src < 0:
            src = suggestion["source_index"]
        if tgt < 0:
            tgt = suggestion["target_index"]
    if src < 0 or tgt < 0 or src >= len(headers) or tgt >= len(headers) or src == tgt:
        raise ValueError("Indique colunas validas e diferentes para origem e destino do vinculo.")
    return src, tgt


def api_link_preview(conn: sqlite3.Connection, payload: dict) -> dict:
    type_id = scalar_text(payload.get("link_type"))
    spec = LINK_TYPES.get(type_id)
    if not spec:
        raise ValueError(f"Tipo de vinculo desconhecido: {type_id or '(vazio)'}")
    file_name, raw_bytes = _payload_to_bytes(payload)
    name, sheets, _metadata, _hash, _size = parse_erp_file_bytes(file_name, raw_bytes)
    headers, data_rows = _first_sheet_data(sheets)
    if not headers:
        raise ValueError("Planilha vazia ou sem cabecalho na primeira aba.")
    if spec.get("mode") == "supplier_profile":
        indexes = _resolve_profile_indexes(payload, headers, spec)
        records = _build_supplier_profile_records(data_rows, indexes)
        org = default_organization_id(conn) or default_organization_slug()
        diff = _build_supplier_profile_diff(conn, org, records)
        return {
            "ok": True,
            "mode": "supplier_profile",
            "type": type_id,
            "type_label": spec["label"],
            "file_name": name,
            "headers": headers,
            "field_indexes": indexes,
            "summary": {
                "records_total": diff["records_total"],
                "new_suppliers": len(diff["new_suppliers"]),
                "updated_suppliers": len(diff["updates"]),
                "unchanged": diff["unchanged"],
                "skipped": len(diff["skipped"]),
            },
            "preview": {
                "new_suppliers": diff["new_suppliers"][:30],
                "updates": diff["updates"][:30],
                "skipped": diff["skipped"][:30],
            },
        }
    src, tgt = _resolve_indexes(payload, headers, spec)
    pairs = _build_pairs(data_rows, src, tgt)
    org = default_organization_id(conn) or default_organization_slug()
    diff = _build_diff(spec, conn, org, pairs)
    return {
        "ok": True,
        "type": type_id,
        "type_label": spec["label"],
        "file_name": name,
        "headers": headers,
        "source_index": src,
        "target_index": tgt,
        "source_label": spec["source"]["label"],
        "target_label": spec["target"]["label"],
        "summary": {
            "pairs_total": diff["pairs_total"],
            "new_source": len(diff["new_source"]),
            "new_target": len(diff["new_target"]),
            "new_links": len(diff["new_links"]),
            "overrides": len(diff["overrides"]),
            "unresolved": len(diff["unresolved"]),
            "unchanged": diff["unchanged"],
        },
        "preview": {
            "new_source": diff["new_source"][:30],
            "new_target": diff["new_target"][:30],
            "new_links": diff["new_links"][:30],
            "overrides": diff["overrides"][:30],
            "unresolved": diff["unresolved"][:30],
        },
        "labels": {
            "source": spec["source"]["label"],
            "target": spec["target"]["label"],
            "source_create": spec["source"]["create_label"],
            "target_create": spec["target"]["create_label"],
        },
    }


def api_link_commit(conn: sqlite3.Connection, payload: dict) -> dict:
    type_id = scalar_text(payload.get("link_type"))
    spec = LINK_TYPES.get(type_id)
    if not spec:
        raise ValueError(f"Tipo de vinculo desconhecido: {type_id or '(vazio)'}")
    file_name, raw_bytes = _payload_to_bytes(payload)
    name, sheets, _metadata, _hash, _size = parse_erp_file_bytes(file_name, raw_bytes)
    headers, data_rows = _first_sheet_data(sheets)
    if not headers:
        raise ValueError("Planilha vazia ou sem cabecalho na primeira aba.")
    if spec.get("mode") == "supplier_profile":
        indexes = _resolve_profile_indexes(payload, headers, spec)
        records = _build_supplier_profile_records(data_rows, indexes)
        org = default_organization_id(conn) or default_organization_slug()
        summary = _commit_supplier_profiles(conn, org, records)
        return {"ok": True, "type": type_id, **summary}
    src, tgt = _resolve_indexes(payload, headers, spec)
    pairs = _build_pairs(data_rows, src, tgt)
    org = default_organization_id(conn) or default_organization_slug()
    summary = _commit_pairs(spec, conn, org, pairs)
    return {"ok": True, "type": type_id, **summary}
