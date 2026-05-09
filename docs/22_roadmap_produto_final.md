# Roadmap para Produto Final

Este documento transforma o roadmap de melhoria estrutural em um plano de
execucao. A meta nao e reescrever o NexoVarejo; e preservar a inteligencia ja
criada e tornar o produto confiavel, guiado e operavel fora do MVP local.

## Principios

- Proteger fluxos que afetam dinheiro, compra, margem e decisao comercial.
- Melhorar a experiencia em jornadas de trabalho, nao apenas adicionar telas.
- Manter a stack simples enquanto o produto ainda valida rotina com usuarios.
- Separar regras por dominio antes de pensar em infraestrutura maior.
- Toda mudanca importante precisa deixar evidencia: smoke, doc, skill ou log.

## Fase 1: Confiabilidade

Status: fechada em 2026-05-08.

Objetivo: garantir que os fluxos centrais nao quebrem silenciosamente.

Escopo inicial:

- Smoke check cobrindo resumo por periodo, reposicao, precificacao, cotacao,
  PDF de cotacao, pedido, recebimento, importacao assistida e rotas HTTP.
- Contratos basicos de API para payloads usados pelo frontend.
- Correcao de inconsistencias de periodo em KPIs, rankings e dashboards.
- Padrao de erro em endpoints para o frontend mostrar estados uteis.

Pronto quando:

- `scripts/smoke_checks.py` roda em banco temporario sem depender dos CSVs.
- Mudancas em compras, clientes, produtos e margem tem pelo menos uma checagem
  automatizada ou manual documentada.
- A tela inicial mostra indicadores coerentes com o periodo selecionado.

Evidencias de fechamento:

- `scripts/smoke_checks.py` cobre schema, assets, contratos, resumo por
  periodo, reposicao, precificacao, cotacao, PDF, pedido, recebimento,
  importacao assistida e rotas HTTP.
- `docs/23_contratos_api.md` registra contratos centrais e envelope de erro.
- `/api/health` expõe o estado minimo do schema e dos contratos cobertos.
- O frontend valida contratos com `apiContract(...)` e listas com
  `apiRows(...)`, mostrando aviso global quando uma falha aparece.

## Fase 2: Organizacao Interna

Status: fechada em 2026-05-08.

Objetivo: reduzir acoplamento e deixar cada area responsavel pelo proprio
comportamento.

Escopo inicial:

- `serve_app.py` como camada HTTP fina.
- Modulos por dominio com nomes estaveis: importacao, produtos, clientes,
  reposicao, fornecedores, cotacoes, pedidos, precificacao e acoes.
- Helpers compartilhados para datas, SQL, validacao, respostas e arquivos.
- Migracoes versionadas em vez de upgrades soltos.

Pronto quando:

- Novos endpoints entram no modulo da area, nao no servidor.
- O schema tem historico de migracoes aplicadas.
- O frontend sabe quais contratos esperar de cada endpoint principal.

Primeiro corte executado:

- `scripts/http_helpers.py` concentra resposta JSON, envelope de erro,
  multipart, arquivos e binarios.
- `scripts/api_contracts.py` concentra validadores de contrato, tabelas
  essenciais de health check e contratos cobertos.
- `scripts/api_routes.py` concentra o mapa GET/POST e imports de dominios.
- `serve_app.py` ficou mais fino: conexao, inicializacao, ciclo HTTP e
  tratamento de erro.
- `docs/23_contratos_api.md` define a convencao para endpoints novos.

Fechamento executado:

- `schema_migrations` passou a existir no schema canonico e no bootstrap.
- `scripts/schema_upgrades.py` registra a migracao legada consolidada
  `20260508_legacy_idempotent_schema_upgrades`.
- `import_practica.begin_db()` tambem passa por `ensure_schema_upgrades()`,
  garantindo o mesmo trilho de schema no bootstrap de importacao.
- `scripts/smoke_checks.py` impede `serve_app.py` de voltar a importar
  dominios diretamente e verifica a presenca do trilho de migracoes.

## Fase 3: UX de Trabalho

Status: iniciada em 2026-05-08.

Objetivo: transformar dashboards em rotinas guiadas para o gestor.

Escopo inicial:

- Compras como jornada: fornecedor, itens, PDF/envio, resposta, pedido e
  chegada.
- Clientes como fila de relacionamento: proteger, reativar, acompanhar e
  registrar contato.
- Estoque como fila de decisao: comprar, esperar, descontinuar ou revisar mix.
- Margem como fila de acao: revisar custo, papel, preco alvo e impacto.
- Menos botoes concorrendo: acao primaria clara, secundarios agrupados.

Pronto quando:

- Cada tela responde "qual decisao eu tomo agora?".
- Estados vazios, baixa confianca e dados ausentes orientam o usuario.
- Acoes importantes registram memoria operacional.

Primeiro corte executado:

- Compras ganhou uma jornada operacional visivel: fornecedor, itens,
  PDF/envio, resposta, pedido e chegada.
- A jornada mostra a proxima acao principal e conversa com as acoes ja
  existentes da mesa de compras.
- Clientes ganhou fila de relacionamento operacional, priorizando proteger,
  reativar, acompanhar ou converter com base no movimento do periodo.
- Estoque ganhou fila de decisao priorizada, com acao sugerida, motivo,
  cobertura, sugestao, valor e atalhos para filtrar semelhantes ou abrir o
  produto.
- Compras passou a priorizar continuidade real: a lista de fornecedores agora
  traz contagem de cotacoes abertas e alertas, e a entrada da tela abre na
  fila operacional mais urgente em vez de cair sempre em todos.

## Fase 4: Produto Operavel

Objetivo: preparar uso real com seguranca e manutencao.

Escopo inicial:

- Protecao de acesso antes de uso fora de localhost.
- Multiempresa rigoroso em queries, rotas e dados operacionais.
- Backup, restauracao e log operacional.
- Observabilidade simples: importacao que gerou numero, regra que gerou acao,
  usuario/operador que confirmou decisao.
- Plano de deploy e suporte da beta assistida.

Pronto quando:

- Dados de uma empresa nao vazam para outra.
- Erros e importacoes podem ser diagnosticados sem abrir o banco manualmente.
- A rotina de backup/restauracao foi testada.

## Proxima Fatia

A proxima fatia nao e adicionar um modulo grande; e consolidar a beta assistida
em cima da Fase 3:

1. Manter o checkpoint atual verde: `scripts/smoke_checks.py`, `py_compile`
   dos modulos centrais e `node --check web\app.js`.
2. Lapidar Compras/Reposicao como primeira jornada operacional completa,
   fechando melhor sugerido -> cotado -> comprado -> recebido.
3. Melhorar onboarding de novos comercios com checklist de arquivos,
   confianca da importacao e primeiro valor entregue.
4. Registrar qualquer mudanca relevante em `HANDOFF.md`, no doc canonico da
   area e, quando afetar frontend/API, em `docs/23_contratos_api.md`.
