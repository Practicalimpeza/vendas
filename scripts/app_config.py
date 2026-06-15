from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BASE_CONFIG_PATH = ROOT / "config" / "white_label" / "default.json"
DATA_DIR = Path(os.environ.get("PULSO_DATA_DIR") or ROOT / "data").expanduser()
LEGACY_DB_PATH = DATA_DIR / "nexovarejo.db"
LEGACY_LOCAL_CONFIG_PATH = DATA_DIR / "local" / "app_config.json"
TENANTS_DIR = DATA_DIR / "tenants"
CONFIG_SCHEMA = "pulso.white_label.v1"
LEGACY_CONFIG_SCHEMAS = {"nexovarejo.white_label.v1"}
DEFAULT_APP_NAME = "Sistema"
DEFAULT_LOGO_PATH = ""
_ACTIVE_TENANT = ""

ENV_OVERRIDES = {
    ("public", "app_name"): ("PULSO_APP_NAME", "NEXOVAREJO_APP_NAME"),
    ("public", "app_subtitle"): ("PULSO_APP_SUBTITLE", "NEXOVAREJO_APP_SUBTITLE"),
    ("public", "logo_path"): ("PULSO_LOGO_PATH", "NEXOVAREJO_LOGO_PATH"),
    ("defaults", "organization_id"): ("PULSO_DEFAULT_ORG_ID", "NEXOVAREJO_DEFAULT_ORG_ID"),
    ("defaults", "company_name"): ("PULSO_DEFAULT_COMPANY_NAME", "NEXOVAREJO_DEFAULT_COMPANY_NAME"),
    ("defaults", "imported_company_name"): ("PULSO_IMPORTED_COMPANY_NAME", "NEXOVAREJO_IMPORTED_COMPANY_NAME"),
    ("defaults", "store_name"): ("PULSO_DEFAULT_STORE_NAME", "NEXOVAREJO_DEFAULT_STORE_NAME"),
    ("defaults", "country"): ("PULSO_DEFAULT_COUNTRY", "NEXOVAREJO_DEFAULT_COUNTRY"),
}


def _slug(value: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "_" for char in value.strip())
    return "_".join(part for part in cleaned.split("_") if part)


def set_active_tenant(tenant: str | None) -> None:
    global _ACTIVE_TENANT
    _ACTIVE_TENANT = _slug(tenant or os.environ.get("PULSO_TENANT") or os.environ.get("NEXOVAREJO_TENANT") or "")


def active_tenant() -> str:
    if not _ACTIVE_TENANT:
        set_active_tenant("")
    return _ACTIVE_TENANT


def tenant_dir(tenant: str | None = None) -> Path:
    slug = _slug(tenant or active_tenant())
    if not slug:
        raise ValueError("Tenant nao informado.")
    return TENANTS_DIR / slug


def tenant_db_path(tenant: str | None = None) -> Path:
    return tenant_dir(tenant) / "database.sqlite3"


def tenant_config_path(tenant: str | None = None) -> Path:
    return tenant_dir(tenant) / "app_config.json"


def tenant_import_config_path(tenant: str | None = None) -> Path:
    return tenant_dir(tenant) / "import_reference.json"


def tenant_assets_dir(tenant: str | None = None) -> Path:
    return tenant_dir(tenant) / "assets"


def local_assets_dir() -> Path:
    return DATA_DIR / "local" / "assets"


def local_config_path() -> Path:
    tenant = active_tenant()
    return tenant_config_path(tenant) if tenant else LEGACY_LOCAL_CONFIG_PATH


def import_config_path() -> Path:
    tenant = active_tenant()
    return tenant_import_config_path(tenant) if tenant else DATA_DIR / "import_reference.json"


def asset_storage_dir() -> Path:
    tenant = active_tenant()
    return tenant_assets_dir(tenant) if tenant else local_assets_dir()


def asset_public_path(file_name: str) -> str:
    clean = Path(file_name).name
    tenant = active_tenant()
    if tenant:
        return f"/tenant-assets/{tenant}/{clean}"
    return f"/local-assets/{clean}"


