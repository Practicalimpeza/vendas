from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import unicodedata
from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie
from uuid import uuid4

from app_config import default_company_name, default_organization_slug
from db_helpers import default_organization_id, scalar_text


SESSION_COOKIE = "pg_session"
SESSION_DAYS = 14
PBKDF2_ITERATIONS = 210_000
MIN_PASSWORD_LENGTH = 6

MODULES = [
    {"key": "dashboard", "label": "Mapa Geral", "route": "/painel"},
    {"key": "quotes", "label": "Compras", "route": "/compras"},
    {"key": "stock", "label": "Estoque", "route": "/reposicao"},
    {"key": "products", "label": "Produtos", "route": "/produtos"},
    {"key": "customers", "label": "Clientes", "route": "/clientes"},
    {"key": "whatsapp", "label": "WhatsApp", "route": "/whatsapp"},
    {"key": "opportunities", "label": "Vendas", "route": "/oportunidades"},
    {"key": "suppliers", "label": "Fornecedores", "route": "/fornecedores"},
    {"key": "pricing", "label": "Margem", "route": "/precos"},
    {"key": "actions", "label": "Alertas/Tarefas", "route": "/hoje"},
    {"key": "implementation", "label": "Implantacao", "route": "/implantacao"},
    {"key": "imports", "label": "Importacoes", "route": "/importacao"},
    {"key": "engine", "label": "Regras", "route": "/motor"},
    {"key": "distribution", "label": "Distribuicao", "route": "/distribuicao"},
    {"key": "admin", "label": "Administracao", "route": "/admin"},
]

ROUTE_MODULES = {
    "/api/summary": "dashboard",
    "/api/intelligence/maturity": "dashboard",
    "/api/nexo/skills": "engine",
    "/api/products/top": "products",
    "/api/product": "products",
    "/api/products/mix-decision": "products",
    "/api/products/mix-decision-bulk": "products",
    "/api/products/purchase-settings": "products",
    "/api/products/supplier-reference": "products",
    "/api/products/stock": "stock",
    "/api/replenishment": "stock",
    "/api/replenishment-v2": "stock",
    "/api/replenishment-v2/compare": "stock",
    "/api/commercial/intelligence": "opportunities",
    "/api/customers/top": "customers",
    "/api/customer/mix": "customers",
    "/api/services/top": "customers",
    "/api/imports": "imports",
    "/api/erp/import-preview": "imports",
    "/api/erp/import-commit": "imports",
    "/api/imports/reference-folder": "imports",
    "/api/imports/refresh-local": "imports",
    "/api/links/inspect": "imports",
    "/api/links/preview": "imports",
    "/api/links/commit": "imports",
    "/api/company-profile": "admin",
    "/api/suppliers/brands": "suppliers",
    "/api/suppliers/brand": "suppliers",
    "/api/suppliers/profile": "suppliers",
    "/api/pricing": "pricing",
    "/api/pricing/product": "pricing",
    "/api/quotes/draft": "quotes",
    "/api/supplier-workbench/suppliers": "quotes",
    "/api/supplier-workbench": "quotes",
    "/api/quotes": "quotes",
    "/api/quote": "quotes",
    "/api/quote/pdf": "quotes",
    "/api/quote-item/upsert": "quotes",
    "/api/quotes/create": "quotes",
    "/api/quotes/status": "quotes",
    "/api/quotes/response": "quotes",
    "/api/purchase-orders": "quotes",
    "/api/purchase-order": "quotes",
    "/api/purchase-orders/update": "quotes",
    "/api/purchase-orders/confirm": "quotes",
    "/api/purchase-orders/discard": "quotes",
    "/api/purchase-orders/receive": "quotes",
    "/api/actions/today": "actions",
    "/api/actions/status": "actions",
    "/api/quick-actions": "actions",
    "/api/operational-decisions": "actions",
    "/api/whatsapp/conversations": "whatsapp",
    "/api/whatsapp/conversation": "whatsapp",
    "/api/whatsapp/conversations/update": "whatsapp",
    "/api/whatsapp/messages/send": "whatsapp",
    "/api/whatsapp/agents/upsert": "whatsapp",
    "/api/admin/users": "admin",
    "/api/admin/users/upsert": "admin",
}


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _expiry() -> str:
    return (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).strftime("%Y-%m-%d %H:%M:%S")


