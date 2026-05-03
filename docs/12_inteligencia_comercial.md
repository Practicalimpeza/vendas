# Inteligencia Comercial

Esta frente transforma o historico importado em acoes comerciais pequenas,
claras e acionaveis. O objetivo nao e criar uma central de CRM pesada no inicio,
mas mostrar ao lojista onde existe receita recuperavel ou mudanca de ritmo.

## Primeira versao implementada

- Clientes em risco.
- Clientes com recompra provavel.
- Produtos ganhando ou perdendo ritmo.
- Marcas ganhando ou perdendo ritmo.
- Explicacao curta do motivo de cada leitura.

## Como o calculo funciona

O app usa a data mais recente da propria base importada, e nao a data atual do
computador. Isso evita distorcer uma base historica exportada em outro momento.

Para clientes, o Nexo agrupa vendas de produtos e servicos por cliente e dia.
Depois calcula:

- primeira compra;
- ultima compra;
- quantidade de dias com compra;
- receita total;
- ticket medio;
- intervalo medio entre compras;
- dias desde a ultima compra;
- proxima compra estimada.

Um cliente vira `em risco` quando passou da cadencia esperada. Um cliente vira
`recompra proxima` quando esta perto da janela normal de nova compra.

Para produtos e marcas, o Nexo compara os ultimos 90 dias da base contra os 90
dias anteriores.

## Principio de UX

A tela deve sugerir proximas acoes pequenas:

- recuperar 1 cliente em risco;
- contatar 1 cliente com recompra provavel;
- investigar 1 produto em queda.

Isso segue a tese de implantacao do produto: entregar valor com os dados atuais
e pedir mais informacao apenas quando ela desbloqueia uma melhoria visivel.

## Proximos desbloqueios

- Registrar uma acao comercial feita pelo usuario.
- Criar lembrete de retorno.
- Separar clientes por tipo de compra: produtos, servicos ou ambos.
- Recomendar mix provavel por cliente.
- Detectar lacunas: cliente compra categoria A, mas nunca compra categoria B.
- Medir recuperacao depois da acao.
- Transformar bons resultados em trilhas operacionais recorrentes.
