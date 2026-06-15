# Handoff do Projeto

Atualizado em: 2026-06-11

Este arquivo deve ser mantido atualizado sempre que uma sessao fizer mudancas
relevantes de produto, arquitetura, dados, docs ou skills. A funcao dele e
ajudar uma nova sessao a continuar sem reabrir tudo.

## Leia nesta ordem

1. `AGENTS.md` - regras operacionais e cuidado com dados sensiveis.
2. `HANDOFF.md` - estado vivo e proximos passos.
3. `PROJECT_MAP.md` - mapa atualizado da arquitetura e dos riscos.
4. `docs/README.md` - indice vivo da documentacao.
5. `docs/20_estado_atual.md` - snapshot do produto implementado.
6. `docs/22_roadmap_produto_final.md` - prontidao de beta e bloqueadores.
7. `docs/23_contratos_api.md` - contratos de endpoints centrais.
8. Documento especifico da area que sera alterada.

## Estado atual

- Momento: beta assistida em consolidacao, nao apenas prototipo local.
- Visao canonica: NexoVarejo e o Sistema Operacional de Gestao para empresas do
  varejo, uma nova categoria que combina infraestrutura operacional,
  metodologia de gestao embutida, dados conectados, processos adaptaveis,
  visualizacao ampla, filtros, buscas, presets, trabalho em lote, memoria
  operacional e base IA-friendly.
- Guardrail de produto: autonomia do operador acima de recomendacao do sistema.
  O forte do Nexo e permitir o operador visualizar tudo, cruzar informacoes, filtrar, buscar, salvar
  visoes, comparar, selecionar e trabalhar em lote.
- Comando de verificacao principal: `python scripts\smoke_checks.py`.
- Stack mantida: Python padrao, SQLite, HTML/CSS/JS vanilla, sem build step.
- Nao mexer agora: Postgres, frameworks, dependencias instaladas novas e deploy
  com dados reais.
- O servidor bloqueia exposicao fora de localhost salvo com
  `PULSO_ALLOW_NETWORK=1` (alias legado `NEXOVAREJO_ALLOW_NETWORK` continua aceito).
- Durante desenvolvimento local, e possivel iniciar sem login com
  `PULSO_DEV_AUTH_BYPASS=1`. O bypass cria apenas um usuario admin temporario
  em memoria (`Dev sem login`), nao grava senha/sessao e fica automaticamente
  desativado se `PULSO_ALLOW_NETWORK=1` ou `NEXOVAREJO_ALLOW_NETWORK=1`
  estiver ativo.
- Dados reais da Practica continuam sensiveis: nao ler CSVs sem necessidade,
  nao expor, nao comitar bancos, outputs ou derivados.

## Produto implementado

- Importacao Practica com `incremental_sync`, preservando historico e evitando
  duplicidade de fatos iguais.
- Importacao assistida ERP com preview, mapeamento, conflitos manuais, commit,
  `quality`, `readiness`, issues, mudancas pendentes e proximo passo.
- Importacoes auxiliares de relacionamentos: marca-fornecedor, produto-marca,
  produto-fornecedor preferencial e perfis de fornecedores.
- Reposicao v1 e motor v2, com comparacao, sinais de demanda, sazonalidade,
  cobertura, ABC, ruptura, excesso, pedido minimo e pedidos em aberto.
- Compras com jornada fornecedor -> itens -> PDF/envio -> resposta -> pedido
  -> recebimento.
- Pedidos em aberto entram na reposicao como estoque projetado.
- Precificacao acionavel com custo, papel do produto, margem, preco alvo e
  auditoria.
- Clientes, servicos e oportunidades com filas de relacionamento.
- Central de Acoes, Motor do Nexo, maturidade, skills internas e memoria
  operacional.
- Perfil da empresa.
- Auth local com bootstrap do primeiro administrador, login/logout, sessoes,
  permissoes por modulo e administracao de usuarios.
- WhatsApp CRM com webhook, conversas, agentes, departamentos, eventos, fila e
  envio via Cloud API quando configurado.

## Arquitetura atual

- `scripts/serve_app.py`: ciclo HTTP, conexao, auth gate, PDF, webhook
  WhatsApp, estaticos e inicializacao.
