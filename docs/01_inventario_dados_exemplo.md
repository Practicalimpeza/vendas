# Inventario dos Dados de Exemplo

Levantamento inicial feito sobre as exportacoes na raiz do projeto em
2026-05-02.

## Arquivos

| Arquivo | Linhas de dados | Papel provavel |
| --- | ---: | --- |
| `produtopreco__Sheet1.csv` | 1.881 | Cadastro de produtos, codigo de barras, unidade, marca, estoque e preco de venda atual. |
| `produtocusto__Sheet1.csv` | 1.881 | Custo de compra, frete, ICMS, IPI e custo total por produto. |
| `saidaprod__Sheet1.csv` | 38.193 validas | Vendas/saidas de produtos por data, quantidade, valor e cliente. Tem 2 linhas finais de rodape. |
| `saidaprodlucro__Sheet1.csv` | 1.810 | Resumo de quantidade, receita, custo, impostos, custo operacional e lucro por produto. |
| `servico__Sheet1.csv` | 14.776 validas | Vendas de servicos por data, pedido, servico, cliente, quantidade, valor, tributos e valor liquido. Tem metadados no topo e rodapes no fim. |

## Periodo

- Produtos: registros validos entre 2024-04-01 e 2026-04-30.
- Servicos: registros validos entre 2024-04-01 e 2026-04-30.
- O periodo de aproximadamente dois anos foi arbitrario para esta base teste.

## Volumes e totais iniciais

| Medida | Valor |
| --- | ---: |
| Produtos cadastrados no arquivo de preco | 1.881 |
| Produtos com venda no periodo | 1.579 |
| Marcas identificadas | 166 |
| Clientes em vendas de produtos, por codigo de origem | 15.489 |
| Clientes em servicos, por nome | 1.535 |
| Tipos/descricoes de servico | 1.297 |
| Estoque atual em unidades | 15.864,1499 |
| Quantidade vendida de produtos | 81.074,708 |
| Receita de produtos | R$ 3.439.099,25 |
| Quantidade vendida de servicos | 49.809,88 |
| Receita de servicos | R$ 965.104,96 |
| Tributos de servicos | R$ 96.510,50 |
| Receita liquida de servicos | R$ 868.594,46 |
| Receita no relatorio de lucro por produto | R$ 5.107.129,44 |
| Lucro bruto no relatorio de lucro | R$ 2.391.631,00 |
| Lucro liquido no relatorio de lucro | R$ 620.561,94 |

## Principais problemas de importacao ja vistos

- Alguns cabecalhos nao representam a posicao real das colunas.
- Datas aparecem como serial do Excel.
- Existem linhas de totalizacao e paginacao no fim dos CSVs.
- Algumas colunas de rodape usam formato brasileiro com ponto de milhar e virgula
  decimal sem aspas, quebrando a leitura CSV comum.
- `saidaprod__Sheet1.csv` parece ter colunas reais:
  `codigo`, `produto`, `data_serial`, `qtd`, `valor_saida`, `tipo`,
  `cliente_codigo`, `cliente_nome`.
- `servico__Sheet1.csv` parece ter colunas reais:
  `data_serial`, `pedido`, `servico`, `cliente`, `quant`, `valor`, `tributos`,
  `valor_liq`.
- Ha clientes genericos como `CONSUMIDOR`, que precisam de tratamento proprio em
  analises de cliente.
- O arquivo de lucro por produto nao parece ser transacional; ele deve entrar como
  resumo/relatorio importado ou como base de reconciliacao.
- Fornecedores nao aparecem claramente nos CSVs atuais. Sera necessario cadastro
  manual, inferencia por marca, ou exportacoes adicionais.

## Top exemplos observados

Produtos com maior receita em `saidaprod__Sheet1.csv`:

- HIDROALL - CLORO PENTA 10KG.
- HTH - CLORO GRANULADO 10KG.
- DWOLF - PAPEL HIGIENICO ROLAO 300MT.
- TOTALPLAST - CX COPO AGUA TRANSPARENTE 180ML.
- MAXBIO - PORCELANATO DESINCRUSTANTE 5LT.

Servicos com maior receita em `servico__Sheet1.csv`:

- TAPETE GRANDE.
- PECAS.
- EDREDOM CASAL KING.
- CALCA OPERACIONAL.
- TAPETE MEDIO.

