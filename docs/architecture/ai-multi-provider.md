# Arquitetura multi-provider e modos de execução de IA

Este documento registra a arquitetura atual de IA do Dev Dashboard: providers, modos de execução, seleção por projeto, Code Review, segurança, masking e fallback.

O roadmap histórico está em [`../../tasks/AI-MULTI-PROVIDER.md`](../../tasks/AI-MULTI-PROVIDER.md). O checklist operacional de fechamento está em [`../../tasks/AI-MULTI-PROVIDER-FINALIZATION.md`](../../tasks/AI-MULTI-PROVIDER-FINALIZATION.md).

## Objetivo

Separar duas decisões:

1. **qual provider/modelo executa a inferência**;
2. **como a tarefa deve ser executada**, por meio dos modos `fast` e `complete`.

Git, filesystem, LSP, ferramentas, masking, preview e aprovação continuam sob responsabilidade do Dev Dashboard. Providers conhecem apenas transporte, autenticação, payload nativo e capacidades de inferência.

## Estado atual

A aplicação suporta dois providers:

- `ollama`: provider local e padrão;
- `openai`: provider cloud, sujeito a credencial e consentimento explícito por projeto.

Provider e modo são persistidos por projeto. Consentimento OpenAI é persistido separadamente.

Os fluxos genéricos de IA e a Code Review usam `AiProviderResolver`; nenhum fluxo genérico deve escolher Ollama silenciosamente.

Características atuais:

- `DEV_DASHBOARD_OLLAMA_URL` aceita somente HTTP em loopback;
- `Ollama + fast` permanece o default;
- Assistente/implementation e Code Review obedecem à seleção do projeto;
- cada execution registra provider, modo e modelo usados;
- Code Review congela provider/modo no início e usa a mesma instância nas revisões por arquivo e na síntese global;
- `/ai/status`, `/ai/chat` e `/ai/complete` resolvem o provider selecionado;
- `/ai/models/pull` passa pelo provider selecionado e só funciona quando o adapter suporta instalação de modelo;
- modelos incompatíveis são rejeitados no backend antes da inferência;
- falhas de IA usam uma taxonomia compartilhada entre provider, resolver, HTTP, SSE e executions;
- o catálogo de ferramentas continua fechado e controlado pela aplicação;
- `propose_workspace_edit` cria apenas uma prévia; escrita exige aprovação explícita;
- conteúdo textual passa pela barreira compartilhada de masking antes de sair para um provider;
- Local → Cloud nunca acontece automaticamente;
- fallback automático continua fora do escopo.

## Arquitetura

```text
                         AiProviderResolver
                         seleção por projeto
                               │
                 ┌─────────────┴─────────────┐
                 │                           │
                 ▼                           ▼
          AiOrchestrator             GitAiCodeReviewService
       Assistente / implementation          Code Review
                 │                           │
                 └─────────────┬─────────────┘
                               ▼
                          AiProvider
                     ┌─────────┴─────────┐
                     ▼                   ▼
              OllamaProvider       OpenAiProvider
```

`AiAssistantService` continua sendo a fachada usada pelos fluxos de produto. O resolver escolhe a fachada ligada ao provider correto para o projeto e revalida consentimento/disponibilidade antes de conteúdo do projeto seguir para cloud.

## `AiProvider`

`AiProvider` é a fronteira mínima de inferência. O contrato interno oferece operações equivalentes a:

- consultar status e modelos;
- executar uma rodada de chat;
- executar completion;
- opcionalmente instalar modelo quando o adapter possui essa capability.

Tool calling nativo é normalizado pelo adapter. IDs e detalhes específicos de fornecedor não vazam para o domínio compartilhado.

Falhas conhecidas do adapter usam `AiProviderError` com um `AiErrorCode` provider-neutral. Isso impede que camadas superiores precisem interpretar texto para distinguir autenticação, quota, timeout ou resposta inválida.

## `AiProviderResolver`

O resolver é a fonte de verdade para seleção de execução.

Responsabilidades:

- ler provider e modo persistidos do projeto;
- exigir consentimento antes de execução OpenAI;
- consultar disponibilidade do provider;
- preservar o código de indisponibilidade informado pelo status do adapter;
- validar o modelo solicitado contra os modelos disponíveis do provider;
- devolver provider, modo e `AiAssistantService` coerentes para a execução.

A validação de modelo é server-side. A UI filtra modelos para melhorar a experiência, mas requests manuais não podem usar um modelo Ollama com OpenAI nem um modelo OpenAI com Ollama.

`models/pull` é a exceção deliberada à validação de “modelo já disponível”: essa operação existe justamente para instalar um modelo local ainda ausente. O adapter cloud não cai silenciosamente no Ollama.

## `OllamaProvider`

O comportamento específico do Ollama fica isolado no adapter:

