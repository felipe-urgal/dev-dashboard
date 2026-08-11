# Próxima atividade

O fechamento técnico da IA multi-provider (P0) está consolidado em `main` desde o **PR #295**,
seguindo [`AI-MULTI-PROVIDER-FINALIZATION.md`](AI-MULTI-PROVIDER-FINALIZATION.md). Não há
bloqueador conhecido pendente para os dois providers atuais (Ollama + OpenAI).

## Estado atual

Todos os P0 do checklist estão concluídos e mergeados. Dos follow-ups P1 não bloqueantes, dois já
foram fechados:

- item 12 (persistência local) — fault injection de `writeFile`/`rename` e teste visual de falha
  de consentimento (PR #296);
- item 11 (provider Ollama) — matriz de regressão ampliada nesta atividade (ver abaixo).

Também no PR #296: os comentários da Code Review IA passaram a aparecer inline no diff (estilo
GitHub), em vez de numa lista separada ao lado.

## Concluído nesta atividade — matriz de regressão do Ollama (item 11)

`apps/api/test/ollama-provider.test.ts` ganhou 6 casos novos cobrindo os cenários que faltavam no
checklist:

- `status()` e `chatRound()` com o Ollama offline (fetch falhando) retornam
  `AI_PROVIDER_UNAVAILABLE`/`AI_PROVIDER_REQUEST_FAILED` em vez de lançar um erro não tratado;
- `status()` com zero modelos instalados retorna `available: true` e mensagem apropriada;
- `chatRound()` contra um modelo removido no meio do uso (Ollama responde 404) falha de forma
  previsível com `AI_PROVIDER_REQUEST_FAILED`;
- NDJSON incompleto (linha final truncada, sem fechar o JSON) rejeita com
  `AI_PROVIDER_INVALID_RESPONSE` em vez de travar o parser;
- cancelar `installModel` no meio de um download longo resolve sem lançar erro e não emite o
  evento `done`.

Cobertura de `ollama-provider.ts` subiu de 90.46% para 92.33% de linhas. Suíte completa de
`apps/api` (689 testes) e gate local (`typecheck`, `lint`, `format:check`) verdes.

## Próximos follow-ups não bloqueantes (ordem sugerida)

Nenhum deles bloqueia uso do multi-provider atual; escolher pela próxima sessão:

1. **Métricas estruturadas de execution** (item 9): duração/estado terminal por execution — só se
   houver necessidade operacional real.
2. **Stress tests de budgets/tool results grandes** (itens 13 e 14) — só se surgirem casos reais de
   contexto grande.
3. **UX de fallback `offer` na Code Review** (item 8) — requer desenho explícito que evite revisão
   dupla/custo inesperado.
4. **Evolução da descoberta de modelos da OpenAI** (item 10) quando a API mudar; hoje o backend já
   rejeita qualquer modelo fora do catálogo retornado pelo provider.

P2 continua deliberadamente adiado: terceiro provider, `ProviderRegistry` dinâmico, fallback
automático e abstrações adicionais sem necessidade concreta.
