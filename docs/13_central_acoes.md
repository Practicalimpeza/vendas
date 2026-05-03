# Central de Acoes

A central de acoes e a camada que transforma BI em rotina. Ela mostra poucas
acoes por vez, sempre escolhidas pelo que os dados atuais ja permitem fazer.

## O que foi implementado

- Tabela operacional `action_items`.
- Endpoint `GET /api/actions/today`.
- Endpoint `POST /api/actions/status`.
- Aba `Hoje` no app.
- Acoes geradas a partir de:
  - cotacao piloto;
  - cotacao pronta para envio;
  - fornecedor sem pedido minimo;
  - fornecedor por marca ainda inferido;
  - cliente em risco;
  - cliente com recompra provavel;
  - produto em queda de ritmo.

## Regra canonica

As acoes podem nascer de leituras importadas ou inferidas, mas o status da acao
e dado operacional do Nexo. Se o gestor iniciar, concluir ou ignorar uma acao,
essa decisao e canonica no Nexo.

Isso preserva a regra principal do produto:

- dado importado do ERP continua read-only;
- dado operacional criado no Nexo pertence ao Nexo;
- conclusoes e historico de execucao nao devem ser sobrescritos pela proxima
  importacao.

## UX

A aba `Hoje` deve evitar uma lista grande de pendencias. Ela prioriza:

- poucas acoes;
- motivo claro;
- impacto estimado;
- botao para abrir a area correspondente;
- status simples: aberta, em andamento, concluida, ignorada.

## Proximos passos

- Permitir observacao manual ao concluir.
- Registrar acao comercial por cliente.
- Associar acao concluida a resultado futuro: cliente voltou, cotacao enviada,
  fornecedor configurado, produto recuperado.
- Criar recorrencia semanal de acoes.
- Separar acoes por papel: dono, comprador, vendedor, financeiro.
- Criar auditoria visual do aprendizado gerado por cada acao.
