from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from app_config import active_tenant


ROOT = Path(__file__).resolve().parents[1]
PARTNER_CONFIG_PATH = ROOT / "config" / "partners" / "default.json"
LOCAL_STATE_DIR = ROOT / "data" / "local"
INSTALLATION_STATE_PATH = LOCAL_STATE_DIR / "installation.json"
LICENSE_STATE_PATH = LOCAL_STATE_DIR / "license.json"
INSTALLATION_SCHEMA = "platform.installation.v1"
LICENSE_SCHEMA = "platform.license_state.v1"
API_CONTRACT = "local_installation.v1"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def partner_config() -> dict[str, Any]:
    config = read_json(PARTNER_CONFIG_PATH)
    partner = config.get("partner") if isinstance(config.get("partner"), dict) else {}
    license_info = config.get("license") if isinstance(config.get("license"), dict) else {}
    distribution = config.get("distribution") if isinstance(config.get("distribution"), dict) else {}
    return {
        "partner_id": str(partner.get("id") or "default").strip() or "default",
        "partner_name": str(partner.get("name") or "").strip(),
        "package_id": str(distribution.get("package_id") or "local_default").strip() or "local_default",
        "channel": str(distribution.get("channel") or "manual").strip() or "manual",
        "activation_mode": str(distribution.get("activation_mode") or "per_client_activation").strip()
        or "per_client_activation",
        "billing_model": str(license_info.get("billing_model") or "per_active_client").strip() or "per_active_client",
        "plan": str(license_info.get("plan") or "sem_assinatura").strip() or "sem_assinatura",
        "activation_url": str(license_info.get("activation_url") or "").strip(),
        "offline_grace_days": int(license_info.get("offline_grace_days") or 7),
    }


def ensure_installation_state() -> dict[str, Any]:
    partner = partner_config()
    state = read_json(INSTALLATION_STATE_PATH)
    if state.get("schema") != INSTALLATION_SCHEMA or not state.get("installation_id"):
        state = {
            "schema": INSTALLATION_SCHEMA,
            "installation_id": f"inst_{uuid4().hex}",
            "created_at": now_iso(),
        }
    state.update(
        {
            "partner_id": partner["partner_id"],
            "package_id": partner["package_id"],
            "channel": partner["channel"],
            "activation_mode": partner["activation_mode"],
            "billing_model": partner["billing_model"],
            "active_tenant": active_tenant(),
            "updated_at": now_iso(),
        }
    )
    write_json(INSTALLATION_STATE_PATH, state)
    return state


def local_license_state() -> dict[str, Any]:
    partner = partner_config()
    state = read_json(LICENSE_STATE_PATH)
    if state.get("schema") != LICENSE_SCHEMA:
        state = {}
    return {
        "schema": LICENSE_SCHEMA,
        "status": str(state.get("status") or "not_activated").strip() or "not_activated",
        "plan": str(state.get("plan") or partner["plan"]).strip() or partner["plan"],
        "client_status": str(state.get("client_status") or "pending_activation").strip() or "pending_activation",
        "checked_at": str(state.get("checked_at") or "").strip(),
        "valid_until": str(state.get("valid_until") or "").strip(),
        "activation_url": str(state.get("activation_url") or partner["activation_url"]).strip(),
        "offline_grace_days": int(state.get("offline_grace_days") or partner["offline_grace_days"]),
        "billing_model": str(state.get("billing_model") or partner["billing_model"]).strip() or partner["billing_model"],
        "reason": str(state.get("reason") or "Instalacao ainda nao ativada.").strip(),
    }


def api_installation_state() -> dict[str, Any]:
    installation = ensure_installation_state()
    license_state = local_license_state()
    return {
        "contract": API_CONTRACT,
        "installation": installation,
        "license": license_state,
    }

