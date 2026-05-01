from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from nexovarejo.services import executive_summary, import_practica_directory
from nexovarejo.storage import connect
from nexovarejo.storage.sqlite import DEFAULT_DB_PATH


def main() -> int:
    parser = argparse.ArgumentParser(description="Importa uma pasta CSV da Practica para o NexoVarejo.")
    parser.add_argument("source_dir", type=Path, help="Pasta com CSVs exportados do ERP/Excel.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH, help="Caminho do SQLite.")
    parser.add_argument("--organization-id", default="org_practica")
    parser.add_argument("--store-id", default="loja_1")
    args = parser.parse_args()

    result = import_practica_directory(
        args.source_dir,
        database_path=args.db,
        organization_id=args.organization_id,
        store_id=args.store_id,
    )
    conn = connect(args.db)
    try:
        summary = executive_summary(conn, args.organization_id, args.store_id)
    finally:
        conn.close()

    print(json.dumps({
        "database_path": str(result.database_path),
        "import": asdict(result.persist_result),
        "summary": summary,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
