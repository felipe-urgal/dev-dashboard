# Task 107 — E2E de mutações de branch Git: sucesso, erro, vazio e troca de projeto

## Objetivo

Continuar a frente aberta pela task 106: expandir o smoke E2E (Playwright)
para outro fluxo privilegiado ainda sem cobertura, mutações Git, cobrindo
criar branch, trocar de branch, recusa de nome duplicado, o estado vazio (um
projeto sem `.git`) e a troca de projeto — reduzindo o "fora de escopo" de
`apps/web/e2e/README.md` de "Git, scripts, banco" (já reduzido para "Git,
banco" na task 106) para só banco de dados.

## Por que branches, e não commit/stash/banco

Criar e trocar de branch sobre um repositório limpo é a mutação Git mais
barata de fixturar com segurança: não exige controlar uma árvore de trabalho
suja (commit/stash) nem um serviço de banco (snapshot/restore). O fixture
só precisa de um repositório Git real com um commit inicial.

## O que foi feito

- `apps/web/e2e/fixtures/server-harness.ts`: `sample-node-app` agora também
  é um repositório Git real — `git init -b main`, autor/committer fixos via
  variáveis de ambiente (`GIT_AUTHOR_*`/`GIT_COMMITTER_*`, não depende de
  `git config` global no runner de CI) e um commit inicial com todos os
  arquivos da fixture. Um `.gitignore` exclui o `.env` do commit (contém um
  valor de segredo de teste, sem motivo para versionar mesmo num fixture
  descartável).
- `apps/web/e2e/tests/project-git-branches.spec.ts` (novo):
  - **vazio**: `sample-rails-app` (sem `.git`) mostra "Este projeto não é um
    repositório Git.";
  - **sucesso**: cria `feature/e2e-branch` a partir de `main` (modal "Nova
    branch" → confirmação "Criar branch") e confirma a troca automática
    para a nova branch;
  - **erro**: tentar recriar o mesmo nome falha (alerta visível), sem trocar
    a branch atual;
  - troca de volta para `main` pela ação "Trocar" da própria linha
    (confirmação "Trocar de branch");
  - **troca de projeto**: volta para `sample-rails-app` e confirma que
    continua vazio, sem nenhuma branch ou mensagem do `sample-node-app`.
- `apps/web/e2e/README.md`: documenta a nova cobertura e reduz "fora de
  escopo" a commit/stash/banco (também corrige uma referência esquecida ao
  antigo nome do script `build` da task 106, que já tinha virado `format`).

## Decisões

- Nenhuma mudança em código de produto — só a fixture e o teste.
- **"Carregamento" não é asserido aqui.** Ao contrário dos scripts da task
  106 (onde dava para injetar um `setTimeout` proposital no comando), uma
  mutação de branch é uma chamada `git` local que termina rápido demais
  para o estado "ocupado" ficar observável de forma confiável no navegador,
  sem inventar um atraso artificial em código de produto só para o teste.
  Documentado aqui em vez de fingir que a cobertura existe.
- O `.env` do fixture ficou fora do commit inicial (via `.gitignore`) para
  não versionar nem um segredo de teste sem necessidade — a suíte de
  Variáveis de ambiente (`project-environment.spec.ts`) continua lendo o
  arquivo do disco, não do índice do Git.

## Validação

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run docs:api:check`
- `npm test`
- `npx playwright test --config=apps/web/e2e/playwright.config.ts` (suíte
  completa, 20/20, incluindo o novo `project-git-branches.spec.ts`)

## Limitações e próximo passo natural

Commit, stash e as operações de banco de dados (snapshot/restore) continuam
fora desta base — exigem fixtures mais elaboradas (árvore de trabalho suja
controlada, serviço de banco) do que a criada aqui. Candidatas a uma task
própria quando houver motivação concreta, não abertas automaticamente.

## Arquivos alterados

- `apps/web/e2e/fixtures/server-harness.ts`
- `apps/web/e2e/tests/project-git-branches.spec.ts` (novo)
- `apps/web/e2e/README.md`
- `tasks/107-playwright-git-branch-mutations.md` (este arquivo)
- `tasks/PENDENCIAS.md`, `tasks/NEXT.md`, `tasks/PARALLEL-WORK.md` (reconciliação)
