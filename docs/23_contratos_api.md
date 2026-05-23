# Contratos de API

Este documento registra os contratos minimos que o frontend pode assumir nos
endpoints centrais da mesa. A regra e simples: se um campo listado aqui mudar,
o smoke deve falhar ou o contrato precisa ganhar nova versao.

O documento nao e um catalogo completo de todas as rotas. Ele cobre os contratos
que sustentam o release candidate da beta assistida e sinaliza quais rotas novas
ainda precisam de contrato mais forte.

## Convencoes

- Todo payload contratual tem `contract` com nome e versao.
- Endpoints legados que retornam lista pura mantem array na raiz para nao
  quebrar o frontend atual; o contrato deles vale para cada linha da lista.
- Endpoints filtrados por periodo retornam `period`.
- Listas de trabalho retornam `summary` ou `totals` e `rows`.
- Campos extras podem existir, mas os campos abaixo nao devem desaparecer.
- No frontend, objetos versionados devem ser carregados com `apiContract(...)`
  e listas legadas com `apiRows(...)`.

## Convencao Para Endpoint Novo

Todo endpoint novo deve nascer com estes itens no mesmo ciclo:

- Funcao de dominio no modulo da area, evitando regra nova dentro de
  `serve_app.py`.
- Rota registrada em `serve_app.py` apenas como roteamento fino.
- Contrato ou validador em `scripts/api_contracts.py`.
- Cobertura em `scripts/smoke_checks.py`, de preferencia direta e via HTTP.
- Secao neste documento quando o endpoint for consumido pelo frontend.
- Consumo no frontend via `apiContract(...)` para objeto versionado ou
  `apiRows(...)` para lista legada.

## Convencao Para Schema

- O schema base vive em `schema/canonical.sql`.
- Upgrades de compatibilidade vivem em `scripts/schema_upgrades.py`.
- Toda nova mudanca estrutural precisa ter identificador em
  `schema_migrations`; nao adicionar `ALTER TABLE` solto sem registro.
- O smoke deve validar a migracao ou o efeito observavel dela.

## Erros de API

Endpoints sob `/api/` retornam erro em JSON, inclusive 404:

- `ok`: sempre `false`.
- `error`: mensagem curta para a interface.
- `code`: codigo estavel como `bad_request`, `not_found` ou
  `internal_error`.
- `status`: codigo HTTP.
- `route`: rota que falhou, quando aplicavel.

## `/api/health`

Contrato: `health.v1`

Campos obrigatorios:

- `ok`: `true` quando as tabelas essenciais existem.
- `checks`: objeto com `database`, `schema`, `api_contracts`.
- `schema`: objeto com `required_tables` e `missing_tables`.
- `contracts`: lista de contratos centrais cobertos pelo gate.

## `/api/auth/me`

Contrato implicito: auth session.

Campos obrigatorios:

- `authenticated`: booleano.
- `needs_bootstrap`: booleano indicando se ainda nao existe usuario.
- `user`: usuario autenticado ou `null`.
- `modules`: lista de modulos disponiveis na interface.

Uso de produto: quando `needs_bootstrap` e `true`, a interface mostra o primeiro
acesso; quando `authenticated` e `false` e ja existem usuarios, a interface fica
bloqueada pelo gate de login.

## `/api/app-config`

Contrato implicito: configuracao publica da instalacao.

Campos obrigatorios:

- `schema`: `pulso.white_label.v1`.
- `app_name`: nome curto mostrado na interface.
- `app_subtitle`: subtitulo operacional da mesa.
- `logo_path`: vazio quando a instalacao ainda nao escolheu logo, ou caminho
  publico absoluto como `/tenant-assets/<tenant>/...` quando a logo veio do
  onboarding/perfil da empresa.
- `tenant`: slug do tenant ativo ou string vazia no modo legado.

Uso de produto: endpoint publico carregado antes do login para evitar marca,
logo e titulo hard coded na casca da aplicacao.

## Iniciador local `/api/tenants`

Contrato implicito do iniciador `scripts/tenant_launcher_web.pyw`.

Campos principais:

