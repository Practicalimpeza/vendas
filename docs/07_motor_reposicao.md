# Motor de Reposicao

O motor de reposicao e o coracao operacional do NexoVarejo. Ele transforma dados
importados do ERP em uma recomendacao de compra explicavel, auditavel e
ajustavel por configuracoes operacionais.

## Principios

- Nao altera dados do ERP.
- Usa dados historicos importados e configuracoes operacionais do Nexo.
- Separa calculo, status, prioridade e explicacao.
- Evita comprar apenas por media simples.
- Trata produtos A, B e C de forma diferente.
- Considera variabilidade, tendencia e demanda intermitente.
- Arredonda sugestoes por embalagem de compra.
- Mostra quando a recomendacao depende de dados incompletos.

## Entradas

Dados importados:

- vendas por produto e data;
- estoque atual, lido pelo snapshot mais recente por produto e loja;
- pedidos de compra em aberto, considerando saldo ainda nao recebido;
- custo atual, lido pelo snapshot mais recente por produto;
- preco de venda, lido pelo snapshot mais recente por produto;
- cadastro de produto;
- referencia do fornecedor quando existir;
- marca e unidade quando existirem.

Configuracoes operacionais:

- fornecedor por marca;
- telefone/WhatsApp do fornecedor;
- prazo medio do fornecedor;
- pedido minimo do fornecedor;
- valor alvo de pedido do fornecedor;
- dificuldade/cadencia de formar pedido por fornecedor;
- embalagem de compra;
- horizonte calculado pelo motor;
- estoque minimo;
- estoque maximo;
- bloqueio de compra;
- ignorar em relatorios de compra.

## Calculos principais

### Demanda

O motor calcula demanda em varias janelas:

- 30 dias;
- 60 dias;
- 90 dias;
- 180 dias;
- 365 dias;
- periodo completo observado.

A demanda prevista usa uma media ponderada que da mais peso ao periodo recente,
mas ainda preserva historico longo para evitar reacao exagerada a poucos dias.

### Tendencia

Compara demanda recente contra demanda anual. Produtos acelerando recebem um
pequeno aumento controlado na previsao; produtos desacelerando recebem reducao
controlada. O ajuste e limitado para evitar saltos artificiais.

### Variabilidade

Calcula desvio da demanda diaria nos ultimos 180 dias. Isso entra no estoque de
seguranca. Quanto mais variavel o consumo, maior a protecao.

### Demanda intermitente

Produtos com poucas datas de venda recentes sao tratados como intermitentes. O
motor reduz o peso do estoque de seguranca para nao sugerir compras agressivas
com base em poucos eventos.

### ABC

Produtos sao classificados por participacao na receita:

- A: ate 80% acumulado;
- B: ate 95% acumulado;
- C: restante.

Essa classe influencia cobertura e nivel de seguranca.

### Ponto de pedido

Formula conceitual:

```text
ponto_de_pedido =
  demanda_prevista_diaria * (prazo_fornecedor + ciclo_revisao_fornecedor)
  + estoque_seguranca
  + estoque_minimo
```

Se o estoque projetado esta abaixo desse ponto, o produto entra em compra.
O estoque projetado soma o estoque fisico atual com pedidos de compra ainda nao
recebidos nos status `approved`, `sent` e `partial_received`. Quando o pedido
em aberto cobre toda a necessidade calculada, a sugestao fica zerada. Quando
nao cobre, o motor sugere apenas o complemento.

### Alvo de estoque

Formula conceitual:

```text
protecao =
  prazo_fornecedor + ciclo_revisao_fornecedor

cobertura_pos_entrega =
  ciclo_revisao_fornecedor

horizonte_compra =
  prazo_fornecedor + cobertura_pos_entrega

alvo =
  demanda_prevista_diaria * horizonte_compra
  + estoque_seguranca
  + estoque_minimo
```

No motor V2, a cobertura automatica nasce do fornecedor: primeiro o sistema
calcula em quantos dias o fornecedor forma o pedido minimo e soma esse ciclo ao
prazo de entrega. O campo legado de dias de cobertura do produto fica neutro no
modo automatico; o horizonte e calculado pelo motor a partir do fornecedor e do
ciclo natural do item. A sugestao compra ate o horizonte do fornecedor, abatendo
pedidos em aberto e respeitando estoque maximo quando configurado. Pedidos em
aberto aparecem nos dados da linha para explicar a diferenca entre estoque
fisico e estoque projetado.

