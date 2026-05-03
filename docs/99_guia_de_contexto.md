# Guia de Contexto

Use este guia para trabalhar com poucos tokens.

## Ordem minima antes de uma tarefa

1. `README.md`
2. Documento especifico da area:
   - produto: `docs/00_visao_produto.md`
   - dados: `docs/01_inventario_dados_exemplo.md`
   - banco: `docs/02_modelo_canonico_sql.md`
   - importacao: `docs/03_ingestao_e_padronizacao.md`
   - analises: `docs/04_catalogo_analitico.md`
   - roadmap: `docs/05_roadmap_operacional.md`
   - implantacao: `docs/06_implantacao_novos_comercios.md`

## Evite abrir por padrao

- CSVs inteiros.
- Logo e imagens.
- Bancos locais.
- Outputs gerados.

## Buscas uteis

```powershell
Get-ChildItem -Force
Get-ChildItem docs
Select-String -Path docs/*.md -Pattern "fornecedor", "ABC", "estoque"
```

## Principio de trabalho

Todo novo comportamento deve dizer em qual camada atua:

- conector/staging;
- modelo canonico;
- regra analitica;
- API;
- interface;
- operacao/implantacao.
