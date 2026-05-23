# AGENTS.md - Regras para Agentes de IA no NexoVarejo

Guia operacional: **como** trabalhar neste projeto, nao **o que** e o projeto
(veja `PROJECT_MAP.md` para isso).

---

## 1. Economia de tokens

- **Nunca leia CSVs** (`*.csv` na raiz). Sao dados reais da Practica e nao sao
  codigo.
- **Nao leia arquivos grandes inteiros sem busca previa.** Use `rg` para
  localizar secoes antes de ler trechos:
  ```powershell
  rg -n "def |GET_ROUTES|POST_ROUTES|replenishment|quote|pricing|maturity|auth|whatsapp" scripts
  rg -n "function |const |let |data-view|apiContract|apiRows" web
  rg -n "\.classe|#id|data-view|modal|dock|auth|whatsapp" web/app.css
  ```
- **Nunca leia `scripts/erp_import_flow.py`, `scripts/quotes.py`,
  `scripts/replenishment_v2.py`, `scripts/smoke_checks.py`, `web/app.js` ou
  `web/app.css` inteiros.** Sao arquivos grandes; busque antes e leia so o
  trecho necessario.
- `scripts/serve_app.py` e uma camada HTTP relativamente pequena, mas ainda deve
  ser lido com objetivo claro.
- **Prefira `schema/canonical.sql` com limite** (ex.: primeiras 220 linhas para
  tabelas principais; busque por nomes especificos antes de ler trechos
  distantes).
- **Use `docs/` sob demanda**: comece por `HANDOFF.md`, `PROJECT_MAP.md`,
  `docs/README.md` e o doc da area. Nunca leia todos os docs por padrao.
- **Nao leia `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`,
  `data/`, `__pycache__` ou diretorios de cache.**
- Use `rg`/`git grep` antes de abrir qualquer arquivo com mais de 100 linhas.

## 2. Regras de edicao

- **Nunca edite um arquivo sem le-lo antes** ou sem ler o trecho relevante.
- **Nao edite CSVs.** Sao dados sensiveis de exemplo operacional.
- **Nao altere `PROJECT_MAP.md` ou `AGENTS.md`** sem confirmacao explicita do
  usuario.
- Prefira edicoes pontuais por diff a reescritas completas de arquivos
  existentes.
- Nao crie arquivos desnecessarios. Se um arquivo novo for essencial, justifique
  no plano.
- Se uma mudanca alterar estado, arquitetura, foco, rotas centrais ou forma de
  continuar o trabalho, atualize `HANDOFF.md` e o doc canonico da area.

## 3. Stack minimalista - NAO adicionar dependencias instaladas

- **Zero dependencias instaladas novas** sem alinhamento explicito.
- **Nao sugira `pip install`, `npm install` ou qualquer gerenciador de pacotes**
  como solucao padrao.
- **Nao introduza frameworks** (FastAPI, Flask, React, Vue, Tailwind, etc.).
- **Nao adicione build tools** (webpack, vite, bundlers).
- Backend: Python 3.11+ com biblioteca padrao (`http.server`, `sqlite3`, `csv`,
  `json`, `urllib`, etc.).
- Frontend: HTML5 + CSS3 + JavaScript vanilla, sem build step.
- Bibliotecas frontend ja vendorizadas em `web/vendor/` podem ser usadas sem
  instalacao nem build.
- Banco: SQLite via `sqlite3`, sem ORMs.
- Se uma feature exigir dependencia externa, discuta com o usuario antes e
  registre a decisao.

## 4. Seguranca e dados sensiveis

- **Os CSVs na raiz contem dados reais da empresa Practica** (precos, custos,
  margens, nomes de clientes e fornecedores).
- **Nunca exponha, copie ou compartilhe** conteudo dos CSVs fora do repositorio.
- **Nunca comite `data/`, `*.db`, `outputs/`, planilhas sensiveis ou arquivos
  com dados sensiveis.**
- **Nao adicione secrets, tokens ou chaves** ao codigo, docs ou exemplos.
- Auth local ja existe (`scripts/auth.py`, `web/app_auth.js`): qualquer mudanca
  no modelo de autenticacao, permissoes, sessao, deploy externo ou integracao de
  identidade deve ser discutida antes.
