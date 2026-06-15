# Inteligencia Comercial

Esta frente transforma o historico importado em acoes comerciais pequenas,
claras e acionaveis. O objetivo inicial nao e criar uma central de CRM pesada,
mas dar ao vendedor uma carteira estruturada, uma ficha viva do cliente e sinais
claros de receita recuperavel ou mudanca de ritmo.

## Primeira versao implementada

- Clientes em risco.
- Clientes com recompra provavel.
- Produtos ganhando ou perdendo ritmo.
- Marcas ganhando ou perdendo ritmo.
- Explicacao curta do motivo de cada leitura.
- Ficha CRM do cliente, com cadastro, cadencia, mix de produtos, servicos,
  categorias, serie mensal e ultimas compras.
- Perfil CRM manual do cliente, com responsavel, status comercial, prioridade,
  proxima acao, data de retorno, tags e observacao interna.
- Catalogo negociado por cliente, dentro da ficha CRM, com produtos do
  historico recorrente ou do cadastro geral mesmo que o cliente nunca tenha
  comprado o item.
- Pedido de venda em PDF a partir dos itens negociados ou de produtos avulsos
  do cadastro, para envio ao financeiro e lancamento manual no sistema da loja.

## Como o calculo funciona

O app usa a data mais recente da propria base importada, e nao a data atual do
computador. Isso evita distorcer uma base historica exportada em outro momento.

Para clientes, o Nexo agrupa vendas de produtos e servicos por cliente e dia.
Depois calcula:

- primeira compra;
- ultima compra;
- quantidade de dias com compra;
- receita total;
- ticket medio;
- intervalo medio entre compras;
- dias desde a ultima compra;
- proxima compra estimada.

A ficha do cliente reaproveita essa base e detalha:

- dados cadastrais importados;
- receita de produtos e servicos;
- mix principal e categorias compradas;
- servicos comprados;
- serie mensal de compras;
- ultimos movimentos importados.

O perfil CRM manual grava o contexto que nao vem do ERP. Ele fica na ficha do
cliente e tambem volta para a carteira comercial como colunas de trabalho:

- responsavel comercial;
- status (`Ativo`, `Acompanhar`, `Negociando`, `Risco` ou `Inativo`);
- prioridade;
- proxima acao;
- data da acao;
- tags;
- observacao interna.

O catalogo do cliente grava estado proprio do app. Cada cliente ganha um
catalogo padrao com itens negociados, status, preco especial, desconto,
quantidade minima, embalagem, validade, observacao comercial e foto principal do
produto quando cadastrada. O vendedor pode adicionar:

- item sugerido pelo historico recorrente do cliente;
- item buscado no cadastro geral de produtos, inclusive sem compra anterior;
- foto do produto para uso comercial no catalogo exportavel.

Na primeira versao, a exportacao acontece por uma visualizacao imprimivel/PDF do
navegador a partir da propria ficha, usando as fotos ja cadastradas.

O pedido de venda em PDF e uma saida operacional do catalogo, nao uma venda
fiscal. O vendedor marca itens negociados, pode adicionar qualquer produto
avulso do cadastro, informa quantidades e baixa um PDF com cliente, vendedor,
itens, quantidades, preco usado e total. O financeiro confere e lanca
manualmente no sistema da loja.

Um cliente vira `em risco` quando passou da cadencia esperada. Um cliente vira
`recompra proxima` quando esta perto da janela normal de nova compra.

Para produtos e marcas, o Nexo compara os ultimos 90 dias da base contra os 90
dias anteriores.

## Principio de UX

A tela deve permitir que o vendedor trabalhe a carteira sem sair de Clientes:

- recuperar 1 cliente em risco;
- contatar 1 cliente com recompra provavel;
- investigar 1 produto em queda.
- abrir a ficha do cliente antes do contato.
- ajustar responsavel, status, prioridade e proxima acao dentro da ficha.
- montar e revisar o catalogo negociado do cliente sem sair da ficha.
- gerar pedido de venda em PDF para o financeiro sem sair do catalogo.

Isso segue a tese de implantacao do produto: entregar valor com os dados atuais
e pedir mais informacao apenas quando ela desbloqueia uma melhoria visivel.

## Proximos desbloqueios

- Evoluir a proxima acao do perfil para agenda/linha do tempo com conclusao.
- Criar lembretes operacionais e fila por vendedor.
- Recomendar mix provavel por cliente a partir das lacunas do catalogo.
- Detectar lacunas: cliente compra categoria A, mas nunca compra categoria B.
- Medir recuperacao depois da acao.
- Transformar bons resultados em trilhas operacionais recorrentes.