def resolve_public_asset_path(route: str) -> Path | None:
    parts = [part for part in route.strip("/").split("/") if part]
    if len(parts) == 2 and parts[0] == "local-assets":
        return local_assets_dir() / Path(parts[1]).name
    if len(parts) == 3 and parts[0] == "tenant-assets":
        tenant = _slug(parts[1])
        if not tenant or tenant != active_tenant():
            return None
        return tenant_assets_dir(tenant) / Path(parts[2]).name
    return None


def default_db_path() -> Path:
    tenant = active_tenant()
    return tenant_db_path(tenant) if tenant else LEGACY_DB_PATH


def resolve_db_path(db: str | None = None, tenant: str | None = None) -> Path:
    set_active_tenant(tenant)
    if db:
        return Path(db).expanduser()
    return default_db_path()


def is_default_database_path(db_file: str | Path) -> bool:
    try:
        return Path(db_file).resolve() == default_db_path().resolve()
    except OSError:
        return False


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as file:
        payload = json.load(file)
    if not isinstance(payload, dict):
        raise ValueError(f"Configuracao white-label invalida: {path}")
    schema = str(payload.get("schema") or "").strip()
    if schema and schema != CONFIG_SCHEMA and schema not in LEGACY_CONFIG_SCHEMAS:
        raise ValueError(f"Schema white-label desconhecido em {path}: {schema}")
    return payload


def _merge_config(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge_config(merged[key], value)
        else:
            merged[key] = value
    return merged


def _configured_paths() -> list[Path]:
    paths = [BASE_CONFIG_PATH]
    tenant = active_tenant()
    if not tenant:
        env_path = os.environ.get("PULSO_CONFIG", "").strip() or os.environ.get("NEXOVAREJO_CONFIG", "").strip()
        if env_path:
            candidate = Path(env_path).expanduser()
            paths.append(candidate if candidate.is_absolute() else ROOT / candidate)
    paths.append(local_config_path())
    return paths


def white_label_config() -> dict[str, Any]:
    config: dict[str, Any] = {"schema": CONFIG_SCHEMA}
    for path in _configured_paths():
        config = _merge_config(config, _read_json(path))
    config.setdefault("schema", CONFIG_SCHEMA)
    config.setdefault("public", {})
    config.setdefault("defaults", {})
    if not active_tenant():
        for (section, key), env_names in ENV_OVERRIDES.items():
            for env_name in env_names:
                value = os.environ.get(env_name, "").strip()
                if value:
                    config.setdefault(section, {})[key] = value
                    break
    return config


def _config_text(section: str, key: str, default: str) -> str:
    value = white_label_config().get(section, {}).get(key, "")
    return str(value or "").strip() or default


def app_public_config() -> dict:
    return {
        "schema": CONFIG_SCHEMA,
        "app_name": _config_text("public", "app_name", DEFAULT_APP_NAME),
        "app_subtitle": _config_text("public", "app_subtitle", "Mesa de operacao"),
        "logo_path": _config_text("public", "logo_path", DEFAULT_LOGO_PATH),
        "tenant": active_tenant(),
    }


def update_public_logo_path(logo_path: str) -> None:
    clean_logo = str(logo_path or "").strip()
    if not clean_logo:
        return
    path = local_config_path()
    config = _read_json(path)
    config.setdefault("schema", CONFIG_SCHEMA)
    public = config.setdefault("public", {})
    if not isinstance(public, dict):
        public = {}
        config["public"] = public
    public["logo_path"] = clean_logo
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def app_name() -> str:
    return app_public_config()["app_name"]


def default_organization_slug() -> str:
    return _config_text("defaults", "organization_id", "org_default")


def default_company_name() -> str:
    return _config_text("defaults", "company_name", "Empresa")


def imported_company_name() -> str:
    return _config_text("defaults", "imported_company_name", "Empresa importada")


def default_store_name() -> str:
    return _config_text("defaults", "store_name", "Loja principal")


def default_country() -> str:
    return _config_text("defaults", "country", "Brasil")


def default_logo_path() -> str:
    return app_public_config()["logo_path"]
