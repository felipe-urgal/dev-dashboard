# Próxima atividade

O fechamento técnico da IA multi-provider (P0) está consolidado em `main` desde o **PR #295**,
seguindo [`AI-MULTI-PROVIDER-FINALIZATION.md`](AI-MULTI-PROVIDER-FINALIZATION.md). Não há
bloqueador conhecido pendente para os dois providers atuais (Ollama + OpenAI).

## Estado atual

Todos os P0 do checklist estão concluídos e mergeados. Dos follow-ups P1 não bloqueantes, quatro já
foram fechados:

- item 12 (persistência local) — fault injection de `writeFile`/`rename` e teste visual de falha
  de consentimento (PR #296);
- item 11 (provider Ollama) — matriz de regressão ampliada (PR #297);
- item 9 (observabilidade) — métricas estruturadas de duração/estado terminal por execution
  (PR #297);
- itens 13/14 (budgets fast/complete e tool calling) — stress tests dos quatro limites do modo
  fast nesta atividade (ver abaixo, mesmo PR #297).

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

## Também nesta atividade — alternância Diff / Arquivo completo na Code Review

Fora do checklist de fechamento multi-provider (pedido direto do usuário): a Code Review agora tem
um toggle **Diff / Arquivo completo** por arquivo.

- **Arquivo completo** busca o conteúdo atual do arquivo via
  `GET /projects/:id/files/content` (rota já existente, reaproveitada) e destaca as linhas
  adicionadas/modificadas nesse diff — sem mostrar remoções nem contexto, já que é a versão final
  do arquivo.
- Novo `GitFileFullView.vue` (+ `GitFileFullView.css`), com os mesmos comentários inline usados no
  modo diff (`GitCodeReviewFindingCard`, extraído para `git-code-review-inline-comments.css`
  compartilhado entre os dois modos).
- Fallback: se o arquivo não puder ser lido (ex.: removido nessa comparação), mostra o erro com um
  atalho para voltar ao Diff.
- Novos testes: `apps/web/test/git-file-full-view.test.ts` (destaque de linha, comentário inline,
  eventos) e `apps/web/test/project-git-code-review-full-file.test.ts` (fluxo completo do toggle
  dentro da página de Code Review, incluindo o caminho de erro).
- `docs/guia/git.md` atualizado descrevendo os dois modos.

## Concluído nesta atividade — stress tests de budgets (itens 13 e 14)

`apps/api/test/ai-assistant-service.test.ts` ganhou 4 casos novos exercitando os limites extremos
do modo `fast` do orquestrador (`ai-execution-policy.ts`/`ai-orchestrator.ts`):

- um resultado de ferramenta de 9.000 caracteres é truncado exatamente nos 8.000 do
  `maxToolResultChars` e marcado `truncated: true` antes de voltar ao provider;
- 5 leituras de arquivos de 8.000 caracteres cada no mesmo round ultrapassam o
  `maxAccumulatedToolResultChars` (32.000) antes da 5ª, encerrando com erro claro;
- a mesma chamada de ferramenta repetida 5 vezes é recusada na 5ª tentativa
  (`maxIdenticalToolCalls` = 4 no modo fast);
- um modelo que nunca converge (chama uma ferramenta nova a cada round) esgota os 4
  `maxToolRounds` e recebe o erro "encadeou ferramentas demais" em vez de um loop indefinido.

696/696 testes de `apps/api` passando; gate local (`typecheck`, `lint`, `format:check`) verde.

## Próximos follow-ups não bloqueantes (ordem sugerida)

Nenhum deles bloqueia uso do multi-provider atual; escolher pela próxima sessão:

1. **UX de fallback `offer` na Code Review** (item 8) — requer desenho explícito que evite revisão
   dupla/custo inesperado.
2. **Evolução da descoberta de modelos da OpenAI** (item 10) quando a API mudar; hoje o backend já
   rejeita qualquer modelo fora do catálogo retornado pelo provider.

Todos os demais itens P1 do checklist (`tasks/AI-MULTI-PROVIDER-FINALIZATION.md`) estão fechados.

P2 continua deliberadamente adiado: terceiro provider, `ProviderRegistry` dinâmico, fallback
automático e abstrações adicionais sem necessidade concreta.