- `scripts/api_routes.py`: mapa GET/POST das rotas de dominio.
- `scripts/auth.py`: bootstrap, login, sessoes, permissoes e usuarios.
- `scripts/api_contracts.py`: validadores de contratos centrais e health.
- `scripts/schema_upgrades.py`: upgrades locais registrados em
  `schema_migrations`.
- `scripts/erp_import_flow.py`: importacao assistida de planilhas ERP.
- `scripts/relationship_imports.py`: importacao de vinculos e perfis
  auxiliares.
- `scripts/replenishment.py` e `scripts/replenishment_v2.py`: motores de
  reposicao.
- `scripts/quotes.py`: cotacoes, pedidos, PDF e recebimento.
- `scripts/pricing.py`, `scripts/commercial.py`, `scripts/supplier_ops.py`,
  `scripts/action_center.py`, `scripts/company_profile.py`,
  `scripts/whatsapp_crm.py`: regras por dominio.
- `web/index.html`: shell da SPA.
- `web/app_core.js`, `web/app_state.js`, `web/app_boot.js` e `web/app_*.js`:
  frontend modularizado sem bundler.
- `web/app.js` e `web/app.css`: ainda grandes; buscar trechos antes de ler ou
  editar.

## Trabalho recente relevante

- Portal do vendedor mobile: primeira view `/vendedor` criada como hub compacto
  para uso externo/mobile, com cartões para Clientes, Produtos, Vendas e Pedido
  PDF. A view reaproveita os dados carregados no app e encaminha para as telas
  existentes. O auth agora reconhece o papel `seller`, que ganha por padrao
  apenas `seller`, `customers`, `products` e `opportunities`; o admin de
  usuarios tem o checkbox "Vendedor externo" para aplicar esse perfil. Proximo
  passo e transformar os atalhos em fluxos mobile dedicados para visita/pedido.
- Clientes/CRM: a tela de Clientes passou a funcionar como mesa comercial para
  vendedores. A carteira ganhou status de carteira, ticket medio, dias com
  compra, receita de produtos/servicos e segmentos rapidos. O clique no cliente
  abre uma ficha CRM derivada do historico importado, com dados do cadastro,
  leitura de cadencia, mix de produtos, servicos, categorias, serie mensal e
  ultimas compras. O endpoint existente `/api/customer/mix` foi ampliado para
  retornar o contrato pratico `customer_profile.v1`. A camada manual de CRM
  entrou com a migracao `20260611_customer_crm_profile`, criando
  `customer_crm_profiles` e `customer_actions`. A ficha agora tem o bloco
  "Gestao comercial" para responsavel, status, prioridade, proxima acao, data,
  tags e observacao interna; a lista de clientes agrega `crm_status` e
  `crm_next_action_at`. Contratos novos: `/api/customer/crm`
  (`customer_crm.v1`) e `POST /api/customer/crm/upsert`.
- Catalogo negociado por cliente: a ficha CRM ganhou a aba "Catalogo do
  cliente", com persistencia propria no app. A migracao
  `20260610_customer_catalog` cria `customer_catalogs`,
  `customer_catalog_items`, `customer_catalog_events` e `product_media`.
  Vendedores podem adicionar itens do historico recorrente ou buscar produtos
  do cadastro geral que o cliente nunca comprou, salvar preco/desconto/minimo/
  validade/observacao, subir foto do produto e abrir uma versao imprimivel/PDF
  do catalogo. A aba tambem gera `POST /api/sales-order/pdf`, um pedido de
  venda operacional em PDF que aceita itens negociados e produtos avulsos do
  cadastro geral para o financeiro lancar manualmente no sistema da loja; nao
  cria venda fiscal nem baixa estoque. Contratos novos:
  `/api/customer/catalog`
  (`customer_catalog.v1`), `/api/products/search` (`products_search.v1`) e
  `/api/product/media/upsert` (`product_media.v1`).
- Banco online: nao migrar o SQLite direto para producao externa ainda. O
  caminho recomendado e transicao em etapas: portal/permissoes primeiro,
  escolha explicita de Postgres gerenciado ou libSQL/SQLite remoto depois,
  com dependencia Python aprovada, migracao testada, backup/restore e validacao
  de isolamento.
