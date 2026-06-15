# Deploy do portal do vendedor

Objetivo: publicar o NexoVarejo para vendedores externos acessarem pelo celular,
sem colocar CSVs, bancos locais, fotos ou segredos no GitHub.

## Decisao recomendada para beta

Para o primeiro uso real com vendedores, manter o app Python + SQLite e usar um
provedor com volume persistente. Isso evita migracao de banco agora e permite
validar o fluxo comercial:

- login real, sem bypass de desenvolvimento;
- perfil `seller` para vendedores externos;
- acesso mobile em `/vendedor`;
- dados em volume persistente;
- backup manual/diario do volume antes de ampliar o uso.

Railway e Fly tendem a ser bons candidatos quando precisamos subir/baixar
arquivos do volume com CLI. Render tambem funciona, mas exige disco persistente
pago; sem disco persistente, arquivos gravados pelo app somem em redeploy.

## O que nunca sobe para o GitHub

- `data/`;
- `*.db`, `*.sqlite`, `*.sqlite3`;
- CSVs, XLSM e planilhas reais da Practica;
- `outputs/`, PDFs e exports sensiveis;
- tokens, senhas, chaves de WhatsApp ou credenciais.

O repositorio deve ser privado.

## Preparacao do app

O servidor aceita configuracao por ambiente:

- `PULSO_ALLOW_NETWORK=1`: libera bind externo conscientemente;
- `PULSO_HOST=0.0.0.0`: obrigatorio em provedores web;
- `PORT`: porta injetada pelo provedor;
- `PULSO_DATA_DIR=/data`: pasta persistente para banco, configs e assets;
- `PULSO_TENANT=practica`: usa `tenants/practica` dentro do volume;
- `PULSO_APP_NAME=Practica CRM`: nome exibido na interface.

Com essas variaveis, o start command pode ser:

```bash
python scripts/serve_app.py
```

O arquivo `railway.json` no repositorio fixa:

- builder `RAILPACK`;
- start command com `PULSO_HOST=0.0.0.0` e `PULSO_ALLOW_NETWORK=1`;
- healthcheck publico `/healthz`;
- restart policy `ON_FAILURE`.

O volume deve conter:

```text
/data/
  tenants/
    practica/
      database.sqlite3
      app_config.json
      import_reference.json
      assets/
```

Se o banco ainda nao existir, o app cria um banco vazio e abre o bootstrap do
primeiro administrador. Para usar os dados reais da Practica, gere/importa o
banco localmente e envie apenas o diretório `data/tenants/practica` para o
volume do provedor, nunca para o GitHub.

## Passo a passo recomendado

1. Criar repositorio privado no GitHub.
2. Confirmar que `git status` nao inclui CSV, banco, `data/`, logs ou outputs.
3. Rodar `python scripts/smoke_checks.py`.
4. Conectar o repositorio privado no provedor.
5. Criar um volume persistente montado em `/data`.
6. Configurar as variaveis de ambiente listadas acima.
7. Definir start command `python scripts/serve_app.py`.
8. Fazer o primeiro deploy.
9. Enviar `data/tenants/practica` para o volume persistente.
10. Abrir a URL publica, criar/validar admin e criar usuarios vendedores com
    o perfil "Vendedor externo".
11. Testar no celular: login, `/vendedor`, buscar cliente, abrir ficha, gerar
    pedido PDF.
12. Antes de liberar para todos, baixar uma copia do volume como backup.

## Railway pelo painel

1. Abrir Railway e criar um novo projeto.
2. Escolher "Deploy from GitHub repo".
3. Selecionar `Practicalimpeza/vendas`.
4. Confirmar que o deploy usou o `railway.json` do repositorio.
5. Em Variables, adicionar:

```text
PULSO_DATA_DIR=/data
PULSO_TENANT=practica
PULSO_APP_NAME=Practica CRM
```

6. Em Volumes, criar um volume no servico e montar em `/data`.
7. Gerar um dominio Railway para o servico.
8. Abrir `/healthz`; deve retornar `{"ok": true}`.
9. Abrir `/vendedor`; se o volume ainda estiver vazio, o app vai pedir o
   bootstrap do primeiro administrador.

Se for usar a CLI futuramente, ela deve respeitar `.gitignore` e
`.railwayignore`; mesmo assim, nao use `--no-gitignore` neste projeto.

## Envio dos dados para o volume

O app sem dados reais sobe vazio. Para usar a base atual, gere um backup do
tenant e restaure esse pacote no volume:

```powershell
python scripts\tenant_backup.py backup --tenant practica
```

O comando cria um ZIP em `outputs/backups/` com:

- `database.sqlite3`, copiado via `sqlite3.backup()`;
- `app_config.json`;
- `import_reference.json`;
- `assets/`, quando existir;
- `manifest.json` com o tenant e data do backup.

Depois de enviar o ZIP para o ambiente do Railway, restaure no volume:

```bash
python scripts/tenant_backup.py restore --archive practica_YYYYMMDD_HHMMSS.zip --data-dir /data --replace
```

Para testar localmente sem tocar no tenant real:

```powershell
python scripts\tenant_backup.py restore --archive outputs\backups\practica_YYYYMMDD_HHMMSS.zip --data-dir C:\temp\nexo_restore_test
```

Antes de restaurar em producao:

1. feche o servidor local;
2. gere um backup novo com `tenant_backup.py backup`;
3. guarde uma copia do ZIP fora do Railway;
4. restaure no volume `/data`;
5. reinicie o servico;
6. acesse com admin real e crie usuarios `seller`.

## Bloqueadores antes de uso amplo

- rotina testada de backup/restauracao do SQLite e dos assets;
- conferência de usuarios e senhas reais;
- domínio/HTTPS estável;
- política de quem pode criar usuarios;
- teste com 1 ou 2 vendedores antes de ampliar.

## Caminho futuro

Quando o uso crescer, migrar a camada de dados para banco online gerenciado
PostgreSQL/libSQL ou equivalente. Para o beta dos vendedores, SQLite em volume
persistente e backup frequente e suficiente se o grupo for pequeno e controlado.
