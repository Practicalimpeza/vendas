# PROJECT_MAP — NexoVarejo

Guia de entrada para agentes de IA e novos colaboradores entenderem o projeto rapidamente.

---

## 1. Resumo do produto

NexoVarejo é uma **plataforma de gestão analítica para pequenos e médios varejistas brasileiros**.
Ela **não substitui o ERP operacional** do cliente: recebe exportações CSV de ERPs heterogêneos,
padroniza os dados em um modelo SQL canônico e entrega uma **mesa de trabalho web** com 12 visões:

- Painel executivo (KPIs, maturidade, receita mensal)
- Central de ações diárias (Hoje)
- Motor do Nexo (skills internas, regras e rastreabilidade)
- Produtos por receita
- Motor de reposição (demanda, variabilidade, ABC, ponto de pedido)
- Diretório de fornecedores (pedido mínimo, telefone, confiabilidade)
- Fluxo de cotações (draft → enviada → respondida → pedido)
- Precificação acionável (margem, preço alvo)
- Oportunidades comerciais (clientes em risco, recompra provável, momento de marcas/produtos)
- Clientes, Serviços e Importação

**Estágio atual:** MVP funcional rodando como app local com dados de uma empresa teste (Practica).

---

## 2. Stack técnica

| Camada | Tecnologia | Notas |
|---|---|---|
| Backend | Python 3.11+ | Apenas biblioteca padrão (`http.server`, `sqlite3`, `csv`, `json`) |
| Banco | SQLite | Arquivo local `data/nexovarejo.db`, schema em `schema/canonical.sql` |
| Frontend | HTML5 + CSS3 + JavaScript vanilla | Zero frameworks. SPA manual com `data-view` toggles no DOM |
| Servidor HTTP | `http.server.ThreadingHTTPServer` | Servido pelo próprio Python, sem WSGI/ASGI |
| Dependências | Sem instalação | Backend só com biblioteca padrão; frontend usa bibliotecas vendorizadas em `web/vendor/` |
| Build/bundler | Nenhum | Arquivos estáticos servidos diretamente de `web/` |

---

## 3. Estrutura de pastas