- Deploy do portal vendedor: para beta controlada, o caminho documentado em
  `docs/26_deploy_portal_vendedor.md` e publicar o codigo em repositorio
  privado, usar volume persistente para `PULSO_DATA_DIR`, liberar rede com
  `PULSO_ALLOW_NETWORK=1`, `PULSO_HOST=0.0.0.0` e manter SQLite/arquivos do
  tenant fora do GitHub. `railway.json` fixa o start command e o healthcheck
  publico `/healthz`. Isso nao substitui a migracao futura para banco online.
- Auth/desenvolvimento: `scripts/auth.py` ganhou bypass local por
  `PULSO_DEV_AUTH_BYPASS=1`, retornando usuario admin temporario em
  `/api/auth/me` com `dev_auth_bypass=true`. O frontend mostra "Dev sem login"
  no topo e esconde logout nesse modo. A trava impede o bypass quando o app esta
  exposto na rede via `PULSO_ALLOW_NETWORK`/`NEXOVAREJO_ALLOW_NETWORK`.
- Direcao ERP/standalone: o produto passa a evoluir como operacao hibrida
  natural. A regra de produto e que o sistema trabalha com o que existe:
  registros importados preservam origem externa; registros e rotinas criados no
  app nascem como dados do sistema. A primeira base tecnica entrou no schema com
  `operational_data_sources`, `entity_source_links` e `entity_field_controls`,
  registrada pela migracao `20260522_operational_data_sources`, para permitir
  ERP integrado ou standalone sem exigir uma tela de "modo de operacao" do
  cliente. Guardrail aplicado: campos marcados como controlados pelo app nao sao
  sobrescritos por novas importacoes; produto/cliente/fornecedor preservam
  edicoes locais e a importacao atualiza apenas presenca/campos ainda livres.
- Produtos/standalone: primeira ficha operacional de produto criada na tela de
  Produtos. O backend ganhou `/api/products/upsert` em `product_views.py` para
  criar/editar produto, marca, categoria, fornecedor preferencial,
  identificadores e regras de compra, marcando campos como controlados pelo app.
  A listagem de produtos agora inclui itens ativos sem venda no periodo, para
  cadastros standalone aparecerem imediatamente na base do mix.
- Higiene de produtos: `scripts/schema_upgrades.py` ganhou a migracao
  `20260522_corrupt_product_code_quarantine`, que isola produtos ativos com
  `source_code` corrompido ou concatenado e sem vendas/cotacoes/pedidos. A
  rotina nao apaga fatos, preserva snapshots, marca o produto como inativo,
  troca o codigo visivel por `corrupt_<hash>` e registra auditoria. Em
  `data/nexovarejo.db`, os dois produtos bizarros de `org_teste` foram
  removidos definitivamente a pedido do usuario, com backup local antes da
  remocao em `data/nexovarejo.pre_corrupt_product_delete_20260522_095122.db`.
- Visao de produto fixada em `docs/00_visao_produto.md` e
  `docs/25_mesa_de_gestao.md`: o NexoVarejo/Pulso deve ser uma ferramenta de
  clareza e gestao completa, nao um assistente que tenta guiar o usuario. A
  interface deve oferecer lentes, instrumentos, comparacao, simulacao, memoria e
  rastreabilidade, mantendo a decisao nas maos do gestor. Contrato central:
  o poder sempre esta na mao do operador; o sistema fornece a melhor maneira de
  trabalhar, fluida, facil e clara, com a melhor quantidade de dados e
  referencias possiveis para o operador tomar decisoes. Evitar copy
  prescritiva como "devo fazer", "proximo clique", "cotar agora" ou
  "revisar agora"; preferir dados, filtros, lentes, comparacao, simulacao e
  instrumentos sob controle do operador.
- Painel inicial redesenhado como cockpit BI denso: o topo glass concentra
  `Importar dados`, perfil e logout; o periodo universal saiu do topbar e virou
  controle individual de cada bloco do cockpit. A tela abre direto em
  `Analises`, com graficos ECharts, matriz executiva, mix, estoque, margem,
  produtos, clientes, fornecedores, servicos e dados importados.
  Pulso/Mesa/Potencial/Ferramentas/Trilhas/Implantacao ficam fora do padrao.
- Reformulacao de controle do Painel: a faixa `Mesa do operador` e os presets
  Essencial/Comprador/Comercial/Estoque/Consultor foram removidos. A primeira
  tela passa a ser montada pelos blocos ativos da mesa, com topbar glass para
  contexto e comandos diretos. O botao `Organizar` saiu do topo; cada bloco do
  cockpit pode ser ocultado diretamente, e o ultimo bloco `Adicionar` recoloca
  graficos, KPIs e tabelas ocultos. O HTML do Painel foi enxugado, removendo a
  grade estatica antiga de graficos que era substituida pelo cockpit em runtime.
