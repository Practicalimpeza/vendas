# Pedido de Compra Canonico

## Objetivo

Transformar uma cotacao respondida em uma decisao operacional fechada: o que
sera comprado, em qual quantidade, por qual preco e com qual fornecedor.

## Fluxo

1. O Nexo sugere reposicao e gera cotacao.
2. O operador registra resposta do fornecedor.
3. A tela calcula uma sugestao de fechamento usando preco, disponibilidade e
   embalagem/divisor.
4. O operador decide por item: comprar, nao comprar ou revisar.
5. Ao fechar, o Nexo cria `purchase_orders` e `purchase_order_items`.

## Memoria preservada

O pedido preserva tres camadas:

- Quantidade sugerida pelo motor.
- Quantidade solicitada na cotacao.
- Quantidade final comprada.

Isso permite, no futuro, comparar sugestao, resposta, compra real, entrada no
ERP e recebimento fisico.

## Pedido minimo

O fechamento calcula se o valor final atingiu o pedido minimo cadastrado do
fornecedor. Quando nao atinge, a interface sinaliza o risco, mas ainda permite
fechar. Essa escolha e intencional: em pequenos varejos, as excecoes reais
precisam ser registradas em vez de bloqueadas artificialmente.

## Canonicalidade

Pedido de compra e dado canonico do Nexo. Ele nao vem do ERP: nasce de uma
decisao manual do gestor dentro da mesa de compras. Futuramente, quando o ERP
importar entradas ou notas, o Nexo vai reconciliar o pedido esperado com o que
realmente entrou.
