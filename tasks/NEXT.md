# Próxima atividade

**Concluído nesta sessão**, detalhado em
[`238-remover-assistente-ia.md`](238-remover-assistente-ia.md):

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

Depois desta sessão, a branch foi mesclada com `origin/main`, que avançou em
paralelo com uma limpeza grande e não relacionada (remoção de Atividade,
Configurações e favoritos/exclusão de projeto órfãos — `tasks/236-remove-favoritos-exclusao-orfaos.md`,
`tasks/237-remove-atividade-configuracoes.md`). Conflitos reais (não os
milhares de linhas que o merge resolveu sozinho) ficaram só em cinco arquivos
— `packages/core/src/index.ts`, `apps/api/test/ai-assistant-service.test.ts`,
`apps/web/src/views/ProjectDetailsView.vue`,
`apps/web/test/global-accessibility-guard.test.ts` e
`docs/architecture/api-reference.md` (regenerado) — todos resolvidos mantendo
a intenção dos dois lados (ex.: `ProjectDetailsView.vue` perdeu tanto o
polling do Assistente IA quanto o toggle ativar/desativar projeto, que main
já havia tornado morto em outro trecho do mesmo arquivo). Renomeei
`tasks/236-remover-assistente-ia.md` para `tasks/238-remover-assistente-ia.md`
para não colidir com os dois números que main já tinha reivindicado.

Suíte: `apps/api` 100% verde (650 testes). `apps/web` tem 23 falhas — **todas
já presentes na ponta de `origin/main` antes deste merge**, confirmado
rodando a suíte web num worktree limpo de `origin/main` isolado desta branch:
os mesmos 23 casos falham lá, nenhum a mais nem a menos. Ou seja, este merge
não introduziu nenhuma regressão nova — só herdou o estado (vermelho) que
`origin/main` já tinha em `apps/web` antes de qualquer trabalho desta sessão.
Ver "Regressão pré-existente" abaixo. Gate local (`typecheck`, `lint`,
`format`, `build`, `docs:api:check`) verde.

## Regressão pré-existente em `apps/web`, já presente em `origin/main` (não corrigida aqui)

`npm test --workspace=@dev-dashboard/web` tem 23 testes falhando, nenhum
relacionado a IA (confirmado: os mesmos 23 falham num checkout limpo de
`origin/main`, sem nenhuma mudança desta sessão):

- `test/scripts-explorer-redesign.test.ts`, `test/project-scripts-panel.test.ts`
  e parte de `test/project-detail-cards.test.ts` falham com `ENOENT`
  procurando `apps/web/src/components/ProjectScriptCatalogCard.vue` — arquivo
  removido pelo PR #304 ("Remove Catálogo de scripts"), mas os testes que o
  referenciam não foram atualizados/removidos junto.
- `test/project-git-panel.test.ts` (3 casos) e parte de
  `test/project-detail-cards.test.ts` esperam uma sub-aba/painel "Code review
  IA"/Git que não bate mais com a estrutura atual do componente — a
  investigar se é o mesmo tipo de drift do item acima ou algo específico do
  Git panel.
- `test/project-database-panel.test.ts` (3 casos),
  `test/project-database-snapshots.test.ts` (5 casos),
  `test/database-layout-polish.test.ts` e parte de `project-detail-cards`
  esperam o texto "Visão geral" em `ProjectDatabasePanel.vue`/`.template.html`
  que não aparece mais no componente atual.
- `test/project-card.test.ts` espera status "Em execução" e recebe "Parado".
- `test/log-export-panels.test.ts` e `test/global-accessibility-guard.test.ts`
  têm falhas na mesma leva.

Fora de escopo desta entrega (é estado pré-existente de `origin/main`, não
desta remoção de IA nem deste merge) — mas é o candidato natural para a
próxima sessão: uma varredura dedicada de `apps/web` para reconciliar esses
testes com o estado atual dos componentes (scripts, database panel, git
panel), decidindo caso a caso se o teste está desatualizado ou se revela uma
regressão real de UI.

## Também em aberto (não é bug novo)

Registrado em `tasks/PENDENCIAS.md`: `useProjectProcessStatus.ts` (servidor) e
`useProjectRailsWorker.ts` (Sidekiq/webpack) fazem polling a cada 5s
indefinidamente, mesmo com o processo parado há horas, sem desacelerar.
Padrão consistente nos dois lugares — mudar só um painel criaria
inconsistência com o outro; mudar os dois é escopo maior que uma correção
pontual. Retomar quando fizer sentido.
