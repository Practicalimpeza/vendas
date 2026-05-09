from __future__ import annotations

import argparse
import json
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from api_routes import get_api_payload, get_quote_pdf, post_api_payload
from db_helpers import resolve_period
from http_helpers import (
    is_loopback_host,
    read_payload,
    send_api_error,
    send_binary,
    send_file,
    send_json,
    truthy_env,
)
from schema_upgrades import ensure_schema_upgrades


ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "web"
SPA_ROUTES = {
    "/painel",
    "/hoje",
    "/motor",
    "/produtos",
    "/compras",
    "/reposicao",
    "/fornecedores",
    "/cotacoes",
    "/precos",
    "/oportunidades",
    "/clientes",
    "/servicos",
    "/importacao",
}


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA cache_size = -32768")
    conn.execute("PRAGMA temp_store = MEMORY")
    conn.execute("PRAGMA mmap_size = 268435456")
    return conn


def initialize_schema(db_path: Path) -> None:
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        ensure_schema_upgrades(conn)
    finally:
        conn.close()


class AppHandler(BaseHTTPRequestHandler):
    db_path: Path

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        route = parsed.path
        query = parse_qs(parsed.query)
        if route == "/api/quote/pdf":
            conn = connect(self.db_path)
            try:
                try:
                    filename, body = get_quote_pdf(conn, query)
                    send_binary(self, body, "application/pdf", filename)
                except (ValueError, TypeError, AttributeError) as exc:
                    send_api_error(self, str(exc), status=400, code="bad_request", route=route)
                except Exception as exc:
                    self.log_error("Erro interno em %s: %s", route, exc)
                    send_api_error(self, "Erro interno ao gerar PDF.", status=500, code="internal_error", route=route)
            finally:
                conn.close()
            return

        if route.startswith("/api/"):
            conn = connect(self.db_path)
            try:
                try:
                    period = resolve_period(conn, query, 180)
                    send_json(self, get_api_payload(route, conn, query, period))
                except KeyError:
                    send_api_error(self, "Endpoint nao encontrado.", status=404, code="not_found", route=route)
                except (ValueError, TypeError, AttributeError) as exc:
                    send_api_error(self, str(exc), status=400, code="bad_request", route=route)
                except Exception as exc:
                    self.log_error("Erro interno em %s: %s", route, exc)
                    send_api_error(self, "Erro interno ao carregar dados.", status=500, code="internal_error", route=route)
            finally:
                conn.close()
            return

        if route == "/" or route in SPA_ROUTES:
            send_file(self, WEB_DIR / "index.html")
            return
        target = (WEB_DIR / route.lstrip("/")).resolve()
        if WEB_DIR.resolve() not in target.parents and target != WEB_DIR.resolve():
            self.send_error(403)
            return
        send_file(self, target)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        route = parsed.path
        conn = connect(self.db_path)
        try:
            try:
                payload = read_payload(self)
                send_json(self, post_api_payload(route, conn, payload))
            except KeyError:
                send_api_error(self, "Endpoint nao encontrado.", status=404, code="not_found", route=route)
            except (json.JSONDecodeError, ValueError, TypeError, AttributeError) as exc:
                send_api_error(self, str(exc), status=400, code="bad_request", route=route)
            except Exception as exc:
                self.log_error("Erro interno em %s: %s", route, exc)
                send_api_error(self, "Erro interno ao salvar dados.", status=500, code="internal_error", route=route)
        finally:
            conn.close()

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve o app local NexoVarejo.")
    parser.add_argument("--db", default="data/nexovarejo.db")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8010)
    args = parser.parse_args()
    if not is_loopback_host(args.host) and not truthy_env("NEXOVAREJO_ALLOW_NETWORK"):
        raise SystemExit(
            "Por seguranca, o NexoVarejo inicia apenas em localhost. "
            "Defina NEXOVAREJO_ALLOW_NETWORK=1 para expor conscientemente na rede local."
        )
    AppHandler.db_path = Path(args.db)
    initialize_schema(AppHandler.db_path)
    server = ThreadingHTTPServer((args.host, args.port), AppHandler)
    print(f"NexoVarejo em http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
