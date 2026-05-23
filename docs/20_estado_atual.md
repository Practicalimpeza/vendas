# Estado Atual do NexoVarejo

Atualizado em 2026-05-22.

## Momento do produto

O NexoVarejo esta em transicao de prototipo local funcional para beta assistida
com uma definicao de produto mais forte: ser o Sistema Operacional de Gestao
para empresas do varejo. A proposta evoluiu para uma operacao hibrida natural:
funcionar conectado ao ERP do cliente quando ele existir e funcionar standalone
quando a rotina nascer no proprio app.

Essa visao posiciona o Nexo como uma nova categoria de gestao para o varejo. O
produto comeca por cima dos ERPs e planilhas existentes, organiza a empresa em
dados conectados, semantica de varejo, processos adaptaveis, sinais
investigaveis, instrumentos de gestao e memoria operacional. Com maturidade, ele
pode substituir partes da operacao hoje espalhadas em varios sistemas, sem se
limitar a ser um "ERP melhor". O ponto de partida continua sendo transformar
exportacoes e planilhas auxiliares em uma mesa diaria de gestao para comprar
melhor, decidir mix, acompanhar margem, enxergar clientes em risco e registrar
como a empresa opera.

O codigo ja passou de "prototipo local simples": existem autenticacao, usuarios,
permissoes, modulos operacionais, importacoes assistidas, contratos de API,
smoke checks e CRM WhatsApp. O trabalho mais importante agora e consolidar um
release candidate coerente, testavel e demonstravel.

## O que ja existe

- App local em Python padrao, SQLite e frontend vanilla modularizado.
- Bloqueio de exposicao fora de localhost salvo com
  `NEXOVAREJO_ALLOW_NETWORK=1`.
- Autenticacao local com bootstrap do primeiro administrador, login, logout,
  sessoes, permissoes por modulo e administracao de usuarios.
- Perfil da empresa e dados de organizacao no schema canonico.
- Importacao da base Practica e importacao assistida de planilhas ERP.
- Reconciliacao de importacao com `quality`, `readiness`, issues, conflitos,
  mudancas pendentes, refresh local e proximo passo.
- Importacoes auxiliares de relacionamentos: marca-fornecedor, produto-marca,
  produto-fornecedor preferencial e perfis de fornecedores.
- Modelo canonico com organizacoes, lotes, arquivos de origem, registros brutos,
  produtos, clientes, fornecedores, vendas, servicos, estoque, custo, preco,
  cotacoes, pedidos, acoes, usuarios, sessoes, WhatsApp e `audit_log`.
- Base canonica inicial para standalone/integracao gradual:
  `operational_data_sources` descreve fontes externas, importacoes e o proprio
  sistema; `entity_source_links` vincula registros canonicos a essas fontes; e
  `entity_field_controls` marca campos que passaram a ser controlados pelo app.
- Guardrail de importacao: novas planilhas nao sobrescrevem campos ja assumidos
  no app em produto, cliente ou fornecedor. A importacao continua registrando
  presenca, snapshots e campos ainda livres.
- Quarentena de produtos com codigo de origem corrompido: o upgrade local
  `20260522_corrupt_product_code_quarantine` inativa produtos ativos com
  `source_code` quebrado/concatenado e sem vendas, cotacoes ou pedidos,
  preservando snapshots e registrando auditoria.
- Primeira ficha operacional de produto: a tela de Produtos ganhou criacao e
  edicao de cadastro basico, marca, categoria, fornecedor preferencial,
  identificadores e parametros de compra. Produtos criados no app aparecem na
  base do mix mesmo sem venda historica.
- Reposicao v1 e motor v2, com comparacao, sinais de demanda, sazonalidade,
  cobertura, ABC, ruptura, excesso, pedido minimo e pedido em aberto.
- Motor v2 de compras orientado por fornecedor: o ciclo automatico parte do
  valor diario do mix contra o pedido minimo/valor alvo do fornecedor; produto
  entra depois pela necessidade ate a proxima rodada e pelo arredondamento da
  caixa.
- Fluxo de cotacao: rascunho, montagem por fornecedor, PDF, envio manual,
  resposta, aprendizado, pedido de compra e recebimento.
