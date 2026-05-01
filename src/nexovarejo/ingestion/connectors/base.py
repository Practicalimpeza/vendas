from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from nexovarejo.ingestion.contracts import CanonicalBatch


class ERPConnector(ABC):
    """Contrato para transformar uma exportacao de ERP no modelo canonico."""

    source_system: str

    @abstractmethod
    def load(self, source_dir: Path, *, organization_id: str, store_id: str) -> CanonicalBatch:
        raise NotImplementedError
