# Provider OpenAI cloud

Este documento registra a integração cloud da OpenAI atrás do contrato `AiProvider`.

## Estado atual

`OpenAiProvider` pode ser selecionado por projeto e é usado pelos fluxos genéricos de IA, pelo Assistente/implementation e pela Code Review IA quando OpenAI está selecionada e autorizada.

`OllamaProvider` permanece como default local. Nenhum fluxo genérico deve cair silenciosamente no Ollama quando o projeto está configurado para OpenAI.

A seleção não altera a fronteira arquitetural: o provider não conhece `Project`, filesystem, Git, LSP, workspace edit nem consentimento. Essas decisões pertencem ao Dev Dashboard e são aplicadas antes de o adapter ser chamado.

## Autenticação

A credencial é lida somente no processo da API, nesta ordem:

1. `DEV_DASHBOARD_OPENAI_API_KEY`;
2. `OPENAI_API_KEY`.

A API key é enviada exclusivamente no header `Authorization: Bearer ...`. Ela não faz parte de prompts, eventos nem logs do dashboard.

ChatGPT e API são produtos com cobrança separada. Ter uma assinatura do ChatGPT não garante créditos para a API. Quando a OpenAI informa falta de quota/créditos, o adapter transforma a falha em uma mensagem de produto e marca o provider temporariamente como indisponível para evitar repetição imediata da mesma chamada.

Credencial ausente, inválida ou sem autorização é classificada como `AI_PROVIDER_AUTH_FAILED`; esse código descreve autenticação do **provider**, não a sessão local do dashboard.

## Endpoint e retenção

O adapter usa a API oficial em `https://api.openai.com/v1`.

Requests de inferência usam `store: false`. Isso evita solicitar persistência de application state pelo endpoint, sem prometer Zero Data Retention: políticas de retenção dependem da configuração e elegibilidade da organização OpenAI.

## Modelos

O status consulta `/v1/models` e expõe somente modelos considerados compatíveis pelo adapter.

A UI usa esse catálogo para seleção, mas a validação também acontece no backend. Antes da inferência, `AiProviderResolver` verifica que o modelo solicitado existe no provider resolvido.

Isso impede, por exemplo:

- enviar `qwen2.5-coder:14b` para OpenAI;
- enviar `gpt-5-mini` para Ollama;
- depender do erro do fornecedor para descobrir incompatibilidade de modelo.

A validação não é aplicada ao fluxo de instalação de modelo local porque `models/pull` existe justamente para instalar um modelo ainda ausente e só funciona em provider que possui essa capability.

## Tool calling

O catálogo fechado do Dev Dashboard continua sendo a fonte de verdade. O adapter traduz `AiProviderToolDefinition` para function tools da OpenAI e converte os argumentos devolvidos para `Record<string, unknown>`.

IDs nativos de tool calls ficam somente dentro do adapter. O contrato comum expõe apenas nome e argumentos da ferramenta.

Argumentos de ferramenta que não sejam JSON objeto, respostas sem `choices/message` e outras estruturas incompatíveis são classificadas como `AI_PROVIDER_INVALID_RESPONSE`.

## Masking

`createAiOutboundProtectionFetch` permanece como a última barreira antes da rede.

A proteção cobre conteúdo textual enviado por:

- chat;
- implementation;
- resultados de ferramentas;
- completion;
- revisão por arquivo;
- síntese global da Code Review.

O adapter não deve registrar bodies completos de requests cloud.

## Seleção e consentimento

O backend mantém duas configurações locais independentes por projeto:

- `project-ai-selection.json`: provider (`ollama`/`openai`) e modo (`fast`/`complete`);
- `project-ai-consent.json`: autorização explícita para uso da OpenAI naquele projeto.

Esses arquivos não armazenam API key, prompt, diff, resposta do modelo nem conteúdo do workspace.

Selecionar `openai` não concede consentimento automaticamente. Antes de uma nova execução cloud, o resolver revalida:

