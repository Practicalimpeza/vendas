from __future__ import annotations

import sqlite3
from datetime import date, timedelta
from pathlib import Path

from replenishment_v2 import api_replenishment_v2
from schema_upgrades import ensure_schema_upgrades


ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "schema" / "canonical.sql"
ORG_ID = "org_scenario"
STORE_ID = "store_scenario"
REF = date(2026, 5, 13)


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def day(days_ago: int) -> str:
    return (REF - timedelta(days=days_ago)).isoformat()


def open_memory_db() -> sqlite3.Connection:
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    ensure_schema_upgrades(conn)
    conn.execute("INSERT INTO organizations (id, name) VALUES (?, ?)", (ORG_ID, "Loja Cenarios"))
    conn.execute("INSERT INTO stores (id, organization_id, name) VALUES (?, ?, ?)", (STORE_ID, ORG_ID, "Principal"))
    return conn


def add_supplier(
    conn: sqlite3.Connection,
    code: str,
    *,
    minimum_order_value: float = 0.0,
    lead_time_days: int | None = None,
    review_cycle_days: int | None = None,
) -> str:
    supplier_id = f"{ORG_ID}:supplier:{code}"
    conn.execute(
        """
        INSERT INTO suppliers
            (id, organization_id, name, normalized_name, minimum_order_value, average_lead_time_days, order_review_cycle_days)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (supplier_id, ORG_ID, code.upper(), code, minimum_order_value, lead_time_days, review_cycle_days),
    )
    return supplier_id


def add_brand(conn: sqlite3.Connection, code: str, supplier_id: str) -> str:
    brand_id = f"{ORG_ID}:brand:{code}"
    conn.execute(
        "INSERT INTO brands (id, organization_id, name, normalized_name) VALUES (?, ?, ?, ?)",
        (brand_id, ORG_ID, code.upper(), code),
    )
    conn.execute(
        "INSERT INTO brand_supplier_rules (organization_id, brand_id, supplier_id, notes) VALUES (?, ?, ?, ?)",
        (ORG_ID, brand_id, supplier_id, "Regra sintetica de cenario."),
    )
    return brand_id


def add_product(
    conn: sqlite3.Connection,
    code: str,
    *,
    brand_id: str,
    package_size: float = 1.0,
    stock: float = 0.0,
    cost: float = 10.0,
    price: float = 20.0,
) -> str:
    product_id = f"{ORG_ID}:product:{code}"
    conn.execute(
        """
        INSERT INTO products (id, organization_id, source_code, name, normalized_name, unit, brand_id)
        VALUES (?, ?, ?, ?, ?, 'UN', ?)
        """,
        (product_id, ORG_ID, code, f"Produto {code}", f"produto_{code.lower()}", brand_id),
    )
    conn.execute(
        """
        INSERT INTO product_settings (organization_id, product_id, package_size, target_coverage_days)
        VALUES (?, ?, ?, 45)
        """,
        (ORG_ID, product_id, package_size),
    )
    conn.execute(
        """
        INSERT INTO inventory_snapshots (organization_id, store_id, product_id, snapshot_date, quantity_on_hand)
        VALUES (?, ?, ?, ?, ?)
        """,
        (ORG_ID, STORE_ID, product_id, REF.isoformat(), stock),
    )
    conn.execute(
        """
        INSERT INTO cost_snapshots (organization_id, product_id, snapshot_date, total_cost)
        VALUES (?, ?, ?, ?)
        """,
        (ORG_ID, product_id, REF.isoformat(), cost),
    )
    conn.execute(
        """
        INSERT INTO price_snapshots (organization_id, store_id, product_id, snapshot_date, sale_price)
        VALUES (?, ?, ?, ?, ?)
        """,
        (ORG_ID, STORE_ID, product_id, REF.isoformat(), price),
    )
    return product_id


def add_sale(conn: sqlite3.Connection, product_id: str, sold_at: str, quantity: float, price: float = 20.0) -> None:
    conn.execute(
        """
        INSERT INTO product_sales (organization_id, store_id, product_id, sold_at, quantity, gross_amount)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (ORG_ID, STORE_ID, product_id, sold_at, quantity, quantity * price),
    )


def seed_scenarios(conn: sqlite3.Connection) -> None:
    fast_supplier = add_supplier(conn, "fast", minimum_order_value=300, lead_time_days=None, review_cycle_days=14)
    slow_supplier = add_supplier(conn, "slow_minimum", minimum_order_value=10000, lead_time_days=None, review_cycle_days=14)
    seasonal_supplier = add_supplier(conn, "seasonal", minimum_order_value=500, lead_time_days=7, review_cycle_days=14)
    fast_brand = add_brand(conn, "fast", fast_supplier)
    slow_brand = add_brand(conn, "slow_minimum", slow_supplier)
    seasonal_brand = add_brand(conn, "seasonal", seasonal_supplier)

    regular = add_product(conn, "SCN_REGULAR", brand_id=fast_brand, package_size=1, stock=5, cost=10)
    for days_ago in range(0, 120):
        add_sale(conn, regular, day(days_ago), 2)

    spike = add_product(conn, "SCN_SPIKE", brand_id=fast_brand, package_size=12, stock=20, cost=30)
    for days_ago in (170, 130, 95, 62):
        add_sale(conn, spike, day(days_ago), 1)
    add_sale(conn, spike, day(5), 50)

    stockout = add_product(conn, "SCN_STOCKOUT", brand_id=fast_brand, package_size=4, stock=0, cost=25)
    add_sale(conn, stockout, day(9), 4)

    new_low = add_product(conn, "SCN_NEW_LOW", brand_id=fast_brand, package_size=1, stock=3, cost=40)
    add_sale(conn, new_low, day(2), 1)

    huge_box = add_product(conn, "SCN_HUGE_BOX", brand_id=fast_brand, package_size=12, stock=0, cost=15)
    add_sale(conn, huge_box, day(85), 1)

    easy_slow = add_product(conn, "SCN_EASY_SLOW", brand_id=fast_brand, package_size=6, stock=0, cost=18)
    add_sale(conn, easy_slow, day(120), 1)

    long_supplier = add_product(conn, "SCN_LONG_SUPPLIER", brand_id=slow_brand, package_size=1, stock=0, cost=10)
    for days_ago in range(0, 365, 15):
        add_sale(conn, long_supplier, day(days_ago), 1)

    seasonal = add_product(conn, "SCN_SEASONAL", brand_id=seasonal_brand, package_size=1, stock=5, cost=12)
    for year in (2024, 2025):
        for month in range(1, 13):
            add_sale(conn, seasonal, date(year, month, 5).isoformat(), 1)
        add_sale(conn, seasonal, date(year, 5, 20).isoformat(), 20)
        add_sale(conn, seasonal, date(year, 6, 5).isoformat(), 20)
    for days_ago in range(0, 120, 20):
        add_sale(conn, seasonal, day(days_ago), 2)