def _normalize_login(value: object) -> str:
    return scalar_text(value).lower()


def _normalize_email(value: object) -> str:
    return scalar_text(value).lower()


def _login_from_identity(*values: object) -> str:
    for value in values:
        text = scalar_text(value)
        if not text:
            continue
        if "@" in text:
            text = text.split("@", 1)[0]
        normalized = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
        normalized = re.sub(r"[^a-zA-Z0-9._-]+", ".", normalized.lower()).strip(".-_")
        if normalized:
            return normalized[:80]
    return ""


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    password = str(password or "")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PBKDF2_ITERATIONS,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations_text, salt_text, digest_text = str(password_hash or "").split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_text)
        salt = base64.b64decode(salt_text.encode("ascii"))
        expected = base64.b64decode(digest_text.encode("ascii"))
    except (ValueError, TypeError):
        return False
    digest = hashlib.pbkdf2_hmac("sha256", str(password or "").encode("utf-8"), salt, iterations)
    return hmac.compare_digest(digest, expected)


def user_count(conn: sqlite3.Connection) -> int:
    return int(conn.execute("SELECT COUNT(*) AS total FROM app_users").fetchone()["total"] or 0)


def has_users(conn: sqlite3.Connection) -> bool:
    return user_count(conn) > 0


def _module_keys() -> list[str]:
    return [item["key"] for item in MODULES]


def _default_permissions(role: str) -> list[str]:
    keys = _module_keys()
    if role == "admin":
        return keys
    return [key for key in keys if key not in {"admin", "imports", "engine"}]


def _permission_rows(conn: sqlite3.Connection, user_id: str) -> list[str]:
    rows = conn.execute(
        """
        SELECT module_key
        FROM app_user_module_permissions
        WHERE user_id = ? AND can_access = 1
        ORDER BY module_key
        """,
        (user_id,),
    ).fetchall()
    return [row["module_key"] for row in rows]


def _user_payload(conn: sqlite3.Connection, row: sqlite3.Row | dict) -> dict:
    role = row["role"] or "member"
    permissions = _module_keys() if role == "admin" else _permission_rows(conn, row["id"])
    if not permissions:
        permissions = _default_permissions(role)
    return {
        "id": row["id"],
        "organization_id": row["organization_id"],
        "name": row["name"],
        "login_name": row["login_name"],
        "email": row["email"],
        "role": role,
        "active": bool(row["active"]),
        "permissions": permissions,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "last_login_at": row["last_login_at"],
    }


def _find_user_by_login(conn: sqlite3.Connection, organization_id: str, login_name: str) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT *
        FROM app_users
        WHERE organization_id = ? AND login_name = ?
        """,
        (organization_id, _normalize_login(login_name)),
    ).fetchone()


def _find_login_any_org(conn: sqlite3.Connection, login_name: str) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT *
        FROM app_users
        WHERE login_name = ?
        ORDER BY active DESC, created_at
        LIMIT 1
        """,
        (_normalize_login(login_name),),
    ).fetchone()


