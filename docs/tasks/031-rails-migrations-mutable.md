# Task 031 — Migrations mutáveis (migrate, rollback, seed, prepare)

## Status

Concluída.

## Objetivo

Permitir rodar `db:migrate`, `db:rollback` (um passo), `db:seed` e
`db:prepare` a partir do painel de banco de um projeto Rails, com
confirmação obrigatória antes de qualquer execução e catálogo fechado de
comandos.

## Escopo entregue

- Catálogo fechado de 4 operações em `RailsInspectionService`
  (`RAILS_MIGRATION_MUTATION_ARGS`): `migrate` → `db:migrate`, `rollback` →
  `db:rollback STEP=1` (sempre um passo), `seed` → `db:seed`, `prepare` →
  `db:prepare`. Reaproveita a resolução bin/bundle já usada pela task 030.
- `prepareMutationConfirmation`/`runMutation`, seguindo o mesmo formato de
  confirmação do `GitService` (token de 32 bytes, TTL de 60s, consumo único
  validado por projeto+operação) em vez de inventar um mecanismo novo.
- Rotas `POST /api/projects/:projectId/rails/migrations/confirmations` e
  `POST /api/projects/:projectId/rails/migrations/mutations`.
- `ProjectDatabasePanel.vue`: seção "Operações" no card de Migrations com um
  botão por operação, cada um atrás de um `window.confirm` (mesmo padrão do
  `ProjectGitPanel.vue`), desabilitados enquanto qualquer mutação está em
  andamento, com a saída do comando (mascarada) exibida após a execução e
  o status de migrations recarregado automaticamente ao final.
- Testes de serviço (execução após confirmação válida, args de cada
  operação, rejeição sem confirmação, rejeição de token de operação
  diferente, token de uso único, ausência de Rails, falha de execução
  reportada como `succeeded: false` com a saída capturada, mascaramento de
  segredos na saída), testes de rota (fluxo confirmação→execução, rejeição
  sem confirmação com 409) e teste montado do painel cobrindo o fluxo
  completo de confirmação e recarregamento.

## Decisões e limitações

- A execução roda como um comando pontual via `execFile` (mesmo modelo da
  task 030), não como processo gerenciado pelo `ProcessManager` — diferente
  do plano original em `NEXT.md`. Migrate/seed/rollback/prepare em bancos de
  desenvolvimento locais tipicamente terminam em segundos; tratar como
  execução síncrona evitou duplicar um motor de spawn/log/histórico só para
  esta entrega, no mesmo espírito das mutações Git (`commit`, `pull`,
  `push`), que também são síncronas. Se no futuro isso se mostrar
  insuficiente (migrations muito longas), migrar para `ProcessManager` é
  uma mudança isolada ao serviço, sem afetar o contrato público.
- Sem seleção de versão específica para migrate/rollback (`VERSION=`) nem
  rollback de mais de um passo — cada clique em "Rollback" desfaz
  exatamente uma migration.
- Falha de execução (ex. erro de sintaxe numa migration) não lança erro HTTP
  — a rota responde 200 com `succeeded: false` e a saída do comando, para o
  usuário ver o que aconteceu, no mesmo espírito de como o painel de testes
  já reporta falhas via `exitCode` em vez de um erro genérico.
- Sem histórico persistido dessas execuções (diferente do histórico de
  testes da task 028) — cada mutação mostra apenas seu resultado mais
  recente na tela; unificar com um histórico geral fica para quando (e se)
  o painel de atividade global cobrir mutações privilegiadas.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

## Fora do escopo

- Seleção de versão específica para migrate/rollback ou rollback de mais de
  um passo.
- Diagnóstico de Bundler, Sidekiq, Webpack, generators ou credenciais.
- Suporte a múltiplos bancos por projeto.
- Histórico persistido das execuções de mutação.
- Qualquer execução em ambiente de produção.
