# Motor do Nexo

O Motor do Nexo e a tela de explicabilidade do produto. Ele mostra quais skills
internas estao ativas, quais regras geram a Central de Acoes e por que uma
acao especifica apareceu.

## Implementado

- Aba `Motor`.
- Resumo de skills, regras, regras ativas e acoes atuais.
- Legenda de confianca:
  - ERP/importado;
  - inferido;
  - confirmado no Nexo;
  - decisao operacional.
- Cards de skills com versao e principios.
- Lista de regras da Central de Acoes com contagem atual.
- Botao `Por que?` nos cards da aba `Hoje`.
- Painel de explicacao com:
  - skill responsavel;
  - regra usada;
  - tipo da acao;
  - alvo;
  - motivo;
  - impacto;
  - dados usados no template.

## Por que isso importa

O Nexo nao deve parecer uma caixa preta. Para ganhar confianca do lojista e do
consultor de implantacao, cada recomendacao precisa ser explicavel.

O Motor tambem prepara o caminho para:

- auditoria de regras;
- versionamento de inteligencia;
- testes A/B de playbooks;
- agentes futuros usando as mesmas skills;
- interface interna de edicao segura das regras.
