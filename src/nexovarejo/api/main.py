from __future__ import annotations

import os
from pathlib import Path

from nexovarejo import __version__
from nexovarejo.services import abc_report, customer_rfm, executive_summary, purchase_suggestions, top_products
from nexovarejo.storage import connect
from nexovarejo.storage.sqlite import DEFAULT_DB_PATH

try:
    from fastapi import FastAPI
except ImportError:  # pragma: no cover - depende do ambiente de API
    FastAPI = None


def create_app():
    if FastAPI is None:
        raise RuntimeError("Instale as dependencias de API com: pip install -r requirements.txt")

    app = FastAPI(title="NexoVarejo API", version=__version__)

    def _db_path() -> Path:
        return Path(os.environ.get("NEXO_DB_PATH", str(DEFAULT_DB_PATH)))

    def _with_conn(callback):
        conn = connect(_db_path())
        try:
            return callback(conn)
        finally:
            conn.close()

    @app.get("/health")
    def health():
        return {"ok": True, "service": "nexovarejo", "version": __version__}

    @app.get("/v1/organizations/{organization_id}/summary")
    def summary(organization_id: str, store_id: str | None = None):
        return _with_conn(lambda conn: executive_summary(conn, organization_id, store_id))

    @app.get("/v1/organizations/{organization_id}/products/top")
    def products_top(organization_id: str, store_id: str | None = None, limit: int = 20):
        return {
            "items": _with_conn(lambda conn: top_products(conn, organization_id, store_id=store_id, limit=limit))
        }

    @app.get("/v1/organizations/{organization_id}/abc")
    def abc(organization_id: str, store_id: str | None = None, limit: int = 200):
        return {
            "items": _with_conn(lambda conn: abc_report(conn, organization_id, store_id=store_id, limit=limit))
        }

    @app.get("/v1/organizations/{organization_id}/purchase-suggestions")
    def purchases(organization_id: str, store_id: str | None = None, limit: int = 200):
        return {
            "items": _with_conn(lambda conn: purchase_suggestions(conn, organization_id, store_id=store_id, limit=limit))
        }

    @app.get("/v1/organizations/{organization_id}/customers/rfm")
    def rfm(organization_id: str, limit: int = 200):
        return {
            "items": _with_conn(lambda conn: customer_rfm(conn, organization_id, limit=limit))
        }

    return app


if FastAPI is not None:
    app = create_app()
