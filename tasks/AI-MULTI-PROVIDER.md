# Plano de execução — IA multi-provider

Este arquivo transforma a arquitetura descrita em [`docs/architecture/ai-multi-provider.md`](../docs/architecture/ai-multi-provider.md) em uma sequência operacional de PRs pequenos e verificáveis.

A ordem pode ser ajustada conforme aprendizados de implementação, mas mudanças relevantes de direção devem atualizar tanto este arquivo quanto o documento de arquitetura.

## Regras para todas as fases

Antes de concluir qualquer PR desta iniciativa:

```bash
npm run lint
npm run format
npm run typecheck
npm run build
npm test
```

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

## PR 2 — Caracterização e segurança — em conclusão

**Objetivo:** congelar o comportamento observável atual e preparar uma fronteira segura para futuros providers externos.

### Fora do escopo

- provider novo;
- mudança visual;
- seleção de provider;
- fallback;
- modos `fast`/`complete`;
- síntese global da Code review.

### Caracterização

A revisão dos testes existentes confirmou cobertura prévia de status/listagem, chat simples, tool calling autorizado, preview de workspace edit, `review()` sem tools e compatibilidade de tool call textual do Ollama. Este PR acrescenta os gaps de limite/cancelamento.

- [x] Revisar os testes atuais de `AiAssistantService` e rotas de IA.
- [x] Confirmar cobertura de status/listagem de modelos Ollama.
- [x] Confirmar cobertura de chat sem ferramentas.
- [x] Confirmar cobertura de chat com tool calling válido.
- [x] Preservar teste de tool call textual convertido para ferramenta autorizada.
- [x] Cobrir limite atual de quatro rodadas de ferramentas.
- [x] Cobrir cancelamento/abort durante uma rodada em andamento.
- [x] Confirmar cobertura de `review()` sem ferramentas.
- [x] Confirmar cobertura do fluxo de implementation/preview.

### Segurança e masking

Pontos de saída mapeados:

1. `/api/chat`: mensagens do usuário/sistema e resultados de ferramentas acumulados na conversa;
2. `/api/generate`: `prompt`/`suffix` da compleção;
3. Code review: diff montado por `GitAiCodeReviewService` e enviado via `review()`.

A Code review já mascarava o diff antes de montar o prompt para manter metadados de redação. O PR adiciona uma segunda barreira compartilhada na fronteira de rede usada pela composição de produção, cobrindo chat, implementation, review e completion.

- [x] Mapear pontos que podem enviar conteúdo ao motor de IA.
- [x] Confirmar `maskSensitiveLogContent` no Code review atual.
- [x] Criar `createAiOutboundProtectionFetch` como fronteira compartilhada.
- [x] Mascarar conteúdo textual de mensagens de `/api/chat`.
- [x] Mascarar resultados de ferramentas antes da rodada seguinte.
- [x] Mascarar `prompt` e `suffix` de `/api/generate`.
- [x] Garantir que implementation use a mesma fronteira do chat.
- [x] Preservar masking e `redactionCount` da Code review.
- [x] Compor proteção com `createOllamaToolCallCompatFetch` sem quebrar tool calling textual.
- [x] Adicionar testes de não vazamento em chat, implementation, review e completion.
- [x] Manter prompts/respostas apenas em memória; nenhuma persistência nova foi adicionada.
- [x] Atualizar o guia do Assistente IA com o comportamento de masking e tool calling atual.

### Critério de aceite

- [x] nenhum provider cloud foi adicionado;
- [x] nenhuma UI foi alterada;
- [x] existe uma única barreira de proteção na composição de produção antes do fetch do motor;
- [x] os fluxos relevantes têm testes de caracterização/segurança;
- [ ] CI obrigatório verde.

Após CI verde e merge, seguir para **PR 3 — `AiProvider` + `OllamaProvider`**.

---

## PR 3 — `AiProvider` + `OllamaProvider`

**Objetivo:** desacoplar detalhes do Ollama do fluxo de negócio sem alterar UI ou comportamento observável.

### Tarefas

- [ ] Criar contrato mínimo `AiProvider`.
- [ ] Definir `ProviderStatus` e capacidades compartilhadas necessárias.
- [ ] Criar `OllamaProvider`.
- [ ] Mover HTTP específico do Ollama para `OllamaProvider`.
- [ ] Mover listagem/inspeção de modelos para `OllamaProvider`.
- [ ] Mover serialização/deserialização de tool calls para `OllamaProvider`.
- [ ] Mover compatibilidade de tool call textual para `OllamaProvider`.
- [ ] Mover `createAiOutboundProtectionFetch` para a fronteira adequada do provider sem perder cobertura.
- [ ] Manter catálogo de ferramentas fora do provider.
- [ ] Transformar o loop interativo atual no `AiOrchestrator` mínimo.
- [ ] Manter `GitAiCodeReviewService` separado do `AiOrchestrator`.
- [ ] Evitar `ProviderRegistry`, `ContextBuilder` e `ToolExecutor` independentes nesta fase.
- [ ] Fazer os testes de caracterização do PR 2 passarem sem mudança de expectativa.

### Critério de aceite

- nenhum HTTP específico do Ollama permanece no `AiOrchestrator`;
- o provider não conhece `ProjectFileService`, Git, LSP ou workspace edit;
- o orquestrador não conhece payloads nativos do Ollama;
- masking e compatibilidade de tool calling permanecem protegidos por testes;
- nenhuma mudança visual;
- comportamento atual permanece equivalente.

---

## PR 4 — Modos de execução `fast` / `complete`

**Objetivo:** tornar profundidade de execução uma policy explícita, mensurável e testável.

### Tarefas

- [ ] Criar `AiExecutionMode` e `AiExecutionPolicy`.
- [ ] Definir `maxToolRounds` por modo.
- [ ] Definir `maxDiffChars` por modo.
- [ ] Definir `maxContextFiles` quando aplicável.
- [ ] Definir `runGlobalSynthesis` por modo.
- [ ] Centralizar números em uma policy, sem `if` espalhados.
- [ ] Implementar proteção contra chamadas repetidas sem progresso.
- [ ] Considerar budget de contexto acumulado além de rounds.
- [ ] Cobrir policies com testes.
- [ ] Calibrar valores com projeto real antes de congelá-los.

### Critério de aceite

- `fast` e `complete` têm comportamento determinístico;
- modo Completo possui budget maior sem loop indefinido;
- nenhum detalhe específico de provider entra na policy comum.

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
| 2 | Caracterização + segurança | Em conclusão |
| 3 | `AiProvider` + `OllamaProvider` | Próximo |
| 4 | `fast` / `complete` | Pendente |
| 5 | Síntese global da Code review | Pendente |
| 6 | Primeiro provider cloud | Pendente |
| 7 | Seleção de provider na UI | Pendente |
| 8 | Fallback `offer` | Pendente |
