# Task 238 — Remover Assistente IA e infraestrutura multi-provider

**Status:** concluída em 2026-08-12.

## Objetivo

Remover completamente a aba **Assistente IA** do dashboard web (chat,
compleção inline, "implementação via prompt", catálogo de ferramentas,
instalação de modelo) e, por decisão explícita do usuário — entre três opções
apresentadas (manter a base de provider/consentimento só para Code Review;
remover só o Assistente IA mas manter seleção de provider na Code Review;
remover tudo, inclusive a base de provider/consentimento) — também a
infraestrutura de seleção multi-provider e consentimento cloud
(`AiProviderResolver`, `OpenAiProvider`, seleção/consentimento persistidos por
projeto), mantendo a **Code review** (aba Git) funcionando, simplificada para
um provider Ollama local fixo.

## Resultado

### Removido

- Aba/rota `project-ai-assistant` (`/projects/:id/ai-assistant`) e todo o
  wiring em `ProjectDetailsView.vue` (tab, painel, pill de execução em
  segundo plano, polling de `AiImplementationExecution`).
- Componentes: `ProjectAiAssistantPanel.vue`/`.css`, `ProjectAiExecutionPill.vue`.
- Clientes de API do frontend: `api/ai-assistant.ts` (chat/complete/status/
  model-pull/seleção de provider/consentimento), `api/ai-implementation.ts`
  (execução de implementação + `applyProjectWorkspaceEdit`), `ai-fallback.ts`
  (oferta de fallback entre providers).
- Rotas da API: `routes/ai-assistant.ts`, `routes/ai-providers.ts`.
- Serviços da API: `ai-implementation-execution-service.ts`,
  `ai-provider-resolver.ts`, `openai-provider.ts`. `AiOrchestrator`
  (`ai-orchestrator.ts`) e o catálogo de ferramentas que ele executava
  (`read_project_file`, `search_project_text`, `list_project_files`,
  `get_git_diff`, `propose_workspace_edit`, `get_symbol_definition`,
  `get_symbol_references`) — eram exclusivos do chat/implementação, que não
  existe mais. `chat`/`complete`/`pullRecommendedModel` saíram de
  `AiAssistantService`; `complete`/`installModel` saíram da interface
  `AiProvider` e da implementação em `OllamaProvider` (dead code depois da
  remoção acima).
- `ProjectAiConsentRepository`/`ProjectAiSelectionRepository`
  (`packages/core`) e seus testes.
- Tipos só usados pelo Assistente IA/multi-provider em
  `packages/contracts/src/ai-assistant.ts`: `AiChatRequest`,
  `AiChatStreamEvent`, `AiCompletionRequest`, `AiCompletionResult`,
  `AiImplementationExecution*`, `AiModelPullStreamEvent`, `AiProviderKind`,
  `AiRecommendedModelName`, `AI_RECOMMENDED_MODELS`, `AiTool`,
  `ProjectAiProviderStatus`, `ProjectAiProvidersStatus`. `AiErrorCode` perdeu
  `AI_CLOUD_CONSENT_REQUIRED` e `AI_MODEL_UNAVAILABLE` (só existiam para o
  fluxo de consentimento/resolução entre providers). `AiProviderId` virou um
  único literal (`'ollama'`) em vez de `'ollama' | 'openai'`.
- Documentação: `docs/guia/assistente-ia.md`,
  `docs/architecture/openai-provider.md` (guia e doc de arquitetura
  inteiramente sobre features removidas).
- Todos os testes específicos do Assistente IA/multi-provider em `apps/api`
  e `apps/web` (rotas, characterization, provider-neutral, tool-streaming,
  cloud-security, implementation-execution-service, provider-resolver,
  seleção de provider na Code Review, `openai-provider`).

### Mantido, simplificado

