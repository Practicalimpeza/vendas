# Precificacao e Periodo Global

## Objetivo

Trazer para o Nexo uma primeira camada de precificacao acionavel, sem disputar
com o ERP. O preco real de venda continua sendo o preco importado do ERP. O
Nexo calcula sinais, sugere revisoes e espera a proxima importacao confirmar
se a mudanca foi feita no ERP.

## Periodo Global

O seletor fica no topo do app: 30 dias, 90 dias, 6 meses, 12 meses e tudo.
O periodo e calculado a partir da ultima data de venda importada, nao da data
atual do computador. Isso evita telas vazias quando a base de exemplo ou a
ultima importacao nao chega ate hoje.

O filtro afeta:

- KPIs de receita.
- Produtos por receita.
- Reposicao.
- Clientes.
- Servicos.
- Inteligencia comercial.
- Precificacao.

Estoque continua sendo a foto mais recente importada do ERP.

## Precificacao

A tela de precos classifica produtos em sinais:

- Sem custo/preco.
- Margem negativa.
- Margem baixa.
- Oportunidade.
- Ok.

O operador pode clicar no produto e abrir um popup para editar apenas dados
canonicos do Nexo:

- Custo manual canonico do Nexo.
- Papel do produto: normal, ancora, commodity ou marca propria.

O popup nao altera preco de venda. Quando houver margem negativa ou margem
baixa, o Nexo mostra um preco alvo/sinal de revisao para o operador decidir se
vai alterar o cadastro no ERP.

## Alvos de Margem

- Ancora: 5%.
- Commodity: 8%.
- Normal: 20%.
- Marca propria: 30%.

Esses valores sao uma primeira configuracao operacional. Eles nao devem ser
tratados como verdade universal; servem como ponto de partida para destacar
produtos que merecem revisao.

## Canonicalidade

`product_pricing_settings` e dado canonico do Nexo. Ele nao altera preco,
estoque, venda, nome ou codigo importado do ERP. O ERP continua sendo a fonte
dos dados externos.

Regra de produto: preco ERP e somente leitura no Nexo. Qualquer ajuste de preco
de venda deve ser executado no ERP. Na proxima importacao, o Nexo recalcula os
sinais e verifica se o novo preco entrou na base.
