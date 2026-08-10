# Fechamento — IA multi-provider

Este documento é o checklist de fechamento da arquitetura multi-provider do Dev Dashboard após os PRs #286–#293.

O objetivo é sair de "roadmap implementado" para **fluxos de IA consistentes, previsíveis, testados e sem caminhos genéricos presos silenciosamente ao Ollama**.

## Definição de pronto

A iniciativa só deve ser considerada 100% concluída quando:

- todo fluxo genérico de IA resolver provider e modo explicitamente;
- nenhum endpoint com nome genérico usar Ollama por acidente;
- Assistente/implementation e Code Review obedecerem à mesma seleção por projeto;
- consentimento cloud for revalidado antes de qualquer envio de conteúdo do projeto;
- provider, modo e modelo usados em cada execução forem rastreáveis;
- modelos incompatíveis com o provider forem recusados antes da inferência;
- falhas de provider, autenticação, consentimento, modelo, rede e parsing tiverem comportamento e mensagem previsíveis;
- cancelamento não deixar execução, polling ou request órfão;
- masking for aplicado em todos os caminhos de saída de conteúdo;
- falha de persistência não deixar frontend e backend divergentes;
- documentação e referência HTTP refletirem o código real;
- suíte obrigatória do repositório estiver verde.

## Gate obrigatório de validação

