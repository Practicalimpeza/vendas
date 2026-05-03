# Visao do Produto

## Proposta

O NexoVarejo e uma mesa de trabalho para gestores de varejo brasileiro. O app
centraliza leitura de desempenho, estoque, compras, fornecedores, clientes,
servicos e margem, usando dados exportados dos ERPs que cada empresa ja opera.

Na beta, o produto deve resolver uma dor clara: transformar arquivos soltos em
decisoes praticas de gestao.

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

1. Implantacao sem trocar ERP.
2. Dados padronizados mesmo quando cada cliente exporta de um jeito.
3. Analises que viram tarefas e sugestoes operacionais.
4. Historico e auditoria para o gestor confiar no que mudou.
5. Caminho para assinatura recorrente por empresa, loja e modulo.

## Escopo funcional principal

- Dashboard executivo.
- Estoque e cobertura.
- Compras e reposicao.
- Fornecedores e regras comerciais.
- Produtos, marcas, categorias e tags operacionais.
- Clientes, recencia, frequencia e valor.
- Vendas de produtos e servicos.
- Margem, lucro bruto, impostos e custos operacionais.
- Alertas, tarefas e recomendacoes.
- Importacao recorrente de exportacoes de ERP.

## Fora do escopo inicial

- Substituir emissao fiscal ou caixa do ERP.
- Controlar financeiro completo.
- Ser o sistema oficial de estoque em tempo real antes de integracoes mais
  profundas.
- Automatizar compras sem aprovacao humana.

## Decisao arquitetural

O sistema sera construido em tres camadas:

1. **Staging:** guarda os arquivos e linhas como vieram.
2. **Canonico SQL:** padroniza entidades, eventos e snapshots.
3. **Produto:** dashboards, analises, regras, recomendacoes e fluxos de trabalho.