- URL local e validação de loopback;
- descoberta de modelos e capacidades;
- serialização/deserialização de tool calling;
- compatibilidade de tool call textual;
- timeouts;
- instalação dos modelos locais permitidos;
- classificação de falhas de transporte/resposta sem vazar detalhe HTTP para a camada de produto.

A compatibilidade de tool call textual é detalhe Ollama/modelo e não pertence ao orquestrador genérico.

## `OpenAiProvider`

A OpenAI é o provider cloud atual.

Responsabilidades do adapter:

- autenticação por API key;
- status e descoberta de modelos compatíveis;
- tradução do catálogo interno para function calling;
- encapsulamento dos IDs nativos de tool calls;
- `store: false` nas requests de inferência;
- uso da barreira compartilhada de masking;
- classificação de autenticação, billing/quota, rate limit, timeout, resposta inválida e falha upstream.

Quando a API informa falta de créditos/quota, o provider é marcado temporariamente como indisponível para impedir repetição imediata da mesma chamada. A mensagem exibida orienta adicionar créditos da API ou selecionar o provider Local.

Consentimento por projeto não pertence ao adapter; essa decisão fica no resolver.

Detalhes adicionais: [`openai-provider.md`](openai-provider.md).

## `AiOrchestrator`

O orquestrador gerencia o fluxo interativo do Assistente:

- conversa da execução;
- rodadas de ferramentas;
- catálogo autorizado;
- execução local das ferramentas;
- budgets por modo;
- proteção contra chamadas idênticas sem progresso;
- limite acumulado de resultados de ferramentas;
- preview de alterações;
- cancelamento.

O catálogo atual é:

- `read_project_file`;
- `search_project_text`;
- `list_project_files`;
- `get_git_diff`;
- `propose_workspace_edit`;
- `get_symbol_definition`;
- `get_symbol_references`.

O Assistente de implementação também exige investigação real do projeto antes de concluir uma alteração concreta: uma resposta final ou proposta de workspace edit sem inspeção bem-sucedida é recusada.

## Modos de execução

A UI expõe dois modos independentes do provider:

- **Rápido (`fast`)**: menor custo/latência e análise pontual;
- **Completo (`complete`)**: mais contexto e análise cruzada.

A policy é centralizada em `ai-execution-policy.ts`:

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

Os valores são budgets explícitos e testados.

## Code Review IA

`GitAiCodeReviewService` continua separado do `AiOrchestrator` porque o fluxo é batch: revisa arquivos do diff, agrega resultados e, no modo completo, executa síntese global.

A separação de orquestração não significa separação de provider. Antes de ler o diff, a Code Review resolve e valida provider/modelo pelo `AiProviderResolver`.

A execution registra e congela:

- provider;
- modo;
- modelo;
- arquivos;
- estado e progresso;
- `errorCode` quando a falha/cancelamento pertence ao domínio de IA.

Falhas individuais também podem registrar `errorCode` por arquivo. Isso permite distinguir, por exemplo, quota, timeout e resposta inválida sem interpretar a mensagem textual.

Alterar a seleção do projeto depois do start não muda a revisão em andamento.

### `fast`

- revisão individual por arquivo;
- budget menor de diff;
- sem síntese global.

### `complete`

- revisão individual por arquivo;
- budget maior;
- síntese global com a mesma instância do provider;
- análise cruzada entre arquivos;
- deduplicação de findings;
- falha explícita se a síntese estruturada for inválida.

## Segurança e cloud

### Masking

`createAiOutboundProtectionFetch` é a última barreira compartilhada antes da rede.

A proteção cobre os caminhos suportados de:

- chat;
- implementation;
- resultados textuais de ferramentas;
- completion;
- revisão por arquivo;
- síntese global da Code Review.

### Consentimento

OpenAI exige consentimento explícito por projeto.

O consentimento:

- é armazenado separadamente da seleção;
- pode ser concedido e revogado;
- é revalidado antes de cada nova execução cloud;
- nunca é inferido apenas porque OpenAI foi selecionada;
- continua obrigatório ao aceitar uma oferta de fallback.

Status e descoberta de modelos podem ocorrer sem consentimento porque não enviam conteúdo do projeto.

### Credenciais e retenção

- credenciais não entram no repositório;
- a API key é lida do ambiente;
- requests OpenAI de inferência usam `store: false`;
- logs não devem persistir prompts, diffs, tool results ou credenciais;
- novos providers devem reutilizar a mesma fronteira de segurança.

## Seleção por projeto

A interface trabalha com:

```text
Executar com
[ Local / OpenAI ]

Modo
[ Rápido ] [ Completo ]

Opções avançadas
[ Modelo ] [ Fallback ]
```

Provider e modo são persistidos por projeto. Modelo permanece escolha da execução/UI e não é persistido como seleção global.

A Code Review não duplica configuração: ela reflete a seleção do projeto e mostra provider/modo usados pela execução.

