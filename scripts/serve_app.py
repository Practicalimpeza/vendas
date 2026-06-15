from __future__ import annotations

import argparse
import json
import os
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from auth import (
    api_auth_me,
    can_access_route,
    clear_session_cookie_header,
    create_bootstrap_admin,
    current_user,
    has_users,
    list_users,
    login,
    logout,
    session_cookie_header,
    upsert_user,
)
from api_routes import get_api_payload, get_quote_pdf, post_api_payload, post_sales_order_pdf
from app_config import active_tenant, app_public_config, resolve_db_path, resolve_public_asset_path
from installation_state import api_installation_state
from db_helpers import resolve_period
from http_helpers import (
    is_loopback_host,
    read_payload,
    read_raw_body,
    send_api_error,
    send_binary,
    send_file,
    send_json,
    send_text,
    truthy_env,
)
from onboarding import api_onboarding, complete_onboarding
from schema_upgrades import ensure_schema_upgrades
from tenant_session import clear_client_tenant
from whatsapp_crm import receive_whatsapp_webhook, verify_webhook_challenge, verify_webhook_signature


ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = ROOT / "web"
SCHEMA_PATH = ROOT / "schema" / "canonical.sql"
SPA_ROUTES = {
    "/painel",
    "/vendedor",
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
    "/implantacao",
    "/importacao",
    "/distribuicao",
    "/whatsapp",
    "/admin",
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
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        ensure_schema_upgrades(conn)
    finally:
        conn.close()


def prewarm_runtime_caches(db_path: Path) -> None:
    def worker() -> None:
        time.sleep(2.0)
        conn = connect(db_path)
        try:
            query_default = {"period_days": ["30"]}
            period_default = resolve_period(conn, query_default, 30)
            for route, query, period in (
                ("/api/summary", query_default, period_default),
                ("/api/replenishment", query_default, period_default),
                ("/api/replenishment-v2", query_default, period_default),
                ("/api/commercial/intelligence", query_default, period_default),
                ("/api/pricing", query_default, period_default),
                ("/api/supplier-workbench/suppliers", {}, period_default),
                ("/api/actions/today", {}, period_default),
            ):
                try:
                    get_api_payload(route, conn, query, period)
                except Exception as exc:
                    print(f"Preaquecimento ignorou {route}: {exc}")
        finally:
            conn.close()

    threading.Thread(target=worker, name="pulso-cache-prewarm", daemon=True).start()


class AppHandler(BaseHTTPRequestHandler):
    db_path: Path

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        route = parsed.path
        query = parse_qs(parsed.query)
        if route == "/healthz":
            send_json(self, {"ok": True})
            return
        if route == "/api/auth/me":
            conn = connect(self.db_path)
            try:
                send_json(self, api_auth_me(conn, self))
            finally:
                conn.close()
            return
        if route == "/api/app-config":
            send_json(self, app_public_config())
            return
        if route == "/api/installation":
            send_json(self, api_installation_state())
            return
        if route == "/api/onboarding":
            conn = connect(self.db_path)
            try:
                send_json(self, api_onboarding(conn))
            finally:
                conn.close()
            return
        if route == "/api/admin/users":
            conn = connect(self.db_path)
            try:
                user = current_user(conn, self)
                if not user:
                    send_api_error(self, "Login necessario.", status=401, code="unauthorized", route=route)
                    return
                try:
                    send_json(self, list_users(conn, user))
                except PermissionError as exc:
                    send_api_error(self, str(exc), status=403, code="forbidden", route=route)
            finally:
                conn.close()
            return
        if route == "/api/quote/pdf":
            conn = connect(self.db_path)
            try:
                user = current_user(conn, self)
                if has_users(conn) and not user:
                    send_api_error(self, "Login necessario.", status=401, code="unauthorized", route=route)
                    return
                if not can_access_route(conn, user, route):
                    send_api_error(self, "Sem permissao para este modulo.", status=403, code="forbidden", route=route)
                    return
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

        if route == "/api/whatsapp/webhook":
            try:
                send_text(self, verify_webhook_challenge(query))
            except ValueError as exc:
                send_api_error(self, str(exc), status=403, code="webhook_forbidden", route=route)
            return

        asset_path = resolve_public_asset_path(route)
        if asset_path:
            send_file(self, asset_path)
            return

        if route.startswith("/api/"):
            conn = connect(self.db_path)
            try:
                user = current_user(conn, self)
                if has_users(conn) and not user:
                    send_api_error(self, "Login necessario.", status=401, code="unauthorized", route=route)
                    return
                if not can_access_route(conn, user, route):
                    send_api_error(self, "Sem permissao para este modulo.", status=403, code="forbidden", route=route)
                    return
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
        if route in {"/api/auth/bootstrap", "/api/auth/login", "/api/auth/logout", "/api/admin/users/upsert"}:
            conn = connect(self.db_path)
            try:
                try:
                    payload = read_payload(self)
                    if route == "/api/auth/bootstrap":
                        result, token = create_bootstrap_admin(conn, payload, self)
                        send_json(self, result, headers={"Set-Cookie": session_cookie_header(token, self)})
                    elif route == "/api/auth/login":
                        result, token = login(conn, payload, self)
                        send_json(self, result, headers={"Set-Cookie": session_cookie_header(token, self)})
                    elif route == "/api/auth/logout":
                        clear_client_tenant(active_tenant())
                        send_json(self, logout(conn, self), headers={"Set-Cookie": clear_session_cookie_header()})
                    else:
                        user = current_user(conn, self)
                        if not user:
                            send_api_error(self, "Login necessario.", status=401, code="unauthorized", route=route)
                            return
                        send_json(self, upsert_user(conn, payload, user))
                except PermissionError as exc:
                    send_api_error(self, str(exc), status=403, code="forbidden", route=route)
                except (json.JSONDecodeError, ValueError, TypeError, AttributeError) as exc:
                    send_api_error(self, str(exc), status=400, code="bad_request", route=route)
                except Exception as exc:
                    self.log_error("Erro interno em %s: %s", route, exc)
                    send_api_error(self, "Erro interno de autenticacao.", status=500, code="internal_error", route=route)
            finally:
                conn.close()
            return
        if route == "/api/whatsapp/webhook":
            raw_body = read_raw_body(self)
            signature = self.headers.get("X-Hub-Signature-256") or ""
            if not verify_webhook_signature(raw_body, signature):
                send_api_error(self, "Assinatura do webhook WhatsApp invalida.", status=403, code="bad_signature", route=route)
                return
            conn = connect(self.db_path)
            try:
                try:
                    payload = json.loads(raw_body.decode("utf-8") or "{}")
                    send_json(self, receive_whatsapp_webhook(conn, payload))
                except (json.JSONDecodeError, ValueError, TypeError, AttributeError) as exc:
                    send_api_error(self, str(exc), status=400, code="bad_request", route=route)
                except Exception as exc:
                    self.log_error("Erro interno em %s: %s", route, exc)
                    send_api_error(self, "Erro interno ao receber webhook WhatsApp.", status=500, code="internal_error", route=route)
            finally:
                conn.close()
            return

        if route == "/api/onboarding/complete":
            conn = connect(self.db_path)
            try:
                try:
                    user = current_user(conn, self)
                    payload = read_payload(self)
                    result, token = complete_onboarding(conn, payload, user, self)
                    headers = {"Set-Cookie": session_cookie_header(token, self)} if token else None
                    send_json(self, result, headers=headers)
                except PermissionError as exc:
                    send_api_error(self, str(exc), status=403, code="forbidden", route=route)
                except (json.JSONDecodeError, ValueError, TypeError, AttributeError) as exc:
                    send_api_error(self, str(exc), status=400, code="bad_request", route=route)
                except Exception as exc:
                    self.log_error("Erro interno em %s: %s", route, exc)
                    send_api_error(self, "Erro interno ao concluir onboarding.", status=500, code="internal_error", route=route)
            finally:
                conn.close()
            return

        if route == "/api/sales-order/pdf":
            conn = connect(self.db_path)
            try:
                user = current_user(conn, self)
                if has_users(conn) and not user:
                    send_api_error(self, "Login necessario.", status=401, code="unauthorized", route=route)
                    return
                if not can_access_route(conn, user, route):
                    send_api_error(self, "Sem permissao para este modulo.", status=403, code="forbidden", route=route)
                    return
                try:
                    filename, body = post_sales_order_pdf(conn, read_payload(self))
                    send_binary(self, body, "application/pdf", filename)
                except (json.JSONDecodeError, ValueError, TypeError, AttributeError) as exc:
                    send_api_error(self, str(exc), status=400, code="bad_request", route=route)
                except Exception as exc:
                    self.log_error("Erro interno em %s: %s", route, exc)
                    send_api_error(self, "Erro interno ao gerar pedido de venda.", status=500, code="internal_error", route=route)
            finally:
                conn.close()
            return

        conn = connect(self.db_path)
        try:
            user = current_user(conn, self)
            if has_users(conn) and not user:
                send_api_error(self, "Login necessario.", status=401, code="unauthorized", route=route)
                return
            if not can_access_route(conn, user, route):
                send_api_error(self, "Sem permissao para este modulo.", status=403, code="forbidden", route=route)
                return
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
    parser = argparse.ArgumentParser(description="Serve o app local.")
    parser.add_argument("--tenant", default=os.environ.get("PULSO_TENANT") or "", help="Slug do cliente em data/tenants/<tenant>.")
    parser.add_argument(
        "--db",
        default=os.environ.get("PULSO_DB_PATH") or "",
        help="Caminho do SQLite. Quando omitido, usa o banco do tenant ou o legado.",
    )
    parser.add_argument("--host", default=os.environ.get("PULSO_HOST") or "127.0.0.1")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT") or os.environ.get("PULSO_PORT") or 8010))
    args = parser.parse_args()
    AppHandler.db_path = resolve_db_path(args.db, args.tenant)
    settings = app_public_config()
    app_name = settings["app_name"]
    if not is_loopback_host(args.host) and not (truthy_env("PULSO_ALLOW_NETWORK") or truthy_env("NEXOVAREJO_ALLOW_NETWORK")):
        raise SystemExit(
            f"Por seguranca, o {app_name} inicia apenas em localhost. "
            "Defina PULSO_ALLOW_NETWORK=1 para expor conscientemente na rede local."
        )
    initialize_schema(AppHandler.db_path)
    prewarm_runtime_caches(AppHandler.db_path)
    server = ThreadingHTTPServer((args.host, args.port), AppHandler)
    data_label = AppHandler.db_path.parent if active_tenant() else AppHandler.db_path
    print(f"{app_name} em http://{args.host}:{args.port} dados={data_label}")
    server.serve_forever()


if __name__ == "__main__":
    main()
