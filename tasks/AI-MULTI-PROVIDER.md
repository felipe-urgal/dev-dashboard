# Plano de execuÃ§Ã£o â IA multi-provider

> **2026-08-12:** a arquitetura multi-provider criada por este roadmap foi
> removida â ver [`238-remover-assistente-ia.md`](238-remover-assistente-ia.md).
> Documento mantido como registro histÃ³rico.

Este arquivo registra o roadmap histÃ³rico que criou a arquitetura multi-provider descrita em [`docs/architecture/ai-multi-provider.md`](../docs/architecture/ai-multi-provider.md).

O checklist atual de fechamento estÃ¡ em [`AI-MULTI-PROVIDER-FINALIZATION.md`](AI-MULTI-PROVIDER-FINALIZATION.md).

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

Quando houver alteraÃ§Ã£o de schema/rota:

```bash
npm run docs:api
npm run docs:api:check
```

Regras permanentes:

- nÃ£o misturar refatoraÃ§Ã£o nÃ£o relacionada;
- manter a API em `127.0.0.1`;
- preservar catÃ¡logo fechado de ferramentas;
- preservar preview + aprovaÃ§Ã£o antes de escrita;
- nÃ£o introduzir shell arbitrÃ¡rio no fluxo de IA;
- atualizar documentaÃ§Ã£o quando o comportamento mudar;
- atualizar `tasks/NEXT.md` quando a prioridade mudar.

---

## PR #286 â documentaÃ§Ã£o e roadmap â concluÃ­do

Entregou:

- arquitetura multi-provider documentada;
- responsabilidades de provider/orquestrador/Code Review;
- modos `fast`/`complete`;
- requisitos de masking e consentimento;
- fallback inicial `offer`;
- abstraÃ§Ãµes adiadas para evitar overengineering.

## PR #287 â caracterizaÃ§Ã£o e seguranÃ§a â concluÃ­do

Entregou:

- cobertura dos fluxos existentes;
- barreira compartilhada `createAiOutboundProtectionFetch`;
- masking de chat, ferramentas, completion e review;
- regressivos de nÃ£o vazamento.

## PR #288 â `AiProvider` + `OllamaProvider` â concluÃ­do

Entregou:

- contrato `AiProvider`;
- `OllamaProvider` isolando HTTP/status/modelos/tool calling;
- `AiOrchestrator` para o loop de ferramentas;
- Code Review mantida como orquestraÃ§Ã£o batch separada;
- sem `ProviderRegistry`, `ContextBuilder` ou `ToolExecutor` prematuros.

## PR #289 â modos `fast` / `complete` + sÃ­ntese global â concluÃ­do

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

TambÃ©m entregou a sÃ­ntese global da Code Review no modo completo.

## PR #290 â primeiro provider cloud â concluÃ­do

Entregou:

- `OpenAiProvider`;
- autenticaÃ§Ã£o por API key;
- descoberta de modelos compatÃ­veis;
- function calling normalizado;
- `store: false` em inferÃªncia;
- masking antes de requests cloud;
- documentaÃ§Ã£o especÃ­fica do adapter.

## PR #291 â seleÃ§Ã£o de provider + consentimento â concluÃ­do

Entregou:

- `AiProviderResolver`;
- `Ollama + fast` como default;
- provider/modo persistidos por projeto;
- consentimento OpenAI persistido separadamente;
- seleÃ§Ã£o Local/OpenAI e RÃ¡pido/Completo na UI;
- revalidaÃ§Ã£o de consentimento antes de nova execuÃ§Ã£o cloud.

Nesta etapa a seleÃ§Ã£o foi aplicada primeiro ao Assistente/implementation. A Code Review foi migrada depois no fechamento pÃ³s-roadmap.

## PR #292 â fallback `offer` â concluÃ­do

Entregou:

- `off` e `offer`;
- nenhuma troca automÃ¡tica de provider;
- Local â Cloud somente com aÃ§Ã£o explÃ­cita e consentimento;
- nova execution sem transportar histÃ³rico/tool results/eventos anteriores.

## PR #293 â hardening de rastreabilidade â concluÃ­do

Entregou:

- provider/modo registrados no snapshot de implementation;
- provider/modo congelados antes da resoluÃ§Ã£o assÃ­ncrona;
- fallback baseado no provider realmente usado pela execution;
- rollback visual quando persistÃªncia de seleÃ§Ã£o falha;
- mensagens genÃ©ricas sem acoplamento desnecessÃ¡rio ao Ollama.

---

# PR #295 â fechamento pÃ³s-roadmap â fechamento tÃ©cnico concluÃ­do

A auditoria apÃ³s #293 encontrou gaps que impediam considerar a arquitetura 100% multi-provider. O #295 concentra o fechamento desses gaps para os providers atuais: Ollama e OpenAI.

## Entregue no #295

### Code Review multi-provider

- [x] Code Review usa `AiProviderResolver`.
- [x] provider/modo ficam congelados durante toda a execution.
- [x] revisÃ£o por arquivo e sÃ­ntese global usam a mesma instÃ¢ncia do provider.
- [x] `provider` e `mode` fazem parte do snapshot/contrato HTTP.
- [x] UI mostra provider/modo usados.
- [x] endpoint one-shot sem consumidor foi removido.

