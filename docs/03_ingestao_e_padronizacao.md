# Ingestao e Padronizacao

## Objetivo

Transformar exportacoes heterogeneas de ERP em dados confiaveis no modelo
canonico SQL, sem espalhar excecoes da origem pelo produto.

## Regra central de reimportacao

Dado importado pertence ao ERP. O NexoVarejo nao deve editar manualmente vendas,
estoque, custos, precos, nomes, marcas, clientes, servicos ou qualquer campo que
veio da origem. Quando esses dados mudarem, a correcao deve vir por uma nova
exportacao/importacao do ERP.

Dado extrapolado a partir das planilhas tambem nao deve ser editado manualmente.
Se uma classificacao, inferencia ou normalizacao calculada estiver errada, a
correcao deve acontecer na regra de importacao ou no ERP, nao em uma edicao
pontual no Nexo.

Dado operacional criado no NexoVarejo pertence ao NexoVarejo. Fornecedor
preferencial, embalagem de compra, cobertura alvo, bloqueios de compra,
observacoes internas, **referencia do fornecedor** e demais configuracoes que
nao vieram das planilhas devem continuar iguais depois de novas importacoes.

A coluna `referencia` do CSV `produtocusto` nao e mais importada: os valores
vinham inconsistentes do ERP. A referencia do fornecedor agora e preenchida
manualmente na ficha do produto (web), gravada em
`product_identifiers (identifier_type='supplier_reference', source_system='manual')`.
Re-importar o lote remove apenas os registros antigos com `source_system='practica_csv'`,
preservando o que foi preenchido a mao.

Na pratica:

- importacao cria um novo lote;
- linhas e registros de origem ficam rastreaveis;
- eventos e snapshots importados sao carregados pelo lote;
- configuracoes operacionais sao lidas por chave canonica e nao substituem campos
  vindos do ERP;
- se um codigo de origem desaparecer em uma nova importacao, o produto pode ficar
  marcado como nao visto no ultimo lote, mas suas configuracoes manuais nao sao
  apagadas.

## Identidade e mudancas de cadastro

Para produtos, a identidade inicial e `organization_id + source_code`. Se o ERP
mandar o mesmo codigo com outro nome:

- tratar como o mesmo produto;
- atualizar o nome bruto importado;
- preservar historico de vendas no mesmo produto;
- registrar a alteracao em `source_entity_changes`;
- nao permitir nome manual alternativo no Nexo;
- gerar alerta quando a mudanca parecer reuso de codigo, nao simples alteracao de
  nome.

Sinais de possivel reuso de codigo:

- nome totalmente diferente;
- codigo de barras diferente;
- marca diferente;
- unidade diferente;
- produto antigo tinha vendas recentes e aparece como item de outra natureza.

Nesses casos o lote pode ser aprovado com ressalva, mas deve criar uma tarefa de
implantacao ou revisao cadastral.

## Pipeline

1. **Receber arquivos**
   - registrar empresa, loja, lote, origem e data de importacao;
   - salvar metadados do arquivo: nome, tamanho, hash, tipo e encoding detectado.

2. **Ler em staging**
   - preservar linha bruta;
   - normalizar quebras de linha e encoding;
   - identificar cabecalho real, linhas de metadado e rodapes;
   - guardar problemas sem interromper tudo.

3. **Mapear colunas**
   - aplicar mapeamento especifico do conector;
   - normalizar cabecalhos para `snake_case`;
   - converter datas, numeros, codigos e textos.

4. **Validar contrato**
   - campos obrigatorios por entidade;
   - datas plausiveis;
   - numeros nao negativos quando fizer sentido;
   - codigos de produto existentes ou criaveis;
   - duplicidades.

5. **Carregar canonico**
   - upsert de cadastros;
   - insert de eventos e snapshots;
   - reconciliacao de totais quando a origem trouxer rodape;
   - registro de issues e resumo do lote.
   - preservar configuracoes operacionais ja existentes.

6. **Publicar analises**
   - atualizar metricas, dashboards e recomendacoes;
   - apontar pendencias de implantacao: fornecedor ausente, categoria ausente,
     unidade desconhecida, cliente generico, produto sem custo.

## Conector por ERP

Cada ERP deve ter um conector com:

- lista de arquivos esperados;
- regras de cabecalho e rodape;
- mapa de colunas de origem para campos canonicos;
- conversores de datas e numeros;
- validacoes especificas;
- testes com amostras pequenas.

O primeiro mapeamento explicito esta em `mappings/practica_csv.yml`.

## Tratamentos obrigatorios vistos na base exemplo

- Datas em serial do Excel: `45383` = 2024-04-01.
- CSVs com rodape: linhas `TOTAL` e `Page -1 of 1` devem ser descartadas das
  transacoes.
- `saidaprod__Sheet1.csv` tem cabecalho deslocado: a descricao do produto aparece
  sob o cabecalho `DATA`.
- `servico__Sheet1.csv` tem uma primeira linha de metadados antes do cabecalho.
- Totais de rodape com `868.594,46` sem aspas podem quebrar parsers CSV
  convencionais e devem ser tratados como linhas de resumo, nao como transacao.

## Regras de qualidade de dados

Classificar issues em:

- `error`: impede carregar uma entidade critica.
- `warning`: carrega, mas exige revisao.
- `info`: observacao util para auditoria.

Exemplos:

- produto vendido sem cadastro atual;
- produto sem custo;
- produto com nome alterado na origem;
- possivel reuso de codigo de produto;
- cliente sem codigo;
- fornecedor ausente;
- data fora do periodo esperado;
- quantidade negativa;
- total da origem diferente do total importado;
- marca nova sem fornecedor preferencial.

## Contrato minimo para beta

Para a primeira beta, cada importacao deve conseguir gerar:

- produtos;
- marcas;
- estoque atual;
- custos atuais;
- precos atuais;
- vendas de produtos;
- vendas de servicos;
- clientes;
- relatorio de lucro por produto, quando disponivel;
- lista de pendencias cadastrais.
