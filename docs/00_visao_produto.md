# Visao do Produto

## Proposta

O NexoVarejo e o Sistema Operacional de Gestao para empresas do varejo. Ele
centraliza desempenho, estoque, compras, fornecedores, clientes, servicos,
margem, processos, visoes e memoria operacional para que a empresa opere com
mais clareza, adaptacao e continuidade.

O produto nasce como uma nova categoria para a gestao do varejo. Ele comeca por
cima dos ERPs e planilhas que a empresa ja usa, organizando dados, contexto,
rotinas, sinais, instrumentos, acoes e memoria. Com o tempo, pode substituir
partes da operacao quando fizer sentido, sem exigir uma troca brusca de sistema.

Na beta, o produto deve resolver uma dor clara: transformar arquivos soltos em
clareza gerencial, rotina operacional, comparacao confiavel e gestao melhor.

## Definicao fixa

O NexoVarejo e a infraestrutura operacional e a metodologia de gestao embutida
para empresas do varejo. Ele deve ajudar o gestor a enxergar a empresa inteira,
entender relacoes entre vendas, margem, estoque, compras, clientes,
fornecedores, pessoas e processos, investigar o que importa e conduzir a rotina
com mais seguranca.

O produto nao deve tentar conduzir o usuario como um assistente mandando o que
fazer. Ele organiza dados, oferece visualizacao ampla, informacoes interligadas,
busca, filtros, presets de visao, selecao e trabalho em lote. A autonomia do
operador vem antes de qualquer recomendacao do sistema.

Frase norte:

> NexoVarejo e o Sistema Operacional de Gestao para empresas do varejo.

Frase de apoio:

> A nova maneira de gerir o varejo: visualizacao ampla, dados interligados,
> filtros poderosos, operacao em lote, processos adaptaveis e controle sempre
> com o gestor.

## Usuario principal

Gestor ou dono de pequeno e medio varejo que precisa decidir diariamente:

- o que comprar;
- quanto comprar;
- de quem comprar;
- o que esta parado;
- onde ha ruptura ou excesso;
- quais clientes merecem atencao;
- quais produtos sustentam faturamento e margem;
- onde o negocio esta melhorando ou piorando.

## Promessa de valor

1. Implantacao sem trocar ERP: o Nexo trabalha sobre o que a empresa ja usa.
2. Dados padronizados mesmo quando cada cliente exporta de um jeito.
3. Uso standalone quando a rotina nascer direto no app.
4. Analises que viram visoes, comparacoes, filtros, presets, instrumentos e
   rotinas operacionais.
5. Trabalho em lote para selecionar, revisar, classificar, ajustar, exportar ou
   encaminhar grupos de itens sem navegar modulo por modulo.
6. Memoria operacional para explicar o que mudou, por que mudou, quem decidiu e
   como a empresa passou a operar.
7. Base IA-friendly: dados, estados, contratos e explicacoes legiveis para
   pessoas e para ferramentas inteligentes, sem depender de IA embutida.
8. Caminho para assinatura recorrente por empresa, loja, modulo e maturidade
   operacional.

## Fundamentos do Sistema Operacional de Gestao

- **Dados conectados:** produtos, vendas, estoque, custo, preco, fornecedores,
  clientes, cotacoes, pedidos e acoes precisam conversar entre si.
- **Processos vivos:** a rotina deve se adaptar ao jeito real de cada empresa,
  sem ficar presa a modulos rigidos ou implantacoes pesadas.
- **Semantica de varejo:** o produto fala a lingua da operacao: giro, cobertura,
  ruptura, excesso, margem, recompra, minimo, prazo, caixa empatado e mix.
- **Visualizacao e filtros como poder central:** o operador deve enxergar tudo,
  cruzar informacoes, buscar rapido, combinar filtros, salvar presets e montar
  a mesa do seu jeito.
- **Trabalho em lote:** tabelas, listas e mesas devem permitir selecionar
  conjuntos de itens e agir sobre eles com seguranca.
- **Gestao antes de relatorio:** o objetivo nao e mostrar graficos soltos; e
  revelar o estado da empresa, abrir a ferramenta certa e sustentar a proxima
  acao.
- **Autonomia antes de recomendacao:** sinais e sugestoes podem existir, mas sao
  uma camada discreta. O produto nao deve parecer que sabe mais que o operador
  nem empurrar decisoes como se fossem ordens.
- **Memoria e rastreabilidade:** decisoes, justificativas, impactos e mudancas
  ficam registradas para criar confianca e continuidade.
- **Operacao hibrida:** o Nexo convive com ERPs, planilhas, canais digitais e
  rotinas internas sem exigir troca brusca de sistema.
- **Substituicao gradual:** o produto comeca como camada superior de gestao e,
  com maturidade, pode assumir partes da operacao que hoje dependem de varios
  sistemas desconectados.
- **IA-friendly por desenho:** contratos claros, estados explicaveis, origem dos
  dados e pacotes de contexto permitem que IAs externas ajudem sem tomar o
  controle da empresa.

## Escopo funcional principal

- Dashboard executivo.
- Estoque e cobertura.
- Compras e reposicao.
- Fornecedores e regras comerciais.
- Produtos, marcas, categorias e tags operacionais.
- Clientes, recencia, frequencia e valor.
- Vendas de produtos e servicos.
- Margem, lucro bruto, impostos e custos operacionais.
- Visualizacoes amplas, filtros combinaveis, buscas, presets de visao e
  comparacoes.
- Selecao e trabalho em lote sobre produtos, fornecedores, clientes, compras,
  cotacoes e pendencias.
- Sinais discretos, memoria operacional e decisoes registradas.
- Processos e rotinas operacionais por area da empresa.
- Importacao recorrente de exportacoes de ERP.
- Fontes operacionais por registro, distinguindo o que veio de fora do que
  nasceu no sistema.
- Pacotes de contexto para analise assistida: visoes, selecoes, filtros
  aplicados, resumos operacionais, pendencias e limites dos dados.

## Fora do escopo inicial

- Substituir emissao fiscal ou caixa do ERP.
- Controlar financeiro completo.
- Ser o sistema fiscal-contabil completo antes de uma decisao explicita de
  escopo.
- Automatizar compras sem aprovacao humana.
- Prometer IA autonoma ou agente embutido antes de consolidar dados, contratos,
  governanca e rotina operacional.

## Decisao arquitetural

O sistema sera construido em quatro camadas:

1. **Staging:** guarda os arquivos e linhas como vieram.
2. **Canonico SQL:** padroniza entidades, eventos e snapshots.
3. **Camada semantica operacional:** traduz dados em objetos, estados,
   criterios, relacoes e acoes do varejo.
4. **Produto:** mesas, visoes, analises, regras, instrumentos e fluxos de
   trabalho.

O principio para a evolucao ERP/standalone e simples: o sistema trabalha com o
que existe. Registros importados preservam vinculo com a origem externa; rotinas
e registros criados no app nascem como dados do proprio sistema. A interface so
deve expor essa origem quando ajudar o usuario a confiar, conferir ou enviar uma
mudanca para outro sistema. Novas importacoes nao devem apagar alteracoes feitas
no app; quando um campo passa a ser cuidado localmente, a importacao atualiza o
restante e deixa aquele valor preservado.