- A tela inicial deixou de se chamar `Visao` na interface e passou a se chamar
  `Painel`, por ser um termo mais comum e profissional para sistema. O botao de
  ajustes no Painel agora abre um hub de `Personalizacao e configuracoes`, com
  entrada para personalizacao do painel do usuario, dados da empresa e
  identidade/estado do pacote do revendedor quando o modulo de distribuicao esta
  disponivel. A personalizacao de blocos do usuario continua local por enquanto
  (`localStorage`), sem nova migracao de schema.
- Margem: a aba foi reposicionada como `Auditoria de margem`, nao como
  precificador automatico. A UI deve mostrar evidencias, confianca do dado,
  referencia tecnica e proxima conferencia; evitar linguagem de "preco ideal",
  "preco alvo" como sugestao ou decisao automatica. O app nao altera preco de
  venda e a decisao continua no ERP.
- Qualidade de linguagem: iniciada correcao de acentuacao nos textos visiveis
  do frontend. Primeira passada cobriu topo/periodo, Painel, administracao,
  estado dos modulos, acoes rapidas, servicos, precos, cotacoes e importacao
  nos arquivos centrais carregados pela tela inicial. Nao voltar a remover
  acentos por padrao; usar portugues correto na UI.
- Produto instalavel: criada `scripts/app_config.py` com defaults de
  instalacao via variaveis `PULSO_*` e aliases legados `NEXOVAREJO_*`, rota
  publica `/api/app-config` e carregamento no frontend antes do login para nome,
  subtitulo e logo do app. Os defaults soltos de organizacao/empresa/loja em
  auth, perfil, importacao ERP, vinculos e acoes passaram a usar essa camada. A
  casca e os textos modulares do frontend/backend agora usam fallback generico
  ou o nome configurado pelo tenant/`PULSO_APP_NAME`; `import_practica.py` segue
  como conector legado da empresa piloto.
- White-label: a configuracao de instalacao foi estruturada em
  `config/white_label/default.json`, exemplos em `config/white_label/clients/`,
  assets publicos em `web/brand/` e overrides por tenant em
  `data/tenants/<cliente>/app_config.json` ou `PULSO_CONFIG`. O endpoint
  `/api/app-config` agora retorna o schema `pulso.white_label.v1`.
- Parceiros/distribuicao: o fluxo comercial foi organizado em
  `docs/24_fluxo_parceiros_distribuicao.md`. A decisao atual e instalacao local
  por cliente, consultor enviando pacote pre-personalizado e cobranca por
  cliente ativo. `scripts/installation_state.py` criou o contrato local
  `/api/installation` (`local_installation.v1`), com `installation_id`
  persistente em `data/local/installation.json` e estado de licenca local
  preparado em `data/local/license.json`.
