# Pedido de Compra Canonico

## Objetivo

Transformar uma cotacao respondida em uma decisao operacional fechada: o que
sera comprado, em qual quantidade e com qual fornecedor.

## Fluxo

1. O Nexo sugere reposicao e gera cotacao.
2. O operador envia a lista de itens e quantidades ao fornecedor. Esse envio
   nao cria pedido nem estoque projetado, mas aparece na fila de Pedidos como
   pendencia de confirmacao do fornecedor.
3. O operador registra a resposta do fornecedor: disponibilidade, quantidade
   confirmada, prazo e observacoes. Preco informado pelo fornecedor nao e parte
   desse fluxo; o valor sera atualizado quando a entrada chegar pelo ERP.
4. Com a resposta valida registrada, o Nexo gera e aprova o pedido a partir dos
   itens confirmados. A partir dai o pedido passa a entrar no estoque projetado.
5. O proximo passo operacional do pedido aprovado e registrar a chegada.

## Memoria preservada

O pedido preserva tres camadas:

- Quantidade sugerida pelo motor.
- Quantidade solicitada na cotacao.
- Quantidade confirmada pelo fornecedor.
- Quantidade final comprada.

Isso permite, no futuro, comparar sugestao, resposta, compra real, entrada no
ERP e recebimento fisico.

Na montagem do pedido, o rascunho tambem pode preservar ajustes operacionais
por item:

- Unidade de compra usada com o fornecedor, como unidade, caixa, fardo ou saco.
- Quantidade de unidades por embalagem de compra.
- Cobertura desejada do item quando existir no rascunho, sem gravar parametro no produto.

Esses ajustes pertencem ao rascunho/pedido do Nexo. Eles ajudam a operar a
compra sem alterar automaticamente o cadastro importado do ERP.

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
