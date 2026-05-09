# Handoff do Projeto

Atualizado em: 2026-05-08

Este arquivo deve ser mantido atualizado sempre que uma sessao fizer mudancas
relevantes de produto, arquitetura, dados, docs ou skills. A funcao dele e
ajudar uma nova sessao a entender rapidamente onde o projeto esta e como
continuar sem reabrir tudo.

## Leia nesta ordem

1. `AGENTS.md` - regras operacionais do projeto e cuidado com dados sensiveis.
2. `HANDOFF.md` - estado vivo e proximos passos.
3. `docs/README.md` - mapa da documentacao.
4. `docs/20_estado_atual.md` - snapshot de produto.
5. `docs/21_metodo_de_trabalho.md` - metodo para modelar e pressionar decisoes.
6. `docs/22_roadmap_produto_final.md` - roadmap de estabilizacao rumo a produto final.
7. `docs/23_contratos_api.md` - contratos dos endpoints centrais da Fase 1.
8. Documento especifico da area que sera alterada.

## Estado atual

- Placa rapida: beta assistida quase pronta.
- Proxima missao: Fase 3 do roadmap de produto final, com foco em UX de
  trabalho para compras/reposicao, onboarding e ciclo sugerido-cotado-comprado-recebido.
- Comando de verificacao: `python scripts\smoke_checks.py`.
- URL local desta sessao: `http://127.0.0.1:8011/importacao`.
- Nao mexer agora: Postgres, auth completa, frameworks.
- MVP local funcional em Python padrao, SQLite e frontend vanilla.
- Produto focado em mesa diaria do gestor: compras, reposicao, mix, margem,
  clientes, acoes e memoria operacional.
- Importacao da Practica foi ajustada para `incremental_sync`, preservando
  historico e evitando duplicidade de fatos iguais.
- Reposicao continua retornando produtos mesmo quando nao ha venda no periodo.
- Estoque, preco e custo devem usar sempre o snapshot mais recente.
- Servidor bloqueia exposicao fora de localhost salvo com
  `NEXOVAREJO_ALLOW_NETWORK=1`.
- Docs e skills ganharam uma camada nova de organizacao:
  `docs/README.md`, `docs/20_estado_atual.md` e skills adicionais em
  `nexo_skills/`.
- Decisoes relevantes devem seguir o metodo local: modelar dominio, fazer
  entrevista estilo `grill-me`, executar em fatias e atualizar docs/skills.
- Roadmap de produto final definido em `docs/22_roadmap_produto_final.md`.
- Contratos de API da Fase 1 definidos em `docs/23_contratos_api.md`.

## Arquivos centrais por area

- Produto e norte: `docs/00_visao_produto.md`, `docs/20_estado_atual.md`.
- Dashboard, maturidade e produtos: `scripts/product_views.py`.
- Upgrades locais de schema: `scripts/schema_upgrades.py`.
- Roadmap: `docs/05_roadmap_operacional.md`.
- Roadmap produto final: `docs/22_roadmap_produto_final.md`.
- Contratos de API: `docs/23_contratos_api.md`.
- Dados/importacao: `docs/03_ingestao_e_padronizacao.md`,
  `scripts/import_practica.py`, `schema/canonical.sql`.
- Reposicao e compras: `docs/07_motor_reposicao.md`,
  `scripts/replenishment.py`, `scripts/quotes.py`.
- Importacao assistida ERP: `scripts/erp_import_flow.py`.
- Fornecedores, marcas e mix: `scripts/supplier_ops.py`.
- Clientes, servicos e inteligencia comercial: `scripts/commercial.py`.
- Acoes, timeline e pulso operacional: `scripts/action_center.py`.
- Precificacao: `docs/19_precificacao_periodo.md`, `scripts/pricing.py`.
- Skills e explicabilidade: `docs/15_skills_internas_nexo.md`,
  `docs/16_motor_do_nexo.md`, `nexo_skills/manifest.json`.
- Metodo de trabalho: `docs/21_metodo_de_trabalho.md`.
- Frontend: `web/index.html`, `web/app.js`, `web/app.css`.

