from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
import re
import sqlite3
import struct
import subprocess
import tempfile
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path
from uuid import uuid4
from xml.etree import ElementTree

from app_config import active_tenant, app_name, default_organization_slug, default_store_name, import_config_path, imported_company_name
from db_helpers import (
    app_controlled_fields,
    default_organization_id,
    normalize_code,
    one,
    parse_decimal,
    parse_int,
    rows,
    scalar_text,
)
from supplier_ops import seed_brand_suppliers
from text_utils import canonical_customer_key, clean_phone, make_supplier_id, normalize


ROOT = Path(__file__).resolve().parents[1]
REFERENCE_FILE_ORDER = ("produtopreco.xls", "produtocusto.xls", "saidaprod.xls", "servico.xls")


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
    {"entity": "configuracao", "field": "preferred_supplier", "label": "Produto - fornecedor preferencial", "keywords": ["fornecedor_preferencial", "fornecedor_padrao", "fornecedor_compra", "supplier_preferencial"]},
    {"entity": "configuracao", "field": "package_size", "label": "Produto - qtd. por embalagem de compra", "keywords": ["embalagem_compra", "unidades_por_embalagem", "qtd_por_embalagem", "quantidade_por_embalagem", "multiplo_compra", "caixa", "fardo", "qtd_caixa", "package_size", "multiplo"]},
    {"entity": "configuracao", "field": "minimum_stock", "label": "Produto - estoque minimo para compra", "keywords": ["estoque_minimo", "minimo", "min_stock", "ponto_pedido", "minimo_operacional", "estoque_minimo_operacional", "minimum_stock", "estoque_seguranca"]},
    {"entity": "configuracao", "field": "maximum_stock", "label": "Produto - estoque maximo para compra", "keywords": ["estoque_maximo", "maximo", "max_stock", "maximo_operacional", "estoque_maximo_operacional", "maximum_stock"]},
    {"entity": "configuracao", "field": "weight", "label": "Produto - peso logistico", "keywords": ["peso_compra", "peso_logistico", "peso_item"]},
    {"entity": "configuracao", "field": "expires", "label": "Produto - perecivel/validade", "keywords": ["perecivel", "vence", "validade", "controla_validade", "expira"]},
    {"entity": "configuracao", "field": "blocked_for_purchase", "label": "Produto - bloquear compra", "keywords": ["bloquear_compra", "bloqueado_compra", "nao_comprar", "descontinuado"]},
    {"entity": "configuracao", "field": "ignored_in_purchase_reports", "label": "Produto - ignorar em compras", "keywords": ["ignorar_compra", "ignorar_relatorio", "fora_relatorio", "nao_sugerir"]},
    {"entity": "configuracao", "field": "notes", "label": "Produto - observacao operacional", "keywords": ["observacao", "observacoes", "nota_operacional", "comentario", "notes"]},
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
        if candidate["entity"] == "configuracao" and candidate["field"] == "package_size" and any(
            marker in normalized
            for marker in ("por_embalagem", "qtd_embalagem", "quantidade_embalagem", "multiplo", "caixa", "fardo")
        ):
            score += 8
        if candidate["entity"] == "produto" and candidate["field"] == "unidade" and any(
            marker in normalized
            for marker in ("por_embalagem", "qtd_embalagem", "quantidade_embalagem", "multiplo", "caixa", "fardo")
        ):
            score -= 6
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
            "package_size", "minimum_stock", "maximum_stock", "weight",
        }:
            score += 1
        if score > best_score:
            best = candidate
            best_score = score
    if not best or best_score < 3:
        return {"entity": "ignorar", "field": "ignorar", "label": "Ignorar / nao mapeado", "confidence": 0}
    return {"entity": best["entity"], "field": best["field"], "label": best["label"], "confidence": min(98, 35 + best_score * 8)}


ERP_OPERATIONAL_FIELD_HELP = {
    "produto.codigo_produto": ("Chave do produto", "Liga a linha ao produto. E obrigatorio para gravar estoque, custo, preco, venda e ajustes de compra."),
    "produto.nome_produto": ("Cadastro do produto", "Cria ou atualiza o nome quando o produto ainda nao existe."),
    "identificador.barcode": ("Identificador", "Salva codigo de barras/EAN vinculado ao produto."),
    "identificador.supplier_reference": ("Identificador", "Salva o codigo do produto usado pelo fornecedor."),
    "configuracao.preferred_supplier": ("Compra por produto", "Define o fornecedor preferencial do produto."),
    "configuracao.package_size": ("Compra por produto", "Define quantas unidades vem em uma embalagem de compra, como caixa com 12 ou 24."),
    "configuracao.minimum_stock": ("Compra por produto", "Define o estoque minimo operacional do produto."),
    "configuracao.maximum_stock": ("Compra por produto", "Define o teto operacional usado para limitar sugestoes."),
    "configuracao.weight": ("Compra por produto", "Guarda peso logistico para apoio operacional."),
    "configuracao.expires": ("Compra por produto", "Marca se o produto controla validade ou perecibilidade."),
    "configuracao.blocked_for_purchase": ("Compra por produto", "Impede sugestao automatica de compra para o produto."),
    "configuracao.ignored_in_purchase_reports": ("Compra por produto", "Remove o produto dos relatorios/sugestoes de compra."),
    "configuracao.notes": ("Compra por produto", "Guarda observacao operacional do produto."),
    "estoque.estoque_atual": ("Estoque", "Grava snapshot de saldo atual do produto."),
    "estoque.data_movimento": ("Estoque", "Data usada no snapshot de estoque; se vier vazia, usa hoje."),
    "preco.preco_venda": ("Preco", "Grava snapshot do preco de venda atual."),
    "custo.purchase_cost": ("Custo", "Grava custo de compra sem impostos."),
    "custo.total_cost": ("Custo", "Grava custo total/com impostos."),
    "custo.freight_cost": ("Custo", "Grava componente de frete no custo."),
    "custo.icms_cost": ("Custo", "Grava componente de ICMS no custo."),
    "custo.ipi_cost": ("Custo", "Grava componente de IPI no custo."),
    "custo.snapshot_date": ("Custo", "Data usada no snapshot de custo; se vier vazia, usa hoje."),
    "venda.data_venda": ("Venda de produto/servico", "Data da venda usada no historico e na demanda."),
    "venda.quantidade_vendida": ("Venda de produto/servico", "Quantidade vendida usada no historico e na demanda."),
    "venda.valor_venda": ("Venda de produto/servico", "Valor bruto usado no historico comercial."),
    "venda.valor_liquido": ("Venda de servico", "Valor liquido usado em vendas de servico."),
    "venda.numero_documento": ("Venda de produto/servico", "Ajuda a evitar duplicidade de vendas importadas."),
    "cliente.codigo_cliente": ("Venda", "Identifica o cliente na venda quando disponivel."),
    "cliente.nome_cliente": ("Venda", "Identifica o nome do cliente na venda quando disponivel."),
    "fornecedor.nome_fornecedor": ("Fornecedor", "Cria/atualiza fornecedor e tambem pode virar fornecedor preferencial do produto."),
    "fornecedor.documento_fornecedor": ("Fornecedor", "Atualiza CNPJ/documento do fornecedor."),
    "fornecedor.contato": ("Fornecedor", "Atualiza contato principal do fornecedor."),
    "fornecedor.telefone": ("Fornecedor", "Atualiza telefone do fornecedor."),
    "fornecedor.email": ("Fornecedor", "Atualiza e-mail do fornecedor."),
    "fornecedor.pedido_minimo": ("Fornecedor", "Atualiza valor minimo de pedido do fornecedor."),
    "servico.nome_servico": ("Venda de servico", "Cria/identifica o servico para importar vendas de servico."),
    "contato.telefone": ("Fornecedor", "Usado como telefone quando a linha tambem tem fornecedor."),
    "contato.email": ("Fornecedor", "Usado como e-mail quando a linha tambem tem fornecedor."),
}

ERP_RAW_ONLY_HELP_BY_ENTITY = {
    "produto": ("Cadastro complementar", "Fica salvo no registro bruto do lote, mas ainda nao atualiza o cadastro operacional do produto."),
    "estoque": ("Estoque complementar", "Fica salvo no registro bruto do lote, mas ainda nao entra no saldo usado pelo sistema."),
    "preco": ("Preco complementar", "Fica salvo no registro bruto do lote, mas ainda nao atualiza preco operacional."),
    "compra": ("Compra complementar", "Fica salvo no registro bruto do lote, mas ainda nao alimenta pedidos de compra."),
    "venda": ("Venda complementar", "Fica salvo no registro bruto do lote, mas ainda nao muda historico ou demanda."),
    "fiscal": ("Fiscal", "Fica salvo no registro bruto do lote para auditoria; ainda nao alimenta telas fiscais."),
    "cliente": ("Cliente complementar", "Fica salvo no registro bruto do lote, mas ainda nao atualiza cadastro de clientes."),
    "fornecedor": ("Fornecedor complementar", "Fica salvo no registro bruto do lote, mas ainda nao atualiza o cadastro operacional do fornecedor."),
    "financeiro": ("Financeiro", "Fica salvo no registro bruto do lote para auditoria; ainda nao alimenta telas financeiras."),
}


def erp_field_option(option: dict) -> dict:
    if option.get("entity") == "ignorar":
        return {**option, "support": "ignored", "usage": "Ignorar", "description": "Esta coluna nao sera importada."}
    key = f"{option.get('entity')}.{option.get('field')}"
    if key in ERP_OPERATIONAL_FIELD_HELP:
        usage, description = ERP_OPERATIONAL_FIELD_HELP[key]
        return {**option, "support": "operational", "usage": usage, "description": description}
    usage, description = ERP_RAW_ONLY_HELP_BY_ENTITY.get(
        option.get("entity"),
        ("Registro bruto", "Fica salvo no lote importado, mas ainda nao atualiza telas operacionais."),
    )
    return {**option, "support": "raw_only", "usage": usage, "description": description}


