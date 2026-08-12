# Próxima atividade

**Concluído nesta sessão**, detalhado em
[`236-remover-assistente-ia.md`](236-remover-assistente-ia.md):

Remoção completa da aba **Assistente IA** (chat, compleção inline,
implementação via prompt, catálogo de ferramentas, instalação de modelo) e de
toda a infraestrutura de seleção multi-provider/consentimento cloud
(`AiProviderResolver`, `OpenAiProvider`, `ProjectAiConsentRepository`,
`ProjectAiSelectionRepository`, rotas `/ai/*` e `/ai/providers/*`) — decisão
explícita do usuário entre três opções apresentadas. A **Code review** dentro
da aba **Git** foi mantida, simplificada para usar sempre um provider Ollama
local fixo, sem seleção de provider, sem modo configurável pelo usuário e sem
consentimento cloud; ganhou um endpoint próprio e mínimo,
`GET /projects/:id/git/pull-request/ai-status`, só para popular o seletor de
modelo e o gate do botão "Iniciar revisão".

Isso fecha, por decisão explícita do usuário (não pelo roadmap P1/P2 que
`AI-MULTI-PROVIDER-FINALIZATION.md` deixava em aberto), toda a linha de
trabalho da IA multi-provider — os follow-ups P1 registrados nas sessões
anteriores (fallback `offer` na Code Review, evolução da descoberta de
modelos OpenAI) não se aplicam mais: não há mais segundo provider.

Suíte: `apps/api` 100% verde. `apps/web` tem 9 falhas em arquivos de teste que
esta sessão não tocou (`project-card`, `project-detail-cards`,
`project-scripts-panel`, `scripts-explorer-redesign`,
`global-accessibility-guard`, `log-export-panels`) e cuja causa raiz (ENOENT
para um componente já removido em #304) não tem relação com IA — ver
"Regressão pré-existente" abaixo. Todas as falhas que esta remoção de fato
introduziu (nos testes de `ProjectGitCodeReviewPage`/`project-git-panel`, pela
troca de `/ai/providers` por `/git/pull-request/ai-status`) foram corrigidas.
Gate local (`typecheck`, `lint`, `format`, `build`, `docs:api:check`) verde.

## Regressão pré-existente descoberta durante esta sessão (não corrigida aqui)

`npm test --workspace=@dev-dashboard/web` tem 9 testes falhando, todos
relacionados ao catálogo de scripts e a um teste de `ProjectCard`,
**nenhum relacionado a IA**:

- `test/scripts-explorer-redesign.test.ts` (2 casos) e parte de
  `test/project-scripts-panel.test.ts`/`test/project-detail-cards.test.ts`
  falham com `ENOENT` procurando
  `apps/web/src/components/ProjectScriptCatalogCard.vue` — arquivo removido
  pelo PR #304 ("Remove Catálogo de scripts"), mas os testes que o referenciam
  não foram atualizados/removidos junto.
- `test/project-card.test.ts` espera status "Em execução" e recebe "Parado" —
  parece descolado de uma mudança recente no componente ou na fixture, sem
  relação com scripts.
- `test/log-export-panels.test.ts` e `test/global-accessibility-guard.test.ts`
  têm falhas na mesma leva, a investigar se são a mesma causa raiz do catálogo
  de scripts ou independentes.

Fora de escopo desta entrega (é uma regressão de #304, não desta remoção de
IA) — mas é o candidato natural para a próxima sessão: investigar #304,
decidir se o teste deve ser deletado (o componente foi removido de propósito)
ou se o catálogo de scripts deveria continuar existindo e a remoção foi
incompleta.

## Também em aberto (não é bug novo)

Registrado em `tasks/PENDENCIAS.md`: `useProjectProcessStatus.ts` (servidor) e
`useProjectRailsWorker.ts` (Sidekiq/webpack) fazem polling a cada 5s
indefinidamente, mesmo com o processo parado há horas, sem desacelerar.
Padrão consistente nos dois lugares — mudar só um painel criaria
inconsistência com o outro; mudar os dois é escopo maior que uma correção
pontual. Retomar quando fizer sentido.