- Onboarding: criada primeira experiencia de instalacao em `web/app_onboarding.js`
  e `scripts/onboarding.py`. Em banco vazio, o app mostra uma tela full-screen
  antes do login. O fluxo do cliente final agora comeca por Boas-vindas, pede
  poucos dados da empresa, cria o primeiro admin, usa a etapa Documentos apenas
  para a logo da empresa nos PDFs/relatorios e preserva o nome do sistema vindo
  do pacote do consultor. A etapa inicial nao coleta perguntas operacionais:
  apresenta a ideia de que quanto mais dados entram, mais inteligente o sistema
  fica, e posiciona a importacao como caminho para transformar produtos,
  estoque, vendas, clientes, fornecedores, servicos, precos e movimentacoes em
  uma mesa de operacao ampla. Loja principal, fornecedor, embalagem,
  unidade por caixa, pedido minimo, reposicao e estoque por loja devem ser
  inferidos depois pela importacao. A etapa Dados agora decide se a conclusao abre o
  importador assistido ou o painel; por padrao redireciona para
  `/importacao?onboarding=import`, destacando o upload e o mapeamento. A etapa
  Dados agora tambem permite escolher um primeiro arquivo dentro do onboarding e
  chama `/api/erp/import-preview` para mostrar uma leitura inicial sem gravar
  nada: tipo provavel, linhas, colunas, abas, usos no sistema e alertas de
  formato. A
  conclusao grava perfil/loja/admin, `app_settings:onboarding.state` e audit
  log. Se o backend receber empresa sem identificador, gera o id pelo nome
  informado em vez de cair em `org_default`.
  A atualizacao rapida por pasta tambem fica isolada por tenant: tenant novo sem
  `data/tenants/<cliente>/import_reference.json` nao herda `data/import_reference.json`
  nem lista fontes fixas da Practica no primeiro acesso.
  Reforco aplicado: com tenant ativo, `PULSO_CONFIG`/overrides globais nao
  alimentam defaults do cliente; perfil da empresa calcula logo padrao em tempo
  de uso; importacao/status/qualidade/referencias filtram a organizacao ativa; e
  caches runtime incluem o tenant na chave.
  O preview do importador assistido agora calcula `alignment` por aba e
  `assistant.alignment_warnings` quando encontra sinais de linhas desalinhadas
  com o cabecalho, para o modo guiado falar sobre o arquivo escolhido e orientar
  a conferencia antes de gravar.
  O acesso local foi organizado em tres entradas sobre o mesmo motor
  `scripts/tenant_launcher_web.pyw`: `Cliente.pyw` para cliente final,
  `Representante.pyw` para consultor/distribuidor e `Gestao plataforma.pyw`
  para a visao administrativa local. `Abrir sistema.pyw`, `Pulso.pyw` e
  `iniciar.bat` ficam como compatibilidade do modo cliente. O iniciador agora
  usa Edge/Chrome em modo aplicativo (`--app`) quando disponivel, com perfil
  local isolado em `data/local/desktop_windows/`, evitando barra de endereco,
  abas e exposicao visual de `localhost`. Ao escolher ou criar uma empresa, a
  propria janela do iniciador navega para o app do tenant; nao deve abrir uma
  segunda janela. A barra superior propria do iniciador (`.app-chrome`) foi
  ocultada para a tela abrir direto na central de clientes, e os headers das
  abas do app voltaram a ficar visiveis. A primeira camada de parceiro/consultor foi criada em
  `config/partners/default.json`; cada tenant aponta para o parceiro em
  `app_config.json` via `partner.id`, e o iniciador lista apenas clientes do
  parceiro ativo. A primeira base de pacote pre-personalizado entrou em
  `config/distribution/default.json` com aplicador
  `scripts/partner_distribution.py`; ela prepara marca/canal/licenca local para
  o consultor enviar ao cliente antes do onboarding. As primeiras telas locais
  desse fluxo entraram em `web/app_distribution.js` (`/distribuicao`) e
  `web/app_implementation.js` (`/implantacao`): a primeira mostra parceiro,
  pacote e estado de licenca; a segunda guia o cliente ate o primeiro valor
  real depois da instalacao. A tela do iniciador foi redesenhada como central de clientes,
  sem textos tecnicos, exibindo nome, logo, quantidade de usuarios e endereco da
  empresa quando existir. `scripts/tenant_launcher.py` fica como fallback de terminal;
  `scripts/tenant_launcher_gui.pyw` e a versao Tkinter anterior e nao e mais a
  entrada principal. Correcao de estabilidade em 2026-05-22: o iniciador espera
  a URL do app responder antes de navegar, grava logs em
  `data/local/launcher_logs/`, retorna erro visivel quando o servidor nao sobe e
  reaproveita um iniciador atualizado ja aberto do mesmo modo para evitar varias
  portas `8765+` e servidores duplicados. Ajuste em 2026-05-28: as entradas
  `.pyw` voltaram a abrir primeiro a central do iniciador; se houver ultimo
  cliente valido, a central faz o auto-start com barra de status visivel em vez
  de ficar sem resposta enquanto o servidor sobe.
  A navegacao principal preserva o dock flutuante no rodape como assinatura
  visual do app. A tentativa de trocar por lateral fixa foi revertida porque
  enfraquecia a experiencia; a organizacao de jornada deve ser trabalhada em
  estados, telas e linguagem, sem remover o dock.
  O dock deve mostrar apenas funcionalidades de uso diario do cliente
  (`data-nav-area="app"`). Rotas de onboarding/setup (`imports`,
  `implementation`) e internas/admin (`engine`, `distribution`, `admin`) ficam
  fora do dock e devem ser chamadas por fluxos guiados, URLs ou telas de
  configuracao apropriadas.
  Principio de UX: o operador deve sentir que ganhou uma mesa com ferramentas,
  leituras e comparacoes, nao que esta sendo carregado pelo sistema. Preferir
  linguagem como "ver", "comparar", "investigar", "montar", "registrar" e
  "decidir"; evitar tom paternalista de "o sistema recomenda", "resolva" ou
  "acao obrigatoria" nas telas de uso diario. A tela inicial foi reposicionada
  como `Painel`/`Mesa do operador`. A primeira camada de diferencial entrou no
  Painel com tres blocos: `Movimentos` (o que vale observar no recorte),
  `Ferramentas` (instrumentos para comparar/investigar/montar) e `Base`
  (mapa dos dados disponiveis e lacunas de leitura).
  O Painel tambem ganhou personalizacao de mesa em segunda camada: o botao de
  sliders abre o painel `Organizar painel`, com perfis rapidos (Gestor,
  Comprador, Comercial, Estoque e Consultor), arraste de blocos, tamanhos
  Foco/Normal/Aberto, ocultar/mostrar e restaurar padrao. A preferencia fica
  salva em `localStorage` (`pulso.dashboard.layout.v2`) com leitura legada de
  `pulso.dashboard.layout.v1`. O bloco de implantacao foi mantido como bloco
  opcional, mas sai da mesa padrao para nao misturar setup com operacao diaria.
  O Painel tambem ganhou o bloco `Potencial da mesa` e a biblioteca de leituras
  dentro de `Organizar painel`: eles mostram cruzamentos ja disponiveis e
  leituras que podem aparecer quando entram mais dados, usando linguagem de
  curiosidade e ganho operacional, nao cobranca.
  A primeira dobra do Painel foi reforcada com comandos diretos no hero
  (`Organizar painel`, `Conectar dados`, `Investigar mix`) e um resumo de fontes
  conectadas/leituras disponiveis calculado a partir da biblioteca de leituras.
  Depois disso, o Painel deixou de usar listas fixas para partes centrais:
  metricas do hero, sinais, ferramentas e mapa de fontes agora sao derivados do
  estado real das fontes, alertas e leituras liberadas. A tela deve evoluir com
  o uso/importacao em vez de parecer predeterminada.
  A assinatura visual inicial entrou em `web/app.css` com tokens `--mesa-*`,
  fundo claro com linhas de precisao, dock mais parecido com instrumento,
  trilhos laterais discretos em blocos/leituras e estados visuais de
  disponivel/desbloqueavel. Manter essa gramatica nas proximas telas em vez de
  criar estilos soltos por modulo.
  Proximo passo natural: persistir layout por usuario/tenant e evoluir cada
  area do dock para sua propria mesa de ferramentas.
  A Practica deixou de ser tratada como modo legado e agora existe como tenant normal em
  `data/tenants/practica/`, com banco, config, assets e referencia de
  importacao proprios. O modo sem `--tenant` fica apenas como compatibilidade.
  `initialize_schema` agora aplica `schema/canonical.sql` antes dos
  upgrades, corrigindo inicializacao real de banco vazio.
