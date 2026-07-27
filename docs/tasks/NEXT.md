# Próxima atividade — 031: Migrations mutáveis (migrate, rollback, seed, prepare)

## Contexto

A task 030 entregou a parte somente-leitura de Rails: status de migrations e
lista de rotas, sem executar nenhuma mutação. O roadmap prevê agora a
contraparte mutável — `migrate`, `rollback`, `seed` e `db:prepare` — com
política de risco proporcional, no mesmo padrão de confirmação já usado
pelas mutações Git (`GitMutationOperation`, tasks 016/025/026) e pelo
catálogo de scripts (`ProjectScriptRisk`, `ScriptExecutionConfirmation`).

## Objetivo

Permitir rodar `db:migrate`, `db:rollback`, `db:seed` e `db:prepare` a partir
do painel de banco de um projeto Rails, com confirmação obrigatória antes de
qualquer execução, catálogo fechado de comandos (sem shell arbitrário) e
histórico/registro compatível com o resto do produto.

## Plano detalhado

1. Definir o catálogo fechado de operações mutáveis em
   `RailsInspectionService` (ou um novo `RailsMutationService`, se a mistura
   de responsabilidades ficar grande): `migrate` (`db:migrate`, sem versão
   específica nesta entrega), `rollback` (`db:rollback`, sempre um passo —
   `STEP=1` — sem parametrização de quantidade), `seed` (`db:seed`) e
   `prepare` (`db:prepare`). Reaproveitar a resolução bin/bundle já usada na
   task 030.
2. Modelar confirmação seguindo o formato de `GitMutationConfirmation`
   (token de curta duração, operação, alvo — aqui o ambiente/banco
   detectado — e expiração), em vez de inventar um mecanismo novo.
3. Rotas privadas: `POST /api/projects/:projectId/rails/migrate/confirm` (ou
   reaproveitar o padrão de confirmação de scripts, se fizer mais sentido
   depois de comparar os dois formatos existentes) seguida de
   `POST /api/projects/:projectId/rails/migrate`, e o equivalente para
   rollback/seed/prepare.
4. Reaproveitar `ProcessManager` para a execução em si (não é leitura
   pontual como a task 030 — pode ter saída longa em bancos grandes), no
   mesmo "slot" de processo de banco do projeto, com log e cancelamento.
5. Atualizar `ProjectDatabasePanel.vue`: ações de migrate/rollback/seed/
   prepare com confirmação explícita (modal ou passo intermediário, não um
   único clique), desabilitadas quando a operação já está em andamento, e
   atualização do status de migrations (task 030) após a conclusão.
6. Testes de serviço (catálogo de operações, confirmação expirada/reutilizada
   como as de Git, rejeição sem confirmação prévia), testes de rota, e ao
   menos um teste montado do painel cobrindo o fluxo de confirmação.

## Fora do escopo

- Seleção de versão específica para migrate/rollback (ex. `VERSION=`) ou
  rollback de mais de um passo.
- Diagnóstico de Bundler, Sidekiq, Webpack, generators ou credenciais.
- Suporte a múltiplos bancos por projeto.
- Qualquer execução em ambiente de produção (o catálogo assume
  desenvolvimento/teste local, coerente com o restante do produto).

## Critérios de aceite

- é possível rodar migrate/rollback/seed/prepare em um projeto Rails a
  partir do painel, com confirmação obrigatória antes de cada execução;
- nenhuma operação executa sem confirmação válida e não expirada;
- projetos sem Rails ou sem `bin/rails` continuam sem a seção, sem erro;
- `npm run typecheck`, `npm run build` e `npm test` passam com os novos
  testes de API e de componente.