ERP_IMPORT_BLOCKS = [
    {
        "id": "products_prices_stock",
        "title": "Produtos, precos e estoque",
        "keys": {"produto.codigo_produto", "produto.nome_produto", "preco.preco_venda", "estoque.estoque_atual"},
        "critical": {"produto.codigo_produto", "produto.nome_produto"},
        "modules": ["ranking de produtos", "reposicao", "precificacao", "mix ativo"],
    },
    {
        "id": "purchase_costs",
        "title": "Custos de compra",
        "keys": {"custo.purchase_cost", "custo.total_cost", "custo.freight_cost", "custo.icms_cost", "custo.ipi_cost"},
        "critical": {"produto.codigo_produto"},
        "modules": ["margem", "preco alvo", "decisao de compra"],
    },
    {
        "id": "product_sales",
        "title": "Vendas de produtos",
        "keys": {"venda.data_venda", "venda.quantidade_vendida", "venda.valor_venda", "produto.codigo_produto"},
        "critical": {"produto.codigo_produto", "venda.data_venda", "venda.quantidade_vendida"},
        "modules": ["demanda", "curva ABC", "reposicao", "clientes", "oportunidades"],
    },
    {
        "id": "services",
        "title": "Vendas de servicos",
        "keys": {"servico.nome_servico", "venda.data_venda", "venda.quantidade_vendida", "venda.valor_venda", "venda.valor_liquido"},
        "critical": {"servico.nome_servico", "venda.data_venda"},
        "modules": ["ranking de servicos", "carteira de clientes", "margem de servico"],
    },
    {
        "id": "supplier_identifiers",
        "title": "Codigos para compra e fornecedores",
        "keys": {"identificador.supplier_reference", "fornecedor.nome_fornecedor", "fornecedor.telefone", "fornecedor.pedido_minimo"},
        "critical": {"produto.codigo_produto"},
        "modules": ["cotacao", "pedido de compra", "minimo por fornecedor"],
    },
    {
        "id": "operational_settings",
        "title": "Ajustes de produto importaveis",
        "keys": {
            "configuracao.preferred_supplier",
            "configuracao.package_size",
            "configuracao.minimum_stock",
            "configuracao.maximum_stock",
            "configuracao.blocked_for_purchase",
        },
        "critical": {"produto.codigo_produto"},
        "modules": ["reposicao mais fiel", "pedido por caixa/fardo", "bloqueios de compra"],
    },
]


IMPORT_DEPENDENCY_RULES = [
    {
        "id": "products_prices_stock",
        "label": "Produtos, precos e estoque",
        "unlocks": ["catalogo base", "reposicao inicial", "precificacao inicial"],
        "depends_on": [],
        "blocks": ["Reposicao", "Precificacao", "Cotacao"],
        "reason": "Sem produto, preco e estoque, os outros modulos nao tem item, saldo ou base de venda para trabalhar.",
    },
    {
        "id": "purchase_costs",
        "label": "Custos de compra",
        "unlocks": ["margem", "preco alvo", "compra com custo"],
        "depends_on": ["products_prices_stock"],
        "blocks": ["Precificacao", "Reposicao com custo"],
        "reason": "Custo destrava margem, preco alvo e priorizacao de compra com impacto financeiro.",
    },
    {
        "id": "product_sales",
        "label": "Vendas de produtos",
        "unlocks": ["demanda", "curva ABC", "reposicao orientada por venda", "oportunidades comerciais"],
        "depends_on": ["products_prices_stock"],
        "blocks": ["Reposicao", "Comercial"],
        "reason": "Vendas por item transformam cadastro em demanda real, ABC e rotina de reposicao.",
    },
    {
        "id": "supplier_identifiers",
        "label": "Fornecedores e codigos de compra",
        "unlocks": ["cotacao", "pedido por fornecedor", "codigo correto para enviar ao fornecedor"],
        "depends_on": ["products_prices_stock"],
        "blocks": ["Cotacao"],
        "reason": "Cotacao precisa saber quem fornece e qual codigo o fornecedor reconhece.",
    },
    {
        "id": "operational_settings",
        "label": "Parametros de compra",
        "unlocks": ["compra por caixa/fardo", "bloqueios de compra"],
        "depends_on": ["products_prices_stock"],
        "blocks": ["Reposicao refinada", "Cotacao refinada"],
        "reason": "Parametros de compra reduzem decisao manual e aproximam a sugestao da rotina real.",
    },
    {
        "id": "services",
        "label": "Servicos vendidos",
        "unlocks": ["ranking de servicos", "carteira de clientes por servico"],
        "depends_on": [],
        "blocks": ["Comercial de servicos"],
        "reason": "Servicos sao relevantes quando o varejo vende receita de mao de obra ou assistencia.",
    },
    {
        "id": "purchase_history",
        "label": "Historico de compras e recebimentos",
        "unlocks": ["lead time real", "performance de fornecedor", "validacao de custo"],
        "depends_on": ["products_prices_stock", "purchase_costs", "supplier_identifiers"],
        "blocks": ["Compra avancada"],
        "reason": "Compras ajudam muito, mas rendem mais depois que produtos, custos e fornecedores estao minimamente mapeados.",
    },
    {
        "id": "fiscal_documents",
        "label": "Dados fiscais por item",
        "unlocks": ["auditoria fiscal", "margem tributaria fina"],
        "depends_on": ["products_prices_stock", "purchase_costs"],
        "blocks": ["Auditoria fiscal"],
        "reason": "Fiscal enriquece margem e auditoria, mas nao deve vir antes de produto e custo basicos.",
    },
    {
        "id": "financial_titles",
        "label": "Financeiro",
        "unlocks": ["inadimplencia", "fluxo de caixa", "compra segura por caixa"],
        "depends_on": ["customer_commercial", "supplier_identifiers"],
        "blocks": ["Financeiro"],
        "reason": "Financeiro precisa de clientes e fornecedores identificaveis para cruzar cobranca e compra.",
    },
]


PRODUCT_DEPENDENT_ENTITIES = {"estoque", "preco", "custo", "identificador", "configuracao"}


def erp_column_key(column: dict) -> str:
    suggestion = column.get("suggestion") or column
    entity = scalar_text(suggestion.get("entity"))
    field = scalar_text(suggestion.get("field"))
    if not entity or not field or entity == "ignorar" or field == "ignorar":
        return ""
    return f"{entity}.{field}"


def erp_column_label(column: dict) -> str:
    suggestion = column.get("suggestion") or column
    return scalar_text(suggestion.get("label")) or scalar_text(column.get("header")) or "Campo"


def infer_erp_sheet_purpose(keys: set[str]) -> dict:
    ranked = []
    for block in ERP_IMPORT_BLOCKS:
        matched = keys & block["keys"]
        if not matched:
            continue
        score = len(matched) * 2 + len(keys & block.get("critical", set()))
        ranked.append((score, block))
    if not ranked:
        return {
            "id": "unknown",
            "title": "Planilha ainda nao identificada",
            "modules": [],
            "confidence": "baixa",
        }
    ranked.sort(key=lambda item: item[0], reverse=True)
    score, block = ranked[0]
    confidence = "alta" if score >= 6 else "media"
    return {
        "id": block["id"],
        "title": block["title"],
        "modules": block["modules"],
        "confidence": confidence,
    }


def import_plan_status_id(item: dict) -> str:
    coverage = item.get("coverage") or {}
    if item.get("priority") == "dispensado":
        return "dispensado"
    if item.get("id") == "products_prices_stock":
        if coverage.get("products") and coverage.get("products_with_price") and coverage.get("products_with_stock"):
            return "coberto"
        return "parcial" if coverage.get("products") or coverage.get("products_with_price") or coverage.get("products_with_stock") else "faltando"
    if item.get("id") == "purchase_costs":
        return "coberto" if coverage.get("products_with_cost") else "faltando"
    if item.get("id") == "product_sales":
        if coverage.get("rows") and int(coverage.get("sales_months") or 0) >= 3:
            return "coberto"
        return "parcial" if coverage.get("rows") else "faltando"
    if item.get("id") == "services":
        return "coberto" if coverage.get("rows") else "parcial"
    if item.get("id") == "supplier_identifiers":
        if coverage.get("products_with_supplier_reference") and coverage.get("suppliers"):
            return "coberto"
        return "parcial" if coverage.get("products_with_supplier_reference") or coverage.get("suppliers") else "faltando"
    if item.get("id") == "operational_settings":
        return "coberto" if coverage.get("products_with_package") else "parcial"
    return "parcial" if coverage and not coverage.get("stage") else "faltando"


def readiness_plan_by_id(readiness: dict) -> dict[str, dict]:
    return {item.get("id"): item for item in readiness.get("plan") or [] if item.get("id")}


def dependency_rule(block_id: str) -> dict:
    for rule in IMPORT_DEPENDENCY_RULES:
        if rule["id"] == block_id:
            return rule
    return {"id": block_id, "label": block_id, "unlocks": [], "depends_on": [], "blocks": [], "reason": ""}