## Snapshot de implementation

Cada `AiImplementationExecution` registra:

- projeto;
- provider;
- modo;
- modelo;
- prompt;
- status;
- `errorCode`, quando houver falha/cancelamento classificado;
- timestamps;
- eventos.

Eventos SSE de erro também podem carregar o mesmo `AiErrorCode`. Provider e modo são congelados de forma síncrona no start. A resolução assíncrona valida o provider/modelo congelados em vez de reler a seleção atual.

## Fallback

Policies atuais:

- `off`: encerra sem oferecer alternativa;
- `offer`: após falha elegível, oferece outro provider disponível.

`automatic` permanece fora do escopo.

A oferta nunca inicia execução automaticamente e Local → Cloud continua sujeito a ação explícita e consentimento.

A nova execução não transporta histórico, tool results, diffs nem eventos da execução anterior.

## Erros e diagnóstico

A taxonomia pública fica em `AiErrorCode`, no pacote compartilhado `@dev-dashboard/contracts`. A mensagem continua sendo legível para a pessoa usuária; o código existe para UI, testes e diagnóstico não dependerem de comparação textual.

| Código | Significado |
|---|---|
| `AI_ASSISTANT_INVALID_REQUEST` | Entrada/guardrail da aplicação recusou a operação. |
| `AI_CLOUD_CONSENT_REQUIRED` | Conteúdo do projeto não pode seguir para cloud sem consentimento. |
| `AI_PROVIDER_UNAVAILABLE` | Provider selecionado não está disponível. |
| `AI_MODEL_UNAVAILABLE` | Modelo não pertence ao catálogo disponível do provider. |
| `AI_PROVIDER_AUTH_FAILED` | Credencial/configuração do provider cloud foi recusada. |
| `AI_PROVIDER_QUOTA_EXCEEDED` | Billing/quota/créditos do provider não permitem nova inferência. |
| `AI_PROVIDER_RATE_LIMITED` | Provider limitou temporariamente a taxa de requests. |
| `AI_PROVIDER_TIMEOUT` | Provider não respondeu dentro do limite. |
| `AI_REQUEST_CANCELLED` | Operação foi cancelada antes de terminar. |
| `AI_PROVIDER_INVALID_RESPONSE` | Resposta/tool call/payload devolvido pelo modelo não respeitou o contrato. |
| `AI_PROVIDER_OPERATION_UNSUPPORTED` | Provider não possui a capability pedida, como instalação de modelo. |
| `AI_PROVIDER_REQUEST_FAILED` | Falha upstream/rede não classificada em uma categoria mais específica. |

A mesma taxonomia é preservada, quando aplicável, em:

- `ProjectAiStatus.errorCode`;
- erros HTTP das rotas de IA;
- eventos SSE de erro;
- `AiImplementationExecution.errorCode`;
- `GitPullRequestAiReviewExecution.errorCode` e falhas por arquivo.

O HTTP usa status distintos sem confundir autenticação do provider com autenticação do dashboard: por exemplo, `AI_PROVIDER_AUTH_FAILED` é uma falha upstream (`502`), enquanto quota/rate limit usam `429`, timeout usa `504`, provider indisponível usa `503` e modelo/operação não suportada usam `422`.

Mensagens específicas de fornecedor permanecem no adapter quando ajudam o diagnóstico, mas a camada de produto não precisa fazer regex nelas para decidir o tipo de falha.

## Itens deliberadamente adiados

- `ProviderRegistry` dinâmico;
- `ContextBuilder` como serviço próprio;
- `ToolExecutor` como serviço próprio;
- cache de árvore de símbolos/contexto;
- fallback automático;
- terceiro provider;
- parâmetros específicos de fornecedor no contrato global.

## Critérios de consistência

A arquitetura é considerada consistente quando:

- todo fluxo genérico resolve provider explicitamente;
- nenhum provider recebe acesso direto a Git/LSP/workspace;
- modelos incompatíveis são recusados antes da inferência;
- falhas de IA possuem código estável quando reconhecidas;
- `fast` e `complete` têm policies determinísticas;
- nenhuma alteração é aplicada sem preview e aprovação;
- conteúdo sensível passa pela barreira de masking;
- cloud depende de consentimento explícito;
- executions identificam provider, modo e modelo;
- falhas de persistência não deixam UI/backend divergentes;
- Local nunca migra para Cloud silenciosamente.

## Histórico

A implementação evoluiu incrementalmente:

1. documentação e roadmap — #286;
2. caracterização e segurança — #287;
3. `AiProvider` + `OllamaProvider` — #288;
4. modos `fast`/`complete` + síntese global — #289;
5. primeiro provider cloud — #290;
6. seleção de provider + consentimento — #291;
7. fallback `offer` — #292;
8. hardening de rastreabilidade — #293;
9. fechamento dos gaps restantes — PR #295.