- `partner`: parceiro/consultor ativo, com `id`, `name`, `accent_color`,
  `logo_data_url`, `license_status`, `license_plan`, `billing_model`,
  `activation_mode` e `package_id`.
- `tenants`: lista de empresas cliente visiveis para o parceiro ativo.
- Cada tenant traz `id`, `partner_id`, `name`, `logo_data_url`,
  `user_summary`, `address` e `profile_status`.

Uso de produto: esta rota alimenta a central de clientes do consultor. Ela nao
deve expor slug tecnico para diferenciar empresas com nome igual; a diferenciacao
visual deve usar dados da propria empresa, como usuarios e endereco.

## `/api/installation`

Contrato: `local_installation.v1`

Endpoint publico local, usado antes do login para ativacao/licenca.

Campos principais:

- `installation`: identidade local persistente da instalacao, com
  `installation_id`, `partner_id`, `package_id`, `channel`, `activation_mode`,
  `billing_model` e `active_tenant`.
- `license`: estado local de licenca, com `status`, `plan`, `client_status`,
  `checked_at`, `valid_until`, `activation_url`, `offline_grace_days`,
  `billing_model` e `reason`.

Uso de produto: base da futura tela de ativacao e da cobranca por cliente ativo.
O endpoint nao deve retornar dados operacionais da empresa.

## `/api/onboarding`

Contrato: `onboarding.v1`

Campos obrigatorios:

- `contract`: `onboarding.v1`.
- `required`: booleano; quando `true`, a interface mostra o onboarding antes do
  login.
- `completed`: booleano.
- `current_step`: etapa sugerida.
- `steps`: lista com `key`, `label`, `done` e, quando aplicavel, `optional`.
- `password_min_length`: tamanho minimo de senha exigido pelo backend para o
  primeiro administrador. O frontend deve usar esse valor em placeholder e
  validacao local para evitar divergencia.
- `organization`, `profile`, `store`, `operation`, `data`: estado atual usado
  para pre-preencher a tela.
- `public_config`: mesmo contrato de `/api/app-config`.

## `/api/onboarding/complete`

Contrato: comando de onboarding.

Efeito colateral:

- cria/atualiza organizacao, perfil da empresa e loja principal;
- cria o primeiro administrador quando ainda nao ha usuarios;
- salva a logo enviada em `data/tenants/<cliente>/assets/` e aponta
  `logo_path` para `/tenant-assets/<tenant>/...`, quando houver upload;
- grava a marca white-label local em `data/tenants/<cliente>/app_config.json`
  quando roda com `--tenant`, ou no caminho legado `data/local/app_config.json`
  quando roda sem tenant e usa o banco padrao;
- registra `onboarding.state` em `app_settings`;
- registra evento em `audit_log`;
- quando cria o admin, retorna cookie de sessao HTTP-only.

Uso de produto: quando `operation.next_after_onboarding` for `imports` ou vier
vazio, o frontend redireciona para `/importacao?onboarding=import` e destaca o
upload do importador assistido. Quando for `dashboard`, volta para o painel. O
bloco `operation` continua existindo para defaults e compatibilidade de payload,
mas a tela inicial nao deve coletar perfil operacional. Perfil operacional,
lojas, fornecedor, embalagem, unidade por caixa, pedido minimo e reposicao devem
ser inferidos depois pela importacao.

## `/api/auth/bootstrap` e `/api/auth/login`

Contrato implicito: auth command.

Campos obrigatorios no retorno:

- `ok`: `true`.
- `user`: usuario autenticado.
- `modules`: lista de modulos disponiveis.

Efeito colateral: a resposta define cookie de sessao HTTP-only. O bootstrap so
pode ocorrer quando ainda nao existe usuario.

## `/api/admin/users`

Contrato: `admin_users.v1`

Campos obrigatorios:

- `modules`: lista de modulos administraveis.
- `users`: lista de usuarios da organizacao atual.

Campos obrigatorios por usuario:

- `id`, `organization_id`, `name`, `login_name`, `email`, `role`, `active`,
  `permissions`, `created_at`, `updated_at`, `last_login_at`.

Uso de produto: endpoint restrito a administrador.

## `/api/summary`

