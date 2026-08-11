# Próxima atividade

O fechamento técnico da IA multi-provider está consolidado no **PR #295**, seguindo [`AI-MULTI-PROVIDER-FINALIZATION.md`](AI-MULTI-PROVIDER-FINALIZATION.md).

## Estado atual

Os P0 do fechamento estão implementados:

1. Code Review IA usa `AiProviderResolver`, com provider/modo congelados na execution.
2. APIs genéricas não fazem bypass silencioso para Ollama.
3. Modelo é validado server-side antes da inferência.
4. Erros possuem taxonomia estável em provider/resolver/HTTP/SSE/executions.
5. Saída cloud possui consentimento prévio, masking compartilhado e logs allowlistados.
6. Cancelamento/concorrência preservam estados terminais, propagam abort aos providers e fecham executions no shutdown.
7. P1 foi revisado e classificado entre validado e follow-up não bloqueante.

## Atividade atual — gate final de merge do PR #295

Não há outro bloco funcional obrigatório a implementar antes do merge. Falta somente validar o **head final**, que contém código, testes e documentação reconciliada.

Gate obrigatório:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run docs:api:check
npm test
npm run test:e2e
```

Se esse gate ficar completamente verde, o PR #295 pode ser mergeado.

## Depois do merge

Os itens classificados como follow-up no checklist são hardening incremental e não representam bloqueadores conhecidos do multi-provider atual. Entre eles estão:

- métricas estruturadas de duração/estado terminal das executions;
- ampliação da matriz de regressão do Ollama;
- fault injection específico da persistência atômica;
- stress tests para budgets/tool results grandes;
- eventual UX de fallback `offer` na Code Review;
- evolução da descoberta de modelos da OpenAI quando a API exigir.

P2 continua deliberadamente adiado: terceiro provider, `ProviderRegistry` dinâmico, fallback automático e abstrações adicionais sem necessidade concreta.