- Precificacao acionavel com custo importado/manual, papel do produto, margem,
  preco alvo e trilha de auditoria.
- Clientes, servicos e inteligencia comercial com filas de relacionamento.
- Central de Acoes, Motor do Nexo, maturidade, trilhas operacionais e memoria
  operacional.
- WhatsApp CRM com webhook, conversas, agentes, departamentos, fila, detalhe da
  conversa, eventos e envio via Cloud API quando configurado.
- Skills internas versionadas em `nexo_skills/`.
- Fundacao IA-friendly ainda sem IA embutida obrigatoria: contratos de API,
  origem de dados, audit log, estados operacionais e explicacoes por dominio
  preparam o produto para analise assistida externa.

## Arquitetura atual

- `scripts/serve_app.py` e a camada HTTP: conexao SQLite, inicializacao,
  protecao por auth, webhook WhatsApp, PDF e arquivos estaticos.
- `scripts/api_routes.py` concentra as rotas GET/POST de dominio.
- `scripts/auth.py` concentra login, bootstrap, sessoes, permissoes e usuarios.
- `scripts/schema_upgrades.py` concentra upgrades locais registrados em
  `schema_migrations`.
- `scripts/erp_import_flow.py` concentra a importacao assistida de planilhas ERP.
- `scripts/relationship_imports.py` concentra importacoes auxiliares de vinculos
  e perfis.
- `scripts/replenishment.py` e `scripts/replenishment_v2.py` concentram os
  motores de reposicao.
- `scripts/quotes.py`, `scripts/pricing.py`, `scripts/product_views.py`,
  `scripts/commercial.py`, `scripts/supplier_ops.py`,
  `scripts/action_center.py`, `scripts/company_profile.py` e
  `scripts/whatsapp_crm.py` concentram regras por area.
- `scripts/smoke_checks.py` roda em banco temporario e cobre contratos centrais
  sem ler CSVs reais.
- O frontend foi dividido em `web/app_core.js`, `web/app_state.js`,
  `web/app_boot.js` e modulos `web/app_*.js` por area, mantendo script classico
  sem bundler.

## Correcoes recentes importantes

- Importacao de CSV da Practica passou de `full_refresh` destrutivo para
  `incremental_sync`, preservando historico e evitando duplicidade de fatos.
- Snapshots de estoque, preco e custo usam o valor mais recente.
- Reposicao continua retornando produtos sem venda no periodo, marcando o item
  com status operacional apropriado.
- O smoke HTTP percorre um fluxo beta completo: preview ERP, conflito manual,
  commit, reposicao, cotacao, pedido, recebimento e acao operacional.
- Contratos de API e `/api/health` viraram trilho de confiabilidade.
- O frontend passou a validar contratos centrais e mostrar falhas globais.
- Auth, admin de usuarios, perfil da empresa, WhatsApp CRM, relacionamento por
  planilha e reposicao v2 foram incorporados ao estado real do produto.

## Foco recomendado

1. Reposicionar a documentacao e a linguagem de produto em torno de Sistema
   Operacional de Gestao para empresas do varejo, sem perder o foco de beta
   assistida.
2. Congelar um release candidate de beta assistida: inventario do que entrou,
   smoke verde, checks JS/Python e roteiro manual de ponta a ponta.
3. Atualizar e manter docs canonicos como fonte de verdade, evitando que roadmap
   antigo volte a orientar decisoes ja executadas.
4. Fechar a historia demonstravel principal: primeiro acesso, importacao,
   qualidade, reposicao, cotacao, pedido, recebimento e impacto operacional.
5. Testar multiempresa, permissoes e rotas protegidas com dados isolados por
   `organization_id`.
6. Implementar ou validar rotina simples de backup/restauracao antes de beta com
   dados reais fora do ambiente atual.

## Nao resolver agora

- Migrar para PostgreSQL antes de validar a rotina com usuarios reais.
- Adicionar framework web ou frontend.
- Adicionar dependencias instaladas sem uma dor concreta e alinhada.
- Automatizar envio de WhatsApp, email ou compras sem aprovacao humana.
- Abrir deploy com dados reais antes de fechar protecao, backup e isolamento.
