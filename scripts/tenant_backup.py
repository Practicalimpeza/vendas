from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = Path(os.environ.get("PULSO_DATA_DIR") or ROOT / "data").expanduser()
DEFAULT_BACKUP_DIR = ROOT / "outputs" / "backups"


def slugify(value: str) -> str:
    cleaned = "".join(char.lower() if char.isalnum() else "_" for char in value.strip())
    return "_".join(part for part in cleaned.split("_") if part)


def timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def tenant_dir(data_dir: Path, tenant: str) -> Path:
    slug = slugify(tenant)
    if not slug:
        raise ValueError("Informe um tenant valido.")
    return data_dir / "tenants" / slug


def assert_inside(base: Path, target: Path) -> None:
    resolved_base = base.resolve()
    resolved_target = target.resolve()
    if resolved_target != resolved_base and resolved_base not in resolved_target.parents:
        raise ValueError(f"Caminho fora da pasta esperada: {target}")


def backup_sqlite_database(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    source_conn = sqlite3.connect(source)
    try:
        target_conn = sqlite3.connect(target)
        try:
            source_conn.backup(target_conn)
        finally:
            target_conn.close()
    finally:
        source_conn.close()


def add_file(zip_file: zipfile.ZipFile, source: Path, archive_path: Path) -> None:
    if source.exists() and source.is_file():
        zip_file.write(source, archive_path.as_posix())


def create_backup(args: argparse.Namespace) -> Path:
    data_dir = Path(args.data_dir or DEFAULT_DATA_DIR).expanduser()
    source_dir = tenant_dir(data_dir, args.tenant)
    if not source_dir.is_dir():
        raise FileNotFoundError(f"Tenant nao encontrado: {source_dir}")

    db_path = source_dir / "database.sqlite3"
    if not db_path.exists() and not args.allow_missing_db:
        raise FileNotFoundError(f"Banco nao encontrado: {db_path}")

    out_dir = Path(args.out_dir or DEFAULT_BACKUP_DIR).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)
    safe_tenant = slugify(args.tenant)
    archive_path = out_dir / f"{safe_tenant}_{timestamp()}.zip"

    manifest = {
        "schema": "nexovarejo.tenant_backup.v1",
        "tenant": safe_tenant,
        "created_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "source": str(source_dir),
        "contains": {
            "database": db_path.exists(),
            "app_config": (source_dir / "app_config.json").exists(),
            "import_reference": (source_dir / "import_reference.json").exists(),
            "assets": (source_dir / "assets").is_dir(),
        },
    }

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        db_backup = tmp_dir / "database.sqlite3"
        if db_path.exists():
            backup_sqlite_database(db_path, db_backup)

        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as zip_file:
            zip_file.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
            base = Path("tenants") / safe_tenant
            if db_backup.exists():
                zip_file.write(db_backup, (base / "database.sqlite3").as_posix())
            add_file(zip_file, source_dir / "app_config.json", base / "app_config.json")
            add_file(zip_file, source_dir / "import_reference.json", base / "import_reference.json")
            assets_dir = source_dir / "assets"
            if assets_dir.is_dir():
                for item in assets_dir.rglob("*"):
                    if item.is_file():
                        zip_file.write(item, (base / item.relative_to(source_dir)).as_posix())

    print(json.dumps({"ok": True, "backup": str(archive_path), "tenant": safe_tenant}, ensure_ascii=False))
    return archive_path


def safe_extract(zip_file: zipfile.ZipFile, target_dir: Path) -> None:
    target_dir.mkdir(parents=True, exist_ok=True)
    for member in zip_file.infolist():
        destination = target_dir / member.filename
        assert_inside(target_dir, destination)
    zip_file.extractall(target_dir)


def read_manifest(extracted_dir: Path) -> dict:
    manifest_path = extracted_dir / "manifest.json"
    if not manifest_path.exists():
        raise ValueError("Backup sem manifest.json.")
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    if payload.get("schema") != "nexovarejo.tenant_backup.v1":
        raise ValueError("Backup com schema desconhecido.")
    return payload


def verify_database(db_path: Path) -> None:
    if not db_path.exists():
        return
    conn = sqlite3.connect(db_path)
    try:
        status = conn.execute("PRAGMA integrity_check").fetchone()[0]
    finally:
        conn.close()
    if status != "ok":
        raise ValueError(f"Banco restaurado falhou no integrity_check: {status}")


def restore_backup(args: argparse.Namespace) -> Path:
    archive_path = Path(args.archive).expanduser()
    if not archive_path.exists():
        raise FileNotFoundError(f"Backup nao encontrado: {archive_path}")
    data_dir = Path(args.data_dir or DEFAULT_DATA_DIR).expanduser()

    with tempfile.TemporaryDirectory() as tmp:
        extracted = Path(tmp)
        with zipfile.ZipFile(archive_path) as zip_file:
            safe_extract(zip_file, extracted)
        manifest = read_manifest(extracted)
        source_tenant = slugify(str(manifest.get("tenant") or ""))
        target_tenant = slugify(args.tenant or source_tenant)
        if not target_tenant:
            raise ValueError("Tenant de destino nao identificado.")
        extracted_tenant = extracted / "tenants" / source_tenant
        if not extracted_tenant.is_dir():
            raise ValueError("Backup sem pasta tenants/<tenant>.")

        destination = tenant_dir(data_dir, target_tenant)
        if destination.exists():
            if not args.replace:
                raise FileExistsError(f"Destino ja existe: {destination}. Use --replace para substituir com backup local.")
            parked = destination.with_name(f"{destination.name}.pre_restore_{timestamp()}")
            shutil.move(str(destination), str(parked))
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(extracted_tenant, destination)
        verify_database(destination / "database.sqlite3")

    print(json.dumps({"ok": True, "restored": str(destination), "tenant": target_tenant}, ensure_ascii=False))
    return destination


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Backup e restauracao de tenants do NexoVarejo.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    backup = subparsers.add_parser("backup", help="Gera um ZIP do tenant.")
    backup.add_argument("--tenant", required=True)
    backup.add_argument("--data-dir", default="")
    backup.add_argument("--out-dir", default="")
    backup.add_argument("--allow-missing-db", action="store_true")
    backup.set_defaults(func=create_backup)

    restore = subparsers.add_parser("restore", help="Restaura um ZIP de tenant.")
    restore.add_argument("--archive", required=True)
    restore.add_argument("--tenant", default="", help="Opcional: restaura com outro slug.")
    restore.add_argument("--data-dir", default="")
    restore.add_argument("--replace", action="store_true")
    restore.set_defaults(func=restore_backup)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