def dependency_status(readiness: dict, block_id: str) -> dict:
    plan_by_id = readiness_plan_by_id(readiness)
    rule = dependency_rule(block_id)
    missing = []
    partial = []
    for dependency in rule.get("depends_on") or []:
        status = import_plan_status_id(plan_by_id.get(dependency) or {})
        if status == "faltando":
            missing.append(dependency_rule(dependency).get("label") or dependency)
        elif status != "coberto":
            partial.append(dependency_rule(dependency).get("label") or dependency)
    return {"missing": missing, "partial": partial, "ready": not missing}


def next_recommended_import(readiness: dict, current_block_ids: set[str] | None = None) -> dict:
    current_block_ids = current_block_ids or set()
    priorities = {"essencial": 80, "recomendado": 55, "ambicioso": 25, "travado": -20, "dispensado": -40}
    candidates = []
    plan_by_id = readiness_plan_by_id(readiness)
    for item in readiness.get("plan") or []:
        if item.get("id") in current_block_ids or item.get("priority") in {"travado", "dispensado"}:
            continue
        status = import_plan_status_id(item)
        if status == "coberto":
            continue
        rule = dependency_rule(item.get("id") or "")
        deps = dependency_status(readiness, item.get("id") or "")
        blocked_by_missing = len(deps["missing"])
        blocked_by_partial = len(deps["partial"])
        essential_bonus = priorities.get(item.get("priority"), 0)
        status_bonus = 30 if status == "faltando" else 12
        unlock_bonus = min(30, len(rule.get("unlocks") or []) * 8 + len(rule.get("blocks") or []) * 5)
        dependency_penalty = blocked_by_missing * 35 + blocked_by_partial * 10
        score = essential_bonus + status_bonus + unlock_bonus - dependency_penalty
        candidates.append((score, item, rule, deps, status))
    if not candidates:
        not_now = [
            {
                "title": item.get("title") or "",
                "why": "Nao e prioridade agora: os blocos operacionais principais ja estao cobertos ou este arquivo e apenas enriquecimento.",
            }
            for item in readiness.get("plan") or []
            if item.get("priority") in {"ambicioso", "dispensado"}
        ][:3]
        return {
            "id": "",
            "title": "Base essencial coberta",
            "why": "Os blocos principais ja aparecem no mapa atual. Use proximas importacoes para atualizar arquivos conhecidos ou enriquecer dados avancados.",
            "expected_files": [],
            "minimum_fields": [],
            "unlocks": [],
            "blocked_modules": [],
            "depends_on": [],
            "not_now": not_now,
        }
    candidates.sort(key=lambda entry: entry[0], reverse=True)
    _score, item, rule, deps, status = candidates[0]
    fields = item.get("what_to_send") or []
    dependencies = [dependency_rule(dep).get("label") or dep for dep in rule.get("depends_on") or []]
    blocked_modules = []
    if deps["missing"]:
        blocked_modules.extend(f"Antes falta {name}" for name in deps["missing"])
    if deps["partial"]:
        blocked_modules.extend(f"{name} ainda esta parcial" for name in deps["partial"])
    if not blocked_modules:
        blocked_modules = rule.get("blocks") or []
    not_now = []
    for other in sorted(candidates[1:], key=lambda entry: entry[0]):
        other_item = other[1]
        other_rule = other[2]
        if other_item.get("priority") == "ambicioso" or other[3]["missing"]:
            not_now.append(
                {
                    "title": other_item.get("title") or other_rule.get("label") or "",
                    "why": other_rule.get("reason") or "Rende mais depois que os blocos anteriores estiverem completos.",
                }
            )
        if len(not_now) >= 3:
            break
    why = rule.get("reason") or f"Esse bloco ainda esta {status} e destrava: {', '.join((item.get('used_for') or [])[:4])}."
    if deps["missing"]:
        why = f"{why} Mas para aproveitar bem, primeiro resolva: {', '.join(deps['missing'])}."
    elif deps["partial"]:
        why = f"{why} Ja da para avancar, mas {', '.join(deps['partial'])} ainda esta parcial."
    return {
        "id": item.get("id") or "",
        "title": item.get("title") or "Proximo arquivo",
        "priority": item.get("priority") or "",
        "status": status,
        "why": why,
        "expected_files": item.get("expected_files") or [],
        "minimum_fields": fields[:6],
        "unlocks": rule.get("unlocks") or (item.get("used_for") or [])[:4],
        "blocked_modules": blocked_modules,
        "depends_on": dependencies,
        "not_now": not_now,
    }


def import_module_scores(readiness: dict, quality: dict) -> list[dict]:
    plan_by_id = {item.get("id"): item for item in readiness.get("plan") or []}

    def coverage(block_id: str) -> dict:
        return (plan_by_id.get(block_id) or {}).get("coverage") or {}

    def clamp_score(value: float) -> int:
        return max(0, min(100, int(round(value))))

    products = coverage("products_prices_stock")
    costs = coverage("purchase_costs")
    sales = coverage("product_sales")
    services = coverage("services")
    suppliers = coverage("supplier_identifiers")
    settings = coverage("operational_settings")
    product_count = int(products.get("products") or 0)
    price_pct = int(products.get("price_pct") or 0)
    stock_pct = int(products.get("stock_pct") or 0)
    barcode_pct = int(products.get("barcode_pct") or 0)
    cost_pct = int(costs.get("cost_pct") or 0)
    supplier_ref_pct = int(suppliers.get("supplier_reference_pct") or 0)
    package_pct = int(settings.get("package_pct") or 0)
    sales_months = int(sales.get("sales_months") or 0)
    sales_rows = int(sales.get("rows") or 0)
    service_rows = int(services.get("rows") or 0)
    supplier_count = int(suppliers.get("suppliers") or 0)
    customer_count = int((coverage("customer_commercial") or {}).get("customers") or 0)
    quality_penalty = 20 if quality.get("status") == "blocked" else 8 if quality.get("status") == "attention" else 0

    module_rows = [
        {
            "id": "products",
            "label": "Produtos",
            "score": clamp_score((100 if product_count else 0) * 0.45 + price_pct * 0.25 + stock_pct * 0.2 + barcode_pct * 0.1),
            "status": "base" if product_count else "faltando",
            "detail": f"{product_count} produto(s), {price_pct}% com preco, {stock_pct}% com estoque.",
        },
        {
            "id": "inventory",
            "label": "Estoque",
            "score": clamp_score(stock_pct - quality_penalty),
            "status": "confiavel" if stock_pct >= 80 else "parcial" if stock_pct else "faltando",
            "detail": f"{stock_pct}% dos produtos tem saldo importado.",
        },
        {
            "id": "pricing",
            "label": "Precificacao",
            "score": clamp_score((price_pct * 0.45) + (cost_pct * 0.45) + (100 if product_count else 0) * 0.1 - quality_penalty),
            "status": "confiavel" if price_pct >= 80 and cost_pct >= 80 else "parcial" if price_pct or cost_pct else "faltando",
            "detail": f"{price_pct}% com preco e {cost_pct}% com custo.",
        },
        {
            "id": "replenishment",
            "label": "Reposicao",
            "score": clamp_score((stock_pct * 0.3) + (cost_pct * 0.2) + (min(sales_months, 6) / 6 * 35) + (package_pct * 0.15) - quality_penalty),
            "status": "confiavel" if stock_pct >= 70 and sales_months >= 3 else "parcial" if stock_pct or sales_rows else "faltando",
            "detail": f"{sales_months} mes(es) de venda, {stock_pct}% com estoque, {package_pct}% com embalagem.",
        },
        {
            "id": "quotes",
            "label": "Cotacao",
            "score": clamp_score((supplier_ref_pct * 0.45) + (100 if supplier_count else 0) * 0.25 + (package_pct * 0.2) + (cost_pct * 0.1) - quality_penalty),
            "status": "confiavel" if supplier_ref_pct >= 70 and supplier_count else "parcial" if supplier_ref_pct or supplier_count else "faltando",
            "detail": f"{supplier_ref_pct}% com referencia de fornecedor e {supplier_count} fornecedor(es).",
        },
        {
            "id": "commercial",
            "label": "Comercial",
            "score": clamp_score((min(sales_months, 6) / 6 * 55) + (100 if customer_count else 0) * 0.25 + (100 if service_rows else 0) * 0.2 - quality_penalty),
            "status": "confiavel" if sales_months >= 3 and customer_count else "parcial" if sales_rows or customer_count else "faltando",
            "detail": f"{sales_months} mes(es) de venda, {customer_count} cliente(s), {service_rows} linha(s) de servico.",
        },
    ]
    for item in module_rows:
        if item["score"] >= 75:
            item["tone"] = "good"
        elif item["score"] >= 35:
            item["tone"] = "warn"
        else:
            item["tone"] = "danger"
    return module_rows


def implementation_state(readiness: dict, quality: dict, module_scores: list[dict]) -> dict:
    ready = [item["label"] for item in module_scores if item.get("score", 0) >= 75]
    partial = [item["label"] for item in module_scores if 35 <= item.get("score", 0) < 75]
    missing = [item["label"] for item in module_scores if item.get("score", 0) < 35]
    essential = [
        item
        for item in readiness.get("plan") or []
        if item.get("priority") == "essencial" and import_plan_status_id(item) != "coberto"
    ]
    if quality.get("status") == "blocked":
        stage = "bloqueada"
        message = "A base tem bloqueios no ultimo lote antes de ser usada como rotina."
    elif essential:
        stage = "implantacao parcial"
        message = "A base ja mostra valor, mas ainda faltam fontes essenciais para rotina completa."
    elif missing or partial:
        stage = "operacao assistida"
        message = "Os blocos essenciais estao encaminhados; use a rotina com acompanhamento e enriqueça dados por prioridade."
    else:
        stage = "base operacional"
        message = "A base esta pronta para operar e receber atualizacoes recorrentes."
    return {
        "stage": stage,
        "message": message,
        "ready": ready,
        "partial": partial,
        "missing": missing,
        "essential_gaps": [item.get("title") or item.get("id") for item in essential],
    }