- Codigos de produto agora sao canonizados removendo zeros a esquerda
  (`00002284` e `2284` viram o mesmo `product_id`). A migracao
  `20260520_product_code_zero_unification` consolidou os duplicados locais,
  atualizou FKs de produto e restaurou nomes genericos `Produto N` a partir de
  `source_records` quando havia payload importado. Antes da correcao foi criado
  backup local `data/nexovarejo.pre_nome_restore_20260520_181617.db`.
- Docs vivos foram atualizados para refletir o estado real do projeto:
  `AGENTS.md`, `README.md`, `PROJECT_MAP.md`, `docs/README.md`,
  `docs/20_estado_atual.md`, `docs/22_roadmap_produto_final.md`,
  `docs/23_contratos_api.md` e este handoff.
- A narrativa de "prototipo local" foi substituida por "beta assistida em
  consolidacao".
- A narrativa de produto foi corrigida para "Sistema Operacional de Gestao para
  empresas do varejo": o Nexo comeca por cima de ERPs e planilhas, organiza
  contexto, processos, visoes, filtros, buscas, selecoes, instrumentos e memoria,
  e pode substituir partes da operacao com o tempo. A direcao tambem define o
  produto como IA-friendly sem exigir IA embutida nesta fase.
- `PROJECT_MAP.md` tambem foi alinhado a essa visao, registrando fundamentos,
  riscos de posicionamento e proximos passos como presets de visao, filtros
  salvos, busca, selecao/lote, contexto interligado, fichas vivas e pacote
  IA-friendly.
