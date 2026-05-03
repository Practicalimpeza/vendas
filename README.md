# NexoVarejo

NexoVarejo e uma plataforma de gestao analitica para pequenos e medios varejistas
no Brasil. Ela nao substitui o ERP operacional do cliente no primeiro momento:
ela recebe exportacoes desses ERPs, padroniza os dados em um modelo SQL canonico
e entrega uma mesa de trabalho para o gestor decidir sobre estoque, compras,
fornecedores, clientes, vendas, servicos, margem e desempenho.

## Norte do produto

- Ser a camada de inteligencia e decisao acima de ERPs heterogeneos.
- Padronizar dados de origem diferentes em um contrato canonico unico.
- Explicar o presente: o que vende, o que para, o que falta, o que sobra, quem
  compra, quem sumiu e onde a margem escapa.
- Sugerir proximas acoes: reposicao, compras por fornecedor, negociacao,
  reativacao de clientes, ajuste de mix, preco e cobertura de estoque.
- Funcionar como assinatura SaaS multiempresa, com implantacao assistida por
  conectores de importacao.

## Estrutura atual

```text
nexovarejo/
  docs/
    00_visao_produto.md
    01_inventario_dados_exemplo.md
    02_modelo_canonico_sql.md
    03_ingestao_e_padronizacao.md
    04_catalogo_analitico.md
    05_roadmap_operacional.md
    06_implantacao_novos_comercios.md
    99_guia_de_contexto.md
  schema/
    canonical.sql
  mappings/
    practica_csv.yml
  *.csv
    exportacoes de exemplo da empresa teste
```

## Ordem recomendada de leitura

1. `docs/00_visao_produto.md`
2. `docs/01_inventario_dados_exemplo.md`
3. `docs/02_modelo_canonico_sql.md`
4. `docs/03_ingestao_e_padronizacao.md`
5. `docs/04_catalogo_analitico.md`
6. `docs/05_roadmap_operacional.md`
7. `docs/06_implantacao_novos_comercios.md`
8. `docs/07_motor_reposicao.md`
9. `mappings/practica_csv.yml`

## Principio tecnico central

Cada ERP ganha um conector proprio. O conector pode conhecer nomes estranhos de
colunas, cabecalhos deslocados, datas em serial do Excel, rodapes e formatos
locais. Depois da importacao, o restante do software so conversa com o modelo
canonico SQL.

Isso evita que a regra de negocio fique presa ao formato de uma planilha.

Dados importados do ERP e dados extrapolados das planilhas sao tratados como
espelho da origem: vendas, estoque, custos, precos, nomes, clientes, servicos,
marcas e inferencias so mudam quando uma nova importacao ou regra de importacao
trouxer a mudanca. Ajustes feitos no NexoVarejo sao apenas configuracoes
operacionais, como fornecedor preferencial, embalagem, cobertura alvo, bloqueios
e observacoes internas.

## Rodando o MVP local

Importe os CSVs para SQLite:

```powershell
& "C:\Users\gabri\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts\import_practica.py --source-dir . --db data\nexovarejo.db
```

Suba o app:

```powershell
& "C:\Users\gabri\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts\serve_app.py --db data\nexovarejo.db --port 8010
```

Acesse `http://127.0.0.1:8010`.