def erp_preview_assistant(analyzed: list[dict], readiness: dict) -> dict:
    all_keys: set[str] = set()
    raw_only_fields = []
    ignored_columns = 0
    low_confidence = []
    sheet_guidance = []
    alignment_warnings = []
    for sheet in analyzed:
        keys: set[str] = set()
        sheet_raw_only = []
        for column in sheet.get("columns") or []:
            key = erp_column_key(column)
            if key:
                keys.add(key)
                all_keys.add(key)
                option = erp_field_option((column.get("suggestion") or {}))
                if option.get("support") == "raw_only":
                    sheet_raw_only.append(erp_column_label(column))
                    raw_only_fields.append(erp_column_label(column))
            else:
                ignored_columns += 1
            confidence = int((column.get("suggestion") or {}).get("confidence") or 0)
            if 0 < confidence < 70:
                low_confidence.append(erp_column_label(column))
        purpose = infer_erp_sheet_purpose(keys)
        missing = missing_critical_fields(keys, purpose.get("id"))
        alignment = sheet.get("alignment") or {}
        if alignment.get("status") == "warn":
            alignment_warnings.append(
                {
                    "sheet_name": sheet.get("sheet_name") or "",
                    "severity": alignment.get("severity") or "medio",
                    "message": alignment.get("message") or "",
                    "issue_count": alignment.get("issue_count") or 0,
                    "examples": alignment.get("examples") or [],
                }
            )
        sheet_guidance.append(
            {
                "sheet_name": sheet.get("sheet_name") or "",
                "purpose": purpose,
                "feeds": purpose.get("modules") or [],
                "missing_critical": missing,
                "raw_only_fields": sheet_raw_only[:8],
                "structure": sheet.get("structure") or {},
                "alignment": alignment,
            }
        )
    current_block_ids = {guidance["purpose"]["id"] for guidance in sheet_guidance if guidance.get("purpose", {}).get("id") not in {"", "unknown"}}
    missing_global = missing_critical_fields(all_keys, None)
    risk = "baixo"
    if missing_global:
        risk = "alto"
    elif alignment_warnings:
        risk = "alto" if any(item.get("severity") == "alto" for item in alignment_warnings) else "medio"
    elif low_confidence or len(raw_only_fields) >= 3:
        risk = "medio"
    purpose_titles = [item["purpose"]["title"] for item in sheet_guidance if item.get("purpose", {}).get("id") != "unknown"]
    feeds = []
    for item in sheet_guidance:
        for module in item.get("feeds") or []:
            if module not in feeds:
                feeds.append(module)
    action = "Pode gravar depois da revisao dos campos."
    if missing_global:
        action = "Revise os campos criticos antes de gravar; parte da planilha ficara apenas em auditoria."
    elif alignment_warnings:
        action = "Confira o alinhamento das colunas antes de gravar; o arquivo pode ter valores deslocados do cabecalho."
    elif not purpose_titles:
        action = "Mapeie manualmente as colunas uteis ou use a planilha apenas como registro bruto."
    structures = [item.get("structure") or {} for item in sheet_guidance if item.get("structure")]
    structure_statuses = {item.get("status") for item in structures}
    if "changed" in structure_statuses:
        structure_summary = "Estrutura alterada em relacao a importacoes anteriores."
    elif "known" in structure_statuses:
        structure_summary = "Estrutura conhecida: mapeamento anterior reaproveitado quando possivel."
    elif "new" in structure_statuses:
        structure_summary = "Estrutura nova: primeira leitura dessa planilha."
    else:
        structure_summary = ""
    return {
        "title": " + ".join(purpose_titles[:2]) if purpose_titles else "Planilha nao identificada",
        "risk": risk,
        "feeds": feeds[:8],
        "missing_critical": missing_global,
        "raw_only_fields": list(dict.fromkeys(raw_only_fields))[:10],
        "low_confidence_fields": list(dict.fromkeys(low_confidence))[:10],
        "alignment_warnings": alignment_warnings[:5],
        "ignored_columns": ignored_columns,
        "action": action,
        "next_recommended_file": next_recommended_import(readiness, current_block_ids),
        "structure_summary": structure_summary,
        "sheets": sheet_guidance,
    }


def missing_critical_fields(keys: set[str], purpose_id: str | None) -> list[dict]:
    missing = []
    has_product_dependent = any(key.split(".", 1)[0] in PRODUCT_DEPENDENT_ENTITIES for key in keys)
    has_product_sale = any(key.startswith("venda.") for key in keys) and "servico.nome_servico" not in keys
    if (has_product_dependent or has_product_sale or purpose_id in {"purchase_costs", "product_sales", "supplier_identifiers", "operational_settings"}) and "produto.codigo_produto" not in keys:
        missing.append(
            {
                "field": "produto.codigo_produto",
                "label": "Produto - codigo",
                "effect": "Sem codigo do produto, estoque, custo, preco, venda e ajustes de produto ficam sem item de destino.",
                "fix": "Mapeie a coluna de codigo interno/SKU ou exporte o arquivo com esse campo.",
            }
        )
    if (has_product_sale or purpose_id == "product_sales") and "venda.data_venda" not in keys:
        missing.append(
            {
                "field": "venda.data_venda",
                "label": "Venda - data",
                "effect": "Sem data, a venda nao entra em historico, demanda, curva ABC ou reposicao.",
                "fix": "Mapeie a data de emissao/movimento da venda.",
            }
        )
    if purpose_id == "services" and "servico.nome_servico" not in keys:
        missing.append(
            {
                "field": "servico.nome_servico",
                "label": "Servico - descricao",
                "effect": f"Sem descricao do servico, o {app_name()} nao consegue criar o historico por servico.",
                "fix": "Mapeie a coluna de servico/descricao do servico.",
            }
        )
    return missing


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


def expected_header_value_type(header: str) -> str:
    normalized = normalize(header)
    if not normalized:
        return ""
    if any(marker in normalized for marker in ("data", "dt_", "emissao", "vencimento", "pagamento")):
        return "data"
    if any(marker in normalized for marker in ("cnpj", "cpf", "documento", "doc_")):
        return "documento"
    numeric_markers = (
        "qtd",
        "quantidade",
        "qtde",
        "valor",
        "preco",
        "custo",
        "saldo",
        "estoque",
        "minimo",
        "maximo",
        "margem",
        "percentual",
        "desconto",
        "total",
        "unitario",
        "multiplo",
        "embalagem",
        "caixa",
    )
    if any(marker in normalized for marker in numeric_markers):
        return "numero"
    return ""


def value_type_matches_expected(value_type: str, expected: str) -> bool:
    if not expected or not value_type or value_type == "vazio":
        return True
    return value_type == expected