Contrato: `summary.v1`

Campos obrigatorios:

- `period`: objeto com `date_from`, `date_to`, `period_days`, `label`.
- `kpis`: objeto com `products`, `customers`, `product_revenue`,
  `service_revenue`, `stock_units`, `open_tasks`.
- `monthly`: lista de pontos com `month`, `product_revenue`,
  `service_revenue`.
- `monthly_granularity`: `day` ou `month`.
- `tasks`: lista de tarefas resumidas com `task_type`, `title`, `priority`,
  `status`.

Observacao de produto: `products` e `customers` representam movimentacao do
periodo, nao total cadastrado.

## `/api/replenishment`

Contrato: `replenishment.v1`

Campos obrigatorios:

- `period`: objeto do periodo aplicado.
- `summary`: objeto com `reference_date`, `observed_days`, `buy_now`,
  `mix_review`, `watch`, `excess`, `no_demand`, `out_of_current_mix`,
  `critical_a`, `suggested_units`, `estimated_value`.
- `rows`: lista de produtos com `product_id`, `organization_id`,
  `source_code`, `quote_code`, `name`, `unit`, `abc_class`, `status`,
  `status_label`, `stock_units`, `open_order_quantity`, `open_order_value`,
  `open_order_count`, `projected_stock_units`, `demand_30`, `demand_90`,
  `demand_180`, `projected_coverage_days`, `suggested_quantity`,
  `estimated_value`, `supplier_id`, `supplier_name`, `supplier_configured`,
  `reason`.

## `/api/replenishment-v2`

Contrato: `replenishment.v2`

Campos obrigatorios:

- Todos os campos de `replenishment.v1`.
- `summary.demand_classes`.
- `summary.seasonal_items`.
- `summary.operation_profile`.
- Linhas com sinais adicionais de demanda, perfil operacional e classificacao
  usada pelo motor v2.
- Linhas tambem expõem explicacao operacional da conta: horizonte de compra,
  protecao, horizonte calculado, necessidade bruta, arredondamento por embalagem,
  decisao de compra e motivo.

Uso de produto: rota usada como base da mesa de compras e para diagnostico do
motor. Antes do RC, manter comparacao contra v1 para calibrar ruptura, excesso e
capital empatado.

## `/api/replenishment-v2/compare`

Contrato: comparativo operacional.

Campos esperados:

- Comparacao entre resultados v1/v2 para itens relevantes.
- Resumo das mudancas de classificacao, sugestao e motivo.

Observacao: se esta rota virar tela central do RC, promover para contrato
versionado em `scripts/api_contracts.py` e no smoke.

## `/api/supplier-workbench`

Contrato: `supplier_workbench.v1`

Campos obrigatorios:

- `supplier`: objeto com `id`, `name`, `contact_phone`,
  `minimum_order_value`, `target_order_value`, `lead_time_days`.
- `current_quote`: objeto da cotacao em aberto ou `null`.
- `quote_history`: lista resumida de cotacoes anteriores.
- `window_days`: janela aplicada.
- `totals`: objeto com `items_in_quote`, `estimated_value_in_quote`,
  `total_products`, `alerts_count` e resumo da cesta recomendada quando
  disponivel.
- `basket`: resumo da cesta deterministica do fornecedor, com valor essencial,
  complementos selecionados e falta restante para minimo/valor alvo.
- `rows`: lista de produtos com `product_id`, `organization_id`,
  `source_code`, `supplier_reference`, `name`, `unit`, `package_size`,
  `purchase_unit`, `purchase_package_size`, `stock_units`, `demand_window`,
  `avg_daily_window`, `suggested_quantity`, `cost_no_tax`, `cost_with_tax`,
  `status`, `mix_status`, `in_quote`, `quote_quantity`,
  `quote_coverage_target_days`, `quote_notes`, `alerts`, `reason`.
- Campos adicionais por linha podem incluir `purchase_decision`,
  `purchase_decision_label`, `raw_need`, `rounded_need`, `technical_quantity`,
  `order_horizon_days`, `order_horizon_protection_days`,
  `order_horizon_receipt_coverage_days`, `risk_gap_days`,
  `after_purchase_coverage_days`, `basket_role`,
  `basket_selected`, `basket_decision_label`, `basket_score` e
  `recommended_quote_quantity`.

