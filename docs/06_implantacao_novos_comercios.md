# Implantacao em Novos Comercios

Este documento define como o produto deve ser implantado em novos varejos sem
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

O cliente pode ter um ERP diferente. O produto nao deve ter uma logica de
negocio diferente para cada ERP.

O ERP continua sendo dono dos dados importados e dos dados extrapolados a partir
das planilhas. O produto e dono apenas da camada operacional criada sobre
esses dados. Isso precisa ser explicado ao cliente na implantacao: se produto,
cliente, servico, venda, custo, preco, estoque ou inferencia calculada esta
errada, a correcao deve acontecer no ERP, na exportacao, ou na regra de
importacao. Se a decisao e operacional, como fornecedor preferencial, embalagem,
bloqueio de compra ou observacao interna, a correcao e feita no produto.

Cada novo comercio passa por:

- diagnostico da origem;
- criacao ou ajuste de conector;
- carga para o modelo canonico;
- validacao dos totais;
- configuracao operacional;
- entrega do primeiro dashboard;
- acompanhamento da primeira rotina de compras.

## Configuracao white-label da instalacao

Para o modelo comercial com consultores, leia tambem
`24_fluxo_parceiros_distribuicao.md`. Este documento detalha a implantacao
operacional do cliente; o fluxo de plataforma, parceiro, pacote
pre-personalizado e cobranca por cliente ativo fica no doc 24.

A instalacao nao deve depender de nomes fixos da empresa piloto nem exigir
edicao de codigo. A estrutura white-label fica separada em:

- `config/partners/default.json`: parceiro/consultor ativo nesta instalacao,
  incluindo marca do consultor e estado local da futura licenca.
- `config/distribution/default.json`: perfil de pacote pre-personalizado usado
  para aplicar a marca/canal do consultor antes de enviar ao cliente.
- `config/white_label/default.json`: perfil base versionado.
- `config/white_label/clients/*.json`: exemplos ou perfis versionaveis por
  implantacao.
- `web/brand/`: logos e assets publicos da marca.
- `data/tenants/<cliente>/`: pasta operacional isolada por cliente, fora do
  git, com banco, white-label e referencia de importacao.
- `data/local/app_config.json`: override de compatibilidade para execucao sem
  tenant. Nao deve ser o caminho operacional normal.

A camada `scripts/app_config.py` carrega as configuracoes nesta ordem:

1. `config/white_label/default.json`;
2. arquivo informado por `PULSO_CONFIG` ou `NEXOVAREJO_CONFIG`;
3. `data/tenants/<cliente>/app_config.json`, quando `--tenant` for usado;
4. `data/local/app_config.json`, apenas em modo de compatibilidade sem tenant;
5. variaveis de ambiente `PULSO_*` ou aliases legados `NEXOVAREJO_*`.

Os campos principais sao:

- `partner.id`: parceiro/consultor responsavel por este tenant. Quando ausente,
  o sistema assume `default` para compatibilidade.
- `public.app_name`: nome mostrado no app.
- `public.app_subtitle`: subtitulo curto da mesa.
- `public.logo_path`: pode ficar vazio ate a empresa enviar uma logo. No
  onboarding/perfil, esse valor deve ser gerado pelo upload; o usuario nao
  precisa informar caminho.
- `defaults.organization_id`: identificador tecnico quando ainda nao ha
  organizacao cadastrada.
- `defaults.company_name`: nome inicial da empresa.
- `defaults.imported_company_name`: nome usado quando a empresa nasce a partir
  de importacao assistida.
- `defaults.store_name`: nome da primeira loja.
- `defaults.country`: pais padrao no perfil da empresa.

Esses valores sao fallback de implantacao, nao substituem o perfil da empresa.
Depois do primeiro acesso, o cadastro em Perfil da empresa continua sendo a
fonte para documentos, CNPJ/CPF, endereco e rodapes comerciais.

## Parceiro e clientes

Resumo do modelo comercial esperado:

```text
parceiro / consultor
  marca do consultor
  licenca e plano
  clientes
    tenant da empresa A
    tenant da empresa B
```

O parceiro atual fica em `config/partners/default.json`. O iniciador local le
esse arquivo e lista apenas os tenants cujo `partner.id` corresponde ao parceiro
ativo.

No modelo principal, cada cliente final tera sua propria instalacao local. A
capacidade de listar mais de um tenant continua util para teste, reimplantacao,
ambientes paralelos ou empresas locais adicionais, mas nao muda a decisao
comercial: o cliente final usa o sistema no proprio ambiente.

No primeiro ciclo, `license.status` e `license.plan` sao apenas metadados
locais. A validacao online de assinatura deve entrar em etapa separada.

## Pacote pre-personalizado

O fluxo comercial recomendado e o consultor enviar ao cliente um pacote ja com a
identidade dele:

```powershell
python scripts\partner_distribution.py apply --profile config\distribution\default.json
```

O perfil `platform.distribution.v1` controla:

- `distribution.package_id`: identificador do pacote gerado.
- `distribution.channel`: canal de distribuicao, como `manual`, `portal` ou
  `partner_download`.
- `distribution.activation_mode`: por padrao `per_client_activation`.
- `distribution.billing_model`: por padrao `per_active_client`.
- `partner`: marca do consultor aplicada ao pacote.
- `license`: metadados locais ate existir validacao online.

Esse processo nao deve incluir banco, planilhas nem dados operacionais do
cliente. O cliente final recebe a marca do consultor e faz o onboarding/importacao
localmente.

## Pastas por tenant

Todos os clientes devem rodar em tenant proprio, inclusive a Practica:

```text
data/
  tenants/
    practica/
      database.sqlite3
      app_config.json
      import_reference.json
      assets/
      outputs/
    cliente_x/
      database.sqlite3
      app_config.json
      import_reference.json
      assets/
      outputs/
```

Comandos esperados:

```powershell
"Cliente.pyw"
```

Para o consultor/distribuidor, use `Representante.pyw`. Para sua entrada
administrativa local, use `Gestao plataforma.pyw`. `Abrir sistema.pyw` continua
existindo como alias do modo cliente.

Quando Edge ou Chrome estiverem disponiveis, essas entradas abrem o iniciador em
janela propria de aplicativo, sem barra de endereco nem abas. Ao escolher ou
criar a empresa, essa mesma janela carrega o app do tenant. Isso mantem a
arquitetura local atual, mas evita apresentar `localhost` ao cliente e evita
abrir uma segunda janela.

Fallback quando o Windows nao abrir `.pyw` diretamente:

```powershell
iniciar.bat
```

Ou, para abrir diretamente:

```powershell
python scripts\serve_app.py --tenant practica --port 8010
python scripts\serve_app.py --tenant cliente_x --port 8011
```

O modo sem `--tenant` existe apenas por compatibilidade. Ele nao deve ser usado
como fluxo normal de empresa, para evitar que a Practica seja tratada de forma
diferente dos demais tenants.

`import_reference.json` deve ser tratado como configuracao operacional do tenant,
nao como default global. Um tenant novo sem esse arquivo nao deve herdar
`data/import_reference.json` nem mostrar fontes fixas da empresa piloto; a
atualizacao rapida por pasta so aparece depois que o proprio tenant tiver pasta
ou arquivos importados.

## Onboarding do primeiro acesso

Em uma base vazia, o app deve abrir o onboarding antes do login comum. O fluxo
configura:

- apresentação inicial do valor do sistema;
- empresa e perfil com poucos campos essenciais;
- primeiro administrador;
- logo da empresa para documentos;
- visão dos dados que podem ser importados ao longo da implantação.

Ao concluir, o backend cria/atualiza organizacao, perfil, loja e admin, salva a
logo enviada em `data/tenants/<cliente>/assets/`, preserva a identidade do
sistema que ja veio no pacote do consultor, registra `onboarding.state` em
`app_settings` e deixa a instalacao pronta para a importacao assistida. A etapa
Dados deve orientar o proximo passo:
o usuario pode comecar por um arquivo simples, conferir o sentido das colunas,
ajustar apenas o que ficar ambiguo e completar outras bases depois. Ela nao deve
parecer uma lista de exigencias nem inundar o primeiro acesso com itens
obrigatorios. O padrao abre `/importacao?onboarding=import`, com o upload
destacado para iniciar o mapeamento dos arquivos.

A etapa de documentos nao deve pedir "nome do sistema" ao cliente final. Em um
modelo white-label, esse nome pertence ao pacote do consultor/distribuidor. O
cliente final deve ajustar apenas a propria empresa: nome, CNPJ/CPF, localidade,
logo de documentos e acesso inicial. Caso a tela gere um identificador interno
da empresa, ele deve vir do nome informado e nao aparecer como campo tecnico.

A etapa antes dos dados deve ser uma apresentação de produto, não um
questionário. Nesse ponto o usuário ainda pode não saber quais arquivos tem,
qual arquivo deve vir primeiro ou como o sistema vai usar cada informação. A
tela deve comunicar a ideia central: quanto mais dados entram, mais inteligente o
sistema fica. A importação assistida aceita produtos, estoque, vendas, clientes,
fornecedores, serviços, preços, compras, notas e outras movimentações, ajuda o
sistema a entender o significado de cada uma e transforma isso em uma mesa de
operação para gerenciar a empresa. Ela não deve pedir segmento, loja principal, compra por fornecedor,
embalagem, unidade por caixa, pedido mínimo, estoque por loja ou rotina de
reposição. Esses pontos devem ser inferidos dos dados importados: se vier
fornecedor, embalagem, unidade por caixa, conversao, lojas ou pedido minimo, o
sistema usa; se nao vier, o mapa de importacao aponta a ausencia. A primeira
unidade e criada automaticamente a partir do nome da empresa, evitando pedir
"loja principal" para quem tem apenas uma loja. O sistema ainda pode importar
fornecedores, lojas e pedidos depois se o cliente mudar a rotina.

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
- quem decide rotinas operacionais;
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
- ciclos de compra por fornecedor e embalagem;
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

O assistente de importacao deve orientar essa leitura em duas camadas:

- **modo implantador**: mostra diagnostico completo, mapeamento de colunas,
  estrutura conhecida/alterada, campos criticos e campos que ficam apenas em
  auditoria;
- **modo operador**: destaca apenas o que precisa de acao para atualizar a rotina
  recorrente.

O bloco `assistant` de `/api/imports` deve ser usado como trilha de contexto:
estado da implantacao, confianca por modulo, proximo arquivo recomendado,
dependencias, modulos destravados e arquivos que podem esperar. A recomendacao
deve evitar pedir dados avancados antes de resolver os bloqueios operacionais
mais simples, como produto sem codigo em custo, estoque ou venda.

### 8. Primeira rotina recorrente

A implantacao deve terminar com uma rotina concreta:

- revisar alertas;
- abrir sugestao de compras;
- ajustar quantidades;
- aprovar pedido por fornecedor;
- registrar pedido enviado;
- registrar chegada;
- comparar sugerido versus recebido.

Isso transforma o produto de relatorio em ferramenta de trabalho.

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
- horizonte calculado;
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

Para implantar bem muitos clientes, o produto precisa de ferramentas internas:

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
