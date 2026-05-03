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
| Dependências | **Nenhuma** | `requirements.txt` vazio, apenas biblioteca padrão |
| Build/bundler | Nenhum | Arquivos estáticos servidos diretamente de `web/` |

---

## 3. Estrutura de pastas

```text
nexovarejo/
  docs/               (16 arquivos .md) — documentação do produto
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
    99_guia_de_contexto.md          — guia rápido de contexto
  schema/
    canonical.sql                   — schema SQL completo (~20 tabelas)
  scripts/
    import_practica.py              — pipeline de ingestão dos 5 CSVs (22 KB)
    serve_app.py                    — servidor HTTP + API + regras de negócio (150 KB)
  web/
    index.html                      — shell da SPA com 12 views (20 KB)
    app.js                          — lógica de frontend (89 KB)
    app.css                         — estilos completos (30 KB)
    logo.png                        — logo da empresa Practica
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
| `scripts/serve_app.py` | 150 KB | Servidor HTTP + ~40 endpoints REST + analytics (RFM, ABC, reposição, precificação, cotações, auditoria) | **Monolito extremo** — toda regra de negócio, API e migração de schema está aqui |
| `scripts/import_practica.py` | 22 KB | Pipeline de ingestão: lê 5 CSVs, faz ETL com detecção de mudanças, gera lotes de importação | Importação é `full_refresh` — deleta e reimporta a cada execução |
| `schema/canonical.sql` | 22 KB | Define ~20 tabelas do modelo canônico | Schema base; migrações incrementais estão inline no `serve_app.py` |
| `web/app.js` | 89 KB | Frontend completo — chamadas fetch, renderização, manipulação de DOM | JavaScript vanilla sem componentes, estado global |
| `web/index.html` | 20 KB | Estrutura declarativa das 12 views como sections ocultas | Navegação por `data-view` + class `active` |
| `web/app.css` | 30 KB | Todos os estilos da interface | Único arquivo, sem pré-processador |
| `mappings/practica_csv.yml` | 4 KB | Mapeamento declarativo das colunas CSV para o modelo canônico | Base para futuros conectores de ERP |

---

## 5. Riscos técnicos atuais

1. **Monolito de 150 KB** — `serve_app.py` concentra servidor, banco, regras de negócio, analytics e migrações. Difícil de manter e testar.
2. **Zero autenticação** — adequado para MVP local, bloqueante para SaaS multiempresa.
3. **SQLite multi-tenant** — schema usa `organization_id`, mas SQLite não suporta concorrência real. Migrar para PostgreSQL será necessário.
4. **Migrações inline** — `ensure_schema_upgrades()` faz ALTER TABLE condicionais. Frágil, sem versionamento de migrations.
5. **Full refresh na importação** — `clear_imported_facts()` deleta todos os fatos a cada importação. Inviável para volumes reais.
6. **Caminhos hard-coded** — README referencia caminhos absolutos com `C:\Users\gabri\...`.
7. **Dados sensíveis** — os CSVs na raiz contêm dados reais da empresa Practica (preços, custos, nomes de clientes). Verificar política de exposição.
8. **Sem testes** — a pasta `tests/` foi deletada (`D` no git status). Nenhum teste automatizado atualmente.

---

## 6. Próximos passos recomendados

1. Extrair endpoints da API do `serve_app.py` para documentação separada (grep `self.path.startswith` ou `def api_`).
2. Separar regras de negócio do servidor HTTP — módulos `analytics.py`, `replenishment.py`, `quotes.py`, `pricing.py`.
3. Criar `serve_app.py` como orquestrador fino, delegando para os módulos.
4. Adicionar testes de integração para o pipeline de importação.
5. Versionar migrações de schema em arquivos numerados, remover ALTER TABLE inline.
6. Substituir caminhos absolutos por relativos no README e scripts.
7. Migrar para PostgreSQL com connection pool antes de qualquer deploy multi-tenant.

---

## 7. Instruções para outro agente de IA

### Ordem de leitura otimizada

1. **Este arquivo** (`PROJECT_MAP.md`) — visão geral
2. `docs/99_guia_de_contexto.md` — guia rápido de contexto do produto
3. `docs/00_visao_produto.md` — visão, personas e jobs-to-be-done
4. `schema/canonical.sql` — modelo de dados (ler primeiras 80 linhas para entender as tabelas principais)
5. `scripts/import_practica.py` — pipeline de ingestão (ler completo, 22 KB)
6. `scripts/serve_app.py` — **não ler inteiro**. Use os comandos abaixo para explorar seções específicas
7. `web/index.html` — estrutura das views (já lido)

### Comandos de entrada

```bash
# Listar todos os endpoints da API
grep -n "self.path.startswith\|self.path ==" scripts/serve_app.py

# Ver assinatura das funções de analytics
grep -n "^def " scripts/serve_app.py

# Encontrar lógica específica por palavra-chave
grep -n "replenishment\|rfm\|abc\|quote\|pricing\|maturity" scripts/serve_app.py

# Ver estrutura das tabelas principais
head -n 200 schema/canonical.sql

# Roadmap do produto
cat roadmap.txt
```

### Regras de contexto

- O projeto está em **português** (código, comentários, docs, interface).
- **Não editar arquivos** sem ler o conteúdo atual primeiro.
- `serve_app.py` é grande — sempre use `grep` para localizar a seção relevante antes de ler com `offset/limit`.
- Os CSVs na raiz são **dados de exemplo** do ERP Practica, não são lixo.
- `data/`, `outputs/` e `*.db` estão no `.gitignore` — bancos locais não são commitados.
- A branch `main` é a única branch ativa.