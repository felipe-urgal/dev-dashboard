# Plano de execução — IA multi-provider

Este arquivo transforma a arquitetura descrita em [`docs/architecture/ai-multi-provider.md`](../docs/architecture/ai-multi-provider.md) em uma sequência operacional de PRs pequenos e verificáveis.

A ordem pode ser ajustada conforme aprendizados de implementação, mas mudanças relevantes de direção devem atualizar tanto este arquivo quanto o documento de arquitetura.

## Regras para todas as fases

Antes de concluir qualquer PR desta iniciativa, executar o mesmo conjunto obrigatório do CI:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run docs:api:check
npm test
npm run test:e2e
```

Quando houver falha de formatação, executar `npm run format` e repetir `npm run format:check` antes de seguir.

Além disso:

- não misturar refatoração não relacionada;
- manter a API em `127.0.0.1`;
- preservar catálogo fechado de ferramentas;
- preservar preview + aprovação antes de escrita;
- não introduzir shell arbitrário;
- atualizar documentação correspondente quando comportamento mudar;
- atualizar `tasks/NEXT.md` quando uma fase terminar ou a prioridade mudar.

---

## PR 1 — Documentação e roadmap — concluído

**Objetivo:** registrar arquitetura, decisões consolidadas e ordem de implementação antes de alterar código.

### Entregue

- [x] Criar `docs/architecture/ai-multi-provider.md`.
- [x] Registrar responsabilidades de `AiProvider`, `AiOrchestrator` e `GitAiCodeReviewService`.
- [x] Registrar modos `fast`/`complete` como policies testáveis.
- [x] Registrar síntese global da Code review.
- [x] Registrar requisitos de masking e consentimento antes de cloud.
- [x] Registrar fallback inicial `offer`.
- [x] Registrar abstrações adiadas para evitar overengineering.
- [x] Criar este checklist de execução.
- [x] Atualizar `docs/index.md` com o novo documento.
- [x] Atualizar `tasks/NEXT.md` para apontar o PR seguinte.

PR de referência: **#286**.

---

## PR 2 — Caracterização e segurança — concluído

**Objetivo:** congelar o comportamento observável atual e preparar uma fronteira segura para futuros providers externos.

### Entregue

- [x] Revisar cobertura de status/listagem, chat, tool calling, review e implementation.
- [x] Cobrir limite atual de rodadas e cancelamento.
- [x] Mapear pontos que podem enviar conteúdo ao motor de IA.
- [x] Criar `createAiOutboundProtectionFetch` como barreira compartilhada.
- [x] Mascarar chat, resultados de ferramentas, completion e review.
- [x] Preservar `masked` e `redactionCount` da Code review.
- [x] Adicionar testes de não vazamento.
- [x] Atualizar guia do Assistente IA.
- [x] CI obrigatório verde.

PR de referência: **#287**.

---

## PR 3 — `AiProvider` + `OllamaProvider` — concluído

**Objetivo:** desacoplar detalhes do Ollama do fluxo de negócio sem alterar UI ou comportamento observável.

### Entregue

- [x] Criar contrato mínimo `AiProvider`.
- [x] Definir `AiProviderStatus` compartilhado.
- [x] Criar `OllamaProvider`.
- [x] Mover HTTP, status, modelos e payloads específicos do Ollama para o provider.
- [x] Mover serialização/deserialização de tool calls para o provider.
- [x] Mover compatibilidade de tool call textual para o provider.
- [x] Manter `createAiOutboundProtectionFetch` na fronteira do provider.
- [x] Manter catálogo de ferramentas fora do provider.
- [x] Criar `AiOrchestrator` mínimo para loop e ferramentas.
- [x] Manter `GitAiCodeReviewService` separado do orquestrador.
- [x] Evitar `ProviderRegistry`, `ContextBuilder` e `ToolExecutor` prematuros.
- [x] Preservar testes de caracterização sem mudar expectativa.
- [x] CI obrigatório verde.

PR de referência: **#288**.

---

## PR 4 — Modos de execução `fast` / `complete` — concluído

**Objetivo:** tornar profundidade de execução uma policy explícita, mensurável e testável.

### Policy atual

| Campo | `fast` | `complete` |
|---|---:|---:|
| `maxToolRounds` | 4 | 10 |
| `maxToolResultChars` | 8.000 | 12.000 |
| `maxAccumulatedToolResultChars` | 32.000 | 96.000 |
| `maxIdenticalToolCalls` | 4 | 2 |
| `maxDiffChars` | 4.000 | 12.000 |
| `maxContextFiles` | 4 | 12 |
| `maxGlobalSynthesisChars` | 0 | 48.000 |
| `runGlobalSynthesis` | `false` | `true` |

Os valores seguem como calibração inicial e podem ser revisados após validação com projetos reais.

### Entregue

- [x] Criar `AiExecutionMode` e `AiExecutionPolicy`.
- [x] Centralizar budgets em uma única policy.
- [x] Manter `fast` como default compatível.
- [x] Dar ao `complete` budget maior, mas limitado.
- [x] Implementar proteção contra chamadas idênticas repetidas sem progresso.
- [x] Implementar budget acumulado de resultados de ferramentas.
- [x] Fazer Code review usar `maxDiffChars` da policy.
- [x] Propagar o modo programaticamente para Assistente/implementation.
- [x] Cobrir policies, round limit, loop guard e limite de diff com testes.
- [x] CI obrigatório verde.

PR de referência: **#289**.

---

## PR 5 — Síntese global da Code review — absorvido pelo #289

**Objetivo:** detectar problemas entre arquivos sem reescrever o paralelismo existente.

A implementação foi concluída dentro do PR #289 porque a policy de `complete` e a etapa global evoluíram juntas sem exigir uma fronteira útil de PR separada.

### Entregue

- [x] Preservar review individual por arquivo e concorrência atual.
- [x] Agregar summaries/findings para uma etapa final.
- [x] Criar prompt de síntese global sem ferramentas.
- [x] Deduplicar findings equivalentes.
- [x] Procurar contratos quebrados entre arquivos e testes impactados.
- [x] Validar structured output da síntese global.
- [x] Tratar saída inválida como falha explícita preservando revisão local.
- [x] `fast`: pular síntese global.
- [x] `complete`: executar síntese global.
- [x] Respeitar budget de contexto da policy.
- [x] Cobrir PR multi-arquivo, falha e cancelamento em testes.

---

## PR 6 — Primeiro provider cloud — concluído

**Objetivo:** validar a abstração multi-provider com apenas um provider externo real.

### Decisão

O primeiro provider cloud é **OpenAI API**, autenticado por API key e isolado atrás do contrato `AiProvider`.

### Entregue

- [x] Revalidar caminho oficial de autenticação e API.
- [x] Implementar `OpenAiProvider`.
- [x] Expor status/modelos/capacidades do adapter.
- [x] Traduzir function calling para o catálogo interno.
- [x] Manter IDs nativos de tool calls encapsulados no adapter.
- [x] Preservar masking antes de requests cloud.
- [x] Enviar `store: false` nas requests de inferência.
- [x] Manter OpenAI desligada do fluxo de produto até existir consentimento por projeto.
- [x] Registrar fronteira e limitações em `docs/architecture/openai-provider.md`.
- [x] Adicionar testes do provider e da fronteira de segurança.
- [x] CI obrigatório verde.

PR de referência: **#290**.

---

## PR 7 — Seleção de provider + consentimento — em andamento

**Objetivo:** permitir escolha de execução sem transformar a tela em painel técnico e sem envio cloud sem autorização explícita.

### Tarefas

- [x] Criar resolver central de provider no backend.
- [x] Manter `Ollama + fast` como default.
- [x] Persistir provider e modo por projeto em configuração local.
- [x] Persistir consentimento OpenAI separadamente por projeto.
- [x] Revalidar consentimento e disponibilidade antes de uma nova execução cloud.
- [x] Expor status dos providers, modelos, seleção e consentimento para a UI.
- [x] Adicionar seletor `Executar com` com indicação Local/Cloud.
- [x] Adicionar seleção independente `Rápido` / `Completo`.
- [x] Manter modelo em `Opções avançadas`.
- [x] Permitir conceder e revogar consentimento cloud por projeto.
- [x] Cobrir default, indisponibilidade, consentimento, persistência e revogação com testes do resolver.
- [ ] CI obrigatório verde no commit final.

### Escopo deliberadamente limitado

Neste PR, a seleção é aplicada primeiro ao **Assistente IA / implementation**. A Code review mantém o fluxo atual; isso evita misturar a mudança de UI/resolução com uma segunda migração de orquestração batch no mesmo PR.

---

## PR 8 — Fallback `offer`

**Objetivo:** recuperar falhas sem trocar Local → Cloud silenciosamente.

### Tarefas

- [ ] Implementar `off` e `offer`.
- [ ] Não implementar `automatic` nesta fase.
- [ ] Classificar falhas elegíveis para continuação.
- [ ] Preservar somente contexto seguro ao trocar provider.
- [ ] Exigir ação explícita antes de Local → Cloud.
- [ ] Respeitar consentimento do projeto.
- [ ] Exibir provider que falhou e provider oferecido.
- [ ] Cobrir troca e cancelamento em testes.

---

## Itens deliberadamente adiados

- [ ] `ProviderRegistry` dinâmico antes de existir necessidade real.
- [ ] `ContextBuilder` como serviço próprio sem caso concreto de reutilização.
- [ ] `ToolExecutor` como serviço próprio sem benefício de teste/manutenção.
- [ ] cache de símbolos/contexto antes de medir gargalo.
- [ ] fallback automático.
- [ ] múltiplos providers cloud na primeira validação.
- [ ] parâmetros específicos de fornecedor no contrato global.
- [ ] seleção multi-provider na Code review até a UI/resolução do Assistente estabilizar.

## Sequência resumida

| PR | Entrega | Estado |
|---|---|---|
| 1 | Documentação e roadmap | Concluído (#286) |
| 2 | Caracterização + segurança | Concluído (#287) |
| 3 | `AiProvider` + `OllamaProvider` | Concluído (#288) |
| 4 | `fast` / `complete` | Concluído (#289) |
| 5 | Síntese global da Code review | Absorvido pelo #289 |
| 6 | Primeiro provider cloud | Concluído (#290) |
| 7 | Seleção + consentimento | Em andamento |
| 8 | Fallback `offer` | Pendente |
