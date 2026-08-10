# Arquitetura multi-provider e modos de execução de IA

Este documento registra a arquitetura implementada para o Assistente IA e a Code review IA do Dev Dashboard, incluindo providers, modos de execução, segurança, seleção por projeto e fallback.

A fonte operacional do roadmap permanece em [`../../tasks/AI-MULTI-PROVIDER.md`](../../tasks/AI-MULTI-PROVIDER.md).

## Objetivo

Separar duas decisões:

1. **qual provider/modelo executa a inferência**;
2. **como a tarefa deve ser executada**, por meio dos modos `fast` e `complete`.

Git, filesystem, LSP, ferramentas, segurança, preview e aprovação continuam sob responsabilidade do Dev Dashboard e não dos providers.

## Estado atual

O Assistente IA usa `AiAssistantService` como fachada sobre `AiProvider`. O `AiProviderResolver` resolve por projeto entre Ollama local e OpenAI cloud.

Características relevantes:

- `DEV_DASHBOARD_OLLAMA_URL` aceita somente HTTP em loopback;
- Ollama é o provider local padrão;
- OpenAI é o primeiro provider cloud;
- provider e modo são persistidos por projeto;
- consentimento OpenAI é persistido separadamente por projeto;
- cada execution de implementation registra e congela `provider` e `mode` no início;
- o chat interativo usa catálogo fechado de ferramentas;
- providers não recebem acesso direto a filesystem, Git, LSP ou workspace edit;
- `propose_workspace_edit` cria apenas uma prévia e a escrita exige aprovação explícita;
- `fast` e `complete` usam budgets determinísticos;
- a Code review mantém orquestração separada do Assistente;
- o modo `complete` executa síntese global da Code review;
- segredos são mascarados na fronteira compartilhada de saída antes de conteúdo textual alcançar um provider;
- o fallback inicial é `offer`, com opção `off` durante a sessão;
- Local → Cloud nunca inicia automaticamente e continua sujeito ao consentimento do projeto.

## Arquitetura atual

```text
                     AiProvider
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
        AiOrchestrator      GitAiCodeReviewService
         Assistente              Code Review
              │
              ▼
       AiProviderResolver
              │
        ┌─────┴─────┐
        ▼           ▼
 OllamaProvider  OpenAiProvider
```

O resolver e a seleção em UI são usados pelo Assistente IA. A Code review mantém seu fluxo atual separado; seleção multi-provider nesse fluxo continua deliberadamente adiada.

## `AiProvider`

`AiProvider` é a fronteira mínima de inferência. O provider conhece transporte, autenticação, payload nativo e capacidades de inferência, mas não conhece projeto, Git, filesystem, LSP ou aprovação.

O contrato interno oferece operações equivalentes a:

- consultar status e modelos;
- executar uma rodada de chat;
- executar completion;
- opcionalmente instalar modelo quando o provider suporta essa operação.

Tool calling nativo é normalizado pelo adapter para o protocolo interno do Dev Dashboard.

Parâmetros específicos de fornecedor não devem crescer o contrato compartilhado sem necessidade real.

## `OllamaProvider`

O comportamento específico do Ollama fica isolado em `OllamaProvider`:

- HTTP e URL local;
- descoberta de modelos e capacidades;
- serialização/deserialização de tool calling;
- compatibilidade com tool calls vazados como JSON textual;
- opções e timeouts específicos;
- instalação de modelos suportados pelo dashboard.

O tratamento de tool call textual é uma compatibilidade Ollama/modelo e não pertence ao orquestrador genérico.

## `OpenAiProvider`

A OpenAI é o primeiro provider cloud real.

Responsabilidades do adapter:

- autenticação por API key;
- status e descoberta de modelos compatíveis;
- tradução do catálogo interno para function calling;
- encapsulamento dos IDs nativos de tool calls;
- envio de `store: false` nas requests de inferência;
- uso da barreira compartilhada de masking antes do request sair da aplicação.

Consentimento por projeto não pertence ao adapter; essa decisão fica no `AiProviderResolver` e nos repositories de configuração local.

Detalhes adicionais estão em [`openai-provider.md`](openai-provider.md).

## `AiOrchestrator`

O `AiOrchestrator` gerencia o fluxo interativo do Assistente IA:

- conversa da execução;
- rodadas de ferramentas;
- catálogo autorizado;
- execução das ferramentas locais;
- budgets por modo;
- proteção contra chamadas repetidas sem progresso;
- limite acumulado de resultados de ferramentas;
- preview de alterações;
- cancelamento.

`ContextBuilder` e `ToolExecutor` continuam sem classes próprias porque ainda não existe um caso concreto que justifique essas abstrações.

## Protocolo interno de ferramentas

O catálogo fechado continua pertencendo ao Dev Dashboard:

- `read_project_file`;
- `search_project_text`;
- `list_project_files`;
- `get_git_diff`;
- `propose_workspace_edit`;
- `get_symbol_definition`;
- `get_symbol_references`.

O modelo solicita uma ferramenta, a aplicação valida os argumentos e executa a operação local. Nenhum provider recebe shell irrestrito.

## Modos de execução

A UI expõe dois modos independentes do provider:

- **Rápido (`fast`)**: menor custo/latência e análise pontual;
- **Completo (`complete`)**: mais contexto e análise cruzada.

A policy atual é centralizada em `ai-execution-policy.ts`:

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

