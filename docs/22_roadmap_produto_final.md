# Roadmap para Produto Final

Atualizado em 2026-05-22.

Este documento deixou de ser uma lista de features desejadas e passou a ser uma
matriz de prontidao para beta assistida e para a nova categoria do produto: o
NexoVarejo como Sistema Operacional de Gestao para empresas do varejo.

A pergunta agora e dupla:

1. O que falta para usar o NexoVarejo com um cliente real, com seguranca
   operacional, suporte e uma historia demonstravel?
2. O que precisa existir para provar que o Nexo e uma nova forma de gerir
   empresas do varejo: menos foco em modulos rigidos e mais foco em visualizacao
   ampla, filtros, buscas, presets, trabalho em lote, dados conectados,
   processos adaptaveis, memoria e contexto IA-friendly?

## Principios

- Proteger fluxos que afetam dinheiro, compra, margem e decisao comercial.
- Melhorar jornadas de trabalho, nao apenas adicionar telas.
- Manter a stack simples enquanto a rotina ainda esta sendo validada.
- Separar regras por dominio antes de pensar em infraestrutura maior.
- Toda mudanca importante precisa deixar evidencia: smoke, contrato, doc,
  audit log, roteiro manual ou registro no handoff.
- Evoluir para standalone sem criar um "modo ERP" visivel: dados importados
  preservam origem externa; dados criados no app nascem como fonte do sistema.
- Posicionar o produto como Sistema Operacional de Gestao: uma infraestrutura
  operacional que conecta dados, semantica de varejo, processos, instrumentos,
  pessoas, acoes, decisoes e memoria.
- Priorizar autonomia operacional: visualizar, cruzar, filtrar, buscar, salvar
  visoes, comparar e trabalhar em lote vem antes de recomendacao do sistema.
- Evoluir gradualmente: comecar por cima de ERPs e planilhas, provar valor na
  gestao diaria e substituir partes da operacao quando houver maturidade.
- Ser IA-friendly por fundamento, nao IA-first por marketing: contratos claros,
  estados explicaveis, origem dos dados e pacotes de contexto antes de qualquer
  agente embutido.
- Diferenciar-se de ERPs comuns sem depender da comparacao: o Nexo deve nascer
  como categoria propria, com metodologia de gestao embutida no software.

## Fases ja consolidadas

### Fase 1: Confiabilidade

Status: fechada.

Evidencias:

- `scripts/smoke_checks.py` cobre schema, assets, contratos, resumo por periodo,
  reposicao, precificacao, cotacao, PDF, pedido, recebimento, importacao
  assistida, quarentena de produto corrompido e rotas HTTP.
- `/api/health` expoe estado minimo do schema e contratos cobertos.
- Endpoints centrais retornam contratos versionados e envelope de erro.
- O frontend valida payloads centrais com helpers de contrato.

### Fase 2: Organizacao Interna

Status: fechada.

Evidencias:

- `scripts/api_routes.py` concentra rotas GET/POST de dominio.
- `scripts/serve_app.py` ficou focado em ciclo HTTP, auth gate, webhook,
  arquivos estaticos, PDF e inicializacao.
- Regras vivem em modulos por area: importacao, reposicao, cotacao, margem,
  clientes, fornecedores, acoes, perfil da empresa, WhatsApp e auth.
- `schema_migrations` e `scripts/schema_upgrades.py` registram upgrades locais.
- O frontend foi extraido em modulos `web/app_*.js` por area, sem bundler.

### Fase 3: UX de Trabalho

Status: avancada, mas ainda precisa de roteiro de release.

Evidencias:

- Compras ganhou jornada operacional: fornecedor, itens, PDF/envio, resposta,
  pedido e chegada.
- Pedidos em aberto entram na reposicao como estoque projetado.
- Estoque, clientes e margem tem filas de decisao e acoes sugeridas.
- Importacao mostra qualidade, prontidao, conflitos e proximo passo.
- Acoes importantes gravam memoria operacional e audit log.

### Fase 4: Sistema Operacional de Gestao

Status: em definicao canonica.

Objetivo:

- Consolidar o Nexo como a infraestrutura operacional onde a empresa entende seu
  estado, organiza processos, cruza informacoes, filtra, busca, salva visoes,
  compara, trabalha em lote e cria memoria de gestao.
- Embutir uma metodologia de gestao no software: visualizar, filtrar, cruzar,
  comparar, selecionar, agir em lote, registrar e revisar.
- Evoluir acima dos ERPs e planilhas existentes, substituindo partes da operacao
  apenas quando o produto ja sustentar a rotina com seguranca.
- Tornar a base IA-friendly sem dependencia de IA embutida: dados legiveis,
  explicacoes por dominio, contratos estaveis e contexto exportavel.

Evidencias esperadas:

- Presets de visao por perfil, situacao e rotina operacional.
- Filtros combinaveis e salvos em mesas centrais.
- Busca, ordenacao, agrupamento, selecao e acoes em lote nas listas importantes.
- Paineis laterais de contexto interligado para produto, fornecedor e cliente.
- Pulso do Dia como visao operacional ampla, nao como lista de ordens.
- Registro de acoes/decisoes com dono, status, justificativa, origem e impacto.
- Fichas vivas por produto, fornecedor e cliente, reunindo dados, relacoes,
  historico e proximas decisoes.
- Rotinas operacionais configuraveis por area, com etapas, responsaveis,
  revisao e memoria.
- Pacote de contexto operacional exportavel para analise assistida externa.
- Linguagem de produto padronizada em torno de gestao, processos, decisoes,
  memoria e operacao do varejo, nao apenas dashboards.

## Produto Operavel

Status: parcial.

O produto ja tem uma parte relevante da camada operavel: autenticacao local,
admin de usuarios, permissoes por modulo, `audit_log`, rotas protegidas quando
existem usuarios, bloqueio de rede por padrao, `/api/health` e schema com
`organization_id`.

Ainda precisam de validacao explicita antes de beta:

- Isolamento multiempresa em rotas, queries, caches e telas.
- Backup/restauracao simples e testada para SQLite local.
- Roteiro de suporte: onde olhar quando importacao, cotacao, pedido ou WhatsApp
  falhar.
- Revisao de permissoes por modulo: usuario comum deve ver e acionar apenas o
  que recebeu.
- Roteiro manual de release candidate executado do primeiro acesso ao
  recebimento do pedido.

## Matriz de Prontidao

| Frente | Estado | Proxima evidencia |
|---|---|---|
| Smoke e contratos | Pronto | Rodar antes do RC e registrar resultado. |
| Auth/admin | Parcial alto | Testar bootstrap, login, logout, usuario comum e permissoes. |
| Importacao ERP | Parcial alto | Roteiro com arquivo novo, conflito, commit e qualidade pronta. |
| Relacionamentos auxiliares | Parcial | Validar marca-fornecedor, produto-marca e perfil de fornecedor. |
| Compras/reposicao | Parcial alto | Roteiro sugerido -> cotado -> comprado -> recebido -> impacto. |
| Reposicao v2 | Parcial | Comparar v1/v2 e decidir se v2 entra como principal ou diagnostico. |
| Margem/preco | Parcial alto | Testar edicao de custo/papel/preco alvo e audit log. |
| Clientes/oportunidades | Parcial alto | Testar fila de relacionamento e registro de contato. |
| WhatsApp CRM | Parcial | Testar sem credenciais e com credenciais em ambiente controlado. |
| Produto instalavel | Parcial | Validar instalacao real com perfil `config/white_label` e importacao nova. |
| Standalone gradual | Inicial alto | Expandir clientes, fornecedores e movimentos manuais seguindo a ficha operacional de produto. |
| Multiempresa | Parcial | Smoke/roteiro com duas organizacoes e dados isolados. |
| Backup/restauracao | Bloqueador | Implementar ou documentar rotina testada. |
| Deploy externo | Nao pronto | So depois de dados, acesso, backup e suporte definidos. |
| Sistema Operacional de Gestao | Inicial | Padronizar narrativa, presets de visao, filtros salvos, busca, selecao/lote, contexto interligado, fichas vivas e pacote IA-friendly. |

## Proxima Fatia

A proxima fatia continua sendo um release candidate de beta assistida, mas agora
com narrativa de produto ajustada: provar a mesa operacional de gestao antes de
adicionar novos modulos.

1. Inventariar o que entrou na working tree atual e decidir o que compoe o RC.
2. Rodar `scripts/smoke_checks.py`, `py_compile` dos modulos centrais e
   `node --check` nos scripts principais do frontend.
3. Executar roteiro manual: primeiro acesso, usuario, perfil da empresa,
   importacao, qualidade, reposicao, cotacao, PDF, resposta, pedido,
   recebimento, margem, clientes e audit log.
4. Fechar backup/restauracao local ou registrar isso como bloqueador formal.
5. Trocar defaults e copy hard coded por configuracao de instalacao, mantendo
   `import_practica.py` como conector legado da empresa piloto.
6. Transformar cadastros principais em rotinas de criacao/edicao no app, sempre
   marcando se o registro veio de fora ou nasceu no sistema.
7. Definir primeira versao do Sistema Operacional de Gestao: presets de visao,
   filtros salvos, busca, selecao/lote, contexto interligado, fichas vivas,
   rotinas operacionais e pacote de contexto IA-friendly.
8. Atualizar `HANDOFF.md`, `PROJECT_MAP.md` e docs de contratos quando o RC for
   estabilizado.
