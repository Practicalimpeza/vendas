# Catalogo Analitico

Este catalogo enumera o maximo de analises, metricas, hipoteses e previsoes que
o NexoVarejo pode construir a partir do modelo canonico. Nem tudo entra na beta,
mas tudo aqui ajuda a desenhar o produto.

## Dashboard executivo

- Receita bruta, receita liquida e margem.
- Receita de produtos versus servicos.
- Evolucao diaria, semanal e mensal.
- Ticket medio.
- Quantidade de vendas e itens vendidos.
- Produtos ativos, produtos vendidos e produtos sem giro.
- Estoque total em unidades e valor.
- Alertas de ruptura, excesso e margem baixa.
- Ranking de prioridades do dia.

## Produtos e mix

- Curva ABC por receita, margem, quantidade e frequencia.
- Produtos A com estoque baixo.
- Produtos C com excesso.
- Produtos sem venda no periodo.
- Produtos novos versus recorrentes.
- Ranking de crescimento e queda.
- Concentracao de receita por produto, marca e categoria.
- Mix comprado por clientes importantes.
- Produtos substitutos ou complementares por coocorrencia.
- Sensibilidade a preco quando houver historico de preco.

## Estoque

- Cobertura em dias por produto.
- Estoque ideal por media, sazonalidade e lead time.
- Ruptura provavel.
- Excesso parado.
- Giro de estoque.
- Dias sem venda.
- Valor financeiro parado.
- Estoque critico por produto A.
- Estoque divergente entre snapshots.
- Simulacao de compra ate o horizonte calculado.

## Compras e reposicao

- Sugestao de compra por produto.
- Sugestao agrupada por fornecedor.
- Quantidade em caixas/fardos/embalagens.
- Valor estimado do pedido.
- Pedido minimo por fornecedor.
- Valor alvo para condicao comercial ou desconto.
- Priorizacao por ruptura, margem e importancia ABC.
- Produtos bloqueados para compra.
- Produtos a desconsiderar em relatorios.
- Historico de pedidos, chegada e atraso.
- Comparacao entre pedido sugerido, aprovado, enviado e recebido.

## Fornecedores

- Receita e margem por fornecedor inferido.
- Marcas atendidas por fornecedor.
- Produtos criticos por fornecedor.
- Dependencia de fornecedor.
- Prazo medio real quando houver pedidos recebidos.
- Atrasos e confiabilidade.
- Pedido minimo versus necessidade real.
- Oportunidade de consolidacao de compras.
- Fornecedores sem contato ou regra cadastrada.

## Clientes

- RFM: recencia, frequencia e valor monetario.
- Clientes fieis, ativos, novos, pontuais e em risco.
- Clientes que reduziram compra.
- Clientes inativos com historico relevante.
- Ticket medio por cliente.
- Mix por cliente.
- Categorias compradas e nao compradas.
- Clientes de produto, servico ou ambos.
- Concentracao de receita nos maiores clientes.
- Clientes genericos que devem sair de analises relacionais.

## Servicos

- Receita por tipo de servico.
- Quantidade e ticket medio por servico.
- Receita liquida e tributos.
- Clientes recorrentes de servico.
- Sazonalidade de servicos.
- Relacao entre venda de produto e servico por cliente.
- Servicos de maior margem quando houver custo.

## Margem e lucro

- Margem bruta por produto.
- Margem liquida por produto, se houver custo operacional e imposto.
- Produtos com alta receita e baixa margem.
- Produtos com margem negativa.
- Margem por marca, categoria e fornecedor.
- Diferenca entre preco de venda e custo total.
- Evolucao de margem quando houver snapshots de custo/preco.
- Reconciliacao entre relatorios agregados e transacoes.

## Previsao e simulacao

- Demanda media diaria, semanal e mensal.
- Previsao simples por media movel.
- Previsao com sazonalidade por dia da semana, mes e feriado futuro.
- Intervalo de confianca para demanda.
- Simulacao de falta ate a proxima compra.
- Simulacao de capital necessario para repor.
- Impacto de alterar ciclo, embalagem ou minimo operacional.
- Projecao de receita por carteira ativa.
- Probabilidade de recompra por cliente e categoria.

## Qualidade de dados e implantacao

- Produtos sem categoria.
- Produtos sem fornecedor.
- Produtos sem custo.
- Produtos sem preco.
- Produtos com codigo de barras vazio.
- Duplicidade de produto por nome, codigo ou codigo de barras.
- Clientes duplicados por nome normalizado.
- Linhas descartadas por rodape, data invalida ou numero invalido.
- Divergencia entre total da origem e total importado.
- Campos novos detectados em uma exportacao.

## Tarefas gerenciais

- Revisar produtos A com ruptura.
- Revisar produtos C com excesso.
- Completar fornecedores de marcas sem regra.
- Reativar clientes em risco.
- Ajustar preco de produtos com margem baixa.
- Negociar fornecedor para produtos de alta dependencia.
- Aprovar pedido sugerido.
- Registrar chegada de pedido.
- Corrigir cadastro de produto.