### APIs genÃ©ricas

- [x] `/ai/status` reflete o provider selecionado.
- [x] `/ai/chat` resolve provider/modo antes do stream.
- [x] `/ai/complete` resolve o provider selecionado.
- [x] rota genÃ©rica nÃ£o recebe mais diretamente o serviÃ§o local/Ollama.
- [x] `/ai/models/pull` respeita a capability do provider e nÃ£o faz fallback oculto.

### ValidaÃ§Ã£o de modelo

- [x] modelo Ã© validado no backend antes da inferÃªncia.
- [x] modelo Ollama nÃ£o pode ser usado com OpenAI.
- [x] modelo OpenAI nÃ£o pode ser usado com Ollama.
- [x] Code Review valida provider/modelo antes de ler diff.

### Contratos de erro estÃ¡veis

- [x] `AiErrorCode` compartilhado entre contracts, adapters, resolver, HTTP, SSE e executions.
- [x] consentimento, provider, modelo, auth, quota, rate limit, timeout, cancelamento, resposta invÃ¡lida e falha upstream possuem cÃ³digos prÃ³prios.
- [x] implementation e Code Review registram `errorCode` quando aplicÃ¡vel.
- [x] referÃªncia HTTP documenta os status especÃ­ficos das rotas de IA.

### SeguranÃ§a cloud

- [x] masking Ã© provado com OpenAI em chat, implementation, tool result, completion, Code Review e sÃ­ntese global.
- [x] consentimento Ã© revalidado antes de conteÃºdo do projeto chegar Ã  cloud.
- [x] revogaÃ§Ã£o bloqueia a prÃ³xima execution.
- [x] status/listagem de modelos nÃ£o envia conteÃºdo do projeto.
- [x] credenciais ficam fora de prompt/eventos/bodies de conteÃºdo.
- [x] logs estruturados de IA usam contexto allowlistado e nÃ£o serializam `Error.message/cause` bruto.

### Cancelamento e concorrÃªncia

- [x] abort externo chega aos requests de OpenAI e Ollama.
- [x] implementation e Code Review terminalizam antes do abort.
- [x] resposta tardia da sÃ­ntese global nÃ£o altera uma execution cancelada.
- [x] status relÃª provider/modo depois de requests lentos para nÃ£o devolver seleÃ§Ã£o stale.
- [x] shutdown da API encerra implementation e Code Review.

### Assistente de implementaÃ§Ã£o

- [x] exige investigaÃ§Ã£o real do projeto antes de concluir alteraÃ§Ã£o concreta.
- [x] nÃ£o inventa caminho como fluxo aceitÃ¡vel; deve buscar/listar/ler o cÃ³digo relevante.
- [x] `propose_workspace_edit` Ã© recusado antes de inspeÃ§Ã£o bem-sucedida.
- [x] falta de crÃ©ditos/quota OpenAI vira mensagem amigÃ¡vel e provider temporariamente indisponÃ­vel.

## Auditoria final

Os P1 foram revisados em [`AI-MULTI-PROVIDER-FINALIZATION.md`](AI-MULTI-PROVIDER-FINALIZATION.md). O que protege comportamento essencial estÃ¡ validado; melhorias incrementais foram classificadas como follow-up nÃ£o bloqueante.

O Ãºnico requisito restante antes do merge Ã© o **gate obrigatÃ³rio verde no head final** que contÃ©m cÃ³digo, testes e documentaÃ§Ã£o reconciliada.

---

## Itens deliberadamente adiados

- `ProviderRegistry` dinÃ¢mico antes de existir terceiro provider;
- `ContextBuilder` como serviÃ§o prÃ³prio sem reutilizaÃ§Ã£o concreta;
- `ToolExecutor` como serviÃ§o prÃ³prio sem ganho claro;
- cache de sÃ­mbolos/contexto antes de medir gargalo;
- fallback automÃ¡tico;
- terceiro provider cloud;
- parÃ¢metros especÃ­ficos de fornecedor no contrato global sem necessidade real.

A seleÃ§Ã£o multi-provider da Code Review **nÃ£o estÃ¡ mais adiada**: foi incorporada ao PR #295.

## Resumo

| Etapa | Entrega | Estado |
|---|---|---|
| #286 | DocumentaÃ§Ã£o e roadmap | ConcluÃ­do |
| #287 | CaracterizaÃ§Ã£o + seguranÃ§a | ConcluÃ­do |
| #288 | `AiProvider` + `OllamaProvider` | ConcluÃ­do |
| #289 | `fast` / `complete` + sÃ­ntese global | ConcluÃ­do |
| #290 | Primeiro provider cloud | ConcluÃ­do |
| #291 | SeleÃ§Ã£o + consentimento | ConcluÃ­do |
| #292 | Fallback `offer` | ConcluÃ­do |
| #293 | Hardening de rastreabilidade | ConcluÃ­do |
| #295 | Fechamento dos gaps restantes | Aguardando gate final |
