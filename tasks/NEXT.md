# Próxima atividade

O fechamento da IA multi-provider continua no **PR #295**, seguindo [`AI-MULTI-PROVIDER-FINALIZATION.md`](AI-MULTI-PROVIDER-FINALIZATION.md).

## Estado do fechamento

Concluídos e validados no PR #295:

1. Code Review IA usando `AiProviderResolver`, com provider/modo congelados na execution.
2. APIs genéricas `/ai/status`, `/ai/chat`, `/ai/complete` e `/ai/models/pull` sem bypass silencioso para Ollama.
3. Validação server-side de modelo antes da inferência.

O gate completo ficou verde após o P0 #3.

## Atividade atual — P0 #4: contratos de erro estáveis

O próximo bloqueador é deixar falhas de IA previsíveis para backend, frontend, testes e diagnóstico.

### Escopo

1. Definir códigos estáveis para:
   - consentimento cloud ausente;
   - provider indisponível;
   - modelo incompatível/indisponível;
   - autenticação cloud;
   - quota/billing;
   - rate limit;
   - timeout;
   - cancelamento;
   - resposta/payload inválido;
   - falha upstream não classificada.
2. Evitar converter tudo em `AI_ASSISTANT_INVALID_REQUEST` ou `AI_ASSISTANT_FAILED`.
3. Preservar detalhes úteis do adapter sem vazar credenciais, prompt, diff ou tool results.
4. Manter mensagens da camada genérica provider-neutral quando o detalhe do fornecedor não for necessário.
5. Cobrir o mapeamento com regressivos.
6. Atualizar arquitetura, guias, checklist e referência HTTP quando o contrato mudar.

## Próximos P0 após erros

Depois do P0 #4:

1. segurança de saída cloud;
2. cancelamento e concorrência;
3. auditoria final de persistência, UI, docs e suíte obrigatória.

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

P0 #4 termina somente quando cada classe principal de falha possui comportamento/código previsível, os testes cobrem os mapeamentos e toda a suíte obrigatória fica verde no head correspondente.
