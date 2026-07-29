# Protótipos para a visualização de testes

Este documento registra três direções visuais para redesenhar a aba **Testes** do projeto antes de alterar o componente de produção `apps/web/src/components/ProjectTestsPanel.vue`.

Os protótipos preservam o shell visual atual do Dev Dashboard e foram desenhados a partir dos dados que já existem no frontend e nos contratos atuais:

- comandos e runners detectados;
- execução atual, status, timestamps, comando, argumentos e exit code;
- log da execução atual;
- histórico persistido com comando, arquivo alvo, status, início, término e exit code.

Não foi proposta contagem de casos, cobertura ou log histórico, pois esses dados ainda não fazem parte do contrato atual.

## Opção A — Painel operacional

Equilibra execução, diagnóstico e histórico em uma única tela:

- resumo da última execução no topo;
- comandos disponíveis em cartões compactos;
- última execução e prévia do log em destaque;
- histórico em tabela curta na parte inferior.

**Vantagens:** leitura rápida, pouca mudança no fluxo atual e boa visibilidade durante uma execução.

**Custo relativo:** médio.

**Indicação:** melhor ponto de partida para a implementação.

## Opção B — Timeline de execuções

Transforma o histórico no eixo principal da tela:

- execução rápida no topo;
- timeline cronológica à esquerda;
- painel de detalhes da execução selecionada à direita;
- repetição e cópia do comando a partir do detalhe.

**Vantagens:** excelente para investigação e comparação de execuções.

**Limitação atual:** execuções antigas possuem metadados, mas não possuem log persistido.

**Custo relativo:** médio para alto, principalmente pelo estado de seleção e comportamento responsivo do painel dividido.

## Opção C — Tabela compacta

Prioriza densidade e operação de muitos registros:

- indicadores resumidos;
- filtros por status e runner;
- busca por comando ou arquivo;
- comandos e execuções reunidos em uma tabela operacional.

**Vantagens:** aproveita muito bem telas grandes e escala para históricos maiores.

**Custo relativo:** alto, devido a filtros, busca, expansão de detalhes e adaptação para telas menores.

## Decisão sugerida

1. Implementar a **Opção A** como base.
2. Reaproveitar da **Opção B** a ação de repetir uma execução e a inspeção detalhada.
3. Reservar filtros e busca da **Opção C** para quando o histórico crescer ou ganhar mais metadados.

## Próxima etapa após aprovação

- transformar a direção escolhida em componentes Vue reutilizáveis;
- manter as APIs atuais sempre que possível;
- adicionar testes de componente para estado ocioso, execução em andamento, falha, sucesso, arquivo alvo e histórico vazio;
- validar tema claro, tema escuro e viewport móvel.

Nenhum código da aba de testes foi alterado nesta branch; ela contém somente a documentação de decisão dos protótipos.
