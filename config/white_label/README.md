# White label

Esta pasta separa configuracao de instalacao do codigo do produto.

White label da empresa cliente nao e a mesma coisa que marca do parceiro. A
marca/licenca do consultor fica em `config/partners/default.json`; a marca da
empresa cliente fica no tenant.

## Arquivos

- `default.json`: perfil base versionado do produto.
- `clients/*.json`: exemplos ou perfis versionaveis de implantacao.
- `data/tenants/<cliente>/app_config.json`: override local recomendado para
  uma instalacao isolada por cliente. Esse caminho fica dentro de `data/`,
  portanto nao entra no git.
- `data/tenants/<cliente>/assets/`: logos enviadas no onboarding.
- `data/local/app_config.json`: caminho legado usado apenas quando o servidor
  roda sem `--tenant`.

## Ordem de precedencia

1. `config/white_label/default.json`
2. arquivo informado em `PULSO_CONFIG` ou `NEXOVAREJO_CONFIG`
3. `data/tenants/<cliente>/app_config.json`, quando `--tenant` for usado
4. `data/local/app_config.json`, quando rodar sem `--tenant`
5. variaveis de ambiente `PULSO_*` ou aliases legados `NEXOVAREJO_*`

## Campos

```json
{
  "schema": "pulso.white_label.v1",
  "partner": {
    "id": "default"
  },
  "public": {
    "app_name": "Nome do sistema",
    "app_subtitle": "Subtitulo curto",
    "logo_path": "/brand/logo.svg"
  },
  "defaults": {
    "organization_id": "cliente",
    "company_name": "Empresa",
    "imported_company_name": "Empresa importada",
    "store_name": "Loja principal",
    "country": "Brasil"
  }
}
```

`public` aparece antes do login. Nao coloque dados sensiveis nesse bloco.
