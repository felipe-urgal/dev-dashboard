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
- manter a API em `127.0.0.1` enquanto não existir provider cloud explícito;
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

## PR 4 — Modos de execução `fast` / `complete` — em conclusão

**Objetivo:** tornar profundidade de execução uma policy explícita, mensurável e testável.

### Policy inicial

| Campo | `fast` | `complete` |
|---|---:|---:|
| `maxToolRounds` | 4 | 10 |
| `maxToolResultChars` | 8.000 | 12.000 |
| `maxAccumulatedToolResultChars` | 32.000 | 96.000 |
| `maxIdenticalToolCalls` | 2 | 2 |
| `maxDiffChars` | 4.000 | 12.000 |
| `maxContextFiles` | 4 | 12 |
| `runGlobalSynthesis` | `false` | `true` |

Os valores são a primeira calibração e devem ser revistos depois de validação com projetos reais.

### Tarefas

- [x] Criar `AiExecutionMode` e `AiExecutionPolicy`.
- [x] Definir `maxToolRounds` por modo.
- [x] Definir `maxDiffChars` por modo.
- [x] Definir `maxContextFiles` para uso nas fases seguintes.
- [x] Definir `runGlobalSynthesis` para o PR 5.
- [x] Centralizar budgets em uma única policy.
- [x] Manter `fast` como default compatível.
- [x] Dar ao `complete` budget maior de rodadas, resultado de ferramentas e diff.
- [x] Implementar proteção contra chamadas idênticas repetidas sem progresso.
- [x] Implementar budget acumulado de resultados de ferramentas.
- [x] Fazer Code review usar `maxDiffChars` da policy.
- [x] Propagar o modo programaticamente para o Assistente/implementation.
- [x] Cobrir policies, round limit, loop guard e limite de diff com testes.
- [ ] Validar os valores com Ollama real antes de considerá-los definitivos.
- [ ] CI obrigatório verde no commit final.

### Critério de aceite

- [x] `fast` preserva 4 rounds e 4k de diff como comportamento padrão;
- [x] `complete` possui budget maior, mas limitado;
- [x] loop de tool call idêntica é interrompido;
- [x] contexto acumulado possui teto explícito;
- [x] nenhum detalhe específico de provider entra na policy comum;
- [x] nenhuma mudança visual foi introduzida;
- [ ] CI obrigatório verde.

Após merge, seguir para **PR 5 — síntese global da Code review**.

---

## PR 5 — Síntese global da Code review

**Objetivo:** detectar problemas entre arquivos sem reescrever o paralelismo existente.

### Tarefas

- [ ] Preservar review individual por arquivo e concorrência atual.
- [ ] Agregar summaries/findings para uma etapa final.
- [ ] Criar prompt de síntese global.
- [ ] Deduplicar findings sobre o mesmo problema.
- [ ] Detectar contratos quebrados entre arquivos.
- [ ] Detectar testes ausentes/impactados no conjunto da PR.
- [ ] Validar structured output da síntese global.
- [ ] Tratar saída inválida como falha/degradação explícita.
- [ ] `fast`: pular síntese global.
- [ ] `complete`: executar síntese global.
- [ ] Ajustar limite/chunking conforme policy.
- [ ] Cobrir PR com múltiplos arquivos em testes.

---

## PR 6 — Primeiro provider cloud

**Objetivo:** validar a abstração multi-provider com apenas um provider externo real.

### Decisão antes de implementar

- [ ] Revalidar documentação oficial vigente dos candidatos.
- [ ] Escolher **um** provider para a primeira integração.
- [ ] Registrar autenticação, quotas, política de dados e limitações reais.

### Tarefas

- [ ] Implementar adaptador e autenticação pelo caminho oficialmente suportado.
- [ ] Expor status/modelos/capacidades.
- [ ] Traduzir tool calling para o catálogo interno.
- [ ] Validar opções específicas dentro do adaptador.
- [ ] Preservar masking antes de cada envio externo.
- [ ] Criar consentimento por projeto antes do primeiro envio cloud.
- [ ] Persistir consentimento apenas em configuração local apropriada.
- [ ] Atualizar `docs/architecture/security.md` e documentação de rede.
- [ ] Adicionar testes do provider e da fronteira de segurança.

---

## PR 7 — Seleção de provider na UI

**Objetivo:** permitir escolha de execução sem transformar a tela em painel técnico.

### Tarefas

- [ ] Resolver provider ativo no backend.
- [ ] Expor apenas providers realmente disponíveis.
- [ ] Adicionar seletor `Executar com`.
- [ ] Adicionar seleção independente `Rápido` / `Completo`.
- [ ] Manter modelo/opções específicas em área avançada.
- [ ] Exibir claramente Local vs Cloud.
- [ ] Cobrir estados indisponível/não autenticado.

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

## Sequência resumida

| PR | Entrega | Estado |
|---|---|---|
| 1 | Documentação e roadmap | Concluído (#286) |
| 2 | Caracterização + segurança | Concluído (#287) |
| 3 | `AiProvider` + `OllamaProvider` | Concluído (#288) |
| 4 | `fast` / `complete` | Em conclusão |
| 5 | Síntese global da Code review | Próximo após PR 4 |
| 6 | Primeiro provider cloud | Pendente |
| 7 | Seleção de provider na UI | Pendente |
| 8 | Fallback `offer` | Pendente |