## `/api/supplier-workbench/suppliers`

Contrato: `supplier_workbench_suppliers.v1`

Formato: lista pura.

Campos obrigatorios por linha:

- `supplier_id`, `supplier_name`, `contact_phone`.
- `minimum_order_value`, `target_order_value`.
- `active_skus`, `buy_now_count`, `urgent_count`, `out_of_mix_count`.
- `alert_count`, `open_quote_count`, `latest_quote_at`,
  `latest_quote_status`.
- `estimated_value`.

Uso de produto: `open_quote_count` define continuidade de cotacoes abertas na
fila de compras; `latest_quote_status` diferencia rascunho, cotacao enviada e
resposta registrada; `alert_count` alimenta os sinais de risco antes de montar
o PDF ou fechar pedido.

## `/api/pricing`

Contrato: `pricing.v1`

Campos obrigatorios:

- `period`: objeto do periodo aplicado.
- `summary`: objeto com `products`, `negative_margin`, `low_margin`,
  `missing_cost`, `opportunities`, `period_label`.
- `rows`: lista de produtos com `product_id`, `organization_id`,
  `source_code`, `name`, `quantity`, `revenue`, `sale_price`,
  `effective_cost`, `cost_origin`, `product_role`, `signal`,
  `signal_label`, `severity`, `min_margin_pct`, `role_label`, `reason`,
  `target_price`, `suggested_price_delta`, `nexo_action`.

## `/api/customers/top`

Contrato: `customers_top.v1`

Formato: lista pura.

Campos obrigatorios por linha:

- `name`: nome exibido do cliente canonico.
- `purchases`: quantidade de compras no periodo.
- `last_purchase`: ultima data de movimento no periodo.
- `revenue`: receita total do cliente no periodo.

## `/api/products/top`

Contrato: `products_top.v1`

Formato: lista pura.

Campos obrigatorios por linha:

- `id`, `organization_id`, `source_code`, `name`, `brand_name`,
  `supplier_id`, `supplier_name`.
- `quantity`, `revenue`, `share`.

## `/api/services/top`

Contrato: `services_top.v1`

Formato: lista pura.

Campos obrigatorios por linha:

- `name`, `quantity`, `revenue`, `net_revenue`.

## `/api/commercial/intelligence`

Contrato: `commercial_intelligence.v1`

Campos obrigatorios:

- `period`: objeto do periodo aplicado.
- `summary`: objeto com `customers`, `revenue`, `at_risk_customers`,
  `at_risk_revenue`, `due_customers`, `due_revenue`, `growth_products`,
  `drop_products`, `last_sale_date`, `period_label`.
- `risk_customers`, `repurchase_opportunities`, `champions`.
- `product_momentum` e `brand_momentum`.
- `explanations`.

## `/api/actions/today`

Contrato: `actions_today.v1`

Campos obrigatorios:

- `summary`: objeto com `total`, `open`, `in_progress`, `completed`,
  `ignored`, `open_estimated_value`.
- `actions`: lista de acoes abertas com `id`, `action_type`, `target_type`,
  `title`, `body`, `status`, `priority`.
- `history`, `pulse`, `intelligence`, `timeline`.

## `/api/quotes`

Contrato: `quotes_list.v1`

Formato: lista pura.

Campos obrigatorios por linha:

- `id`, `organization_id`, `supplier_id`, `supplier_name`, `status`,
  `created_at`, `total_estimated_amount`, `item_count`.
- `purchase_order_id`, `purchase_order_status`, `purchase_order_total` para
  indicar se a cotacao ja virou pedido.

## `/api/quote`

Contrato: `quote_detail.v1`

Campos obrigatorios:

- `id`, `supplier_id`, `supplier_name`, `status`.
- `items`: lista com `id`, `quote_request_id`, `product_id`, `source_code`,
  `supplier_reference`, `product_name`, `unit`, `requested_quantity`,
  `purchase_unit`, `purchase_package_size`, `coverage_target_days`,
  `confirmed_quantity`, `quoted_total_amount`.
