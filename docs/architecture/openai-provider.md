# Provider OpenAI cloud

Este documento registra a primeira integração cloud do contrato `AiProvider`.

## Estado desta fase

O `OpenAiProvider` é um adapter backend implementado e testável, mas **não é selecionável pelo produto nesta fase**. O `AppContext` continua usando `OllamaProvider` como provider ativo.

Isso é deliberado: um provider não conhece `Project`, filesystem, Git, LSP, workspace edit nem consentimento. O caminho ativo para cloud só será criado junto do resolver/seleção e da confirmação por projeto.

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

## Consentimento

Não existe caminho de produção para o `OpenAiProvider` nesta fase. Antes de ele ser selecionável, o próximo PR deve implementar:

- resolução explícita de provider;
- consentimento por projeto antes do primeiro envio cloud;
- persistência local desse consentimento;
- indicação clara de Local vs Cloud;
- nenhuma troca Local → Cloud silenciosa.

## Fora desta fase

- seleção de provider na UI;
- fallback;
- provider adicional;
- `ProviderRegistry` dinâmico;
- acesso do provider ao workspace;
- ferramentas hospedadas pelo fornecedor.