- O roadmap agora separa fases fechadas, frentes parciais e bloqueadores reais
  de beta.
- O mapa do projeto passou a listar auth/admin, WhatsApp CRM, perfil da empresa,
  importacoes auxiliares, reposicao v2 e frontend modular.
- O contrato de API passou a registrar rotas novas como contratos implicitos ou
  candidatas a contrato versionado.
- Compras: a montagem da cotacao passou a separar `supplier`, `assembly` e
  `review`; o filtro de itens incluidos virou `Cotacao` e o resumo final agora
  funciona como etapa de revisao antes do envio.
- Compras: a mesa de montagem separa filtros, busca/agrupamento e acoes em
  massa; a revisao mostra pendencias acionaveis e acoes destrutivas em lote
  pedem confirmacao.
- Compras: o cabecalho da mesa do fornecedor foi reconstruido como faixa
  operacional, com identidade/acoes, proxima decisao e metricas em areas
  separadas para evitar textos vazando dos blocos.
- Compras: a montagem passou a tratar filtros como lentes da mesa, com
  linguagem mais operacional (`Cotacao`, `Sugestao`, `Minimo`, `Fora do mix`) e
  um rodape sticky discreto com estado da cotacao e CTA de revisao.
- Compras: o detalhe flutuante do fornecedor agora traz `Criar cotacao` /
  `Retomar cotacao` e `Descartar cotacao` logo no topo, evitando que o usuario
  precise rolar ate o fim e que o dock da mesa encubra as acoes.
- Compras: o detalhe do fornecedor foi simplificado para reduzir redundancia,
  removeu o rotulo confuso de "sobra" e agora mostra apenas falta para minimo
  ou minimo atingido.
- UI: quando modal, detalhe flutuante de fornecedor ou drawer estiver aberto, a
  classe global `popup-open` faz os docks da tela sairem da area visivel.
- Compras: o detalhe de fornecedor deixou de ser popover vinculado a tabela e
  agora abre como overlay central com painel interno.
- Compras/UI: a ocultacao dos docks durante popups ficou mais rigida
  (`display:none` com `popup-open`, `supplier-popup-open` e seletores `:has`)
  para evitar dock visivel/blurado atras do overlay.
- UI: a regra de popup agora tambem oculta o dock global de navegacao
  (`.sidebar`, fixo no rodape central), nao apenas os docks internos de compras.
- Compras: removido o blur do overlay central do detalhe de fornecedor; o fundo
  fica escurecido sem distorcer a mesa por tras.
- Compras: o ciclo foi corrigido para cotacao -> resposta -> pedido aprovado
  -> chegada. Enviar cotacao nao cria `purchase_order`; a resposta registra
  disponibilidade, `confirmed_quantity`, prazo e observacoes e, por padrao,
  gera o pedido ja aprovado. Preco do fornecedor saiu da resposta e nao alimenta
  custo aprendido.
- Reposicao/compras: o horizonte do alvo tecnico passou a tratar cobertura como
  cobertura pos-entrega: `prazo + max(ciclo/recompra, cobertura_alvo)`. A mesa
  do fornecedor agora expõe decisao por item, risco antes da reposicao,
  necessidade bruta, quantidade tecnica, arredondamento, cobertura depois da
  sugestao e uma cesta deterministica para completar minimo/valor alvo com
  candidatos seguros. `suggested_quantity` continua representando inclusao
  automatica essencial; `technical_quantity` representa a quantidade-alvo que a
  cesta pode usar para completar o fornecedor.
- Atualizacao da formula: o motor V2 foi reposicionado para fornecedor primeiro.
  O horizonte automatico da compra agora nasce de `prazo do fornecedor + ciclo
  de revisao do fornecedor`, calculado pelo valor diario do mix versus pedido
  minimo/valor alvo. O campo legado de dias de cobertura fica neutro em modo
  automatico; ABC, sazonalidade e tags de demanda ajustam previsao e seguranca,
  mas nao comandam o horizonte por conta propria.
