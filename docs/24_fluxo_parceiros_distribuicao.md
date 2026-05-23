# Fluxo de parceiros e distribuicao

Este documento organiza o modelo comercial e tecnico para vender o sistema por
consultores/parceiros, com instalacao local por cliente, marca do consultor e
cobranca por cliente ativo.

## Decisoes de produto

- O cliente final usa o sistema no dia a dia.
- Cada cliente deve ter instalacao local propria, com banco local proprio.
- O consultor entrega ou envia um pacote ja pre-personalizado com a identidade
  dele.
- A assinatura sera cobrada por cliente ativo.
- Dados operacionais do cliente nao sobem para a plataforma central por padrao.
- A plataforma central futura controla parceiro, licenca, clientes ativos,
  versoes e atualizacoes, nao produtos/vendas/clientes/fornecedores do cliente.

## Papeis

### Plataforma

Responsavel por:

- cadastro de parceiros;
- perfis de distribuicao;
- versoes do produto;
- validacao de licenca;
- cobranca por cliente ativo;
- limites comerciais;
- downloads/atualizacoes;
- suporte tecnico.

Nao deve guardar dados operacionais do cliente, salvo decisao explicita futura.

### Consultor / parceiro

Responsavel por:

- vender ou indicar o sistema;
- ter marca propria aplicada ao pacote;
- entregar o instalador/pacote pre-personalizado ao cliente;
- auxiliar a implantacao quando fizer parte do servico dele;
- acompanhar clientes ativos no portal futuro.

O consultor nao deve precisar editar codigo.

### Cliente / empresa

Responsavel por:

- instalar/rodar o sistema localmente;
- preencher onboarding;
- importar dados;
- cadastrar usuarios;
- usar o sistema no dia a dia;
- manter seus arquivos e banco local.

## Modelo de camadas

```text
Plataforma
  parceiros
  assinaturas
  clientes ativos
  versoes
  perfis de distribuicao

Consultor / parceiro
  marca
  canal
  modelos e preferencias

Cliente / empresa
  instalacao local
  tenant local
  banco SQLite local
  importacoes
  usuarios
  PDFs e outputs
```

## Fluxo comercial alvo

1. Plataforma cadastra o consultor.
2. Consultor define marca: nome, logo, cor e preferencias.
3. Plataforma gera um perfil `platform.distribution.v1`.
4. O pacote local recebe esse perfil.
5. O perfil e aplicado no pacote antes do envio ao cliente.
6. Cliente recebe o sistema ja com a marca do consultor.
7. Cliente abre o iniciador local.
8. Cliente cria/abre a empresa local.
9. Cliente conclui onboarding e importacao inicial.
10. Instalacao gera ou recebe `installation_id`.
11. Licenca e ativada como cliente ativo vinculado ao consultor.
12. Plataforma passa a cobrar por cliente ativo.

## Estados da instalacao local

```text
pacote_base
  Codigo sem dados de cliente e sem marca obrigatoria.

pre_personalizado
  Pacote recebeu partner/distribution profile do consultor.

instalado
  Cliente final abriu o sistema no ambiente local.

cliente_criado
  Tenant local da empresa foi criado.

onboarding_pendente
  Empresa ainda nao concluiu configuracao/importacao inicial.

ativo_local
  Cliente usa o sistema localmente.

licenca_ativa
  Instalacao validada pela plataforma central.

licenca_pendente_ou_expirada
  Sistema deve orientar regularizacao e manter politica justa de acesso.
```

## Arquivos locais

### Perfil de distribuicao

`config/distribution/default.json`

Representa o pacote que sera entregue ao cliente:

- `distribution.package_id`;
- `distribution.channel`;
- `distribution.activation_mode`;
- `distribution.billing_model`;
- `partner`;
- `license`;
- `client`.

Esse arquivo e entrada para o aplicador local.

### Parceiro aplicado

`config/partners/default.json`

Representa o consultor ativo nesta instalacao:

- `partner.id`;
- `partner.name`;
- `partner.logo_path`;
- `partner.accent_color`;
- `license.status`;
- `license.plan`;
- `license.billing_model`;
- `distribution.package_id`;
- `distribution.activation_mode`.

