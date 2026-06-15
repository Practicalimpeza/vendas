from __future__ import annotations

import json
import sqlite3
from base64 import b64decode
from hashlib import sha1
from uuid import uuid4

from app_config import asset_public_path, asset_storage_dir
from db_helpers import default_organization_id, normalize_code, one, parse_decimal, parse_int, rows, scalar_text
from text_utils import normalize


CATALOG_DEFAULT_NAME = "Catalogo do cliente"
CATALOG_STATUSES = {"draft", "active", "paused", "expired", "archived"}
ITEM_STATUSES = {"draft", "active", "paused", "expired", "archived"}
ITEM_ORIGINS = {"manual", "history", "opportunity"}
MAX_PRODUCT_IMAGE_UPLOAD_BYTES = 3 * 1024 * 1024


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


def _product(conn: sqlite3.Connection, product_id: str, organization_id: str = "") -> dict:
    if not product_id:
        raise ValueError("Produto e obrigatorio.")
    params: tuple[object, ...] = (product_id,)
    org_filter = ""
    if organization_id:
        org_filter = " AND p.organization_id = ?"
        params = (product_id, organization_id)
    product = one(
        conn,
        f"""
        SELECT
            p.id,
            p.organization_id,
            p.source_code,
            p.name,
            p.unit,
            p.active,
            COALESCE(b.name, '') AS brand_name,
            COALESCE(c.name, '') AS category_name
        FROM products p
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = ?{org_filter}
        """,
        params,
    )
    if not product:
        raise ValueError("Produto nao encontrado.")
    return product


def _catalog_id(organization_id: str, customer_id: str) -> str:
    return f"{organization_id}:customer_catalog:{customer_id}"


def _ensure_default_catalog(conn: sqlite3.Connection, customer: dict) -> dict:
    organization_id = customer["organization_id"]
    customer_id = customer["id"]
    canonical_name = customer.get("canonical_name") or customer.get("normalized_name") or customer.get("name") or ""
    catalog_id = _catalog_id(organization_id, customer_id)
    conn.execute(
        """
        INSERT INTO customer_catalogs
            (id, organization_id, customer_id, customer_canonical_name, name, status)
        VALUES (?, ?, ?, ?, ?, 'draft')
        ON CONFLICT(organization_id, customer_id, name) DO UPDATE SET
            customer_canonical_name = excluded.customer_canonical_name,
            updated_at = CURRENT_TIMESTAMP
        """,
        (catalog_id, organization_id, customer_id, canonical_name, CATALOG_DEFAULT_NAME),
    )
    return one(
        conn,
        """
        SELECT *
        FROM customer_catalogs
        WHERE organization_id = ?
          AND customer_id = ?
          AND name = ?
        ORDER BY updated_at DESC
        LIMIT 1
        """,
        (organization_id, customer_id, CATALOG_DEFAULT_NAME),
    )


