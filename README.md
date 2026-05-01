# NexoVarejo

NexoVarejo e uma plataforma para conectar dados de ERPs de pequenos e medios
varejos e transformar vendas, estoque, compras, fornecedores e clientes em
decisoes operacionais.

Este produto nasce inspirado no MVP `software_pedido`, mas com outra arquitetura:

- multiempresa e multiloja desde o modelo de dados;
- conectores de ERP separados do dominio;
- importacao para um modelo canonico unico;
- regras de compra e analise em modulos reutilizaveis;
- API preparada para autenticacao, permissoes e auditoria;
- SQLite para desenvolvimento local, com caminho claro para Postgres.

## Estrutura

```text
nexovarejo/
  src/nexovarejo/
    api/              API HTTP futura
    analytics/        ABC, RFM, demanda, ruptura e fornecedores
    domain/           Entidades canonicas do varejo
    ingestion/        Contratos e conectores de ERP
    storage/          Schema e acesso ao banco
  scripts/            Utilitarios locais
  tests/              Testes de contrato e regra
```

## Primeiros objetivos

1. Importar dados de um ERP/exportacao para tabelas canonicas.
2. Manter cadastros manuais sem prender o sistema a uma planilha especifica.
3. Sugerir compras com base em giro, cobertura, estoque e regras por fornecedor.
4. Segmentar clientes e produtos para apoiar venda, recompra e mix.
5. Permitir que cada novo varejo use um conector proprio, sem reescrever o core.

## Rodando localmente

Por enquanto os testes usam apenas biblioteca padrao do Python:

```powershell
& "C:\Users\gabri\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m unittest discover -s tests
```

Para criar um banco local:

```powershell
& "C:\Users\gabri\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts\init_db.py
```

Dependencias de API como FastAPI/Uvicorn ficam em `requirements.txt`, mas o core
foi criado para ser testavel mesmo sem servidor instalado.
