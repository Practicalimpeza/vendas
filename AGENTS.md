# AGENTS.md — Regras para Agentes de IA no NexoVarejo

Guia operacional: **como** trabalhar neste projeto, não **o que** é o projeto (veja `PROJECT_MAP.md` para isso).

---

## 1. Economia de tokens

- **Nunca leia CSVs** (`*.csv` na raiz). São dados brutos de exemplo, não código.
- **Nunca leia `scripts/serve_app.py` inteiro** (150 KB). Use grep para localizar seções antes de ler com `offset/limit`:
  ```
  grep -n "self.path.startswith\|def api_\|def handle_" scripts/serve_app.py
  grep -n "def " scripts/serve_app.py
  grep -n "replenishment\|rfm\|abc\|quote\|pricing\|maturity" scripts/serve_app.py
  ```
- **Nunca leia `web/app.js` inteiro** (89 KB). Use grep para funções ou handlers específicos.
- **Nunca leia `web/app.css` inteiro** (30 KB). Use grep para seletores ou seções.
- **Prefira `schema/canonical.sql`** com `offset/limit` (ex.: primeiras 200 linhas bastam para entender as tabelas principais).
- **Use `docs/` sob demanda** — leia apenas o doc relevante para a tarefa, nunca todos.
- **Não leia `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`, `data/`, `__pycache__` ou diretórios de cache.**
- Use `git grep` ou Grep para buscas antes de abrir qualquer arquivo com mais de 100 linhas.

## 2. Regras de edição

- **Nunca edite um arquivo sem lê-lo antes.**
- **Antes de qualquer edição, mostre um plano curto e aguarde confirmação do usuário.**
- **Não edite CSVs.** São dados de exemplo imutáveis.
- **Não altere `PROJECT_MAP.md` ou `AGENTS.md`** sem confirmação explícita.
- Prefira `Edit` (diff pontual) a `Write` (reescrita completa) para arquivos existentes.
- Não crie arquivos desnecessários. Se um arquivo novo for essencial, justifique no plano.

## 3. Stack minimalista — NÃO adicionar dependências

- **Zero dependências externas.** Tudo funciona com biblioteca padrão Python 3.11+.
- **Não sugira `pip install`**, `npm install`, ou qualquer gerenciador de pacotes.
- **Não introduza frameworks** (FastAPI, Flask, React, Vue, Tailwind, etc.).
- **Não adicione build tools** (webpack, vite, bundlers).
- Backend: `http.server`, `sqlite3`, `csv`, `json` — só biblioteca padrão.
- Frontend: HTML5 + CSS3 + JavaScript vanilla — zero frameworks.
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
- **Migrações de schema:** estão inline no `serve_app.py` (`ensure_schema_upgrades()`). O schema base está em `schema/canonical.sql`. Não adicione novas migrações inline — discuta versionamento antes.

## 6. Arquitetura e riscos (lembretes)

- `serve_app.py` é um **monolito de 150 KB** com servidor HTTP, ~40 endpoints REST, analytics, migrações. Trate-o com cuidado.
- A importação é `full_refresh` — deleta e reimporta tudo. Não otimize sem discutir.
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
8. **Não comite** a menos que o usuário peça.
