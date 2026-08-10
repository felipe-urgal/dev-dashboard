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
- manter a API local em `127.0.0.1`;
- preservar catálogo fechado de ferramentas;
- preservar preview + aprovação antes de escrita;
- não introduzir shell arbitrário;
- atualizar documentação correspondente quando comportamento mudar;
- atualizar `tasks/PENDENCIAS.md` e `tasks/NEXT.md` quando uma fase terminar ou a prioridade mudar.

---

## PR 1 — Documentação e roadmap

**Objetivo:** registrar a arquitetura, as decisões consolidadas e a ordem de implementação antes de alterar código.

### Tarefas

- [x] Criar `docs/architecture/ai-multi-provider.md`.
- [x] Registrar responsabilidades de `AiProvider`, `AiOrchestrator` e `GitAiCodeReviewService`.
- [x] Registrar modos `fast`/`complete` como policies testáveis.
- [x] Registrar síntese global da Code review.
- [x] Registrar requisitos de masking e consentimento antes de cloud.
- [x] Registrar fallback inicial `offer`.
- [x] Registrar abstrações adiadas para evitar overengineering.
- [x] Criar este checklist de execução.
- [ ] Atualizar `docs/index.md` com o novo documento.
- [ ] Atualizar `tasks/PENDENCIAS.md` com referência à iniciativa.
- [ ] Atualizar `tasks/NEXT.md` para apontar a Fase 1 de implementação.

### Critério de aceite

- não há mudança de comportamento do produto;
- o plano consegue responder o que será feito, em qual ordem e com quais limites;
- a próxima atividade após o merge está explícita em `tasks/NEXT.md`;
- a documentação diferencia claramente arquitetura alvo de escopo da primeira implementação.

---

## PR 2 — Caracterização e segurança

**Objetivo:** congelar o comportamento observável atual e preparar uma fronteira segura para futuros providers externos.

### Fora do escopo

- provider novo;
- mudança visual;
- seleção de provider;
- fallback;
- mudança intencional no comportamento atual do Ollama.

### Tarefas — caracterização

- [ ] Revisar os testes atuais de `AiAssistantService` e rotas de IA.
- [ ] Adicionar teste de caracterização do status/listagem de modelos Ollama.
- [ ] Adicionar teste de caracterização do chat sem ferramentas.
- [ ] Adicionar teste de caracterização do chat com tool calling válido.
- [ ] Preservar teste de tool call vazado como JSON textual.
- [ ] Cobrir limite atual de rodadas de ferramentas.
- [ ] Cobrir cancelamento/abort do chat.
- [ ] Cobrir `review()` sem ferramentas.
- [ ] Cobrir fluxo de implementation/preview já existente que dependa do serviço de IA.

### Tarefas — masking

- [ ] Mapear todos os pontos que podem enviar conteúdo de projeto ao motor de IA.
- [ ] Confirmar o comportamento atual de `maskSensitiveLogContent` no Code review.
- [ ] Definir uma fronteira compartilhada de sanitização antes de provider externo.
- [ ] Garantir masking no conteúdo de arquivos enviado pelo Assistente.
- [ ] Garantir masking nos resultados de ferramentas que possam conter segredo.
- [ ] Garantir masking no fluxo de implementation.
- [ ] Preservar masking no Code review.
- [ ] Adicionar testes que provem que chat, implementation e review não contornam a proteção.
- [ ] Garantir que nenhum prompt/diff sensível novo seja persistido em logs.

### Critério de aceite

- comportamento observável do Ollama atual está coberto por testes;
- nenhuma nova integração cloud foi adicionada;
- existe um caminho claro e testado para sanitizar conteúdo antes de saída externa;
- testes deixam explícito o que a extração do provider não pode quebrar.

---

## PR 3 — `AiProvider` + `OllamaProvider`

**Objetivo:** desacoplar detalhes do Ollama do fluxo de negócio sem alterar a UI ou o comportamento observável.

### Tarefas

