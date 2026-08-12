# Task 238 â Remover Assistente IA e infraestrutura multi-provider

**Status:** concluÃ­da em 2026-08-12.

## Objetivo

Remover completamente a aba **Assistente IA** do dashboard web (chat,
compleÃ§Ã£o inline, "implementaÃ§Ã£o via prompt", catÃ¡logo de ferramentas,
instalaÃ§Ã£o de modelo) e, por decisÃ£o explÃ­cita do usuÃ¡rio â entre trÃªs opÃ§Ãµes
apresentadas (manter a base de provider/consentimento sÃ³ para Code Review;
remover sÃ³ o Assistente IA mas manter seleÃ§Ã£o de provider na Code Review;
remover tudo, inclusive a base de provider/consentimento) â tambÃ©m a
infraestrutura de seleÃ§Ã£o multi-provider e consentimento cloud
(`AiProviderResolver`, `OpenAiProvider`, seleÃ§Ã£o/consentimento persistidos por
projeto), mantendo a **Code review** (aba Git) funcionando, simplificada para
um provider Ollama local fixo.

## Resultado

### Removido

- Aba/rota `project-ai-assistant` (`/projects/:id/ai-assistant`) e todo o
  wiring em `ProjectDetailsView.vue` (tab, painel, pill de execuÃ§Ã£o em
  segundo plano, polling de `AiImplementationExecution`).
- Componentes: `ProjectAiAssistantPanel.vue`/`.css`, `ProjectAiExecutionPill.vue`.
- Clientes de API do frontend: `api/ai-assistant.ts` (chat/complete/status/
  model-pull/seleÃ§Ã£o de provider/consentimento), `api/ai-implementation.ts`
  (execuÃ§Ã£o de implementaÃ§Ã£o + `applyProjectWorkspaceEdit`), `ai-fallback.ts`
  (oferta de fallback entre providers).
- Rotas da API: `routes/ai-assistant.ts`, `routes/ai-providers.ts`.
- ServiÃ§os da API: `ai-implementation-execution-service.ts`,
  `ai-provider-resolver.ts`, `openai-provider.ts`. `AiOrchestrator`
  (`ai-orchestrator.ts`) e o catÃ¡logo de ferramentas que ele executava
  (`read_project_file`, `search_project_text`, `list_project_files`,
  `get_git_diff`, `propose_workspace_edit`, `get_symbol_definition`,
  `get_symbol_references`) â eram exclusivos do chat/implementaÃ§Ã£o, que nÃ£o
  existe mais. `chat`/`complete`/`pullRecommendedModel` saÃ­ram de
  `AiAssistantService`; `complete`/`installModel` saÃ­ram da interface
  `AiProvider` e da implementaÃ§Ã£o em `OllamaProvider` (dead code depois da
  remoÃ§Ã£o acima).
- `ProjectAiConsentRepository`/`ProjectAiSelectionRepository`
  (`packages/core`) e seus testes.
- Tipos sÃ³ usados pelo Assistente IA/multi-provider em
  `packages/contracts/src/ai-assistant.ts`: `AiChatRequest`,
  `AiChatStreamEvent`, `AiCompletionRequest`, `AiCompletionResult`,
  `AiImplementationExecution*`, `AiModelPullStreamEvent`, `AiProviderKind`,
  `AiRecommendedModelName`, `AI_RECOMMENDED_MODELS`, `AiTool`,
  `ProjectAiProviderStatus`, `ProjectAiProvidersStatus`. `AiErrorCode` perdeu
  `AI_CLOUD_CONSENT_REQUIRED` e `AI_MODEL_UNAVAILABLE` (sÃ³ existiam para o
  fluxo de consentimento/resoluÃ§Ã£o entre providers). `AiProviderId` virou um
  Ãºnico literal (`'ollama'`) em vez de `'ollama' | 'openai'`.
- DocumentaÃ§Ã£o: `docs/guia/assistente-ia.md`,
  `docs/architecture/openai-provider.md` (guia e doc de arquitetura
  inteiramente sobre features removidas).
- Todos os testes especÃ­ficos do Assistente IA/multi-provider em `apps/api`
  e `apps/web` (rotas, characterization, provider-neutral, tool-streaming,
  cloud-security, implementation-execution-service, provider-resolver,
  seleÃ§Ã£o de provider na Code Review, `openai-provider`).

### Mantido, simplificado

