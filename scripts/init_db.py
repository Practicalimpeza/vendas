from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from nexovarejo.storage import initialize_database


if __name__ == "__main__":
    db_path = initialize_database()
    print(f"Banco criado/atualizado em: {db_path}")
