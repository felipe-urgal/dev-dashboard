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

Ainda não instrumentado neste recorte. A integração futura deve usar uma saída machine-readable suportada pelo provider. Ausência de usage não pode falhar a execução.

## ChatGPT Browser

Permanece conservador: sem tokens/custo enquanto não houver fonte confiável fornecida pelo provider. O Dashboard não infere custo de assinatura ChatGPT.

## Custo e budgets

Fora deste primeiro recorte:

- custo reportado;
- tabela versionada de preço;
- custo estimado;
- agregados por task/projeto/período;
- soft/hard budgets.

Esses itens devem ser construídos sobre `AgentUsage` sem alterar a proveniência da métrica.