- [ ] Criar contrato mínimo `AiProvider`.
- [ ] Definir `ProviderStatus` e capacidades compartilhadas necessárias.
- [ ] Criar `OllamaProvider`.
- [ ] Mover HTTP específico do Ollama para `OllamaProvider`.
- [ ] Mover listagem/inspeção de modelos para `OllamaProvider`.
- [ ] Mover serialização/deserialização de tool calls para `OllamaProvider`.
- [ ] Mover detecção de tool call vazado como JSON textual para `OllamaProvider`.
- [ ] Manter catálogo de ferramentas fora do provider.
- [ ] Transformar o loop interativo atual no `AiOrchestrator` mínimo.
- [ ] Manter `GitAiCodeReviewService` separado do `AiOrchestrator`.
- [ ] Evitar criar `ProviderRegistry`, `ContextBuilder` e `ToolExecutor` independentes nesta fase.
- [ ] Fazer os testes de caracterização passarem sem mudança de expectativa.

### Critério de aceite

- nenhum HTTP específico do Ollama permanece no `AiOrchestrator`;
- o provider não conhece `ProjectFileService`, Git, LSP ou workspace edit;
- o orquestrador não conhece payloads nativos do Ollama;
- leaked tool call continua tratado de forma explícita;
- nenhuma mudança visual;
- comportamento atual permanece equivalente.

---

## PR 4 — Modos de execução `fast` / `complete`

**Objetivo:** tornar profundidade de execução uma policy explícita, mensurável e testável.

### Tarefas

- [ ] Criar tipo `AiExecutionMode`.
- [ ] Criar `AiExecutionPolicy`.
- [ ] Definir `maxToolRounds` por modo.
- [ ] Definir `maxDiffChars` por modo.
- [ ] Definir `maxContextFiles` por modo quando aplicável.
- [ ] Definir `runGlobalSynthesis` por modo.
- [ ] Evitar números espalhados em `if` locais.
- [ ] Implementar proteção contra chamadas repetidas sem progresso.
- [ ] Considerar budget de contexto acumulado além de número de rounds.
- [ ] Cobrir as policies com testes unitários.
- [ ] Validar manualmente os limites com projeto real antes de congelar valores definitivos.

### Critério de aceite

- `fast` e `complete` têm comportamento determinístico;
- mudanças de limite podem ser feitas alterando policy centralizada;
- modo Completo possui budget maior sem permitir loop indefinido;
- nenhum comportamento específico de provider entra na policy comum.

---

## PR 5 — Síntese global da Code review

**Objetivo:** detectar problemas entre arquivos sem reescrever o paralelismo por arquivo já existente.

### Tarefas

- [ ] Preservar review individual por arquivo.
- [ ] Preservar concorrência atual.
- [ ] Agregar summaries/findings locais para uma etapa final.
- [ ] Criar prompt de síntese global.
- [ ] Deduplicar findings sobre o mesmo problema.
- [ ] Permitir detectar contratos quebrados entre arquivos.
- [ ] Permitir detectar testes ausentes/impactados no conjunto da PR.
- [ ] Validar structured output da síntese global.
- [ ] Tratar resposta inválida da síntese como falha/degradação explícita.
- [ ] `fast`: pular síntese global.
- [ ] `complete`: executar síntese global.
- [ ] Ajustar limite/chunking de diff conforme policy.
- [ ] Cobrir PR com múltiplos arquivos em testes.

### Critério de aceite

- review rápido continua disponível sem chamada global;
- review completo produz uma visão consolidada da PR;
- findings duplicados não aparecem multiplicados sem necessidade;
- falha da síntese não aparece como sucesso silencioso;
- nenhuma reescrita desnecessária do pipeline por arquivo.

---

## PR 6 — Primeiro provider cloud

**Objetivo:** validar a abstração multi-provider com apenas um provider externo real.

### Decisão antes de implementar

- [ ] Revalidar documentação oficial vigente de Codex/OpenAI, Gemini e demais candidatos.
- [ ] Escolher **um** provider para a primeira integração.
- [ ] Registrar autenticação, quotas, política de dados e limitações reais desse provider.

### Tarefas

