from __future__ import annotations

import re
import unicodedata


def normalize(value: str) -> str:
    text = unicodedata.normalize("NFKD", value or "")
    text = text.encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "_", text.strip().lower())
    return text.strip("_")


def make_supplier_id(org: str, name: str) -> str:
    return f"{org}:supplier:{normalize(name) or 'sem_fornecedor'}"


def clean_phone(value: str) -> str:
    phone = re.sub(r"\s+", " ", (value or "").strip())
    return phone[:40]


CUSTOMER_QUALIFIER_SUFFIXES = (
    "industria",
    "industrias",
    "comercio",
    "matriz",
    "filial",
    "agroindustria",
    "agroindustrial",
    "agropecuaria",
    "agricola",
    "fazenda",
    "faz",
)


def canonical_customer_key(name: str) -> str:
    """Compute a stable grouping key for customer-name de-duplication.

    Splits the name on " - " (or " — ") and keeps only the first segment, then
    strips trailing qualifier suffixes that are commonly appended to the same
    legal entity (e.g. "INDUSTRIA", "MATRIZ"). Returns a normalized token form.

    Examples
    --------
    >>> canonical_customer_key("ARMANDO BIANCHESSI - EM RECUPERACAO JUDICIAL")
    'armando_bianchessi'
    >>> canonical_customer_key("IACO AGRICOLA S/A INDUSTRIA")
    'iaco_agricola_s_a'
    >>> canonical_customer_key("JOSE SILVA JR")
    'jose_silva_jr'
    """
    if not name:
        return ""
    head = re.split(r"\s+[\-–—]\s+", name, maxsplit=1)[0]
    key = normalize(head)
    while True:
        changed = False
        for suffix in CUSTOMER_QUALIFIER_SUFFIXES:
            tail = f"_{suffix}"
            if key.endswith(tail) and len(key) > len(tail) + 2:
                key = key[: -len(tail)]
                changed = True
                break
        if not changed:
            break
    return key.strip("_")
