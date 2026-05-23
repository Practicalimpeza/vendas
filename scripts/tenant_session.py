from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LAST_CLIENT_TENANT_PATH = ROOT / "data" / "local" / "launcher" / "last_client_tenant.json"


def _slug(value: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "_" for char in str(value or "").strip())
    return "_".join(part for part in cleaned.split("_") if part)


def read_last_client_tenant() -> str:
    try:
        payload = json.loads(LAST_CLIENT_TENANT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ""
    if not isinstance(payload, dict):
        return ""
    return _slug(str(payload.get("tenant") or ""))


def remember_client_tenant(tenant: str) -> None:
    tenant = _slug(tenant)
    if not tenant:
        return
    LAST_CLIENT_TENANT_PATH.parent.mkdir(parents=True, exist_ok=True)
    LAST_CLIENT_TENANT_PATH.write_text(
        json.dumps(
            {
                "tenant": tenant,
                "updated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def clear_client_tenant(tenant: str = "") -> None:
    current = read_last_client_tenant()
    tenant = _slug(tenant)
    if tenant and current and tenant != current:
        return
    try:
        LAST_CLIENT_TENANT_PATH.unlink()
    except FileNotFoundError:
        return
