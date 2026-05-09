# Implantacao em Novos Comercios

Este documento define como o NexoVarejo deve ser implantado em novos varejos sem
virar um projeto artesanal para cada cliente.

## Objetivo da implantacao

Colocar uma empresa nova em operacao rapidamente, mesmo que ela use outro ERP,
desde que consiga exportar dados minimos de produtos, estoque, vendas, clientes e
custos.

A implantacao deve entregar valor em camadas:

1. leitura confiavel dos dados;
2. painel inicial de desempenho;
3. pendencias cadastrais;
4. sugestoes de compra e estoque;
5. rotinas recorrentes de gestao.

## Principio

O cliente pode ter um ERP diferente. O NexoVarejo nao deve ter uma logica de
negocio diferente para cada ERP.

O ERP continua sendo dono dos dados importados e dos dados extrapolados a partir
das planilhas. O NexoVarejo e dono apenas da camada operacional criada sobre
esses dados. Isso precisa ser explicado ao cliente na implantacao: se produto,
cliente, servico, venda, custo, preco, estoque ou inferencia calculada esta
errada, a correcao deve acontecer no ERP, na exportacao, ou na regra de
importacao. Se a decisao e operacional, como fornecedor preferencial, embalagem,
cobertura alvo, bloqueio de compra ou observacao interna, a correcao e feita no
NexoVarejo.

Cada novo comercio passa por:

- diagnostico da origem;
- criacao ou ajuste de conector;
- carga para o modelo canonico;
- validacao dos totais;
- configuracao operacional;
- entrega do primeiro dashboard;
- acompanhamento da primeira rotina de compras.

## Fases da implantacao

### 1. Diagnostico comercial e operacional

Entender o negocio antes dos dados:

- segmento do varejo;
- numero de lojas;
- numero aproximado de SKUs;
- quantidade de fornecedores;
- ciclo de compra;
- principais categorias;
- se vende produtos, servicos ou ambos;
- quem decide compras;
- quais relatorios o gestor ja usa;
- onde hoje esta a dor: falta, excesso, margem, cliente, fornecedor ou tempo.

Resultado esperado:

- perfil da empresa;
- objetivos da implantacao;
- metricas prioritarias;
- lista de dados necessarios.

### 2. Coleta das exportacoes

Pedir ao cliente exportacoes preferencialmente em CSV ou XLSX:

- cadastro de produtos;
- estoque atual;
- precos de venda;
- custos;
- vendas de produtos;
- vendas de servicos, se houver;
- clientes;
- fornecedores;
- compras ou notas de entrada, se disponivel;
- categorias, marcas e grupos.

Para a beta, se fornecedores e compras nao existirem na exportacao, o sistema
deve aceitar cadastro manual e inferencia por marca.

Atalho operacional: toda marca pode nascer com um fornecedor de mesmo nome. Na
primeira rotina de compra, o implantador ou gestor ajusta apenas o nome real do
fornecedor e o telefone de contato. Isso e suficiente para agrupar sugestoes de
pedido por fornecedor e prepara o caminho para cotacao via WhatsApp.

Resultado esperado:

- pasta de origem por cliente;
- arquivos preservados sem edicao manual;
- periodo coberto por cada arquivo;
- observacoes do ERP e formato.

### 3. Perfilamento tecnico dos arquivos

Antes de criar dashboard, o sistema deve gerar um diagnostico automatico:

- encoding;
- delimitador;
- cabecalho real;
- linhas de metadado;
- rodapes;
- numero de linhas validas;
- colunas reconhecidas;
- colunas desconhecidas;
- tipos provaveis;
- intervalo de datas;
- totais detectados;
- amostras de valores estranhos.

Resultado esperado:

- relatorio de qualidade do lote;
- proposta de mapeamento para o conector;
- lista de bloqueios.

No MVP atual, `/api/imports` retorna um bloco `quality` com o diagnostico do
ultimo lote: confianca, linhas lidas, linhas mapeadas, linhas sem mapeamento,
issues, conflitos manuais, mudancas pendentes e proximo passo recomendado. Esse
bloco deve ser usado como semaforo da beta assistida antes de apresentar
reposicao, cotacao ou margem como rotina confiavel.

### 4. Mapeamento para o modelo canonico

Cada origem deve virar um arquivo de mapeamento semelhante a
`mappings/practica_csv.yml`.

O mapeamento deve declarar:

- arquivos esperados;
- entidades canonicas alimentadas por cada arquivo;
- colunas por nome normalizado ou por posicao;
- conversores de data e numero;
- linhas a ignorar;
- checks de reconciliacao;
- campos ausentes que exigem cadastro manual.

Resultado esperado:

- conector reprodutivel;
- testes com amostras pequenas;
- carga canonica sem edicao manual da planilha.

### 5. Reconciliacao e confianca

A primeira carga so deve ser considerada boa quando bater com a origem em pontos
importantes:

- total de vendas de produtos;
- total de vendas de servicos;
- quantidade vendida;
- estoque total, quando houver referencia;
- numero de produtos;
- numero de clientes;
- totais de imposto, custo ou lucro, quando a origem trouxer.

Se nao bater, o sistema deve mostrar:

- diferenca absoluta;
- diferenca percentual;
- linhas descartadas;
- motivo provavel.