```text
nexovarejo/
  HANDOFF.md          — estado vivo e próximos passos para novas sessões
  docs/               — documentação do produto e decisões
    README.md                      — índice vivo da documentação
    00_visao_produto.md             — visão, personas, jobs-to-be-done
    01_inventario_dados_exemplo.md  — catálogo dos CSVs de entrada
    02_modelo_canonico_sql.md       — modelo de dados padronizado
    03_ingestao_e_padronizacao.md   — pipeline de ETL
    04_catalogo_analitico.md        — métricas e análises disponíveis
    05_roadmap_operacional.md       — plano de fases do produto
    06_implantacao_novos_comercios.md — onboarding de novos clientes
    07_motor_reposicao.md           — lógica de sugestão de compra
    08_referencia_practica_navegacao.md — navegação do ERP Practica
    09_fluxo_cotacoes.md            — fluxo de cotação com fornecedores
    10_maturidade_nexo.md           — dashboard de maturidade
    11_trilhas_operacionais.md      — missões com gamificação
    12_inteligencia_comercial.md    — oportunidades de venda
    13_central_acoes.md             — mesa de ações diárias
    14_decisao_mix_no_pedido.md     — decisão de mix no pedido
    15_skills_internas_nexo.md      — playbooks internos
    16_motor_do_nexo.md             — arquitetura do motor
    17_ciclo_cotacao.md             — ciclo completo de cotação
    18_pedido_compra_canonico.md    — modelo de pedido de compra
    19_precificacao_periodo.md      — precificação por período
    20_estado_atual.md              — snapshot do produto implementado
    21_metodo_de_trabalho.md        — método para modelar decisões
    22_roadmap_produto_final.md     — plano de estabilização
    23_contratos_api.md             — contratos mínimos de API
    99_guia_de_contexto.md          — guia rápido de contexto
  schema/
    canonical.sql                   — schema SQL completo e schema_migrations
  scripts/
    serve_app.py                    — camada HTTP fina, arquivos estáticos e bootstrap local
    api_routes.py                   — mapa GET/POST das rotas
    api_contracts.py                — validadores de contrato e health
    http_helpers.py                 — respostas HTTP, erros e arquivos
    import_practica.py              — pipeline de ingestão dos 5 CSVs da Practica
    erp_import_flow.py              — importação assistida de planilhas ERP
    replenishment.py                — reposição, estoque e compra sugerida
    quotes.py                       — cotações, pedidos e recebimento
    pricing.py                      — precificação acionável
    commercial.py                   — clientes, serviços e inteligência comercial
    supplier_ops.py                 — fornecedores, marcas e mix
    action_center.py                — ações, timeline e pulso operacional
    product_views.py                — dashboard, maturidade e produtos
    schema_upgrades.py              — upgrades locais registrados em schema_migrations
    smoke_checks.py                 — verificações automatizadas sem CSV real
  web/
    index.html                      — shell da SPA
    app_core.js                     — API, contratos e formatadores compartilhados
    app_charts.js                   — helpers de ECharts e linhas de dashboard
    app.js                          — lógica de frontend vanilla
    app.css                         — estilos completos
    vendor/                         — ECharts e Lucide vendorizados
    logo-practica-transparent.png   — logo da empresa Practica
  mappings/
    practica_csv.yml                — mapeamento colunas CSV → campos canônicos
  nexo_skills/
    manifest.json                   — índice das skills
    data_governance.json            — skill de governança de dados
    commercial_intelligence.json    — skill de inteligência comercial
    quotation_flow.json             — skill de fluxo de cotação
    replenishment_mix.json          — skill de mix de reposição
    implementation_journey.json     — skill de jornada de implantação
  *.csv (5 arquivos)               — exportações de exemplo do ERP Practica
    produtopreco__Sheet1.csv        — produtos e preços
    produtocusto__Sheet1.csv        — custos dos produtos
    saidaprod__Sheet1.csv           — vendas de produtos
    servico__Sheet1.csv             — vendas de serviços
    saidaprodlucro__Sheet1.csv      — lucro por produto
  ROOT/
    README.md                       — entrada do projeto, comandos para rodar
    pyproject.toml                  — config Python (nome, versão, ruff)
    requirements.txt                — vazio (biblioteca padrão apenas)
    roadmap.txt                     — roadmap da versão Beta
    PROJECT_MAP.md                  — este arquivo
```

---

## 4. Arquivos críticos

| Arquivo | Peso | Função | Atenção |
|---|---|---|---|
| `scripts/serve_app.py` | ~6 KB | Camada HTTP fina, bootstrap local e servidor de estáticos | Não recolocar regra de domínio aqui; use `api_routes.py` e módulos da área |
| `scripts/api_routes.py` | ~5 KB | Roteamento GET/POST para funções de domínio | Endpoint novo deve nascer com contrato e smoke |
| `scripts/import_practica.py` | ~26 KB | Pipeline de ingestão dos CSVs da Practica | Usa `incremental_sync`; não voltar para `full_refresh` destrutivo sem discutir |
| `scripts/erp_import_flow.py` | ~113 KB | Importação assistida de planilhas ERP | Arquivo grande; localizar funções com grep antes de ler trechos |
| `schema/canonical.sql` | ~24 KB | Define modelo canônico e `schema_migrations` | Mudança estrutural precisa de upgrade registrado |
| `scripts/schema_upgrades.py` | ~17 KB | Upgrades locais e migração legada consolidada | Evitar `ALTER TABLE` solto fora deste trilho |
| `scripts/smoke_checks.py` | ~46 KB | Smoke em banco temporário e HTTP | Gate principal antes/depois de mexer em fluxos centrais |
| `web/app_core.js` | ~7 KB | API, validação de contratos e formatadores do frontend | Carregado antes de `app.js`, sem module/bundler |
| `web/app_charts.js` | ~9 KB | Helpers de ECharts, score e linhas de dashboard | Carregado antes de `app.js`, sem module/bundler |
| `web/app.js` | ~394 KB | Frontend principal, estado e rotinas de tela | Nunca ler inteiro; buscar função/handler específico |
| `web/app.css` | ~176 KB | Estilos completos | Nunca ler inteiro; buscar seletor/seção específica |
| `web/index.html` | ~20 KB | Estrutura declarativa das views | Navegação por `data-view` e sections |
| `mappings/practica_csv.yml` | 4 KB | Mapeamento declarativo das colunas CSV para o modelo canônico | Base para futuros conectores de ERP |

