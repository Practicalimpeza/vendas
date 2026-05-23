# Roadmap Operacional

Este roadmap reflete o momento atual do MVP local em 2026-05-06. A prioridade
nao e aumentar escopo; e transformar o que ja existe em uma beta confiavel,
explicavel e facil de implantar.

## Fase 0 - Fundacao

- Consolidar contrato canonico SQL. **Implementado.**
- Criar conector da base exemplo. **Implementado.**
- Rodar importacao local reprodutivel. **Implementado.**
- Trocar `full_refresh` destrutivo por sincronizacao incremental. **Implementado.**
- Gerar relatorio de qualidade do lote. **Primeira versao implementada.**
- Criar smoke automatizado de fluxo beta ponta a ponta. **Implementado.**
- Consolidar arquitetura pos-monolito em modulos por area. **Implementado.**
- Criar testes para cabecalho deslocado, datas serializadas e rodapes.

## Fase 1 - Beta analitica

- Dashboard executivo.
- Produtos mais vendidos e curva ABC.
- Estoque atual e cobertura.
- Filtro global de periodo para analises de venda, cliente, servico, reposicao e precificacao. **Primeira versao implementada.**
- Sugestao inicial de compra por produto.
- Clientes por RFM.
- Servicos por receita e recorrencia.
- Precificacao por custo importado/manual, papel do produto e margem alvo.
- Pendencias cadastrais de produto, marca, fornecedor e categoria.
- Playbook de implantacao para novos comercios.
- Relatorio automatico de qualidade e reconciliacao do lote. **Primeira versao implementada.**
- Checklist de beta assistida com primeiro valor entregue.

## Fase 2 - Mesa de compras

- Cadastro de fornecedores.
- Regras por fornecedor: pedido minimo, prazo medio, contato, observacoes e valor
  alvo para condicao comercial.
- Configuracao por produto: caixa/fardo, ciclo calculado, bloqueio, categoria,
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
- Autenticacao e permissoes. Antes disso, servidor local bloqueia exposicao de
  rede por padrao. **Protecao minima implementada.**
- Auditoria de alteracoes manuais.
- Skills internas versionadas do Nexo. **Primeira versao implementada.**
- Motor do Nexo para explicar skills, regras e acoes. **Primeira versao implementada.**
- Agendamento de importacoes.
- Biblioteca de conectores por ERP.
- Ferramentas internas de onboarding e diagnostico de arquivos.
- Postgres em producao.
- Billing por assinatura.

## Proxima decisao recomendada

Transformar o MVP local em beta assistida: documentacao enxuta, skills alinhadas
ao comportamento real, smoke tests e um fluxo claro de implantacao para novos
comercios. Migracao para Postgres e autenticacao completa so devem entrar quando
o ambiente de uso da beta estiver definido.
