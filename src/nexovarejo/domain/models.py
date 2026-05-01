from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal


@dataclass(frozen=True)
class Organization:
    id: str
    name: str
    document: str = ""
    created_at: datetime | None = None


@dataclass(frozen=True)
class Store:
    id: str
    organization_id: str
    name: str
    document: str = ""
    city: str = ""
    state: str = ""


@dataclass(frozen=True)
class Supplier:
    id: str
    organization_id: str
    name: str
    document: str = ""
    minimum_order_value: Decimal = Decimal("0")
    average_lead_time_days: int | None = None
    active: bool = True


@dataclass(frozen=True)
class Product:
    id: str
    organization_id: str
    source_code: str
    name: str
    barcode: str = ""
    brand: str = ""
    category_level_1: str = ""
    category_level_2: str = ""
    unit: str = "UN"
    active: bool = True


@dataclass(frozen=True)
class Customer:
    id: str
    organization_id: str
    source_code: str
    name: str
    document: str = ""


@dataclass(frozen=True)
class InventorySnapshot:
    organization_id: str
    store_id: str
    product_id: str
    snapshot_date: date
    quantity_on_hand: Decimal
    average_cost: Decimal = Decimal("0")
    sale_price: Decimal = Decimal("0")


@dataclass(frozen=True)
class SaleLine:
    organization_id: str
    store_id: str
    product_id: str
    customer_id: str | None
    sold_at: date
    quantity: Decimal
    gross_amount: Decimal
    net_amount: Decimal | None = None