O intervalo natural do produto continua importante, mas como decisao de entrada
na rodada: uma caixa que cobre muitos dias nao deve entrar em todo pedido do
fornecedor. Quando entra, o arredondamento por embalagem pode fazer a cobertura
depois da compra ficar maior que o ciclo do fornecedor; isso e esperado e fica
auditavel pelos campos `package_coverage_days` e `after_purchase_coverage_days`.

### Arredondamento por embalagem

```text
sugestao = teto(necessidade / embalagem) * embalagem
```

Se embalagem nao estiver configurada, assume 1 unidade.

## Status

| Status | Significado |
| --- | --- |
| `Ruptura iminente` | Estoque nao cobre o prazo medio de reposicao. |
| `Comprar agora` | Estoque abaixo do ponto de pedido. |
| `Monitorar` | Cobertura abaixo do ciclo calculado, mas ainda acima do ponto de pedido. |
| `Estoque ok` | Sem acao imediata. |
| `Excesso` | Estoque acima do consumo projetado e do horizonte calculado. |
| `Sem demanda` | Nao ha demanda suficiente para comprar no periodo analisado; o produto ainda aparece quando existe estoque, custo ou cadastro. |
| `Fora do mix` | Produto sem estoque e sem venda recente; escondido da rotina principal por padrao. |
| `Bloqueado` | Produto bloqueado operacionalmente. |
| `Ignorado` | Produto fora dos relatorios de compra. |

## Fora do mix ativo

Produtos sem estoque e sem venda recente nao devem poluir a rotina principal de
reposicao. Eles continuam no banco, continuam auditaveis e podem ser encontrados
por filtro, mas nao entram como prioridade de compra/cotacao.

Regra inicial:

```text
fora_do_mix = estoque_atual <= 0 e venda_ultimos_180_dias == 0
```

Isso tambem deve orientar marcas: uma marca sem venda e sem estoque relevante
deve aparecer como baixa prioridade na implantacao, para o lojista focar primeiro
no mix que realmente esta vivo.

## Fator fornecedor

Reposicao nao deve olhar so para o produto isolado. Um produto comprado de um
fornecedor facil de fechar pedido pode operar com alvo menor. Um produto de um
fornecedor dificil, que exige pedido minimo alto ou tem poucos itens de giro, deve
ter alvo maior para reduzir risco de ruptura entre pedidos.

Na implantacao inicial, o fornecedor e configurado por marca. Isso reduz muito o
trabalho manual: cada marca nasce apontando para um fornecedor com o mesmo nome,
e o gestor so precisa corrigir o nome do fornecedor e preencher o telefone de
contato quando for montar compras. Produto, marca, preco, custo, estoque e
historico continuam canônicos do ERP/importacao; fornecedor por marca e telefone
sao configuracoes operacionais do Nexo.

Quando uma marca troca de fornecedor no Nexo, o motor passa a agrupar todos os
produtos daquela marca no novo fornecedor. Essa mudanca nao altera o cadastro do
produto importado e nao reescreve a planilha original.

## Codigo interno versus referencia de fornecedor

O `codigo` do produto e tratado como codigo interno da empresa/ERP. Ele identifica
o produto dentro do Nexo e deve aparecer para auditoria, reconciliacao e busca
interna.

Para cotacao, o codigo preferencial e a `referencia`/`ref` do produto, quando a
origem trouxer esse campo. Essa referencia normalmente e o codigo reconhecido
pelo fornecedor. Se nao existir referencia, o sistema pode usar o codigo interno
como fallback, mas deve deixar claro que nao e necessariamente o codigo do
fornecedor.

Prioridade para montar item de cotacao:

1. SKU especifico configurado para fornecedor e produto;
2. referencia importada do produto;
3. codigo interno como fallback identificado.

O motor calcula um perfil de fornecedor:

- valor medio diario de demanda de compra do mix;
- quantidade de SKUs com venda no mix;
- pedido minimo;
- valor alvo para melhor condicao comercial;
- prazo medio;
- dias estimados para formar pedido minimo;
- ciclo de revisao recomendado.

