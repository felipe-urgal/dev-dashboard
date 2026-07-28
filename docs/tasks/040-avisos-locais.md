# Task 040 — Avisos locais de conclusão

## Status

Concluída.

## Objetivo

Criar notificações visuais locais, acessíveis e limitadas para conclusões
de testes, scripts e processos acompanhados pelo dashboard, sem endpoint
novo, sem polling adicional, sem persistência e sem notificação nativa do
sistema operacional.

## Escopo entregue

- Store client-side `apps/web/src/stores/notice-center.ts` (factory +
  singleton, mesmo padrão de `dashboard.ts`): lista em memória com limite
  fechado de 20 avisos, deduplicação por `dedupeKey`
  (`origem:idDaExecução:desfecho`) que sobrevive a `dismiss`, `clearAll`
  e ao truncamento — um aviso já visto nunca reaparece, inclusive após
  reconexão SSE que reenvia o mesmo estado terminal.
- Componente `NoticeCenter.vue` na topbar: sino com badge de não lidos,
  dropdown com região `aria-live="polite"`/`role="status"`, estado vazio,
  descarte individual, "Limpar tudo" e navegação de cada aviso para a
  tela autorizada correspondente. Foco vai ao painel ao abrir; `Escape`
  e os demais fechamentos devolvem o foco ao sino.
- Publicação de avisos nos três painéis que já observam transições de
  estado, sem novo canal de eventos: `ProjectTestsPanel.vue` (SSE),
  `ProjectScriptsPanel.vue` (SSE) e `ProjectServerPanel.vue` (polling do
  `useProjectProcessStatus`). Cada painel usa uma flag local de
  "observado rodando nesta sessão", então estados já terminais no
  primeiro carregamento não geram aviso.

## Decisões

- Reaproveitamos os callbacks SSE/polling já existentes nos painéis em
  vez de abrir uma segunda assinatura global — um aviso só é publicado
  se o painel relevante estiver montado na transição, o que corresponde
  ao requisito de "transições terminais observadas na sessão atual".
- O sistema de Atividade (`GET /api/activities`) não foi usado como
  fonte: é histórico sob demanda e exigiria polling novo.
- O aviso carrega apenas id, nome do projeto, rótulo humano
  (`label`/`actionName`) e desfecho — nunca log, comando bruto, caminho,
  porta ou segredo.
- Sem auto-dismiss: a lista é de leitura/descarte manual, diferente do
  padrão `useAutoDismiss` das mensagens transitórias.
- `ProjectServerPanel` dispensa reset da flag por troca de projeto: o
  `:key="project.id"` em `ProjectDetailsView.vue` destrói/recria a
  instância.

## Testes e verificação

- `npm run typecheck`: concluído em todos os workspaces.
- `npm run build`: concluído (packages e apps).
- `npm test`: concluído — 101 testes no web (24 arquivos), incluindo os
  novos `notice-center-store.test.ts`, `notice-center.test.ts`,
  `project-scripts-panel.test.ts` e os casos adicionados em
  `project-tests-panel.test.ts` (dedupe em reconexão, terminal sem
  running não notifica, foco/Escape, aria-labels); 206 na API e demais
  suítes de packages inalteradas.
- O smoke E2E de navegação não foi alterado: as fixtures atuais não
  simulam transições de estado de forma determinística, condição que a
  própria task previa para estender o smoke.

## Limitações

- Avisos só são publicados enquanto o painel correspondente está montado
  (sem monitor global em background) — comportamento aceito pelo escopo.
- A lista não sobrevive ao recarregamento da página (sem persistência,
  por requisito).
