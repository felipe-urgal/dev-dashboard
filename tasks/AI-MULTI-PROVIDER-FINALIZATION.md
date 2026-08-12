# Fechamento — IA multi-provider

> **2026-08-12:** toda a arquitetura multi-provider descrita neste documento
> (seleção Ollama/OpenAI, consentimento cloud, `AiProviderResolver`) foi
> removida — decisão explícita do usuário, ver
> [`238-remover-assistente-ia.md`](238-remover-assistente-ia.md). Documento
> mantido como registro histórico do fechamento original; não descreve o
> estado atual do produto.

Este documento registra o fechamento da arquitetura multi-provider do Dev Dashboard após os PRs #286–#293. O trabalho foi consolidado no **PR #295**.

O objetivo do fechamento é garantir fluxos de IA consistentes, previsíveis, testados e sem caminhos genéricos presos silenciosamente ao Ollama.

## Definição de pronto

A iniciativa pode ser considerada concluída quando:

- todo fluxo genérico de IA resolve provider e modo explicitamente;
- nenhum endpoint com nome genérico usa Ollama por acidente;
- Assistente/implementation e Code Review obedecem à mesma seleção por projeto;
- consentimento cloud é revalidado antes de qualquer envio de conteúdo do projeto;
- provider, modo e modelo usados nas executions relevantes são rastreáveis;
- modelos incompatíveis com o provider são recusados antes da inferência;
- falhas de provider, autenticação, consentimento, modelo, rede e parsing possuem códigos previsíveis;
- cancelamento não deixa execution ou request de IA em estado incorreto;
- masking é aplicado nos caminhos de saída de conteúdo para providers;
- persistência de seleção/consentimento usa defaults seguros e escrita privada/atômica;
- documentação e referência HTTP refletem o código real;
- os P1 foram revisados e classificados entre validado e follow-up não bloqueante;
- a suíte obrigatória do repositório está verde no commit final.