Os valores são budgets explícitos e testados, não descrições em prosa espalhadas pelos serviços.

## Code review permanece separado

`GitAiCodeReviewService` não faz parte do `AiOrchestrator`.

O Assistente é interativo e usa múltiplas rodadas com ferramentas. A Code review é batch, revisa arquivos do diff e agrega resultados.

### Modo `fast`

- revisa arquivos individualmente;
- usa budget menor de diff;
- não executa síntese global.

### Modo `complete`

- revisa arquivos individualmente;
- usa budget maior;
- executa síntese global;
- cruza contratos entre arquivos;
- deduplica findings equivalentes;
- falha explicitamente se a síntese estruturada for inválida.

A Code review continua usando o provider atual do serviço dedicado. Seleção multi-provider nesse fluxo não faz parte do roadmap já concluído.

## Segurança e providers cloud

### Masking obrigatório

`createAiOutboundProtectionFetch` é a última barreira compartilhada antes de conteúdo textual alcançar um motor de IA.

A proteção cobre os caminhos suportados de:

- chat;
- implementation;
- resultados textuais de ferramentas;
- completion;
- Code review.

O objetivo é impedir que um adapter cloud precise lembrar individualmente de aplicar masking.

### Consentimento

OpenAI exige consentimento explícito por projeto.

O consentimento:

- é armazenado em configuração local separada da seleção;
- pode ser concedido e revogado;
- é revalidado antes de nova execução cloud;
- nunca é inferido apenas porque OpenAI foi selecionada;
- continua obrigatório também quando OpenAI é oferecida como fallback.

### Credenciais e retenção

- credenciais não entram no repositório;
- a API key é lida do ambiente;
- requests OpenAI de inferência usam `store: false`;
- logs não devem persistir prompts/diffs sensíveis por padrão;
- políticas de fornecedores devem ser revalidadas quando novos providers forem implementados.

## Seleção por projeto

O Assistente IA expõe:

```text
Executar com
[ Local / OpenAI ]

Modo
[ Rápido ] [ Completo ]

Opções avançadas
[ Modelo ] [ Fallback ]
```

Provider e modo são persistidos por projeto. Consentimento cloud é persistido separadamente.

Modelo continua sendo uma escolha da execução/UI e não foi adicionado ao repository de seleção por projeto.

O hardening pós-roadmap mantém o estado visual consistente com o backend: se `PUT /ai/selection` falhar, provider, modo e modelo retornam ao último estado persistido.

## Snapshot de implementation

Cada `AiImplementationExecution` registra:

- projeto;
- provider;
- modo;
- modelo;
- prompt;
- status;
- timestamps;
- eventos da execução.

Provider e modo são congelados de forma síncrona em `start()`. A resolução assíncrona valida o provider congelado, em vez de reler a seleção atual do projeto.

Isso evita uma race em que o usuário altera a seleção entre o POST e a resolução do provider e também permite que o fallback identifique corretamente qual provider falhou.

## Fallback

As policies implementadas nesta fase são:

- `off`: encerra sem oferecer alternativa;
- `offer`: após falha elegível, oferece outro provider disponível.

`automatic` permanece fora do escopo.

A classificação atual é deliberadamente conservadora: a oferta só aparece quando a execution falhou e o provider registrado nela está indisponível no status atual. Erro de ferramenta/modelo com provider ainda disponível não gera fallback.

Ao aceitar a oferta:

1. a nova seleção é persistida;
2. somente após sucesso da persistência a UI confirma a troca;
3. o prompt original é restaurado;
4. histórico, tool results, diffs e eventos da execução anterior não são transportados;
5. para Local → OpenAI, consentimento continua obrigatório;
6. o usuário ainda precisa clicar em `Iniciar`.

Se a persistência da seleção falhar, a oferta permanece visível e a UI volta à seleção persistida.

`off/offer` continua sendo preferência de sessão neste hardening; não foi adicionado ao schema persistido apenas para essa opção.

## Itens deliberadamente adiados

- `ProviderRegistry` dinâmico;
- `ContextBuilder` como serviço próprio;
- `ToolExecutor` como serviço próprio;
- cache de árvore de símbolos/contexto;
- fallback automático;
- múltiplos providers cloud adicionais;
- parâmetros específicos de fornecedor no contrato global;
- seleção multi-provider na Code review.

## Critérios de sucesso

A arquitetura é considerada consistente quando:

- um provider pode ser implementado sem ganhar acesso direto a Git/LSP/workspace;
- opções específicas de provider não vazam para o domínio compartilhado;
- tool calling específico é normalizado no adapter;
- `fast` e `complete` têm policies determinísticas e testes;
- nenhuma alteração é aplicada sem preview e aprovação;
- conteúdo sensível passa pela barreira de masking;
- cloud depende de consentimento explícito;
- cada execution identifica provider e modo usados;
- uma falha de persistência não deixa UI e backend em estados divergentes;
- Local nunca migra para Cloud silenciosamente.

## Histórico de implementação

O roadmap foi entregue de forma incremental:

1. documentação e roadmap — #286;
2. caracterização e segurança — #287;
3. `AiProvider` + `OllamaProvider` — #288;
4. modos `fast`/`complete` — #289;
5. síntese global da Code review — absorvida pelo #289;
6. primeiro provider cloud — #290;
7. seleção de provider + consentimento — #291;
8. fallback `offer` — #292;
9. hardening de rastreabilidade e consistência — etapa pós-roadmap.
