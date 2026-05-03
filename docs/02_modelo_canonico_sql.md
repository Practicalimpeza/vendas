# Modelo Canonico SQL

O modelo canonico e o contrato interno do NexoVarejo. Todo conector de ERP deve
entregar dados para esse formato, mesmo que a origem tenha nomes, colunas e
conceitos diferentes.

## Principios

- Multiempresa e multiloja desde o inicio.
- Separar dado canonico de origem e configuracao operacional do Nexo.
- Preservar rastreabilidade ate arquivo, lote e linha de origem.
- Aceitar dados incompletos sem quebrar a importacao, registrando issues.
- Calculos analiticos devem ser reprodutiveis a partir das tabelas canonicas.
- Dado vindo do ERP, das planilhas base, ou extrapolado a partir delas, nao e
  editado manualmente no NexoVarejo.
- Se um dado de origem mudou, a mudanca deve vir por nova importacao.
- Alteracoes manuais no NexoVarejo so podem criar configuracoes operacionais que
  nao substituem nem corrigem campos vindos da origem.

## Regra de propriedade dos dados

O sistema trabalha com duas camadas complementares:

| Camada | Dono | Pode ser editado no Nexo? | Exemplos |
| --- | --- | --- | --- |
| Canonica de origem | ERP/origem/importador | Nao | vendas, estoque exportado, custo exportado, preco exportado, nome do produto, codigo de origem, marca importada, cliente importado, classificacoes inferidas das planilhas. |
| Operacional do Nexo | NexoVarejo | Sim | fornecedor preferencial, embalagem de compra, cobertura alvo, bloqueio de compra, observacoes internas, contato de fornecedor, status de pedido. |

Uma nova importacao pode atualizar a camada canonica de origem. Ela nao pode ser
corrigida manualmente dentro do Nexo. Se o nome, preco, custo, estoque, cliente ou
qualquer informacao extrapolada estiver errada, a correcao deve acontecer no ERP,
na exportacao, ou na regra de importacao.

Exemplo: se o ERP muda o estoque de um produto, o Nexo registra novo snapshot de
estoque. Se o gestor definiu que esse produto compra em caixa com 12 unidades e
fornecedor preferencial X, essa configuracao operacional continua valendo apos a
importacao.

As telas e analises devem ler visoes efetivas, como `v_products_effective`, mas
essas visoes nao podem trocar nomes ou cadastros de origem por valores manuais.
Elas apenas juntam a camada canonica importada com configuracoes operacionais do
Nexo.

## Mudanca de nome com mesmo codigo

Para produtos, o `source_code` dentro da empresa e a identidade primaria vinda do
ERP. Se uma nova importacao trouxer o mesmo codigo com outro nome, o NexoVarejo
deve assumir inicialmente que e o mesmo produto com nome atualizado na origem.

Comportamento esperado:

- o `products.name` importado e atualizado para o novo nome do ERP;
- vendas historicas continuam ligadas ao mesmo `product_id`;
- a mudanca fica registrada em `source_entity_changes`;
- `v_products_effective.name` passa a mostrar o novo nome do ERP;
- nao existe override manual de nome de produto no Nexo;
- se alem do nome mudarem tambem codigo de barras, marca, unidade ou padrao do
  nome de forma muito forte, o importador deve gerar issue de possivel reuso de
  codigo.

O Nexo nao deve dividir automaticamente o produto em dois so porque o nome mudou.
Separar historico por reuso real de codigo e uma acao assistida, com revisao
humana.

## Entidades principais

| Entidade | Funcao |
| --- | --- |
| `organizations` | Empresa assinante. |
| `stores` | Loja/unidade da empresa. |
| `import_batches` | Cada rodada de importacao. |
| `source_files` | Arquivos importados em um lote. |
| `source_records` | Linhas brutas ou registros normalizados preservados por lote. |
| `source_entity_changes` | Historico de mudancas percebidas em campos importados. |
| `import_issues` | Alertas e erros de qualidade de dados. |
| `implementation_projects` | Processo de onboarding de uma empresa nova. |
| `implementation_tasks` | Pendencias de implantacao e configuracao operacional. |
| `products` | Cadastro canonico de produtos. |
| `product_identifiers` | Codigos de origem, codigos de barras e aliases. |
| `brands` | Marcas padronizadas. |
| `categories` | Arvore de categorias e subcategorias. |
| `suppliers` | Fornecedores. |
| `supplier_product_rules` | Regras por fornecedor/produto. |
| `customers` | Clientes canonicos. |
| `services` | Servicos vendidos. |
| `inventory_snapshots` | Estoque em uma data de referencia. |
| `price_snapshots` | Preco de venda por produto em uma data. |
| `cost_snapshots` | Composicao de custo por produto em uma data. |
| `product_sales` | Eventos de venda/saida de produto. |
| `service_sales` | Eventos de venda de servico. |
| `product_profit_summaries` | Relatorios agregados de lucro quando a origem nao fornece transacao detalhada. |
| `purchase_orders` | Pedidos de compra gerados ou acompanhados no app. |
| `purchase_order_items` | Itens dos pedidos de compra. |
| `product_settings` | Parametros operacionais manuais por produto. |
| `v_products_effective` | Leitura final de produto sem alterar dados de origem. |
| `v_customers_effective` | Leitura final de cliente sem alterar dados de origem. |
| `v_services_effective` | Leitura final de servico sem alterar dados de origem. |
| `audit_log` | Historico de alteracoes. |

## Campos que devem sobreviver a qualquer ERP

### Produto

- codigo de origem;
- nome;
- unidade;
- marca;
- categoria;
- codigo de barras;
- status ativo/inativo;
- tags operacionais;
- embalagem/caixa/fardo;
- fornecedor preferencial;
- bloqueios de compra/relatorio.

### Venda de produto

- data;
- produto;
- quantidade;
- valor bruto;
- cliente, quando existir;
- loja;
- tipo de movimento;
- origem/lote/linha.

### Estoque

- produto;
- loja;
- data do snapshot;
- quantidade disponivel;
- custo medio ou custo atual, se disponivel;
- preco de venda vigente, se disponivel.

### Compra/reposicao

- fornecedor;
- prazo medio;
- pedido minimo;
- valor alvo para condicao comercial/desconto;
- embalagem minima;
- cobertura alvo;
- quantidade sugerida;
- status do pedido.

### Implantacao

- origem/ERP do cliente;
- status do projeto;
- responsavel interno;
- arquivos recebidos;
- checks de qualidade;
- pendencias por tipo;
- data de aprovacao do primeiro lote;
- data do primeiro dashboard;
- data da primeira rotina de compra.

## Arquivo executavel

O DDL inicial esta em `schema/canonical.sql`. Ele deve evoluir junto com testes de
importacao e exemplos reais de novos ERPs.

O primeiro mapeamento da exportacao de exemplo para esse modelo esta em
`mappings/practica_csv.yml`.
