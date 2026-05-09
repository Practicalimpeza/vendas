# Contratos de API da Fase 1

Este documento registra os contratos minimos que o frontend pode assumir nos
endpoints centrais da mesa. A regra e simples: se um campo listado aqui mudar,
o smoke deve falhar ou o contrato precisa ganhar nova versao.

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

## `/api/supplier-workbench`

Contrato: `supplier_workbench.v1`

Campos obrigatorios:

- `supplier`: objeto com `id`, `name`, `contact_phone`,
  `minimum_order_value`, `target_order_value`, `lead_time_days`.
- `current_quote`: objeto da cotacao em aberto ou `null`.
- `quote_history`: lista resumida de cotacoes anteriores.
- `window_days`: janela aplicada.
- `totals`: objeto com `items_in_quote`, `estimated_value_in_quote`,
  `total_products`, `alerts_count`.
- `rows`: lista de produtos com `product_id`, `organization_id`,
  `source_code`, `supplier_reference`, `name`, `unit`, `package_size`,
  `purchase_unit`, `purchase_package_size`, `stock_units`, `demand_window`,
  `avg_daily_window`, `suggested_quantity`, `cost_no_tax`, `cost_with_tax`,
  `status`, `mix_status`, `in_quote`, `quote_quantity`,
  `quote_coverage_target_days`, `quote_notes`, `alerts`, `reason`.

## `/api/supplier-workbench/suppliers`

Contrato: `supplier_workbench_suppliers.v1`

Formato: lista pura.

Campos obrigatorios por linha:

- `supplier_id`, `supplier_name`, `contact_phone`.
- `minimum_order_value`, `target_order_value`.
- `active_skus`, `buy_now_count`, `urgent_count`, `out_of_mix_count`.
- `alert_count`, `open_quote_count`, `latest_quote_at`.
- `estimated_value`.

Uso de produto: `open_quote_count` define continuidade de cotacoes abertas na
fila de compras; `alert_count` alimenta os sinais de risco antes de montar o
PDF ou fechar pedido.

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
  `quoted_total_amount`.
- `response_summary`: objeto com `responded_count`, `pending_count`,
  `quoted_total_amount`, `learned_packages`, `average_lead_time_days`.
- `supplier_terms`: objeto com `minimum_order_value`.
- `purchase_order`: pedido gerado ou `null`.

## `/api/purchase-orders`

Contrato: `purchase_orders_list.v1`

Formato: lista pura.

Campos obrigatorios por linha:

- `id`, `organization_id`, `quote_request_id`, `supplier_id`,
  `supplier_name`, `status`, `created_at`, `expected_delivery_date`,
  `received_at`, `total_amount`, `item_count`, `approved_item_count`,
  `overdue`.

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
- `readiness`: objeto com `coverage` e `plan`.
- `quality`: objeto com `status`, `score`, `latest_batch_id`, `summary`,
  `checks`, `next_step`.

## Verificacao

Rode:

```powershell
python scripts\smoke_checks.py
```

O smoke valida estes contratos em banco temporario e tambem via HTTP.
