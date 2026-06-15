# Sistema white-label

A aplicacao e uma plataforma de gestao analitica para pequenos e medios
varejistas brasileiros. Ela nao substitui o ERP operacional do cliente: recebe
exportacoes e planilhas auxiliares, padroniza os dados em um modelo SQL
canonico e entrega uma mesa de trabalho para decidir sobre estoque, compras,
fornecedores, clientes, margem, acoes e relacionamento.

## Momento atual

O projeto esta em transicao de prototipo local para beta assistida. A base ja tem:

- App local em Python padrao, SQLite e frontend vanilla modularizado.
- Autenticacao local com bootstrap do primeiro administrador, sessoes,
  permissoes por modulo e administracao de usuarios.
- Importacao da base Practica, importacao assistida de planilhas ERP,
  reconciliacao de qualidade e importacoes auxiliares de relacionamentos.
- Perfil da empresa, fornecedores, produtos, clientes, servicos, margem,
  compras, pedidos, recebimento, acoes e memoria operacional.
- Reposicao v1 e v2, incluindo comparacao de motor e sinais de demanda.
- WhatsApp CRM como modulo operacional, com webhook, conversas, agentes,
  filas e envio via Cloud API quando configurado.
- Contratos de API, `/api/health`, smoke checks e `audit_log` para decisoes e
  alteracoes relevantes.

O foco agora nao e abrir uma frente grande nova. E consolidar um release
candidate de beta assistida: fluxo principal demonstravel, docs coerentes,
smoke verde, checagens manuais e bloqueadores reais separados de melhorias
futuras.

## Stack

| Camada | Tecnologia | Observacao |
|---|---|---|
| Backend | Python 3.11+ | Biblioteca padrao: `http.server`, `sqlite3`, `csv`, `json`, etc. |
| Banco | SQLite | Arquivo local em `data/`, schema em `schema/canonical.sql`. |
| Frontend | HTML, CSS e JavaScript vanilla | Sem framework, bundler ou build step. |
| Bibliotecas vendorizadas | ECharts e Lucide | Em `web/vendor/`, sem instalacao nova. |

Nao adicione dependencias externas sem alinhamento. A simplicidade da stack
ainda e parte da estrategia de beta.

## Estrutura principal

```text
pulso/
  HANDOFF.md                 estado vivo para novas sessoes
  PROJECT_MAP.md             mapa operacional do projeto
  docs/                      documentos canonicos e aprofundamentos
  schema/canonical.sql       schema SQLite canonico
  mappings/practica_csv.yml  mapeamento CSV -> modelo canonico
  nexo_skills/               regras internas versionadas do Nexo
  scripts/
    serve_app.py             camada HTTP, auth gate, webhook e estaticos
    api_routes.py            mapa de rotas GET/POST de dominio
    auth.py                  login, sessoes, permissoes e usuarios
    erp_import_flow.py       importacao assistida de planilhas ERP
    relationship_imports.py  importacao de vinculos e perfis auxiliares
    replenishment.py         reposicao v1 e estoque
    replenishment_v2.py      motor v2, sazonalidade e comparacao
    quotes.py                cotacoes, pedidos, recebimento e PDF
    pricing.py               precificacao acionavel
    commercial.py            clientes, servicos e inteligencia comercial
    supplier_ops.py          fornecedores, marcas e mix
    action_center.py         acoes, pulso, timeline e memoria operacional
    company_profile.py       perfil da empresa
    whatsapp_crm.py          CRM WhatsApp e webhook
    schema_upgrades.py       upgrades locais registrados
    smoke_checks.py          verificacao principal sem CSV real
  web/
    index.html               shell da SPA
    app_core.js              API, contratos e formatadores
    app_state.js             estado global e metadados de views
    app_boot.js              bootstrap da SPA
    app_*.js                 modulos de tela por dominio
    app.css                  estilos completos
    vendor/                  ECharts e Lucide vendorizados
```

Os CSVs na raiz contem dados reais da empresa Practica. Nao leia, edite,
copie, exponha ou comite derivados desses dados.

## Ordem recomendada de leitura

1. `AGENTS.md`
2. `HANDOFF.md`
3. `PROJECT_MAP.md`
4. `docs/README.md`
5. `docs/20_estado_atual.md`
6. `docs/22_roadmap_produto_final.md`
7. `docs/23_contratos_api.md`
8. Documento especifico da area que sera alterada

## Rodando localmente

Verifique a base tecnica sem ler os CSVs reais:

```powershell
python scripts\smoke_checks.py
```

Importe os CSVs para SQLite somente quando necessario e com cuidado sobre os
dados sensiveis:

```powershell
python scripts\import_practica.py --source-dir . --db data\tenants\practica\database.sqlite3
```

Abra a entrada adequada:

```powershell
"Cliente.pyw"
"Representante.pyw"
"Gestao plataforma.pyw"
```

`Cliente.pyw` e a entrada do cliente final. `Representante.pyw` abre a central
local do consultor/distribuidor. `Gestao plataforma.pyw` e a entrada
administrativa local enquanto o portal central de licencas e cobranca ainda nao
existe. `Abrir sistema.pyw` e `Pulso.pyw` continuam como aliases do modo
cliente.

Essas entradas abrem uma janela propria em modo aplicativo quando Edge ou
Chrome estiverem disponiveis. A interface continua usando o motor web local,
mas sem barra de endereco, abas ou exposicao de `localhost` para o usuario. Ao
escolher ou criar uma empresa, o app carrega na mesma janela do iniciador.

Se a associacao de `.pyw` do Windows falhar, use o fallback:

```powershell
iniciar.bat
```

Ou abra diretamente um tenant pela linha de comando:

```powershell
python scripts\serve_app.py --tenant practica --port 8010
python scripts\serve_app.py --tenant cliente_x --port 8011
```

Todo cliente, inclusive a Practica, deve usar a estrutura
`data/tenants/<cliente>/database.sqlite3`,
`data/tenants/<cliente>/app_config.json` e
`data/tenants/<cliente>/import_reference.json`.

Antes de mover um tenant para outro ambiente ou volume persistente, gere um
backup transportavel:

```powershell
python scripts\tenant_backup.py backup --tenant practica
```

Para restaurar em outro `PULSO_DATA_DIR`:

```powershell
python scripts\tenant_backup.py restore --archive outputs\backups\practica_YYYYMMDD_HHMMSS.zip --data-dir C:\temp\nexo_restore_test
```

A camada comercial agora separa **parceiro/consultor** de **empresa cliente**:
`config/partners/default.json` define a marca/licenca do parceiro ativo, e cada
tenant em `data/tenants/<cliente>/app_config.json` aponta para esse parceiro em
`partner.id`. O iniciador local usa essa relacao para funcionar como central de
clientes do consultor.

Para preparar uma instalacao pre-personalizada, aplique um perfil de
distribuicao do consultor:

```powershell
python scripts\partner_distribution.py apply --profile config\distribution\default.json
```

Esse perfil define parceiro, canal, modo de ativacao e cobranca por cliente
ativo; dados operacionais do cliente continuam apenas no banco local do tenant.

O fluxo completo de plataforma, consultor, pacote pre-personalizado e cliente
esta em `docs/24_fluxo_parceiros_distribuicao.md`.
