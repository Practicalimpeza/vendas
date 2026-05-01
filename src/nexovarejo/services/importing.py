from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from nexovarejo.ingestion.connectors import PracticaCsvConnector
from nexovarejo.storage import PersistResult, connect, initialize_database, persist_batch


@dataclass(frozen=True)
class ImportPracticaResult:
    database_path: Path
    persist_result: PersistResult


def import_practica_directory(
    source_dir: Path,
    *,
    database_path: Path,
    organization_id: str,
    store_id: str,
    import_batch_id: str | None = None,
) -> ImportPracticaResult:
    initialize_database(database_path)
    batch = PracticaCsvConnector().load(
        source_dir,
        organization_id=organization_id,
        store_id=store_id,
    )
    conn = connect(database_path)
    try:
        persist_result = persist_batch(conn, batch, import_batch_id=import_batch_id)
    finally:
        conn.close()
    return ImportPracticaResult(database_path=database_path, persist_result=persist_result)
