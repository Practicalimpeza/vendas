# Indice Vivo da Documentacao

Este diretorio mistura documentos canonicos do produto e registros de decisoes
que surgiram durante o MVP. A regra atual e simples: use poucos docs como fonte
primaria e trate os demais como aprofundamento por area.

## Leia primeiro

1. `../HANDOFF.md` - estado vivo para novas sessoes continuarem o trabalho.
2. `../PROJECT_MAP.md` - mapa operacional atualizado do projeto.
3. `20_estado_atual.md` - snapshot do produto implementado, riscos e foco.
4. `22_roadmap_produto_final.md` - prontidao de beta e bloqueadores reais.
5. `23_contratos_api.md` - contratos minimos dos endpoints centrais.
6. `24_fluxo_parceiros_distribuicao.md` - fluxo consultor, pacote e cliente.
7. `25_mesa_de_gestao.md` - UX da mesa, personalizacao e operador no controle.
8. `26_deploy_portal_vendedor.md` - roteiro de beta online para vendedores.
9. `00_visao_produto.md` - promessa, usuario e escopo.
10. `03_ingestao_e_padronizacao.md` - contrato de dados e reimportacao.
11. `21_metodo_de_trabalho.md` - como modelar, questionar e executar mudancas.
12. Documento especifico da area que sera alterada.

## Docs canonicos vivos

- Produto e estrategia: `00_visao_produto.md`, `20_estado_atual.md`,
  `22_roadmap_produto_final.md`, `25_mesa_de_gestao.md`.
- Dados e arquitetura: `02_modelo_canonico_sql.md`,
  `03_ingestao_e_padronizacao.md`, `23_contratos_api.md`.
- Implantacao e onboarding: `06_implantacao_novos_comercios.md`,
  `26_deploy_portal_vendedor.md`.
- Parceiros e distribuicao: `24_fluxo_parceiros_distribuicao.md`.
- Operacao do gestor: `07_motor_reposicao.md`, `09_fluxo_cotacoes.md`,
  `13_central_acoes.md`, `19_precificacao_periodo.md`.
- Inteligencia interna: `15_skills_internas_nexo.md`, `16_motor_do_nexo.md`.
- Metodo de trabalho: `21_metodo_de_trabalho.md`.

## Docs de aprofundamento

- `01_inventario_dados_exemplo.md` e `08_referencia_practica_navegacao.md`
  documentam contexto da Practica e nao devem ser lidos por padrao.
- `05_roadmap_operacional.md` guarda o roadmap historico da beta.
- `10_maturidade_nexo.md`, `11_trilhas_operacionais.md`,
  `12_inteligencia_comercial.md`, `14_decisao_mix_no_pedido.md`,
  `17_ciclo_cotacao.md` e `18_pedido_compra_canonico.md` guardam decisoes de
  produto ja incorporadas ao MVP/beta.

## Regra de manutencao

- Atualize este indice quando criar, arquivar ou consolidar docs.
- Atualize `../HANDOFF.md` quando uma mudanca alterar estado, foco ou forma de
  continuar o trabalho.
- Atualize `../PROJECT_MAP.md` quando a estrutura de arquivos, arquitetura ou
  riscos mudarem de forma relevante.
- Evite novos docs pequenos para cada microdecisao; prefira atualizar o doc
  canonico da area.
- Skills ficam em `nexo_skills/` e devem ser citadas nos docs apenas quando
  virarem comportamento de produto ou regra explicavel.