- [ ] Implementar adaptador do provider escolhido.
- [ ] Implementar autenticação pelo caminho oficialmente suportado.
- [ ] Expor status de autenticado/indisponível.
- [ ] Expor modelos/capacidades necessárias.
- [ ] Traduzir tool calling para o catálogo interno existente.
- [ ] Validar opções específicas apenas dentro do adaptador.
- [ ] Garantir masking antes de cada envio externo.
- [ ] Criar consentimento por projeto antes do primeiro envio cloud.
- [ ] Persistir consentimento somente em configuração local apropriada.
- [ ] Permitir revisar/reconfirmar a decisão ao trocar de provider.
- [ ] Atualizar `docs/architecture/security.md`.
- [ ] Atualizar documentação que descreve a API como exclusivamente local sem chamadas externas.
- [ ] Adicionar testes do provider e da fronteira de segurança.

### Critério de aceite

- segundo provider funciona sem alterar serviços de Git/LSP/workspace edit;
- provider não recebe acesso direto ao filesystem;
- código não sai da máquina antes de consentimento;
- conteúdo sensível passa por masking;
- indisponibilidade/autenticação falha aparece de forma clara;
- documentação de segurança reflete o novo comportamento.

---

## PR 7 — Seleção de provider na UI

**Objetivo:** permitir que o usuário escolha como executar sem transformar a tela em um painel técnico.

### Tarefas

- [ ] Criar resolução de provider ativo no backend.
- [ ] Expor providers realmente disponíveis.
- [ ] Não mostrar provider configurado como disponível quando autenticação/status falhar.
- [ ] Adicionar seletor simples `Executar com`.
- [ ] Adicionar seleção independente de modo `Rápido` / `Completo`.
- [ ] Manter modelo/opções específicas em área avançada quando necessário.
- [ ] Preservar provider escolhido por contexto apropriado sem criar comportamento surpreendente.
- [ ] Exibir claramente Local vs Cloud.
- [ ] Cobrir estados indisponível/não autenticado.

### Critério de aceite

- provider e modo podem ser escolhidos independentemente;
- fluxo padrão continua simples;
- detalhes específicos não poluem a experiência principal;
- a UI nunca sugere que provider indisponível está pronto para uso.

---

## PR 8 — Fallback `offer`

**Objetivo:** permitir recuperação de falha sem trocar Local → Cloud silenciosamente.

### Tarefas

- [ ] Implementar política `off`.
- [ ] Implementar política `offer`.
- [ ] Não implementar `automatic` nesta fase.
- [ ] Classificar falhas elegíveis para oferta de continuação.
- [ ] Preservar somente contexto seguro e necessário ao trocar de provider.
- [ ] Solicitar ação explícita do usuário antes de Local → Cloud.
- [ ] Respeitar consentimento do projeto.
- [ ] Exibir qual provider falhou e qual será usado na continuação.
- [ ] Cobrir troca e cancelamento em testes.

### Critério de aceite

- nenhuma troca de provider ocorre escondida;
- o usuário entende o motivo da oferta;
- Local → Cloud exige ação explícita;
- contexto reaproveitado não contorna masking/consentimento.

---

## Itens deliberadamente adiados

Não implementar apenas para “completar” a arquitetura:

- [ ] `ProviderRegistry` dinâmico antes de existir necessidade real.
- [ ] `ContextBuilder` como serviço próprio sem caso concreto de reutilização.
- [ ] `ToolExecutor` como serviço próprio sem benefício de teste/manutenção.
- [ ] cache de símbolos/contexto antes de medir gargalo.
- [ ] fallback automático.
- [ ] múltiplos providers cloud ao mesmo tempo na primeira validação.
- [ ] parâmetros específicos de fornecedor no contrato global.

Esses itens podem ser promovidos para uma fase própria quando houver evidência de que resolvem um problema real.

## Sequência resumida

| PR | Entrega | Mudança de comportamento? |
|---|---|---|
| 1 | Documentação e roadmap | Não |
| 2 | Caracterização + segurança | Não intencional |
| 3 | `AiProvider` + `OllamaProvider` | Não intencional |
| 4 | `fast` / `complete` | Sim, controlada |
| 5 | Síntese global da Code review | Sim |
| 6 | Primeiro provider cloud | Sim |
| 7 | Seleção de provider na UI | Sim |
| 8 | Fallback `offer` | Sim |

## Próxima ação após este documento

Após o merge do PR documental, iniciar **PR 2 — Caracterização e segurança**.

Não criar provider novo nem alterar a UI nesse próximo PR. O objetivo é primeiro proteger e caracterizar o comportamento existente para que a extração do Ollama possa ser feita com segurança no PR seguinte.