Esse arquivo e lido pelo iniciador local.

### Cliente local

`data/tenants/<cliente>/app_config.json`

Representa a empresa cliente:

- `partner.id`;
- `public.app_name`;
- `public.logo_path`;
- `defaults.company_name`;
- demais defaults locais.

O banco operacional fica em:

`data/tenants/<cliente>/database.sqlite3`

### Identidade da instalacao

`data/local/installation.json`

Criado automaticamente pelo endpoint `/api/installation` e pelo modulo
`scripts/installation_state.py`.

Campos principais:

- `installation_id`: identificador persistente da instalacao local;
- `partner_id`: parceiro aplicado no pacote;
- `package_id`: pacote de distribuicao aplicado;
- `activation_mode`: modo de ativacao;
- `billing_model`: modelo comercial;
- `active_tenant`: tenant aberto naquele processo.

Esse arquivo nao deve entrar no git nem ser reutilizado entre clientes.

### Licenca local

`data/local/license.json`

Arquivo reservado para a licenca local assinada/validada futuramente. Hoje o
sistema ja expoe um estado padrao quando ele ainda nao existe:

- `status = not_activated`;
- `client_status = pending_activation`;
- `billing_model = per_active_client`;
- `offline_grace_days` vindo do perfil do parceiro.

A assinatura criptografica da licenca ainda nao foi implementada.

## Comando atual para aplicar perfil

```powershell
python scripts\partner_distribution.py apply --profile config\distribution\default.json
```

No futuro, o gerador de instalador deve executar esse passo automaticamente ao
montar o pacote do consultor.

## Iniciador local

Entradas recomendadas:

```powershell
"Cliente.pyw"
"Representante.pyw"
"Gestao plataforma.pyw"
```

`Abrir sistema.pyw`, `Pulso.pyw` e `iniciar.bat` ficam como compatibilidade e
abrem o modo cliente.

As entradas `.pyw` abrem uma janela propria em modo aplicativo quando Edge ou
Chrome estiverem disponiveis. O sistema continua local e web por dentro, mas o
usuario nao ve barra de endereco, abas nem porta `localhost`. A selecao ou
criacao de empresa navega a mesma janela para o app do tenant, sem abrir uma
segunda janela.

Cada arquivo usa o mesmo motor (`scripts/tenant_launcher_web.pyw`) com modo
explicito:

- `Cliente.pyw`: entrada do cliente final para abrir a empresa local ou iniciar
  o onboarding.
- `Representante.pyw`: entrada do consultor/distribuidor para preparar ou abrir
  empresas cliente vinculadas ao parceiro ativo.
- `Gestao plataforma.pyw`: entrada administrativa local. Hoje apenas sinaliza a
  camada futura de portal central e abre instalações locais; nao substitui o
  portal central de licencas, pacotes e cobranca.

O modo cliente deve funcionar como primeira tela local do cliente:

- mostrar marca do consultor quando existir;
- listar empresas locais vinculadas ao parceiro aplicado;
- permitir criar a empresa cliente;
- abrir onboarding quando a empresa ainda estiver vazia;
- nao expor slug tecnico;
- nao mostrar detalhes de implementacao como porta, servidor ou banco.

## Telas do produto

### Cliente final

Fica dentro da instalacao local.

Telas necessarias:

- onboarding/implantacao assistida;
- importacao guiada;
- conferencia dos dados entendidos;
- perfil da empresa;
- usuarios;
- operacao diaria.

Objetivo: fazer o cliente chegar ao primeiro valor real sem entender termos
tecnicos como tenant, porta, banco ou pacote.

Estado atual no produto local:

- a tela `Implantacao` (`/implantacao`) consolida empresa, acesso, dados,
  conferencia e primeiro uso em uma jornada inicial;
- a tela usa `/api/onboarding`, `/api/installation` e, quando permitido,
  `/api/imports` para orientar o proximo passo sem mostrar termos tecnicos.

### Consultor / distribuidor

No curto prazo, existe dentro da instalacao local como a tela `Distribuição`.

Responsabilidades dessa tela:

- mostrar parceiro aplicado;
- mostrar pacote/canal;
- mostrar `installation_id`;
- mostrar estado local da licenca;
- preparar ativacao por cliente ativo.

