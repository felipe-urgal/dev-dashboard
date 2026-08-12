# Fechamento â IA multi-provider

> **2026-08-12:** toda a arquitetura multi-provider descrita neste documento
> (seleÃ§Ã£o Ollama/OpenAI, consentimento cloud, `AiProviderResolver`) foi
> removida â decisÃ£o explÃ­cita do usuÃ¡rio, ver
> [`238-remover-assistente-ia.md`](238-remover-assistente-ia.md). Documento
> mantido como registro histÃ³rico do fechamento original; nÃ£o descreve o
> estado atual do produto.

Este documento registra o fechamento da arquitetura multi-provider do Dev Dashboard apÃ³s os PRs #286â#293. O trabalho foi consolidado no **PR #295**.

O objetivo do fechamento Ã© garantir fluxos de IA consistentes, previsÃ­veis, testados e sem caminhos genÃ©ricos presos silenciosamente ao Ollama.

## DefiniÃ§Ã£o de pronto

A iniciativa pode ser considerada concluÃ­da quando:

- todo fluxo genÃ©rico de IA resolve provider e modo explicitamente;
- nenhum endpoint com nome genÃ©rico usa Ollama por acidente;
- Assistente/implementation e Code Review obedecem Ã  mesma seleÃ§Ã£o por projeto;
- consentimento cloud Ã© revalidado antes de qualquer envio de conteÃºdo do projeto;
- provider, modo e modelo usados nas executions relevantes sÃ£o rastreÃ¡veis;
- modelos incompatÃ­veis com o provider sÃ£o recusados antes da inferÃªncia;
- falhas de provider, autenticaÃ§Ã£o, consentimento, modelo, rede e parsing possuem cÃ³digos previsÃ­veis;
- cancelamento nÃ£o deixa execution ou request de IA em estado incorreto;
- masking Ã© aplicado nos caminhos de saÃ­da de conteÃºdo para providers;
- persistÃªncia de seleÃ§Ã£o/consentimento usa defaults seguros e escrita privada/atÃ´mica;
- documentaÃ§Ã£o e referÃªncia HTTP refletem o cÃ³digo real;
- os P1 foram revisados e classificados entre validado e follow-up nÃ£o bloqueante;
- a suÃ­te obrigatÃ³ria do repositÃ³rio estÃ¡ verde no commit final.