## Gate obrigatório de validação

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run docs:api:check
npm test
npm run test:e2e
```

Quando houver alteração de schema/rota:

```bash
npm run docs:api
npm run docs:api:check
```

---

# P0 — bloqueadores para considerar multi-provider concluído

## 1. Code Review IA usar o resolver multi-provider — concluído

- [x] Resolver provider selecionado pelo projeto antes de iniciar Code Review.
- [x] Revalidar disponibilidade e consentimento cloud antes de cada nova revisão.
- [x] Revisão por arquivo e síntese global usam o mesmo provider congelado no início da execution.
- [x] Registrar `provider` e `mode` no snapshot de `GitPullRequestAiReviewExecution`.
- [x] Não reler seleção durante uma execution em andamento.
- [x] Remover o endpoint one-shot `/git/pull-request/ai-review` sem consumidor.
- [x] Expor provider/modo no schema HTTP e contratos compartilhados.
- [x] Exibir provider/modo usados na UI da Code Review.
- [x] Cobrir OpenAI autorizado, falta de consentimento, provider indisponível e troca de seleção durante execution.

**Critério atendido:** uma revisão iniciada com OpenAI usa OpenAI; uma iniciada com Ollama usa Ollama; mudar a seleção depois do start não altera a execution corrente.

## 2. Eliminar endpoints genéricos presos silenciosamente ao Ollama — concluído

- [x] Inventariar consumidores de `/ai/status`, `/ai/chat`, `/ai/complete` e `/ai/models/pull`.
- [x] Rotear `status/chat/complete` pelo resolver.
- [x] Remover acesso direto ao serviço Ollama das opções da rota genérica.
- [x] Tornar instalação de modelo capability-based.
- [x] Provider cloud sem instalação não cai silenciosamente no Ollama.
- [x] Cobrir bypass do resolver com regressivos.

## 3. Validação de modelo no backend — concluído

- [x] Validar o modelo solicitado contra o provider resolvido antes da inferência.
- [x] Diferenciar provider indisponível de modelo indisponível/incompatível.
- [x] Não depender de erro do fornecedor para descobrir modelo incompatível.
- [x] Preservar escolha de modelo por execution.
- [x] Testar modelo Ollama enviado para OpenAI.
- [x] Testar modelo OpenAI enviado para Ollama.
- [x] Code Review valida provider/modelo antes de ler diff.
- [x] Chat, completion e implementation usam a mesma validação.

## 4. Contratos de erro estáveis — concluído

- [x] Definir códigos para consentimento, provider indisponível, modelo inválido, auth, quota/billing, rate limit, timeout/cancelamento, resposta inválida, operação sem suporte e falha upstream.
- [x] Compartilhar `AiErrorCode` entre contracts, adapters, resolver, HTTP, SSE e executions.
- [x] Evitar converter todas as falhas para erros genéricos.
- [x] Registrar `errorCode` em implementation e Code Review quando aplicável.
- [x] Manter mensagem textual voltada à pessoa usuária/troubleshooting e código voltado à lógica.
- [x] Atualizar referência HTTP e documentação.
- [x] Cobrir taxonomia e mapeamento HTTP com regressivos.

## 5. Segurança de saída cloud — concluído

- [x] Testar masking de chat com OpenAI selecionada.
- [x] Testar masking de implementation, incluindo resultado de ferramenta reapresentado ao modelo.
- [x] Testar masking de completion.
- [x] Testar masking da Code Review por arquivo e da síntese global.
- [x] Garantir que consentimento seja verificado antes de ler/enviar conteúdo do projeto para cloud.
- [x] Testar revogação de consentimento entre duas executions.
- [x] Testar que status/listagem de modelos não envia identidade ou conteúdo do projeto.
- [x] Confirmar que a API key permanece em header de autenticação e não entra no conteúdo/eventos.
- [x] Remover serialização de `Error.message/cause` arbitrários dos logs estruturados das rotas de IA.
- [x] Corrigir documentação que descrevia a IA como exclusivamente local.

A suíte `apps/api/test/ai-cloud-security.test.ts` usa o adapter real `OpenAiProvider` com `fetch` capturado para provar a fronteira cloud sem fazer chamadas externas.

## 6. Cancelamento e concorrência — concluído

- [x] Propagar cancelamento externo até os requests HTTP de OpenAI e Ollama.
- [x] Cancelar Code Review durante revisão por arquivo sem deixar estado `running`.
- [x] Cancelar durante síntese global e impedir resposta tardia de sobrescrever `cancelled`.
- [x] Terminalizar implementation antes de disparar o abort, evitando evento síncrono tardio.
- [x] Terminalizar Code Review antes de disparar o abort.
- [x] Manter apenas uma execution ativa por fluxo/projeto conforme a policy atual.
- [x] Reconsultar a seleção após requests de status para evitar provider/modo stale em troca rápida.
- [x] Fechar implementation e Code Review no hook `onClose` da API.
- [x] Auditar polling das telas: reagendamento somente enquanto `running` e cleanup ao desmontar.

**Critério atendido:** `cancelled` é terminal/monotônico e shutdown/troca de seleção não deixam uma resposta tardia alterar o estado lógico da execução.

---

# P1 — hardening revisado e classificado

Os itens abaixo **não bloqueiam o merge do #295**. O que protege comportamento essencial foi validado neste PR; melhorias incrementais permanecem como follow-up explícito.

## 7. UX única de seleção de IA

### Validado no #295

- [x] Code Review usa a seleção persistida do projeto, em vez de um estado Ollama paralelo.
- [x] Provider e modo usados ficam visíveis na execution de Code Review.
- [x] Provider indisponível/consentimento ausente bloqueiam o início do fluxo com motivo compreensível.
- [x] Revogação de consentimento vale para a próxima execution.

### Follow-up não bloqueante

- Refinar apresentação conjunta de `Local/Cloud`, provider, modo e modelo somente se houver ganho de UX; evitar criar seletores duplicados.

## 8. Fallback consistente

### Validado

- [x] Política continua `off/offer`; não existe fallback automático.
- [x] Local → Cloud nunca inicia automaticamente.
- [x] Fallback parte do provider registrado na execution, não da seleção atual mutável.
- [x] Uma nova execution não transporta histórico/tool results/eventos da anterior.

### Follow-up não bloqueante

- Refinar a elegibilidade da oferta por classe de erro se a UX exigir.
- Avaliar fallback `offer` na Code Review somente com desenho explícito que evite revisão dupla/custo inesperado.

## 9. Observabilidade e diagnóstico

### Validado

- [x] Falhas de rede, auth, quota, rate limit, timeout, cancelamento e payload inválido são distinguíveis por código.
- [x] Rotas de IA não registram API key, body completo, prompt, diff ou `Error.message/cause` bruto como contexto estruturado.
- [x] Logs de request usam somente metadados allowlistados quando necessário.
- [x] Métricas estruturadas de duração/estado terminal por execution: `ai-execution-metrics.ts`
  registra `executionKind`, `executionId`, `projectId`, `provider`, `mode`, `status`, `durationMs`
  e `errorCode` (quando houver) exatamente uma vez, no momento em que a execution de
  implementation ou Code Review chega a um estado terminal — nunca prompt, diff, resumo ou achado.

### Follow-up não bloqueante

Nenhum pendente neste item.

## 10. Provider OpenAI

### Validado

- [x] Respostas vazias/`choices` ausente, argumentos inválidos e erros HTTP são classificados.
- [x] Timeout e cancelamento do caller são categorias distintas.
- [x] `store: false` permanece nas requests de inferência.
- [x] IDs nativos de tool calls ficam encapsulados no adapter.
- [x] Billing/quota recebe mensagem amigável e estado temporariamente indisponível.
- [x] Limitações atuais do adapter estão documentadas.

### Follow-up não bloqueante

- Evoluir filtro/descoberta de modelos conforme a API da OpenAI mudar; o backend já rejeita qualquer modelo fora do catálogo retornado pelo provider.

## 11. Provider Ollama

### Validado

- [x] URL configurável continua restrita a loopback HTTP.
- [x] Tool call textual permanece isolado no adapter e não autoriza ferramenta fora do catálogo.
- [x] Timeout, cancelamento, resposta inválida, indisponibilidade e falha upstream têm códigos próprios.
- [x] Instalação de modelo continua capability local e nunca faz fallback oculto para cloud.
- [x] Matriz de regressão do adapter ampliada: Ollama offline (`status`/`chatRound` com fetch
  falhando), zero modelos instalados, modelo removido no meio do uso (`chatRound` contra um modelo
  inexistente retorna HTTP 404 tratado), NDJSON incompleto (linha truncada sem fechar o JSON) e
  cancelamento de um download de modelo em andamento sem lançar erro
  (`apps/api/test/ollama-provider.test.ts`).

### Follow-up não bloqueante

Nenhum pendente neste item.

## 12. Persistência local

### Validado por implementação

- [x] Seleção e consentimento usam arquivos privados `0600` em diretório `0700`.
- [x] Escrita usa arquivo temporário privado + `rename`, evitando substituir o estado válido por conteúdo parcial.
- [x] Arquivo ausente usa default seguro (`ollama + fast` / sem consentimento cloud).
- [x] Configuração inválida ou versão desconhecida é colocada em quarentena e não concede cloud por acidente.
- [x] Seleção só altera o estado em memória depois da persistência bem-sucedida.
- [x] A UI restaura a seleção persistida quando `PUT /ai/selection` falha.
- [x] Fault injection cobre queda do processo entre `writeFile` e `rename` para consentimento e seleção: o arquivo real permanece com o último estado válido, o estado em memória não avança, o `.tmp` órfão não interfere em leituras futuras, e a próxima escrita bem-sucedida recupera o fluxo normalmente (`packages/core/test/project-ai-repositories.test.ts`).
- [x] Teste visual dedicado cobre falha de persistência do consentimento: `PUT /providers/openai/consent` retornando erro mantém `consentGranted` anterior, exibe a mensagem de erro e não libera o botão de revogar acesso (`apps/web/test/project-ai-assistant-panel.test.ts`).

### Follow-up não bloqueante

Nenhum pendente neste item.

## 13. Execução `fast` / `complete`

### Validado

- [x] Budgets são definidos por modo numa policy única e são provider-neutral.
- [x] `fast` não faz síntese global; `complete` faz.
- [x] Orquestrador limita rounds, tamanho por tool result, acumulado e repetição sem progresso.
- [x] Testes de stress cobrem os quatro limites do modo `fast`: truncamento de um resultado de
  ferramenta acima de `maxToolResultChars`, corte do fluxo ao ultrapassar
  `maxAccumulatedToolResultChars`, recusa da mesma chamada repetida além de `maxIdenticalToolCalls`,
  e encerramento previsível ao esgotar `maxToolRounds` sem convergência
  (`apps/api/test/ai-assistant-service.test.ts`).

### Follow-up não bloqueante

Nenhum pendente neste item.

## 14. Tool calling e workspace edit

### Validado

- [x] Providers passam pelo mesmo catálogo fechado de ferramentas.
- [x] Ferramenta fora do catálogo falha fechada e não é executada.
- [x] Argumentos obrigatórios são validados antes da operação local.
- [x] Tool results são truncados pelos budgets e passam pela barreira de masking antes de voltar ao provider.
- [x] `propose_workspace_edit` exige inspeção bem-sucedida do projeto.
- [x] Workspace edit permanece preview + confirmação; `expectedVersion` continua controlado pelo servidor.
- [x] Teste de stress cobre um resultado de ferramenta excepcionalmente grande (9.000 caracteres
  contra o limite de 8.000 do modo fast): o conteúdo devolvido ao provider é truncado exatamente no
  limite e marcado `truncated: true` (`apps/api/test/ai-assistant-service.test.ts`).

### Follow-up não bloqueante

Nenhum pendente neste item.

---

# P2 — evolução arquitetural deliberadamente adiada

## 15. Terceiro provider cloud

Não adicionar apenas para provar abstração. Um futuro provider deve reutilizar autenticação oficial, tool calling normalizado, consentimento cloud, masking, validação de modelo e contratos de erro.

## 16. `ProviderRegistry` dinâmico

Adiar até um terceiro provider tornar o `Record<AiProviderId, ...>` oneroso.

## 17. Fallback automático

Continua fora do escopo. Local → Cloud automático permanece proibido sem política explícita de custo/privacidade e consentimento compatível.

## 18. Abstrações adicionais

`ContextBuilder`, `ToolExecutor`, cache semântico e outras extrações só entram quando houver reutilização, gargalo medido ou ganho claro de manutenção.

---

# Estado final do PR #295

1. ~~Code Review multi-provider + snapshot provider/mode.~~
2. ~~Endpoints genéricos resolvidos por provider.~~
3. ~~Validação server-side de modelo.~~
4. ~~Contratos de erro estáveis.~~
5. ~~Hardening de segurança cloud.~~
6. ~~Cancelamento e concorrência.~~
7. **Auditoria final de documentação + CI do head final.**

O merge só deve ser liberado quando o head que contém esta auditoria passar integralmente pelo gate obrigatório. Os follow-ups P1/P2 acima são melhorias deliberadas e não representam bugs conhecidos que bloqueiem o fechamento multi-provider de dois providers.