def detect_table_alignment_issues(
    rows_data: list[list[str]],
    headers: list[str],
    header_line: int,
    limit: int = 220,
) -> dict:
    if not headers or not header_line:
        return {"status": "ok", "message": "", "issue_count": 0, "examples": [], "hints": []}
    usable = [row for row in rows_data if any(str(cell or "").strip() for cell in row)]
    header_index = max(0, header_line - 1)
    if header_index >= len(usable):
        return {"status": "ok", "message": "", "issue_count": 0, "examples": [], "hints": []}

    width = len(headers)
    expected_types = [expected_header_value_type(header) for header in headers]
    clear_type_count = sum(1 for item in expected_types if item)
    raw_rows = usable[header_index + 1 : header_index + 1 + limit]
    examples = []
    issue_rows: set[int] = set()
    extra_cells_rows = 0
    shifted_rows = 0
    sampled_rows = 0

    for offset, row in enumerate(raw_rows, start=1):
        raw = [str(cell or "").strip() for cell in row]
        if not any(raw):
            continue
        sampled_rows += 1
        display_line = header_line + offset
        trailing_values = [value for value in raw[width:] if value]
        if trailing_values:
            extra_cells_rows += 1
            issue_rows.add(display_line)
            if len(examples) < 4:
                examples.append(
                    {
                        "line": display_line,
                        "reason": "A linha tem valores depois da ultima coluna do cabecalho.",
                        "sample": " | ".join(trailing_values[:3]),
                    }
                )

        if clear_type_count < 2:
            continue
        mismatches = 0
        adjacent_matches = 0
        for index, value in enumerate(raw[:width]):
            if not value:
                continue
            expected = expected_types[index] if index < len(expected_types) else ""
            if not expected:
                continue
            value_type = detect_value_type([value])
            if value_type_matches_expected(value_type, expected):
                continue
            mismatches += 1
            left_expected = expected_types[index - 1] if index > 0 else ""
            right_expected = expected_types[index + 1] if index + 1 < width else ""
            if value_type_matches_expected(value_type, left_expected) or value_type_matches_expected(value_type, right_expected):
                adjacent_matches += 1
        mismatch_limit = max(2, min(5, clear_type_count // 2))
        if adjacent_matches >= 2 or mismatches >= mismatch_limit:
            shifted_rows += 1
            issue_rows.add(display_line)
            if len(examples) < 4:
                examples.append(
                    {
                        "line": display_line,
                        "reason": "Os tipos dos valores nao combinam bem com os nomes das colunas.",
                        "sample": " | ".join(value for value in raw[: min(width, 6)] if value)[:140],
                    }
                )

    issue_count = len(issue_rows)
    issue_rate = (issue_count / sampled_rows) if sampled_rows else 0
    should_warn = issue_count >= 2 and (extra_cells_rows >= 2 or shifted_rows >= 2 or issue_rate >= 0.08)
    if not should_warn:
        return {
            "status": "ok",
            "message": "",
            "issue_count": issue_count,
            "sampled_rows": sampled_rows,
            "examples": examples[:2],
            "hints": [],
        }

    severity = "alto" if issue_rate >= 0.25 or issue_count >= 12 else "medio"
    message = (
        "Algumas linhas parecem desalinhadas com o cabecalho. "
        "Confira os exemplos das colunas antes de gravar para evitar que valor, quantidade, codigo ou data entrem no campo errado."
    )
    hints = [
        "Abra 'Conferir colunas reconhecidas' e veja se os exemplos batem com cada coluna.",
        "Se o arquivo veio de uma exportacao com quebras ou colunas mescladas, gere uma nova planilha mais simples antes de importar.",
    ]
    return {
        "status": "warn",
        "severity": severity,
        "message": message,
        "issue_count": issue_count,
        "sampled_rows": sampled_rows,
        "extra_cells_rows": extra_cells_rows,
        "shifted_rows": shifted_rows,
        "examples": examples,
        "hints": hints,
    }
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
    shared_string_chunks = []
    collecting_shared_strings = False
    boundsheets = []
    pos = 0
    while pos + 4 <= len(workbook):
        record_id, size = struct.unpack_from("<HH", workbook, pos)
        body = workbook[pos + 4 : pos + 4 + size]
        pos += 4 + size
        if record_id == 0x00FC:
            shared_string_chunks = [body]
            collecting_shared_strings = True
            continue
        if record_id == 0x003C and collecting_shared_strings:
            shared_string_chunks.append(body)
            continue
        collecting_shared_strings = False
        if shared_string_chunks and not shared_strings:
            shared_strings = parse_biff_sst(b"".join(shared_string_chunks))
        if record_id == 0x0085 and len(body) >= 8:
            sheet_pos = struct.unpack_from("<I", body, 0)[0]
            name_len = body[6]
            flags = body[7]
            raw_name = body[8 : 8 + name_len * (2 if flags & 0x01 else 1)]
            name = raw_name.decode("utf-16le" if flags & 0x01 else "cp1252", errors="ignore")
            boundsheets.append((name or f"Aba {len(boundsheets) + 1}", sheet_pos))
    if shared_string_chunks and not shared_strings:
        shared_strings = parse_biff_sst(b"".join(shared_string_chunks))
    sheets = []
    for name, sheet_pos in boundsheets[:5]:
        rows_data = parse_biff_sheet(workbook, sheet_pos, shared_strings)
        sheets.append({"name": name, "rows": rows_data})
    if not sheets:
        raise ValueError("O .xls foi lido, mas nenhuma aba foi encontrada.")
    return sheets, {"format": "xls_biff", "sheet_count": len(sheets), "parser": "python_biff"}


def parse_xls_with_excel_com(data: bytes) -> tuple[list[dict], dict]:
    script = r"""
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$path = $args[0]
$out = $args[1]
function Convert-CellValue($value) {
    if ($null -eq $value) { return "" }
    if ($value -is [double] -or $value -is [single] -or $value -is [decimal]) {
        $number = [double]$value
        if ([Math]::Abs($number - [Math]::Round($number)) -lt 0.0000001) {
            return [string][int64][Math]::Round($number)
        }
        return [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0}", $number)
    }
    return [string]$value
}
$excel = $null
$workbook = $null
try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    try { $excel.AutomationSecurity = 3 } catch {}
    $workbook = $excel.Workbooks.Open($path, 0, $true)
    $sheets = New-Object System.Collections.Generic.List[object]
    $sheetLimit = [Math]::Min($workbook.Worksheets.Count, 5)
    for ($s = 1; $s -le $sheetLimit; $s++) {
        $sheet = $workbook.Worksheets.Item($s)
        $used = $sheet.UsedRange
        $rowCount = [Math]::Min([int]$used.Rows.Count, 100000)
        $colCount = [int]$used.Columns.Count
        $values = $used.Value2
        $sheetRows = New-Object System.Collections.Generic.List[object]
        for ($r = 1; $r -le $rowCount; $r++) {
            $rowValues = New-Object object[] $colCount
            for ($c = 1; $c -le $colCount; $c++) {
                $cellValue = $null
                if ($values -is [System.Array]) {
                    $cellValue = $values.GetValue($r, $c)
                } elseif ($r -eq 1 -and $c -eq 1) {
                    $cellValue = $values
                }
                $rowValues[$c - 1] = Convert-CellValue $cellValue
            }
            $sheetRows.Add($rowValues)
        }
        $sheets.Add([pscustomobject]@{ name = [string]$sheet.Name; rows = $sheetRows.ToArray() })
    }
    $sheets.ToArray() | ConvertTo-Json -Depth 8 -Compress | Set-Content -LiteralPath $out -Encoding UTF8
} finally {
    if ($workbook -ne $null) { $workbook.Close($false) | Out-Null }
    if ($excel -ne $null) { $excel.Quit() | Out-Null }
    if ($workbook -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
    if ($excel -ne $null) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
"""
    with tempfile.TemporaryDirectory(prefix="nexo_xls_") as tmp_dir:
        tmp_path = Path(tmp_dir)
        workbook_path = tmp_path / "entrada.xls"
        output_path = tmp_path / "saida.json"
        script_path = tmp_path / "ler_xls.ps1"
        workbook_path.write_bytes(data)
        script_path.write_text(script, encoding="utf-8")
        startupinfo = None
        creationflags = 0
        if hasattr(subprocess, "STARTUPINFO"):
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startupinfo.wShowWindow = 0
        creationflags = int(getattr(subprocess, "CREATE_NO_WINDOW", 0))
        completed = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script_path),
                str(workbook_path),
                str(output_path),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=180,
            check=False,
            startupinfo=startupinfo,
            creationflags=creationflags,
        )
        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout or "").strip()
            raise ValueError(f"Excel nao conseguiu ler o .xls. {detail[:300]}")
        parsed = json.loads(output_path.read_text(encoding="utf-8-sig"))
    if isinstance(parsed, dict):
        parsed = [parsed]
    sheets = [
        {
            "name": scalar_text(sheet.get("name")) or f"Aba {index + 1}",
            "rows": [[scalar_text(cell) for cell in row] for row in (sheet.get("rows") or [])],
        }
        for index, sheet in enumerate(parsed or [])
    ]
    if not sheets:
        raise ValueError("Excel abriu o .xls, mas nenhuma aba util foi encontrada.")
    return sheets, {"format": "xls_excel_com", "sheet_count": len(sheets), "parser": "excel_com"}


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

    biff_error = None
    try:
        return parse_xls_biff(data)
    except Exception as error:
        biff_error = error
    try:
        sheets, metadata = parse_xls_with_excel_com(data)
        metadata["biff_error"] = str(biff_error)[:300] if biff_error else ""
        return sheets, metadata
    except Exception as excel_error:
        raise ValueError(
            "Nao foi possivel ler este .xls diretamente. Salve/exporte esta planilha como .xlsx ou .csv e tente novamente. "
            f"Detalhe tecnico: BIFF: {str(biff_error)[:220] if biff_error else 'indisponivel'} | Excel: {str(excel_error)[:220]}"
        ) from excel_error


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


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
    alignment = detect_table_alignment_issues(sheet["rows"], headers, header_line)
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
        "alignment": alignment,
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


def load_latest_erp_mapping_profiles(conn: sqlite3.Connection) -> list[dict]:
    profiles = []
    for row in conn.execute(
        """
        SELECT summary_json
        FROM import_batches
        WHERE source_system = 'erp_planilha'
          AND status = 'completed'
        ORDER BY finished_at DESC, started_at DESC
        LIMIT 50
        """
    ).fetchall():
        try:
            summary = json.loads(row["summary_json"] or "{}")
        except json.JSONDecodeError:
            continue
        file_name = summary.get("file_name") or ""
        for sheet in summary.get("mappings") or []:
            mapping = sheet.get("mapping") or {}
            fields = []
            labels = []
            for col_info in mapping.values():
                if not isinstance(col_info, dict):
                    continue
                entity = scalar_text(col_info.get("entity"))
                field = scalar_text(col_info.get("field"))
                if not entity or not field or entity == "ignorar" or field == "ignorar":
                    continue
                fields.append(f"{entity}.{field}")
                labels.append(scalar_text(col_info.get("label")) or f"{entity} - {field}")
            profiles.append(
                {
                    "file_name": file_name,
                    "sheet_name": sheet.get("sheet_name") or "",
                    "signature": sheet.get("signature") or "",
                    "fields": list(dict.fromkeys(fields)),
                    "labels": list(dict.fromkeys(labels)),
                }
            )
    return profiles