- `response_summary`: objeto com `responded_count`, `pending_count`,
  `confirmed_quantity`, `quoted_total_amount`, `learned_packages`,
  `average_lead_time_days`.
- `supplier_terms`: objeto com `minimum_order_value`.
- `purchase_order`: pedido aprovado automaticamente apos resposta valida ou
  `null`.

POSTs principais do ciclo:

- `/api/quotes/status` com `status="sent"` marca a cotacao como enviada, sem
  criar pedido. A cotacao enviada tambem aparece em `/api/purchase-orders` como
  `awaiting_supplier_confirmation` para manter a pendencia visivel na fila de
  Pedidos.
- `/api/quotes/response` registra disponibilidade, `confirmed_quantity`, prazo
  e observacoes. Nao aprende preco de compra. Por padrao, tambem cria e aprova
  o pedido quando existe item confirmado para comprar.
- `/api/quotes/generate-order` continua disponivel para casos legados/manuais e
  cria o pedido em `pending_confirmation` somente depois da resposta do
  fornecedor.

## `/api/purchase-orders`

Contrato: `purchase_orders_list.v1`

Formato: lista pura.

Campos obrigatorios por linha:

- `id`, `organization_id`, `quote_request_id`, `supplier_id`,
  `supplier_name`, `status`, `created_at`, `expected_delivery_date`,
  `received_at`, `total_amount`, `item_count`, `approved_item_count`,
  `overdue`.

Observacao: linhas com `status="awaiting_supplier_confirmation"` representam
cotacoes enviadas ao fornecedor que ainda nao viraram `purchase_order`; a acao
esperada e registrar a resposta do fornecedor.

## `/api/purchase-order`

Contrato: `purchase_order_detail.v1`

Campos obrigatorios:

- `id`, `quote_request_id`, `supplier_id`, `supplier_name`, `status`,
  `total_amount`, `item_count`, `approved_item_count`.
- `items`: lista com `id`, `purchase_order_id`, `quote_request_item_id`,
  `product_id`, `source_code`, `supplier_reference`, `product_name`, `unit`,
  `final_quantity`, `unit_price`, `total_amount`.

## `/api/imports`

Contrato: `imports.v1`

Campos obrigatorios:

- `batches`: lista de lotes com `id`, `source_system`, `status`,
  `started_at`, `finished_at`, `summary_json`.
- `issues`: lista de problemas com `severity`, `code`, `message`,
  `source_line`.
- `changes`: lista de mudancas com `entity_type`, `source_code`,
  `field_name`, `previous_value`, `new_value`, `review_status`, `created_at`.
- `refresh_targets`: fontes conhecidas para reimportacao.
- `local_reference`: configuracao e status da atualizacao rapida por pasta.
- `readiness`: objeto com `coverage` e `plan`.
- `quality`: objeto com `status`, `score`, `latest_batch_id`, `summary`,
  `checks`, `next_step`.
- `assistant`: objeto com `next_recommended_file`, `module_scores`,
  `implementation_state`, `status`, `message`.

Campos obrigatorios de `assistant.next_recommended_file`:

- `id`, `title`, `why`, `expected_files`, `minimum_fields`, `unlocks`,
  `blocked_modules`, `depends_on`, `not_now`.

Campos obrigatorios por item de `assistant.module_scores`:

- `id`, `label`, `score`, `status`, `detail`, `tone`.

Campos obrigatorios de `assistant.implementation_state`:

- `stage`, `message`, `ready`, `partial`, `missing`, `essential_gaps`.

Uso de produto: `assistant` e o contrato de orientacao da importacao guiada. Ele
nao grava dado novo; apenas interpreta `readiness`, `quality` e historico de
mapeamentos para sugerir proxima fonte, dependencias, blocos destravados e estado
da implantacao.

Em modo `--tenant`, `local_reference` deve usar apenas
`data/tenants/<tenant>/import_reference.json` e arquivos importados naquele
tenant. Nao deve listar a ordem fixa legada nem herdar `data/import_reference.json`
da empresa piloto quando o tenant ainda nao configurou pasta propria.

