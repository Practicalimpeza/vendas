from __future__ import annotations

import argparse
import json
import sys
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from nexovarejo.services import (
    abc_report,
    customer_rfm,
    executive_summary,
    import_practica_directory,
    purchase_suggestions,
    top_products,
)
from nexovarejo.storage import connect
from nexovarejo.storage.sqlite import DEFAULT_DB_PATH

WEB_DIR = ROOT / "web"
DEFAULT_SOURCE_DIR = ROOT.parent / "software_pedido" / "data_raw"
MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
}


class WebHandler(BaseHTTPRequestHandler):
    db_path: Path = DEFAULT_DB_PATH
    source_dir: Path = DEFAULT_SOURCE_DIR

    def log_message(self, fmt: str, *args) -> None:
        print(f"[web] {self.address_string()} - {fmt % args}")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path.startswith("/api/"):
                self._handle_api_get(parsed.path, parse_qs(parsed.query))
                return
            self._serve_static(parsed.path)
        except Exception as exc:  # noqa: BLE001
            self._send_json({"error": str(exc)}, status=500)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/import-practica":
                result = import_practica_directory(
                    self.source_dir,
                    database_path=self.db_path,
                    organization_id="org_practica",
                    store_id="loja_1",
                )
                self._send_json({
                    "database_path": str(result.database_path),
                    "import": result.persist_result.__dict__,
                })
                return
            self._send_json({"error": "rota nao encontrada"}, status=404)
        except Exception as exc:  # noqa: BLE001
            self._send_json({"error": str(exc)}, status=500)

    def _handle_api_get(self, path: str, query: dict[str, list[str]]) -> None:
        organization_id = _first(query, "organization_id", "org_practica")
        store_id = _first(query, "store_id", "loja_1")
        limit = int(_first(query, "limit", "100"))

        conn = connect(self.db_path)
        try:
            if path == "/api/summary":
                payload = executive_summary(conn, organization_id, store_id)
            elif path == "/api/top-products":
                payload = {"items": top_products(conn, organization_id, store_id=store_id, limit=limit)}
            elif path == "/api/abc":
                payload = {"items": abc_report(conn, organization_id, store_id=store_id, limit=limit)}
            elif path == "/api/purchase-suggestions":
                payload = {"items": purchase_suggestions(conn, organization_id, store_id=store_id, limit=limit)}
            elif path == "/api/rfm":
                payload = {"items": customer_rfm(conn, organization_id, limit=limit)}
            else:
                self._send_json({"error": "rota nao encontrada"}, status=404)
                return
        finally:
            conn.close()
        self._send_json(payload)

    def _serve_static(self, path: str) -> None:
        name = "index.html" if path in {"", "/"} else path.lstrip("/")
        requested = (WEB_DIR / name).resolve()
        if not str(requested).startswith(str(WEB_DIR.resolve())) or not requested.is_file():
            self._send_json({"error": "arquivo nao encontrado"}, status=404)
            return
        data = requested.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", MIME.get(requested.suffix.lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, payload, status: int = 200) -> None:
        data = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)


def _first(query: dict[str, list[str]], key: str, default: str) -> str:
    values = query.get(key)
    return values[0] if values and values[0] else default


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve a interface web local do NexoVarejo.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8010)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    args = parser.parse_args()

    WebHandler.db_path = args.db
    WebHandler.source_dir = args.source_dir

    server = ThreadingHTTPServer((args.host, args.port), WebHandler)
    print(f"NexoVarejo web: http://{args.host}:{args.port}")
    print(f"Banco: {args.db}")
    print(f"Fonte Practica: {args.source_dir}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
