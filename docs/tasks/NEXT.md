# Próxima atividade

## Task 103 — Dividir `GitService` e `ScriptExecutionService` por domínio

### Objetivo

Reduzir as duas classes de serviço que voltaram a crescer acima de 400
linhas depois da Fase 7 de refatoração (`docs/architecture/refactoring-arquivos-grandes.md`),
sem alterar nenhuma assinatura pública nem comportamento externo. `git-service.ts`
está em 583 linhas (já cresceu mais com a task 102) e `script-execution-service.ts`
em 628. Ambas já tiveram uma primeira passada de extração de funções livres
na Fase 7; falta dividir a própria classe por domínio, como já foi feito com
`ProcessManager` na Fase 6.

### Decisão principal

Seguir exatamente o padrão da Fase 6: cada classe vira um orquestrador fino
que delega para módulos por domínio, mantendo um único `Map`/mecanismo de
confirmação compartilhado (já extraído para `GitMutationConfirmationService`
no caso de `GitService`) injetado nos módulos que precisam dele, em vez de
duplicado. Nenhuma rota, contrato ou schema muda — é refatoração pura,
verificada pelos testes existentes de cada serviço.

### Escopo

- `GitService` (`apps/api/src/services/git-service.ts`, 16 métodos públicos):
  dividir em módulos por domínio dentro de `git-service/` — branch
  (`createBranch`/`switchBranch`/`pull`/`push`), arquivo
  (`stageFile`/`unstageFile`/`discardFile`/`removeUntrackedFile`), commit
  (`commit`/`amend`/`save`) e stash (`stashPush`/`stashPop`), além dos
  métodos de leitura (`getOverview`/`getDiffSnapshot`/`getFileDiff`/
  `getFileLines`) que podem continuar juntos por não compartilharem mutação;
- `ScriptExecutionService` (`apps/api/src/services/script-execution-service.ts`):
  mesma divisão por domínio das responsabilidades já visíveis nos 6 `Map`s
  privados (`executions`/`activeProjects`/`confirmations`/`pendingWrites`/
  `subscribers`/`eventTimers`) — provavelmente execução (start/stop),
  confirmação e eventos/subscribers como três frentes, a confirmar durante a
  implementation;
- meta de ~200 linhas por arquivo novo, mesma régua das fases anteriores;
- todos os símbolos hoje exportados de `git-service.ts`/`script-execution-service.ts`
  continuam reexportados de lá — nenhum import externo muda.

### Critérios de aceite

- `git-service.ts` e `script-execution-service.ts` ficam abaixo de ~400
  linhas cada, contendo só a classe orquestradora;
- `npm run typecheck`, `npm run build` e `npm test` continuam verdes sem
  nenhuma mudança nos testes existentes de `git-service`/`git-service-mutations`/
  `git-service-diff`/`git-amend-all-changes`/`git-file-confirmation-route`/
  `git-sync-service`/`script-execution-service`/`script-events-route`;
- nenhuma rota, schema de resposta ou tipo em `packages/contracts` muda;
- `docs/architecture/refactoring-arquivos-grandes.md` ganha uma nova entrada
  de fase registrando a divisão e o inventário atualizado de arquivos acima
  de 400 linhas.

### Fora de escopo

- mudar comportamento de qualquer operação Git ou de script;
- extrair `ProjectGitPanel.vue`/`ProjectGitBranchesPage.vue` ou os demais
  componentes Vue acima de 400 linhas listados no reinventário da Fase 7 —
  ficam para uma entrega própria de frontend;
- revisitar o mecanismo de confirmação compartilhado além de injetá-lo nos
  novos módulos.
