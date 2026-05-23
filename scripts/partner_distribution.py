from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PROFILE = ROOT / "config" / "distribution" / "default.json"
PARTNER_CONFIG = ROOT / "config" / "partners" / "default.json"
PARTNER_ASSETS = ROOT / "config" / "partners" / "assets"


def slugify(value: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "_" for char in value.strip())
    return "_".join(part for part in cleaned.split("_") if part)


def read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"JSON invalido: {path}")
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def asset_public_path(source: str) -> str:
    if not source:
        return ""
    if source.startswith("/"):
        return source
    source_path = Path(source).expanduser()
    if not source_path.is_absolute():
        source_path = ROOT / source_path
    if not source_path.exists() or not source_path.is_file():
        raise FileNotFoundError(f"Logo do parceiro nao encontrada: {source_path}")
    PARTNER_ASSETS.mkdir(parents=True, exist_ok=True)
    clean_name = source_path.name.replace(" ", "_")
    destination = PARTNER_ASSETS / clean_name
    if source_path.resolve() != destination.resolve():
        shutil.copy2(source_path, destination)
    return f"/partner-assets/{destination.name}"


def partner_config_from_profile(profile: dict[str, Any]) -> dict[str, Any]:
    if profile.get("schema") != "platform.distribution.v1":
        raise ValueError("Perfil de distribuicao precisa usar schema platform.distribution.v1.")
    partner = profile.get("partner") if isinstance(profile.get("partner"), dict) else {}
    license_info = profile.get("license") if isinstance(profile.get("license"), dict) else {}
    distribution = profile.get("distribution") if isinstance(profile.get("distribution"), dict) else {}
    partner_id = slugify(str(partner.get("id") or "")) or "default"
    return {
        "schema": "platform.partner.v1",
        "partner": {
            "id": partner_id,
            "name": str(partner.get("name") or "").strip(),
            "logo_path": asset_public_path(str(partner.get("logo_path") or "").strip()),
            "accent_color": str(partner.get("accent_color") or "").strip() or "#14744b",
        },
        "license": {
            "status": str(license_info.get("status") or "local").strip() or "local",
            "plan": str(license_info.get("plan") or "sem_assinatura").strip() or "sem_assinatura",
            "activation_url": str(license_info.get("activation_url") or "").strip(),
            "offline_grace_days": int(license_info.get("offline_grace_days") or 7),
            "billing_model": str(distribution.get("billing_model") or "per_active_client").strip(),
        },
        "distribution": {
            "package_id": str(distribution.get("package_id") or "").strip() or "local_default",
            "channel": str(distribution.get("channel") or "").strip() or "manual",
            "activation_mode": str(distribution.get("activation_mode") or "").strip() or "per_client_activation",
        },
    }


def apply_profile(profile_path: Path) -> dict[str, Any]:
    profile = read_json(profile_path)
    config = partner_config_from_profile(profile)
    write_json(PARTNER_CONFIG, config)
    return config


def main() -> None:
    parser = argparse.ArgumentParser(description="Aplica perfil de distribuicao do parceiro.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    apply_parser = subparsers.add_parser("apply", help="Aplica um perfil platform.distribution.v1.")
    apply_parser.add_argument("--profile", default=str(DEFAULT_PROFILE), help="Caminho do perfil de distribuicao.")

    show_parser = subparsers.add_parser("show", help="Mostra o parceiro atualmente aplicado.")
    show_parser.add_argument("--config", default=str(PARTNER_CONFIG), help="Caminho da configuracao do parceiro.")

    args = parser.parse_args()
    if args.command == "apply":
        config = apply_profile(Path(args.profile).expanduser())
    else:
        config = read_json(Path(args.config).expanduser())
    print(json.dumps(config, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
