from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any


def normalize_header(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_text = re.sub(r"[^a-zA-Z0-9]+", "_", ascii_text.strip().lower())
    return ascii_text.strip("_")


@dataclass(frozen=True)
class ColumnMapping:
    source: str
    target: str
    required: bool = False


@dataclass(frozen=True)
class ImportIssue:
    severity: str
    code: str
    message: str
    row_number: int | None = None
    field: str = ""


@dataclass
class CanonicalBatch:
    organization_id: str
    store_id: str
    source_system: str
    products: list[dict[str, Any]] = field(default_factory=list)
    inventory: list[dict[str, Any]] = field(default_factory=list)
    sales: list[dict[str, Any]] = field(default_factory=list)
    service_sales: list[dict[str, Any]] = field(default_factory=list)
    suppliers: list[dict[str, Any]] = field(default_factory=list)
    customers: list[dict[str, Any]] = field(default_factory=list)
    issues: list[ImportIssue] = field(default_factory=list)

    @property
    def has_errors(self) -> bool:
        return any(issue.severity == "error" for issue in self.issues)
