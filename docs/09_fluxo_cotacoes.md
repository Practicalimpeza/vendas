# Fluxo de Cotacoes

Cotacao e a primeira acao operacional depois do motor de reposicao.

O NexoVarejo nao deve chamar esse artefato de pedido de compra. Nesta etapa o
gestor ainda esta perguntando ao fornecedor preco, disponibilidade, prazo de
entrega e validade da condicao.

## Fluxo MVP

1. O motor de reposicao calcula itens em `Ruptura iminente` e `Comprar agora`.
2. O sistema filtra itens com fornecedor configurado e quantidade sugerida maior
   que zero.
3. Os itens sao agrupados por fornecedor.
4. O gestor gera uma cotacao local para o fornecedor.
5. A cotacao salva snapshot dos itens e quantidades daquele momento.
6. O sistema monta texto pronto para copiar.
7. O envio externo por WhatsApp fica para uma etapa posterior.

## Codigo usado na cotacao

O item da cotacao deve usar a seguinte prioridade:

1. SKU especifico fornecedor/produto, quando existir;
2. referencia do fornecedor importada (`supplier_reference`);
3. codigo interno do ERP como fallback identificado.

No MVP atual, o texto usa `quote_code`, que ja aplica `supplier_reference` antes
do codigo interno.

## Estados

- `draft`: rascunho local gerado;
- `sent`: cotacao marcada como enviada;
- `responded`: fornecedor respondeu;
- `approved`: cotacao aprovada para virar compra;
- `cancelled`: cotacao cancelada.

Marcar como enviada no MVP apenas atualiza o estado local. Nao envia WhatsApp,
email ou qualquer mensagem externa.

## Proximas evolucoes

- editar quantidades antes de gerar o rascunho;
- remover item da cotacao;
- registrar preco cotado, prazo e disponibilidade por item;
- comparar cotado versus custo atual;
- aprovar cotacao para virar pedido de compra;
- gerar link ou mensagem WhatsApp com confirmacao explicita do usuario antes do
  envio externo.