def row_by_code(payload: dict, code: str) -> dict:
    return next(row for row in payload["rows"] if row["source_code"] == code)


def run() -> dict:
    conn = open_memory_db()
    try:
        seed_scenarios(conn)
        payload = api_replenishment_v2(
            conn,
            limit=0,
            period={"period_days": "all", "date_from": "", "date_to": "", "label": "Todo periodo"},
        )
        regular = row_by_code(payload, "SCN_REGULAR")
        spike = row_by_code(payload, "SCN_SPIKE")
        stockout = row_by_code(payload, "SCN_STOCKOUT")
        new_low = row_by_code(payload, "SCN_NEW_LOW")
        huge_box = row_by_code(payload, "SCN_HUGE_BOX")
        easy_slow = row_by_code(payload, "SCN_EASY_SLOW")
        long_supplier = row_by_code(payload, "SCN_LONG_SUPPLIER")
        seasonal = row_by_code(payload, "SCN_SEASONAL")

        check(regular["status"] in {"urgent", "buy_now"}, "Alto giro com estoque baixo deveria comprar.")
        check(regular["suggested_quantity"] > 0, "Alto giro nao gerou quantidade sugerida.")

        check(spike["demand_class"] == "single_spike", "Pico isolado nao foi classificado corretamente.")
        check(spike["suggested_quantity"] == 0, "Pico isolado com estoque cobrindo prazo nao deveria comprar.")

        check(stockout["demand_class"] == "stockout_demand", "Ruptura com venda recente nao virou stockout_demand.")
        check(stockout["status"] == "urgent", "Ruptura com venda recente deveria ser urgente.")
        check(stockout["suggested_quantity"] >= stockout["package_size"], "Ruptura deveria comprar ao menos uma embalagem.")

        check(new_low["demand_class"] == "new", "Produto novo nao foi classificado como novo.")
        check(new_low["demand_confidence"] == "low", "Produto novo com pouca evidencia deveria ter baixa confianca.")
        check(new_low["suggested_quantity"] == 0, "Produto novo com estoque cobrindo sinal minimo nao deveria comprar.")

        check(huge_box["status"] == "mix_review", "Caixa enorme e giro lento deveria exigir revisao.")
        check(huge_box["package_blocks_auto"] is True, "Caixa enorme deveria bloquear compra automatica.")
        check(huge_box["product_rebuy_interval_days"] > huge_box["review_cycle_days"], "Caixa enorme deveria alongar ciclo do produto.")

        check(easy_slow["product_rebuy_interval_days"] > easy_slow["review_cycle_days"], "Fornecedor facil nao deveria forcar item lento a todo pedido.")
        check(easy_slow["package_blocks_auto"] is True, "Item lento de fornecedor facil deveria bloquear automatico se caixa cobre muitos dias.")

        check(long_supplier["review_cycle_days"] >= 200, "Fornecedor com pedido minimo alto deveria ter ciclo longo.")
        check(long_supplier["lead_time_days"] == 10, "Lead time ausente deveria usar default de 10 dias.")

        check(seasonal["seasonality_source"] == "product", "Sazonalidade deveria vir do produto no cenario sazonal.")
        check(seasonal["seasonality_factor_applied"] > 1.0, "Cenario sazonal deveria aplicar fator acima de 1.")
        check(seasonal["demand_class"] in {"seasonal", "regular"}, "Produto sazonal deveria ficar sazonal ou regular com fator aplicado.")

        return {
            "ok": True,
            "operation_profile": payload["summary"]["operation_profile"],
            "scenarios": {
                code: {
                    "status": row["status"],
                    "demand_class": row.get("demand_class"),
                    "confidence": row.get("demand_confidence"),
                    "suggested_quantity": row["suggested_quantity"],
                    "review_cycle_days": row["review_cycle_days"],
                    "product_rebuy_interval_days": row.get("product_rebuy_interval_days"),
                    "package_blocks_auto": row.get("package_blocks_auto"),
                    "seasonality_factor_applied": row.get("seasonality_factor_applied"),
                }
                for code, row in {
                    "SCN_REGULAR": regular,
                    "SCN_SPIKE": spike,
                    "SCN_STOCKOUT": stockout,
                    "SCN_NEW_LOW": new_low,
                    "SCN_HUGE_BOX": huge_box,
                    "SCN_EASY_SLOW": easy_slow,
                    "SCN_LONG_SUPPLIER": long_supplier,
                    "SCN_SEASONAL": seasonal,
                }.items()
            },
        }
    finally:
        conn.close()


def main() -> int:
    import json

    print(json.dumps(run(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