def erp_sheet_structure_status(sheet: dict, profiles: list[dict], file_name: str = "") -> dict:
    current_fields = []
    current_labels = []
    current_headers = []
    for column in sheet.get("columns") or []:
        current_headers.append(scalar_text(column.get("header")) or f"coluna {int(column.get('index') or 0) + 1}")
        key = erp_column_key(column)
        if key:
            current_fields.append(key)
            current_labels.append(erp_column_label(column))
    current_fields = list(dict.fromkeys(current_fields))
    current_labels = list(dict.fromkeys(current_labels))
    signature = sheet.get("signature") or ""
    exact = next((profile for profile in profiles if signature and profile.get("signature") == signature), None)
    if exact:
        return {
            "status": "known",
            "label": "Estrutura conhecida",
            "message": "A assinatura da planilha bate com um mapeamento ja gravado.",
            "reused_fields": len(set(current_fields) & set(exact.get("fields") or [])),
            "new_columns": [],
            "missing_columns": [],
            "matched_sheet": exact.get("sheet_name") or "",
        }
    scored = []
    current_field_set = set(current_fields)
    current_count = max(1, len(current_field_set))
    for profile in profiles:
        profile_fields = set(profile.get("fields") or [])
        if not profile_fields or not current_field_set:
            continue
        overlap = len(current_field_set & profile_fields)
        same_file_bonus = 2 if file_name and profile.get("file_name") == file_name else 0
        sheet_name = scalar_text(sheet.get("sheet_name"))
        profile_sheet = scalar_text(profile.get("sheet_name"))
        same_sheet_bonus = 1 if sheet_name and profile_sheet and sheet_name == profile_sheet and sheet_name.lower() not in {"sheet1", "aba 1"} else 0
        scored.append((overlap + same_file_bonus + same_sheet_bonus, overlap, profile))
    if not scored:
        return {
            "status": "new",
            "label": "Estrutura nova",
            "message": "Nao ha mapeamento anterior parecido para essa aba.",
            "reused_fields": 0,
            "new_columns": current_headers[:8],
            "missing_columns": [],
            "matched_sheet": "",
        }
    scored.sort(key=lambda item: item[0], reverse=True)
    _score, overlap, profile = scored[0]
    overlap_ratio = overlap / current_count
    if overlap < 3 or overlap_ratio < 0.55:
        return {
            "status": "new",
            "label": "Estrutura nova",
            "message": "Ha poucos campos em comum com importacoes anteriores; trate como uma nova origem.",
            "reused_fields": overlap,
            "new_columns": current_labels[:8],
            "missing_columns": [],
            "matched_sheet": "",
        }
    profile_fields = set(profile.get("fields") or [])
    current_label_by_field = {field: label for field, label in zip(current_fields, current_labels)}
    profile_label_by_field = {field: label for field, label in zip(profile.get("fields") or [], profile.get("labels") or [])}
    new_columns = [current_label_by_field.get(field, field) for field in current_fields if field not in profile_fields]
    missing_columns = [profile_label_by_field.get(field, field) for field in profile.get("fields") or [] if field not in current_field_set]
    return {
        "status": "changed" if overlap else "new",
        "label": "Estrutura alterada" if overlap else "Estrutura nova",
        "message": "A planilha parece relacionada a uma estrutura anterior, mas houve mudanca de campos." if overlap else "A estrutura nao reaproveita campos suficientes de importacoes anteriores.",
        "reused_fields": overlap,
        "new_columns": new_columns[:8],
        "missing_columns": missing_columns[:8],
        "matched_sheet": profile.get("sheet_name") or "",
    }