## Trabalho recente

- Consolidado checkpoint de documentacao: `AGENTS.md`, `PROJECT_MAP.md`,
  `docs/22_roadmap_produto_final.md` e `README.md` foram alinhados com a
  arquitetura modular, `incremental_sync`, smoke atual e foco de Fase 3.
- Primeira rodada de otimizacao aplicada: CSS de cards/graficos dos dashboards
  foi consolidado, fallback morto de Chart.js saiu do frontend, `web/vendor/`
  ficou apenas com ECharts/Lucide e `web/logo.png` duplicado foi removido em
  favor de `web/logo-practica-transparent.png`.
- Frontend comecou a ganhar estrutura de produto final: `web/app_core.js`
  extrai API, contratos, tratamento de erro e formatadores compartilhados de
  `web/app.js`, mantendo script classico sem bundler.
- Segunda camada extraida no frontend: `web/app_charts.js` concentra helpers
  de ECharts, cards de score e `dashboardChartRows`, reduzindo `web/app.js`
  sem introduzir build step.
- Terceira camada extraida no frontend: `web/app_tables.js` concentra filtros,
  ordenacao e observacao das tabelas HTML, reduzindo risco de patches em
  `web/app.js`.
- Quarta camada extraida no frontend: `web/app_ui.js` concentra navegacao,
  topbar, KPIs, cards de insight e modal base.
- Primeira rodada de fluidez aplicada: tabelas priorizam a view ativa, views
  fora de foco sao melhoradas em tempo ocioso e paineis/tabelas usam
  `content-visibility`/containment para reduzir custo de layout e paint.
- Primeira rodada de fluidez em edicoes aplicada na mesa de compras: saves de
  quantidade atualizam a linha/totais de forma otimista, ignoram no-op e
  agrupam refreshes secundarios de acoes/maturidade.
- Criado `docs/22_roadmap_produto_final.md` com quatro fases: Confiabilidade,
  Organizacao Interna, UX de Trabalho e Produto Operavel.
- Criado `docs/23_contratos_api.md` e adicionados `contract`/`period` aos
  payloads de `/api/summary`, `/api/replenishment`, `/api/supplier-workbench`
  e `/api/pricing`.
- Smoke check agora valida os contratos `summary.v1`, `replenishment.v1`,
  `supplier_workbench.v1`, `pricing.v1`, `quote_detail.v1`,
  `purchase_order_detail.v1`, `commercial_intelligence.v1`,
  `actions_today.v1` e `imports.v1` diretamente e via HTTP; listas
  legadas (`/api/products/top`, `/api/customers/top`, `/api/services/top`,
  `/api/quotes`, `/api/purchase-orders`) seguem como arrays na raiz, mas com
  forma de linha validada.
- Frontend passou a usar `apiContract(...)` e `apiRows(...)` nos fluxos
  principais para falhar cedo quando um payload central sair do contrato.
- Rotas `/api/` passaram a retornar envelope JSON padrao em erros
  (`ok`, `error`, `code`, `status`, `route`), inclusive 404.
- Carregamento de dados por periodo no frontend foi centralizado em
  `loadPeriodWorkspaceData()`/`applyPeriodWorkspaceData()`.
- Fase 1 marcada como fechada no roadmap: smoke completo, contratos,
  `/api/health`, envelope de erro e aviso global de falha no frontend.
- Fase 2 iniciada: `scripts/http_helpers.py` extrai helpers HTTP,
  `scripts/api_contracts.py` centraliza validadores/health, e o smoke prende
  essa separacao.
- `scripts/api_routes.py` extraiu o mapa GET/POST e os imports de dominio,
  deixando `serve_app.py` focado no ciclo HTTP, conexao e erro.
- Fase 2 marcada como fechada: `schema_migrations` entrou no schema canonico,
  `schema_upgrades.py` registra a migracao legada consolidada e o smoke impede
  `serve_app.py` de voltar a importar dominios diretamente.
