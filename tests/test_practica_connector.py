from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from nexovarejo.ingestion.connectors import PracticaCsvConnector


class PracticaConnectorTest(unittest.TestCase):
    def test_loads_legacy_shifted_sales_export(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp)
            (source / "produtopreco__Sheet1.csv").write_text(
                "CÓDIGO,COD. BARRAS,PRODUTO,UND,MARCA,ESTOQUE,PREÇO DE VENDA\n"
                "0001,789,Produto A,UN,Marca,5,10\n",
                encoding="utf-8",
            )
            (source / "saidaprod__Sheet1.csv").write_text(
                "CODIGO,DATA,QTD.,VALOR SAÍDA,TIPO,CLIENTE \\ FUNCIONÁRIO \\ FORNECEDOR,\n"
                "0001,Produto A,45790,2,50,VENDA,Cliente X\n",
                encoding="utf-8",
            )
            (source / "servico__Sheet1.csv").write_text(
                "Período: 01/04/2024 a 30/04/2026,Emissão: 30/04/2026,,,,,,,\n"
                "MO,DATA,PEDIDO,SERVIÇO,CLIENTE,QUANT.,VALOR,TRIBUTOS,VALOR LÍQ.\n"
                "45383,106444,MEIA,Cliente Servico,6,19.5,1.95,17.55,\n",
                encoding="utf-8",
            )
            batch = PracticaCsvConnector().load(source, organization_id="org", store_id="loja")
            self.assertEqual(len(batch.products), 1)
            self.assertEqual(len(batch.sales), 1)
            self.assertEqual(len(batch.service_sales), 1)
            self.assertEqual(batch.sales[0]["sold_at"], "2025-05-13")
            self.assertEqual(batch.sales[0]["quantity"], "2")
            self.assertEqual(batch.sales[0]["gross_amount"], "50")
            self.assertEqual(batch.customers[0]["name"], "Cliente X")
            self.assertEqual(batch.service_sales[0]["emitted_at"], "2024-04-01")


if __name__ == "__main__":
    unittest.main()
