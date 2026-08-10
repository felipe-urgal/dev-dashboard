# Plano de execução — IA multi-provider

Este arquivo registra o roadmap histórico que criou a arquitetura multi-provider descrita em [`docs/architecture/ai-multi-provider.md`](../docs/architecture/ai-multi-provider.md).

O checklist atual de fechamento está em [`AI-MULTI-PROVIDER-FINALIZATION.md`](AI-MULTI-PROVIDER-FINALIZATION.md).

## Regras da iniciativa

Antes de concluir qualquer etapa:

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

Regras permanentes:

- não misturar refatoração não relacionada;
- manter a API em `127.0.0.1`;
- preservar catálogo fechado de ferramentas;
- preservar preview + aprovação antes de escrita;
- não introduzir shell arbitrário no fluxo de IA;
- atualizar documentação quando o comportamento mudar;
- atualizar `tasks/NEXT.md` quando a prioridade mudar.

---

## PR #286 — documentação e roadmap — concluído

Entregou:

- arquitetura multi-provider documentada;
- responsabilidades de provider/orquestrador/Code Review;
- modos `fast`/`complete`;
- requisitos de masking e consentimento;
- fallback inicial `offer`;
- abstrações adiadas para evitar overengineering.

## PR #287 — caracterização e segurança — concluído

Entregou:

- cobertura dos fluxos existentes;
- barreira compartilhada `createAiOutboundProtectionFetch`;
- masking de chat, ferramentas, completion e review;
- regressivos de não vazamento.

## PR #288 — `AiProvider` + `OllamaProvider` — concluído

Entregou:

- contrato `AiProvider`;
- `OllamaProvider` isolando HTTP/status/modelos/tool calling;
- `AiOrchestrator` para o loop de ferramentas;
- Code Review mantida como orquestração batch separada;
- sem `ProviderRegistry`, `ContextBuilder` ou `ToolExecutor` prematuros.

## PR #289 — modos `fast` / `complete` + síntese global — concluído

Policy atual:

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

Também entregou a síntese global da Code Review no modo completo.

## PR #290 — primeiro provider cloud — concluído

Entregou:

- `OpenAiProvider`;
- autenticação por API key;
- descoberta de modelos compatíveis;
- function calling normalizado;
- `store: false` em inferência;
- masking antes de requests cloud;
- documentação específica do adapter.

## PR #291 — seleção de provider + consentimento — concluído

Entregou:

- `AiProviderResolver`;
- `Ollama + fast` como default;
- provider/modo persistidos por projeto;
- consentimento OpenAI persistido separadamente;
- seleção Local/OpenAI e Rápido/Completo na UI;
- revalidação de consentimento antes de nova execução cloud.

Nesta etapa a seleção foi aplicada primeiro ao Assistente/implementation. A Code Review foi migrada depois no fechamento pós-roadmap.

## PR #292 — fallback `offer` — concluído

Entregou:

- `off` e `offer`;
- nenhuma troca automática de provider;
- Local → Cloud somente com ação explícita e consentimento;
- nova execution sem transportar histórico/tool results/eventos anteriores.

## PR #293 — hardening de rastreabilidade — concluído

Entregou:

- provider/modo registrados no snapshot de implementation;
- provider/modo congelados antes da resolução assíncrona;
- fallback baseado no provider realmente usado pela execution;
- rollback visual quando persistência de seleção falha;
- mensagens genéricas sem acoplamento desnecessário ao Ollama.

---

# PR #295 — fechamento pós-roadmap — em andamento

A auditoria após #293 encontrou gaps que impediam considerar a arquitetura 100% multi-provider.

## Concluído no #295

### Code Review multi-provider

- [x] Code Review usa `AiProviderResolver`.
- [x] provider/modo ficam congelados durante toda a execution.
- [x] revisão por arquivo e síntese global usam a mesma instância do provider.
- [x] `provider` e `mode` fazem parte do snapshot/contrato HTTP.
- [x] UI mostra provider/modo usados.
- [x] endpoint one-shot sem consumidor foi removido.

### APIs genéricas

- [x] `/ai/status` reflete o provider selecionado.
- [x] `/ai/chat` resolve provider/modo antes do stream.
- [x] `/ai/complete` resolve o provider selecionado.
- [x] rota genérica não recebe mais diretamente o serviço local/Ollama.
- [x] `/ai/models/pull` respeita a capability do provider e não faz fallback oculto.

### Validação de modelo

- [x] modelo é validado no backend antes da inferência.
- [x] modelo Ollama não pode ser usado com OpenAI.
- [x] modelo OpenAI não pode ser usado com Ollama.
- [x] Code Review valida provider/modelo antes de ler diff.

### Contratos de erro estáveis

- [x] `AiErrorCode` compartilhado entre contracts, adapters, resolver, HTTP, SSE e executions.
- [x] consentimento, provider, modelo, auth, quota, rate limit, timeout, cancelamento, resposta inválida e falha upstream possuem códigos próprios.
- [x] OpenAI e Ollama classificam falhas sem obrigar consumidores a interpretar mensagens.
- [x] implementation e Code Review registram `errorCode` quando aplicável.
- [x] referência HTTP documenta os status específicos das rotas de IA.
- [x] regressivos cobrem taxonomia e mapeamento HTTP.
- [x] CI #1640 ficou completamente verde após o P0 #4.

### UX e robustez já incorporados

- [x] falta de créditos/quota OpenAI vira mensagem amigável;
- [x] provider OpenAI fica temporariamente indisponível após falha conhecida de billing/quota;
- [x] Assistente de implementação exige investigação real do projeto antes de concluir alteração concreta;
- [x] `propose_workspace_edit` é recusado antes de inspeção bem-sucedida.

## Em andamento no #295

- [ ] hardening final de segurança cloud;
- [ ] cancelamento e concorrência;
- [ ] auditoria final de persistência/UX/docs/código órfão;
- [ ] CI obrigatório verde no commit final.

---

## Itens deliberadamente adiados

- `ProviderRegistry` dinâmico antes de existir terceiro provider;
- `ContextBuilder` como serviço próprio sem reutilização concreta;
- `ToolExecutor` como serviço próprio sem ganho claro;
- cache de símbolos/contexto antes de medir gargalo;
- fallback automático;
- terceiro provider cloud;
- parâmetros específicos de fornecedor no contrato global sem necessidade real.

A seleção multi-provider da Code Review **não está mais adiada**: foi incorporada ao PR #295.

## Resumo

| Etapa | Entrega | Estado |
|---|---|---|
| #286 | Documentação e roadmap | Concluído |
| #287 | Caracterização + segurança | Concluído |
| #288 | `AiProvider` + `OllamaProvider` | Concluído |
| #289 | `fast` / `complete` + síntese global | Concluído |
| #290 | Primeiro provider cloud | Concluído |
| #291 | Seleção + consentimento | Concluído |
| #292 | Fallback `offer` | Concluído |
| #293 | Hardening de rastreabilidade | Concluído |
| #295 | Fechamento dos gaps restantes | Em andamento |
