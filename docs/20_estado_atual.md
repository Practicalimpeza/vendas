# Estado Atual do NexoVarejo

Atualizado em 2026-05-06.

## Momento do produto

O NexoVarejo esta em MVP local funcional. A proposta atual nao e substituir o
ERP do cliente; e transformar exportacoes de ERP em uma mesa diaria de gestao:
comprar melhor, decidir mix, acompanhar margem, enxergar clientes em risco e
registrar memoria operacional.

## O que ja existe

- App local em Python padrao, SQLite e frontend vanilla.
- Importacao da base Practica e importacao assistida de planilhas ERP.
- Modelo canonico com lotes, arquivos de origem, registros brutos, produtos,
  vendas, servicos, estoque, custo, preco, fornecedores, cotacoes, pedidos,
  acoes e decisoes operacionais.
- Reposicao por produto e fornecedor, com ABC, cobertura, variabilidade,
  embalagem, pedido minimo e decisao de mix.
- Fluxo de cotacao: rascunho, envio manual, resposta, aprendizado e pedido de
  compra canonico.
- Precificacao acionavel com custo importado/manual, papel do produto e sinal de
  margem.
- Central de Acoes, Motor do Nexo, maturidade e trilhas operacionais.
- Skills internas versionadas em `nexo_skills/`.

## Arquitetura atual

- `scripts/serve_app.py` ficou como camada HTTP pequena: conexao SQLite,
  despacho de rotas, arquivos estaticos e bootstrap local.
- `scripts/schema_upgrades.py` concentra upgrades locais de schema que ainda
  nao viraram migracoes versionadas.
- `scripts/erp_import_flow.py` concentra a importacao assistida de planilhas ERP,
  incluindo preview, mapeamento, conflitos manuais e commit.
- `scripts/replenishment.py`, `scripts/quotes.py`, `scripts/pricing.py`,
  `scripts/product_views.py`, `scripts/commercial.py`, `scripts/supplier_ops.py`
  e `scripts/action_center.py` concentram as regras de produto por area.
- `scripts/smoke_checks.py` roda em banco temporario e cobre contratos centrais
  sem ler CSVs reais.
- `/api/imports` entrega `quality`, um diagnostico do ultimo lote com confianca,
  linhas lidas/mapeadas, issues, conflitos manuais, mudancas pendentes e
  proximo passo.

## Correcoes recentes importantes

- Importacao de CSV da Practica passou de `full_refresh` destrutivo para
  `incremental_sync`, preservando historico e evitando duplicidade de fatos.
- Snapshots de estoque, preco e custo agora sao lidos pelo valor mais recente,
  nao por soma historica nem maior valor observado.
- Reposicao continua retornando produtos quando nao existe venda no periodo,
  marcando o item com status operacional apropriado.
- O servidor local bloqueia exposicao em IP de rede salvo quando
  `NEXOVAREJO_ALLOW_NETWORK=1` estiver definido.
- O smoke HTTP percorre um fluxo beta completo: preview de planilha ERP,
  deteccao/resolucao de conflito manual, reposicao, cotacao, pedido,
  recebimento e acao operacional.
- A tela de importacao mostra reconciliacao do ultimo lote e confianca do
  diagnostico, conectando onboarding com a rotina operacional.
- O antigo monolito foi reduzido para uma camada HTTP pequena e os modulos
  extraidos tem responsabilidades nomeadas por area.

## Foco recomendado

1. Melhorar onboarding de novos comercios com checklist de arquivos, confianca e
   primeiro valor entregue.
2. Consolidar docs e skills como fonte de verdade para a beta assistida.
3. Ampliar reconciliacao e qualidade da importacao ERP.
4. Melhorar comparacao entre sugerido, cotado, comprado e recebido.
5. Definir uma protecao simples de acesso antes de qualquer uso fora do
   localhost.

## Nao resolver agora

- Migrar para PostgreSQL antes de validar a rotina com usuarios reais.
- Adicionar framework web ou frontend.
- Automatizar envio de WhatsApp, email ou compras sem aprovacao humana.
- Criar autenticacao completa sem decidir primeiro o ambiente de uso da beta.
