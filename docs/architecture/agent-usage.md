# Agent Runtime — usage e telemetria

Issue de origem: #778.

## Princípio

Usage é evidência observada do provider. O Dashboard não transforma ausência de métrica em zero e não apresenta estimativa como cobrança oficial.

O contrato normalizado inicial registra somente dados comprováveis:

- provider concreto;
- origem da métrica;
- input tokens;
- cached input tokens;
- cache-write input tokens quando disponíveis;
- output tokens;
- reasoning tokens quando disponíveis;
- total tokens quando o provider reportar;
- modelo somente quando houver identidade confiável.

## Codex

O provider Codex usa `codex exec --json` e lê apenas eventos JSONL `turn.completed`.

A telemetria é sanitizada para `AgentUsage`. O stdout bruto não entra no resultado público nem é persistido para exibir usage.

Campos ausentes permanecem ausentes. Em particular, reasoning/model não são inferidos a partir de output, configuração local, banner ou arquivos de sessão.

## Claude Code

O provider Claude Code usa `--output-format stream-json --verbose` no modo não interativo.

A normalização aceita apenas metadados estruturados:

- `system/init.model` ou `assistant.message.model`;
- `assistant.message.usage.input_tokens`;
- `assistant.message.usage.cache_read_input_tokens`;
- `assistant.message.usage.cache_creation_input_tokens`;
- `assistant.message.usage.output_tokens`;
- `result.total_cost_usd` como custo **reportado** em USD;
- `result.duration_ms`.

Contadores de múltiplas mensagens de assistant são somados. `totalTokens` não é inferido quando o provider não entrega esse campo com semântica explícita. O conteúdo de `result.result`, prompts e mensagens brutas não entram em `AgentUsage`.

Ausência ou JSON parcial de usage não falha a execução.

## ChatGPT Browser

Permanece conservador: sem tokens/custo enquanto não houver fonte confiável fornecida pelo provider. O Dashboard não infere custo de assinatura ChatGPT.

## Persistência e agregação

A telemetria sanitizada é persistida em `AgentUsageStore` após a execução, keyed por `executionId`.

Regras:

- retenção bounded;
- append idempotente por execução;
- conflito de dados para o mesmo `executionId` é rejeitado;
- filtros por projeto, task e provider;
- agregados somam somente métricas presentes;
- falha do storage é observacional e não altera o estado da task;
- prompts, outputs e payloads brutos não são persistidos no usage store.

## API e apresentação

Os agregados sanitizados são expostos por projeto e por task, com breakdown por provider concreto. A API não retorna registros brutos do usage store.

Na aba Agente, o resumo mostra apenas métricas presentes: execuções medidas, input/cache/output, duração, custo reportado e custo estimado. Reportado e estimado aparecem em campos separados. Métricas ausentes aparecem como indisponíveis; em especial, o Browser provider não recebe tokens ou custo inferidos.

## Pricing versionado

O catálogo padrão é metadata versionada por data e usa apenas correspondência exata de `providerId + model`.

Versão inicial: `2026-09-23`.

Fontes de referência consultadas para esta versão:

- OpenAI ChatGPT Work/Codex token pricing para `gpt-5.6-sol` e `gpt-5.3-codex`;
- Anthropic Claude Sonnet 5 para input/output, com cache read seguindo o multiplicador documentado de prompt caching.

Guardrails do estimador:

- sem model ID exato, não há estimativa;
- custo reportado pelo provider tem precedência e não é sobrescrito;
- cache-write não é estimado enquanto a modalidade/TTL não for conhecida de forma suficiente;
- cached input do Codex é tratado como subconjunto do input total;
- reasoning não é cobrado separadamente quando já faz parte da semântica de output do provider;
- toda estimativa registra `pricingVersion`;
- mudança de tabela é coberta por teste determinístico.

O catálogo representa uma referência de preço por token, não uma cobrança da assinatura/plano do usuário.

## Budgets

O soft budget é persistido separadamente por task e pode definir:

- limite de `totalTokens`;
- limite de custo estimado em USD.

A avaliação usa somente métricas realmente presentes no agregado. Se `totalTokens` ou `estimatedCostUsd` estiverem ausentes, o Dashboard não infere valores e não dispara alerta para aquela dimensão.

O soft budget é estritamente observacional:

- não cancela execução;
- não altera estado da task;
- não interfere em retry/recovery;
- não transforma ausência de telemetria em violação;
- configuração e alertas são expostos na aba Agente.

Hard stop permanece fora deste recorte e só deve existir quando houver uma condição tecnicamente segura que não interrompa uma mutação ambígua.

Ainda fora deste recorte: agregados por período e hard stop seguro.
