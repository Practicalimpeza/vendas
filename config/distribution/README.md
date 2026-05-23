# Distribution

Esta pasta descreve o perfil usado para montar uma instalacao pre-personalizada
para um consultor.

O fluxo desejado e:

1. A plataforma gera um `platform.distribution.v1` para o consultor.
2. O pacote local recebe esse arquivo.
3. `scripts/partner_distribution.py apply --profile <arquivo>` aplica a marca
   e os metadados do consultor em `config/partners/default.json`.
4. O cliente final abre o sistema ja com a identidade do consultor e ativa a
   licenca por cliente ativo.

O perfil de distribuicao nao guarda dados operacionais do cliente. Ele deve
conter apenas marca, canal, modo de ativacao e metadados comerciais.
