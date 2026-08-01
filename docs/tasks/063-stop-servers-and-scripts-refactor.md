# Task 063 — Encerramento confiável de servidores e refatoração de Scripts

## Status

Concluída.

## Objetivo

Eliminar o falso erro exibido pela ação global **Parar servidores** quando o
processo encerra logo após a resposta de timeout e avançar a Fase 7 da
refatoração pura pelo `ProjectScriptsPanel.vue`.

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

## Critérios de aceite

- parar um servidor iniciado antes da instância atual da API aguarda o
  encerramento real em vez de retornar timeout imediato;
- a ação global não mostra um projeto como falha quando seu grupo encerra
  dentro do prazo;
- catálogo, filtros, seleção, execução, histórico e cancelamento de scripts
  preservam o comportamento anterior;
- o componente principal de Scripts fica abaixo de 400 linhas.

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

A preencher após a publicação da branch.
