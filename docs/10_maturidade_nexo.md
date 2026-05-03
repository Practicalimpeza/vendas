# Maturidade Nexo

A Maturidade Nexo e a camada que mostra ao lojista que o sistema esta aprendendo
a operacao dele.

Ela nao deve ser gamificacao vazia. Cada progresso precisa corresponder a uma
capacidade operacional real:

- dados importados e entendidos;
- fornecedor por marca configurado;
- pedido minimo do fornecedor piloto configurado;
- referencia de fornecedor reconhecida;
- cotacao por fornecedor desbloqueada;
- cotacoes registradas;
- prazos, respostas e recebimentos aprendidos com o uso;
- analises mais sofisticadas liberadas conforme a base melhora.

## Principio

O produto deve entregar valor com dados incompletos, mas explicar o que fica
melhor quando o lojista alimenta mais informacoes.

O ciclo esperado e:

```text
acao do lojista -> dado novo -> inteligencia nova -> insight novo -> proxima acao
```

## Tres blocos de experiencia

Antes dos blocos amplos, a UX deve sempre mostrar um foco pequeno e executavel.
Empresas em implantacao nao devem receber uma lista enorme de coisas para
corrigir. O produto deve dizer:

- o que ja da para fazer com os dados atuais;
- qual pequena acao destrava valor agora;
- qual e o ganho imediato;
- o que pode ficar para depois.

Exemplo: se 95 fornecedores aparecem prontos para cotacao, a interface nao deve
pedir para configurar todos. Deve sugerir uma cotacao piloto para 1 fornecedor e
pedir apenas os dados necessarios para esse ciclo.

Um dos primeiros dados operacionais de maior impacto e o pedido minimo do
fornecedor. Mesmo quando fornecedores foram inferidos por marca, o sistema pode
pedir esse valor para o fornecedor piloto. Isso ajuda a decidir se a sugestao ja
tem volume suficiente para cotar ou se faz sentido esperar juntar mais itens do
mix.

Mas essa nao deve ser a unica trilha. Alguns lojistas vao perceber valor primeiro
em agrupar quais marcas compram de cada fornecedor real. Outros vao preferir
cotar antes e descobrir na resposta do fornecedor dados como divisor, caixa e
embalagem. Exemplo: o lojista pede `31 un de limpador 1L` e o fornecedor responde
que vende em caixa `12x1L`. O sistema deve conseguir aprender isso pela rotina,
sem exigir que tudo esteja cadastrado antes da primeira cotacao.

Assim, os primeiros caminhos validos sao:

- agrupar marcas por fornecedor real;
- informar pedido minimo do fornecedor piloto;
- gerar uma cotacao piloto e aprender divisor/embalagem pela resposta.

### Desbloqueado

Mostra o que o Nexo ja consegue fazer agora.

Exemplos:

- leitura operacional importada;
- cotacao por fornecedor desbloqueada;
- referencia de fornecedor reconhecida;
- historico suficiente para tendencia.

### Melhorou com uso

Mostra evolucoes causadas por acoes reais do lojista.

Exemplos futuros:

- cotacoes registradas;
- fornecedores com prazo real medido;
- comparacao entre sugerido, cotado e comprado;
- acuracia de reposicao por fornecedor.

### Proximo desbloqueio

Mostra o proximo passo com maior impacto.

Exemplos:

- cadastrar pedido minimo do fornecedor piloto;
- preencher telefone do fornecedor piloto;
- agrupar marcas por fornecedor real;
- configurar embalagem de compra dos produtos A;
- aumentar cobertura de referencias de fornecedor;
- registrar primeira cotacao real;
- marcar chegada dos pedidos para liberar lead time real.

## Direcao de produto

A tela inicial deve ser a mesa de decisao e tambem o espelho da maturidade da
empresa no Nexo.

O lojista precisa sentir:

- o sistema ja entendeu uma parte da empresa;
- essa parte ja gera acao;
- cada ajuste melhora o proximo calculo;
- o produto fica mais valioso com o uso.

## Linguagem visual de confianca

O app deve deixar claro quando um dado e inferido, confirmado manualmente ou
ausente.

Regra inicial:

- dado importado/canonico do ERP: somente leitura, cor padrao;
- dado operacional confirmado manualmente no Nexo: texto padrao, tinta preta;
- dado inferido com confianca media/baixa: cor de atencao e etiqueta visivel;
- dado ausente: cor de risco e proxima acao sugerida.

Exemplo: fornecedor criado automaticamente a partir da marca aparece como
`Inferido pela marca`. Quando o usuario salva/confirma o fornecedor, passa a
`Confirmado no Nexo` e volta para a cor padrao.

## Primeira implementacao

O endpoint `/api/intelligence/maturity` calcula:

- score de maturidade;
- nivel atual;
- metricas de cobertura;
- capacidades desbloqueadas;
- melhorias geradas pelo uso;
- proximos desbloqueios.

O Painel exibe essa leitura como uma area chamada `Evolucao da inteligencia`.
