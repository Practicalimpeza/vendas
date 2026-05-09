# AGENTS.md — Regras para Agentes de IA no NexoVarejo

Guia operacional: **como** trabalhar neste projeto, não **o que** é o projeto (veja `PROJECT_MAP.md` para isso).

---

## 1. Economia de tokens

- **Nunca leia CSVs** (`*.csv` na raiz). São dados brutos de exemplo, não código.
- **Não leia arquivos grandes inteiros sem busca prévia.** Use grep/rg para localizar seções antes de ler com `offset/limit`:
  ```
  rg -n "def |GET_ROUTES|POST_ROUTES|replenishment|quote|pricing|maturity" scripts
  rg -n "function |const |let |data-view|apiContract|apiRows" web/app.js
  rg -n "\.classe|#id|data-view|modal|dock" web/app.css
  ```
- **Nunca leia `scripts/erp_import_flow.py`, `web/app.js` ou `web/app.css` inteiros.** São arquivos grandes; use grep/rg e leia só o trecho necessário.
- `scripts/serve_app.py` hoje é uma camada HTTP pequena, mas ainda deve ser lido com objetivo claro.
- **Prefira `schema/canonical.sql`** com `offset/limit` (ex.: primeiras 200 linhas bastam para entender as tabelas principais).
- **Use `docs/` sob demanda** — leia apenas o doc relevante para a tarefa, nunca todos.
- **Não leia `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`, `data/`, `__pycache__` ou diretórios de cache.**
- Use `git grep` ou Grep para buscas antes de abrir qualquer arquivo com mais de 100 linhas.

## 2. Regras de edição

- **Nunca edite um arquivo sem lê-lo antes.**
- **Não edite CSVs.** São dados de exemplo imutáveis.
- **Não altere `PROJECT_MAP.md` ou `AGENTS.md`** sem confirmação explícita.
- Prefira `Edit` (diff pontual) a `Write` (reescrita completa) para arquivos existentes.
- Não crie arquivos desnecessários. Se um arquivo novo for essencial, justifique no plano.

## 3. Stack minimalista — NÃO adicionar dependências instaladas

- **Zero dependências instaladas novas.** O backend funciona com biblioteca padrão Python 3.11+.
- **Não sugira `pip install`**, `npm install`, ou qualquer gerenciador de pacotes.
- **Não introduza frameworks** (FastAPI, Flask, React, Vue, Tailwind, etc.).
- **Não adicione build tools** (webpack, vite, bundlers).
- Backend: `http.server`, `sqlite3`, `csv`, `json` — só biblioteca padrão.
- Frontend: HTML5 + CSS3 + JavaScript vanilla — zero frameworks.
- Bibliotecas frontend já vendorizadas em `web/vendor/` podem ser usadas sem instalação nem build.
- Banco: SQLite via `sqlite3` — sem ORMs, sem SQLAlchemy.
- Se uma feature exigir dependência externa, discuta com o usuário antes.

## 4. Segurança e dados sensíveis

- **Os CSVs na raiz contêm dados reais da empresa Practica** (preços, custos, margens, nomes de clientes).
- **Nunca exponha, copie ou compartilhe** conteúdo dos CSVs fora do repositório.
- **Nunca comite `data/`, `*.db`, `outputs/` ou arquivos com dados sensíveis.**
- **Não adicione secrets, tokens ou chaves** ao código. O MVP atual não tem autenticação — qualquer adição de auth deve ser discutida.
- **Não faça push de dados da Practica** para repositórios públicos.

## 5. Convenções do projeto

- **Idioma:** português (código, comentários, docs, interface, mensagens de commit).
- **Branch:** `main` é a única branch ativa. Confirme antes de criar branches.
- **Formatação:** configurado no `pyproject.toml` (ruff). Siga o estilo existente.
- **Testes:** a pasta `tests/` foi deletada. Não há testes automatizados. Se criar testes, use `pytest` (já listado como dev dependency no `pyproject.toml`, mas não instale nada novo).
- **Migrações de schema:** o schema base está em `schema/canonical.sql`; upgrades locais ficam em `scripts/schema_upgrades.py` e devem registrar identificador em `schema_migrations`. Não adicione `ALTER TABLE` solto sem registro.

## 6. Arquitetura e riscos (lembretes)

- `serve_app.py` é uma **camada HTTP fina**. As regras vivem em módulos por domínio (`replenishment.py`, `quotes.py`, `pricing.py`, `commercial.py`, `supplier_ops.py`, `erp_import_flow.py`, etc.).
- A importação da Practica está em `incremental_sync`, preservando histórico e evitando duplicidade de fatos iguais. Não retorne para `full_refresh` destrutivo sem discutir.
- SQLite com `organization_id` no schema, mas sem concorrência real. Migração para PostgreSQL está no roadmap mas não é para agora.
- Caminhos no código podem estar hard-coded com `C:\Users\gabri\...` — prefira caminhos relativos ao editar.

## 7. Fluxo de trabalho recomendado

1. **Entenda a tarefa** — leia `PROJECT_MAP.md` se ainda não leu.
2. **Localize o código relevante** com grep, sem abrir arquivos grandes diretamente.
3. **Leia apenas as seções necessárias** com `offset/limit`.
4. **Apresente plano curto** com arquivos que serão alterados e abordagem.
5. **Aguarde confirmação** antes de editar.
6. **Edite** com `Edit` (preferência) ou `Write` (se for arquivo novo).
7. **Verifique** — rode o servidor ou teste manualmente se aplicável.