- **Code review** (`ProjectGitCodeReviewPage.vue` + `GitAiCodeReviewService`)
  continua funcionando, agora sempre com `provider: 'ollama'` fixo — o
  construtor de `GitAiCodeReviewService` perdeu o parâmetro
  `providerResolver`. `AiAssistantService` é construído uma única vez em
  `app-context.ts` com `new OllamaProvider()`, sem a indireção `assistantFor`/
  `openAiAssistantService`/`aiProviderResolver` que existia antes. Expõe só
  `status()` e `review()` — o que a Code review de fato usa.
- Novo endpoint mínimo `GET /projects/:id/git/pull-request/ai-status`
  (`routes/git-pull-request.ts`), devolvendo disponibilidade + modelos
  instalados do Ollama local (`ProjectAiStatus`). Substitui, com escopo bem
  menor, o que a UI antes lia de `GET /ai/providers`. Cliente novo:
  `getProjectGitPullRequestAiStatus` (`api/git-workflows.ts`).
  `ProjectGitCodeReviewPage.vue` usa esse status para popular o seletor de
  modelo e liberar o botão "Iniciar revisão" — sem seleção de provider, sem
  indicação de modo (fast/complete não é mais escolhido pelo usuário), sem
  menção a consentimento cloud.
- `AiExecutionMode` (`fast`/`complete`) continua existindo só para calibrar
  budgets internos da Code review (`ai-execution-policy.ts`); a rota nunca
  expôs esse campo ao usuário, então nada mudou na UI.
- `ProjectWorkspaceEditService`/`ProjectLanguageServerService` continuam
  existindo — são usados por `routes/project-workspace-edits.ts` e
  `routes/project-language-server.ts`, independentes da IA. Só a dependência
  do (agora removido) `AiOrchestrator` sobre eles foi cortada.
- `docs/architecture/ai-multi-provider.md` foi reescrito (de ~360 para um
  documento curto) para descrever o estado atual: só Code review, só Ollama.
  `docs/architecture/embedded-ide-ai-design.md` (já era um documento histórico
  desde a remoção da IDE embutida no PR #262) teve a nota de status
  atualizada para registrar também esta remoção.

## Arquivos tocados

Ver `git diff` do PR — resumo: `apps/web/src/{router,views,components,api}`,
`apps/api/src/{app.ts,app-context.ts,routes,services,http}`,
`packages/{contracts,core}/src`, `apps/api/test`, `apps/web/test`, `docs/`,
`CLAUDE.md`, `tasks/`.

## Decisões

- Removida a base de provider/consentimento inteira, não só o Assistente IA —
  escolha explícita do usuário entre três opções apresentadas (a alternativa
  mais conservadora seria manter `AiProviderResolver`/OpenAI só para a Code
  Review continuar podendo escolher provider).
- `GitAiCodeReviewService` foi simplificado para sempre usar
  `this.aiAssistantService` em vez de manter o parâmetro opcional
  `providerResolver` como plumbing morto — evita a "abstração prematura" que
  `CLAUDE.md` pede para não deixar para trás.
- Em vez de reintroduzir uma rota `/ai/providers` com escopo reduzido, criei
  um endpoint novo e propositalmente estreito
  (`git/pull-request/ai-status`) dentro do domínio de rotas da própria Code
  review — evita reviver a rota genérica de "providers" que não faz mais
  sentido sem seleção multi-provider.

## Limitações e follow-ups

- Durante a verificação desta task foi descoberta uma regressão pré-existente
  e não relacionada em `apps/web` (9 testes falhando, causa raiz: um
  componente do catálogo de scripts removido no PR #304 mas cujos testes não
  foram atualizados). Não corrigida aqui — fora do escopo desta remoção. Ver
  `tasks/NEXT.md`.
- Validação manual com um Ollama real (modelos instalados, revisão de um PR
  de verdade) fica para quem for validar o merge — a suíte automatizada cobre
  o ciclo da execução em memória e o masking, não a qualidade do modelo.
