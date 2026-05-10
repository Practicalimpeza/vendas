from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import re
import sqlite3
import struct
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path
from uuid import uuid4
from xml.etree import ElementTree

from db_helpers import (
    default_organization_id,
    one,
    parse_decimal,
    parse_int,
    rows,
    scalar_text,
)
from supplier_ops import seed_brand_suppliers
from text_utils import canonical_customer_key, clean_phone, make_supplier_id, normalize


ERP_FIELD_CATALOG = [
    {"entity": "produto", "field": "codigo_produto", "label": "Produto - codigo", "keywords": ["codigo_produto", "cod_produto", "codprod", "produto_codigo", "sku", "referencia_produto", "cod_item", "item_codigo", "codigo"]},
    {"entity": "identificador", "field": "barcode", "label": "Produto - codigo de barras", "keywords": ["codigo_de_barras", "codigo_barras", "cod_barras", "cod_barra", "barra", "barras", "ean", "gtin", "upc"]},
    {"entity": "identificador", "field": "supplier_reference", "label": "Fornecedor - codigo do item", "keywords": ["codigo_do_fornecedor", "codigo_fornecedor", "cod_fornecedor", "cod_forn", "referencia_fornecedor", "ref_fornecedor", "sku_fornecedor", "codigo_item_fornecedor", "codigo_produto_fornecedor", "codigo_no_fornecedor", "cod_item_fornecedor"]},
    {"entity": "produto", "field": "nome_produto", "label": "Produto - nome/descricao", "keywords": ["descricao", "descr_produto", "produto", "nome_produto", "item", "mercadoria"]},
    {"entity": "produto", "field": "marca", "label": "Produto - marca", "keywords": ["marca", "fabricante", "brand"]},
    {"entity": "produto", "field": "categoria", "label": "Produto - categoria/grupo", "keywords": ["categoria", "grupo", "departamento", "familia", "secao", "linha"]},
    {"entity": "produto", "field": "unidade", "label": "Produto - unidade", "keywords": ["un", "und", "unidade", "embalagem", "medida"]},
    {"entity": "produto", "field": "ncm", "label": "Produto - NCM", "keywords": ["ncm", "codigo_ncm", "classificacao_fiscal"]},
    {"entity": "produto", "field": "cest", "label": "Produto - CEST", "keywords": ["cest", "codigo_cest"]},
    {"entity": "produto", "field": "origem", "label": "Produto - origem fiscal", "keywords": ["origem", "origem_produto", "origem_fiscal"]},
    {"entity": "produto", "field": "peso", "label": "Produto - peso", "keywords": ["peso", "peso_bruto", "peso_liquido", "kg"]},
    {"entity": "produto", "field": "dimensoes", "label": "Produto - dimensoes", "keywords": ["dimensao", "dimensoes", "altura", "largura", "comprimento", "volume"]},
    {"entity": "produto", "field": "localizacao", "label": "Produto - localizacao/rua", "keywords": ["localizacao", "rua", "prateleira", "gondola", "corredor", "endereco_estoque"]},
    {"entity": "produto", "field": "estoque_minimo", "label": "Produto - estoque minimo cadastral", "keywords": ["estoque_minimo_cadastral", "minimo_cadastral", "ponto_pedido_cadastral"]},
    {"entity": "produto", "field": "estoque_maximo", "label": "Produto - estoque maximo cadastral", "keywords": ["estoque_maximo_cadastral", "maximo_cadastral"]},
    {"entity": "configuracao", "field": "preferred_supplier", "label": "Configuracao - fornecedor preferencial", "keywords": ["fornecedor_preferencial", "fornecedor_padrao", "fornecedor_compra", "supplier_preferencial"]},
    {"entity": "configuracao", "field": "package_size", "label": "Configuracao - embalagem/multiplo de compra", "keywords": ["embalagem_compra", "multiplo_compra", "caixa", "fardo", "qtd_caixa", "package_size", "multiplo"]},
    {"entity": "configuracao", "field": "target_coverage_days", "label": "Configuracao - cobertura alvo dias", "keywords": ["cobertura_alvo", "dias_cobertura", "target_coverage", "estoque_dias", "dias_estoque"]},
    {"entity": "configuracao", "field": "minimum_stock", "label": "Configuracao - estoque minimo", "keywords": ["estoque_minimo", "minimo", "min_stock", "ponto_pedido", "minimo_operacional", "estoque_minimo_operacional", "minimum_stock", "estoque_seguranca"]},
    {"entity": "configuracao", "field": "maximum_stock", "label": "Configuracao - estoque maximo", "keywords": ["estoque_maximo", "maximo", "max_stock", "maximo_operacional", "estoque_maximo_operacional", "maximum_stock"]},
    {"entity": "configuracao", "field": "weight", "label": "Configuracao - peso", "keywords": ["peso_compra", "peso_logistico", "peso_item"]},
    {"entity": "configuracao", "field": "expires", "label": "Configuracao - perecivel/vence", "keywords": ["perecivel", "vence", "validade", "controla_validade", "expira"]},
    {"entity": "configuracao", "field": "blocked_for_purchase", "label": "Configuracao - bloquear compra", "keywords": ["bloquear_compra", "bloqueado_compra", "nao_comprar", "descontinuado"]},
    {"entity": "configuracao", "field": "ignored_in_purchase_reports", "label": "Configuracao - ignorar nos relatorios", "keywords": ["ignorar_compra", "ignorar_relatorio", "fora_relatorio", "nao_sugerir"]},
    {"entity": "configuracao", "field": "notes", "label": "Configuracao - observacao", "keywords": ["observacao", "observacoes", "nota_operacional", "comentario", "notes"]},
    {"entity": "estoque", "field": "estoque_atual", "label": "Estoque - quantidade atual", "keywords": ["estoque", "saldo", "quantidade_estoque", "qtde_estoque", "qtd_estoque", "disponivel"]},
    {"entity": "estoque", "field": "estoque_reservado", "label": "Estoque - reservado", "keywords": ["reservado", "estoque_reservado", "qtd_reservada"]},
    {"entity": "estoque", "field": "estoque_em_transito", "label": "Estoque - em transito", "keywords": ["em_transito", "transito", "estoque_transito", "pedido_em_aberto"]},
    {"entity": "estoque", "field": "deposito", "label": "Estoque - deposito/filial", "keywords": ["deposito", "almoxarifado", "filial", "loja", "warehouse"]},
    {"entity": "estoque", "field": "data_movimento", "label": "Estoque - data do movimento", "keywords": ["data_movimento_estoque", "dt_mov_estoque", "data_estoque"]},
    {"entity": "estoque", "field": "tipo_movimento", "label": "Estoque - tipo do movimento", "keywords": ["tipo_movimento", "entrada_saida", "movimento_estoque", "operacao_estoque"]},
    {"entity": "preco", "field": "preco_venda", "label": "Preco - venda", "keywords": ["preco", "preco_venda", "valor_venda", "vl_venda", "venda", "tabela"]},
    {"entity": "preco", "field": "preco_promocional", "label": "Preco - promocional", "keywords": ["preco_promocional", "promocao", "preco_promo", "valor_promocional"]},
    {"entity": "preco", "field": "preco_atacado", "label": "Preco - atacado", "keywords": ["preco_atacado", "atacado", "preco_maiorista"]},
    {"entity": "preco", "field": "margem_minima", "label": "Preco - margem minima", "keywords": ["margem_minima", "margem_alvo", "markup", "mark_up"]},
    {"entity": "custo", "field": "purchase_cost", "label": "Compra - preco sem impostos", "keywords": ["preco_sem_impostos", "pre_o_sem_impostos", "sem_impostos", "sem_imposto", "s_impostos", "preco_compra_sem_impostos", "compra_sem_impostos", "custo_sem_impostos", "valor_sem_impostos", "valor_liquido", "preco_liquido", "custo_compra", "preco_compra", "valor_compra"]},
    {"entity": "custo", "field": "total_cost", "label": "Compra - preco com impostos", "keywords": ["preco_com_impostos", "pre_o_com_impostos", "com_impostos", "com_imposto", "c_impostos", "preco_compra_com_impostos", "compra_com_impostos", "custo_com_impostos", "valor_com_impostos", "valor_total_compra", "custo_total", "total_custo", "custo_final", "preco_custo", "valor_custo"]},
    {"entity": "custo", "field": "freight_cost", "label": "Compra - frete", "keywords": ["frete", "valor_frete", "custo_frete", "frete_compra", "frete_unitario"]},
    {"entity": "custo", "field": "icms_cost", "label": "Compra - ICMS", "keywords": ["icms", "valor_icms", "custo_icms", "icms_compra", "icms_st", "valor_icms_st"]},
    {"entity": "custo", "field": "ipi_cost", "label": "Compra - IPI", "keywords": ["ipi", "valor_ipi", "custo_ipi", "ipi_compra"]},
    {"entity": "custo", "field": "snapshot_date", "label": "Compra - data do custo", "keywords": ["data_custo", "data_compra", "dt_custo", "dt_compra", "data_atualizacao_custo"]},
    {"entity": "compra", "field": "numero_pedido", "label": "Compra - pedido", "keywords": ["pedido_compra", "numero_pedido_compra", "oc", "ordem_compra"]},
    {"entity": "compra", "field": "numero_nota", "label": "Compra - nota fiscal", "keywords": ["nota_compra", "nf_compra", "nfe_compra", "numero_nota_compra"]},
    {"entity": "compra", "field": "data_compra", "label": "Compra - data", "keywords": ["data_compra", "emissao_compra", "dt_compra"]},
    {"entity": "compra", "field": "quantidade_comprada", "label": "Compra - quantidade", "keywords": ["quantidade_comprada", "qtd_comprada", "qtde_compra", "volume_compra"]},
    {"entity": "compra", "field": "prazo_entrega", "label": "Compra - prazo de entrega", "keywords": ["prazo_entrega", "lead_time", "dias_entrega", "previsao_entrega"]},
    {"entity": "venda", "field": "data_venda", "label": "Venda - data", "keywords": ["data", "data_venda", "emissao", "dt_emissao", "movimento", "data_movimento"]},
    {"entity": "venda", "field": "quantidade_vendida", "label": "Venda - quantidade", "keywords": ["quantidade", "qtd", "qtde", "quant", "volume"]},
    {"entity": "venda", "field": "valor_venda", "label": "Venda - valor bruto", "keywords": ["total", "valor_total", "valor", "bruto", "receita", "faturamento", "vl_total"]},
    {"entity": "venda", "field": "valor_liquido", "label": "Venda - valor liquido", "keywords": ["valor_liquido", "liquido", "vl_liquido", "receita_liquida"]},
    {"entity": "venda", "field": "desconto", "label": "Venda - desconto", "keywords": ["desconto", "vl_desconto", "valor_desconto", "perc_desconto"]},
    {"entity": "venda", "field": "canal", "label": "Venda - canal/origem", "keywords": ["canal", "origem_venda", "ecommerce", "marketplace", "balcao", "televendas"]},
    {"entity": "venda", "field": "vendedor", "label": "Venda - vendedor", "keywords": ["vendedor", "representante", "consultor", "usuario_venda"]},
    {"entity": "venda", "field": "condicao_pagamento", "label": "Venda - condicao de pagamento", "keywords": ["condicao_pagamento", "forma_pagamento", "meio_pagamento", "pagamento"]},
    {"entity": "venda", "field": "numero_documento", "label": "Venda - documento/pedido", "keywords": ["pedido", "nota", "nf", "documento", "cupom", "numero"]},
    {"entity": "fiscal", "field": "chave_nfe", "label": "Fiscal - chave NFe", "keywords": ["chave_nfe", "chave_nf", "chave_acesso", "chave_acesso_nfe"]},
    {"entity": "fiscal", "field": "cfop", "label": "Fiscal - CFOP", "keywords": ["cfop", "codigo_cfop"]},
    {"entity": "fiscal", "field": "cst_csosn", "label": "Fiscal - CST/CSOSN", "keywords": ["cst", "csosn", "cst_icms", "situacao_tributaria"]},
    {"entity": "fiscal", "field": "base_icms", "label": "Fiscal - base ICMS", "keywords": ["base_icms", "bc_icms", "base_calculo_icms"]},
    {"entity": "fiscal", "field": "aliquota_icms", "label": "Fiscal - aliquota ICMS", "keywords": ["aliquota_icms", "perc_icms", "al_icms"]},
    {"entity": "fiscal", "field": "valor_icms", "label": "Fiscal - valor ICMS", "keywords": ["valor_icms", "vl_icms"]},
    {"entity": "fiscal", "field": "valor_pis", "label": "Fiscal - valor PIS", "keywords": ["pis", "valor_pis", "vl_pis"]},
    {"entity": "fiscal", "field": "valor_cofins", "label": "Fiscal - valor COFINS", "keywords": ["cofins", "valor_cofins", "vl_cofins"]},
    {"entity": "cliente", "field": "codigo_cliente", "label": "Cliente - codigo", "keywords": ["codigo_cliente", "cod_cliente", "cliente_codigo", "codcli"]},
    {"entity": "cliente", "field": "nome_cliente", "label": "Cliente - nome", "keywords": ["cliente", "nome_cliente", "razao_social", "nome_razao", "comprador"]},
    {"entity": "cliente", "field": "documento_cliente", "label": "Cliente - CPF/CNPJ", "keywords": ["cpf", "cnpj", "documento_cliente", "cpf_cnpj", "doc_cliente"]},
    {"entity": "cliente", "field": "cidade", "label": "Cliente - cidade", "keywords": ["cidade_cliente", "municipio_cliente", "cidade"]},
    {"entity": "cliente", "field": "uf", "label": "Cliente - UF", "keywords": ["uf_cliente", "estado_cliente", "uf"]},
    {"entity": "cliente", "field": "telefone", "label": "Cliente - telefone", "keywords": ["telefone_cliente", "fone_cliente", "celular_cliente", "whatsapp_cliente"]},
    {"entity": "cliente", "field": "email", "label": "Cliente - e-mail", "keywords": ["email_cliente", "e_mail_cliente", "mail_cliente"]},
    {"entity": "cliente", "field": "limite_credito", "label": "Cliente - limite de credito", "keywords": ["limite_credito", "credito_cliente", "limite"]},
    {"entity": "fornecedor", "field": "nome_fornecedor", "label": "Fornecedor - nome", "keywords": ["fornecedor", "nome_fornecedor", "fornecedor_nome", "distribuidor"]},
    {"entity": "fornecedor", "field": "documento_fornecedor", "label": "Fornecedor - CNPJ", "keywords": ["cnpj_fornecedor", "fornecedor_cnpj", "documento_fornecedor", "doc_fornecedor"]},
    {"entity": "fornecedor", "field": "contato", "label": "Fornecedor - contato", "keywords": ["contato_fornecedor", "nome_contato_fornecedor", "responsavel_fornecedor", "contato"]},
    {"entity": "fornecedor", "field": "telefone", "label": "Fornecedor - telefone", "keywords": ["telefone_fornecedor", "fornecedor_telefone", "fone_fornecedor", "whatsapp_fornecedor"]},
    {"entity": "fornecedor", "field": "email", "label": "Fornecedor - e-mail", "keywords": ["email_fornecedor", "fornecedor_email", "mail_fornecedor"]},
    {"entity": "fornecedor", "field": "pedido_minimo", "label": "Fornecedor - pedido minimo", "keywords": ["pedido_minimo", "fornecedor_pedido_minimo", "pedido_minimo_fornecedor", "valor_minimo", "minimo_fornecedor", "minimum_order"]},
    {"entity": "fornecedor", "field": "prazo_pagamento", "label": "Fornecedor - prazo pagamento", "keywords": ["prazo_pagamento_fornecedor", "condicao_fornecedor", "dias_pagamento"]},
    {"entity": "servico", "field": "nome_servico", "label": "Servico - descricao", "keywords": ["servico", "descricao_servico", "nome_servico"]},
    {"entity": "financeiro", "field": "tipo_titulo", "label": "Financeiro - tipo do titulo", "keywords": ["tipo_titulo", "receber_pagar", "contas_receber", "contas_pagar"]},
    {"entity": "financeiro", "field": "data_emissao", "label": "Financeiro - emissao", "keywords": ["data_emissao_titulo", "emissao_titulo", "dt_emissao_titulo"]},
    {"entity": "financeiro", "field": "data_vencimento", "label": "Financeiro - vencimento", "keywords": ["vencimento", "data_vencimento", "dt_vencimento"]},
    {"entity": "financeiro", "field": "data_pagamento", "label": "Financeiro - pagamento", "keywords": ["data_pagamento", "dt_pagamento", "baixa"]},
    {"entity": "financeiro", "field": "valor_titulo", "label": "Financeiro - valor", "keywords": ["valor_titulo", "valor_parcela", "valor_financeiro", "saldo"]},
    {"entity": "financeiro", "field": "status_titulo", "label": "Financeiro - status", "keywords": ["status_titulo", "situacao_titulo", "aberto_pago", "status_financeiro"]},
    {"entity": "contato", "field": "telefone", "label": "Contato - telefone", "keywords": ["telefone", "fone", "celular", "whatsapp", "contato"]},
    {"entity": "contato", "field": "email", "label": "Contato - e-mail", "keywords": ["email", "e_mail", "mail"]},
]


