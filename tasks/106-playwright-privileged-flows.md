# Task 106 — E2E do catálogo de scripts: carregamento, sucesso, erro e troca de projeto

## Objetivo

Expandir o smoke E2E (Playwright) para um fluxo privilegiado ainda sem
cobertura — a execução de scripts do catálogo — exercitando a matriz de
estados citada em `tasks/PENDENCIAS.md`: carregamento, sucesso, erro e troca
de projeto. Vazio já sai de brinde: `sample-rails-app` não tem nenhum script
reconhecido no catálogo.

## Por que scripts, e não Git/banco

`apps/web/e2e/README.md` já listava "mutações (Git, scripts, banco)" como
fora de escopo da base de E2E. Git e banco de dados operam sobre estado
persistente real (repositório, dump) e exigiriam fixtures bem mais caras
(repo Git de verdade, serviço de banco). O catálogo de scripts já roda
processos reais e reais confirmações de risco — é o fluxo privilegiado mais
barato de fixturar com segurança — então esta task reduz o escopo "fora
desta base" a Git e banco, que continuam exigindo desenho próprio.

## O que foi feito

- `apps/web/e2e/fixtures/server-harness.ts`: dois scripts novos no
  `package.json` de `sample-node-app`, com ~500ms de duração proposital
  para o estado "Em execução" ficar observável antes do desfecho:
  - `lint` (somente leitura pela heurística de risco — roda direto, sem
    confirmação) — termina com sucesso;
  - `format` (risco mutável — exige confirmação explícita) — termina com
    falha (`exit 1`).
  Nomes escolhidos deliberadamente para não colidir com convenções já
  reservadas por outras áreas do produto: `dev`/`test` dão início ao
  servidor e à detecção de testes (`packages/process-manager`,
  `test-detection-service.ts`), e `build` é redirecionado para a aba
  Dependências (`apps/web/src/utils/project-script-visibility.ts`, id
  `package-script:build`), nunca aparecendo no catálogo.
  Também foi adicionado um `package-lock.json` mínimo — sem lockfile, o
  serviço de execução (diferente do início do servidor) não consegue
  resolver o gerenciador de pacotes e recusa rodar o script.
- `apps/web/e2e/tests/project-scripts.spec.ts` (novo): navega até a aba
  Scripts de `sample-node-app`, roda `lint` (sem confirmação, observa
  "Em execução" → "Concluída", inclusive a troca automática de aba para
  "Execuções" que o início de uma execução dispara), depois `format`
  (confirmação obrigatória via `confirmDialog`, "Em execução" → "Falhou").
  Em seguida troca para `sample-rails-app` e confirma o estado vazio
  ("Nenhuma ação encontrada", zero `.script-card`), provando que o painel
  não guarda resquício do catálogo do projeto anterior.
- `apps/web/e2e/README.md`: descreve a nova cobertura, corrige a descrição
  do workspace de fixture (que já tinha dois projetos, Node e Rails, desde
  a task 095 — só não estava documentada) e reduz "fora do escopo" para
  Git e banco de dados.

## Decisões

- Nenhuma mudança em código de produto — só fixtures e o próprio teste. O
  comportamento (troca automática para "Execuções" ao iniciar uma
  execução, delegação de `build` para Dependências) já existia; a task só
  o expôs a uma verificação automatizada.
- `format` foi escolhido em vez de reutilizar `dev`/`test`/`build` depois
  de descobrir, rodando a suíte, que esses três nomes têm significado
  especial em outras partes do produto (ver acima) — mudar o comportamento
  deles quebraria testes existentes (`navigation.spec.ts`) ou nunca
  apareceria no catálogo.

## Validação

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run docs:api:check`
- `npm test`
- `npx playwright test --config=apps/web/e2e/playwright.config.ts` (suíte
  completa, 19/19, incluindo o novo `project-scripts.spec.ts`)

## Limitações e próximo passo natural

Cobertura E2E de mutações Git e de banco de dados continua fora desta base
(ver `apps/web/e2e/README.md`), por exigir fixtures de repositório Git real
e de serviço de banco, respectivamente — candidatas a uma task própria
quando houver motivação concreta, não abertas automaticamente aqui.

## Arquivos alterados

- `apps/web/e2e/fixtures/server-harness.ts`
- `apps/web/e2e/tests/project-scripts.spec.ts` (novo)
- `apps/web/e2e/README.md`
- `tasks/106-playwright-privileged-flows.md` (este arquivo)
- `tasks/PENDENCIAS.md`, `tasks/NEXT.md` (reconciliação)
