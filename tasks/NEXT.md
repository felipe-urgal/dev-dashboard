# PrÃ³xima atividade

**ConcluÃ­do nesta sessÃ£o**, detalhado em
[`238-remover-assistente-ia.md`](238-remover-assistente-ia.md):

RemoÃ§Ã£o completa da aba **Assistente IA** (chat, compleÃ§Ã£o inline,
implementaÃ§Ã£o via prompt, catÃ¡logo de ferramentas, instalaÃ§Ã£o de modelo) e de
toda a infraestrutura de seleÃ§Ã£o multi-provider/consentimento cloud
(`AiProviderResolver`, `OpenAiProvider`, `ProjectAiConsentRepository`,
`ProjectAiSelectionRepository`, rotas `/ai/*` e `/ai/providers/*`) â decisÃ£o
explÃ­cita do usuÃ¡rio entre trÃªs opÃ§Ãµes apresentadas. A **Code review** dentro
da aba **Git** foi mantida, simplificada para usar sempre um provider Ollama
local fixo, sem seleÃ§Ã£o de provider, sem modo configurÃ¡vel pelo usuÃ¡rio e sem
consentimento cloud; ganhou um endpoint prÃ³prio e mÃ­nimo,
`GET /projects/:id/git/pull-request/ai-status`, sÃ³ para popular o seletor de
modelo e o gate do botÃ£o "Iniciar revisÃ£o".

Isso fecha, por decisÃ£o explÃ­cita do usuÃ¡rio (nÃ£o pelo roadmap P1/P2 que
`AI-MULTI-PROVIDER-FINALIZATION.md` deixava em aberto), toda a linha de
trabalho da IA multi-provider â os follow-ups P1 registrados nas sessÃµes
anteriores (fallback `offer` na Code Review, evoluÃ§Ã£o da descoberta de
modelos OpenAI) nÃ£o se aplicam mais: nÃ£o hÃ¡ mais segundo provider.

Depois desta sessÃ£o, a branch foi mesclada com `origin/main`, que avanÃ§ou em
paralelo com uma limpeza grande e nÃ£o relacionada (remoÃ§Ã£o de Atividade,
ConfiguraÃ§Ãµes e favoritos/exclusÃ£o de projeto Ã³rfÃ£os â `tasks/236-remove-favoritos-exclusao-orfaos.md`,
`tasks/237-remove-atividade-configuracoes.md`). Conflitos reais (nÃ£o os
milhares de linhas que o merge resolveu sozinho) ficaram sÃ³ em cinco arquivos
â `packages/core/src/index.ts`, `apps/api/test/ai-assistant-service.test.ts`,
`apps/web/src/views/ProjectDetailsView.vue`,
`apps/web/test/global-accessibility-guard.test.ts` e
`docs/architecture/api-reference.md` (regenerado) â todos resolvidos mantendo
a intenÃ§Ã£o dos dois lados (ex.: `ProjectDetailsView.vue` perdeu tanto o
polling do Assistente IA quanto o toggle ativar/desativar projeto, que main
jÃ¡ havia tornado morto em outro trecho do mesmo arquivo). Renomeei
`tasks/236-remover-assistente-ia.md` para `tasks/238-remover-assistente-ia.md`
para nÃ£o colidir com os dois nÃºmeros que main jÃ¡ tinha reivindicado.

SuÃ­te: `apps/api` 100% verde (650 testes). `apps/web` tem 23 falhas â **todas
jÃ¡ presentes na ponta de `origin/main` antes deste merge**, confirmado
rodando a suÃ­te web num worktree limpo de `origin/main` isolado desta branch:
os mesmos 23 casos falham lÃ¡, nenhum a mais nem a menos. Ou seja, este merge
nÃ£o introduziu nenhuma regressÃ£o nova â sÃ³ herdou o estado (vermelho) que
`origin/main` jÃ¡ tinha em `apps/web` antes de qualquer trabalho desta sessÃ£o.
Ver "RegressÃ£o prÃ©-existente" abaixo. Gate local (`typecheck`, `lint`,
`format`, `build`, `docs:api:check`) verde.

## RegressÃ£o prÃ©-existente em `apps/web`, jÃ¡ presente em `origin/main` (nÃ£o corrigida aqui)

`npm test --workspace=@dev-dashboard/web` tem 23 testes falhando, nenhum
relacionado a IA (confirmado: os mesmos 23 falham num checkout limpo de
`origin/main`, sem nenhuma mudanÃ§a desta sessÃ£o):

- `test/scripts-explorer-redesign.test.ts`, `test/project-scripts-panel.test.ts`
  e parte de `test/project-detail-cards.test.ts` falham com `ENOENT`
  procurando `apps/web/src/components/ProjectScriptCatalogCard.vue` â arquivo
  removido pelo PR #304 ("Remove CatÃ¡logo de scripts"), mas os testes que o
  referenciam nÃ£o foram atualizados/removidos junto.
- `test/project-git-panel.test.ts` (3 casos) e parte de
  `test/project-detail-cards.test.ts` esperam uma sub-aba/painel "Code review
  IA"/Git que nÃ£o bate mais com a estrutura atual do componente â a
  investigar se Ã© o mesmo tipo de drift do item acima ou algo especÃ­fico do
  Git panel.
- `test/project-database-panel.test.ts` (3 casos),
  `test/project-database-snapshots.test.ts` (5 casos),
  `test/database-layout-polish.test.ts` e parte de `project-detail-cards`
  esperam o texto "VisÃ£o geral" em `ProjectDatabasePanel.vue`/`.template.html`
  que nÃ£o aparece mais no componente atual.
- `test/project-card.test.ts` espera status "Em execuÃ§Ã£o" e recebe "Parado".
- `test/log-export-panels.test.ts` e `test/global-accessibility-guard.test.ts`
  tÃªm falhas na mesma leva.

Fora de escopo desta entrega (Ã© estado prÃ©-existente de `origin/main`, nÃ£o
desta remoÃ§Ã£o de IA nem deste merge) â mas Ã© o candidato natural para a
prÃ³xima sessÃ£o: uma varredura dedicada de `apps/web` para reconciliar esses
testes com o estado atual dos componentes (scripts, database panel, git
panel), decidindo caso a caso se o teste estÃ¡ desatualizado ou se revela uma
regressÃ£o real de UI.

## TambÃ©m em aberto (nÃ£o Ã© bug novo)

Registrado em `tasks/PENDENCIAS.md`: `useProjectProcessStatus.ts` (servidor) e
`useProjectRailsWorker.ts` (Sidekiq/webpack) fazem polling a cada 5s
indefinidamente, mesmo com o processo parado hÃ¡ horas, sem desacelerar.
PadrÃ£o consistente nos dois lugares â mudar sÃ³ um painel criaria
inconsistÃªncia com o outro; mudar os dois Ã© escopo maior que uma correÃ§Ã£o
pontual. Retomar quando fizer sentido.