- Produtos: a ficha operacional deixou de expor dias de cobertura como campo
  editavel do produto. A tela mostra numeros calculados pelo motor (`ciclo
  fornecedor` e `horizonte motor`) para evitar que o usuario trate cobertura
  manual como parte normal do cadastro.
- Importacoes e mesa de compras tambem deixaram de gravar dias de cobertura como
  configuracao do produto; embalagem, fornecedor, minimo/maximo e bloqueios
  continuam como dados operacionais editaveis.
- Mesa de montagem do pedido foi reposicionada como tela operacional numerica:
  lista plana por padrao, filtros por condicao/valor/giro/cobertura, acoes em
  massa sobre o filtro visivel e colunas por categoria de decisao: Produto
  (codigo/nome/sinais), Posicao (estoque e cobertura atual), Alvo (estoque
  ideal/ponto), Sugestao (unidades, caixas e cobertura nova), Historico
  (total, 30d, 90d e maior venda), Pedido (quantidade editavel) e Valor
  (total, unitario e caixa). Detalhes completos ficam em hover para densidade
  sem cabecalhos longos. Agrupamento por decisao continua opcional.
- Formula: ruptura com histórico muito curto agora usa metodo
  `stockout_discovery_batch`, uma compra de descoberta. Venda unica recente nao
  vira ritmo diario normal; estoque negativo nao infla a primeira compra; o alvo
  fica limitado por embalagem/maior venda observada.
- Formula: o valor legado `14` em `order_review_cycle_days` continua tratado
  como fallback para preservar ciclo automatico por valor diario do fornecedor
  ate existir um campo explicito de ciclo manual.

## Proximos focos recomendados

1. Alinhar linguagem, telas e docs vivos ao posicionamento de Sistema
   Operacional de Gestao para empresas do varejo, priorizando autonomia,
   visualizacao ampla, filtros, presets e lote, sem prometer substituicao fiscal
   nem IA autonoma.
2. Congelar um release candidate da working tree atual: listar o que entra,
   o que fica fora e o que bloqueia beta.
3. Rodar verificacoes: `scripts/smoke_checks.py`, `py_compile` dos modulos
   centrais e `node --check` nos scripts principais do frontend.
4. Executar roteiro manual completo: primeiro acesso, usuario comum, perfil da
   empresa, importacao, qualidade, reposicao, cotacao, PDF, resposta, pedido,
   recebimento, margem, clientes, WhatsApp sem credenciais e audit log.
5. Validar auth e permissoes: bootstrap, login, logout, admin, membro,
   permissoes por modulo e rotas protegidas.
6. Validar isolamento multiempresa com duas organizacoes ou registrar lacunas.
7. Fechar backup/restauracao local ou tratar como bloqueador formal da beta.
8. Decidir papel da reposicao v2 no RC: motor principal, diagnostico ou
   comparativo.
9. Antes de novas mudancas de UX no Painel/dock/mesas, usar
   `docs/25_mesa_de_gestao.md` como norte: operador no controle, mesa
   personalizavel, filtros, buscas, presets, trabalho em lote, contexto
   interligado, memoria operacional e base IA-friendly.

## Cuidados permanentes

- Nao ler nem editar CSVs da raiz.
- Nao expor dados reais da Practica.
- Nao adicionar dependencias externas sem alinhamento.
- Nao editar `AGENTS.md` ou `PROJECT_MAP.md` sem confirmacao.
- Antes de editar arquivo existente, leia o trecho relevante.
- Se mexer em docs/skills, atualize este `HANDOFF.md`.
- Antes de mudanca grande, use `docs/21_metodo_de_trabalho.md`.

## Verificacoes uteis

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

```powershell
@'
import json
from pathlib import Path
for path in sorted(Path("nexo_skills").glob("*.json")):
    json.loads(path.read_text(encoding="utf-8"))
    print(path.name)
'@ | python -
```

```powershell
git status --short
```

## Como atualizar este arquivo

- Mantenha a data no topo.
- Registre mudancas relevantes em `Trabalho recente`.
- Atualize `Estado atual` quando uma premissa mudar.
- Atualize `Proximos focos recomendados` quando uma frente for concluida.
- Remova detalhes antigos que ja nao ajudam uma nova sessao.
