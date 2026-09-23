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

## Custo e budgets

Fora deste primeiro recorte:

- custo reportado;
- tabela versionada de preço;
- custo estimado;
- agregados por task/projeto/período;
- soft/hard budgets.

Esses itens devem ser construídos sobre `AgentUsage` sem alterar a proveniência da métrica.
