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

Para importar a exportacao atual usada pelo MVP da Practica:

```powershell
& "C:\Users\gabri\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts\import_practica.py ..\software_pedido\data_raw --db data\nexovarejo.db --organization-id org_practica --store-id loja_1
```

Esse comando cria/atualiza o banco e grava:

- produtos canonicos;
- snapshot de estoque;
- vendas de produtos;
- servicos;
- clientes deduplicados;
- lote de importacao com issues de qualidade de dados.

Por padrao, a importacao da Practica simula uma implantacao do zero: os
cadastros manuais antigos nao entram automaticamente. Fornecedores, marcas,
caixas, bloqueios e outras regras aparecem na tela como tarefas de implantacao.

Dependencias de API como FastAPI/Uvicorn ficam em `requirements.txt`, mas o core
foi criado para ser testavel mesmo sem servidor instalado.

## API planejada

Com as dependencias instaladas, `src/nexovarejo/api/main.py` expoe:

- `GET /health`
- `GET /v1/organizations/{organization_id}/summary`
- `GET /v1/organizations/{organization_id}/products/top`
- `GET /v1/organizations/{organization_id}/abc`
- `GET /v1/organizations/{organization_id}/purchase-suggestions`
- `GET /v1/organizations/{organization_id}/customers/rfm`

O caminho do banco pode ser configurado por `NEXO_DB_PATH`.

## Interface web local

A tela inicial do produto fica em `web/` e pode ser servida sem instalar
FastAPI:

```powershell
& "C:\Users\gabri\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" scripts\serve_web.py --db data\nexovarejo.db
```

Depois acesse:

`http://127.0.0.1:8010`