- **Code review** (`ProjectGitCodeReviewPage.vue` + `GitAiCodeReviewService`)
  continua funcionando, agora sempre com `provider: 'ollama'` fixo â o
  construtor de `GitAiCodeReviewService` perdeu o parÃ¢metro
  `providerResolver`. `AiAssistantService` Ã© construÃ­do uma Ãºnica vez em
  `app-context.ts` com `new OllamaProvider()`, sem a indireÃ§Ã£o `assistantFor`/
  `openAiAssistantService`/`aiProviderResolver` que existia antes. ExpÃµe sÃ³
  `status()` e `review()` â o que a Code review de fato usa.
- Novo endpoint mÃ­nimo `GET /projects/:id/git/pull-request/ai-status`
  (`routes/git-pull-request.ts`), devolvendo disponibilidade + modelos
  instalados do Ollama local (`ProjectAiStatus`). Substitui, com escopo bem
  menor, o que a UI antes lia de `GET /ai/providers`. Cliente novo:
  `getProjectGitPullRequestAiStatus` (`api/git-workflows.ts`).
  `ProjectGitCodeReviewPage.vue` usa esse status para popular o seletor de
  modelo e liberar o botÃ£o "Iniciar revisÃ£o" â sem seleÃ§Ã£o de provider, sem
  indicaÃ§Ã£o de modo (fast/complete nÃ£o Ã© mais escolhido pelo usuÃ¡rio), sem
  menÃ§Ã£o a consentimento cloud.
- `AiExecutionMode` (`fast`/`complete`) continua existindo sÃ³ para calibrar
  budgets internos da Code review (`ai-execution-policy.ts`); a rota nunca
  expÃ´s esse campo ao usuÃ¡rio, entÃ£o nada mudou na UI.
- `ProjectWorkspaceEditService`/`ProjectLanguageServerService` continuam
  existindo â sÃ£o usados por `routes/project-workspace-edits.ts` e
  `routes/project-language-server.ts`, independentes da IA. SÃ³ a dependÃªncia
  do (agora removido) `AiOrchestrator` sobre eles foi cortada.
- `docs/architecture/ai-multi-provider.md` foi reescrito (de ~360 para um
  documento curto) para descrever o estado atual: sÃ³ Code review, sÃ³ Ollama.
  `docs/architecture/embedded-ide-ai-design.md` (jÃ¡ era um documento histÃ³rico
  desde a remoÃ§Ã£o da IDE embutida no PR #262) teve a nota de status
  atualizada para registrar tambÃ©m esta remoÃ§Ã£o.

## Arquivos tocados

Ver `git diff` do PR â resumo: `apps/web/src/{router,views,components,api}`,
`apps/api/src/{app.ts,app-context.ts,routes,services,http}`,
`packages/{contracts,core}/src`, `apps/api/test`, `apps/web/test`, `docs/`,
`CLAUDE.md`, `tasks/`.

## DecisÃµes

- Removida a base de provider/consentimento inteira, nÃ£o sÃ³ o Assistente IA â
  escolha explÃ­cita do usuÃ¡rio entre trÃªs opÃ§Ãµes apresentadas (a alternativa
  mais conservadora seria manter `AiProviderResolver`/OpenAI sÃ³ para a Code
  Review continuar podendo escolher provider).
- `GitAiCodeReviewService` foi simplificado para sempre usar
  `this.aiAssistantService` em vez de manter o parÃ¢metro opcional
  `providerResolver` como plumbing morto â evita a "abstraÃ§Ã£o prematura" que
  `CLAUDE.md` pede para nÃ£o deixar para trÃ¡s.
- Em vez de reintroduzir uma rota `/ai/providers` com escopo reduzido, criei
  um endpoint novo e propositalmente estreito
  (`git/pull-request/ai-status`) dentro do domÃ­nio de rotas da prÃ³pria Code
  review â evita reviver a rota genÃ©rica de "providers" que nÃ£o faz mais
  sentido sem seleÃ§Ã£o multi-provider.

## LimitaÃ§Ãµes e follow-ups

- Durante a verificaÃ§Ã£o desta task foi descoberta uma regressÃ£o prÃ©-existente
  e nÃ£o relacionada em `apps/web` (9 testes falhando, causa raiz: um
  componente do catÃ¡logo de scripts removido no PR #304 mas cujos testes nÃ£o
  foram atualizados). NÃ£o corrigida aqui â fora do escopo desta remoÃ§Ã£o. Ver
  `tasks/NEXT.md`.
- ValidaÃ§Ã£o manual com um Ollama real (modelos instalados, revisÃ£o de um PR
  de verdade) fica para quem for validar o merge â a suÃ­te automatizada cobre
  o ciclo da execuÃ§Ã£o em memÃ³ria e o masking, nÃ£o a qualidade do modelo.