def detect_value_type(values: list[str]) -> str:
    filled = [str(value or "").strip() for value in values if str(value or "").strip()]
    if not filled:
        return "vazio"
    numeric = 0
    dates = 0
    documents = 0
    checked = filled[:30]
    for value in checked:
        normalized = value.replace(".", "").replace(",", ".").replace("R$", "").strip()
        if re.fullmatch(r"-?\d+(\.\d+)?", normalized):
            numeric += 1
        if re.fullmatch(r"\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}", value) or re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            dates += 1
        digits = re.sub(r"\D+", "", value)
        if len(digits) in {11, 14}:
            documents += 1
    threshold = max(1, len(checked) // 2)
    if dates >= threshold:
        return "data"
    if documents >= threshold:
        return "documento"
    if numeric >= threshold:
        return "numero"
    return "texto"


def suggest_erp_field(header: str, value_type: str) -> dict:
    normalized = normalize(header)
    tokens = set(normalized.split("_"))
    best: dict | None = None
    best_score = 0
    for candidate in ERP_FIELD_CATALOG:
        score = 0
        for keyword in candidate["keywords"]:
            key = normalize(keyword)
            if normalized == key:
                score += 8
            elif key and key in normalized:
                score += 5
            elif key in tokens:
                score += 3
        entity_key = normalize(candidate["entity"])
        if entity_key and (normalized.startswith(f"{entity_key}_") or normalized.endswith(f"_{entity_key}")):
            score += 4
        if value_type == "data" and candidate["field"].startswith("data_"):
            score += 3
        if value_type == "documento" and "documento" in candidate["field"]:
            score += 3
        if value_type == "numero" and candidate["field"] in {
            "estoque_atual", "estoque_reservado", "estoque_em_transito", "estoque_minimo", "estoque_maximo",
            "preco_venda", "preco_promocional", "preco_atacado", "margem_minima",
            "purchase_cost", "total_cost", "freight_cost", "icms_cost", "ipi_cost",
            "quantidade_vendida", "quantidade_comprada", "valor_venda", "valor_liquido", "desconto",
            "base_icms", "aliquota_icms", "valor_icms", "valor_pis", "valor_cofins",
            "pedido_minimo", "limite_credito", "valor_titulo",
            "package_size", "target_coverage_days", "minimum_stock", "maximum_stock", "weight",
        }:
            score += 1
        if score > best_score:
            best = candidate
            best_score = score
    if not best or best_score < 3:
        return {"entity": "ignorar", "field": "ignorar", "label": "Ignorar / nao mapeado", "confidence": 0}
    return {"entity": best["entity"], "field": best["field"], "label": best["label"], "confidence": min(98, 35 + best_score * 8)}


def detect_header_row(rows_data: list[list[str]]) -> int:
    best_index = 0
    best_score = -1
    for index, row in enumerate(rows_data[:12]):
        filled = [cell for cell in row if str(cell or "").strip()]
        if not filled:
            continue
        text_score = sum(1 for cell in filled if re.search(r"[A-Za-zÀ-ÿ]", cell))
        unique_score = len({normalize(cell) for cell in filled if normalize(cell)})
        text_score = sum(1 for cell in filled if any(char.isalpha() for char in cell))
        score = text_score * 2 + unique_score - index
        if score > best_score:
            best_index = index
            best_score = score
    return best_index


def normalize_table_rows(rows_data: list[list[str]], limit: int = 500) -> tuple[list[str], list[list[str]], int]:
    usable = [row for row in rows_data if any(str(cell or "").strip() for cell in row)]
    if not usable:
        return [], [], 0
    header_index = detect_header_row(usable)
    headers = [str(cell or "").strip() or f"coluna_{idx + 1}" for idx, cell in enumerate(usable[header_index])]
    width = len(headers)
    data_rows = []
    for row in usable[header_index + 1 : header_index + 1 + limit]:
        padded = [str(cell or "").strip() for cell in row[:width]]
        padded.extend([""] * (width - len(padded)))
        if any(padded):
            data_rows.append(padded)
    return headers, data_rows, header_index + 1


def parse_text_planilha(content: str) -> tuple[list[dict], dict]:
    sample = content[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,\t|")
    except csv.Error:
        dialect = csv.excel
        dialect.delimiter = "\t" if "\t" in sample and ";" not in sample else ";"
    reader = csv.reader(io.StringIO(content), dialect)
    return [{"name": "Arquivo", "rows": [[cell.strip() for cell in row] for row in reader]}], {"format": "texto", "delimiter": dialect.delimiter}


def decode_planilha_text(raw_bytes: bytes) -> tuple[str, str]:
    for encoding in ("utf-8-sig", "utf-16", "cp1252"):
        try:
            return raw_bytes.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode("utf-8", errors="replace"), "utf-8-replace"


def column_index(cell_ref: str) -> int:
    letters = re.sub(r"[^A-Z]", "", cell_ref.upper())
    index = 0
    for char in letters:
        index = index * 26 + (ord(char) - ord("A") + 1)
    return max(0, index - 1)


def parse_xlsx_planilha(content_base64: str) -> tuple[list[dict], dict]:
    data = base64.b64decode(content_base64)
    sheets = []
    with zipfile.ZipFile(io.BytesIO(data)) as workbook:
        shared_strings = []
        if "xl/sharedStrings.xml" in workbook.namelist():
            root = ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
            for item in root.findall(".//{*}si"):
                shared_strings.append("".join(node.text or "" for node in item.findall(".//{*}t")))
        sheet_paths = sorted(path for path in workbook.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", path))
        for sheet_number, sheet_path in enumerate(sheet_paths[:5], start=1):
            root = ElementTree.fromstring(workbook.read(sheet_path))
            parsed_rows = []
            for row_node in root.findall(".//{*}sheetData/{*}row")[:100000]:
                cells = []
                for cell in row_node.findall("{*}c"):
                    idx = column_index(cell.attrib.get("r", "A"))
                    while len(cells) <= idx:
                        cells.append("")
                    value_node = cell.find("{*}v")
                    inline_node = cell.find(".//{*}t")
                    value = value_node.text if value_node is not None else (inline_node.text if inline_node is not None else "")
                    if cell.attrib.get("t") == "s" and str(value).isdigit():
                        value = shared_strings[int(value)] if int(value) < len(shared_strings) else value
                    cells[idx] = str(value or "").strip()
                parsed_rows.append(cells)
            sheets.append({"name": f"Aba {sheet_number}", "rows": parsed_rows})
    return sheets, {"format": "xlsx", "sheet_count": len(sheets)}


def ole_sector(data: bytes, sector_size: int, sector_id: int) -> bytes:
    start = 512 + sector_id * sector_size
    return data[start : start + sector_size]


def ole_chain(fat: list[int], start_sector: int) -> list[int]:
    chain = []
    sector = start_sector
    seen = set()
    while sector >= 0 and sector < len(fat) and sector not in seen:
        chain.append(sector)
        seen.add(sector)
        next_sector = fat[sector]
        if next_sector in {-2, -1}:
            break
        sector = next_sector
    return chain


def read_ole_streams(data: bytes) -> dict[str, bytes]:
    if not data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        raise ValueError("Arquivo .xls nao parece estar no formato binario do Excel.")
    sector_size = 1 << struct.unpack_from("<H", data, 30)[0]
    mini_sector_size = 1 << struct.unpack_from("<H", data, 32)[0]
    first_dir_sector = struct.unpack_from("<i", data, 48)[0]
    mini_cutoff = struct.unpack_from("<I", data, 56)[0]
    first_minifat_sector = struct.unpack_from("<i", data, 60)[0]
    first_difat_sector = struct.unpack_from("<i", data, 68)[0]
    difat_sector_count = struct.unpack_from("<I", data, 72)[0]
    difat = [value for value in struct.unpack_from("<109i", data, 76) if value >= 0]
    next_difat = first_difat_sector
    seen_difat = set()
    for _ in range(min(difat_sector_count, 1024)):
        if next_difat < 0 or next_difat in seen_difat:
            break
        seen_difat.add(next_difat)
        sector = ole_sector(data, sector_size, next_difat)
        entries = struct.unpack("<" + "i" * (sector_size // 4), sector)
        difat.extend(value for value in entries[:-1] if value >= 0)
        next_difat = entries[-1]
    fat = []
    for sector_id in difat:
        sector = ole_sector(data, sector_size, sector_id)
        fat.extend(struct.unpack("<" + "i" * (sector_size // 4), sector))
    directory_data = b"".join(ole_sector(data, sector_size, sid) for sid in ole_chain(fat, first_dir_sector))
    entries = []
    for offset in range(0, len(directory_data), 128):
        entry = directory_data[offset : offset + 128]
        if len(entry) < 128:
            continue
        name_len = struct.unpack_from("<H", entry, 64)[0]
        if name_len < 2:
            continue
        name = entry[: name_len - 2].decode("utf-16le", errors="ignore")
        obj_type = entry[66]
        start_sector = struct.unpack_from("<i", entry, 116)[0]
        size = struct.unpack_from("<Q", entry, 120)[0]
        entries.append({"name": name, "type": obj_type, "start": start_sector, "size": size})
    root = next((entry for entry in entries if entry["type"] == 5), None)
    mini_stream = b""
    if root and root["start"] >= 0:
        mini_stream = b"".join(ole_sector(data, sector_size, sid) for sid in ole_chain(fat, root["start"]))[: root["size"]]
    minifat = []
    if first_minifat_sector >= 0:
        for sector_id in ole_chain(fat, first_minifat_sector):
            sector = ole_sector(data, sector_size, sector_id)
            minifat.extend(struct.unpack("<" + "i" * (sector_size // 4), sector))
    streams = {}
    for entry in entries:
        if entry["type"] != 2 or entry["start"] < 0:
            continue
        if entry["size"] < mini_cutoff and minifat and mini_stream:
            chunks = []
            for mini_sector_id in ole_chain(minifat, entry["start"]):
                start = mini_sector_id * mini_sector_size
                chunks.append(mini_stream[start : start + mini_sector_size])
            streams[entry["name"]] = b"".join(chunks)[: entry["size"]]
        else:
            streams[entry["name"]] = b"".join(ole_sector(data, sector_size, sid) for sid in ole_chain(fat, entry["start"]))[: entry["size"]]
    return streams


def biff_text(data: bytes, offset: int) -> tuple[str, int]:
    if offset >= len(data):
        return "", offset
    char_count = struct.unpack_from("<H", data, offset)[0]
    flags = data[offset + 2] if offset + 2 < len(data) else 0
    pos = offset + 3
    if flags & 0x08:
        pos += 2
    rich_runs = 0
    if flags & 0x08 and offset + 5 <= len(data):
        rich_runs = struct.unpack_from("<H", data, offset + 3)[0]
    if flags & 0x04:
        ext_size = struct.unpack_from("<I", data, pos)[0]
        pos += 4
    else:
        ext_size = 0
    if flags & 0x01:
        raw = data[pos : pos + char_count * 2]
        text = raw.decode("utf-16le", errors="ignore")
        pos += char_count * 2
    else:
        raw = data[pos : pos + char_count]
        text = raw.decode("cp1252", errors="ignore")
        pos += char_count
    pos += rich_runs * 4 + ext_size
    return text, pos


def parse_biff_sst(record: bytes) -> list[str]:
    if len(record) < 8:
        return []
    total = struct.unpack_from("<I", record, 4)[0]
    strings = []
    offset = 8
    while offset < len(record) and len(strings) < total:
        text, offset = biff_text(record, offset)
        strings.append(text)
    return strings


def rk_number(value: int) -> float:
    divided = value & 0x01
    is_int = value & 0x02
    raw = value & 0xFFFFFFFC
    if is_int:
        if raw & 0x80000000:
            raw -= 0x100000000
        number = raw >> 2
    else:
        number = struct.unpack("<d", struct.pack("<II", 0, raw))[0]
    return number / 100 if divided else number


def biff_cell_set(cells: dict[int, dict[int, str]], row: int, col: int, value: object) -> None:
    cells.setdefault(row, {})[col] = "" if value is None else str(value)


def parse_biff_sheet(workbook: bytes, start: int, shared_strings: list[str]) -> list[list[str]]:
    cells: dict[int, dict[int, str]] = {}
    pos = start
    pending_formula_text_cell: tuple[int, int] | None = None
    while pos + 4 <= len(workbook):
        record_id, size = struct.unpack_from("<HH", workbook, pos)
        body = workbook[pos + 4 : pos + 4 + size]
        pos += 4 + size
        if record_id == 0x000A:
            break
        if record_id == 0x00FD and len(body) >= 10:
            row, col = struct.unpack_from("<HH", body, 0)
            sst_index = struct.unpack_from("<I", body, 6)[0]
            biff_cell_set(cells, row, col, shared_strings[sst_index] if sst_index < len(shared_strings) else "")
        elif record_id == 0x0203 and len(body) >= 14:
            row, col = struct.unpack_from("<HH", body, 0)
            biff_cell_set(cells, row, col, struct.unpack_from("<d", body, 6)[0])
        elif record_id == 0x027E and len(body) >= 10:
            row, col = struct.unpack_from("<HH", body, 0)
            biff_cell_set(cells, row, col, rk_number(struct.unpack_from("<I", body, 6)[0]))
        elif record_id == 0x00BD and len(body) >= 6:
            row, first_col = struct.unpack_from("<HH", body, 0)
            last_col = body[4]
            offset = 6
            for col in range(first_col, last_col + 1):
                if offset + 6 > len(body):
                    break
                biff_cell_set(cells, row, col, rk_number(struct.unpack_from("<I", body, offset + 2)[0]))
                offset += 6
        elif record_id in {0x00D6, 0x0204} and len(body) >= 8:
            row, col = struct.unpack_from("<HH", body, 0)
            text, _ = biff_text(body, 6)
            biff_cell_set(cells, row, col, text)
        elif record_id == 0x0006 and len(body) >= 14:
            row, col = struct.unpack_from("<HH", body, 0)
            cached = body[6:14]
            if len(cached) == 8 and cached[6:8] == b"\xff\xff":
                pending_formula_text_cell = (row, col)
            else:
                number = struct.unpack_from("<d", body, 6)[0]
                biff_cell_set(cells, row, col, number)
        elif record_id == 0x0207 and pending_formula_text_cell:
            text, _ = biff_text(body, 0)
            biff_cell_set(cells, pending_formula_text_cell[0], pending_formula_text_cell[1], text)
            pending_formula_text_cell = None
    if not cells:
        return []
    max_row = max(cells)
    max_col = max(max(cols) for cols in cells.values())
    return [[cells.get(row, {}).get(col, "") for col in range(max_col + 1)] for row in range(max_row + 1)]


def looks_like_biff_workbook(stream: bytes) -> bool:
    if len(stream) < 8:
        return False
    first_record = struct.unpack_from("<H", stream, 0)[0]
    if first_record not in {0x0009, 0x0209, 0x0409, 0x0809}:
        return False
    pos = 0
    scanned = 0
    while pos + 4 <= len(stream) and scanned < 5000:
        record_id, size = struct.unpack_from("<HH", stream, pos)
        if size < 0 or pos + 4 + size > len(stream):
            return False
        if record_id == 0x0085:
            return True
        pos += 4 + size
        scanned += 1
    return False


def stream_diagnostics(streams: dict[str, bytes]) -> str:
    if not streams:
        return "nenhum stream encontrado"
    items = [f"{name} ({len(value)} bytes)" for name, value in sorted(streams.items())[:12]]
    return ", ".join(items)


def parse_xls_biff(data: bytes) -> tuple[list[dict], dict]:
    streams = read_ole_streams(data)
    stream_by_name = {name.strip().lower(): value for name, value in streams.items()}
    workbook = stream_by_name.get("workbook") or stream_by_name.get("book")
    if not workbook:
        for stream in streams.values():
            if looks_like_biff_workbook(stream):
                workbook = stream
                break
    if not workbook:
        raise ValueError(f"Nao encontrei o stream Workbook/Book dentro do .xls. Streams encontrados: {stream_diagnostics(streams)}.")
    shared_strings = []
    boundsheets = []
    pos = 0
    while pos + 4 <= len(workbook):
        record_id, size = struct.unpack_from("<HH", workbook, pos)
        body = workbook[pos + 4 : pos + 4 + size]
        pos += 4 + size
        if record_id == 0x00FC:
            shared_strings = parse_biff_sst(body)
        elif record_id == 0x0085 and len(body) >= 8:
            sheet_pos = struct.unpack_from("<I", body, 0)[0]
            name_len = body[6]
            flags = body[7]
            raw_name = body[8 : 8 + name_len * (2 if flags & 0x01 else 1)]
            name = raw_name.decode("utf-16le" if flags & 0x01 else "cp1252", errors="ignore")
            boundsheets.append((name or f"Aba {len(boundsheets) + 1}", sheet_pos))
    sheets = []
    for name, sheet_pos in boundsheets[:5]:
        rows_data = parse_biff_sheet(workbook, sheet_pos, shared_strings)
        sheets.append({"name": name, "rows": rows_data})
    if not sheets:
        raise ValueError("O .xls foi lido, mas nenhuma aba foi encontrada.")
    return sheets, {"format": "xls_biff", "sheet_count": len(sheets), "parser": "python_biff"}


def parse_xls_planilha(content_base64: str) -> tuple[list[dict], dict]:
    data = base64.b64decode(content_base64)
    stripped = data[:512].lstrip().lower()
    if stripped.startswith(b"<html") or stripped.startswith(b"<!doctype html"):
        text = data.decode("cp1252", errors="replace")
        table_rows = []
        for row_html in re.findall(r"<tr[^>]*>(.*?)</tr>", text, flags=re.IGNORECASE | re.DOTALL):
            cells = []
            for cell_html in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", row_html, flags=re.IGNORECASE | re.DOTALL):
                clean = re.sub(r"<[^>]+>", " ", cell_html)
                clean = re.sub(r"\s+", " ", clean).strip()
                cells.append(clean)
            if cells:
                table_rows.append(cells)
        if table_rows:
            return [{"name": "Arquivo", "rows": table_rows}], {"format": "xls_html", "sheet_count": 1}
    if stripped.startswith(b"<?xml") or stripped.startswith(b"<workbook"):
        text = data.decode("utf-8", errors="replace")
        root = ElementTree.fromstring(text)
        sheets = []
        for sheet_number, worksheet in enumerate(root.findall(".//{*}Worksheet")[:5], start=1):
            name = worksheet.attrib.get("{urn:schemas-microsoft-com:office:spreadsheet}Name") or f"Aba {sheet_number}"
            parsed_rows = []
            for row in worksheet.findall(".//{*}Row")[:100000]:
                parsed_rows.append([(cell.findtext(".//{*}Data") or "").strip() for cell in row.findall("{*}Cell")])
            sheets.append({"name": name, "rows": parsed_rows})
        if sheets:
            return sheets, {"format": "xls_xml", "sheet_count": len(sheets)}

    try:
        return parse_xls_biff(data)
    except Exception as biff_error:
        raise ValueError(
            "Nao foi possivel ler este .xls diretamente. Salve/exporte esta planilha como .xlsx ou .csv e tente novamente. "
            f"Detalhe tecnico: {str(biff_error)[:300]}"
        ) from biff_error


def parse_erp_file_bytes(file_name: str, raw_bytes: bytes) -> tuple[str, list[dict], dict, str, int]:
    file_name = file_name or "planilha"
    extension = Path(file_name).suffix.lower()
    if extension in {".xlsx", ".xlsm"}:
        content_base64 = base64.b64encode(raw_bytes).decode("ascii")
        sheets, metadata = parse_xlsx_planilha(content_base64)
    elif extension == ".xls":
        content_base64 = base64.b64encode(raw_bytes).decode("ascii")
        sheets, metadata = parse_xls_planilha(content_base64)
    else:
        content, encoding = decode_planilha_text(raw_bytes)
        sheets, metadata = parse_text_planilha(content)
        metadata["encoding"] = encoding
    content_hash = hashlib.sha256(raw_bytes).hexdigest()
    return file_name, sheets, metadata, content_hash, len(raw_bytes)


def parse_erp_file_payload(payload: dict) -> tuple[str, list[dict], dict, str, int]:
    file_name = scalar_text(payload.get("file_name")) or "planilha"
    if isinstance(payload.get("_file_bytes"), bytes):
        return parse_erp_file_bytes(file_name, payload["_file_bytes"])
    extension = Path(file_name).suffix.lower()
    if extension in {".xlsx", ".xlsm", ".xls"}:
        raw_bytes = base64.b64decode(scalar_text(payload.get("content_base64")))
    else:
        raw_bytes = scalar_text(payload.get("content")).encode("utf-8")
    return parse_erp_file_bytes(file_name, raw_bytes)


def erp_sheet_signature(columns: list[dict]) -> str:
    headers = [normalize(column.get("header") or "") for column in columns]
    return hashlib.sha256("|".join(headers).encode("utf-8")).hexdigest()


def load_latest_erp_mappings(conn: sqlite3.Connection) -> dict:
    result = {}
    for row in conn.execute(
        """
        SELECT summary_json
        FROM import_batches
        WHERE source_system = 'erp_planilha'
          AND status = 'completed'
        ORDER BY finished_at DESC, started_at DESC
        LIMIT 25
        """
    ).fetchall():
        try:
            summary = json.loads(row["summary_json"] or "{}")
        except json.JSONDecodeError:
            continue
        for sheet in summary.get("mappings") or []:
            signature = sheet.get("signature")
            mapping = sheet.get("mapping")
            if signature and isinstance(mapping, dict) and signature not in result:
                result[signature] = mapping
    return result


def analyze_erp_sheet(sheet: dict) -> dict:
    headers, data_rows, header_line = normalize_table_rows(sheet["rows"], limit=100000)
    columns = []
    for index, header in enumerate(headers):
        samples = []
        for row in data_rows[:40]:
            value = row[index] if index < len(row) else ""
            if value and value not in samples:
                samples.append(value)
            if len(samples) >= 5:
                break
        value_type = detect_value_type(samples)
        columns.append(
            {
                "index": index,
                "header": header,
                "normalized_header": normalize(header),
                "value_type": value_type,
                "samples": samples,
                "suggestion": suggest_erp_field(header, value_type),
            }
        )
    entity_counts = {}
    for column in columns:
        entity = column["suggestion"]["entity"]
        if entity != "ignorar":
            entity_counts[entity] = entity_counts.get(entity, 0) + 1
    dominant_entity = max(entity_counts, key=entity_counts.get) if entity_counts else "nao_identificado"
    signature = erp_sheet_signature(columns)
    return {
        "sheet_name": sheet["name"],
        "signature": signature,
        "header_line": header_line,
        "row_count": len(data_rows),
        "column_count": len(headers),
        "dominant_entity": dominant_entity,
        "entity_counts": entity_counts,
        "columns": columns,
        "preview_rows": [dict(zip(headers, row[: len(headers)])) for row in data_rows[:8]],
    }


def apply_saved_erp_mapping(analyzed: list[dict], saved_mappings: dict) -> int:
    reused = 0
    for sheet in analyzed:
        saved = saved_mappings.get(sheet.get("signature")) or {}
        if not saved:
            continue
        for column in sheet.get("columns") or []:
            selected = saved.get(str(column.get("index"))) or saved.get(column.get("normalized_header"))
            if not isinstance(selected, dict):
                continue
            label = selected.get("label") or f"{selected.get('entity', '')} - {selected.get('field', '')}"
            column["suggestion"] = {
                "entity": selected.get("entity") or "ignorar",
                "field": selected.get("field") or "ignorar",
                "label": label,
                "confidence": 100,
                "source": "saved_mapping",
            }
            reused += 1
    return reused


def api_erp_import_preview(conn: sqlite3.Connection, payload: dict) -> dict:
    file_name, sheets, metadata, content_hash, file_size = parse_erp_file_payload(payload)
    analyzed = [analyze_erp_sheet(sheet) for sheet in sheets]
    reused = apply_saved_erp_mapping(analyzed, load_latest_erp_mappings(conn))
    required_review = sum(1 for sheet in analyzed for column in sheet["columns"] if column["suggestion"]["confidence"] < 70)
    return {
        "ok": True,
        "file_name": file_name,
        "metadata": {**metadata, "content_hash": content_hash, "file_size_bytes": file_size, "reused_mappings": reused},
        "sheets": analyzed,
        "field_options": [{"entity": "ignorar", "field": "ignorar", "label": "Ignorar / nao mapeado"}] + ERP_FIELD_CATALOG,
        "summary": {
            "sheets": len(analyzed),
            "columns": sum(sheet["column_count"] for sheet in analyzed),
            "rows": sum(sheet["row_count"] for sheet in analyzed),
            "required_review": required_review,
            "reused_mappings": reused,
        },
    }


def selected_mapping_from_payload(payload: dict) -> list[dict]:
    mappings = payload.get("mappings")
    if not isinstance(mappings, list):
        raise ValueError("Mapeamento confirmado e obrigatorio.")
    clean_mappings = []
    for sheet in mappings:
        columns = sheet.get("columns") if isinstance(sheet, dict) else None
        if not isinstance(columns, list):
            continue
        clean_columns = []
        for column in columns:
            if not isinstance(column, dict):
                continue
            entity = scalar_text(column.get("entity")) or "ignorar"
            field = scalar_text(column.get("field")) or "ignorar"
            clean_columns.append(
                {
                    "index": parse_int(column.get("index"), 0) or 0,
                    "header": scalar_text(column.get("header")),
                    "normalized_header": normalize(scalar_text(column.get("header"))),
                    "entity": entity,
                    "field": field,
                    "label": scalar_text(column.get("label")) or f"{entity} - {field}",
                }
            )
        clean_mappings.append(
            {
                "sheet_index": parse_int(sheet.get("sheet_index"), len(clean_mappings)) or 0,
                "sheet_name": scalar_text(sheet.get("sheet_name")) or f"Aba {len(clean_mappings) + 1}",
                "signature": scalar_text(sheet.get("signature")),
                "columns": clean_columns,
            }
        )
    return clean_mappings


def normalize_erp_record(row: list[str], columns: list[dict]) -> dict:
    normalized = {}
    raw = {}
    for column in columns:
        index = int(column.get("index") or 0)
        value = row[index] if index < len(row) else ""
        header = column.get("header") or f"coluna_{index + 1}"
        raw[header] = value
        if column.get("entity") == "ignorar" or column.get("field") == "ignorar":
            continue
        key = f"{column.get('entity')}.{column.get('field')}"
        normalized[key] = value
    return {"raw": raw, "normalized": normalized}


def apply_erp_product_context(record: dict, context: dict) -> dict:
    normalized = record.get("normalized") or {}
    current_code = scalar_text(normalized.get("produto.codigo_produto"))
    current_name = scalar_text(normalized.get("produto.nome_produto"))
    if current_code:
        if current_code != scalar_text(context.get("code")):
            context = {"code": current_code, "name": current_name}
        elif current_name:
            context["name"] = current_name
        return context
    previous_code = scalar_text(context.get("code"))
    if not previous_code:
        return context
    normalized["produto.codigo_produto"] = previous_code
    if current_name:
        context["name"] = current_name
    elif scalar_text(context.get("name")):
        normalized["produto.nome_produto"] = scalar_text(context.get("name"))
    return context


def apply_erp_service_context(record: dict, context: dict) -> dict:
    normalized = record.get("normalized") or {}
    current_name = scalar_text(normalized.get("servico.nome_servico"))
    if current_name:
        context = {"name": current_name}
    elif scalar_text(context.get("name")):
        normalized["servico.nome_servico"] = scalar_text(context.get("name"))
    return context


def erp_product_id(org: str, code: str) -> str:
    return f"{org}:product:{code}"


def upsert_erp_product_from_record(
    conn: sqlite3.Connection,
    *,
    org: str,
    batch_id: str,
    code: str,
    name: str,
    payload: dict,
) -> str:
    clean_code = scalar_text(code)
    clean_name = scalar_text(name) or f"Produto {clean_code}"
    product_id = erp_product_id(org, clean_code)
    conn.execute(
        """
        INSERT INTO products
            (id, organization_id, source_code, name, normalized_name, unit,
             first_seen_import_batch_id, last_seen_import_batch_id, source_payload_json)
        VALUES (?, ?, ?, ?, ?, 'UN', ?, ?, ?)
        ON CONFLICT(organization_id, source_code) DO UPDATE SET
            name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE products.name END,
            normalized_name = CASE WHEN excluded.name <> '' THEN excluded.normalized_name ELSE products.normalized_name END,
            last_seen_import_batch_id = excluded.last_seen_import_batch_id,
            source_payload_json = excluded.source_payload_json,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            product_id,
            org,
            clean_code,
            clean_name,
            normalize(clean_name),
            batch_id,
            batch_id,
            json.dumps(payload, ensure_ascii=False),
        ),
    )
    existing = conn.execute(
        "SELECT id FROM products WHERE organization_id = ? AND source_code = ?",
        (org, clean_code),
    ).fetchone()
    actual_product_id = existing["id"] if existing else product_id
    conn.execute("INSERT OR IGNORE INTO product_settings (organization_id, product_id) VALUES (?, ?)", (org, actual_product_id))
    return actual_product_id


def iso_or_today(value: object) -> str:
    text = scalar_text(value)
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text
    if re.fullmatch(r"\d{1,2}/\d{1,2}/\d{2,4}", text):
        day, month, year = text.split("/")
        year = f"20{year}" if len(year) == 2 else year
        try:
            return date(int(year), int(month), int(day)).isoformat()
        except ValueError:
            return date.today().isoformat()
    return date.today().isoformat()


def iso_sale_date(value: object) -> str:
    text = scalar_text(value)
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text
    if re.fullmatch(r"\d{1,2}/\d{1,2}/\d{2,4}", text):
        day, month, year = text.split("/")
        year = f"20{year}" if len(year) == 2 else year
        try:
            return date(int(year), int(month), int(day)).isoformat()
        except ValueError:
            return ""
    serial = parse_decimal(text, None)
    if serial and 1 <= serial <= 90000:
        try:
            return (date(1899, 12, 30) + timedelta(days=int(serial))).isoformat()
        except OverflowError:
            return ""
    return ""


def erp_customer_id(org: str, code: str, name: str) -> str:
    key = scalar_text(code) or canonical_customer_key(name) or normalize(name) or "sem_cliente"
    return f"{org}:customer:{key}"


def upsert_erp_customer(conn: sqlite3.Connection, org: str, batch_id: str, code: str, name: str) -> str | None:
    clean_name = scalar_text(name)
    if not clean_name:
        return None
    clean_code = scalar_text(code)
    customer_id = erp_customer_id(org, clean_code, clean_name)
    canonical = canonical_customer_key(clean_name) or normalize(clean_name) or "sem_cliente"
    conn.execute(
        """
        INSERT INTO customers
            (id, organization_id, source_code, name, normalized_name, canonical_name,
             first_seen_import_batch_id, last_seen_import_batch_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, source_code, normalized_name) DO UPDATE SET
            name = excluded.name,
            canonical_name = excluded.canonical_name,
            last_seen_import_batch_id = excluded.last_seen_import_batch_id
        """,
        (customer_id, org, clean_code, clean_name, normalize(clean_name), canonical, batch_id, batch_id),
    )
    return customer_id


def erp_service_id(org: str, name: str) -> str:
    return f"{org}:service:{normalize(name) or 'sem_servico'}"


def upsert_erp_service(conn: sqlite3.Connection, org: str, batch_id: str, name: str) -> str | None:
    clean_name = scalar_text(name)
    if not clean_name:
        return None
    service_id = erp_service_id(org, clean_name)
    conn.execute(
        """
        INSERT INTO services
            (id, organization_id, name, normalized_name, first_seen_import_batch_id, last_seen_import_batch_id)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, normalized_name) DO UPDATE SET
            name = excluded.name,
            last_seen_import_batch_id = excluded.last_seen_import_batch_id
        """,
        (service_id, org, clean_name, normalize(clean_name), batch_id, batch_id),
    )
    return service_id


def materialize_erp_price_snapshot(
    conn: sqlite3.Connection,
    *,
    org: str,
    batch_id: str,
    store_id: str,
    record: dict,
    row_number: int,
) -> str:
    normalized = record.get("normalized") or {}
    raw_price = normalized.get("preco.preco_venda")
    if scalar_text(raw_price) == "":
        return "no_price"
    price = parse_decimal(raw_price, None)
    if price is None:
        return "invalid_price"
    code = scalar_text(normalized.get("produto.codigo_produto"))
    if not code:
        return "missing_product_code"
    product_id = upsert_erp_product_from_record(
        conn,
        org=org,
        batch_id=batch_id,
        code=code,
        name=scalar_text(normalized.get("produto.nome_produto")),
        payload={"source": "erp_planilha", "source_line": row_number, "raw": record.get("raw") or {}},
    )
    snapshot_date = date.today().isoformat()
    if conn.execute(
        """
        SELECT 1 FROM price_snapshots
        WHERE organization_id = ?
          AND COALESCE(store_id, '') = COALESCE(?, '')
          AND product_id = ?
          AND snapshot_date = ?
          AND sale_price = ?
        LIMIT 1
        """,
        (org, store_id, product_id, snapshot_date, price),
    ).fetchone():
        return "duplicate"
    conn.execute(
        """
        INSERT INTO price_snapshots
            (import_batch_id, organization_id, store_id, product_id, snapshot_date, sale_price, source_line)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (batch_id, org, store_id or None, product_id, snapshot_date, price, row_number),
    )
    return "inserted"


def materialize_erp_cost_snapshot(
    conn: sqlite3.Connection,
    *,
    org: str,
    batch_id: str,
    record: dict,
    row_number: int,
) -> str:
    normalized = record.get("normalized") or {}
    code = scalar_text(normalized.get("produto.codigo_produto"))
    cost_values = {
        "purchase_cost": parse_decimal(normalized.get("custo.purchase_cost"), 0.0) or 0.0,
        "freight_cost": parse_decimal(normalized.get("custo.freight_cost"), 0.0) or 0.0,
        "icms_cost": parse_decimal(normalized.get("custo.icms_cost"), 0.0) or 0.0,
        "ipi_cost": parse_decimal(normalized.get("custo.ipi_cost"), 0.0) or 0.0,
        "total_cost": parse_decimal(normalized.get("custo.total_cost"), 0.0) or 0.0,
    }
    has_cost = any(scalar_text(normalized.get(f"custo.{field}")) for field in cost_values)
    legacy_cost = parse_decimal(normalized.get("custo.custo"), None)
    if legacy_cost is not None and not cost_values["total_cost"]:
        cost_values["total_cost"] = legacy_cost
        has_cost = True
    if not has_cost:
        return "no_cost"
    if not code:
        return "missing_product_code"
    if not cost_values["total_cost"]:
        cost_values["total_cost"] = (
            cost_values["purchase_cost"]
            + cost_values["freight_cost"]
            + cost_values["icms_cost"]
            + cost_values["ipi_cost"]
        )
    if not cost_values["purchase_cost"] and cost_values["total_cost"]:
        cost_values["purchase_cost"] = cost_values["total_cost"]
    product_id = upsert_erp_product_from_record(
        conn,
        org=org,
        batch_id=batch_id,
        code=code,
        name=scalar_text(normalized.get("produto.nome_produto")),
        payload={"source": "erp_planilha", "source_line": row_number, "raw": record.get("raw") or {}},
    )
    snapshot_date = iso_or_today(normalized.get("custo.snapshot_date"))
    if conn.execute(
        """
        SELECT 1 FROM cost_snapshots
        WHERE import_batch_id = ?
          AND organization_id = ?
          AND product_id = ?
          AND snapshot_date = ?
          AND source_line = ?
        LIMIT 1
        """,
        (batch_id, org, product_id, snapshot_date, row_number),
    ).fetchone():
        return "duplicate"
    conn.execute(
        """
        INSERT INTO cost_snapshots
            (import_batch_id, organization_id, product_id, snapshot_date, purchase_cost,
             freight_cost, icms_cost, ipi_cost, total_cost, source_line)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            batch_id,
            org,
            product_id,
            snapshot_date,
            cost_values["purchase_cost"],
            cost_values["freight_cost"],
            cost_values["icms_cost"],
            cost_values["ipi_cost"],
            cost_values["total_cost"],
            row_number,
        ),
    )
    return "inserted"


def ensure_default_store(conn: sqlite3.Connection, org: str) -> str:
    existing = conn.execute(
        "SELECT id FROM stores WHERE organization_id = ? ORDER BY id LIMIT 1",
        (org,),
    ).fetchone()
    if existing:
        return existing["id"]
    store_id = f"{org}:store:principal"
    conn.execute(
        "INSERT OR IGNORE INTO stores (id, organization_id, name) VALUES (?, ?, ?)",
        (store_id, org, "Loja principal"),
    )
    return store_id


def materialize_erp_inventory_snapshot(
    conn: sqlite3.Connection,
    *,
    org: str,
    batch_id: str,
    store_id: str,
    record: dict,
    row_number: int,
) -> str:
    normalized = record.get("normalized") or {}
    code = scalar_text(normalized.get("produto.codigo_produto"))
    raw_stock = normalized.get("estoque.estoque_atual")
    if scalar_text(raw_stock) == "":
        return "no_stock"
    quantity = parse_decimal(raw_stock, None)
    if quantity is None:
        return "invalid_stock"
    if not code:
        return "missing_product_code"
    target_store = store_id or ensure_default_store(conn, org)
    product_id = upsert_erp_product_from_record(
        conn,
        org=org,
        batch_id=batch_id,
        code=code,
        name=scalar_text(normalized.get("produto.nome_produto")),
        payload={"source": "erp_planilha", "source_line": row_number, "raw": record.get("raw") or {}},
    )
    snapshot_date = iso_or_today(normalized.get("estoque.data_movimento"))
    existed = conn.execute(
        """
        SELECT 1
        FROM inventory_snapshots
        WHERE organization_id = ?
          AND store_id = ?
          AND product_id = ?
          AND snapshot_date = ?
          AND import_batch_id = ?
        LIMIT 1
        """,
        (org, target_store, product_id, snapshot_date, batch_id),
    ).fetchone()
    conn.execute(
        """
        INSERT INTO inventory_snapshots
            (import_batch_id, organization_id, store_id, product_id, snapshot_date, quantity_on_hand, source_line)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, store_id, product_id, snapshot_date, import_batch_id)
        DO UPDATE SET quantity_on_hand = excluded.quantity_on_hand, source_line = excluded.source_line
        """,
        (batch_id, org, target_store, product_id, snapshot_date, quantity, row_number),
    )
    return "updated" if existed else "inserted"


def materialize_erp_product_sale(
    conn: sqlite3.Connection,
    *,
    org: str,
    batch_id: str,
    store_id: str,
    record: dict,
    row_number: int,
    existing_max_date: str = "",
) -> str:
    normalized = record.get("normalized") or {}
    has_sale = any(
        scalar_text(normalized.get(key))
        for key in ("venda.data_venda", "venda.quantidade_vendida", "venda.valor_venda", "venda.valor_liquido")
    )
    if not has_sale:
        return "no_sale"
    code = scalar_text(normalized.get("produto.codigo_produto"))
    if not code and "servico.nome_servico" in normalized:
        return "no_sale"
    if not code:
        return "missing_product_code"
    sold_at = iso_sale_date(normalized.get("venda.data_venda"))
    if not sold_at:
        return "invalid_date"
    if existing_max_date and sold_at <= existing_max_date:
        return "duplicate"
    quantity = parse_decimal(normalized.get("venda.quantidade_vendida"), 0.0) or 0.0
    gross_amount = parse_decimal(normalized.get("venda.valor_venda"), 0.0) or 0.0
    product_id = upsert_erp_product_from_record(
        conn,
        org=org,
        batch_id=batch_id,
        code=code,
        name=scalar_text(normalized.get("produto.nome_produto")),
        payload={"source": "erp_planilha", "source_line": row_number, "raw": record.get("raw") or {}},
    )
    customer_id = upsert_erp_customer(
        conn,
        org,
        batch_id,
        scalar_text(normalized.get("cliente.codigo_cliente")),
        scalar_text(normalized.get("cliente.nome_cliente")),
    )
    payload_json = json.dumps(record.get("raw") or {}, ensure_ascii=False)
    if conn.execute(
        """
        SELECT 1 FROM product_sales
        WHERE organization_id = ?
          AND store_id = ?
          AND product_id = ?
          AND sold_at = ?
          AND (
              source_payload_json = ?
              OR source_line = ?
              OR (
                  quantity = ?
                  AND gross_amount = ?
                  AND COALESCE(customer_id, '') = COALESCE(?, '')
              )
          )
        LIMIT 1
        """,
        (org, store_id, product_id, sold_at, payload_json, row_number, quantity, gross_amount, customer_id),
    ).fetchone():
        return "duplicate"
    conn.execute(
        """
        INSERT INTO product_sales
            (import_batch_id, organization_id, store_id, product_id, customer_id, sold_at,
             quantity, gross_amount, movement_type, source_line, source_payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            batch_id,
            org,
            store_id,
            product_id,
            customer_id,
            sold_at,
            quantity,
            gross_amount,
            scalar_text(normalized.get("venda.numero_documento")),
            row_number,
            payload_json,
        ),
    )
    return "inserted"


def materialize_erp_service_sale(
    conn: sqlite3.Connection,
    *,
    org: str,
    batch_id: str,
    store_id: str,
    record: dict,
    row_number: int,
    existing_max_date: str = "",
) -> str:
    normalized = record.get("normalized") or {}
    has_sale = any(
        scalar_text(normalized.get(key))
        for key in ("venda.data_venda", "venda.quantidade_vendida", "venda.valor_venda", "venda.valor_liquido")
    )
    if not has_sale or not scalar_text(normalized.get("servico.nome_servico")):
        return "no_service_sale"
    emitted_at = iso_sale_date(normalized.get("venda.data_venda"))
    if not emitted_at:
        return "invalid_date"
    if existing_max_date and emitted_at <= existing_max_date:
        return "duplicate"
    quantity = parse_decimal(normalized.get("venda.quantidade_vendida"), 0.0) or 0.0
    gross_amount = parse_decimal(normalized.get("venda.valor_venda"), 0.0) or 0.0
    net_amount = parse_decimal(normalized.get("venda.valor_liquido"), gross_amount)
    service_id = upsert_erp_service(conn, org, batch_id, scalar_text(normalized.get("servico.nome_servico")))
    customer_id = upsert_erp_customer(
        conn,
        org,
        batch_id,
        scalar_text(normalized.get("cliente.codigo_cliente")),
        scalar_text(normalized.get("cliente.nome_cliente")),
    )
    payload_json = json.dumps(record.get("raw") or {}, ensure_ascii=False)
    if conn.execute(
        """
        SELECT 1 FROM service_sales
        WHERE organization_id = ?
          AND store_id = ?
          AND COALESCE(service_id, '') = COALESCE(?, '')
          AND emitted_at = ?
          AND (
              source_payload_json = ?
              OR source_line = ?
              OR (
                  quantity = ?
                  AND gross_amount = ?
                  AND COALESCE(customer_id, '') = COALESCE(?, '')
              )
          )
        LIMIT 1
        """,
        (org, store_id, service_id, emitted_at, payload_json, row_number, quantity, gross_amount, customer_id),
    ).fetchone():
        return "duplicate"
    conn.execute(
        """
        INSERT INTO service_sales
            (import_batch_id, organization_id, store_id, service_id, customer_id, emitted_at,
             order_number, quantity, gross_amount, tax_amount, net_amount, source_line, source_payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
        """,
        (
            batch_id,
            org,
            store_id,
            service_id,
            customer_id,
            emitted_at,
            scalar_text(normalized.get("venda.numero_documento")),
            quantity,
            gross_amount,
            net_amount if net_amount is not None else gross_amount,
            row_number,
            payload_json,
        ),
    )
    return "inserted"


def upsert_product_identifier(
    conn: sqlite3.Connection,
    *,
    org: str,
    product_id: str,
    identifier_type: str,
    identifier_value: str,
) -> bool:
    clean_value = scalar_text(identifier_value)[:160]
    if not clean_value:
        return False
    same_value = conn.execute(
        """
        SELECT product_id
        FROM product_identifiers
        WHERE organization_id = ?
          AND identifier_type = ?
          AND identifier_value = ?
        LIMIT 1
        """,
        (org, identifier_type, clean_value),
    ).fetchone()
    if same_value and same_value["product_id"] != product_id:
        return False
    before = conn.total_changes
    conn.execute(
        """
        DELETE FROM product_identifiers
        WHERE organization_id = ?
          AND product_id = ?
          AND identifier_type = ?
          AND identifier_value <> ?
        """,
        (org, product_id, identifier_type, clean_value),
    )
    conn.execute(
        """
        INSERT OR IGNORE INTO product_identifiers
            (organization_id, product_id, identifier_type, identifier_value, source_system)
        VALUES (?, ?, ?, ?, 'erp_planilha')
        """,
        (org, product_id, identifier_type, clean_value),
    )
    return conn.total_changes > before


IDENTIFIER_FIELD_LABELS = {
    "barcode": "Produto - codigo de barras",
    "supplier_reference": "Fornecedor - codigo do item",
}


def identifier_conflict_key(product_id: str, identifier_type: str) -> str:
    return f"{product_id}|{identifier_type}"


def manual_conflict_choices_from_payload(payload: dict) -> dict[str, str]:
    raw_choices = payload.get("manual_conflict_choices")
    if isinstance(raw_choices, str):
        try:
            raw_choices = json.loads(raw_choices or "{}")
        except json.JSONDecodeError:
            raw_choices = {}
    if isinstance(raw_choices, list):
        raw_choices = {scalar_text(item.get("key")): scalar_text(item.get("priority")) for item in raw_choices if isinstance(item, dict)}
    if not isinstance(raw_choices, dict):
        return {}
    choices = {}
    for key, value in raw_choices.items():
        clean_key = scalar_text(key)
        clean_value = scalar_text(value).lower()
        if clean_key and clean_value in {"manual", "erp"}:
            choices[clean_key] = clean_value
    return choices


def product_for_erp_code(conn: sqlite3.Connection, org: str, code: str) -> dict:
    clean_code = scalar_text(code)
    existing = conn.execute(
        "SELECT id, name FROM products WHERE organization_id = ? AND source_code = ?",
        (org, clean_code),
    ).fetchone()
    if existing:
        return {"id": existing["id"], "name": existing["name"] or "", "exists": True}
    return {"id": erp_product_id(org, clean_code), "name": "", "exists": False}


def parse_bool_flag(value: object) -> int | None:
    text = normalize(scalar_text(value))
    if not text:
        return None
    if text in {"1", "s", "sim", "y", "yes", "true", "verdadeiro", "ativo", "bloqueado", "descontinuado"}:
        return 1
    if text in {"0", "n", "nao", "no", "false", "falso", "inativo", "liberado"}:
        return 0
    return None


def upsert_imported_supplier(conn: sqlite3.Connection, *, org: str, name: str) -> str:
    supplier_name = scalar_text(name)
    if not supplier_name:
        return ""
    supplier_id = make_supplier_id(org, supplier_name)
    conn.execute(
        """
        INSERT INTO suppliers
            (id, organization_id, name, normalized_name, order_review_cycle_days, notes)
        VALUES (?, ?, ?, ?, 14, 'Criado pela importacao ERP.')
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            normalized_name = excluded.normalized_name
        """,
        (supplier_id, org, supplier_name, normalize(supplier_name)),
    )
    return supplier_id


def _supplier_profile_contact_fields(value: object) -> dict:
    contact = scalar_text(value)
    if not contact:
        return {}
    if "@" in contact:
        return {"contact_email": contact[:160]}
    digits = "".join(char for char in contact if char.isdigit())
    if len(digits) >= 7:
        return {"contact_phone": clean_phone(contact)}
    return {"contact_name": contact[:120]}


def materialize_erp_supplier_profile(
    conn: sqlite3.Connection,
    *,
    org: str,
    record: dict,
) -> dict:
    normalized = record.get("normalized") or {}
    supplier_name = scalar_text(normalized.get("fornecedor.nome_fornecedor"))
    if not supplier_name:
        return {"imported": 0, "created": 0, "updated": 0, "unchanged": 0, "invalid": 0, "status": "no_supplier"}
    fields: dict[str, object] = {}
    document = scalar_text(normalized.get("fornecedor.documento_fornecedor"))
    if document:
        fields["document"] = document[:32]
    fields.update(_supplier_profile_contact_fields(normalized.get("fornecedor.contato")))
    phone = scalar_text(normalized.get("fornecedor.telefone")) or scalar_text(normalized.get("contato.telefone"))
    if phone:
        fields["contact_phone"] = clean_phone(phone)
    email = scalar_text(normalized.get("fornecedor.email")) or scalar_text(normalized.get("contato.email"))
    if email:
        fields["contact_email"] = email[:160]
    minimum_raw = scalar_text(normalized.get("fornecedor.pedido_minimo"))
    invalid = 0
    if minimum_raw:
        minimum_order_value = parse_decimal(minimum_raw, None)
        if minimum_order_value is None:
            invalid = 1
        else:
            fields["minimum_order_value"] = minimum_order_value
    if not fields:
        return {"imported": 0, "created": 0, "updated": 0, "unchanged": 0, "invalid": invalid, "status": "no_supplier_fields"}
    existing = conn.execute(
        """
        SELECT id, document, contact_name, contact_phone, contact_email, minimum_order_value
        FROM suppliers
        WHERE organization_id = ? AND normalized_name = ?
        LIMIT 1
        """,
        (org, normalize(supplier_name)),
    ).fetchone()
    created = 0
    if existing:
        supplier_id = existing["id"]
        changed = False
        for field, imported_value in fields.items():
            current_value = existing[field]
            if field == "minimum_order_value":
                changed = changed or abs(float(current_value or 0) - float(imported_value or 0)) >= 0.005
            else:
                changed = changed or scalar_text(current_value) != scalar_text(imported_value)
            if changed:
                break
        if not changed:
            return {"imported": 0, "created": 0, "updated": 0, "unchanged": 1, "invalid": invalid, "status": "already_exists"}
    else:
        supplier_id = upsert_imported_supplier(conn, org=org, name=supplier_name)
        created = 1
    assignments = ", ".join(f"{field} = ?" for field in fields)
    conn.execute(
        f"""
        UPDATE suppliers
        SET {assignments}
        WHERE organization_id = ? AND id = ?
        """,
        (*fields.values(), org, supplier_id),
    )
    return {
        "imported": 1,
        "created": created,
        "updated": 0 if created else 1,
        "unchanged": 0,
        "invalid": invalid,
        "status": "created" if created else "updated",
    }


SETTING_FIELD_LABELS = {
    "preferred_supplier_id": "Configuracao - fornecedor preferencial",
    "package_size": "Configuracao - embalagem/multiplo de compra",
    "target_coverage_days": "Configuracao - cobertura alvo dias",
    "minimum_stock": "Configuracao - estoque minimo",
    "maximum_stock": "Configuracao - estoque maximo",
    "weight": "Configuracao - peso",
    "expires": "Configuracao - perecivel/vence",
    "blocked_for_purchase": "Configuracao - bloquear compra",
    "ignored_in_purchase_reports": "Configuracao - ignorar nos relatorios",
    "notes": "Configuracao - observacao",
}

SETTING_DEFAULTS = {
    "preferred_supplier_id": "",
    "package_size": 1.0,
    "target_coverage_days": 45,
    "minimum_stock": 0.0,
    "maximum_stock": None,
    "weight": None,
    "expires": 0,
    "blocked_for_purchase": 0,
    "ignored_in_purchase_reports": 0,
    "notes": "",
}


def setting_conflict_key(product_id: str, field: str) -> str:
    return f"{product_id}|configuracao.{field}"


def values_differ(current: object, imported: object) -> bool:
    if current is None and imported is None:
        return False
    if isinstance(current, (int, float)) or isinstance(imported, (int, float)):
        try:
            return abs(float(current or 0) - float(imported or 0)) > 0.0001
        except (TypeError, ValueError):
            return scalar_text(current) != scalar_text(imported)
    return scalar_text(current) != scalar_text(imported)


def setting_has_existing_value(field: str, value: object) -> bool:
    default = SETTING_DEFAULTS.get(field)
    if value is None:
        return False
    if default is None:
        return scalar_text(value) != ""
    return values_differ(value, default)


def bool_label(value: object) -> str:
    parsed = parse_bool_flag(value)
    if parsed is None:
        return scalar_text(value)
    return "sim" if parsed else "nao"


def setting_display_value(field: str, value: object, supplier_name: str = "") -> str:
    if field == "preferred_supplier_id":
        return supplier_name or scalar_text(value)
    if field in {"expires", "blocked_for_purchase", "ignored_in_purchase_reports"}:
        return bool_label(value)
    return scalar_text(value)


def erp_product_setting_fields(
    conn: sqlite3.Connection,
    *,
    org: str,
    normalized: dict,
    create_supplier: bool,
) -> dict:
    fields = {}
    numeric_fields = {
        "package_size": "configuracao.package_size",
        "target_coverage_days": "configuracao.target_coverage_days",
        "minimum_stock": "configuracao.minimum_stock",
        "maximum_stock": "configuracao.maximum_stock",
        "weight": "configuracao.weight",
    }
    for field, key in numeric_fields.items():
        if scalar_text(normalized.get(key)):
            value = parse_decimal(normalized.get(key), None)
            if value is not None:
                fields[field] = {
                    "value": int(value) if field == "target_coverage_days" else value,
                    "display": scalar_text(int(value) if field == "target_coverage_days" else value),
                }
    for field in ("expires", "blocked_for_purchase", "ignored_in_purchase_reports"):
        parsed = parse_bool_flag(normalized.get(f"configuracao.{field}"))
        if parsed is not None:
            fields[field] = {"value": parsed, "display": bool_label(parsed)}
    notes = scalar_text(normalized.get("configuracao.notes"))
    if notes:
        fields["notes"] = {"value": notes[:500], "display": notes[:500]}
    supplier_name = scalar_text(normalized.get("configuracao.preferred_supplier")) or scalar_text(normalized.get("fornecedor.nome_fornecedor"))
    if supplier_name:
        supplier_id = upsert_imported_supplier(conn, org=org, name=supplier_name) if create_supplier else make_supplier_id(org, supplier_name)
        fields["preferred_supplier_id"] = {"value": supplier_id, "display": supplier_name}
    return fields


def product_setting_conflicts(
    conn: sqlite3.Connection,
    *,
    org: str,
    product_id: str,
    product_code: str,
    product_name: str,
    fields: dict,
    sheet_name: str,
    row_number: int,
) -> list[dict]:
    if not fields:
        return []
    existing = conn.execute(
        """
        SELECT ps.*, COALESCE(s.name, '') AS preferred_supplier_name
        FROM product_settings ps
        LEFT JOIN suppliers s ON s.id = ps.preferred_supplier_id
        WHERE ps.organization_id = ?
          AND ps.product_id = ?
        """,
        (org, product_id),
    ).fetchone()
    if not existing:
        return []
    conflicts = []
    for field, imported in fields.items():
        current_value = existing[field]
        if not setting_has_existing_value(field, current_value):
            continue
        if values_differ(current_value, imported["value"]):
            conflicts.append(
                {
                    "key": setting_conflict_key(product_id, field),
                    "product_id": product_id,
                    "product_code": product_code,
                    "product_name": product_name or f"Produto {product_code}",
                    "field": field,
                    "field_label": SETTING_FIELD_LABELS.get(field, field),
                    "manual_value": setting_display_value(field, current_value, existing["preferred_supplier_name"] or ""),
                    "erp_value": imported["display"],
                    "sheet_name": sheet_name,
                    "row_number": row_number,
                }
            )
    return conflicts


def materialize_erp_product_settings(
    conn: sqlite3.Connection,
    *,
    org: str,
    batch_id: str,
    record: dict,
    row_number: int,
    sheet_name: str,
    manual_choices: dict[str, str] | None = None,
) -> dict:
    normalized = record.get("normalized") or {}
    code = scalar_text(normalized.get("produto.codigo_produto"))
    if not code:
        config_keys = [key for key in normalized if key.startswith("configuracao.")]
        status = "missing_product_code" if config_keys else "no_settings"
        return {"imported": 0, "status": status, "pending_conflicts": [], "resolved_conflicts": 0, "manual_values_preserved": 0}
    fields = erp_product_setting_fields(conn, org=org, normalized=normalized, create_supplier=False)
    if not fields:
        return {"imported": 0, "status": "no_settings", "pending_conflicts": [], "resolved_conflicts": 0, "manual_values_preserved": 0}
    product = product_for_erp_code(conn, org, code)
    product_id = upsert_erp_product_from_record(
        conn,
        org=org,
        batch_id=batch_id,
        code=code,
        name=scalar_text(normalized.get("produto.nome_produto")),
        payload={"source": "erp_planilha", "source_line": row_number, "raw": record.get("raw") or {}},
    )
    fields = erp_product_setting_fields(conn, org=org, normalized=normalized, create_supplier=True)
    conflicts = product_setting_conflicts(
        conn,
        org=org,
        product_id=product_id,
        product_code=code,
        product_name=scalar_text(normalized.get("produto.nome_produto")) or product.get("name") or "",
        fields=fields,
        sheet_name=sheet_name,
        row_number=row_number,
    )
    manual_choices = manual_choices or {}
    pending_conflicts = []
    resolved_conflicts = 0
    manual_values_preserved = 0
    for conflict in conflicts:
        priority = manual_choices.get(conflict["key"])
        if priority == "manual":
            manual_values_preserved += 1
            resolved_conflicts += 1
            fields.pop(conflict["field"], None)
        elif priority == "erp":
            resolved_conflicts += 1
        else:
            pending_conflicts.append(conflict)
            fields.pop(conflict["field"], None)
    if not fields:
        return {
            "imported": 0,
            "status": "manual_conflict" if pending_conflicts else "already_exists",
            "pending_conflicts": pending_conflicts,
            "resolved_conflicts": resolved_conflicts,
            "manual_values_preserved": manual_values_preserved,
        }
    assignments = ", ".join(f"{field} = ?" for field in fields)
    conn.execute(
        f"""
        UPDATE product_settings
        SET {assignments}
        WHERE organization_id = ?
          AND product_id = ?
        """,
        (*[item["value"] for item in fields.values()], org, product_id),
    )
    return {
        "imported": 1,
        "status": "updated",
        "pending_conflicts": pending_conflicts,
        "resolved_conflicts": resolved_conflicts,
        "manual_values_preserved": manual_values_preserved,
    }


def manual_identifier_conflict(
    conn: sqlite3.Connection,
    *,
    org: str,
    product_id: str,
    product_code: str,
    product_name: str,
    identifier_type: str,
    identifier_value: str,
    sheet_name: str,
    row_number: int,
) -> dict | None:
    clean_value = scalar_text(identifier_value)[:160]
    if not clean_value:
        return None
    manual = conn.execute(
        """
        SELECT identifier_value
        FROM product_identifiers
        WHERE organization_id = ?
          AND product_id = ?
          AND identifier_type = ?
          AND source_system = 'manual'
          AND identifier_value <> ?
        ORDER BY id DESC
        LIMIT 1
        """,
        (org, product_id, identifier_type, clean_value),
    ).fetchone()
    if not manual:
        return None
    return {
        "key": identifier_conflict_key(product_id, identifier_type),
        "product_id": product_id,
        "product_code": product_code,
        "product_name": product_name or f"Produto {product_code}",
        "field": identifier_type,
        "field_label": IDENTIFIER_FIELD_LABELS.get(identifier_type, identifier_type),
        "manual_value": manual["identifier_value"],
        "erp_value": clean_value,
        "sheet_name": sheet_name,
        "row_number": row_number,
    }


def detect_erp_manual_identifier_conflicts(
    conn: sqlite3.Connection,
    *,
    org: str,
    parsed_sheets: list[dict],
    mapping_by_sheet: dict,
) -> list[dict]:
    conflicts: dict[str, dict] = {}
    for sheet_index, sheet in enumerate(parsed_sheets):
        headers, data_rows, header_line = normalize_table_rows(sheet["rows"], limit=100000)
        mapping = mapping_by_sheet.get(sheet_index)
        if not mapping:
            continue
        mapping_lookup = {int(column["index"]): column for column in mapping["columns"]}
        selected_columns = [mapping_lookup[index] for index in sorted(mapping_lookup)]
        for row_number, row in enumerate(data_rows, start=header_line + 1):
            record = normalize_erp_record(row, selected_columns)
            normalized = record.get("normalized") or {}
            code = scalar_text(normalized.get("produto.codigo_produto"))
            if not code:
                continue
            product = product_for_erp_code(conn, org, code)
            if not product["exists"]:
                continue
            product_name = scalar_text(normalized.get("produto.nome_produto")) or product["name"]
            for identifier_type, normalized_key in {
                "barcode": "identificador.barcode",
                "supplier_reference": "identificador.supplier_reference",
            }.items():
                conflict = manual_identifier_conflict(
                    conn,
                    org=org,
                    product_id=product["id"],
                    product_code=code,
                    product_name=product_name,
                    identifier_type=identifier_type,
                    identifier_value=normalized.get(normalized_key),
                    sheet_name=sheet["name"],
                    row_number=row_number,
                )
                if conflict and conflict["key"] not in conflicts:
                    conflicts[conflict["key"]] = conflict
    return list(conflicts.values())


def detect_erp_product_setting_conflicts(
    conn: sqlite3.Connection,
    *,
    org: str,
    parsed_sheets: list[dict],
    mapping_by_sheet: dict,
) -> list[dict]:
    conflicts: dict[str, dict] = {}
    for sheet_index, sheet in enumerate(parsed_sheets):
        headers, data_rows, header_line = normalize_table_rows(sheet["rows"], limit=100000)
        mapping = mapping_by_sheet.get(sheet_index)
        if not mapping:
            continue
        mapping_lookup = {int(column["index"]): column for column in mapping["columns"]}
        selected_columns = [mapping_lookup[index] for index in sorted(mapping_lookup)]
        for row_number, row in enumerate(data_rows, start=header_line + 1):
            record = normalize_erp_record(row, selected_columns)
            normalized = record.get("normalized") or {}
            code = scalar_text(normalized.get("produto.codigo_produto"))
            if not code:
                continue
            product = product_for_erp_code(conn, org, code)
            if not product["exists"]:
                continue
            fields = erp_product_setting_fields(conn, org=org, normalized=normalized, create_supplier=False)
            product_name = scalar_text(normalized.get("produto.nome_produto")) or product["name"]
            for conflict in product_setting_conflicts(
                conn,
                org=org,
                product_id=product["id"],
                product_code=code,
                product_name=product_name,
                fields=fields,
                sheet_name=sheet["name"],
                row_number=row_number,
            ):
                if conflict["key"] not in conflicts:
                    conflicts[conflict["key"]] = conflict
    return list(conflicts.values())


def materialize_erp_identifiers(
    conn: sqlite3.Connection,
    *,
    org: str,
    batch_id: str,
    record: dict,
    row_number: int,
    sheet_name: str,
    manual_choices: dict[str, str] | None = None,
) -> dict:
    normalized = record.get("normalized") or {}
    barcode = scalar_text(normalized.get("identificador.barcode"))
    supplier_reference = scalar_text(normalized.get("identificador.supplier_reference"))
    if not barcode and not supplier_reference:
        return {"imported": 0, "status": "no_identifier", "pending_conflicts": [], "resolved_conflicts": 0, "manual_values_preserved": 0}
    code = scalar_text(normalized.get("produto.codigo_produto"))
    if not code:
        return {"imported": 0, "status": "missing_product_code", "pending_conflicts": [], "resolved_conflicts": 0, "manual_values_preserved": 0}
    product_id = upsert_erp_product_from_record(
        conn,
        org=org,
        batch_id=batch_id,
        code=code,
        name=scalar_text(normalized.get("produto.nome_produto")),
        payload={"source": "erp_planilha", "source_line": row_number, "raw": record.get("raw") or {}},
    )
    inserted = 0
    pending_conflicts = []
    resolved_conflicts = 0
    manual_values_preserved = 0
    manual_choices = manual_choices or {}
    for identifier_type, identifier_value in {"barcode": barcode, "supplier_reference": supplier_reference}.items():
        if not identifier_value:
            continue
        conflict = manual_identifier_conflict(
            conn,
            org=org,
            product_id=product_id,
            product_code=code,
            product_name=scalar_text(normalized.get("produto.nome_produto")),
            identifier_type=identifier_type,
            identifier_value=identifier_value,
            sheet_name=sheet_name,
            row_number=row_number,
        )
        if conflict:
            priority = manual_choices.get(conflict["key"])
            if priority == "manual":
                manual_values_preserved += 1
                resolved_conflicts += 1
                continue
            if priority != "erp":
                pending_conflicts.append(conflict)
                continue
            resolved_conflicts += 1
        if upsert_product_identifier(conn, org=org, product_id=product_id, identifier_type=identifier_type, identifier_value=identifier_value):
            inserted += 1
    status = "inserted" if inserted else "already_exists"
    if pending_conflicts:
        status = "manual_conflict"
    return {
        "imported": inserted,
        "status": status,
        "pending_conflicts": pending_conflicts,
        "resolved_conflicts": resolved_conflicts,
        "manual_values_preserved": manual_values_preserved,
    }


def api_erp_import_commit(conn: sqlite3.Connection, payload: dict) -> dict:
    file_name, parsed_sheets, metadata, content_hash, file_size = parse_erp_file_payload(payload)
    analyzed = [analyze_erp_sheet(sheet) for sheet in parsed_sheets]
    mappings = selected_mapping_from_payload(payload)
    mapping_by_sheet = {int(sheet["sheet_index"]): sheet for sheet in mappings}
    organization_id = default_organization_id(conn) or "org_practica"
    manual_conflict_choices = manual_conflict_choices_from_payload(payload)
    conflict_check_only = scalar_text(payload.get("conflict_check_only")).lower() in {"1", "true", "sim", "yes"}
    if conflict_check_only:
        manual_conflicts = detect_erp_manual_identifier_conflicts(
            conn,
            org=organization_id,
            parsed_sheets=parsed_sheets,
            mapping_by_sheet=mapping_by_sheet,
        )
        manual_conflicts.extend(
            detect_erp_product_setting_conflicts(
                conn,
                org=organization_id,
                parsed_sheets=parsed_sheets,
                mapping_by_sheet=mapping_by_sheet,
            )
        )
        manual_conflicts = list({conflict["key"]: conflict for conflict in manual_conflicts}.values())
        return {
            "ok": True,
            "requires_manual_resolution": bool(manual_conflicts),
            "manual_conflicts": manual_conflicts,
            "summary": {"manual_conflicts": len(manual_conflicts)},
        }
    store_id = scalar_text(payload.get("store_id"))
    import_mode = scalar_text(payload.get("import_mode")) or "configured_refresh"
    batch_id = f"erp:{datetime.now().strftime('%Y%m%d%H%M%S')}:{uuid4().hex[:8]}"
    source_file_id = f"{batch_id}:arquivo"
    total_rows = 0
    mapped_rows = 0
    empty_mapping_rows = 0
    cost_snapshots_imported = 0
    cost_rows_missing_product_code = 0
    price_snapshots_imported = 0
    price_rows_missing_product_code = 0
    price_rows_invalid_value = 0
    inventory_snapshots_imported = 0
    inventory_snapshots_updated = 0
    inventory_rows_missing_product_code = 0
    inventory_rows_invalid_value = 0
    product_sales_imported = 0
    product_sales_duplicates = 0
    product_sales_missing_product_code = 0
    product_sales_invalid_date = 0
    service_sales_imported = 0
    service_sales_duplicates = 0
    service_sales_invalid_date = 0
    identifiers_imported = 0
    identifier_rows_missing_product_code = 0
    product_settings_imported = 0
    settings_rows_missing_product_code = 0
    supplier_profiles_imported = 0
    supplier_profiles_created = 0
    supplier_profiles_updated = 0
    supplier_profile_invalid_rows = 0
    manual_conflicts_pending = []
    manual_conflicts_resolved = 0
    manual_values_preserved = 0
    saved_mapping_summary = []
    product_dependent_rows = 0
    product_code_values = set()
    price_product_codes = set()
    cost_product_codes = set()
    inventory_product_codes = set()
    product_sale_codes = set()
    service_sale_names = set()
    conn.execute(
        """
        INSERT OR IGNORE INTO organizations (id, name)
        VALUES (?, ?)
        """,
        (organization_id, "Empresa importada"),
    )
    if not store_id:
        store_id = ensure_default_store(conn, organization_id)
    product_sales_existing_max_date = one(
        conn,
        "SELECT MAX(substr(sold_at, 1, 10)) AS max_date FROM product_sales WHERE organization_id = ?",
        (organization_id,),
    ).get("max_date") or ""
    service_sales_existing_max_date = one(
        conn,
        "SELECT MAX(substr(emitted_at, 1, 10)) AS max_date FROM service_sales WHERE organization_id = ?",
        (organization_id,),
    ).get("max_date") or ""
    conn.execute(
        """
        INSERT INTO import_batches
            (id, organization_id, store_id, source_system, status, import_mode, started_at, summary_json)
        VALUES (?, ?, NULLIF(?, ''), 'erp_planilha', 'running', ?, CURRENT_TIMESTAMP, '{}')
        """,
        (batch_id, organization_id, store_id, import_mode),
    )
    conn.execute(
        """
        INSERT INTO source_files
            (id, import_batch_id, file_name, file_role, file_size_bytes, content_hash, encoding, row_count, metadata_json)
        VALUES (?, ?, ?, 'erp_sheet', ?, ?, ?, ?, ?)
        """,
        (
            source_file_id,
            batch_id,
            file_name,
            file_size,
            content_hash,
            "zip/xml" if metadata.get("format") == "xlsx" else "utf-8",
            sum(sheet.get("row_count") or 0 for sheet in analyzed),
            json.dumps(metadata, ensure_ascii=False),
        ),
    )
    for sheet_index, sheet in enumerate(parsed_sheets):
        headers, data_rows, header_line = normalize_table_rows(sheet["rows"], limit=100000)
        mapping = mapping_by_sheet.get(sheet_index)
        if not mapping:
            empty_mapping_rows += len(data_rows)
            continue
        if not mapping.get("signature"):
            mapping["signature"] = erp_sheet_signature([{"header": header} for header in headers])
        mapping_lookup = {int(column["index"]): column for column in mapping["columns"]}
        selected_columns = [mapping_lookup[index] for index in sorted(mapping_lookup)]
        product_context = {}
        service_context = {}
        saved_mapping_summary.append(
            {
                "sheet_name": mapping["sheet_name"],
                "signature": mapping["signature"],
                "header_line": header_line,
                "mapping": {
                    str(column["index"]): {
                        "entity": column["entity"],
                        "field": column["field"],
                        "label": column["label"],
                    }
                    for column in selected_columns
                },
            }
        )
        for row_number, row in enumerate(data_rows, start=header_line + 1):
            total_rows += 1
            record = normalize_erp_record(row, selected_columns)
            product_context = apply_erp_product_context(record, product_context)
            service_context = apply_erp_service_context(record, service_context)
            normalized = record.get("normalized") or {}
            product_code = scalar_text(normalized.get("produto.codigo_produto"))
            if product_code:
                product_code_values.add(product_code)
            if any(
                scalar_text(normalized.get(key))
                for key in (
                    "estoque.estoque_atual",
                    "preco.preco_venda",
                    "custo.purchase_cost",
                    "custo.total_cost",
                    "custo.custo",
                    "venda.quantidade_vendida",
                    "venda.valor_venda",
                )
            ) and "servico.nome_servico" not in normalized:
                product_dependent_rows += 1
            if record["normalized"]:
                mapped_rows += 1
            else:
                empty_mapping_rows += 1
            source_key = "|".join(str(record["normalized"].get(key, "")) for key in sorted(record["normalized"])[:3])
            conn.execute(
                """
                INSERT INTO source_records
                    (import_batch_id, source_file_id, record_type, source_line, source_key,
                     raw_payload_json, normalized_payload_json, record_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    batch_id,
                    source_file_id,
                    sheet["name"],
                    row_number,
                    source_key[:200],
                    json.dumps(record["raw"], ensure_ascii=False),
                    json.dumps(record["normalized"], ensure_ascii=False),
                    hashlib.sha256(json.dumps(record, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest(),
                ),
            )
            supplier_profile_result = materialize_erp_supplier_profile(
                conn,
                org=organization_id,
                record=record,
            )
            supplier_profiles_imported += int(supplier_profile_result["imported"])
            supplier_profiles_created += int(supplier_profile_result["created"])
            supplier_profiles_updated += int(supplier_profile_result["updated"])
            supplier_profile_invalid_rows += int(supplier_profile_result["invalid"])
            cost_status = materialize_erp_cost_snapshot(
                conn,
                org=organization_id,
                batch_id=batch_id,
                record=record,
                row_number=row_number,
            )
            if cost_status == "inserted":
                cost_snapshots_imported += 1
                if product_code:
                    cost_product_codes.add(product_code)
            elif cost_status == "missing_product_code":
                cost_rows_missing_product_code += 1
            price_status = materialize_erp_price_snapshot(
                conn,
                org=organization_id,
                batch_id=batch_id,
                store_id=store_id,
                record=record,
                row_number=row_number,
            )
            if price_status == "inserted":
                price_snapshots_imported += 1
                if product_code:
                    price_product_codes.add(product_code)
            elif price_status == "missing_product_code":
                price_rows_missing_product_code += 1
            elif price_status == "invalid_price":
                price_rows_invalid_value += 1
            inventory_status = materialize_erp_inventory_snapshot(
                conn,
                org=organization_id,
                batch_id=batch_id,
                store_id=store_id,
                record=record,
                row_number=row_number,
            )
            if inventory_status == "inserted":
                inventory_snapshots_imported += 1
                if product_code:
                    inventory_product_codes.add(product_code)
            elif inventory_status == "updated":
                inventory_snapshots_updated += 1
                if product_code:
                    inventory_product_codes.add(product_code)
            elif inventory_status == "missing_product_code":
                inventory_rows_missing_product_code += 1
            elif inventory_status == "invalid_stock":
                inventory_rows_invalid_value += 1
            product_sale_status = materialize_erp_product_sale(
                conn,
                org=organization_id,
                batch_id=batch_id,
                store_id=store_id,
                record=record,
                row_number=row_number,
                existing_max_date=product_sales_existing_max_date,
            )
            if product_sale_status == "inserted":
                product_sales_imported += 1
                if product_code:
                    product_sale_codes.add(product_code)
            elif product_sale_status == "duplicate":
                product_sales_duplicates += 1
            elif product_sale_status == "missing_product_code":
                product_sales_missing_product_code += 1
            elif product_sale_status == "invalid_date":
                product_sales_invalid_date += 1
            service_sale_status = materialize_erp_service_sale(
                conn,
                org=organization_id,
                batch_id=batch_id,
                store_id=store_id,
                record=record,
                row_number=row_number,
                existing_max_date=service_sales_existing_max_date,
            )
            if service_sale_status == "inserted":
                service_sales_imported += 1
                service_name = scalar_text(normalized.get("servico.nome_servico"))
                if service_name:
                    service_sale_names.add(service_name)
            elif service_sale_status == "duplicate":
                service_sales_duplicates += 1
            elif service_sale_status == "invalid_date":
                service_sales_invalid_date += 1
            identifier_result = materialize_erp_identifiers(
                conn,
                org=organization_id,
                batch_id=batch_id,
                record=record,
                row_number=row_number,
                sheet_name=sheet["name"],
                manual_choices=manual_conflict_choices,
            )
            identifiers_imported += int(identifier_result["imported"])
            manual_conflicts_pending.extend(identifier_result["pending_conflicts"])
            manual_conflicts_resolved += int(identifier_result["resolved_conflicts"])
            manual_values_preserved += int(identifier_result["manual_values_preserved"])
            if identifier_result["status"] == "missing_product_code":
                identifier_rows_missing_product_code += 1
            settings_status = materialize_erp_product_settings(
                conn,
                org=organization_id,
                batch_id=batch_id,
                record=record,
                row_number=row_number,
                sheet_name=sheet["name"],
                manual_choices=manual_conflict_choices,
            )
            product_settings_imported += int(settings_status["imported"])
            manual_conflicts_pending.extend(settings_status["pending_conflicts"])
            manual_conflicts_resolved += int(settings_status["resolved_conflicts"])
            manual_values_preserved += int(settings_status["manual_values_preserved"])
            if settings_status["status"] == "missing_product_code":
                settings_rows_missing_product_code += 1
    conn.execute(
        """
        UPDATE source_files
        SET row_count = ?
        WHERE id = ?
        """,
        (total_rows, source_file_id),
    )
    manual_conflicts_pending = list({conflict["key"]: conflict for conflict in manual_conflicts_pending}.values())
    if empty_mapping_rows:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'warning', 'erp_unmapped_rows', ?)
            """,
            (batch_id, source_file_id, f"{empty_mapping_rows} linhas ficaram sem campo canonico mapeado."),
        )
    if product_dependent_rows and len(product_code_values) < max(20, int(product_dependent_rows * 0.5)):
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'warning', 'erp_low_product_code_coverage', ?)
            """,
            (
                batch_id,
                source_file_id,
                f"A planilha tem {product_dependent_rows} linhas dependentes de produto, mas apenas {len(product_code_values)} codigo(s) de produto distintos foram identificados.",
            ),
        )
    if cost_rows_missing_product_code:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'warning', 'erp_cost_without_product_code', ?)
            """,
            (batch_id, source_file_id, f"{cost_rows_missing_product_code} linhas tinham custo, mas nao tinham codigo de produto mapeado."),
        )
    if price_snapshots_imported:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'info', 'erp_prices_imported', ?)
            """,
            (batch_id, source_file_id, f"{price_snapshots_imported} precos importados para o catalogo."),
        )
    if price_rows_missing_product_code:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'warning', 'erp_price_without_product_code', ?)
            """,
            (batch_id, source_file_id, f"{price_rows_missing_product_code} linhas tinham preco, mas nao tinham codigo de produto mapeado."),
        )
    if price_rows_invalid_value:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'warning', 'erp_price_invalid_value', ?)
            """,
            (batch_id, source_file_id, f"{price_rows_invalid_value} linhas tinham preco invalido e foram ignoradas."),
        )
    if inventory_rows_missing_product_code:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'warning', 'erp_stock_without_product_code', ?)
            """,
            (batch_id, source_file_id, f"{inventory_rows_missing_product_code} linhas tinham estoque, mas nao tinham codigo de produto mapeado."),
        )
    if inventory_rows_invalid_value:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'warning', 'erp_stock_invalid_value', ?)
            """,
            (batch_id, source_file_id, f"{inventory_rows_invalid_value} linhas tinham valor de estoque invalido e foram ignoradas."),
        )
    if inventory_snapshots_updated:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'info', 'erp_stock_rows_updated', ?)
            """,
            (batch_id, source_file_id, f"{inventory_snapshots_updated} linha(s) atualizaram snapshots de estoque ja criados no mesmo lote."),
        )
    if product_sales_imported:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'info', 'erp_product_sales_imported', ?)
            """,
            (batch_id, source_file_id, f"{product_sales_imported} vendas de produtos importadas."),
        )
    if product_sales_missing_product_code:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'warning', 'erp_product_sale_without_product_code', ?)
            """,
            (batch_id, source_file_id, f"{product_sales_missing_product_code} linhas de venda nao tinham codigo de produto suficiente para materializar."),
        )
    if product_sales_invalid_date:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'warning', 'erp_product_sale_invalid_date', ?)
            """,
            (batch_id, source_file_id, f"{product_sales_invalid_date} linhas de venda tinham data invalida e foram ignoradas."),
        )
    if service_sales_imported:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'info', 'erp_service_sales_imported', ?)
            """,
            (batch_id, source_file_id, f"{service_sales_imported} vendas de servicos importadas."),
        )
    if service_sales_invalid_date:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'warning', 'erp_service_sale_invalid_date', ?)
            """,
            (batch_id, source_file_id, f"{service_sales_invalid_date} linhas de servico tinham data invalida e foram ignoradas."),
        )
    if identifier_rows_missing_product_code:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'warning', 'erp_identifier_without_product_code', ?)
            """,
            (batch_id, source_file_id, f"{identifier_rows_missing_product_code} linhas tinham codigo de barras ou codigo do fornecedor, mas nao tinham codigo de produto mapeado."),
        )
    if settings_rows_missing_product_code:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'warning', 'erp_settings_without_product_code', ?)
            """,
            (batch_id, source_file_id, f"{settings_rows_missing_product_code} linhas tinham configuracoes operacionais, mas nao tinham codigo de produto mapeado."),
        )
    if supplier_profile_invalid_rows:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'warning', 'erp_supplier_profile_invalid_value', ?)
            """,
            (batch_id, source_file_id, f"{supplier_profile_invalid_rows} linha(s) de fornecedor tinham pedido minimo invalido e foram parcialmente aproveitadas."),
        )
    if manual_conflicts_pending:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'warning', 'erp_manual_identifier_conflict', ?)
            """,
            (batch_id, source_file_id, f"{len(manual_conflicts_pending)} divergencias com dados manuais foram preservadas e precisam de decisao."),
        )
    summary = {
        "file_name": file_name,
        "content_hash": content_hash,
        "format": metadata.get("format"),
        "rows": total_rows,
        "mapped_rows": mapped_rows,
        "unmapped_rows": empty_mapping_rows,
        "product_dependent_rows": product_dependent_rows,
        "product_codes_detected": len(product_code_values),
        "cost_snapshots_imported": cost_snapshots_imported,
        "cost_products_imported": len(cost_product_codes),
        "cost_rows_missing_product_code": cost_rows_missing_product_code,
        "price_snapshots_imported": price_snapshots_imported,
        "price_products_imported": len(price_product_codes),
        "price_rows_missing_product_code": price_rows_missing_product_code,
        "price_rows_invalid_value": price_rows_invalid_value,
        "inventory_snapshots_imported": inventory_snapshots_imported,
        "inventory_snapshots_updated": inventory_snapshots_updated,
        "inventory_products_imported": len(inventory_product_codes),
        "inventory_rows_missing_product_code": inventory_rows_missing_product_code,
        "inventory_rows_invalid_value": inventory_rows_invalid_value,
        "product_sales_imported": product_sales_imported,
        "product_sales_products_imported": len(product_sale_codes),
        "product_sales_duplicates": product_sales_duplicates,
        "product_sales_missing_product_code": product_sales_missing_product_code,
        "product_sales_invalid_date": product_sales_invalid_date,
        "service_sales_imported": service_sales_imported,
        "service_sales_services_imported": len(service_sale_names),
        "service_sales_duplicates": service_sales_duplicates,
        "service_sales_invalid_date": service_sales_invalid_date,
        "identifiers_imported": identifiers_imported,
        "identifier_rows_missing_product_code": identifier_rows_missing_product_code,
        "product_settings_imported": product_settings_imported,
        "settings_rows_missing_product_code": settings_rows_missing_product_code,
        "supplier_profiles_imported": supplier_profiles_imported,
        "supplier_profiles_created": supplier_profiles_created,
        "supplier_profiles_updated": supplier_profiles_updated,
        "supplier_profile_invalid_rows": supplier_profile_invalid_rows,
        "manual_conflicts_pending": len(manual_conflicts_pending),
        "manual_conflicts_resolved": manual_conflicts_resolved,
        "manual_values_preserved": manual_values_preserved,
        "manual_conflicts": manual_conflicts_pending[:50],
        "mappings": saved_mapping_summary,
    }
    conn.execute(
        """
        UPDATE import_batches
        SET status = 'completed',
            finished_at = CURRENT_TIMESTAMP,
            summary_json = ?
        WHERE id = ?
        """,
        (json.dumps(summary, ensure_ascii=False), batch_id),
    )
    seed_brand_suppliers(conn)
    conn.commit()
    return {"ok": True, "batch_id": batch_id, "summary": summary, "imports": api_imports(conn)}


def api_import_readiness(conn: sqlite3.Connection) -> dict:
    coverage = one(
        conn,
        """
        SELECT
            (SELECT COUNT(*) FROM products) AS products,
            (SELECT COUNT(DISTINCT product_id) FROM price_snapshots) AS products_with_price,
            (SELECT COUNT(DISTINCT product_id) FROM inventory_snapshots) AS products_with_stock,
            (SELECT COUNT(DISTINCT product_id) FROM cost_snapshots) AS products_with_cost,
            (SELECT COUNT(*) FROM product_sales) AS product_sales,
            (SELECT COUNT(DISTINCT product_id) FROM product_sales) AS products_with_sales,
            (SELECT COUNT(DISTINCT substr(sold_at, 1, 7)) FROM product_sales) AS sales_months,
            (SELECT COUNT(*) FROM service_sales) AS service_sales,
            (SELECT COUNT(*) FROM services) AS services,
            (SELECT COUNT(*) FROM customers) AS customers,
            (SELECT COUNT(*) FROM suppliers) AS suppliers,
            (SELECT COUNT(*) FROM product_settings WHERE COALESCE(package_size, 1) > 1) AS products_with_package,
            (SELECT COUNT(DISTINCT product_id) FROM product_identifiers WHERE identifier_type = 'barcode') AS products_with_barcode,
            (SELECT COUNT(DISTINCT product_id) FROM product_identifiers WHERE identifier_type = 'supplier_reference') AS products_with_supplier_reference,
            (SELECT COUNT(*) FROM source_files WHERE LOWER(file_name) LIKE '%saidaprodlucro%') AS deprecated_profit_files
        """
    ) or {}
    product_count = int(coverage.get("products") or 0)

    def pct(value: object, total: int = product_count) -> int:
        if not total:
            return 0
        return int(round((int(value or 0) / total) * 100))

    plan = [
        {
            "id": "products_prices_stock",
            "priority": "essencial",
            "title": "Produtos, precos e estoque",
            "expected_files": ["produtopreco", "cadastro de produtos", "estoque"],
            "what_to_send": ["codigo interno", "descricao", "unidade", "marca", "codigo de barras", "preco de venda", "estoque atual"],
            "used_for": ["ranking de produtos", "reposicao", "precificacao", "busca por EAN", "mix ativo"],
            "coverage": {
                "products": product_count,
                "products_with_price": int(coverage.get("products_with_price") or 0),
                "products_with_stock": int(coverage.get("products_with_stock") or 0),
                "products_with_barcode": int(coverage.get("products_with_barcode") or 0),
                "price_pct": pct(coverage.get("products_with_price")),
                "stock_pct": pct(coverage.get("products_with_stock")),
                "barcode_pct": pct(coverage.get("products_with_barcode")),
            },
        },
        {
            "id": "purchase_costs",
            "priority": "essencial",
            "title": "Custos de compra e impostos",
            "expected_files": ["produtocusto", "tabela de custo do fornecedor"],
            "what_to_send": ["preco sem impostos", "preco com impostos", "frete", "ICMS", "IPI", "data do custo"],
            "used_for": ["margem", "preco alvo", "decisao de compra", "alerta de custo"],
            "coverage": {
                "products_with_cost": int(coverage.get("products_with_cost") or 0),
                "cost_pct": pct(coverage.get("products_with_cost")),
            },
        },
        {
            "id": "product_sales",
            "priority": "essencial",
            "title": "Vendas de produtos",
            "expected_files": ["saidaprod", "saida de produtos", "vendas por item"],
            "what_to_send": ["data da venda", "codigo do produto", "quantidade", "valor vendido", "cliente", "documento/pedido"],
            "used_for": ["demanda", "curva ABC", "reposicao", "clientes", "oportunidades"],
            "coverage": {
                "rows": int(coverage.get("product_sales") or 0),
                "products_with_sales": int(coverage.get("products_with_sales") or 0),
                "sales_months": int(coverage.get("sales_months") or 0),
            },
        },
        {
            "id": "services",
            "priority": "recomendado",
            "title": "Servicos vendidos",
            "expected_files": ["servico", "vendas de servicos"],
            "what_to_send": ["data", "servico", "cliente", "quantidade", "valor bruto", "impostos", "valor liquido"],
            "used_for": ["ranking de servicos", "carteira de clientes", "margem de servico"],
            "coverage": {
                "rows": int(coverage.get("service_sales") or 0),
                "services": int(coverage.get("services") or 0),
            },
        },
        {
            "id": "supplier_identifiers",
            "priority": "recomendado",
            "title": "Codigos para compra e fornecedores",
            "expected_files": ["referencias do fornecedor", "cadastro fornecedor-produto", "contatos de fornecedores"],
            "what_to_send": ["codigo que o fornecedor usa no item", "fornecedor", "CNPJ", "telefone", "contato", "pedido minimo"],
            "used_for": ["cotacao", "pedido de compra", "evitar codigo interno em cotacao", "minimo por fornecedor"],
            "coverage": {
                "products_with_supplier_reference": int(coverage.get("products_with_supplier_reference") or 0),
                "supplier_reference_pct": pct(coverage.get("products_with_supplier_reference")),
                "suppliers": int(coverage.get("suppliers") or 0),
            },
        },
        {
            "id": "operational_settings",
            "priority": "recomendado",
            "title": "Configuracoes operacionais importaveis",
            "expected_files": ["parametros de compra", "cadastro operacional", "planilha de ajustes manuais"],
            "what_to_send": ["fornecedor preferencial", "embalagem/multiplo de compra", "cobertura alvo em dias", "estoque minimo", "estoque maximo", "peso", "perecivel", "bloquear compra", "ignorar relatorios", "observacao"],
            "used_for": ["reposicao mais fiel", "pedido por caixa/fardo", "bloqueio de item descontinuado", "migrar ajustes manuais do ERP"],
            "coverage": {
                "products_with_package": int(coverage.get("products_with_package") or 0),
                "products_with_supplier_reference": int(coverage.get("products_with_supplier_reference") or 0),
                "package_pct": pct(coverage.get("products_with_package")),
            },
        },
        {
            "id": "nexo_derived",
            "priority": "travado",
            "title": "Campos derivados pelo Nexo",
            "expected_files": ["nao importar"],
            "what_to_send": [],
            "used_for": ["curva ABC", "demanda prevista", "sugestao de compra", "prioridade", "score de maturidade", "oportunidades", "alertas"],
            "coverage": {"stage": "calculado por analise e cruzamento"},
        },
        {
            "id": "purchase_history",
            "priority": "ambicioso",
            "title": "Historico de compras e recebimentos",
            "expected_files": ["pedidos de compra", "entradas de nota", "recebimentos por item"],
            "what_to_send": ["pedido de compra", "nota fiscal", "fornecedor", "produto", "quantidade comprada", "preco negociado", "data de compra", "data de entrega", "prazo de entrega"],
            "used_for": ["lead time real", "comparar fornecedor", "previsao de ruptura", "validar custo importado", "performance de entrega"],
            "coverage": {"stage": "capturar e aprender"},
        },
        {
            "id": "fiscal_documents",
            "priority": "ambicioso",
            "title": "Dados fiscais por item",
            "expected_files": ["XML/NFe", "itens de nota fiscal", "livro fiscal"],
            "what_to_send": ["chave NFe", "CFOP", "NCM", "CEST", "CST/CSOSN", "base ICMS", "aliquota ICMS", "PIS", "COFINS", "IPI", "ICMS-ST"],
            "used_for": ["custo tributario real", "divergencia fiscal", "margem por regime", "conferencia de imposto no custo"],
            "coverage": {"stage": "capturar e auditar"},
        },
        {
            "id": "inventory_movements",
            "priority": "ambicioso",
            "title": "Movimentos de estoque",
            "expected_files": ["movimento de estoque", "ajustes", "transferencias", "perdas"],
            "what_to_send": ["data", "produto", "deposito/filial", "tipo de movimento", "quantidade", "motivo", "documento", "usuario"],
            "used_for": ["perdas e ajustes", "estoque por deposito", "ruptura invisivel", "confiabilidade do saldo"],
            "coverage": {"stage": "capturar e reconciliar"},
        },
        {
            "id": "customer_commercial",
            "priority": "ambicioso",
            "title": "Cadastro e perfil comercial de clientes",
            "expected_files": ["cadastro de clientes", "enderecos", "limite de credito", "segmentos"],
            "what_to_send": ["codigo", "nome", "CPF/CNPJ", "cidade", "UF", "telefone", "e-mail", "segmento", "limite de credito", "vendedor responsavel"],
            "used_for": ["carteira comercial", "reativacao", "geografia de vendas", "risco de credito", "rotina do vendedor"],
            "coverage": {"customers": int(coverage.get("customers") or 0)},
        },
        {
            "id": "financial_titles",
            "priority": "ambicioso",
            "title": "Financeiro: contas a receber e pagar",
            "expected_files": ["contas a receber", "contas a pagar", "baixas", "inadimplencia"],
            "what_to_send": ["tipo do titulo", "cliente/fornecedor", "documento", "emissao", "vencimento", "pagamento", "valor", "saldo", "status"],
            "used_for": ["fluxo de caixa", "inadimplencia", "prioridade de cobranca", "compra segura por caixa"],
            "coverage": {"stage": "capturar e cruzar com vendas/compras"},
        },
        {
            "id": "sales_context",
            "priority": "ambicioso",
            "title": "Contexto da venda",
            "expected_files": ["vendas por vendedor", "formas de pagamento", "canais", "devolucoes"],
            "what_to_send": ["vendedor", "canal", "forma de pagamento", "desconto", "devolucao", "cancelamento", "promocao", "pedido/origem"],
            "used_for": ["margem por canal", "desconto fora do padrao", "performance comercial", "venda perdida por devolucao"],
            "coverage": {"stage": "enriquecer vendas"},
        },
        {
            "id": "product_master_data",
            "priority": "ambicioso",
            "title": "Cadastro mestre do produto",
            "expected_files": ["cadastro completo de produtos", "familia/categoria", "embalagens", "localizacao"],
            "what_to_send": ["NCM", "CEST", "origem", "familia", "categoria", "peso", "dimensoes", "multiplo de compra", "caixa/fardo", "estoque minimo", "localizacao"],
            "used_for": ["compra por embalagem", "separacao", "curva por categoria", "custo logistico", "cadastro incompleto"],
            "coverage": {"products": product_count},
        },
        {
            "id": "deprecated_profit",
            "priority": "dispensado",
            "title": "Resumo de lucro por produto",
            "expected_files": ["saidaprodlucro"],
            "what_to_send": [],
            "used_for": ["dispensado: vendas, custos e precos ja cobrem melhor o fluxo atual"],
            "coverage": {"deprecated_files": int(coverage.get("deprecated_profit_files") or 0)},
        },
    ]
    return {"coverage": dict(coverage), "plan": plan}


def import_quality_report(conn: sqlite3.Connection) -> dict:
    latest = one(
        conn,
        """
        SELECT id, source_system, status, started_at, finished_at, summary_json
        FROM import_batches
        ORDER BY started_at DESC
        LIMIT 1
        """,
    )
    if not latest:
        return {
            "status": "no_imports",
            "score": 0,
            "latest_batch_id": "",
            "summary": {
                "rows": 0,
                "mapped_rows": 0,
                "unmapped_rows": 0,
                "files": 0,
                "issues": 0,
                "changes_pending": 0,
                "manual_conflicts_pending": 0,
            },
            "checks": [
                {
                    "id": "first_import",
                    "status": "pending",
                    "title": "Executar primeira importacao",
                    "body": "Nenhum lote foi registrado ainda.",
                }
            ],
            "next_step": "Importe uma planilha ou rode o conector local para gerar o primeiro diagnostico.",
        }
    try:
        summary_json = json.loads(latest.get("summary_json") or "{}")
    except json.JSONDecodeError:
        summary_json = {}
    files = rows(
        conn,
        """
        SELECT file_name, file_role, row_count, file_size_bytes, encoding
        FROM source_files
        WHERE import_batch_id = ?
        ORDER BY file_name
        """,
        (latest["id"],),
    )
    issue_counts = rows(
        conn,
        """
        SELECT severity, COUNT(*) AS count
        FROM import_issues
        WHERE import_batch_id = ?
        GROUP BY severity
        """,
        (latest["id"],),
    )
    change_counts = rows(
        conn,
        """
        SELECT review_status, COUNT(*) AS count
        FROM source_entity_changes
        WHERE import_batch_id = ?
        GROUP BY review_status
        """,
        (latest["id"],),
    )
    record_count = int(
        one(conn, "SELECT COUNT(*) AS count FROM source_records WHERE import_batch_id = ?", (latest["id"],)).get("count") or 0
    )
    issues_by_severity = {row["severity"]: int(row["count"] or 0) for row in issue_counts}
    changes_by_status = {row["review_status"] or "pending": int(row["count"] or 0) for row in change_counts}
    rows_total = int(summary_json.get("rows") or sum(int(file.get("row_count") or 0) for file in files))
    mapped_rows = int(summary_json.get("mapped_rows") or record_count)
    unmapped_rows = int(summary_json.get("unmapped_rows") or 0)
    errors = issues_by_severity.get("error", 0)
    warnings = issues_by_severity.get("warning", 0)
    manual_pending = int(summary_json.get("manual_conflicts_pending") or 0)
    changes_pending = changes_by_status.get("pending", 0)
    checks = []
    score = 100
    if latest["status"] != "completed":
        score -= 35
        checks.append(
            {
                "id": "batch_status",
                "status": "blocked",
                "title": "Lote ainda nao concluido",
                "body": f"Status atual: {latest['status']}.",
            }
        )
    if rows_total <= 0:
        score -= 25
        checks.append(
            {
                "id": "empty_batch",
                "status": "blocked",
                "title": "Nenhuma linha util importada",
                "body": "O ultimo lote nao registrou linhas lidas.",
            }
        )
    if errors:
        score -= min(35, errors * 10)
        checks.append(
            {
                "id": "errors",
                "status": "blocked",
                "title": "Erros de importacao",
                "body": f"{errors} erro(s) precisam ser resolvidos antes da beta confiar no lote.",
            }
        )
    if manual_pending:
        score -= min(25, manual_pending * 8)
        checks.append(
            {
                "id": "manual_conflicts",
                "status": "attention",
                "title": "Conflitos manuais pendentes",
                "body": f"{manual_pending} divergencia(s) entre ERP e decisao manual precisam de escolha explicita.",
            }
        )
    if warnings:
        score -= min(20, warnings * 5)
        checks.append(
            {
                "id": "warnings",
                "status": "attention",
                "title": "Avisos de importacao",
                "body": f"{warnings} aviso(s) indicam dados ausentes, nao mapeados ou parcialmente aproveitados.",
            }
        )
    if unmapped_rows:
        score -= min(20, max(1, int((unmapped_rows / max(rows_total, 1)) * 100)))
        checks.append(
            {
                "id": "unmapped_rows",
                "status": "attention",
                "title": "Linhas sem mapeamento canonico",
                "body": f"{unmapped_rows} de {rows_total} linha(s) ficaram sem campo canonico mapeado.",
            }
        )
    duplicate_rows = int(summary_json.get("product_sales_duplicates") or 0) + int(summary_json.get("service_sales_duplicates") or 0)
    imported_rows = (
        int(summary_json.get("product_sales_imported") or 0)
        + int(summary_json.get("service_sales_imported") or 0)
        + int(summary_json.get("inventory_snapshots_imported") or 0)
        + int(summary_json.get("cost_snapshots_imported") or 0)
        + int(summary_json.get("price_snapshots_imported") or 0)
    )
    if rows_total and duplicate_rows >= max(1, rows_total - 1) and imported_rows == 0:
        score -= 15
        checks.append(
            {
                "id": "no_new_rows",
                "status": "attention",
                "title": "Arquivo sem dados novos",
                "body": f"{duplicate_rows} linha(s) ja estavam cobertas por importacoes anteriores.",
            }
        )
    product_dependent_rows = int(summary_json.get("product_dependent_rows") or 0)
    product_codes_detected = int(summary_json.get("product_codes_detected") or 0)
    if product_dependent_rows and product_codes_detected < max(20, int(product_dependent_rows * 0.5)):
        score -= 25
        checks.append(
            {
                "id": "low_product_code_coverage",
                "status": "attention",
                "title": "Poucos codigos de produto identificados",
                "body": f"{product_dependent_rows} linha(s) dependiam de produto, mas so {product_codes_detected} codigo(s) distintos foram identificados.",
            }
        )
    if changes_pending:
        score -= min(10, changes_pending)
        checks.append(
            {
                "id": "source_changes",
                "status": "review",
                "title": "Mudancas de origem pendentes",
                "body": f"{changes_pending} mudanca(s) vindas do ERP aguardam revisao operacional.",
            }
        )
    if not checks:
        checks.append(
            {
                "id": "ready",
                "status": "ok",
                "title": "Lote pronto para beta assistida",
                "body": "O ultimo lote completou sem erros, conflitos pendentes ou linhas sem mapeamento.",
            }
        )
    score = max(0, min(100, score))
    if any(item["status"] == "blocked" for item in checks):
        status = "blocked"
        next_step = "Corrija os bloqueios do ultimo lote antes de usar os indicadores na rotina."
    elif any(item["status"] in {"attention", "review"} for item in checks):
        status = "attention"
        next_step = "Revise avisos e conflitos antes de apresentar a beta como confiavel."
    else:
        status = "ready"
        next_step = "Use reposicao, cotacao e acoes como primeira rotina assistida."
    return {
        "status": status,
        "score": score,
        "latest_batch_id": latest["id"],
        "source_system": latest["source_system"],
        "started_at": latest["started_at"],
        "finished_at": latest["finished_at"],
        "files": files,
        "issues_by_severity": issues_by_severity,
        "changes_by_status": changes_by_status,
        "summary": {
            "rows": rows_total,
            "mapped_rows": mapped_rows,
            "unmapped_rows": unmapped_rows,
            "files": len(files),
            "issues": sum(issues_by_severity.values()),
            "changes_pending": changes_pending,
            "manual_conflicts_pending": manual_pending,
            "manual_conflicts_resolved": int(summary_json.get("manual_conflicts_resolved") or 0),
            "manual_values_preserved": int(summary_json.get("manual_values_preserved") or 0),
        },
        "checks": checks,
        "next_step": next_step,
    }


def import_refresh_targets(conn: sqlite3.Connection) -> list[dict]:
    raw = rows(
        conn,
        """
        WITH ranked AS (
            SELECT
                sf.file_name,
                ib.id AS batch_id,
                ib.source_system,
                ib.finished_at,
                ib.summary_json,
                sf.row_count,
                ROW_NUMBER() OVER (PARTITION BY sf.file_name ORDER BY ib.finished_at DESC, ib.started_at DESC) AS rn
            FROM source_files sf
            JOIN import_batches ib ON ib.id = sf.import_batch_id
            WHERE ib.status = 'completed' AND sf.file_name IS NOT NULL AND sf.file_name <> ''
        )
        SELECT file_name, batch_id, source_system, finished_at, summary_json, row_count
        FROM ranked
        WHERE rn = 1
        ORDER BY finished_at DESC
        LIMIT 10
        """,
    )
    targets = []
    for row in raw:
        try:
            summary = json.loads(row.get("summary_json") or "{}")
        except json.JSONDecodeError:
            summary = {}
        mapping_summary = summary.get("mappings") or []
        mapped_fields = []
        seen = set()
        for sheet in mapping_summary:
            for col_index, col_info in (sheet.get("mapping") or {}).items():
                if not isinstance(col_info, dict):
                    continue
                label = col_info.get("label")
                if label and label not in seen and not label.lower().startswith("ignorar"):
                    seen.add(label)
                    mapped_fields.append(label)
        targets.append({
            "file_name": row.get("file_name") or "",
            "batch_id": row.get("batch_id") or "",
            "source_system": row.get("source_system") or "",
            "last_imported_at": row.get("finished_at") or "",
            "row_count": int(row.get("row_count") or 0),
            "mapped_field_count": len(mapped_fields),
            "mapped_fields": mapped_fields[:8],
            "rows_imported": int(summary.get("mapped_rows") or summary.get("rows") or 0),
        })
    return targets


def import_batch_stats(conn: sqlite3.Connection, batch_ids: list[str]) -> dict[str, dict]:
    if not batch_ids:
        return {}
    placeholders = ",".join("?" for _ in batch_ids)
    stats = {batch_id: {} for batch_id in batch_ids}
    product_code_expr = "NULLIF(TRIM(COALESCE(json_extract(normalized_payload_json, '$.\"produto.codigo_produto\"'), '')), '')"
    service_name_expr = "NULLIF(TRIM(COALESCE(json_extract(normalized_payload_json, '$.\"servico.nome_servico\"'), '')), '')"
    for row in rows(
        conn,
        f"""
        SELECT
            import_batch_id,
            COUNT(*) AS source_rows,
            COUNT({product_code_expr}) AS source_product_code_rows,
            COUNT(DISTINCT {product_code_expr}) AS source_product_codes,
            COUNT({service_name_expr}) AS source_service_name_rows,
            COUNT(DISTINCT {service_name_expr}) AS source_service_names
        FROM source_records
        WHERE import_batch_id IN ({placeholders})
        GROUP BY import_batch_id
        """,
        tuple(batch_ids),
    ):
        stats.setdefault(row["import_batch_id"], {}).update({key: int(row.get(key) or 0) for key in row if key != "import_batch_id"})

    grouped_queries = [
        (
            "inventory",
            """
            SELECT import_batch_id, COUNT(*) AS rows, COUNT(DISTINCT product_id) AS products, MAX(snapshot_date) AS max_date
            FROM inventory_snapshots
            WHERE import_batch_id IN ({placeholders})
            GROUP BY import_batch_id
            """,
        ),
        (
            "price",
            """
            SELECT import_batch_id, COUNT(*) AS rows, COUNT(DISTINCT product_id) AS products, MAX(snapshot_date) AS max_date
            FROM price_snapshots
            WHERE import_batch_id IN ({placeholders})
            GROUP BY import_batch_id
            """,
        ),
        (
            "cost",
            """
            SELECT import_batch_id, COUNT(*) AS rows, COUNT(DISTINCT product_id) AS products, MAX(snapshot_date) AS max_date
            FROM cost_snapshots
            WHERE import_batch_id IN ({placeholders})
            GROUP BY import_batch_id
            """,
        ),
        (
            "product_sales",
            """
            SELECT import_batch_id, COUNT(*) AS rows, COUNT(DISTINCT product_id) AS products, MAX(sold_at) AS max_date
            FROM product_sales
            WHERE import_batch_id IN ({placeholders})
            GROUP BY import_batch_id
            """,
        ),
        (
            "service_sales",
            """
            SELECT import_batch_id, COUNT(*) AS rows, COUNT(DISTINCT service_id) AS services, MAX(emitted_at) AS max_date
            FROM service_sales
            WHERE import_batch_id IN ({placeholders})
            GROUP BY import_batch_id
            """,
        ),
    ]
    for prefix, sql in grouped_queries:
        for row in rows(conn, sql.format(placeholders=placeholders), tuple(batch_ids)):
            target = stats.setdefault(row["import_batch_id"], {})
            for key, value in row.items():
                if key == "import_batch_id":
                    continue
                target[f"{prefix}_{key}"] = int(value or 0) if key != "max_date" else (value or "")
    return stats


def api_imports(conn: sqlite3.Connection) -> dict:
    batches = rows(conn, "SELECT id, source_system, status, source_period_start, source_period_end, started_at, finished_at, summary_json FROM import_batches ORDER BY started_at DESC LIMIT 20")
    if batches:
        batch_ids = [batch["id"] for batch in batches]
        placeholders = ",".join("?" for _ in batch_ids)
        files_by_batch: dict[str, list[dict]] = {batch_id: [] for batch_id in batch_ids}
        for file_row in rows(
            conn,
            f"""
            SELECT import_batch_id, file_name, file_role, row_count, file_size_bytes, encoding
            FROM source_files
            WHERE import_batch_id IN ({placeholders})
            ORDER BY file_name
            """,
            tuple(batch_ids),
        ):
            files_by_batch.setdefault(file_row["import_batch_id"], []).append(
                {
                    "file_name": file_row.get("file_name") or "",
                    "file_role": file_row.get("file_role") or "",
                    "row_count": int(file_row.get("row_count") or 0),
                    "file_size_bytes": int(file_row.get("file_size_bytes") or 0),
                    "encoding": file_row.get("encoding") or "",
                }
            )
        stats_by_batch = import_batch_stats(conn, batch_ids)
        for batch in batches:
            batch["files"] = files_by_batch.get(batch["id"], [])
            batch["stats"] = stats_by_batch.get(batch["id"], {})
    return {
        "contract": "imports.v1",
        "batches": batches,
        "issues": rows(conn, "SELECT severity, code, message, source_line FROM import_issues ORDER BY id DESC LIMIT 200"),
        "changes": rows(conn, "SELECT entity_type, source_code, field_name, previous_value, new_value, review_status, created_at FROM source_entity_changes ORDER BY id DESC LIMIT 200"),
        "refresh_targets": import_refresh_targets(conn),
        "readiness": api_import_readiness(conn),
        "quality": import_quality_report(conn),
    }
