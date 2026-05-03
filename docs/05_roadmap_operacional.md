# Roadmap Operacional

## Fase 0 - Fundacao

- Consolidar contrato canonico SQL.
- Criar conector da base exemplo.
- Rodar importacao local reprodutivel.
- Gerar relatorio de qualidade do lote.
- Criar testes para cabecalho deslocado, datas serializadas e rodapes.

## Fase 1 - Beta analitica

- Dashboard executivo.
- Produtos mais vendidos e curva ABC.
- Estoque atual e cobertura.
- Filtro global de periodo para analises de venda, cliente, servico, reposicao e precificacao. **Primeira versao implementada.**
- Sugestao inicial de compra por produto.
- Clientes por RFM.
- Servicos por receita e recorrencia.
- Relatorio de margem por produto usando o arquivo de lucro.
- Pendencias cadastrais de produto, marca, fornecedor e categoria.
- Playbook de implantacao para novos comercios.
- Relatorio automatico de qualidade e reconciliacao do lote.

## Fase 2 - Mesa de compras

- Cadastro de fornecedores.
- Regras por fornecedor: pedido minimo, prazo medio, contato, observacoes e valor
  alvo para condicao comercial.
- Configuracao por produto: caixa/fardo, cobertura alvo, bloqueio, categoria,
  subcategoria, vencimento, peso e observacoes.
- Pedido por fornecedor em rascunho.
- Decisao de mix no pedido: tirar produto da rotina ou forcar mais uma compra. **Primeira versao implementada.**
- Envio e resposta de cotacao com aprendizado de preco, embalagem/divisor e prazo. **Primeira versao implementada.**
- Aprovacao da cotacao como pedido de compra canonico. **Primeira versao implementada.**
- Recebimento e historico.
- Comparacao entre sugerido e comprado.

## Fase 3 - Inteligencia comercial

- Clientes em risco e oportunidades de recompra. **Primeira versao implementada.**
- Mix por cliente e lacunas de categoria.
- Precificacao acionavel com custo manual, papel do produto e sinais de margem. **Primeira versao implementada.**
- Ranking de crescimento/queda por produto e marca. **Primeira versao implementada.**
- Ranking de crescimento/queda por cliente.
- Analise de servicos junto com produtos.
- Central de acoes do gestor. **Primeira versao implementada.**
- Alertas semanais para gestor.

## Fase 4 - SaaS escalavel

- Multiempresa completo.
- Autenticacao e permissoes.
- Auditoria de alteracoes manuais.
- Skills internas versionadas do Nexo. **Primeira versao implementada.**
- Motor do Nexo para explicar skills, regras e acoes. **Primeira versao implementada.**
- Agendamento de importacoes.
- Biblioteca de conectores por ERP.
- Ferramentas internas de onboarding e diagnostico de arquivos.
- Postgres em producao.
- Billing por assinatura.

## Proxima decisao recomendada

Implementar primeiro o conector da exportacao atual e um banco local canonico. Sem
isso, qualquer dashboard corre o risco de virar uma analise presa a uma planilha,
e nao um produto reutilizavel.
