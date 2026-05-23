from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

from replenishment import api_replenishment
from replenishment_v2 import api_replenishment_v2, api_replenishment_v2_compare


ROOT = Path(__file__).resolve().parents[1]


def money(value: float) -> str:
    return f"R$ {value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def main() -> int:
    parser = argparse.ArgumentParser(description="Compara o motor de reposicao V1 com o motor de demanda V2.")
    parser.add_argument("--db", default=str(ROOT / "data" / "nexovarejo.db"), help="Caminho do banco SQLite.")
    parser.add_argument("--code", action="append", default=[], help="Codigo de produto para detalhar. Pode repetir.")
    parser.add_argument("--supplier", default="", help="Fornecedor para somar sugestao automatica.")
    args = parser.parse_args()

    period = {"period_days": "all", "date_from": "", "date_to": "", "label": "Todo periodo"}
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    try:
        v1 = api_replenishment(conn, limit=0, period=period)
        v2 = api_replenishment_v2(conn, limit=0, period=period)
        compare = api_replenishment_v2_compare(conn, period=period, limit=15)
    finally:
        conn.close()

    print("Resumo")
    print(f"V1: {v1['summary']['buy_now']} itens em compra, {money(v1['summary']['estimated_value'])}")
    print(f"V2: {v2['summary']['buy_now']} itens em compra, {money(v2['summary']['estimated_value'])}")
    print(f"Delta: {money(compare['summary']['estimated_value_delta'])}")
    print(f"Mudancas de status: {compare['summary']['status_changes']}")
    print()

    v1_by_code = {row["source_code"]: row for row in v1["rows"]}
    v2_by_code = {row["source_code"]: row for row in v2["rows"]}
    for code in args.code:
        old = v1_by_code.get(code)
        new = v2_by_code.get(code)
        if not old or not new:
            print(f"{code}: nao encontrado.")
            continue
        print(f"{code} - {new['name']}")
        print(f"  V1: {old['status']} | alvo {old['order_up_to']} | sugestao {old['suggested_quantity']}")
        print(
            "  V2: "
            f"{new['status']} | alvo {new['order_up_to']} | sugestao {new['suggested_quantity']} | "
            f"{new['demand_class']} {new['demand_confidence']} {new['demand_quantile_used']}"
        )
        print(f"  {new['reason']}")
        print()

    if args.supplier:
        supplier = args.supplier.upper()
        for label, payload in [("V1", v1), ("V2", v2)]:
            supplier_rows = [row for row in payload["rows"] if (row.get("supplier_name") or "").upper() == supplier]
            auto_rows = [row for row in supplier_rows if row["status"] in {"urgent", "buy_now"} and row["suggested_quantity"] > 0]
            total = sum(float(row["estimated_value"] or 0) for row in auto_rows)
            print(f"{label} {supplier}: {len(auto_rows)} itens automaticos, {money(total)}")
        print()

    print("Maiores diferencas")
    for row in compare["rows"]:
        print(
            f"{row['source_code']} | {row['supplier_name']} | "
            f"{row['v1_status']} -> {row['v2_status']} | "
            f"alvo {row['v1_order_up_to']} -> {row['v2_order_up_to']} | "
            f"sugestao {row['v1_suggested_quantity']} -> {row['v2_suggested_quantity']} | "
            f"{row['demand_class']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