def _find_user_by_id(conn: sqlite3.Connection, user_id: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM app_users WHERE id = ?", (user_id,)).fetchone()


def _set_permissions(conn: sqlite3.Connection, user_id: str, permissions: list[str]) -> None:
    allowed = set(_module_keys())
    normalized = [key for key in dict.fromkeys(permissions) if key in allowed]
    conn.execute("DELETE FROM app_user_module_permissions WHERE user_id = ?", (user_id,))
    conn.executemany(
        """
        INSERT INTO app_user_module_permissions (user_id, module_key, can_access)
        VALUES (?, ?, 1)
        """,
        [(user_id, key) for key in normalized],
    )


def _cookie_value(handler: object, name: str) -> str:
    cookie = SimpleCookie()
    cookie.load(getattr(handler, "headers", {}).get("Cookie", "") or "")
    morsel = cookie.get(name)
    return morsel.value if morsel else ""


def session_cookie_header(token: str, handler: object) -> str:
    secure = (getattr(handler, "headers", {}).get("X-Forwarded-Proto") or "").lower() == "https"
    parts = [
        f"{SESSION_COOKIE}={token}",
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        f"Max-Age={SESSION_DAYS * 24 * 60 * 60}",
    ]
    if secure:
        parts.append("Secure")
    return "; ".join(parts)


def clear_session_cookie_header() -> str:
    return f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"


def create_session(conn: sqlite3.Connection, user_id: str, handler: object | None = None) -> str:
    token = secrets.token_urlsafe(32)
    conn.execute(
        """
        INSERT INTO app_sessions (id, user_id, token_hash, expires_at, user_agent)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            f"sess:{uuid4().hex}",
            user_id,
            _hash_token(token),
            _expiry(),
            scalar_text(getattr(handler, "headers", {}).get("User-Agent") if handler else ""),
        ),
    )
    conn.execute("UPDATE app_users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (user_id,))
    return token


def current_user(conn: sqlite3.Connection, handler: object) -> dict:
    token = _cookie_value(handler, SESSION_COOKIE)
    if not token:
        return {}
    row = conn.execute(
        """
        SELECT u.*
        FROM app_sessions s
        JOIN app_users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.active = 1
        """,
        (_hash_token(token),),
    ).fetchone()
    if not row:
        return {}
    conn.execute("UPDATE app_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?", (_hash_token(token),))
    return _user_payload(conn, row)


def route_module(route: str) -> str:
    if route.startswith("/api/admin/"):
        return "admin"
    return ROUTE_MODULES.get(route, "dashboard")


def can_access_route(conn: sqlite3.Connection, user: dict, route: str) -> bool:
    if not has_users(conn):
        return True
    if not user:
        return False
    if user.get("role") == "admin":
        return True
    module_key = route_module(route)
    return module_key in set(user.get("permissions") or [])


def require_admin(user: dict) -> None:
    if user.get("role") != "admin":
        raise PermissionError("Apenas administradores podem acessar esta area.")


def api_auth_me(conn: sqlite3.Connection, handler: object) -> dict:
    user = current_user(conn, handler)
    return {
        "authenticated": bool(user),
        "needs_bootstrap": not has_users(conn),
        "user": user or None,
        "modules": MODULES,
    }


def create_bootstrap_admin(conn: sqlite3.Connection, payload: dict, handler: object) -> tuple[dict, str]:
    if has_users(conn):
        raise ValueError("O administrador inicial ja foi criado.")
    name = scalar_text(payload.get("name")) or "Administrador"
    login_name = _normalize_login(payload.get("login_name") or payload.get("login") or payload.get("email"))
    email = _normalize_email(payload.get("email"))
    password = str(payload.get("password") or "")
    if not login_name:
        raise ValueError("Informe um login de acesso.")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError("A senha precisa ter pelo menos 6 caracteres.")
    organization_id = scalar_text(payload.get("organization_id")) or default_organization_id(conn)
    if not organization_id:
        organization_id = default_organization_slug()
        conn.execute(
            """
            INSERT OR IGNORE INTO organizations (id, name)
            VALUES (?, ?)
            """,
            (organization_id, default_company_name()),
        )
    user_id = f"{organization_id}:user:{uuid4().hex[:12]}"
    conn.execute(
        """
        INSERT INTO app_users (id, organization_id, name, login_name, email, password_hash, role, active)
        VALUES (?, ?, ?, ?, ?, ?, 'admin', 1)
        """,
        (user_id, organization_id, name, login_name, email, hash_password(password)),
    )
    _set_permissions(conn, user_id, _default_permissions("admin"))
    token = create_session(conn, user_id, handler)
    conn.commit()
    user = _user_payload(conn, _find_user_by_id(conn, user_id))
    return {"ok": True, "user": user, "modules": MODULES}, token


def login(conn: sqlite3.Connection, payload: dict, handler: object) -> tuple[dict, str]:
    login_name = _normalize_login(payload.get("login_name") or payload.get("login") or payload.get("email"))
    password = str(payload.get("password") or "")
    user_row = _find_login_any_org(conn, login_name)
    if not user_row or not user_row["active"] or not verify_password(password, user_row["password_hash"]):
        raise ValueError("Login ou senha invalidos.")
    token = create_session(conn, user_row["id"], handler)
    conn.commit()
    return {"ok": True, "user": _user_payload(conn, user_row), "modules": MODULES}, token


def logout(conn: sqlite3.Connection, handler: object) -> dict:
    token = _cookie_value(handler, SESSION_COOKIE)
    if token:
        conn.execute("DELETE FROM app_sessions WHERE token_hash = ?", (_hash_token(token),))
        conn.commit()
    return {"ok": True}


def list_users(conn: sqlite3.Connection, user: dict) -> dict:
    require_admin(user)
    users = [
        _user_payload(conn, row)
        for row in conn.execute(
            """
            SELECT *
            FROM app_users
            WHERE organization_id = ?
            ORDER BY active DESC, role = 'admin' DESC, name
            """,
            (user["organization_id"],),
        ).fetchall()
    ]
    return {"contract": "admin_users.v1", "modules": MODULES, "users": users}


def _active_admin_count(conn: sqlite3.Connection, organization_id: str, exclude_user_id: str = "") -> int:
    row = conn.execute(
        """
        SELECT COUNT(*) AS total
        FROM app_users
        WHERE organization_id = ? AND role = 'admin' AND active = 1 AND id <> ?
        """,
        (organization_id, exclude_user_id),
    ).fetchone()
    return int(row["total"] or 0)


def upsert_user(conn: sqlite3.Connection, payload: dict, current: dict) -> dict:
    require_admin(current)
    organization_id = current["organization_id"]
    user_id = scalar_text(payload.get("id"))
    name = scalar_text(payload.get("name"))
    login_name = _normalize_login(payload.get("login_name") or payload.get("login"))
    email = _normalize_email(payload.get("email"))
    role = scalar_text(payload.get("role")) or "member"
    role = "admin" if role == "admin" else "member"
    active = 1 if payload.get("active", True) is not False else 0
    permissions = payload.get("permissions") if isinstance(payload.get("permissions"), list) else _default_permissions(role)
    password = str(payload.get("password") or "")
    if not name:
        raise ValueError("Informe o nome do usuario.")
    existing = _find_user_by_id(conn, user_id) if user_id else None
    if existing and existing["organization_id"] != organization_id:
        raise ValueError("Usuario pertence a outra empresa.")
    if not login_name and existing:
        login_name = existing["login_name"]
    if not login_name:
        login_name = _login_from_identity(email, name)
    if not login_name:
        raise ValueError("Informe o nome ou o login do usuario.")
    existing_login = _find_login_any_org(conn, login_name)
    if existing_login and existing_login["id"] != user_id:
        raise ValueError("Ja existe um usuario com este login.")
    if email and "@" not in email:
        raise ValueError("Informe um e-mail valido ou deixe em branco.")
    if existing and existing["role"] == "admin" and (role != "admin" or not active):
        if _active_admin_count(conn, organization_id, existing["id"]) <= 0:
            raise ValueError("Mantenha pelo menos um administrador ativo.")
    if existing:
        fields = [name, login_name, email, role, active, user_id]
        conn.execute(
            """
            UPDATE app_users
            SET name = ?, login_name = ?, email = ?, role = ?, active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            tuple(fields),
        )
        if password:
            if len(password) < MIN_PASSWORD_LENGTH:
                raise ValueError("A senha precisa ter pelo menos 6 caracteres.")
            conn.execute(
                "UPDATE app_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (hash_password(password), user_id),
            )
    else:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise ValueError("A senha precisa ter pelo menos 6 caracteres.")
        user_id = f"{organization_id}:user:{uuid4().hex[:12]}"
        conn.execute(
            """
            INSERT INTO app_users (id, organization_id, name, login_name, email, password_hash, role, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, organization_id, name, login_name, email, hash_password(password), role, active),
        )
    _set_permissions(conn, user_id, _default_permissions("admin") if role == "admin" else permissions)
    conn.commit()
    return list_users(conn, current)
