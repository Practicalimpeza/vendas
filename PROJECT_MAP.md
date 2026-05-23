# PROJECT_MAP - NexoVarejo

Guia de entrada para agentes de IA e novos colaboradores entenderem o projeto
rapidamente.

Este arquivo descreve como o projeto esta organizado hoje. As regras de trabalho
estao em `AGENTS.md`; o estado vivo da sessao esta em `HANDOFF.md`.

## 1. Resumo do Produto

NexoVarejo e o Sistema Operacional de Gestao para pequenos e medios varejistas
brasileiros. Ele nasce como uma nova categoria para gerir empresas do varejo:
uma infraestrutura operacional com metodologia de gestao embutida no software.

Ele comeca por cima do ERP operacional/fiscal e das planilhas do cliente nesta
fase: recebe exportacoes e planilhas auxiliares, padroniza os dados em um modelo
SQL canonico e entrega uma mesa de trabalho web. Com o tempo, pode evoluir em
modo standalone gradual e substituir partes da operacao quando a rotina nascer
direto no app.

O produto deve ser IA-friendly por fundamento, nao IA-first por marketing:
contratos claros, estados explicaveis, origem dos dados, audit log e pacotes de
contexto devem permitir analise assistida externa sem exigir IA embutida.

O produto cobre hoje:

- Painel executivo, maturidade e indicadores por periodo.
- Central de acoes diarias, timeline, pulso operacional e memoria.
- Motor do Nexo com skills internas e explicabilidade.
- Produtos por receita, estoque, curva de reposicao e mix.
- Motor de reposicao v1 e v2, com comparacao.
- Diretorio de fornecedores, marcas e regras de compra.
- Fluxo de cotacoes, PDF, respostas, pedidos e recebimento.
- Precificacao acionavel e guardrails de margem.
- Oportunidades comerciais, clientes e servicos.
- Importacao assistida de ERP, reconciliacao e importacoes auxiliares.
- Perfil da empresa, autenticacao, usuarios, permissoes e admin.
- WhatsApp CRM com conversas, agentes, eventos e webhook.

Fundamentos de produto:

- Dados conectados entre produto, venda, estoque, custo, preco, fornecedor,
  cliente, cotacao, pedido e acao.
- Processos vivos, adaptaveis ao jeito real de cada empresa.
- Autonomia do operador acima de recomendacao do sistema.
- Visualizacao ampla, informacoes interligadas, filtros, buscas, presets de
  visao, comparacoes e trabalho em lote como forca principal.
- Semantica de varejo: giro, cobertura, ruptura, excesso, margem, recompra,
  minimo, prazo, caixa empatado e mix.
- Gestao antes de relatorio: cada leitura deve abrir uma ferramenta, uma rotina
  ou uma investigacao util.
- Memoria operacional: decisoes, justificativas, impactos e mudancas precisam
  ser rastreaveis.
- Mesa como experiencia: a interface principal e uma mesa diaria de operacao,
  nao um dashboard generico.

Estagio atual: beta assistida em consolidacao. O app roda localmente, mas ja tem
autenticacao, modulos operacionais e trilhos de verificacao suficientes para um
release candidate controlado.

## 2. Stack Tecnica

| Camada | Tecnologia | Notas |
|---|---|---|
| Backend | Python 3.11+ | Biblioteca padrao (`http.server`, `sqlite3`, `csv`, `json`, etc.). |
| Banco | SQLite | Arquivo local em `data/`, schema em `schema/canonical.sql`. |
| Frontend | HTML5, CSS3 e JavaScript vanilla | SPA manual por `data-view`, sem framework. |
| Servidor HTTP | `http.server.ThreadingHTTPServer` | Servido pelo proprio Python. |
| Bibliotecas frontend | ECharts e Lucide vendorizados | Em `web/vendor/`, sem instalacao. |
| Build/bundler | Nenhum | Arquivos estaticos servidos diretamente de `web/`. |

Nao adicionar dependencias instaladas sem discussao previa.

## 3. Estrutura de Pastas