def api_erp_import_preview(conn: sqlite3.Connection, payload: dict) -> dict:
    file_name, sheets, metadata, content_hash, file_size = parse_erp_file_payload(payload)
    analyzed = [analyze_erp_sheet(sheet) for sheet in sheets]
    saved_mappings = load_latest_erp_mappings(conn)
    saved_profiles = load_latest_erp_mapping_profiles(conn)
    reused = apply_saved_erp_mapping(analyzed, saved_mappings)
    for sheet in analyzed:
        sheet["structure"] = erp_sheet_structure_status(sheet, saved_profiles, file_name)
    required_review = sum(1 for sheet in analyzed for column in sheet["columns"] if column["suggestion"]["confidence"] < 70)
    readiness = api_import_readiness(conn)
    return {
        "ok": True,
        "file_name": file_name,
        "metadata": {**metadata, "content_hash": content_hash, "file_size_bytes": file_size, "reused_mappings": reused},
        "sheets": analyzed,
        "assistant": erp_preview_assistant(analyzed, readiness),
        "field_options": [erp_field_option({"entity": "ignorar", "field": "ignorar", "label": "Ignorar / nao mapeado"})]
        + [erp_field_option(option) for option in ERP_FIELD_CATALOG],
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
        normalized.pop("_meta.product_code_inherited", None)
        if current_code != scalar_text(context.get("code")):
            context = {"code": current_code, "name": current_name}
        elif current_name:
            context["name"] = current_name
        return context
    previous_code = scalar_text(context.get("code"))
    if not previous_code:
        return context
    normalized["produto.codigo_produto"] = previous_code
    normalized["_meta.product_code_inherited"] = "1"
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


def should_apply_erp_product_context(_normalized: dict) -> bool:
    # Em vendas de produto, codigo herdado pode atribuir linhas sem CODIGO ao item anterior.
    # Para reposicao confiavel, venda so entra quando o produto vem explicito na linha.
    return False


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
    provided_name = scalar_text(name)
    existing_product = product_for_erp_code(conn, org, clean_code)
    if existing_product.get("exists"):
        actual_product_id = existing_product["id"]
        controlled_fields = app_controlled_fields(conn, org, "product", actual_product_id)
        if provided_name and "name" not in controlled_fields:
            conn.execute(
                """
                UPDATE products
                SET name = ?,
                    normalized_name = ?,
                    last_seen_import_batch_id = ?,
                    source_payload_json = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE organization_id = ?
                  AND id = ?
                """,
                (provided_name, normalize(provided_name), batch_id, json.dumps(payload, ensure_ascii=False), org, actual_product_id),
            )
        else:
            conn.execute(
                """
                UPDATE products
                SET last_seen_import_batch_id = ?,
                    source_payload_json = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE organization_id = ?
                  AND id = ?
                """,
                (batch_id, json.dumps(payload, ensure_ascii=False), org, actual_product_id),
            )
        conn.execute("INSERT OR IGNORE INTO product_settings (organization_id, product_id) VALUES (?, ?)", (org, actual_product_id))
        return actual_product_id

    clean_name = provided_name or generated_product_name(clean_code)
    product_id = erp_product_id(org, clean_code)
    conn.execute(
        """
        INSERT INTO products
            (id, organization_id, source_code, name, normalized_name, unit,
             first_seen_import_batch_id, last_seen_import_batch_id, source_payload_json)
        VALUES (?, ?, ?, ?, ?, 'UN', ?, ?, ?)
        ON CONFLICT(organization_id, source_code) DO UPDATE SET
            name = CASE
                WHEN excluded.name <> ''
                 AND NOT EXISTS (
                    SELECT 1 FROM entity_field_controls c
                    WHERE c.organization_id = products.organization_id
                      AND c.entity_type = 'product'
                      AND c.entity_id = products.id
                      AND c.field_name = 'name'
                      AND c.control_kind = 'app'
                 )
                THEN excluded.name
                ELSE products.name
            END,
            normalized_name = CASE
                WHEN excluded.name <> ''
                 AND NOT EXISTS (
                    SELECT 1 FROM entity_field_controls c
                    WHERE c.organization_id = products.organization_id
                      AND c.entity_type = 'product'
                      AND c.entity_id = products.id
                      AND c.field_name = 'name'
                      AND c.control_kind = 'app'
                 )
                THEN excluded.normalized_name
                ELSE products.normalized_name
            END,
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
    if clean_code:
        existing = conn.execute(
            "SELECT id FROM customers WHERE organization_id = ? AND source_code = ? ORDER BY id LIMIT 1",
            (org, clean_code),
        ).fetchone()
        if existing:
            controlled_fields = app_controlled_fields(conn, org, "customer", existing["id"])
            if "name" in controlled_fields:
                conn.execute(
                    """
                    UPDATE customers
                    SET last_seen_import_batch_id = ?
                    WHERE organization_id = ? AND id = ?
                    """,
                    (batch_id, org, existing["id"]),
                )
            else:
                conn.execute(
                    """
                    UPDATE customers
                    SET name = ?,
                        normalized_name = ?,
                        canonical_name = ?,
                        last_seen_import_batch_id = ?
                    WHERE organization_id = ? AND id = ?
                    """,
                    (clean_name, normalize(clean_name), canonical, batch_id, org, existing["id"]),
                )
            return existing["id"]
    conn.execute(
        """
        INSERT INTO customers
            (id, organization_id, source_code, name, normalized_name, canonical_name,
             first_seen_import_batch_id, last_seen_import_batch_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(organization_id, source_code, normalized_name) DO UPDATE SET
            name = CASE
                WHEN NOT EXISTS (
                    SELECT 1 FROM entity_field_controls c
                    WHERE c.organization_id = customers.organization_id
                      AND c.entity_type = 'customer'
                      AND c.entity_id = customers.id
                      AND c.field_name = 'name'
                      AND c.control_kind = 'app'
                )
                THEN excluded.name
                ELSE customers.name
            END,
            canonical_name = CASE
                WHEN NOT EXISTS (
                    SELECT 1 FROM entity_field_controls c
                    WHERE c.organization_id = customers.organization_id
                      AND c.entity_type = 'customer'
                      AND c.entity_id = customers.id
                      AND c.field_name = 'name'
                      AND c.control_kind = 'app'
                )
                THEN excluded.canonical_name
                ELSE customers.canonical_name
            END,
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
        (store_id, org, default_store_name()),
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
    if scalar_text(normalized.get("_meta.product_code_inherited")) == "1":
        return "inferred_product_code"
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
    clean_value = normalize_code(identifier_value)[:160] if identifier_type == "supplier_reference" else scalar_text(identifier_value)[:160]
    if not clean_value:
        return False
    same_value = conn.execute(
        """
        SELECT product_id, identifier_value
        FROM product_identifiers
        WHERE organization_id = ?
          AND identifier_type = ?
        """,
        (org, identifier_type),
    ).fetchall()
    if identifier_type == "supplier_reference":
        same_value = next((row for row in same_value if normalize_code(row["identifier_value"]) == clean_value), None)
    else:
        same_value = next((row for row in same_value if row["identifier_value"] == clean_value), None)
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


def generated_product_name(source_code: str) -> str:
    return f"Produto {scalar_text(source_code)}"


def is_generated_product_name(name: object, source_code: object) -> bool:
    return normalize(scalar_text(name)) == normalize(generated_product_name(scalar_text(source_code)))


def product_for_erp_code(conn: sqlite3.Connection, org: str, code: str) -> dict:
    clean_code = scalar_text(code)
    candidates = conn.execute(
        """
        SELECT id, source_code, name, active
        FROM products
        WHERE organization_id = ?
          AND (
            source_code = ?
            OR (
              ? NOT GLOB '*[^0-9]*'
              AND source_code NOT GLOB '*[^0-9]*'
              AND NULLIF(LTRIM(source_code, '0'), '') = NULLIF(LTRIM(?, '0'), '')
            )
          )
        """,
        (org, clean_code, clean_code, clean_code),
    ).fetchall()
    if candidates:
        def score(row: sqlite3.Row) -> tuple[int, int, int, int]:
            source_code = scalar_text(row["source_code"])
            exact = source_code == clean_code
            generated = is_generated_product_name(row["name"], source_code)
            return (
                0 if not generated else 1,
                0 if exact else 1,
                0 if int(row["active"] or 0) else 1,
                -len(source_code),
            )

        existing = sorted(candidates, key=score)[0]
        return {
            "id": existing["id"],
            "source_code": existing["source_code"] or clean_code,
            "name": existing["name"] or "",
            "exists": True,
        }
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
            name = CASE
                WHEN NOT EXISTS (
                    SELECT 1 FROM entity_field_controls c
                    WHERE c.organization_id = suppliers.organization_id
                      AND c.entity_type = 'supplier'
                      AND c.entity_id = suppliers.id
                      AND c.field_name = 'name'
                      AND c.control_kind = 'app'
                )
                THEN excluded.name
                ELSE suppliers.name
            END,
            normalized_name = CASE
                WHEN NOT EXISTS (
                    SELECT 1 FROM entity_field_controls c
                    WHERE c.organization_id = suppliers.organization_id
                      AND c.entity_type = 'supplier'
                      AND c.entity_id = suppliers.id
                      AND c.field_name = 'name'
                      AND c.control_kind = 'app'
                )
                THEN excluded.normalized_name
                ELSE suppliers.normalized_name
            END
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
        controlled_fields = app_controlled_fields(conn, org, "supplier", supplier_id)
        fields = {field: value for field, value in fields.items() if field not in controlled_fields}
        if not fields:
            return {"imported": 0, "created": 0, "updated": 0, "unchanged": 1, "invalid": invalid, "status": "app_controlled"}
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
    "preferred_supplier_id": "Produto - fornecedor preferencial",
    "package_size": "Produto - qtd. por embalagem de compra",
    "minimum_stock": "Produto - estoque minimo para compra",
    "maximum_stock": "Produto - estoque maximo para compra",
    "weight": "Produto - peso logistico",
    "expires": "Produto - perecivel/validade",
    "blocked_for_purchase": "Produto - bloquear compra",
    "ignored_in_purchase_reports": "Produto - ignorar em compras",
    "notes": "Produto - observacao operacional",
}

SETTING_DEFAULTS = {
    "preferred_supplier_id": "",
    "package_size": 1.0,
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
        "minimum_stock": "configuracao.minimum_stock",
        "maximum_stock": "configuracao.maximum_stock",
        "weight": "configuracao.weight",
    }
    for field, key in numeric_fields.items():
        if scalar_text(normalized.get(key)):
            value = parse_decimal(normalized.get(key), None)
            if value is not None:
                fields[field] = {
                    "value": value,
                    "display": scalar_text(value),
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
    clean_value = normalize_code(identifier_value)[:160] if identifier_type == "supplier_reference" else scalar_text(identifier_value)[:160]
    if not clean_value:
        return None
    manual_rows = conn.execute(
        """
        SELECT identifier_value
        FROM product_identifiers
        WHERE organization_id = ?
          AND product_id = ?
          AND identifier_type = ?
          AND source_system = 'manual'
        ORDER BY id DESC
        """,
        (org, product_id, identifier_type),
    ).fetchall()
    if identifier_type == "supplier_reference":
        manual = next((row for row in manual_rows if normalize_code(row["identifier_value"]) != clean_value), None)
    else:
        manual = next((row for row in manual_rows if row["identifier_value"] != clean_value), None)
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
    organization_id = default_organization_id(conn) or default_organization_slug()
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
    product_sales_inferred_product_code = 0
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
        (organization_id, imported_company_name()),
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
            if should_apply_erp_product_context(record.get("normalized") or {}):
                product_context = apply_erp_product_context(record, product_context)
            else:
                product_context = {}
            service_context = apply_erp_service_context(record, service_context)
            normalized = record.get("normalized") or {}
            product_code = scalar_text(normalized.get("produto.codigo_produto"))
            inferred_product_code = scalar_text(normalized.get("_meta.product_code_inherited")) == "1"
            if product_code and not inferred_product_code:
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
            elif product_sale_status == "inferred_product_code":
                product_sales_inferred_product_code += 1
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
    static_product_rows = (
        inventory_snapshots_imported
        + inventory_snapshots_updated
        + price_snapshots_imported
        + cost_snapshots_imported
    )
    low_static_product_coverage = (
        static_product_rows > 0
        and product_dependent_rows >= 100
        and len(product_code_values) < max(20, int(product_dependent_rows * 0.5))
    )
    if low_static_product_coverage:
        raise ValueError(
            "Importacao bloqueada: a planilha tem "
            f"{product_dependent_rows} linha(s) de produto/estoque/preco/custo, "
            f"mas so {len(product_code_values)} codigo(s) de produto distintos foram identificados. "
            "Isso indica leitura incompleta do .xls ou exportacao agrupada. "
            "Exporte como .xlsx/.csv ou revise o arquivo antes de gravar."
        )
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
    if product_sales_inferred_product_code:
        conn.execute(
            """
            INSERT INTO import_issues
                (import_batch_id, source_file_id, severity, code, message)
            VALUES (?, ?, 'warning', 'erp_product_sale_inferred_product_code', ?)
            """,
            (batch_id, source_file_id, f"{product_sales_inferred_product_code} linhas de venda tinham codigo de produto apenas herdado e foram ignoradas para evitar atribuir venda ao item errado."),
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
            (batch_id, source_file_id, f"{settings_rows_missing_product_code} linhas tinham ajustes de produto, mas nao tinham codigo de produto mapeado."),
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
        "product_sales_inferred_product_code": product_sales_inferred_product_code,
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
    organization_id = default_organization_id(conn)
    if not organization_id:
        coverage = {}
    else:
        coverage = one(
            conn,
            """
            WITH current_org(id) AS (VALUES (?))
            SELECT
                (SELECT COUNT(*) FROM products WHERE organization_id = current_org.id) AS products,
                (SELECT COUNT(DISTINCT product_id) FROM price_snapshots WHERE organization_id = current_org.id) AS products_with_price,
                (SELECT COUNT(DISTINCT product_id) FROM inventory_snapshots WHERE organization_id = current_org.id) AS products_with_stock,
                (SELECT COUNT(DISTINCT product_id) FROM cost_snapshots WHERE organization_id = current_org.id) AS products_with_cost,
                (SELECT COUNT(*) FROM product_sales WHERE organization_id = current_org.id) AS product_sales,
                (SELECT COUNT(DISTINCT product_id) FROM product_sales WHERE organization_id = current_org.id) AS products_with_sales,
                (SELECT COUNT(DISTINCT substr(sold_at, 1, 7)) FROM product_sales WHERE organization_id = current_org.id) AS sales_months,
                (SELECT COUNT(*) FROM service_sales WHERE organization_id = current_org.id) AS service_sales,
                (SELECT COUNT(*) FROM services WHERE organization_id = current_org.id) AS services,
                (SELECT COUNT(*) FROM customers WHERE organization_id = current_org.id) AS customers,
                (SELECT COUNT(*) FROM suppliers WHERE organization_id = current_org.id) AS suppliers,
                (SELECT COUNT(*) FROM product_settings WHERE organization_id = current_org.id AND COALESCE(package_size, 1) > 1) AS products_with_package,
                (SELECT COUNT(DISTINCT product_id) FROM product_identifiers WHERE organization_id = current_org.id AND identifier_type = 'barcode') AS products_with_barcode,
                (SELECT COUNT(DISTINCT product_id) FROM product_identifiers WHERE organization_id = current_org.id AND identifier_type = 'supplier_reference') AS products_with_supplier_reference,
                (
                    SELECT COUNT(*)
                    FROM source_files sf
                    JOIN import_batches ib ON ib.id = sf.import_batch_id
                    WHERE ib.organization_id = current_org.id
                      AND LOWER(sf.file_name) LIKE '%saidaprodlucro%'
                ) AS deprecated_profit_files
            FROM current_org
            """,
            (organization_id,),
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
            "title": "Ajustes de produto importaveis",
            "expected_files": ["parametros de compra", "cadastro operacional", "planilha de ajustes manuais"],
            "what_to_send": ["fornecedor preferencial", "qtd. por embalagem de compra", "estoque minimo", "estoque maximo", "peso", "perecivel", "bloquear compra", "ignorar relatorios", "observacao"],
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
            "title": f"Campos derivados pelo {app_name()}",
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
    organization_id = default_organization_id(conn)
    if not organization_id:
        latest = {}
    else:
        latest = one(
            conn,
            """
            SELECT id, source_system, status, started_at, finished_at, summary_json
            FROM import_batches
            WHERE organization_id = ?
            ORDER BY started_at DESC
            LIMIT 1
            """,
            (organization_id,),
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
    organization_id = default_organization_id(conn)
    if not organization_id:
        return []
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
            WHERE ib.status = 'completed'
              AND ib.organization_id = ?
              AND sf.file_name IS NOT NULL
              AND sf.file_name <> ''
        )
        SELECT file_name, batch_id, source_system, finished_at, summary_json, row_count
        FROM ranked
        WHERE rn = 1
        ORDER BY finished_at DESC
        LIMIT 10
        """,
        (organization_id,),
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


def read_local_import_config() -> dict:
    try:
        return json.loads(import_config_path().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def write_local_import_config(config: dict) -> None:
    path = import_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def latest_import_file_metadata(conn: sqlite3.Connection, organization_id: str = "") -> dict[str, dict]:
    organization_id = organization_id or default_organization_id(conn)
    if not organization_id:
        return {}
    result = {}
    for row in rows(
        conn,
        """
        WITH ranked AS (
            SELECT
                sf.file_name,
                sf.content_hash,
                sf.row_count,
                sf.file_size_bytes,
                ib.id AS batch_id,
                ib.finished_at,
                ib.started_at,
                ib.summary_json,
                ROW_NUMBER() OVER (PARTITION BY sf.file_name ORDER BY ib.finished_at DESC, ib.started_at DESC) AS rn
            FROM source_files sf
            JOIN import_batches ib ON ib.id = sf.import_batch_id
            WHERE ib.status = 'completed'
              AND ib.organization_id = ?
              AND sf.file_name IS NOT NULL
              AND sf.file_name <> ''
        )
        SELECT file_name, content_hash, row_count, file_size_bytes, batch_id, finished_at, started_at, summary_json
        FROM ranked
        WHERE rn = 1
        """,
        (organization_id,),
    ):
        result[row["file_name"]] = row
    return result


def reference_file_names(conn: sqlite3.Connection, organization_id: str = "") -> list[str]:
    imported_names = list(latest_import_file_metadata(conn, organization_id).keys())
    if active_tenant():
        return imported_names
    names = list(REFERENCE_FILE_ORDER)
    for file_name in imported_names:
        if file_name not in names:
            names.append(file_name)
    return names


def local_reference_status(conn: sqlite3.Connection) -> dict:
    organization_id = default_organization_id(conn)
    config = read_local_import_config()
    folder = scalar_text(config.get("folder"))
    folder_path = Path(folder).expanduser() if folder else None
    latest_by_file = latest_import_file_metadata(conn, organization_id)
    files = []
    for file_name in reference_file_names(conn, organization_id):
        if Path(file_name).name != file_name:
            continue
        latest = latest_by_file.get(file_name) or {}
        path = folder_path / file_name if folder_path else None
        exists = bool(path and path.exists() and path.is_file())
        current_hash = ""
        modified = False
        size = 0
        modified_at = ""
        if exists and path:
            stat = path.stat()
            size = int(stat.st_size)
            modified_at = datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds")
            try:
                current_hash = sha256_file(path)
            except OSError:
                current_hash = ""
            modified = bool(current_hash and latest.get("content_hash") and current_hash != latest.get("content_hash"))
            needs_update = bool(current_hash and (not latest.get("content_hash") or current_hash != latest.get("content_hash")))
        elif latest.get("content_hash"):
            modified = False
            needs_update = False
        else:
            needs_update = False
        files.append(
            {
                "file_name": file_name,
                "exists": exists,
                "modified": modified,
                "needs_update": needs_update,
                "size": size,
                "modified_at": modified_at,
                "last_imported_at": latest.get("finished_at") or latest.get("started_at") or "",
                "last_batch_id": latest.get("batch_id") or "",
                "rows_imported": int(latest.get("row_count") or 0),
            }
        )
    return {
        "configured": bool(folder),
        "folder": folder,
        "folder_exists": bool(folder_path and folder_path.exists() and folder_path.is_dir()),
        "files": files,
    }


def api_import_reference_folder(conn: sqlite3.Connection, payload: dict) -> dict:
    folder = scalar_text(payload.get("folder"))
    if not folder:
        write_local_import_config({"folder": ""})
        return {"ok": True, "local_reference": local_reference_status(conn), "imports": api_imports(conn)}
    path = Path(folder).expanduser()
    if not path.exists() or not path.is_dir():
        raise ValueError("Pasta de referencia nao encontrada.")
    write_local_import_config({"folder": str(path)})
    return {"ok": True, "local_reference": local_reference_status(conn), "imports": api_imports(conn)}


def mappings_from_import_preview(preview: dict) -> list[dict]:
    mappings = []
    for sheet_index, sheet in enumerate(preview.get("sheets") or []):
        columns = []
        for column in sheet.get("columns") or []:
            suggestion = column.get("suggestion") or {}
            columns.append(
                {
                    "index": column.get("index") or 0,
                    "header": column.get("header") or "",
                    "entity": suggestion.get("entity") or "ignorar",
                    "field": suggestion.get("field") or "ignorar",
                    "label": suggestion.get("label") or "Ignorar / nao mapeado",
                }
            )
        mappings.append(
            {
                "sheet_index": sheet_index,
                "sheet_name": sheet.get("sheet_name") or f"Aba {sheet_index + 1}",
                "signature": sheet.get("signature") or "",
                "columns": columns,
            }
        )
    return mappings


def api_import_refresh_local(conn: sqlite3.Connection, payload: dict) -> dict:
    config = read_local_import_config()
    folder = scalar_text(config.get("folder"))
    if not folder:
        raise ValueError("Configure a pasta de referencia antes de atualizar.")
    folder_path = Path(folder).expanduser()
    if not folder_path.exists() or not folder_path.is_dir():
        raise ValueError("Pasta de referencia nao encontrada.")
    selected = payload.get("file_names") or payload.get("files") or []
    if isinstance(selected, str):
        selected = [item.strip() for item in selected.split(",") if item.strip()]
    allowed = set(reference_file_names(conn))
    results = []
    for file_name in selected:
        clean_name = Path(scalar_text(file_name)).name
        if not clean_name or clean_name not in allowed:
            results.append({"file_name": clean_name or scalar_text(file_name), "ok": False, "error": "Arquivo fora das fontes conhecidas."})
            continue
        path = folder_path / clean_name
        if not path.exists() or not path.is_file():
            results.append({"file_name": clean_name, "ok": False, "error": "Arquivo nao encontrado na pasta configurada."})
            continue
        try:
            raw_bytes = path.read_bytes()
            preview = api_erp_import_preview(conn, {"file_name": clean_name, "_file_bytes": raw_bytes})
            total_columns = int((preview.get("summary") or {}).get("columns") or 0)
            reused_mappings = int((preview.get("summary") or {}).get("reused_mappings") or 0)
            required_review = int((preview.get("summary") or {}).get("required_review") or 0)
            if required_review or reused_mappings < total_columns:
                results.append(
                    {
                        "file_name": clean_name,
                        "ok": False,
                        "error": "Estrutura mudou ou mapeamento incompleto. Use o importador manual para revisar.",
                        "summary": preview.get("summary") or {},
                    }
                )
                continue
            commit = api_erp_import_commit(
                conn,
                {
                    "file_name": clean_name,
                    "_file_bytes": raw_bytes,
                    "import_mode": "configured_update",
                    "mappings": mappings_from_import_preview(preview),
                },
            )
            results.append({"file_name": clean_name, "ok": True, "batch_id": commit.get("batch_id"), "summary": commit.get("summary") or {}})
        except Exception as exc:
            conn.rollback()
            results.append({"file_name": clean_name, "ok": False, "error": str(exc)})
    return {"ok": all(item.get("ok") for item in results), "results": results, "imports": api_imports(conn)}


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
    organization_id = default_organization_id(conn)
    batches = []
    if organization_id:
        batches = rows(
            conn,
            """
            SELECT id, source_system, status, source_period_start, source_period_end, started_at, finished_at, summary_json
            FROM import_batches
            WHERE organization_id = ?
            ORDER BY started_at DESC
            LIMIT 20
            """,
            (organization_id,),
        )
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
    issues = []
    changes = []
    if organization_id:
        issues = rows(
            conn,
            """
            SELECT ii.severity, ii.code, ii.message, ii.source_line
            FROM import_issues ii
            JOIN import_batches ib ON ib.id = ii.import_batch_id
            WHERE ib.organization_id = ?
            ORDER BY ii.id DESC
            LIMIT 200
            """,
            (organization_id,),
        )
        changes = rows(
            conn,
            """
            SELECT entity_type, source_code, field_name, previous_value, new_value, review_status, created_at
            FROM source_entity_changes
            WHERE organization_id = ?
            ORDER BY id DESC
            LIMIT 200
            """,
            (organization_id,),
        )
    readiness = api_import_readiness(conn)
    quality = import_quality_report(conn)
    next_file = next_recommended_import(readiness)
    module_scores = import_module_scores(readiness, quality)
    state = implementation_state(readiness, quality, module_scores)
    return {
        "contract": "imports.v1",
        "batches": batches,
        "issues": issues,
        "changes": changes,
        "refresh_targets": import_refresh_targets(conn),
        "local_reference": local_reference_status(conn),
        "readiness": readiness,
        "quality": quality,
        "assistant": {
            "next_recommended_file": next_file,
            "module_scores": module_scores,
            "implementation_state": state,
            "status": quality.get("status") or "no_imports",
            "message": quality.get("next_step") or next_file.get("why") or "",
        },
    }
