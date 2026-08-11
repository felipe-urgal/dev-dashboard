# Próxima atividade

**Concluído em sessões recentes**, tudo em [`234-unificar-execucoes-em-terminal.md`](234-unificar-execucoes-em-terminal.md):

PR #299:

1. Logs de servidor e workers Rails (Sidekiq/webpack) trocaram de polling para push via SSE.
2. Item 0 (pré-requisito do resto do desenho): `DetachableExecutionService`
   (`apps/api/src/services/detachable-execution-service.ts`) — roda um comando num PTY sem matar o
   processo ao desconectar, com buffer de saída e reanexação.
3. Item 1 (PoC de testes), **escopo reduzido para "suíte completa" apenas** — decisão tomada
   depois de investigar o modelo real de execução de testes (mais complexo do que o desenho
   original assumia: três formas de disparo, cada uma com resolução própria e acoplada ao formato
   de `ManagedProcess`). `ProjectTestsPanel.vue` agora roda a suíte completa num terminal PTY
   destacável (`ProjectTestsPtyPanel.vue` + `ProjectTestPtyService`); arquivo específico, testes
   relacionados, histórico e Diagnóstico especializado **saíram do ar temporariamente** (código
   antigo preservado como referência, não deletado — ver `docs/guia/testes.md`).

PR #301:

4. Item 2 (Migration Rails) — `RailsMigrationPtyService` +
   `apps/api/src/routes/rails/migration-pty-routes.ts`, reaproveitando o padrão do item 1 (mesmo
   `DetachableExecutionService`, agora com um composable compartilhado `usePtyTerminalSocket.ts`
   extraído da lógica de WS+xterm que estava duplicada). **Diferente de Testes: o fluxo antigo
   (confirmação por token + `execFile` bloqueante) foi removido por completo, não preservado como
   referência** — decisão explícita do usuário. Corrigido no caminho: a saída do PTY não passava
   pela máscara de segredos que o resto do dashboard usa — corrigido uma vez em
   `DetachableExecutionService`, cobrindo Testes e Migration automaticamente. Também corrigido: a
   UI de Testes não tinha como cancelar uma execução travada depois de um erro no meio do caminho.
5. Item 3 (Dependências/Build) — `ProjectDependenciesPtyService` +
   `apps/api/src/routes/dependencies-pty-routes.ts`, terceiro consumidor do mesmo
   `DetachableExecutionService`/`usePtyTerminalSocket.ts`. Mapeamento prévio corrigiu a suposição
   da task original (`useProjectDatabaseOverview.ts` não tem relação — a UI real é
   `ProjectDependenciesPanel.vue`) e mostrou que este era o candidato de maior ganho líquido dos
   três (saída de build potencialmente longa/colorida, custo de infraestrutura já pago). **Mesma
   decisão de Migration: fluxo antigo removido por completo**, incluindo o histórico de execuções
   recentes e o Diagnóstico especializado do painel, que não têm equivalente no modelo PTY.

Suíte completa verde: `apps/api` 741/741, `apps/web` 393/393. Gate local (`typecheck`, `lint`,
`format:check`, `build`, `docs:api:check`) verde.

Próximos passos possíveis, nenhum obrigatório: repor file/related/Diagnóstico de Testes sobre o
modelo novo; ou item 4 (consolidação, remover SSE de `script-execution/*` para os fluxos que já
migraram — Scripts genérico continua nele) quando/se fizer sentido.
Também em aberto (não é bug novo, é um padrão pré-existente em todo o app, registrado em
`tasks/PENDENCIAS.md`): o polling de status de Server/Sidekiq/Webpack continua no mesmo intervalo
fixo mesmo com o processo parado, em vez de desacelerar. O usuário pausou os follow-ups da IA
multi-provider pra focar nessa frente — retomar quando quiser (seção abaixo).

O fechamento técnico da IA multi-provider (P0) está consolidado em `main` desde o **PR #295**,
seguindo [`AI-MULTI-PROVIDER-FINALIZATION.md`](AI-MULTI-PROVIDER-FINALIZATION.md). Não há
bloqueador conhecido pendente para os dois providers atuais (Ollama + OpenAI).

## Estado atual

Todos os P0 do checklist estão concluídos e mergeados. Dos follow-ups P1 não bloqueantes, seis dos
oito já foram fechados — só restam os itens 8 e 10 (ver "Próximos follow-ups" abaixo):

- **item 12** (persistência local) — fault injection de `writeFile`/`rename` e teste visual de
  falha de consentimento (PR #296).
- **item 11** (provider Ollama) — matriz de regressão ampliada: offline, zero modelos, modelo
  removido em uso, NDJSON incompleto, cancelamento de download (PR #297).
- **item 9** (observabilidade) — novo `apps/api/src/services/ai-execution-metrics.ts`: uma métrica
  estruturada (`executionKind`, `executionId`, `projectId`, `provider`, `mode`, `status`,
  `durationMs`, `errorCode` quando houver) é registrada exatamente uma vez, quando uma execution de
  implementation ou Code Review chega a um estado terminal — nunca prompt, diff, resumo ou achado
  (PR #297).
- **itens 13/14** (budgets fast/complete e tool calling) — stress tests dos quatro limites do modo
  `fast` do orquestrador: truncamento de tool result grande, corte por contexto acumulado, recusa
  de chamada repetida além do limite, e encerramento previsível ao esgotar os rounds sem
  convergência (PR #297).

Também no PR #296/#297, fora do checklist de fechamento multi-provider (pedido direto do usuário):
a Code Review IA ganhou comentários inline no diff (estilo GitHub) e um toggle **Diff / Arquivo
completo** por arquivo — este último busca o conteúdo atual via `GET /projects/:id/files/content`
(rota já existente) e destaca as linhas alteradas, com fallback para o Diff quando o arquivo não
pode ser lido.

Suíte completa verde no PR #297: `apps/api` 696/696, `apps/web` 389/389. Gate local (`typecheck`,
`lint`, `format:check`, `build`, `docs:api:check`) verde.

## Próximos follow-ups não bloqueantes (ordem sugerida)

Nenhum deles bloqueia uso do multi-provider atual; escolher pela próxima sessão:

1. **UX de fallback `offer` na Code Review** (item 8) — requer desenho explícito que evite revisão
   dupla/custo inesperado.
2. **Evolução da descoberta de modelos da OpenAI** (item 10) quando a API mudar; hoje o backend já
   rejeita qualquer modelo fora do catálogo retornado pelo provider.

P2 continua deliberadamente adiado: terceiro provider, `ProviderRegistry` dinâmico, fallback
automático e abstrações adicionais sem necessidade concreta.