```text
nexovarejo/
  AGENTS.md          regras operacionais para agentes
  HANDOFF.md         estado vivo e proximos passos
  PROJECT_MAP.md     este mapa
  README.md          entrada humana do projeto
  roadmap.txt        roadmap historico da beta
  docs/              documentos canonicos e aprofundamentos
  schema/
    canonical.sql    schema SQLite canonico e indices
  scripts/
    serve_app.py                 camada HTTP, auth gate, PDF, webhook e estaticos
    api_routes.py                mapa GET/POST das rotas de dominio
    api_contracts.py             validadores de contrato e health
    http_helpers.py              respostas HTTP, erros, multipart e arquivos
    auth.py                      bootstrap, login, sessoes, permissoes e usuarios
    import_practica.py           pipeline dos CSVs da Practica
    erp_import_flow.py           importacao assistida de planilhas ERP
    relationship_imports.py      importacao de vinculos e perfis auxiliares
    replenishment.py             reposicao v1, estoque e compra sugerida
    replenishment_v2.py          motor v2, sazonalidade e comparacao
    replenishment_v2_scenarios.py cenarios do motor v2
    compare_replenishment_v2.py  utilitario de comparacao
    quotes.py                    cotacoes, pedidos, recebimento e PDF
    quote_cache.py               cache de payloads de cotacao
    pricing.py                   precificacao acionavel
    commercial.py                clientes, servicos e inteligencia comercial
    supplier_ops.py              fornecedores, marcas e mix
    action_center.py             acoes, timeline, pulso e auditoria operacional
    operational_decisions.py     registro de decisoes operacionais
    company_profile.py           perfil da empresa
    whatsapp_crm.py              CRM WhatsApp e webhook
    product_views.py             dashboard, maturidade e produtos
    schema_upgrades.py           upgrades locais registrados
    db_helpers.py                helpers SQLite compartilhados
    text_utils.py                normalizacao e IDs
    nexo_skills_runtime.py       leitura das skills internas
    smoke_checks.py              verificacoes sem CSV real
  web/
    index.html                   shell declarativo da SPA
    app_core.js                  API, contratos, erros e formatadores
    app_state.js                 estado global, views e metadados
    app_boot.js                  inicializacao, eventos e carga da SPA
    app_ui.js                    navegacao, KPIs, modal e UI compartilhada
    app_charts.js                ECharts e helpers visuais
    app_tables.js                filtros, ordenacao e tabelas
    app_dashboard.js             painel executivo
    app_products.js              produtos e detalhes
    app_period_data.js           carga por periodo
    app_quotes_suppliers.js      fornecedores da mesa de compras
    app_quote_workbench.js       montagem da cotacao
    app_quote_cycle.js           ciclo cotacao -> pedido -> recebimento
    app_quote_dashboard.js       dashboard de compras
    app_quote_formula.js         formula e simulacoes de compra
    app_purchase_orders.js       pedidos de compra
    app_commercial.js            oportunidades comerciais
    app_customers.js             clientes e relacionamento
    app_pricing.js               margem e precificacao
    app_imports.js               importacao e reconciliacao
    app_company_profile.js       perfil da empresa
    app_actions_engine.js        acoes e memoria operacional
    app_inventory_suppliers.js   estoque/fornecedores
    app_whatsapp.js              WhatsApp CRM
    app_auth.js                  login, gate e admin de usuarios
    app_quote_tools.js           utilitarios de compras
    app.js                       codigo legado remanescente e cola de telas
    app.css                      estilos completos
    vendor/                      ECharts e Lucide vendorizados
  mappings/
    practica_csv.yml            mapeamento CSV -> canonico
  nexo_skills/
    manifest.json
    *.json                      skills internas versionadas
  *.csv                         exportacoes reais da Practica
```

## 4. Arquivos Criticos

| Arquivo | Funcao | Atencao |
|---|---|---|
| `scripts/serve_app.py` | Camada HTTP, auth gate, webhook, PDF e estaticos | Nao recolocar regra de dominio aqui. |
| `scripts/api_routes.py` | Roteamento GET/POST para dominios | Endpoint novo deve nascer com contrato/smoke quando central. |
| `scripts/auth.py` | Login, sessoes, permissoes e admin | Testar bootstrap, usuario comum e rotas protegidas. |
| `scripts/import_practica.py` | Importacao Practica | Usa `incremental_sync`; nao voltar para refresh destrutivo. |
| `scripts/erp_import_flow.py` | Importacao assistida ERP | Arquivo grande; buscar funcoes antes de ler trechos. |
| `scripts/relationship_imports.py` | Vinculos e perfis auxiliares | Afeta fornecedores, marcas e produtos. |
| `scripts/replenishment.py` | Reposicao v1 e estoque | Fluxo de dinheiro; validar com smoke. |
| `scripts/replenishment_v2.py` | Motor v2 e comparacao | Decidir se v2 e diagnostico ou motor principal no RC. |
| `scripts/quotes.py` | Cotacoes, pedidos, PDF e recebimento | Arquivo grande; mexer com smoke e roteiro manual. |
| `scripts/whatsapp_crm.py` | CRM WhatsApp e webhook | Nao adicionar secrets; testar modo sem credenciais. |
| `docs/00_visao_produto.md` | Visao canonica do Sistema Operacional de Gestao | Atualizar quando mudar posicionamento, promessa ou escopo. |
| `docs/25_mesa_de_gestao.md` | Direcao UX da mesa operacional | Norte para autonomia, filtros, presets, lote, Visao, dock e linguagem de controle do gestor. |
| `schema/canonical.sql` | Modelo canonico | Mudanca estrutural exige upgrade registrado. |
| `scripts/schema_upgrades.py` | Upgrades locais | Nao adicionar `ALTER TABLE` solto. |
| `scripts/smoke_checks.py` | Gate principal | Deve seguir verde antes/depois de mudancas centrais. |
| `web/index.html` | Estrutura das views | Scripts carregados em ordem classica. |
| `web/app.js` | Legado remanescente/cola | Nunca ler inteiro; buscar funcoes especificas. |
| `web/app.css` | Estilos completos | Nunca ler inteiro; buscar seletores. |