Estado atual no produto local:

- a tela `Distribuicao` (`/distribuicao`) ja mostra parceiro, pacote,
  identificador da instalacao e estado da licenca local;
- o contrato `/api/installation` (`local_installation.v1`) e a base para a
  futura ativacao central.

No futuro, o consultor deve ter tambem um portal central para acompanhar todos
os clientes ativos. Esse portal nao deve ficar dentro da instalacao local do
cliente.

### Gestao da plataforma

Deve ser um portal central separado, usado por quem administra o negocio.

Telas necessarias:

- parceiros;
- clientes ativos;
- licencas;
- planos/cobranca;
- pacotes gerados;
- versoes;
- suporte;
- auditoria de ativacoes.

Essa gestao nao deve depender dos bancos locais dos clientes.

## Portal futuro da plataforma

O portal central deve existir fora da instalacao local e cobrir:

- parceiros cadastrados;
- clientes ativos por parceiro;
- geracao de pacote pre-personalizado;
- status de assinatura;
- versoes disponiveis;
- historico de ativacao;
- downloads;
- suporte.

Esse portal nao e pre-requisito para a instalacao local funcionar, mas e
necessario para cobranca recorrente profissional.

## Contratos futuros da plataforma central

Estes contratos ainda nao estao implementados, mas orientam a arquitetura para
nao prender a instalacao local a decisoes improvisadas.

### `POST /v1/installations/activate`

Entrada esperada:

- `installation_id`;
- `partner_id`;
- `package_id`;
- `activation_mode`;
- `billing_model`;
- dados minimos da empresa cliente, como nome e documento quando houver;
- versao do sistema.

Saida esperada:

- `license_status`;
- `client_status`;
- `active_client_id`;
- `plan`;
- `valid_until`;
- `offline_grace_days`;
- `signed_license`;
- mensagem orientativa para cliente/consultor.

Uso: primeira ativacao do cliente ativo.

### `POST /v1/installations/check`

Entrada esperada:

- `installation_id`;
- `active_client_id`;
- `partner_id`;
- `license_fingerprint`;
- versao do sistema.

Saida esperada:

- `license_status`;
- `client_status`;
- `valid_until`;
- `signed_license` quando precisar renovar;
- `allowed_actions`;
- mensagem orientativa.

Uso: renovacao periodica da licenca sem enviar dados operacionais.

### `GET /v1/releases/latest`

Parametros esperados:

- `partner_id`;
- `package_id`;
- versao local;
- canal.

Saida esperada:

- versao disponivel;
- URL ou manifesto de download;
- severidade da atualizacao;
- notas de migracao;
- hash/assinatura do pacote.

Uso: atualizador futuro.

## Dados que nao devem ir para a plataforma central

Por padrao, nao enviar:

- produtos;
- clientes finais da empresa;
- fornecedores;
- precos;
- custos;
- vendas;
- planilhas importadas;
- PDFs gerados;
- mensagens operacionais.

Excecoes futuras devem ser decisao explicita de produto, com consentimento e
documentacao de privacidade.

## Politica de licenca

Modelo inicial recomendado:

- cobranca por cliente ativo;
- ativacao por instalacao/cliente;
- tolerancia offline configuravel;
- sem bloqueio destrutivo de dados;
- quando expirar, bloquear novas rotinas criticas de escrita antes de bloquear
  consulta/exportacao;
- deixar claro ao cliente e ao consultor o motivo do bloqueio.

Campos ja previstos:

- `billing_model = per_active_client`;
- `activation_mode = per_client_activation`;
- `offline_grace_days`;
- `activation_url`.

Endpoint local ja reservado:

```text
GET /api/installation -> local_installation.v1
```

Esse contrato retorna `installation` e `license`, e deve ser a base da futura
tela de ativacao.

## Proximas etapas tecnicas

1. Criar assinatura/validacao criptografica do arquivo local de licenca.
2. Criar tela de ativacao da instalacao.
3. Definir contrato do servidor central de licenca.
4. Fazer o iniciador indicar estado da licenca sem assustar o cliente.
5. Criar rotina de geracao de pacote do consultor.
6. Separar backups locais por tenant.
7. Definir atualizador de versao.