Conceito:

```text
dias_para_formar_pedido =
  pedido_minimo / valor_medio_diario_de_demanda_de_compra_do_mix
```

Classificacao:

- facil: pedido minimo costuma se formar em ate 14 dias;
- normal: entre 15 e 35 dias;
- dificil: acima de 35 dias;
- a configurar: fornecedor ausente ou sem regra suficiente.

Efeito:

- fornecedor define o ciclo de revisao da rodada;
- fornecedor facil/normal nao deixa tags do produto alongarem a compra
  automatica;
- fornecedor dificil aumenta o ciclo porque o minimo demora mais a se formar;
- fornecedor a configurar nao inventa regra e gera sinal de pendencia.

Esse ajuste evita dois erros comuns:

- comprar demais de fornecedor que entrega rapido e fecha pedido toda semana;
- comprar pouco de fornecedor que so fecha pedido de tempos em tempos.

## Cesta do fornecedor

Cotacao nao e apenas a soma de itens isolados. Depois de calcular a necessidade
tecnica por produto, a mesa de compras monta uma cesta por fornecedor:

- itens essenciais entram quando ha ruptura ou ponto de pedido atingido;
- candidatos seguros podem completar minimo quando ha venda recente, caixa
  aceitavel, custo conhecido e baixo risco de excesso;
- candidatos manuais ficam visiveis para decisao do comprador;
- itens com pedido aberto, excesso, sem demanda ou fora do mix nao devem ser
  usados para completar minimo automaticamente.

O objetivo e responder a pergunta operacional: "qual e a melhor cotacao para
este fornecedor hoje?", nao apenas "quanto falta em cada produto?". A cesta
recomendada respeita pedido minimo/valor alvo quando isso for viavel com itens
bons; se o fornecedor tem ciclo muito longo ou risco de excesso, a recomendacao
fica como revisao, acumulacao ou negociacao.

## Prioridade

A prioridade combina:

- status;
- classe ABC;
- receita historica;
- distancia ate o ponto de pedido e o horizonte calculado.

Assim, um produto A em risco sobe acima de um produto C com pequena falta.

## Explicabilidade

Cada linha do motor deve expor os principais componentes da conta:

- demanda diaria usada e quantil escolhido;
- prazo do fornecedor;
- ciclo de revisao do fornecedor;
- intervalo de recompra do item;
- horizonte calculado;
- horizonte final;
- estoque fisico, pedidos em aberto e estoque projetado;
- alvo tecnico, necessidade bruta, arredondamento por embalagem e sugestao;
- decisao de compra e papel na cesta do fornecedor.

## Ruptura com pouca evidência

Quando o produto tem histórico muito curto, poucas datas de venda e estoque
zerado/negativo, o motor nao pode transformar uma venda isolada em ritmo diario
normal. Nesses casos a recomendacao vira compra de descoberta:

- a demanda usa uma janela minima conservadora em vez de `venda / idade`;
- o estoque negativo nao aumenta a quantidade da primeira compra;
- o alvo fica limitado a uma ou duas embalagens, conforme a maior venda
  observada e a embalagem do fornecedor;
- a explicacao deve indicar que a compra e defensiva, nao uma reposicao plena
  ate o horizonte calculado.

## Limitacoes atuais

- Ainda nao considera calendario de entrega por fornecedor.
- Ainda nao calcula sazonalidade por mes de forma explicita.
- Ainda nao sabe rupturas passadas, porque ha apenas snapshot atual de estoque.
- Ainda nao usa compras/notas de entrada como evidência de lead time real.
- Ainda nao diferencia explicitamente, no schema, ciclo automatico de ciclo
  manual. O valor legado `14` continua tratado como fallback para permitir
  ciclo automatico por valor diario do fornecedor.

## Evolucoes planejadas

- Criar configuracao em lote por fornecedor, marca e categoria.
- Enviar cotacao por WhatsApp a partir do telefone do fornecedor.
- Detectar sazonalidade mensal.
- Usar lead time real medido por historico de pedidos.
- Separar no cadastro quando o ciclo foi fixado manualmente pelo operador.
- Backtesting historico para medir ruptura evitada, excesso criado e capital
  empatado pela formula.
