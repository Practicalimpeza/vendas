# Skills Internas do Nexo

As skills internas sao regras versionadas do produto. Elas nao sao agentes
autonomos. Sao playbooks que dizem como o Nexo deve interpretar dados, explicar
decisoes e priorizar a rotina do gestor.

## Estrutura

Os arquivos ficam em `nexo_skills/`:

- `manifest.json`: lista de skills ativas e versoes.
- `data_governance.json`: origem, confianca e canonicidade dos dados.
- `replenishment_mix.json`: reposicao, fornecedor e decisao de mix.
- `quotation_flow.json`: cotacao, referencia de fornecedor e agrupamento.
- `commercial_intelligence.json`: clientes em risco, recompra e movimento.
- `implementation_journey.json`: implantacao progressiva.
- `action_center.json`: regras que geram a Central de Acoes.

## Como a Central usa as skills

A Central de Acoes nao deve ter seus textos e prioridades espalhados pela UI.
Ela busca regras em `nexo_skills/action_center.json`.

Cada regra define:

- skill responsavel;
- titulo;
- corpo;
- motivo;
- impacto;
- prioridade;
- area do app;
- tipo operacional da acao.

O backend preenche os templates com dados atuais, por exemplo fornecedor,
cliente, produto, quantidade de itens e score.

## Regra de produto

Uma acao pode nascer de uma inferencia, mas o status da acao e canonico no
Nexo. Quando o operador inicia, conclui ou ignora uma acao, essa decisao nao
deve ser sobrescrita por uma importacao futura do ERP.

## Endpoint

`GET /api/nexo/skills` retorna manifesto, principios e regras de acao ativas.

Esse endpoint existe para ajudar a auditar o comportamento do produto e, no
futuro, permitir uma interface interna de edicao e versionamento.

## Proximo passo natural

Criar uma tela interna de "Motor do Nexo" para visualizar:

- skills ativas;
- regras que geraram cada acao;
- confianca de cada dado;
- historico de mudancas de versao.
