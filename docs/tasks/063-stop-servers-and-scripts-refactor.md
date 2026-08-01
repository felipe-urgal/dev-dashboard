# Task 063 — Encerramento confiável e refatoração dos componentes grandes

## Status

Concluída.

## Objetivo

Eliminar o falso erro exibido pela ação global **Parar servidores** quando o
processo encerra logo após a resposta de timeout e concluir a Fase 7 da
refatoração pura de todos os componentes Vue acima de 400 linhas.

## Causa raiz

`waitForManagedExit` disputava duas promessas: a observação em memória do filho
e a verificação real do grupo de processos. Quando o servidor havia sido
iniciado antes de a API reiniciar, não existia observador em memória; essa
promessa retornava `undefined` imediatamente e vencia a disputa como falha. O
backend enviava `SIGTERM`/`SIGKILL`, informava timeout sem aguardar o grupo e o
servidor terminava logo depois.

## Escopo entregue

- a espera pelo encerramento sempre acompanha o grupo de processos durante o
  prazo disponível quando não há observação em memória;
- observações válidas continuam antecipando o sucesso quando aplicável;
- regressão automatizada com um processo destacado sem observador em memória;
- `ProjectScriptsPanel.vue` reduzido de 605 para 377 linhas;
- estado, filtros, contagens e integração dos composables de catálogo/execução
  movidos para `useProjectScriptsPanel.ts`;
- card do catálogo, sidebar de categorias/risco e faixa de execução extraídos
  como componentes de apresentação.
- os templates dos nove componentes restantes acima do limite foram movidos
  para arquivos irmãos `.template.html`, mantendo no SFC a mesma instância,
  props, eventos e escopo de estilo;
- estado, carregamento e mutações de `ProjectGitDiffPage.vue`,
  `ProjectGitHistoryPage.vue` e `ProjectGitPanel.vue` foram movidos para
  `useProjectGitDiffPage.ts`, `useProjectGitHistoryPage.ts` e
  `useProjectGitPanel.ts`;
- todos os arquivos `.vue` de `apps/web/src` ficaram com no máximo 392 linhas.

## Critérios de aceite

- parar um servidor iniciado antes da instância atual da API aguarda o
  encerramento real em vez de retornar timeout imediato;
- a ação global não mostra um projeto como falha quando seu grupo encerra
  dentro do prazo;
- catálogo, filtros, seleção, execução, histórico e cancelamento de scripts
  preservam o comportamento anterior;
- todos os componentes Vue ficam abaixo de 400 linhas.

## Validação

- teste novo `process-exit-tracking.test.ts` aprovado;
- `npm test --workspace=@dev-dashboard/web` — 59 arquivos e 249 testes;
- `npm run build`;
- `npm run typecheck --workspace=@dev-dashboard/web`;
- `npm run typecheck --workspace=@dev-dashboard/process-manager`.

Limitações do ambiente: a suíte completa de `process-manager` mantém 12 falhas
preexistentes porque o sandbox bloqueia `os.networkInterfaces()` e alguns
processos destacados; o teste novo e isolado passa. O navegador remoto também
bloqueia acesso ao servidor local `127.0.0.1`.

## PR

[#143](https://github.com/felipe-urgal/dev-dashboard/pull/143)
