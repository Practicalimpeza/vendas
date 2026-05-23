# Partners

Esta pasta descreve a camada de parceiro/consultor que fica acima dos tenants.

- `default.json`: parceiro ativo nesta instalacao local.
- `assets/`: futura pasta para logo do parceiro, exposta como
  `/partner-assets/<arquivo>` pelo iniciador.

O arquivo normalmente deve ser gerado pelo aplicador de distribuicao:

```powershell
python scripts\partner_distribution.py apply --profile config\distribution\default.json
```

Cada empresa cliente continua em `data/tenants/<cliente>/`. O vinculo fica em
`data/tenants/<cliente>/app_config.json`:

```json
{
  "partner": {
    "id": "default"
  }
}
```

A licenca ainda e apenas metadado local. A validacao de assinatura deve ser
implementada depois por um servico central separado dos bancos dos clientes.