Antes de considerar qualquer etapa concluída:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run docs:api:check
npm test
npm run test:e2e
```

Quando houver alteração de schema/rota, regenerar antes:

```bash
npm run docs:api
npm run docs:api:check
```

Se `format:check` falhar, executar `npm run format` e repetir a validação.

---

# P0 — bloqueadores para considerar multi-provider concluído

## 1. Code Review IA usar o resolver multi-provider

**Estado atual:** o Assistente/implementation usa `AiProviderResolver`, mas `GitAiCodeReviewService` ainda recebe diretamente o `AiAssistantService` local criado sobre `OllamaProvider`.

### Entregar

- [ ] Resolver provider selecionado pelo projeto antes de iniciar Code Review.
- [ ] Revalidar disponibilidade e consentimento cloud antes de cada nova revisão.
- [ ] Fazer revisão por arquivo e síntese global usarem o mesmo provider congelado no início da execution.
- [ ] Registrar `provider` e `mode` no snapshot de `GitPullRequestAiReviewExecution`.
- [ ] Não reler seleção durante uma execução em andamento.
- [ ] Fazer o endpoint one-shot `/git/pull-request/ai-review` obedecer à mesma resolução ou removê-lo se estiver comprovadamente sem consumidor.
- [ ] Expor provider/modo no schema HTTP e contratos compartilhados.
- [ ] Exibir na UI qual provider e modo estão sendo usados na Code Review.
- [ ] Cobrir Ollama, OpenAI autorizado, OpenAI sem consentimento, provider indisponível e troca de seleção durante execução.

### Critério de aceite

Uma Code Review iniciada com OpenAI selecionada usa OpenAI; uma iniciada com Ollama usa Ollama; mudar a seleção depois do start não muda a execution corrente.

## 2. Eliminar endpoints genéricos presos silenciosamente ao Ollama

**Achado atual:** `/ai/status`, `/ai/chat` e `/ai/complete` ainda chamam diretamente `aiAssistantService`, que no `AppContext` é Ollama. `/ai/models/pull` também é uma operação local/Ollama com rota genérica.

### Entregar

- [ ] Inventariar consumidores reais de `/ai/status`, `/ai/chat`, `/ai/complete` e `/ai/models/pull`.
- [ ] Rotear `status/chat/complete` pelo resolver quando forem APIs genéricas válidas.
- [ ] Se não houver consumidor, remover endpoints e cliente órfãos em vez de manter compatibilidade falsa.
- [ ] Tornar instalação de modelo explicitamente local/Ollama ou capability-based; nunca tentar "pull" em provider cloud.
- [ ] Garantir que documentação e nomes de rota deixem claro quando uma operação é provider-specific.
- [ ] Adicionar testes de regressão impedindo que uma rota genérica volte a bypassar o resolver.

## 3. Validação de modelo no backend

Hoje a UI escolhe modelos por provider, mas requests manuais podem enviar um nome incompatível.

### Entregar

- [ ] Validar que o modelo solicitado pertence ao provider resolvido/está disponível antes da inferência.
- [ ] Diferenciar `provider indisponível` de `modelo indisponível/incompatível`.
- [ ] Não depender de erro do fornecedor para descobrir modelo inválido.
- [ ] Preservar escolha de modelo por execução, sem persistir modelo globalmente sem necessidade.
- [ ] Testar modelo Ollama enviado para OpenAI e modelo OpenAI enviado para Ollama.

## 4. Contratos de erro estáveis

### Entregar

- [ ] Definir códigos específicos para consentimento, provider indisponível, modelo inválido, autenticação cloud, timeout/cancelamento e resposta inválida.
- [ ] Evitar converter todos os problemas de provider em `AI_ASSISTANT_INVALID_REQUEST` ou `AI_ASSISTANT_FAILED` genérico.
- [ ] Garantir mensagens provider-neutral na fachada/orquestração.
- [ ] Manter detalhes específicos dentro do adapter quando apropriado.
- [ ] Não vazar credenciais, prompt, diff ou resultados sensíveis em logs de erro.

## 5. Segurança de saída cloud

### Entregar

- [ ] Testar masking de chat, implementation, Code Review local, síntese global e completion com OpenAI selecionada.
- [ ] Testar masking também de resultados de ferramentas reapresentados ao modelo.
- [ ] Confirmar que headers/credenciais nunca entram no conteúdo mascarado/logado.
- [ ] Garantir que consentimento seja verificado antes do primeiro request que contenha conteúdo do projeto.
- [ ] Testar revogação de consentimento entre duas execuções.
- [ ] Testar que status/listagem de modelos não envia conteúdo do projeto.

## 6. Cancelamento e concorrência

### Entregar

- [ ] Cancelar Code Review em Ollama e OpenAI sem requests órfãos.
- [ ] Cancelar durante revisão por arquivo e durante síntese global.
- [ ] Garantir apenas uma execution ativa por fluxo/projeto quando essa for a policy definida.
- [ ] Testar troca rápida de provider/mode enquanto requests de status estão em voo.
- [ ] Testar fechamento da API com executions em andamento.
- [ ] Garantir que polling pare em estados terminais e ao desmontar componentes.

---

# P1 — hardening de produto e prevenção de bugs

## 7. UX única de seleção de IA

- [ ] Evitar seletores duplicados e divergentes entre Assistente e Code Review.
- [ ] Code Review deve refletir a seleção persistida do projeto ou compartilhar um componente/composable de seleção.
- [ ] Mostrar `Local`/`Cloud`, provider, modo e modelo sem transformar a tela em painel técnico.
- [ ] Provider indisponível deve aparecer desabilitado com motivo.
- [ ] OpenAI sem consentimento deve mostrar ação explícita de autorização.
- [ ] Revogação deve refletir imediatamente na próxima execução.

## 8. Fallback consistente

- [ ] Manter `off/offer` sem fallback automático.
- [ ] Garantir que fallback use provider registrado na execution em todos os fluxos suportados.
- [ ] Não oferecer troca para erro de ferramenta, modelo ou parsing se o provider continua disponível.
- [ ] Não transportar histórico, tool results, diff ou eventos da execução anterior.
- [ ] Nunca iniciar Local → Cloud automaticamente.
- [ ] Garantir consentimento explícito também após aceitar oferta.
- [ ] Avaliar se Code Review deve ter fallback `offer`; implementar apenas se a UX não induzir revisão dupla silenciosa.

## 9. Observabilidade e diagnóstico

- [ ] Logar `executionId`, `projectId`, `provider`, `mode` e operação sem logar conteúdo sensível.
- [ ] Diferenciar falha de rede, autenticação, rate limit, timeout, cancelamento e payload inválido.
- [ ] Registrar duração e estado terminal das executions.
- [ ] Garantir que erros de provider tenham contexto suficiente para troubleshooting local.
- [ ] Não logar API key nem bodies completos de requests cloud.

## 10. Provider OpenAI

- [ ] Revisar descoberta/filtro de modelos para evitar aceitar modelo incompatível ou rejeitar modelo suportado sem motivo.
- [ ] Testar resposta vazia, `choices` ausente, tool call malformada, argumentos inválidos e erro HTTP.
- [ ] Testar abort/timeout e propagação de cancelamento.
- [ ] Manter `store: false` nas requests de inferência.
- [ ] Confirmar que IDs nativos de tool calls continuam encapsulados no adapter.
- [ ] Documentar claramente limitações atuais do adapter.

## 11. Provider Ollama

- [ ] Preservar validação de loopback para URL configurável.
- [ ] Testar Ollama offline, sem modelos, modelo removido durante uso e resposta NDJSON incompleta.
- [ ] Manter compatibilidade de tool call textual isolada no adapter.
- [ ] Garantir que instalação de modelo continue exclusivamente local e cancelável.
- [ ] Não deixar mensagens específicas do Ollama vazarem pela camada genérica.

## 12. Persistência local

- [ ] Confirmar permissões `0600` de seleção e consentimento.
- [ ] Testar arquivo ausente, JSON inválido, schema desconhecido e gravação interrompida.
- [ ] Garantir escrita atômica quando aplicável.
- [ ] Falha em `PUT /ai/selection` deve restaurar frontend ao estado persistido.
- [ ] Falha em consentimento não deve conceder acesso visualmente sem persistência real.

## 13. Execução `fast` / `complete`

- [ ] Verificar budgets nos dois providers.
- [ ] Testar limites de rounds/resultados acumulados e repetição sem progresso.
- [ ] Confirmar que `complete` usa síntese global somente onde suportado.
- [ ] Confirmar que `fast` nunca executa síntese global.
- [ ] Evitar budgets diferentes por provider sem decisão explícita/documentada.

## 14. Tool calling e workspace edit

- [ ] Todo provider deve passar pelo mesmo catálogo fechado de ferramentas.
- [ ] Ferramenta desconhecida deve falhar fechada.
- [ ] Argumentos inválidos devem ser rejeitados antes da execução local.
- [ ] `propose_workspace_edit` nunca escreve sem preview + aprovação.
- [ ] `expectedVersion` deve continuar controlado pelo servidor.
- [ ] Testar tool results grandes, truncamento e masking.

---

# P2 — evolução arquitetural, não bloqueia o fechamento atual

## 15. Terceiro provider cloud

Não adicionar apenas para provar abstração. Fazer quando houver necessidade real.

Candidatos futuros podem incluir Anthropic ou Gemini, mas a escolha deve vir com:

- autenticação oficial;
- function/tool calling;
- structured output quando necessário;
- política de retenção/privacidade revalidada;
- masking e consentimento já existentes reaproveitados.

## 16. `ProviderRegistry` dinâmico

Adiar até um terceiro provider tornar o `Record<AiProviderId, ...>` realmente oneroso.

Quando necessário:

- registro declarativo de provider;
- label/kind/capabilities;
- factory/configuração;
- sem espalhar enums de fornecedor pela aplicação.

## 17. Fallback automático

Continua fora do escopo por padrão. Só considerar se houver requisito concreto e política explícita de custo/privacidade. Local → Cloud automático continua proibido sem consentimento compatível.

## 18. Abstrações adicionais

`ContextBuilder`, `ToolExecutor`, cache semântico e outras extrações só entram quando houver reutilização, gargalo medido ou ganho claro de teste/manutenção.

---

# Sequência de execução recomendada

1. **Code Review multi-provider + snapshot provider/mode.**
2. **Resolver/remover endpoints genéricos presos ao Ollama.**
3. **Validação server-side de modelo + códigos de erro estáveis.**
4. **Hardening de segurança/cancelamento/concorrência.**
5. **UX compartilhada e testes E2E Local/OpenAI.**
6. **Auditoria final de docs, código órfão e CI.**

# Critério final de encerramento

A tarefa termina somente com todos os P0 concluídos, P1 revisados e classificados, documentação reconciliada e a suíte obrigatória verde no commit final. Itens P2 podem permanecer adiados desde que isso esteja explícito e não crie comportamento enganoso no produto.