## `/api/erp/import-preview`

Contrato implicito: preview da importacao assistida de ERP.

Campos obrigatorios:

- `file_name`, `metadata`, `sheets`, `summary`, `assistant`, `field_options`.
- Por item de `sheets`: `sheet_name`, `signature`, `header_line`,
  `row_count`, `column_count`, `dominant_entity`, `columns`, `preview_rows`,
  `alignment`.
- `alignment`: objeto com `status`, `message`, `issue_count`, `examples` e
  `hints`. Quando `status="warn"`, a aba tem sinais de linhas desalinhadas com
  o cabecalho ou valores deslocados entre colunas.
- `assistant.alignment_warnings`: lista resumida dos alertas de alinhamento por
  aba, usada pelo modo guiado para orientar o usuario sobre o arquivo escolhido
  antes de gravar.

Uso de produto: o modo guiado deve falar primeiro sobre a planilha selecionada.
Se houver `alignment_warnings`, a interface deve orientar a conferencia dos
exemplos e do mapeamento antes de confirmar o lote.

## `/api/links/inspect`, `/api/links/preview`, `/api/links/commit`

Contrato implicito: importacao auxiliar de relacionamentos.

`inspect` retorna:

- `ok`, `file_name`, `headers`, `sample_rows`, `row_count`.
- `link_types`, `default_link_type`, `suggestions`.

`preview` retorna:

- `ok`, `type`, `type_label`, `file_name`, `headers`, `summary`, `preview`.
- Para modo de perfil de fornecedor: `mode`, `field_indexes`, `summary` e
  `preview` com novos fornecedores, atualizacoes e ignorados.

`commit` retorna:

- `ok`, `type` e resumo de aplicacao.

Uso de produto: vincular marca-fornecedor, produto-marca,
produto-fornecedor preferencial e perfis de fornecedores a partir de planilhas
auxiliares. Se entrar como etapa obrigatoria do onboarding, promover para
contrato versionado.

## `/api/company-profile`

Contrato implicito: perfil da empresa.

Campos principais:

- `organization_id`, `organization_name`, `trade_name`, `legal_name`,
  `document`, `state_registration`, `municipal_registration`, `contact_name`,
  `phone`, `email`, `website`, endereco, `logo_path`, `document_footer`,
  `default_payment_terms`, `notes`, `updated_at`.

POST retorna `ok: true` junto com o perfil atualizado e registra
`company_profile_update` em `audit_log`.

## `/api/whatsapp/conversations`

Contrato: `whatsapp_conversations.v1`

Campos obrigatorios:

- `rows`: lista de conversas.
- `metrics`: objeto com `open`, `new`, `unassigned`, `follow_up`.
- `agents` e `users`: atendentes disponiveis.
- `statuses`, `departments`, `config`.

Campos importantes por conversa:

- `id`, `contact_name`, `contact_wa_id`, `status`, `owner_user_id`,
  `owner_name`, `department`, `priority`, `last_message_at`,
  `last_inbound_at`, `last_outbound_at`, `follow_up_at`, `notes`.

## `/api/whatsapp/conversation`

Contrato: `whatsapp_conversation_detail.v1`

Campos obrigatorios:

- `conversation`: conversa atual.
- `messages`: mensagens ordenadas.
- `events`: eventos recentes.
- `agents`, `users`, `statuses`, `departments`, `config`.

## Rotas ainda sem contrato canonico

As rotas abaixo existem e sao consumidas, mas devem ganhar contrato versionado
se virarem parte do release candidate ou se o frontend passar a depender de
campos especificos:

- `/api/company-profile`.
- `/api/links/inspect`, `/api/links/preview`, `/api/links/commit`.
- `/api/replenishment-v2/compare`.
- Comandos de WhatsApp: `/api/whatsapp/conversations/update`,
  `/api/whatsapp/messages/send`, `/api/whatsapp/agents/upsert`.
- Comandos de admin: `/api/admin/users/upsert`.

## Verificacao

Rode:

```powershell
python scripts\smoke_checks.py
```

O smoke valida estes contratos em banco temporario e tambem via HTTP.
