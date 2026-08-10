# Fechamento — IA multi-provider

Este documento é o checklist de fechamento da arquitetura multi-provider do Dev Dashboard após os PRs #286–#293.

O objetivo é sair de “roadmap implementado” para **fluxos de IA consistentes, previsíveis, testados e sem caminhos genéricos presos silenciosamente ao Ollama**.

O trabalho de fechamento está sendo consolidado no **PR #295**.

## Definição de pronto

A iniciativa só deve ser considerada 100% concluída quando:

- todo fluxo genérico de IA resolver provider e modo explicitamente;
- nenhum endpoint com nome genérico usar Ollama por acidente;
- Assistente/implementation e Code Review obedecerem à mesma seleção por projeto;
- consentimento cloud for revalidado antes de qualquer envio de conteúdo do projeto;
- provider, modo e modelo usados em cada execução forem rastreáveis;
- modelos incompatíveis com o provider forem recusados antes da inferência;
- falhas de provider, autenticação, consentimento, modelo, rede e parsing tiverem comportamento e mensagem previsíveis;
- cancelamento não deixar execution, polling ou request órfão;
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

Quando houver alteração de schema/rota:

```bash
npm run docs:api
npm run docs:api:check
```

Se `format:check` falhar, executar `npm run format` e repetir a validação.

---

# P0 — bloqueadores para considerar multi-provider concluído

## 1. Code Review IA usar o resolver multi-provider — concluído

### Entregue

- [x] Resolver provider selecionado pelo projeto antes de iniciar Code Review.
- [x] Revalidar disponibilidade e consentimento cloud antes de cada nova revisão.
- [x] Fazer revisão por arquivo e síntese global usarem o mesmo provider congelado no início da execution.
- [x] Registrar `provider` e `mode` no snapshot de `GitPullRequestAiReviewExecution`.
- [x] Não reler seleção durante uma execução em andamento.
- [x] Remover o endpoint one-shot `/git/pull-request/ai-review` após confirmar ausência de consumidor.
- [x] Expor provider/modo no schema HTTP e contratos compartilhados.
- [x] Exibir na UI qual provider e modo estão sendo usados na Code Review.
- [x] Cobrir OpenAI autorizado, falta de consentimento, provider indisponível e troca de seleção durante execução.

### Critério de aceite

Uma Code Review iniciada com OpenAI selecionada usa OpenAI; uma iniciada com Ollama usa Ollama; mudar a seleção depois do start não muda a execution corrente.

### Evidência

O CI completo ficou verde após o fechamento deste bloco no PR #295.

## 2. Eliminar endpoints genéricos presos silenciosamente ao Ollama — concluído

### Entregue

- [x] Inventariar consumidores reais de `/ai/status`, `/ai/chat`, `/ai/complete` e `/ai/models/pull`.
- [x] Rotear `status/chat/complete` pelo resolver.
- [x] Remover acesso direto ao `AiAssistantService` local das opções da rota genérica.
- [x] Tornar instalação de modelo capability-based; provider cloud não cai silenciosamente no Ollama.
- [x] Garantir que documentação e nomes de comportamento deixem claro quando uma operação depende da capability do provider.
- [x] Adicionar regressivos impedindo bypass do resolver.

### Critério de aceite

Selecionar OpenAI faz as rotas genéricas usarem OpenAI. `models/pull` em provider sem instalação retorna falha explícita e nunca usa Ollama como fallback oculto.

### Evidência

O CI completo ficou verde após o fechamento deste bloco no PR #295.

## 3. Validação de modelo no backend — concluído

### Entregue

- [x] Validar que o modelo solicitado pertence ao provider resolvido/está disponível antes da inferência.
- [x] Diferenciar provider indisponível de modelo indisponível/incompatível no domínio do resolver.
- [x] Não depender de erro do fornecedor para descobrir modelo inválido.
- [x] Preservar escolha de modelo por execution, sem persistir modelo globalmente.
- [x] Testar modelo Ollama enviado para OpenAI.
- [x] Testar modelo OpenAI enviado para Ollama.
- [x] Fazer Code Review validar provider/modelo antes de ler lista/diff.
- [x] Aplicar a mesma validação em chat, completion e implementation.

### Critério de aceite

Um modelo incompatível falha antes da inferência e antes de leitura de conteúdo desnecessária do projeto.

### Evidência

CI #1601 verde no head que fechou o P0 #3.

## 4. Contratos de erro estáveis — atividade atual

### Entregar

- [ ] Definir códigos específicos para consentimento, provider indisponível, modelo inválido, autenticação cloud, quota/billing, rate limit, timeout/cancelamento e resposta inválida.
- [ ] Evitar converter todos os problemas de provider em `AI_ASSISTANT_INVALID_REQUEST` ou `AI_ASSISTANT_FAILED` genérico.
- [ ] Garantir mensagens provider-neutral na fachada/orquestração quando o detalhe do fornecedor não for necessário.
- [ ] Manter detalhes específicos dentro do adapter quando apropriado.
- [ ] Não vazar credenciais, prompt, diff ou resultados sensíveis em logs de erro.
- [ ] Cobrir o mapeamento com regressivos.
- [ ] Atualizar referência HTTP/documentação quando os códigos públicos mudarem.

## 5. Segurança de saída cloud