---

## 5. Riscos técnicos atuais

1. **Beta ainda local** — adequado para validação assistida, mas exige proteção simples antes de qualquer exposição fora de localhost.
2. **SQLite multi-tenant** — schema usa `organization_id`, mas SQLite não resolve concorrência real de SaaS. PostgreSQL fica para etapa posterior.
3. **Frontend grande em arquivo único** — `web/app.js` e `web/app.css` cresceram bastante; buscar trechos antes de editar e evitar reescritas amplas.
4. **Importação assistida complexa** — `erp_import_flow.py` concentra parsing, mapeamento, conflitos e commit; mexer com smoke e casos de borda.
5. **Migrações em transição** — existe trilho `schema_migrations`, mas upgrades locais ainda vivem consolidados em `schema_upgrades.py`.
6. **Dados sensíveis** — os CSVs na raiz contêm dados reais da empresa Practica (preços, custos, nomes de clientes). Não expor nem comitar derivados.
7. **Sem suíte formal de testes** — o gate atual é `scripts/smoke_checks.py`; ampliar quando fluxos de dinheiro/compra/margem mudarem.

---

## 6. Próximos passos recomendados

1. Consolidar o checkpoint atual: smoke verde, docs alinhados e working tree revisada antes de novas features grandes.
2. Continuar a Fase 3 de UX de trabalho: compras/reposição, clientes, estoque e margem como filas de decisão.
3. Melhorar onboarding de novos comércios: checklist de arquivos, confiança da importação e primeiro valor entregue.
4. Fechar melhor o ciclo sugerido → cotado → comprado → recebido.
5. Definir proteção simples de acesso antes de qualquer beta fora de localhost.
6. Consolidar ou arquivar docs antigos que viraram histórico.

---

## 7. Instruções para outro agente de IA

### Ordem de leitura otimizada

1. **Este arquivo** (`PROJECT_MAP.md`) — visão geral
2. `HANDOFF.md` — estado vivo e próximos passos
3. `docs/README.md` — índice vivo da documentação
4. `docs/20_estado_atual.md` — snapshot do produto
5. `docs/22_roadmap_produto_final.md` — fase atual e prioridades
6. `docs/23_contratos_api.md` — contrato de endpoints centrais
7. Documento específico da área que será alterada

### Comandos de entrada

```bash
# Listar rotas da API
rg -n "GET_ROUTES|POST_ROUTES|/api/" scripts/api_routes.py scripts/serve_app.py

# Ver funções por módulo
rg -n "^def " scripts/replenishment.py scripts/quotes.py scripts/pricing.py scripts/commercial.py

# Encontrar lógica específica por palavra-chave
rg -n "replenishment|rfm|abc|quote|pricing|maturity|contract" scripts

# Ver estrutura das tabelas principais
head -n 200 schema/canonical.sql

# Gate de verificação
python scripts\smoke_checks.py
```

### Regras de contexto

- O projeto está em **português** (código, comentários, docs, interface).
- **Não editar arquivos** sem ler o conteúdo atual primeiro.
- Arquivos grandes como `erp_import_flow.py`, `web/app.js` e `web/app.css` devem ser explorados com grep/rg antes de ler trechos.
- Os CSVs na raiz são **dados de exemplo** do ERP Practica, não são lixo.
- `data/`, `outputs/` e `*.db` estão no `.gitignore` — bancos locais não são commitados.
- A branch `main` é a única branch ativa.
