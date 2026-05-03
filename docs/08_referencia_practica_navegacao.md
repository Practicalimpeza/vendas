# Referencia Practica: Navegacao e Usabilidade

Este documento registra o que foi observado no app local da Practica em
`http://127.0.0.1:8765/`.

Importante: esta referencia nao e uma especificacao fechada para o NexoVarejo.
Ela serve para preservar o que parecia bom em navegacao, ritmo de trabalho e
usabilidade. Modulos, metricas, textos, prioridades e fluxos continuam abertos
para redesenho.

## O que vale preservar

### Mesa de trabalho, nao relatorio solto

O app antigo tentava organizar a rotina do gestor em uma mesa de decisao:

- leitura executiva no inicio;
- atalhos para comprar, evitar ruptura, ver pendencias e clientes;
- listas acionaveis, nao apenas graficos;
- fluxo natural de sair de um alerta e chegar em uma tela de acao.

Para o NexoVarejo, isso e central: a primeira tela deve dizer o que merece
atenção hoje e abrir caminho direto para a acao.

### Navegacao principal simples

A estrutura observada tinha 7 grandes areas:

- Inicio;
- Produtos;
- Fornecedores;
- Clientes;
- Compras;
- Analise;
- Historico.

Essa organizacao parece um bom ponto de partida porque separa bem:

- entidades operacionais;
- rotina de compra/cotacao;
- analises;
- auditoria/historico.

### Subabas por contexto

Cada area tinha subabas. Isso evita uma barra lateral gigante e permite que o
gestor pense por contexto.

Referencia observada:

- Produtos: Lista, Scanner EAN, Sem codigo de barras, Ficha do produto.
- Fornecedores: Lista, OTIF e lead time, Ficha do fornecedor.
- Clientes: Ranking, Segmentos RFM, Por categoria, Ficha do cliente.
- Compras: Por fornecedor, Cotacoes enviadas, Pedidos confirmados, Alertas.
- Analise: Curva ABC, Previsao, Sazonalidade, Indicadores.
- Historico: Controle diario.

No NexoVarejo, devemos manter a ideia de subabas, mas nao necessariamente todas
as telas.

### Fluxo de compra por fornecedor

O ponto mais importante para o proximo ciclo e a area de Compras.

O app antigo ja separava:

- escolher fornecedor;
- revisar itens do fornecedor;
- gerar cotacao;
- acompanhar cotacoes enviadas;
- acompanhar pedidos confirmados;
- marcar chegada/cancelamento.

Para o produto novo, o nome correto do primeiro artefato deve ser pedido de
cotacao. Pedido de compra so nasce depois da cotacao aprovada.

### Fichas acionaveis

O app antigo tinha a ideia de fichas:

- ficha do produto;
- ficha do fornecedor;
- ficha do cliente.

Isso e forte para usabilidade porque permite sair de uma lista para uma pagina
de decisao completa. No NexoVarejo, as fichas devem separar claramente:

- dados canonicos importados do ERP, somente leitura;
- configuracoes operacionais do Nexo, editaveis;
- historico e explicacoes calculadas, somente leitura.

## O que nao deve ser copiado automaticamente

- Nem toda metrica antiga precisa ficar.
- Nem toda tela precisa existir no MVP.
- Textos e nomes podem mudar.
- O fluxo deve ser redesenhavel para multiempresa.
- O app novo deve ser menos preso a dados e regras especificas da Practica.
- O que for importado/extrapolado do ERP continua nao editavel manualmente.

## Direcao recomendada para o NexoVarejo

### Navegacao alvo inicial

Para o MVP, uma estrutura enxuta seria:

1. Inicio
2. Produtos
3. Fornecedores
4. Cotacoes
5. Clientes
6. Analise
7. Importacao/Historico

Cotacoes pode substituir "Compras" no inicio, porque o fluxo atual que queremos
construir e pedir cotacao ao fornecedor. Mais tarde, quando houver confirmacao e
recebimento, podemos abrir "Compras" como etapa posterior.

### Fluxo prioritario

O proximo fluxo deve ser:

1. motor de reposicao sugere itens;
2. sistema agrupa por fornecedor;
3. gestor escolhe um fornecedor;
4. gestor revisa itens e quantidades;
5. sistema gera pedido de cotacao;
6. cotacao usa referencia do fornecedor quando existir;
7. gestor copia/envia por WhatsApp futuramente;
8. resposta do fornecedor vira cotacao respondida;
9. cotacao aprovada vira pedido de compra.

### Contrato de usabilidade

Cada tela importante deve responder:

- O que exige acao agora?
- Qual e o impacto financeiro?
- Qual fornecedor/produto/cliente esta envolvido?
- O que veio do ERP e nao posso editar?
- O que e configuracao operacional e posso editar?
- Qual e o proximo botao natural?