### Entregar

- [ ] Testar masking de chat, implementation, Code Review por arquivo, síntese global e completion com OpenAI selecionada.
- [ ] Testar masking também de resultados de ferramentas reapresentados ao modelo.
- [ ] Confirmar que headers/credenciais nunca entram no conteúdo mascarado/logado.
- [ ] Garantir que consentimento seja verificado antes do primeiro request que contenha conteúdo do projeto.
- [ ] Testar revogação de consentimento entre duas executions.
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
- [x] Code Review reflete a seleção persistida do projeto em vez de usar status Ollama legado.
- [x] Mostrar provider e modo usados pela execution de Code Review.
- [ ] Mostrar `Local`/`Cloud`, provider, modo e modelo sem transformar a tela em painel técnico.
- [ ] Provider indisponível deve aparecer desabilitado com motivo.
- [ ] OpenAI sem consentimento deve mostrar ação explícita de autorização.
- [ ] Revogação deve refletir imediatamente na próxima execution.

## 8. Fallback consistente

- [x] Manter `off/offer` sem fallback automático.
- [ ] Garantir que fallback use provider registrado na execution em todos os fluxos suportados.
- [ ] Não oferecer troca para erro de ferramenta, modelo ou parsing se o provider continua disponível.
- [ ] Não transportar histórico, tool results, diff ou eventos da execution anterior.
- [x] Nunca iniciar Local → Cloud automaticamente.
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
- [x] Manter `store: false` nas requests de inferência.
- [x] Confirmar que IDs nativos de tool calls continuam encapsulados no adapter.
- [x] Documentar claramente limitações atuais do adapter.
- [x] Normalizar falta de créditos/quota para mensagem amigável.
- [x] Refletir temporariamente falta de créditos como provider indisponível no status.

## 11. Provider Ollama

- [x] Preservar validação de loopback para URL configurável.
- [ ] Testar Ollama offline, sem modelos, modelo removido durante uso e resposta NDJSON incompleta.
- [x] Manter compatibilidade de tool call textual isolada no adapter.
- [ ] Garantir que instalação de modelo continue exclusivamente local e cancelável.
- [ ] Não deixar mensagens específicas do Ollama vazarem pela camada genérica quando a mensagem não for necessária para diagnóstico.

## 12. Persistência local

- [ ] Confirmar permissões `0600` de seleção e consentimento.
- [ ] Testar arquivo ausente, JSON inválido, schema desconhecido e gravação interrompida.
- [ ] Garantir escrita atômica quando aplicável.
- [x] Falha em `PUT /ai/selection` deve restaurar frontend ao estado persistido.
- [ ] Falha em consentimento não deve conceder acesso visualmente sem persistência real.

## 13. Execução `fast` / `complete`

- [ ] Verificar budgets nos dois providers.
- [ ] Testar limites de rounds/resultados acumulados e repetição sem progresso.
- [x] Confirmar que `complete` usa síntese global na Code Review.
- [x] Confirmar que `fast` não executa síntese global.
- [ ] Evitar budgets diferentes por provider sem decisão explícita/documentada.

## 14. Tool calling e workspace edit

- [x] Todo provider passa pelo mesmo catálogo fechado de ferramentas no Assistente.
- [ ] Ferramenta desconhecida deve falhar fechada em todos os cenários.
- [ ] Argumentos inválidos devem ser rejeitados antes da execução local.
- [x] `propose_workspace_edit` nunca escreve sem preview + aprovação.
- [x] `expectedVersion` continua controlado pelo servidor.
- [ ] Testar tool results grandes, truncamento e masking.
- [x] Bloquear proposta de workspace edit antes de uma inspeção bem-sucedida do projeto.

---

# P2 — evolução arquitetural, não bloqueia o fechamento atual

## 15. Terceiro provider cloud

Não adicionar apenas para provar abstração. Fazer quando houver necessidade real.

Um futuro provider deve reutilizar:

- autenticação oficial;
- tool calling normalizado;
- consentimento cloud;
- masking compartilhado;
- validação de modelo;
- contratos de erro estáveis.

## 16. `ProviderRegistry` dinâmico

Adiar até um terceiro provider tornar o `Record<AiProviderId, ...>` realmente oneroso.

## 17. Fallback automático

Continua fora do escopo. Local → Cloud automático permanece proibido sem uma política explícita de custo/privacidade e consentimento compatível.

## 18. Abstrações adicionais

`ContextBuilder`, `ToolExecutor`, cache semântico e outras extrações só entram quando houver reutilização, gargalo medido ou ganho claro de teste/manutenção.

---

# Sequência de execução atual

1. ~~Code Review multi-provider + snapshot provider/mode.~~
2. ~~Resolver endpoints genéricos presos ao Ollama.~~
3. ~~Validação server-side de modelo.~~
4. **Contratos de erro estáveis.**
5. **Hardening de segurança cloud.**
6. **Cancelamento e concorrência.**
7. **Auditoria final de persistência, UX, docs, código órfão e CI.**

# Critério final de encerramento

A tarefa termina somente com todos os P0 concluídos, P1 revisados e classificados, documentação reconciliada e a suíte obrigatória verde no commit final. Itens P2 podem permanecer adiados desde que isso esteja explícito e não crie comportamento enganoso no produto.
