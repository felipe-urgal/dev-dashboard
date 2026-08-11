# Próxima atividade

O fechamento técnico da IA multi-provider (P0) está consolidado em `main` desde o **PR #295**,
seguindo [`AI-MULTI-PROVIDER-FINALIZATION.md`](AI-MULTI-PROVIDER-FINALIZATION.md). Não há
bloqueador conhecido pendente para os dois providers atuais (Ollama + OpenAI).

## Estado atual

Todos os P0 do checklist estão concluídos e mergeados. Dos follow-ups P1 não bloqueantes, três já
foram fechados:

- item 12 (persistência local) — fault injection de `writeFile`/`rename` e teste visual de falha
  de consentimento (PR #296);
- item 11 (provider Ollama) — matriz de regressão ampliada (PR #297);
- item 9 (observabilidade) — métricas estruturadas de duração/estado terminal por execution nesta
  atividade (ver abaixo, mesmo PR #297).

Também no PR #296: os comentários da Code Review IA passaram a aparecer inline no diff (estilo
GitHub), em vez de numa lista separada ao lado.

## Concluído nesta atividade — métricas estruturadas de execution (item 9)

Novo `apps/api/src/services/ai-execution-metrics.ts`: uma métrica estruturada (`executionKind`,
`executionId`, `projectId`, `provider`, `mode`, `status`, `durationMs`, `errorCode` quando houver)
é registrada exatamente uma vez, no momento em que uma execution de **implementation**
(`AiImplementationExecutionService`) ou **Code Review** (`GitAiCodeReviewService`) chega a um
estado terminal (`completed`/`succeeded`, `failed` ou `cancelled`). Nunca prompt, diff, resumo ou
achado — só os campos allowlistados.

- `AiImplementationExecutionService`/`GitAiCodeReviewService` recebem um `metricsLogger` opcional
  (mesmo padrão do `LanguageServerLogger` já usado por `ProjectLanguageServerService`), com um
  único choke point por serviço (`finish()`/`finishCancelled()`+3 pontos terminais de `finish()`
  na Code Review) garantindo que a métrica saia exatamente uma vez por execution.
- `app.ts` passa `app.log` (logger do Fastify) como `aiExecutionMetricsLogger` via `app-context.ts`.
- Novo `apps/api/test/ai-execution-metrics.test.ts`: cobre conclusão e cancelamento em ambos os
  serviços, e confirma que o conteúdo do diff/resumo nunca aparece no contexto logado.
- `docs/architecture/security.md` documenta o novo log estruturado na seção "Logs e eventos".

Suíte completa de `apps/api` (692 testes) e gate local (`typecheck`, `lint`, `format:check`)
verdes.

## Próximos follow-ups não bloqueantes (ordem sugerida)

Nenhum deles bloqueia uso do multi-provider atual; escolher pela próxima sessão:

1. **Stress tests de budgets/tool results grandes** (itens 13 e 14) — só se surgirem casos reais de
   contexto grande.
2. **UX de fallback `offer` na Code Review** (item 8) — requer desenho explícito que evite revisão
   dupla/custo inesperado.
3. **Evolução da descoberta de modelos da OpenAI** (item 10) quando a API mudar; hoje o backend já
   rejeita qualquer modelo fora do catálogo retornado pelo provider.

P2 continua deliberadamente adiado: terceiro provider, `ProviderRegistry` dinâmico, fallback
automático e abstrações adicionais sem necessidade concreta.
