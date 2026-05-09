# Metodo de Trabalho: Modelar, Grelhar, Executar

Este metodo adapta para o NexoVarejo duas ideias boas do fluxo popularizado por
Matt Pocock: primeiro modelar o dominio, depois usar uma entrevista estilo
`grill-me` para pressionar lacunas antes de implementar.

O objetivo nao e burocracia. E evitar que o projeto avance em cima de uma ideia
meio entendida.

## Quando usar

Use este metodo antes de mudancas que alterem produto, dados, arquitetura,
skills, onboarding, importacao ou rotinas principais do gestor.

Nao precisa usar para ajuste pequeno, texto simples, bug isolado ou melhoria sem
decisao de produto.

## Passo 1: Domain model primeiro

Antes de propor solucao, nomeie o dominio:

- entidades principais;
- estados e transicoes;
- eventos relevantes;
- dados importados, inferidos, manuais e operacionais;
- invariantes que nao podem quebrar;
- linguagem que o gestor entenderia;
- arquivos de codigo/docs/skills que ja implementam parte disso.

Resultado esperado: uma lista curta de conceitos e relacoes. Se o codigo ja
responde uma pergunta, leia o trecho relevante em vez de perguntar ao usuario.

## Passo 2: Grill-me da decisao

Depois do modelo, pressione a decisao com perguntas uma por vez.

Regra de entrevista:

- fazer uma pergunta por vez;
- explicar por que a pergunta importa;
- oferecer uma resposta recomendada;
- esperar confirmacao ou ajuste;
- explorar o codigo quando a resposta estiver no projeto;
- parar quando as principais ramificacoes estiverem resolvidas.

O tom deve ser firme, mas util. A meta e clareza, nao vencer debate.

## Perguntas-base para o NexoVarejo

- Quem e o operador real desta rotina: dono, comprador, consultor ou agente
  interno?
- Qual decisao humana fica mais facil depois desta mudanca?
- O dado vem do ERP, do Nexo, de inferencia ou de decisao operacional?
- O que nao pode ser sobrescrito por uma nova importacao?
- O que acontece com baixa confianca ou dado ausente?
- Qual status ou transicao precisa ficar auditavel?
- Que skill interna explica essa recomendacao?
- Que parte do monolito fica mais acoplada ou mais facil de extrair?
- Qual smoke test provaria que nao quebramos o fluxo?
- Qual doc vivo precisa ser atualizado no final?

## Passo 3: Registrar decisao

Ao final, atualize pelo menos um destes lugares:

- `HANDOFF.md`, quando mudar estado, foco ou forma de continuar;
- doc canonico da area em `docs/`;
- skill em `nexo_skills/`, quando virar regra explicavel;
- comentario curto no codigo, quando a regra nao for obvia.

Evite criar documento novo para cada microdecisao. Prefira consolidar no doc da
area.

## Passo 4: Executar em fatias

Depois de decidido, implemente em fatias verificaveis:

1. menor mudanca que preserva comportamento;
2. ajuste de docs/skills junto do codigo;
3. verificacao local;
4. registro no `HANDOFF.md` se a sessao alterou o estado do projeto.

## Definicao de pronto

Uma mudanca importante so esta pronta quando:

- a decisao principal foi explicitada;
- os estados e dados canonicos foram respeitados;
- o comportamento foi verificado;
- docs ou skills relevantes foram atualizados;
- a proxima sessao consegue entender o que mudou lendo `HANDOFF.md`.