def _record_event(
    conn: sqlite3.Connection,
    *,
    organization_id: str,
    catalog_id: str,
    customer_id: str,
    event_type: str,
    item_id: int | None = None,
    note: str = "",
    metadata: dict | None = None,
) -> None:
    conn.execute(
        """
        INSERT INTO customer_catalog_events
            (id, organization_id, catalog_id, item_id, customer_id, event_type, note, metadata_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            uuid4().hex,
            organization_id,
            catalog_id,
            item_id,
            customer_id,
            event_type,
            scalar_text(note)[:500],
            json.dumps(metadata or {}, ensure_ascii=True),
        ),
    )


def _status(value: object, allowed: set[str], default: str) -> str:
    text = scalar_text(value).lower()
    return text if text in allowed else default


def _image_map(conn: sqlite3.Connection, organization_id: str, product_ids: list[str]) -> dict[str, str]:
    if not product_ids:
        return {}
    placeholders = ",".join("?" for _ in product_ids)
    data = rows(
        conn,
        f"""
        SELECT product_id, public_path
        FROM product_media pm
        WHERE organization_id = ?
          AND product_id IN ({placeholders})
          AND media_type = 'image'
          AND public_path <> ''
          AND pm.id = (
              SELECT pm2.id
              FROM product_media pm2
              WHERE pm2.organization_id = pm.organization_id
                AND pm2.product_id = pm.product_id
                AND pm2.media_type = 'image'
              ORDER BY pm2.is_primary DESC, pm2.sort_order ASC, pm2.created_at DESC
              LIMIT 1
          )
        """,
        (organization_id, *product_ids),
    )
    return {row["product_id"]: row["public_path"] for row in data}


def _last_price_sql() -> str:
    return """
        SELECT ps.sale_price
        FROM price_snapshots ps
        WHERE ps.organization_id = p.organization_id
          AND ps.product_id = p.id
        ORDER BY ps.snapshot_date DESC, ps.id DESC
        LIMIT 1
    """


def _catalog_items(conn: sqlite3.Connection, catalog: dict, customer: dict) -> list[dict]:
    data = rows(
        conn,
        f"""
        SELECT
            cci.*,
            p.source_code,
            p.name,
            p.unit,
            COALESCE(b.name, '') AS brand_name,
            COALESCE(cat.name, '') AS category_name,
            COALESCE(({_last_price_sql()}), 0) AS sale_price,
            COALESCE(hist.quantity, 0) AS history_quantity,
            COALESCE(hist.revenue, 0) AS history_revenue,
            COALESCE(hist.purchase_days, 0) AS history_purchase_days,
            hist.last_purchase AS history_last_purchase,
            COALESCE(hist.avg_unit_price, 0) AS history_avg_unit_price
        FROM customer_catalog_items cci
        JOIN products p ON p.id = cci.product_id
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN categories cat ON cat.id = p.category_id
        LEFT JOIN (
            SELECT
                ps.product_id,
                ROUND(SUM(ps.quantity), 2) AS quantity,
                ROUND(SUM(ps.gross_amount), 2) AS revenue,
                COUNT(DISTINCT substr(ps.sold_at, 1, 10)) AS purchase_days,
                MAX(substr(ps.sold_at, 1, 10)) AS last_purchase,
                ROUND(SUM(ps.gross_amount) / NULLIF(SUM(ps.quantity), 0), 2) AS avg_unit_price
            FROM product_sales ps
            JOIN customers c ON c.id = ps.customer_id
            WHERE ps.organization_id = ?
              AND c.canonical_name = ?
            GROUP BY ps.product_id
        ) hist ON hist.product_id = cci.product_id
        WHERE cci.catalog_id = ?
          AND cci.status <> 'archived'
        ORDER BY cci.sort_order, p.name
        """,
        (
            customer["organization_id"],
            customer.get("canonical_name") or customer.get("normalized_name") or customer.get("name") or "",
            catalog["id"],
        ),
    )
    images = _image_map(conn, customer["organization_id"], [row["product_id"] for row in data])
    for row in data:
        row["image_path"] = images.get(row["product_id"], "")
    return data


def _candidate_items(conn: sqlite3.Connection, catalog: dict, customer: dict, limit: int = 18) -> list[dict]:
    data = rows(
        conn,
        f"""
        SELECT
            p.id AS product_id,
            p.source_code,
            p.name,
            p.unit,
            COALESCE(b.name, '') AS brand_name,
            COALESCE(cat.name, '') AS category_name,
            ROUND(SUM(ps.quantity), 2) AS quantity,
            ROUND(SUM(ps.gross_amount), 2) AS revenue,
            COUNT(DISTINCT substr(ps.sold_at, 1, 10)) AS purchase_days,
            MAX(substr(ps.sold_at, 1, 10)) AS last_purchase,
            ROUND(SUM(ps.gross_amount) / NULLIF(SUM(ps.quantity), 0), 2) AS avg_unit_price,
            COALESCE(({_last_price_sql()}), 0) AS sale_price
        FROM product_sales ps
        JOIN customers c ON c.id = ps.customer_id
        JOIN products p ON p.id = ps.product_id
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN categories cat ON cat.id = p.category_id
        LEFT JOIN customer_catalog_items cci
          ON cci.catalog_id = ?
         AND cci.product_id = p.id
         AND cci.status <> 'archived'
        WHERE ps.organization_id = ?
          AND c.canonical_name = ?
          AND cci.id IS NULL
        GROUP BY p.id
        HAVING revenue > 0
        ORDER BY purchase_days DESC, revenue DESC, p.name
        LIMIT ?
        """,
        (
            catalog["id"],
            customer["organization_id"],
            customer.get("canonical_name") or customer.get("normalized_name") or customer.get("name") or "",
            max(1, min(int(limit or 18), 50)),
        ),
    )
    images = _image_map(conn, customer["organization_id"], [row["product_id"] for row in data])
    for row in data:
        row["image_path"] = images.get(row["product_id"], "")
    return data


def _catalog_summary(items: list[dict], candidates: list[dict]) -> dict:
    active = [row for row in items if row.get("status") == "active"]
    draft = [row for row in items if row.get("status") == "draft"]
    expiring = [
        row
        for row in items
        if row.get("valid_until") and row.get("status") in {"active", "draft", "paused"}
    ]
    negotiated_total = round(sum(float(row.get("negotiated_price") or 0) for row in items), 2)
    return {
        "items": len(items),
        "active_items": len(active),
        "draft_items": len(draft),
        "paused_items": sum(1 for row in items if row.get("status") == "paused"),
        "expiring_items": len(expiring),
        "candidate_items": len(candidates),
        "negotiated_price_total": negotiated_total,
    }


def api_customer_catalog(conn: sqlite3.Connection, customer_id: str, period: dict | None = None) -> dict:
    del period
    customer = _customer(conn, customer_id)
    catalog = _ensure_default_catalog(conn, customer)
    items = _catalog_items(conn, catalog, customer)
    candidates = _candidate_items(conn, catalog, customer)
    return {
        "contract": "customer_catalog.v1",
        "customer": {
            "id": customer["id"],
            "organization_id": customer["organization_id"],
            "source_code": customer.get("source_code") or "",
            "name": customer.get("name") or "",
            "canonical_name": customer.get("canonical_name") or "",
            "document": customer.get("document") or "",
            "customer_type": customer.get("customer_type") or "",
        },
        "catalog": {
            "id": catalog["id"],
            "name": catalog["name"],
            "status": catalog["status"],
            "valid_from": catalog.get("valid_from") or "",
            "valid_until": catalog.get("valid_until") or "",
            "review_at": catalog.get("review_at") or "",
            "public_notes": catalog.get("public_notes") or "",
            "internal_notes": catalog.get("internal_notes") or "",
            "updated_at": catalog.get("updated_at") or "",
        },
        "summary": _catalog_summary(items, candidates),
        "items": items,
        "candidate_items": candidates,
    }


def api_products_search(conn: sqlite3.Connection, query: str = "", limit: int = 30) -> dict:
    organization_id = default_organization_id(conn)
    text = scalar_text(query)
    limit = max(1, min(int(limit or 30), 80))
    params: list[object] = [organization_id]
    where = "p.organization_id = ? AND p.active = 1"
    if text:
        like = f"%{normalize(text)}%"
        code_like = f"%{normalize_code(text)}%"
        where += " AND (p.normalized_name LIKE ? OR p.source_code LIKE ? OR p.name LIKE ?)"
        params.extend([like, code_like, f"%{text}%"])
    data = rows(
        conn,
        f"""
        SELECT
            p.id AS product_id,
            p.organization_id,
            p.source_code,
            p.name,
            p.unit,
            COALESCE(b.name, '') AS brand_name,
            COALESCE(c.name, '') AS category_name,
            COALESCE(({_last_price_sql()}), 0) AS sale_price
        FROM products p
        LEFT JOIN brands b ON b.id = p.brand_id
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE {where}
        ORDER BY
            CASE WHEN p.source_code = ? THEN 0 ELSE 1 END,
            p.name
        LIMIT ?
        """,
        (*params, normalize_code(text), limit),
    )
    images = _image_map(conn, organization_id, [row["product_id"] for row in data])
    for row in data:
        row["image_path"] = images.get(row["product_id"], "")
    return {"contract": "products_search.v1", "query": text, "rows": data}


def upsert_customer_catalog(conn: sqlite3.Connection, payload: dict) -> dict:
    customer = _customer(conn, scalar_text(payload.get("customer_id") or payload.get("id")))
    catalog = _ensure_default_catalog(conn, customer)
    status = _status(payload.get("status"), CATALOG_STATUSES, catalog.get("status") or "draft")
    conn.execute(
        """
        UPDATE customer_catalogs
        SET status = ?,
            valid_from = ?,
            valid_until = ?,
            review_at = ?,
            public_notes = ?,
            internal_notes = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        """,
        (
            status,
            scalar_text(payload.get("valid_from"))[:10],
            scalar_text(payload.get("valid_until"))[:10],
            scalar_text(payload.get("review_at"))[:10],
            scalar_text(payload.get("public_notes"))[:2000],
            scalar_text(payload.get("internal_notes"))[:2000],
            catalog["id"],
        ),
    )
    _record_event(
        conn,
        organization_id=customer["organization_id"],
        catalog_id=catalog["id"],
        customer_id=customer["id"],
        event_type="catalog_updated",
        metadata={"status": status},
    )
    conn.commit()
    return api_customer_catalog(conn, customer["id"])


def upsert_customer_catalog_item(conn: sqlite3.Connection, payload: dict) -> dict:
    customer = _customer(conn, scalar_text(payload.get("customer_id")))
    catalog = _ensure_default_catalog(conn, customer)
    product = _product(conn, scalar_text(payload.get("product_id")), customer["organization_id"])
    item_id = parse_int(payload.get("item_id"), None)
    status = _status(payload.get("status"), ITEM_STATUSES, "draft")
    origin = _status(payload.get("origin"), ITEM_ORIGINS, "manual")
    negotiated_price = parse_decimal(payload.get("negotiated_price"), None)
    discount_pct = parse_decimal(payload.get("discount_pct"), None)
    minimum_quantity = parse_decimal(payload.get("minimum_quantity"), 0) or 0
    package_size = parse_decimal(payload.get("package_size"), 1) or 1
    values = (
        customer["organization_id"],
        catalog["id"],
        customer["id"],
        product["id"],
        product["name"],
        product.get("source_code") or "",
        product.get("unit") or "",
        negotiated_price,
        discount_pct,
        minimum_quantity,
        package_size,
        scalar_text(payload.get("valid_from"))[:10],
        scalar_text(payload.get("valid_until"))[:10],
        status,
        origin,
        scalar_text(payload.get("public_notes"))[:2000],
        scalar_text(payload.get("internal_notes"))[:2000],
        parse_int(payload.get("sort_order"), 0) or 0,
    )
    if item_id:
        existing = one(
            conn,
            """
            SELECT id
            FROM customer_catalog_items
            WHERE id = ?
              AND catalog_id = ?
            """,
            (item_id, catalog["id"]),
        )
        if not existing:
            raise ValueError("Item do catalogo nao encontrado.")
        conn.execute(
            """
            UPDATE customer_catalog_items
            SET product_name_snapshot = ?,
                source_code_snapshot = ?,
                unit_snapshot = ?,
                negotiated_price = ?,
                discount_pct = ?,
                minimum_quantity = ?,
                package_size = ?,
                valid_from = ?,
                valid_until = ?,
                status = ?,
                origin = ?,
                public_notes = ?,
                internal_notes = ?,
                sort_order = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND catalog_id = ?
            """,
            (
                product["name"],
                product.get("source_code") or "",
                product.get("unit") or "",
                negotiated_price,
                discount_pct,
                minimum_quantity,
                package_size,
                scalar_text(payload.get("valid_from"))[:10],
                scalar_text(payload.get("valid_until"))[:10],
                status,
                origin,
                scalar_text(payload.get("public_notes"))[:2000],
                scalar_text(payload.get("internal_notes"))[:2000],
                parse_int(payload.get("sort_order"), 0) or 0,
                item_id,
                catalog["id"],
            ),
        )
        saved_item_id = item_id
        event_type = "item_updated"
    else:
        conn.execute(
            """
            INSERT INTO customer_catalog_items
                (organization_id, catalog_id, customer_id, product_id, product_name_snapshot,
                 source_code_snapshot, unit_snapshot, negotiated_price, discount_pct,
                 minimum_quantity, package_size, valid_from, valid_until, status, origin,
                 public_notes, internal_notes, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(catalog_id, product_id) DO UPDATE SET
                product_name_snapshot = excluded.product_name_snapshot,
                source_code_snapshot = excluded.source_code_snapshot,
                unit_snapshot = excluded.unit_snapshot,
                negotiated_price = excluded.negotiated_price,
                discount_pct = excluded.discount_pct,
                minimum_quantity = excluded.minimum_quantity,
                package_size = excluded.package_size,
                valid_from = excluded.valid_from,
                valid_until = excluded.valid_until,
                status = excluded.status,
                origin = excluded.origin,
                public_notes = excluded.public_notes,
                internal_notes = excluded.internal_notes,
                sort_order = excluded.sort_order,
                updated_at = CURRENT_TIMESTAMP
            """,
            values,
        )
        saved = one(
            conn,
            """
            SELECT id
            FROM customer_catalog_items
            WHERE catalog_id = ?
              AND product_id = ?
            """,
            (catalog["id"], product["id"]),
        )
        saved_item_id = int(saved.get("id") or 0)
        event_type = "item_upserted"
    _record_event(
        conn,
        organization_id=customer["organization_id"],
        catalog_id=catalog["id"],
        customer_id=customer["id"],
        event_type=event_type,
        item_id=saved_item_id,
        metadata={"product_id": product["id"], "status": status, "origin": origin},
    )
    conn.commit()
    return api_customer_catalog(conn, customer["id"])


def archive_customer_catalog_item(conn: sqlite3.Connection, payload: dict) -> dict:
    customer = _customer(conn, scalar_text(payload.get("customer_id")))
    catalog = _ensure_default_catalog(conn, customer)
    item_id = parse_int(payload.get("item_id"), None)
    if not item_id:
        raise ValueError("Item do catalogo e obrigatorio.")
    conn.execute(
        """
        UPDATE customer_catalog_items
        SET status = 'archived',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND catalog_id = ?
        """,
        (item_id, catalog["id"]),
    )
    _record_event(
        conn,
        organization_id=customer["organization_id"],
        catalog_id=catalog["id"],
        customer_id=customer["id"],
        event_type="item_archived",
        item_id=item_id,
    )
    conn.commit()
    return api_customer_catalog(conn, customer["id"])


def upsert_product_media(conn: sqlite3.Connection, payload: dict) -> dict:
    product = _product(conn, scalar_text(payload.get("product_id")))
    upload = payload.get("media_upload") or payload.get("image_upload")
    if not isinstance(upload, dict):
        raise ValueError("Imagem do produto e obrigatoria.")
    data_url = scalar_text(upload.get("data_url"))
    if "," not in data_url:
        raise ValueError("Imagem invalida. Envie PNG, JPG ou WEBP.")
    header, encoded = data_url.split(",", 1)
    mime_type = scalar_text(upload.get("mime_type")).lower()
    if not mime_type and header.startswith("data:"):
        mime_type = header.split(";", 1)[0].replace("data:", "").strip().lower()
    extensions = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
    extension = extensions.get(mime_type)
    if not extension:
        raise ValueError("Formato de imagem nao suportado. Use PNG, JPG ou WEBP.")
    try:
        content = b64decode(encoded, validate=True)
    except ValueError as exc:
        raise ValueError("Imagem invalida. Nao foi possivel ler o arquivo.") from exc
    if not content or len(content) > MAX_PRODUCT_IMAGE_UPLOAD_BYTES:
        raise ValueError("A imagem precisa ter ate 3 MB.")
    digest = sha1(content).hexdigest()[:12]
    product_code = normalize_code(product.get("source_code")) or normalize(product.get("name"))[:40] or product["id"][:12]
    file_name = f"product_{product_code}_{digest}{extension}"
    folder = asset_storage_dir()
    folder.mkdir(parents=True, exist_ok=True)
    (folder / file_name).write_bytes(content)
    public_path = asset_public_path(file_name)
    is_primary = 1 if payload.get("is_primary", True) else 0
    if is_primary:
        conn.execute(
            """
            UPDATE product_media
            SET is_primary = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE organization_id = ?
              AND product_id = ?
            """,
            (product["organization_id"], product["id"]),
        )
    media_id = f"{product['organization_id']}:product_media:{uuid4().hex}"
    conn.execute(
        """
        INSERT INTO product_media
            (id, organization_id, product_id, media_type, public_path, alt_text, is_primary, source_kind)
        VALUES (?, ?, ?, 'image', ?, ?, ?, 'upload')
        ON CONFLICT(organization_id, product_id, public_path) DO UPDATE SET
            alt_text = excluded.alt_text,
            is_primary = excluded.is_primary,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            media_id,
            product["organization_id"],
            product["id"],
            public_path,
            scalar_text(payload.get("alt_text") or product.get("name"))[:240],
            is_primary,
        ),
    )
    conn.commit()
    return {
        "contract": "product_media.v1",
        "product_id": product["id"],
        "public_path": public_path,
    }