- Fase 3 iniciada pela jornada de Compras: trilho visivel de fornecedor,
  itens, PDF/envio, resposta, pedido e chegada, com acao principal contextual.
- Clientes ganhou fila de relacionamento operacional com prioridades
  proteger/reativar/acompanhar/converter e registro rapido de contato.
- Estoque ganhou fila de decisao operacional com cards priorizados por status,
  ABC e valor estimado, alem de atalhos para filtrar semelhantes ou abrir o
  produto.
- Compras ganhou contrato para a lista de fornecedores da mesa:
  `open_quote_count`, `alert_count` e `latest_quote_at` agora alimentam a fila
  e o frontend valida esse payload com `apiRows`.
- `scripts/smoke_checks.py` foi recuperado para a arquitetura modular atual e
  agora cobre tambem resumo por periodo e PDF de cotacao.
- A tela inicial passou a contar produtos/clientes movimentados no periodo em
  vez de totais cadastrados.
- Cotacoes ganharam exportacao PDF enxuta para fornecedor montar o pedido:
  referencia/codigo, produto, quantidade e unidade.
- A montagem do pedido ganhou campos ajustaveis por item para unidade de
  compra, unidades por embalagem e cobertura alvo em dias; esses dados ficam no
  rascunho da cotacao e alimentam PDF/fechamento sem alterar cadastro do ERP.
- A tabela de montagem do pedido agora permite ordenar pelos cabecalhos das
  colunas, mantendo filtros e busca ativos.
- Pedidos confirmados entram como pedido em aberto na reposicao: o motor soma o
  saldo nao recebido ao estoque projetado e sugere apenas o complemento que
  ainda fizer sentido comprar.
- O dock da interface fica oculto enquanto qualquer modal estiver aberto.
- Criado `scripts/smoke_checks.py` com verificacoes automatizadas em banco
  temporario para schema/importacao, assets HTML, contratos JS/API, skills,
  reposicao, precificacao, cotacao, pedido de compra e rotas HTTP GET/POST
  essenciais, sem ler CSVs reais.
- Corrigidos regressões encontradas na revisão: importacao ERP de fornecedor
  preferencial em produto novo nao vira mais conflito manual vazio; custo de
  cotacao/fornecedor agora respeita `snapshot_date DESC, id DESC`.
- Extraida a leitura/renderizacao das skills internas para
  `scripts/nexo_skills_runtime.py`, deixando `serve_app.py` menos responsavel
  por catalogo de regras.
- Extraido o motor de reposicao para `scripts/replenishment.py`, incluindo
  ABC, status de estoque, calculo de cobertura e endpoint `api_stock`.
- Extraido o fluxo de cotacoes e pedidos de compra para `scripts/quotes.py`,
  incluindo rascunhos, mesa de fornecedor, resposta de cotacao, fechamento e
  recebimento de pedidos. `serve_app.py` ficou com cerca de 4,8k linhas.
- Extraidos helpers compartilhados de texto/IDs para `scripts/text_utils.py`,
  preservando a normalizacao antiga para nao mudar chaves estaveis.
- Extraida a importacao assistida ERP para `scripts/erp_import_flow.py`,
  incluindo parsing de planilhas, mapeamentos, conflitos manuais e commit.
- Extraidos clientes/servicos/inteligencia comercial para `scripts/commercial.py`
  e fornecedores/mix para `scripts/supplier_ops.py`.
- Extraidos decisoes operacionais para `scripts/operational_decisions.py` e
  acoes/timeline/pulso para `scripts/action_center.py`. O antigo monolito
  `scripts/serve_app.py` ficou com cerca de 1,25k linhas.
- Extraidos dashboard, maturidade, detalhe/top produtos e referencia de
  fornecedor para `scripts/product_views.py`. `scripts/serve_app.py` ficou com
  cerca de 529 linhas e agora concentra conexao, upgrades de schema e rotas.
- Extraidos upgrades locais de schema para `scripts/schema_upgrades.py` e
  simplificado o despacho de rotas HTTP em `scripts/serve_app.py`, que ficou
  com cerca de 268 linhas.
