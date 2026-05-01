from __future__ import annotations

import unittest

from nexovarejo.ingestion.contracts import CanonicalBatch, ImportIssue, normalize_header


class IngestionContractsTest(unittest.TestCase):
    def test_normalize_header_handles_portuguese_export_names(self):
        self.assertEqual(normalize_header("PREÇO DE VENDA"), "preco_de_venda")
        self.assertEqual(normalize_header("CLIENTE \\ FUNCIONÁRIO \\ FORNECEDOR"), "cliente_funcionario_fornecedor")

    def test_batch_has_errors_only_for_error_severity(self):
        batch = CanonicalBatch("org", "store", "erp")
        batch.issues.append(ImportIssue("warning", "x", "warning"))
        self.assertFalse(batch.has_errors)
        batch.issues.append(ImportIssue("error", "y", "error"))
        self.assertTrue(batch.has_errors)


if __name__ == "__main__":
    unittest.main()
