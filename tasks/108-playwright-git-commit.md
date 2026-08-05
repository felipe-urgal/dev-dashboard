# Task 108 — E2E de commit Git: vazio, sucesso e troca de projeto; achado do stash sem UI

## Objetivo

Continuar a frente das tasks 106/107: expandir o smoke E2E (Playwright)
para o commit Git — vazio (árvore limpa), sucesso (commit com confirmação)
e troca de projeto.

## Escopo reduzido a commit, sem stash

O plano original desta task incluía stash. Ao investigar a UI para
escrever o teste, `ProjectGitPanel.vue` não tem nenhuma aba, botão ou rota
para stash — a lista de abas é Sincronização/Branches/Diff/Commit/
Desfazer/Pull Request/Histórico/Mutações. `apps/web/src/git-stash-enhancer.ts`
(o script vanilla-DOM que injetava essa UI antes da migração para Vue,
866 → 249 linhas depois da Fase 5 de `docs/architecture/refactoring-arquivos-grandes.md`)
existe no repositório mas não é mais importado por `apps/web/src/main.ts` —
diferente de `git-history-page-enhancer.ts`, que foi de fato removido
quando o Histórico virou componente Vue (task 052). A API
(`apps/api/src/routes/git-stash.ts`, `GitStashService`,
`apps/web/src/api/git.ts` com `stashPushProjectGit`/`stashPopProjectGit`)
continua ativa e testada, só sem consumidor no frontend.

Não dá para escrever E2E de uma UI que não existe. Registrado como um item
próprio em `tasks/PENDENCIAS.md` (decisão pendente: remover o código órfão
ou reconstruir a UI), e removidas as menções a "stash" como capacidade
entregue em `README.md` e `tasks/roadmap.md`, que estavam desatualizadas.

## O que foi feito

- `apps/web/e2e/fixtures/runtime-info.ts` e `global-setup.ts`: o
  `workspaceDirectory` da fixture agora é exposto no `RuntimeInfo`
  compartilhado, para specs que precisem manipular arquivos do projeto
  diretamente pelo disco (não há editor de arquivo no fluxo de commit).
- `apps/web/e2e/tests/project-git-commit.spec.ts` (novo):
  - **vazio**: árvore limpa mostra "0 alterações rastreadas" e o botão
    "Criar commit" desabilitado (a fixture chega limpa porque a task 107
    já deixa a branch "main" sem pendências ao final do seu próprio teste);
  - modifica `package-lock.json` (já rastreado) direto no disco via
    `node:fs/promises`, recarrega a página e confirma "1 alteração
    rastreada";
  - **sucesso**: preenche a mensagem, confirma via `alertdialog` ("Criar
    commit") e confirma o texto de sucesso com o hash e a mensagem, e que
    volta a mostrar "0 alterações rastreadas";
  - **troca de projeto**: `sample-rails-app` continua sem Git.
- `apps/web/e2e/README.md`: documenta a cobertura de commit e reescreve
  "fora de escopo" — banco de dados continua fora por exigir fixture
  própria; stash é explicitado como inalcançável (não uma escolha de
  escopo), com o apontamento para `tasks/PENDENCIAS.md`.
- `README.md` e `tasks/roadmap.md`: removida a menção a "stash" como
  capacidade atualmente entregue.

## Decisões

- Nenhuma mudança em código de produto — só a fixture e o teste (mais a
  correção de documentação sobre o estado real do stash).
- O confirm dialog de commit usa o texto **idêntico** ao botão de
  submissão do formulário ("Criar commit"), diferente das tasks 106/107
  onde o texto do gatilho e da confirmação eram distintos. Resolvido
  escopando o clique inicial por `.git-commit-submit` (classe) e o de
  confirmação por `page.getByRole('alertdialog')`, em vez de depender do
  texto do botão para diferenciar os dois.
- A alteração rastreada para o teste de sucesso foi feita direto no disco
  da fixture (`node:fs/promises`), fora do navegador — não há editor de
  arquivo no fluxo de commit, e criar um arquivo novo (não seria
  "rastreado") não teria acionado o botão.

## Validação

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run docs:api:check`
- `npm test`
- `npx playwright test --config=apps/web/e2e/playwright.config.ts` (suíte
  completa, 21/21, incluindo o novo `project-git-commit.spec.ts`)

## Limitações e próximo passo natural

Banco de dados (snapshot/restore) continua fora desta base — exige um
serviço de banco na fixture. Stash não tem UI para testar; a task
correspondente em `tasks/PENDENCIAS.md` é sobre decidir o destino do
código órfão, não sobre escrever teste.

## Arquivos alterados

- `apps/web/e2e/fixtures/runtime-info.ts`
- `apps/web/e2e/global-setup.ts`
- `apps/web/e2e/tests/project-git-commit.spec.ts` (novo)
- `apps/web/e2e/README.md`
- `README.md`
- `tasks/roadmap.md`
- `tasks/108-playwright-git-commit.md` (este arquivo)
- `tasks/PENDENCIAS.md`, `tasks/NEXT.md`, `tasks/PARALLEL-WORK.md` (reconciliação)