Resultado esperado:

- lote aprovado;
- lote aprovado com ressalvas;
- ou lote bloqueado.

Para a beta, a aprovacao pratica do lote deve seguir:

- **pronto**: lote concluido, sem erros, sem conflitos manuais pendentes e sem
  linhas uteis fora do mapeamento;
- **com ressalvas**: lote concluido, mas com avisos, mudancas de origem ou
  campos de confianca incompletos;
- **bloqueado**: lote incompleto, com erro, vazio ou com conflito manual
  pendente.

### 6. Configuracao operacional

Depois da carga, o cliente precisa completar informacoes que o ERP nem sempre
exporta bem:

- fornecedor preferencial por produto, marca ou categoria;
- telefone de contato do fornecedor para cotacao;
- prazo medio por fornecedor;
- pedido minimo;
- valor alvo para melhor condicao comercial;
- embalagem de compra: caixa, fardo, saco, pacote;
- quantidade por embalagem;
- cobertura alvo por categoria ou produto;
- produtos bloqueados para compra;
- produtos ignorados em relatorios;
- categorias e subcategorias;
- produtos com vencimento;
- contatos e observacoes de fornecedor.

O app deve transformar isso em uma fila de implantacao, nao em uma tela vazia.

Resultado esperado:

- porcentagem de produtos configurados;
- marcas sem fornecedor;
- produtos A sem regra de compra;
- fornecedores sem prazo ou minimo;
- pendencias priorizadas.

### 7. Primeiro valor entregue

O primeiro dashboard de um cliente novo deve responder:

- quanto vendeu no periodo;
- quais produtos sustentam o faturamento;
- quais produtos estao parados;
- onde ha risco de falta;
- onde ha excesso;
- quem sao os principais clientes;
- quais clientes sumiram;
- quais fornecedores/marcas exigem acao;
- quais cadastros precisam ser completados para melhorar as sugestoes.

O objetivo nao e mostrar tudo no primeiro dia. O objetivo e fazer o gestor confiar
que os dados foram entendidos.

Antes da primeira rotina, o implantador deve abrir a tela de importacao e
confirmar:

- confianca do lote e status do diagnostico;
- linhas lidas versus linhas mapeadas;
- conflitos ERP/manual resolvidos explicitamente;
- issues e mudancas pendentes justificadas;
- blocos essenciais cobertos: produtos, estoque, preco, custo e vendas.

### 8. Primeira rotina recorrente

A implantacao deve terminar com uma rotina concreta:

- revisar alertas;
- abrir sugestao de compras;
- ajustar quantidades;
- aprovar pedido por fornecedor;
- registrar pedido enviado;
- registrar chegada;
- comparar sugerido versus recebido.

Isso transforma o NexoVarejo de relatorio em ferramenta de trabalho.

## Niveis de maturidade da implantacao

### Nivel 1 - Leitura

- produtos;
- estoque;
- vendas;
- clientes;
- dashboard e ABC.

### Nivel 2 - Compra assistida

- fornecedores;
- embalagem;
- cobertura alvo;
- sugestao de compra;
- pedidos em aberto.

### Nivel 3 - Gestao recorrente

- historico de pedidos;
- chegada de mercadoria;
- auditoria;
- alertas;
- clientes em risco;
- margem e preco.

### Nivel 4 - Inteligencia

- previsao de demanda;
- sazonalidade;
- recomendacao de mix;
- simulacoes;
- comparativos entre lojas;
- benchmark interno.

## Produto interno necessario

Para implantar bem muitos clientes, o NexoVarejo precisa de ferramentas internas:

- tela de diagnostico de lote;
- editor de mapeamento de colunas;
- biblioteca de conectores por ERP;
- suite de testes por conector;
- visualizador de reconciliacao;
- fila de pendencias cadastrais;
- painel de saude da implantacao;
- logs e auditoria de importacao.

## Dados minimos para vender a beta

Um comercio pode entrar na beta se conseguir fornecer:

- produtos;
- estoque atual;
- vendas de pelo menos 6 meses;
- preco de venda;
- algum custo ou relatorio de margem;
- clientes ou pelo menos identificador de cliente nas vendas.

Com menos que isso, o produto ainda pode gerar leitura parcial, mas nao deve
prometer compra assistida confiavel.

## Riscos de implantacao

- ERP exporta relatorios visuais, nao dados tabulares.
- Cliente edita planilha antes de enviar.
- Produtos duplicados ou codigos reutilizados.
- Clientes genericos dominam as vendas.
- Fornecedores nao aparecem em lugar nenhum.
- Custo esta desatualizado.
- Estoque atual nao bate com realidade.
- Vendas incluem devolucoes, bonificacoes ou movimentos internos misturados.
- Unidade de venda e unidade de compra sao diferentes.

## Como reduzir trabalho manual

- Criar conectores por ERP, nao por cliente.
- Reaproveitar mapeamentos quando o mesmo ERP aparecer.
- Ter checks automaticos antes de qualquer dashboard.
- Mostrar pendencias para o cliente completar dentro do app.
- Permitir regras em lote por marca, categoria e fornecedor.
- Guardar todo ajuste como aprendizado do conector ou da empresa.