1. provider selecionado;
2. consentimento do projeto;
3. disponibilidade/autenticação do provider;
4. compatibilidade do modelo solicitado.

Se o consentimento for revogado, novas execuções OpenAI são bloqueadas. Nenhuma troca Local → Cloud acontece silenciosamente.

Status e listagem de modelos podem ocorrer sem consentimento porque não enviam conteúdo do projeto.

## Code Review

A Code Review usa a mesma seleção por projeto do Assistente.

No início da revisão:

1. provider/modelo são validados;
2. provider e modo são congelados na execution;
3. a lista/diff só é lida depois da resolução bem-sucedida;
4. revisões por arquivo e síntese global usam a mesma instância do provider.

Trocar a seleção enquanto uma revisão está em andamento não altera aquela execution.

Falhas de OpenAI durante revisão por arquivo ou síntese preservam o `AiErrorCode` no snapshot quando a categoria é conhecida.

## Contrato de erros OpenAI

O adapter transforma detalhes específicos da API em uma taxonomia provider-neutral compartilhada pelo dashboard:

| Situação OpenAI | Código do dashboard |
|---|---|
| API key ausente, `401` ou `403` | `AI_PROVIDER_AUTH_FAILED` |
| `insufficient_quota`, billing/créditos esgotados | `AI_PROVIDER_QUOTA_EXCEEDED` |
| `429` temporário que não é billing/quota | `AI_PROVIDER_RATE_LIMITED` |
| timeout do request | `AI_PROVIDER_TIMEOUT` |
| cancelamento iniciado pelo caller | `AI_REQUEST_CANCELLED` |
| resposta/tool call estruturalmente inválido | `AI_PROVIDER_INVALID_RESPONSE` |
| outro HTTP/network/upstream | `AI_PROVIDER_REQUEST_FAILED` |

`ProjectAiStatus.errorCode`, HTTP, SSE e executions reutilizam esses códigos quando aplicável. O texto continua sendo mostrado para diagnóstico, mas consumidores não precisam comparar strings para identificar a classe de falha.

No HTTP, falha de autenticação OpenAI é tratada como falha upstream (`502`), não como `401` do dashboard. Quota/rate limit usam `429`, timeout usa `504` e indisponibilidade detectada pelo resolver usa `503`.

## Billing, quota e rate limit

Falta de créditos/quota não é tratada como “provider disponível”. Quando a API devolve um erro conhecido de billing/quota, o dashboard apresenta:

`OpenAI sem créditos disponíveis. Adicione créditos na conta da API ou selecione o provider Local.`

O estado de indisponibilidade fica em memória por um período curto e é refletido nas consultas de status seguintes com `errorCode: AI_PROVIDER_QUOTA_EXCEEDED`.

Rate limit temporário é diferente de falta de créditos e usa `AI_PROVIDER_RATE_LIMITED` com mensagem própria.

## Interface

A seleção principal expõe:

- `Executar com`: Local ou OpenAI, com indicação Local/Cloud;
- `Modo`: Rápido ou Completo;
- `Opções avançadas`: modelo e fallback.

A Code Review não cria outro seletor independente: ela reflete a seleção persistida do projeto e mostra provider/modo usados na execução.

Providers indisponíveis aparecem com a mensagem de status correspondente. OpenAI sem consentimento exige autorização explícita antes do envio de conteúdo do projeto.

## Limitações e itens futuros

Continuam fora do escopo atual:

- troca automática de provider;
- terceiro provider;
- `ProviderRegistry` dinâmico;
- acesso do provider ao workspace;
- ferramentas hospedadas pelo fornecedor;
- parâmetros específicos de OpenAI no contrato compartilhado sem necessidade real.

O checklist de fechamento em [`../../tasks/AI-MULTI-PROVIDER-FINALIZATION.md`](../../tasks/AI-MULTI-PROVIDER-FINALIZATION.md) acompanha segurança, cancelamento e observabilidade ainda em andamento.
