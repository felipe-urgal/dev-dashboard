# Task 071 — Skeleton de carregamento na Visão geral

## Status

Implementação concluída. Typecheck, build e testes diretamente afetados foram
aprovados.

## Objetivo

Substituir o carregamento textual da Visão geral por um estado visual estável e
discreto, sem atrasar o anúncio para tecnologias assistivas nem exibir animação
para pessoas que preferem movimento reduzido.

## Escopo entregue

- Componente compartilhado `LoadingSkeleton`, composto por linhas abstratas e
  sem dados fictícios.
- Mensagem real com `role="status"` e `aria-live="polite"` disponível desde o
  início do carregamento.
- Atributo `aria-busy` no conteúdo principal da Visão geral.
- Atraso visual de 150 ms para evitar flashes em respostas rápidas, sem atrasar
  o anúncio acessível.
- Espaço reservado com dimensões próximas às linhas reais de projetos.
- Animação desativada por `prefers-reduced-motion: reduce`.
- Testes montados do componente e da integração com a Visão geral.
- Inventário consolidado de trabalho futuro em `docs/PENDENCIAS.md`.

## Decisões

- A primeira fatia cobre somente a Visão geral para validar o padrão antes de
  aplicá-lo às outras páginas globais.
- O componente é configurável por quantidade de linhas, rótulo e atraso; novas
  formas visuais devem ser feitas por composição quando houver necessidade
  real.
- O skeleton representa apenas a forma aproximada da lista e fica oculto da
  árvore acessível. Ele não simula nomes, estados ou métricas inexistentes.
- O contador de projetos não é exibido enquanto a carga inicial está em
  andamento, evitando apresentar zero como dado confirmado.

## Arquivos principais

- `apps/web/src/components/LoadingSkeleton.vue`
- `apps/web/src/views/DashboardView.vue`
- `apps/web/test/loading-skeleton.test.ts`
- `apps/web/test/dashboard-view.test.ts`
- `docs/PENDENCIAS.md`

## Testes e verificação

- `apps/web`: 276 testes aprovados em 64 arquivos; os 12 testes direcionados do
  skeleton e da Visão geral também foram executados isoladamente.
- `npm run typecheck`: aprovado em todos os workspaces.
- `npm run build`: aprovado.
- `apps/api`: 354 testes aprovados.
- `packages/core`: 11 testes aprovados.
- `packages/project-discovery`: 1 teste aprovado.
- `scripts`: 6 testes aprovados.
- `packages/process-manager`: 38 testes aprovados e 13 falhas já conhecidas do
  ambiente isolado, relacionadas a `uv_interface_addresses`, processos
  destacados e temporização de locks; nenhuma área desse pacote foi alterada.

## Limitações

- Atividade, Processos e Configurações permanecem para a próxima fatia.
- A auditoria abrangente de acessibilidade e a validação E2E em tablet continuam
  listadas como atividades próprias.
- O navegador em nuvem bloqueou `127.0.0.1` com `ERR_BLOCKED_BY_CLIENT`, então
  não foi possível produzir evidência visual da página renderizada neste
  ambiente.
