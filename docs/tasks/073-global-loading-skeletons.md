# Task 073 — Skeletons nas demais páginas globais

## Status

Implementação concluída. Typecheck, build e testes diretamente afetados foram
aprovados.

## Objetivo

Aplicar o padrão compartilhado de carregamento acessível a Atividade,
Processos e Configurações sem esconder dados já válidos durante atualizações em
segundo plano.

## Escopo entregue

- `LoadingSkeleton` reutilizado nas três páginas globais restantes.
- Mensagens específicas com `role="status"` disponíveis imediatamente.
- Formas visuais exibidas somente após 150 ms para evitar flashes.
- `aria-busy` mantido em Atividade e Processos e adicionado a Configurações.
- Resumos numéricos de Atividade e Processos ocultos somente na carga inicial,
  evitando apresentar zeros como dados confirmados.
- Dados existentes preservados durante atualizações de Atividade e Processos;
  o skeleton aparece apenas quando a coleção ainda está vazia.
- Timer visual cancelado quando o componente compartilhado é desmontado.
- Inventário de pendências ampliado com um mapa dos 94 arquivos Markdown
  versionados.

## Decisões

- O componente continua genérico e configurável por quantidade de linhas; as
  três páginas não justificaram variantes adicionais.
- Cabeçalhos, ações e filtros permanecem visíveis para manter contexto e evitar
  uma mudança maior de layout.
- Erros e estados vazios continuam sendo apresentados somente depois do fim da
  tentativa de carga.
- O mapa Markdown referencia o índice individual de tasks em vez de duplicar
  73 descrições históricas.

## Arquivos principais

- `apps/web/src/views/ActivityView.vue`
- `apps/web/src/views/ActivityView.template.html`
- `apps/web/src/views/ProcessesView.vue`
- `apps/web/src/views/SettingsView.vue`
- `apps/web/src/styles/components/navigation.css`
- `apps/web/test/activity-view.test.ts`
- `apps/web/test/processes-view.test.ts`
- `apps/web/test/settings-view.test.ts`
- `apps/web/test/loading-skeleton.test.ts`
- `docs/PENDENCIAS.md`

## Testes e verificação

- 17 testes direcionados aprovados em 4 arquivos.
- `apps/web`: 282 testes aprovados em 65 arquivos após a integração da `main`.
- `npm run typecheck`: aprovado em todos os workspaces.
- `npm run build`: aprovado.
- `apps/api`: 359 testes aprovados.
- `packages/core`: 11 testes aprovados.
- `packages/project-discovery`: 1 teste aprovado.
- `scripts`: 6 testes aprovados.
- `packages/process-manager`: 38 testes aprovados e 13 falhas já conhecidas do
  ambiente isolado, relacionadas a `uv_interface_addresses`, processos
  destacados e temporização de locks; nenhuma área desse pacote foi alterada.

## Limitações

- A auditoria abrangente de acessibilidade permanece para a task 075.
- A validação E2E específica para tablet continua como atividade separada.
- O navegador em nuvem bloqueou `127.0.0.1` com `ERR_BLOCKED_BY_CLIENT`, então
  não foi possível produzir evidência visual das páginas renderizadas neste
  ambiente.
