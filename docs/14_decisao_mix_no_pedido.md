# Decisao de Mix no Pedido

Alguns produtos ficam em uma zona cinzenta: o estoque esta acabando, mas o
historico nao sustenta uma recompra automatica. Nesses casos, o Nexo nao deve
comprar sozinho nem esconder o item. Ele deve pedir decisao do operador.

## Regra implementada

O motor de reposicao cria o status `mix_review` quando:

- ainda existe algum estoque;
- o estoque esta muito baixo;
- a demanda recente e fraca, intermitente ou ausente;
- a recompra nao tem confianca suficiente para virar sugestao automatica.

O status aparece como **Decidir mix**.

## Decisoes possiveis

O operador pode escolher:

- **Tirar do mix**: produto fica bloqueado para compra e ignorado nos relatorios
  de reposicao. O produto continua existindo como dado importado/canonico, mas a
  decisao operacional do Nexo remove ele da rotina.
- **Forcar compra**: produto volta como compra sugerida uma ultima vez. Isso
  permite testar se ainda faz sentido manter o item antes de eliminar.

## Onde aparece

- Na aba `Reposicao`, com filtro `Decidir mix`.
- Na fase de cotacao/pedido do fornecedor, quando o fornecedor ja tem itens de
  compra sendo montados.
- Na aba `Hoje`, como acao operacional priorizada.

## Principio de produto

Essa decisao e canonica no Nexo. O ERP continua sendo dono do cadastro e do
historico importado, mas a escolha de operar ou nao aquele item no mix e uma
configuracao operacional do Nexo.

Isso evita dois erros:

- comprar automaticamente item que esta morrendo;
- perder item estrategico que vende pouco, mas o lojista quer manter.
