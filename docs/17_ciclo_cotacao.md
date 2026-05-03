# Ciclo de Cotacao

## Objetivo

Fechar o primeiro ciclo operacional de compra: o Nexo sugere a cotacao,
o operador envia ao fornecedor, registra a resposta e o sistema transforma
essa resposta em memoria operacional.

## Dados registrados na resposta

- Preco unitario cotado.
- Embalagem ou divisor informado pelo fornecedor.
- Prazo de entrega em dias.
- Disponibilidade: disponivel, parcial, indisponivel ou sem cotacao.
- Observacao livre: validade, condicao comercial, substituicao ou restricao.

## Aprendizado gerado

Quando a resposta tem fornecedor vinculado, produto e algum dado operacional
util, o Nexo atualiza `supplier_product_rules` com custo, embalagem, prazo e
referencia do fornecedor. Se o produto ainda nao tinha embalagem configurada,
o Nexo tambem preenche `product_settings.package_size`.

Esses dados sao canonicos do Nexo, porque nascem de uma acao operacional do
gestor dentro do sistema. Eles nao alteram nome, codigo interno, estoque ou
venda importados do ERP.

## Comportamento na Central de Acoes

- Cotacao em rascunho gera acao de envio.
- Cotacao enviada gera acao de registrar resposta.
- Ao salvar resposta com conteudo, a acao relacionada e concluida.

## Principio de UX

A tela deve deixar claro o que esta acontecendo sem exigir cadastro completo
no inicio. Mesmo uma resposta parcial ja melhora o motor: um prazo aprendido,
um divisor descoberto ou uma indisponibilidade informada reduzem ruido na
proxima compra.
