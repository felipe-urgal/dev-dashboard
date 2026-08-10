# Próxima atividade

O fechamento da IA multi-provider continua no **PR #295**, seguindo [`AI-MULTI-PROVIDER-FINALIZATION.md`](AI-MULTI-PROVIDER-FINALIZATION.md).

## Estado do fechamento

Concluídos e validados no PR #295:

1. Code Review IA usando `AiProviderResolver`, com provider/modo congelados na execution.
2. APIs genéricas `/ai/status`, `/ai/chat`, `/ai/complete` e `/ai/models/pull` sem bypass silencioso para Ollama.
3. Validação server-side de modelo antes da inferência.
4. Contratos de erro estáveis compartilhados entre provider, resolver, HTTP, SSE e executions.

O **CI #1640** ficou completamente verde após o P0 #4: typecheck, lint, format, build, referência da API, testes e Smoke E2E.

## Atividade atual — P0 #5: segurança de saída cloud

O próximo bloqueador é provar por teste e documentação que conteúdo do projeto só chega a um provider cloud depois das barreiras de consentimento e masking.

### Escopo

1. Testar masking com OpenAI selecionada em:
   - chat;
   - implementation;
   - Code Review por arquivo;
   - síntese global da Code Review;
   - completion.
2. Testar masking de resultados de ferramentas reapresentados ao modelo.
3. Confirmar que API key/headers nunca entram em prompts, eventos ou logs de conteúdo.
4. Garantir que consentimento seja verificado antes do primeiro request que contenha conteúdo do projeto.
5. Testar revogação de consentimento entre duas executions.
6. Testar que status/listagem de modelos não envia conteúdo do projeto.
7. Corrigir `docs/architecture/security.md` e demais `.md` que ainda descrevam a IA como somente local ou afirmem que nenhum conteúdo pode sair do computador.
8. Revisar logs de erro para não persistir prompt, diff, tool result nem credenciais.

## Próximos P0 após segurança

Depois do P0 #5:

1. cancelamento e concorrência;
2. auditoria final de persistência, UI, docs, código órfão e suíte obrigatória.

## Gate obrigatório

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run docs:api:check
npm test
npm run test:e2e
```

Quando schema/rota mudar:

```bash
npm run docs:api
npm run docs:api:check
```

## Critério de conclusão da atividade atual

P0 #5 termina somente quando os caminhos cloud relevantes possuem regressivos de consentimento/masking, credenciais não aparecem em conteúdo/logs, a documentação de segurança reflete o comportamento real e toda a suíte obrigatória fica verde no head correspondente.