## Gate obrigatÃ³rio de validaÃ§Ã£o

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run docs:api:check
npm test
npm run test:e2e
```

Quando houver alteraÃ§Ã£o de schema/rota:

```bash
npm run docs:api
npm run docs:api:check
```

---

# P0 â bloqueadores para considerar multi-provider concluÃ­do

## 1. Code Review IA usar o resolver multi-provider â concluÃ­do

- [x] Resolver provider selecionado pelo projeto antes de iniciar Code Review.
- [x] Revalidar disponibilidade e consentimento cloud antes de cada nova revisÃ£o.
- [x] RevisÃ£o por arquivo e sÃ­ntese global usam o mesmo provider congelado no inÃ­cio da execution.
- [x] Registrar `provider` e `mode` no snapshot de `GitPullRequestAiReviewExecution`.
- [x] NÃ£o reler seleÃ§Ã£o durante uma execution em andamento.
- [x] Remover o endpoint one-shot `/git/pull-request/ai-review` sem consumidor.
- [x] Expor provider/modo no schema HTTP e contratos compartilhados.
- [x] Exibir provider/modo usados na UI da Code Review.
- [x] Cobrir OpenAI autorizado, falta de consentimento, provider indisponÃ­vel e troca de seleÃ§Ã£o durante execution.

**CritÃ©rio atendido:** uma revisÃ£o iniciada com OpenAI usa OpenAI; uma iniciada com Ollama usa Ollama; mudar a seleÃ§Ã£o depois do start nÃ£o altera a execution corrente.

## 2. Eliminar endpoints genÃ©ricos presos silenciosamente ao Ollama â concluÃ­do

- [x] Inventariar consumidores de `/ai/status`, `/ai/chat`, `/ai/complete` e `/ai/models/pull`.
- [x] Rotear `status/chat/complete` pelo resolver.
- [x] Remover acesso direto ao serviÃ§o Ollama das opÃ§Ãµes da rota genÃ©rica.
- [x] Tornar instalaÃ§Ã£o de modelo capability-based.
- [x] Provider cloud sem instalaÃ§Ã£o nÃ£o cai silenciosamente no Ollama.
- [x] Cobrir bypass do resolver com regressivos.

## 3. ValidaÃ§Ã£o de modelo no backend â concluÃ­do

- [x] Validar o modelo solicitado contra o provider resolvido antes da inferÃªncia.
- [x] Diferenciar provider indisponÃ­vel de modelo indisponÃ­vel/incompatÃ­vel.
- [x] NÃ£o depender de erro do fornecedor para descobrir modelo incompatÃ­vel.
- [x] Preservar escolha de modelo por execution.
- [x] Testar modelo Ollama enviado para OpenAI.
- [x] Testar modelo OpenAI enviado para Ollama.
- [x] Code Review valida provider/modelo antes de ler diff.
- [x] Chat, completion e implementation usam a mesma validaÃ§Ã£o.

## 4. Contratos de erro estÃ¡veis â concluÃ­do

- [x] Definir cÃ³digos para consentimento, provider indisponÃ­vel, modelo invÃ¡lido, auth, quota/billing, rate limit, timeout/cancelamento, resposta invÃ¡lida, operaÃ§Ã£o sem suporte e falha upstream.
- [x] Compartilhar `AiErrorCode` entre contracts, adapters, resolver, HTTP, SSE e executions.
- [x] Evitar converter todas as falhas para erros genÃ©ricos.
- [x] Registrar `errorCode` em implementation e Code Review quando aplicÃ¡vel.
- [x] Manter mensagem textual voltada Ã  pessoa usuÃ¡ria/troubleshooting e cÃ³digo voltado Ã  lÃ³gica.
- [x] Atualizar referÃªncia HTTP e documentaÃ§Ã£o.
- [x] Cobrir taxonomia e mapeamento HTTP com regressivos.

## 5. SeguranÃ§a de saÃ­da cloud â concluÃ­do

- [x] Testar masking de chat com OpenAI selecionada.
- [x] Testar masking de implementation, incluindo resultado de ferramenta reapresentado ao modelo.
- [x] Testar masking de completion.
- [x] Testar masking da Code Review por arquivo e da sÃ­ntese global.
- [x] Garantir que consentimento seja verificado antes de ler/enviar conteÃºdo do projeto para cloud.
- [x] Testar revogaÃ§Ã£o de consentimento entre duas executions.
- [x] Testar que status/listagem de modelos nÃ£o envia identidade ou conteÃºdo do projeto.
- [x] Confirmar que a API key permanece em header de autenticaÃ§Ã£o e nÃ£o entra no conteÃºdo/eventos.
- [x] Remover serializaÃ§Ã£o de `Error.message/cause` arbitrÃ¡rios dos logs estruturados das rotas de IA.
- [x] Corrigir documentaÃ§Ã£o que descrevia a IA como exclusivamente local.

A suÃ­te `apps/api/test/ai-cloud-security.test.ts` usa o adapter real `OpenAiProvider` com `fetch` capturado para provar a fronteira cloud sem fazer chamadas externas.

## 6. Cancelamento e concorrÃªncia â concluÃ­do

- [x] Propagar cancelamento externo atÃ© os requests HTTP de OpenAI e Ollama.
- [x] Cancelar Code Review durante revisÃ£o por arquivo sem deixar estado `running`.
- [x] Cancelar durante sÃ­ntese global e impedir resposta tardia de sobrescrever `cancelled`.
- [x] Terminalizar implementation antes de disparar o abort, evitando evento sÃ­ncrono tardio.
- [x] Terminalizar Code Review antes de disparar o abort.
- [x] Manter apenas uma execution ativa por fluxo/projeto conforme a policy atual.
- [x] Reconsultar a seleÃ§Ã£o apÃ³s requests de status para evitar provider/modo stale em troca rÃ¡pida.
- [x] Fechar implementation e Code Review no hook `onClose` da API.
- [x] Auditar polling das telas: reagendamento somente enquanto `running` e cleanup ao desmontar.

**CritÃ©rio atendido:** `cancelled` Ã© terminal/monotÃ´nico e shutdown/troca de seleÃ§Ã£o nÃ£o deixam uma resposta tardia alterar o estado lÃ³gico da execuÃ§Ã£o.

---

# P1 â hardening revisado e classificado

Os itens abaixo **nÃ£o bloqueiam o merge do #295**. O que protege comportamento essencial foi validado neste PR; melhorias incrementais permanecem como follow-up explÃ­cito.

## 7. UX Ãºnica de seleÃ§Ã£o de IA

### Validado no #295

- [x] Code Review usa a seleÃ§Ã£o persistida do projeto, em vez de um estado Ollama paralelo.
- [x] Provider e modo usados ficam visÃ­veis na execution de Code Review.
- [x] Provider indisponÃ­vel/consentimento ausente bloqueiam o inÃ­cio do fluxo com motivo compreensÃ­vel.
- [x] RevogaÃ§Ã£o de consentimento vale para a prÃ³xima execution.

### Follow-up nÃ£o bloqueante

- Refinar apresentaÃ§Ã£o conjunta de `Local/Cloud`, provider, modo e modelo somente se houver ganho de UX; evitar criar seletores duplicados.

## 8. Fallback consistente

### Validado

- [x] PolÃ­tica continua `off/offer`; nÃ£o existe fallback automÃ¡tico.
- [x] Local â Cloud nunca inicia automaticamente.
- [x] Fallback parte do provider registrado na execution, nÃ£o da seleÃ§Ã£o atual mutÃ¡vel.
- [x] Uma nova execution nÃ£o transporta histÃ³rico/tool results/eventos da anterior.

### Follow-up nÃ£o bloqueante

- Refinar a elegibilidade da oferta por classe de erro se a UX exigir.
- Avaliar fallback `offer` na Code Review somente com desenho explÃ­cito que evite revisÃ£o dupla/custo inesperado.

## 9. Observabilidade e diagnÃ³stico

### Validado

- [x] Falhas de rede, auth, quota, rate limit, timeout, cancelamento e payload invÃ¡lido sÃ£o distinguÃ­veis por cÃ³digo.
- [x] Rotas de IA nÃ£o registram API key, body completo, prompt, diff ou `Error.message/cause` bruto como contexto estruturado.
- [x] Logs de request usam somente metadados allowlistados quando necessÃ¡rio.
- [x] MÃ©tricas estruturadas de duraÃ§Ã£o/estado terminal por execution: `ai-execution-metrics.ts`
  registra `executionKind`, `executionId`, `projectId`, `provider`, `mode`, `status`, `durationMs`
  e `errorCode` (quando houver) exatamente uma vez, no momento em que a execution de
  implementation ou Code Review chega a um estado terminal â nunca prompt, diff, resumo ou achado.

### Follow-up nÃ£o bloqueante

Nenhum pendente neste item.

## 10. Provider OpenAI

### Validado

- [x] Respostas vazias/`choices` ausente, argumentos invÃ¡lidos e erros HTTP sÃ£o classificados.
- [x] Timeout e cancelamento do caller sÃ£o categorias distintas.
- [x] `store: false` permanece nas requests de inferÃªncia.
- [x] IDs nativos de tool calls ficam encapsulados no adapter.
- [x] Billing/quota recebe mensagem amigÃ¡vel e estado temporariamente indisponÃ­vel.
- [x] LimitaÃ§Ãµes atuais do adapter estÃ£o documentadas.

### Follow-up nÃ£o bloqueante

- Evoluir filtro/descoberta de modelos conforme a API da OpenAI mudar; o backend jÃ¡ rejeita qualquer modelo fora do catÃ¡logo retornado pelo provider.

## 11. Provider Ollama

### Validado

- [x] URL configurÃ¡vel continua restrita a loopback HTTP.
- [x] Tool call textual permanece isolado no adapter e nÃ£o autoriza ferramenta fora do catÃ¡logo.
- [x] Timeout, cancelamento, resposta invÃ¡lida, indisponibilidade e falha upstream tÃªm cÃ³digos prÃ³prios.
- [x] InstalaÃ§Ã£o de modelo continua capability local e nunca faz fallback oculto para cloud.
- [x] Matriz de regressÃ£o do adapter ampliada: Ollama offline (`status`/`chatRound` com fetch
  falhando), zero modelos instalados, modelo removido no meio do uso (`chatRound` contra um modelo
  inexistente retorna HTTP 404 tratado), NDJSON incompleto (linha truncada sem fechar o JSON) e
  cancelamento de um download de modelo em andamento sem lanÃ§ar erro
  (`apps/api/test/ollama-provider.test.ts`).

### Follow-up nÃ£o bloqueante

Nenhum pendente neste item.

## 12. PersistÃªncia local

### Validado por implementaÃ§Ã£o

- [x] SeleÃ§Ã£o e consentimento usam arquivos privados `0600` em diretÃ³rio `0700`.
- [x] Escrita usa arquivo temporÃ¡rio privado + `rename`, evitando substituir o estado vÃ¡lido por conteÃºdo parcial.
- [x] Arquivo ausente usa default seguro (`ollama + fast` / sem consentimento cloud).
- [x] ConfiguraÃ§Ã£o invÃ¡lida ou versÃ£o desconhecida Ã© colocada em quarentena e nÃ£o concede cloud por acidente.
- [x] SeleÃ§Ã£o sÃ³ altera o estado em memÃ³ria depois da persistÃªncia bem-sucedida.
- [x] A UI restaura a seleÃ§Ã£o persistida quando `PUT /ai/selection` falha.
- [x] Fault injection cobre queda do processo entre `writeFile` e `rename` para consentimento e seleÃ§Ã£o: o arquivo real permanece com o Ãºltimo estado vÃ¡lido, o estado em memÃ³ria nÃ£o avanÃ§a, o `.tmp` Ã³rfÃ£o nÃ£o interfere em leituras futuras, e a prÃ³xima escrita bem-sucedida recupera o fluxo normalmente (`packages/core/test/project-ai-repositories.test.ts`).
- [x] Teste visual dedicado cobre falha de persistÃªncia do consentimento: `PUT /providers/openai/consent` retornando erro mantÃ©m `consentGranted` anterior, exibe a mensagem de erro e nÃ£o libera o botÃ£o de revogar acesso (`apps/web/test/project-ai-assistant-panel.test.ts`).

### Follow-up nÃ£o bloqueante

Nenhum pendente neste item.

## 13. ExecuÃ§Ã£o `fast` / `complete`

### Validado

- [x] Budgets sÃ£o definidos por modo numa policy Ãºnica e sÃ£o provider-neutral.
- [x] `fast` nÃ£o faz sÃ­ntese global; `complete` faz.
- [x] Orquestrador limita rounds, tamanho por tool result, acumulado e repetiÃ§Ã£o sem progresso.
- [x] Testes de stress cobrem os quatro limites do modo `fast`: truncamento de um resultado de
  ferramenta acima de `maxToolResultChars`, corte do fluxo ao ultrapassar
  `maxAccumulatedToolResultChars`, recusa da mesma chamada repetida alÃ©m de `maxIdenticalToolCalls`,
  e encerramento previsÃ­vel ao esgotar `maxToolRounds` sem convergÃªncia
  (`apps/api/test/ai-assistant-service.test.ts`).

### Follow-up nÃ£o bloqueante

Nenhum pendente neste item.

## 14. Tool calling e workspace edit

### Validado

- [x] Providers passam pelo mesmo catÃ¡logo fechado de ferramentas.
- [x] Ferramenta fora do catÃ¡logo falha fechada e nÃ£o Ã© executada.
- [x] Argumentos obrigatÃ³rios sÃ£o validados antes da operaÃ§Ã£o local.
- [x] Tool results sÃ£o truncados pelos budgets e passam pela barreira de masking antes de voltar ao provider.
- [x] `propose_workspace_edit` exige inspeÃ§Ã£o bem-sucedida do projeto.
- [x] Workspace edit permanece preview + confirmaÃ§Ã£o; `expectedVersion` continua controlado pelo servidor.
- [x] Teste de stress cobre um resultado de ferramenta excepcionalmente grande (9.000 caracteres
  contra o limite de 8.000 do modo fast): o conteÃºdo devolvido ao provider Ã© truncado exatamente no
  limite e marcado `truncated: true` (`apps/api/test/ai-assistant-service.test.ts`).

### Follow-up nÃ£o bloqueante

Nenhum pendente neste item.

---

# P2 â evoluÃ§Ã£o arquitetural deliberadamente adiada

## 15. Terceiro provider cloud

NÃ£o adicionar apenas para provar abstraÃ§Ã£o. Um futuro provider deve reutilizar autenticaÃ§Ã£o oficial, tool calling normalizado, consentimento cloud, masking, validaÃ§Ã£o de modelo e contratos de erro.

## 16. `ProviderRegistry` dinÃ¢mico

Adiar atÃ© um terceiro provider tornar o `Record<AiProviderId, ...>` oneroso.

## 17. Fallback automÃ¡tico

Continua fora do escopo. Local â Cloud automÃ¡tico permanece proibido sem polÃ­tica explÃ­cita de custo/privacidade e consentimento compatÃ­vel.

## 18. AbstraÃ§Ãµes adicionais

`ContextBuilder`, `ToolExecutor`, cache semÃ¢ntico e outras extraÃ§Ãµes sÃ³ entram quando houver reutilizaÃ§Ã£o, gargalo medido ou ganho claro de manutenÃ§Ã£o.

---

# Estado final do PR #295

1. ~~Code Review multi-provider + snapshot provider/mode.~~
2. ~~Endpoints genÃ©ricos resolvidos por provider.~~
3. ~~ValidaÃ§Ã£o server-side de modelo.~~
4. ~~Contratos de erro estÃ¡veis.~~
5. ~~Hardening de seguranÃ§a cloud.~~
6. ~~Cancelamento e concorrÃªncia.~~
7. **Auditoria final de documentaÃ§Ã£o + CI do head final.**

O merge sÃ³ deve ser liberado quando o head que contÃ©m esta auditoria passar integralmente pelo gate obrigatÃ³rio. Os follow-ups P1/P2 acima sÃ£o melhorias deliberadas e nÃ£o representam bugs conhecidos que bloqueiem o fechamento multi-provider de dois providers.