## 5. Rotas e Modulos Relevantes

- Auth/admin: `/api/auth/me`, `/api/auth/bootstrap`, `/api/auth/login`,
  `/api/auth/logout`, `/api/admin/users`, `/api/admin/users/upsert`.
- Health/contratos: `/api/health`.
- Importacao: `/api/imports`, `/api/erp/import-preview`,
  `/api/erp/import-commit`, `/api/imports/reference-folder`,
  `/api/imports/refresh-local`.
- Relacionamentos: `/api/links/inspect`, `/api/links/preview`,
  `/api/links/commit`.
- Reposicao: `/api/replenishment`, `/api/replenishment-v2`,
  `/api/replenishment-v2/compare`.
- Compras: `/api/supplier-workbench`, `/api/quotes`, `/api/quote`,
  `/api/quote/pdf`, `/api/purchase-orders`, `/api/purchase-order`.
- Margem: `/api/pricing`, `/api/pricing/product`.
- Operacao: `/api/actions/today`, `/api/actions/status`,
  `/api/quick-actions`, `/api/operational-decisions`.
- WhatsApp: `/api/whatsapp/conversations`, `/api/whatsapp/conversation`,
  `/api/whatsapp/conversations/update`, `/api/whatsapp/messages/send`,
  `/api/whatsapp/agents/upsert`, `/api/whatsapp/webhook`.

## 6. Riscos Tecnicos Atuais

1. Working tree grande e recente: antes de novas features, estabilizar release
   candidate com smoke, checks e roteiro manual.
2. Dados sensiveis: CSVs da Practica contem precos, custos, margens e clientes.
   Nao expor nem comitar derivados.
3. Multiempresa: o schema usa `organization_id`, mas isolamento precisa ser
   validado em rotas, queries, caches e telas.
4. Backup/restauracao: ainda e bloqueador de beta real se nao estiver testado.
5. Auth local: ja existe, mas precisa de teste formal de permissoes e sessoes.
6. WhatsApp: nao usar credenciais reais sem ambiente controlado e politica de
   suporte.
7. Frontend grande: apesar da modularizacao, `app.js` e `app.css` continuam
   grandes; editar por busca e trechos.
8. SQLite: suficiente para beta assistida local, nao para concorrencia SaaS
   ampla.
9. Posicionamento: ao evoluir para "Sistema Operacional de Gestao", nao
   prometer substituicao fiscal, financeiro completo ou IA autonoma antes de
   consolidar dados, contratos, governanca e rotina operacional.

## 7. Proximos Passos Recomendados

1. Alinhar linguagem, telas e docs vivos ao posicionamento de Sistema
   Operacional de Gestao para empresas do varejo.
2. Congelar um release candidate de beta assistida.
3. Rodar `python scripts\smoke_checks.py`, `py_compile` dos modulos centrais e
   `node --check` nos scripts principais do frontend.
4. Executar roteiro manual de ponta a ponta: primeiro acesso, usuario, perfil da
   empresa, importacao, qualidade, reposicao, cotacao, pedido, recebimento,
   margem, clientes e audit log.
5. Definir primeira versao operacional de presets de visao, filtros salvos,
   busca, selecao/lote, contexto interligado, fichas vivas e pacote IA-friendly.
6. Validar permissoes, multiempresa e rotas protegidas.
7. Fechar ou documentar backup/restauracao como bloqueador.
8. Atualizar `HANDOFF.md` sempre que o estado do RC mudar.

## 8. Ordem de Leitura Otimizada

1. `AGENTS.md`
2. `HANDOFF.md`
3. `PROJECT_MAP.md`
4. `docs/README.md`
5. `docs/20_estado_atual.md`
6. `docs/22_roadmap_produto_final.md`
7. `docs/23_contratos_api.md`
8. `docs/25_mesa_de_gestao.md` quando mexer em Visao, dock, Pulso, filtros,
   presets, lote, UX ou linguagem de autonomia
9. Documento especifico da area que sera alterada

## 9. Comandos Uteis

```powershell
rg -n "GET_ROUTES|POST_ROUTES|/api/" scripts/api_routes.py scripts/serve_app.py
```

```powershell
rg -n "^def " scripts/replenishment.py scripts/replenishment_v2.py scripts/quotes.py scripts/pricing.py scripts/commercial.py
```

```powershell
Get-Content schema\canonical.sql -TotalCount 220
```

```powershell
python scripts\smoke_checks.py
```

## 10. Regras de Contexto

- O projeto esta em portugues.
- Nao editar arquivos sem ler o conteudo atual ou o trecho relevante.
- Nao ler nem editar CSVs da raiz.
- Nao ler `web/app.js`, `web/app.css` ou `scripts/erp_import_flow.py` inteiros;
  use busca antes.
- Nao adicionar dependencias instaladas sem alinhamento.
- `data/`, `outputs/`, `*.db`, planilhas sensiveis e caches nao devem ser
  commitados.
