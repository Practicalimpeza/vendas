# Fluxo de Cotacoes

Cotacao e a primeira acao operacional depois do motor de reposicao.

O NexoVarejo nao deve chamar esse artefato de pedido de compra. Nesta etapa o
gestor ainda esta perguntando ao fornecedor disponibilidade, quantidade atendida,
prazo de entrega e observacoes. O custo sera atualizado depois pela entrada no
ERP.

## Fluxo atual

1. O motor de reposicao calcula necessidade tecnica, decisao de compra e
   quantidade sugerida por item.
2. A mesa agrupa os itens por fornecedor e calcula uma cesta recomendada para
   minimo/valor alvo quando isso for seguro.
3. O gestor abre o fornecedor, revisa essenciais, candidatos de cesta, caixas,
   pedidos em aberto e itens fora do mix.
4. O gestor monta uma cotacao local com quantidades solicitadas.
5. A cotacao salva snapshot dos itens e quantidades daquele momento.
6. A cotacao pode ser marcada como enviada, mas isso nao cria pedido de compra.
7. Quando o fornecedor responde, o gestor registra disponibilidade, quantidade
   confirmada, prazo e observacoes por item.
8. So depois da resposta o sistema gera o pedido em revisao, com os itens
   confirmados, para projetar estoque.

## Codigo usado na cotacao

Nos artefatos que vao para o fornecedor, como PDF, mensagem copiada e tela de
registro de resposta, o item deve usar a referencia do fornecedor
(`supplier_reference`). O codigo interno do ERP nao deve aparecer como fallback
nesses pontos, para evitar confusao operacional.

Quando a referencia ainda nao existe, a resposta do fornecedor e o melhor
momento para preenche-la: o campo fica editavel no modal de resposta e atualiza
o cadastro operacional do produto.

Referencias sao normalizadas removendo zeros antes do primeiro numero util.
Exemplos: `000123` vira `123` e `ABC000123` vira `ABC123`.

## Estados

- `draft`: rascunho local gerado;
- `sent`: cotacao marcada como enviada;
- `responded`: fornecedor respondeu, mas ainda sem pedido gerado em fluxos
  legados/manuais;
- `approved`: resposta valida registrada e pedido aprovado para recebimento;
- `cancelled`: cotacao cancelada.

Marcar como enviada apenas atualiza o estado local. Nao envia WhatsApp, email ou
qualquer mensagem externa e nao gera pedido de compra.

Registrar uma resposta valida do fornecedor cria e aprova o pedido; o proximo
passo esperado na fila de Pedidos e registrar chegada.

## Cesta recomendada

A cotacao por fornecedor separa:

- essenciais: ruptura ou ponto de pedido atingido;
- cesta para minimo: itens seguros escolhidos para completar minimo/valor alvo;
- candidatos manuais: ajudam no minimo, mas exigem decisao;
- aguardar: estoque, pedido aberto, excesso, baixa demanda ou fora do mix.

O botao `Completar cesta` adiciona itens essenciais e apenas os complementos
selecionados pela cesta deterministica. Ele nao usa itens lentos ou caixas
pesadas para completar minimo automaticamente.

## Proximas evolucoes

- editar quantidades antes de gerar o rascunho;
- remover item da cotacao;
- aprovar cotacao para virar pedido de compra;
- gerar link ou mensagem WhatsApp com confirmacao explicita do usuario antes do
  envio externo;
- backtesting historico da formula de compra por fornecedor.
