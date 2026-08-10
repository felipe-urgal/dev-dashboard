# Provider OpenAI cloud

Este documento registra a primeira integração cloud do contrato `AiProvider`.

## Estado atual

O `OpenAiProvider` pode ser selecionado no **Assistente IA** quando houver credencial válida. `OllamaProvider` permanece como default local e privado.

A seleção não altera a fronteira arquitetural: o provider não conhece `Project`, filesystem, Git, LSP, workspace edit nem consentimento. Essas decisões pertencem ao Dev Dashboard e são aplicadas antes de o adapter ser chamado.

## Autenticação

A credencial é lida somente no processo da API, nesta ordem:

1. `DEV_DASHBOARD_OPENAI_API_KEY`;
2. `OPENAI_API_KEY`.

A API key é enviada exclusivamente no header `Authorization: Bearer ...`. Ela não faz parte de prompts, eventos ou logs do dashboard.

## Endpoint e persistência

O adapter usa a API oficial em `https://api.openai.com/v1`.

As requests de inferência usam `store: false`. Isso evita solicitar persistência de application state pelo endpoint, sem prometer Zero Data Retention: controles como ZDR/Modified Abuse Monitoring dependem da configuração e elegibilidade da organização OpenAI.

## Tool calling

O catálogo fechado do Dev Dashboard continua sendo a fonte de verdade. O adapter traduz `AiProviderToolDefinition` para function tools da OpenAI e converte os argumentos devolvidos para `Record<string, unknown>`.

IDs nativos de tool calls são mantidos somente dentro do adapter. O contrato comum continua expondo apenas nome e argumentos da ferramenta, evitando acoplamento do domínio ao protocolo da OpenAI.

## Masking

`createAiOutboundProtectionFetch` permanece como a última barreira antes da rede. A proteção cobre o endpoint de chat do Ollama e também `/v1/chat/completions`, mascarando conteúdo textual de mensagens antes do `fetch` efetivo.

## Seleção e consentimento

O backend mantém duas configurações locais independentes por projeto:

- `project-ai-selection.json`: provider (`ollama`/`openai`) e modo (`fast`/`complete`);
- `project-ai-consent.json`: autorização explícita para uso da OpenAI naquele projeto.

Os arquivos ficam no diretório de configuração local com permissão pretendida `0600`. Eles não armazenam API key, prompt, diff, resposta do modelo ou conteúdo do workspace.

Selecionar `openai` não concede consentimento automaticamente. Antes de cada nova execução cloud, `AiProviderResolver` revalida:

1. provider selecionado;
2. consentimento do projeto;
3. disponibilidade/autenticação do provider.

Se o consentimento for revogado, novas execuções OpenAI são bloqueadas. Nenhuma troca Local → Cloud acontece silenciosamente.

A consulta de status/modelos do provider pode ocorrer sem consentimento porque não inclui conteúdo do projeto; o envio de código/contexto exige a autorização persistida.

## Interface

A tela principal expõe somente:

- `Executar com`: Local ou OpenAI, com indicação Local/Cloud;
- `Modo`: Rápido ou Completo;
- `Opções avançadas`: seleção de modelo e revogação de acesso cloud.

Providers indisponíveis aparecem desabilitados com a mensagem de status correspondente.

## Ainda fora desta fase

- fallback `offer`;
- troca automática de provider;
- provider adicional;
- `ProviderRegistry` dinâmico;
- acesso do provider ao workspace;
- ferramentas hospedadas pelo fornecedor;
- seleção de provider no fluxo de Code review.