- Smoke HTTP reforcado para cobrir explicitamente maturidade, produto, top
  produtos, inteligencia comercial, clientes/servicos e referencia de
  fornecedor.
- Smoke HTTP agora chama todos os endpoints declarados em `scripts/serve_app.py`
  pelo menos uma vez, incluindo importacao ERP em modo verificacao de conflito,
  fornecedores, mix, acoes, cotacoes e pedidos.
- Smoke HTTP agora tambem valida uma historia beta ponta a ponta: preview ERP,
  deteccao de conflito manual em referencia de fornecedor, commit com escolha
  explicita, reposicao, cotacao, pedido, recebimento e acao operacional.
- `/api/imports` agora retorna `quality`, diagnostico do ultimo lote com
  confianca, linhas lidas/mapeadas, issues, conflitos manuais, mudancas
  pendentes e proximo passo. A tela de importacao renderiza essa reconciliacao.
- Corrigida borda em `scripts/supplier_ops.py`: ao vincular uma marca a um
  fornecedor, o sistema reaproveita fornecedor existente por `normalized_name`
  antes de gerar novo ID, evitando erro UNIQUE em bases com IDs legados.
- Corrigido contrato enriquecido das skills `implementation_journey` e
  `action_center` com `purpose`, `inputs`, `outputs` e `guardrails`.
- Reforcado `.gitignore` para bloquear `/*.xlsm` e `/Srv import/`, evitando
  entrada acidental de planilhas/CSVs sensiveis.
- Corrigidos defeitos funcionais de importacao, snapshots e reposicao.
- Criadas skills: `pricing_guardrails`, `supplier_workbench` e
  `operational_memory`.
- Enriquecido endpoint `/api/nexo/skills` com `purpose`, `inputs`, `outputs` e
  `guardrails`.
- Criados `docs/README.md` e `docs/20_estado_atual.md`.
- Criado `docs/21_metodo_de_trabalho.md`, adaptando domain model + grill-me
  para decisoes do NexoVarejo.
- Atualizados docs de ingestao, roadmap, reposicao, skills, motor e guia de
  contexto.

## Proximos focos recomendados

1. Continuar Fase 3: transformar compras/reposicao, clientes, estoque e margem
   em filas de decisao cada vez mais claras.
2. Melhorar onboarding de novos comercios: checklist de arquivos, roteiro de
   primeira rotina e evidencias de primeiro valor entregue.
3. Ampliar reconciliacao da importacao ERP com comparativos de totais da origem
   quando o arquivo trouxer totalizadores.
4. Melhorar comparacao entre sugerido, cotado, comprado e recebido.
5. Consolidar ou arquivar docs antigos que viraram decisoes historicas.
6. Definir protecao simples de acesso para qualquer beta fora de localhost.

## Cuidados permanentes

- Nao ler nem editar CSVs da raiz.
- Nao expor dados reais da Practica.
- Nao adicionar dependencias externas sem alinhamento.
- Nao editar `AGENTS.md` ou `PROJECT_MAP.md` sem confirmacao.
- Antes de editar arquivo existente, leia o trecho relevante.
- Se mexer em docs/skills, atualize este `HANDOFF.md`.
- Antes de mudanca grande, use `docs/21_metodo_de_trabalho.md`.

## Verificacoes uteis

```powershell
python scripts\smoke_checks.py
```

```powershell
python -m py_compile scripts/import_practica.py scripts/serve_app.py scripts/pricing.py scripts/db_helpers.py
```

```powershell
node --check web\app.js
```

```powershell
@'
import json
from pathlib import Path
for path in sorted(Path("nexo_skills").glob("*.json")):
    json.loads(path.read_text(encoding="utf-8"))
    print(path.name)
'@ | python -
```

```powershell
git status --short
```

## Como atualizar este arquivo

- Mantenha a data no topo.
- Registre mudancas relevantes em `Trabalho recente`.
- Atualize `Estado atual` quando uma premissa mudar.
- Atualize `Proximos focos recomendados` quando uma frente for concluida.
- Remova detalhes antigos que ja nao ajudam uma nova sessao.