- WhatsApp CRM ja existe (`scripts/whatsapp_crm.py`, `web/app_whatsapp.js`):
  nao grave credenciais reais; use variaveis de ambiente e teste modo sem
  credenciais quando possivel.
- **Nao faca push de dados da Practica** para repositorios publicos.

## 5. Convencoes do projeto

- **Idioma:** portugues (codigo, comentarios, docs, interface e mensagens de
  commit). O repositorio aceita texto ASCII quando isso evita problema de
  encoding.
- **Branch:** `main` e a unica branch ativa. Confirme antes de criar branches.
- **Formatacao:** configurado no `pyproject.toml` (ruff). Siga o estilo
  existente.
- **Testes:** nao ha suite formal em `tests/`. O gate principal e
  `scripts/smoke_checks.py`. Se criar testes novos, use `pytest` apenas se ja
  estiver disponivel; nao instale nada.
- **Migracoes de schema:** o schema base esta em `schema/canonical.sql`;
  upgrades locais ficam em `scripts/schema_upgrades.py` e devem registrar
  identificador em `schema_migrations`. Nao adicione `ALTER TABLE` solto sem
  registro.

## 6. Arquitetura e riscos

- `serve_app.py` e uma **camada HTTP fina**: ciclo HTTP, auth gate, PDF, webhook
  WhatsApp, arquivos estaticos e inicializacao.
- Regras vivem em modulos por dominio: `api_routes.py`, `auth.py`,
  `erp_import_flow.py`, `relationship_imports.py`, `replenishment.py`,
  `replenishment_v2.py`, `quotes.py`, `pricing.py`, `commercial.py`,
  `supplier_ops.py`, `action_center.py`, `company_profile.py`,
  `whatsapp_crm.py`, etc.
- A importacao da Practica esta em `incremental_sync`, preservando historico e
  evitando duplicidade de fatos iguais. Nao retorne para `full_refresh`
  destrutivo sem discutir.
- SQLite usa `organization_id`, mas isolamento multiempresa ainda precisa ser
  validado em rotas, queries, caches e telas antes de beta real.
- Backup/restauracao local ainda deve ser tratado como bloqueador se nao houver
  rotina testada.
- Migracao para PostgreSQL continua fora do escopo imediato.
- Caminhos no codigo podem estar hard-coded com `C:\Users\gabri\...`; prefira
  caminhos relativos ao editar.

## 7. Fluxo de trabalho recomendado

1. **Entenda a tarefa**: leia `HANDOFF.md` e `PROJECT_MAP.md` se o contexto nao
   estiver fresco.
2. **Localize o codigo relevante** com `rg`, sem abrir arquivos grandes
   diretamente.
3. **Leia apenas os trechos necessarios** antes de editar.
4. **Apresente plano curto** para mudancas substantivas, com arquivos afetados e
   abordagem.
5. **Aguarde confirmacao** quando a mudanca tocar dados, auth, schema,
   dependencias, deploy, `AGENTS.md` ou `PROJECT_MAP.md`.
6. **Edite com diff pontual** e preserve mudancas existentes que voce nao fez.
7. **Verifique** com smoke, checks leves ou teste manual conforme o risco.
8. **Atualize docs vivos** (`HANDOFF.md`, `PROJECT_MAP.md`, doc da area e
   contratos) quando a mudanca alterar o estado real do projeto.

## 8. Verificacoes uteis

```powershell
python scripts\smoke_checks.py
```

```powershell
python -m py_compile scripts\serve_app.py scripts\api_routes.py scripts\auth.py scripts\erp_import_flow.py scripts\relationship_imports.py scripts\replenishment.py scripts\replenishment_v2.py scripts\quotes.py scripts\pricing.py scripts\commercial.py scripts\supplier_ops.py scripts\action_center.py scripts\company_profile.py scripts\whatsapp_crm.py
```

```powershell
node --check web\app_core.js
node --check web\app_state.js
node --check web\app_boot.js
node --check web\app.js
```
