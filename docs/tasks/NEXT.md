# Próxima atividade — 012 (parte 2): Página `/activity` no frontend

## Contexto

A parte 1 da task 012 já entregou o contrato `Activity`, o `ActivityService`
agregador e a rota `GET /api/activities` com filtros, paginação e testes.
Falta agora a superfície no navegador que consome essa API sem duplicar
fonte de verdade.

Detalhes completos da parte 1 e do que continua fora do escopo estão em
`docs/tasks/012-unified-activity-panel.md`.

## Objetivo

Consumir `GET /api/activities` em uma página global `/activity` que
respeita paginação, filtros fechados, estados vazio/carregando/erro e a
diferença de retenção entre origens (`script` tem histórico persistente;
`test` e `server` refletem apenas o estado gerenciado atual).

## Plano detalhado

1. Adicionar cliente `fetchActivities(query)` em `apps/web/src/api.ts`
   com `AbortController` compartilhado, para descartar respostas obsoletas
   ao trocar filtros ou navegar.
2. Criar `apps/web/src/views/ActivityView.vue` com filtros por workspace,
   projeto, origem, status; paginação; e link de cada item para a sub-rota
   segura já existente do projeto (`/projects/:projectId`). Referências
   expiradas devem apresentar indisponibilidade sem tentar recuperar
   arquivo diretamente.
3. Registrar `/activity` no `apps/web/src/router/index.ts` e adicionar
   entrada de navegação no shell atual.
4. Aviso visível de que a durabilidade varia por origem, inaugurando o
   padrão de comunicação de retenção que aparecerá em outras telas.
5. Teste de componente montado (Vue Test Utils) cobrindo estado vazio,
   carregando, erro e sucesso — inaugurando a camada de testes de UI
   priorizada no roadmap.
6. Atualizar `README.md`, `docs/architecture/overview.md` e o registro da
   task 012 apontando a parte 2 como concluída.
7. Substituir este `NEXT.md` pela próxima task após a parte 2 encerrar
   (esperado: 013 — base de testes da UI, ou 014 — página global de
   processos, conforme "Sequência posterior esperada" do roadmap).

## Critérios de aceite

- página `/activity` navega, filtra e pagina sem chamadas paralelas
  concorrentes vazando resultado obsoleto para a tela;
- não há execução, cancelamento ou leitura de log a partir do painel;
- aviso de retenção diferencial visível;
- teste de componente cobre os quatro estados;
- `npm run typecheck`, `npm run build` e `npm test` passam.

## Riscos a validar antes da implementação

- dependência de biblioteca de montagem Vue sem ampliar desnecessariamente
  as dependências de teste (preferir `@vue/test-utils` + `jsdom`);
- comportamento quando um workspace é removido durante a consulta —
  a API já descarta esses projetos, mas a UI precisa apresentar o vazio
  resultante sem loop de refetch.
