# Próxima atividade

Após o merge do **PR #293 — hardening da arquitetura multi-provider**, executar o plano de fechamento em [`AI-MULTI-PROVIDER-FINALIZATION.md`](AI-MULTI-PROVIDER-FINALIZATION.md).

## Atividade atual — Code Review IA multi-provider

O primeiro bloqueador é fazer a **Code Review IA** usar a mesma seleção por projeto já usada pelo Assistente/implementation.

### Escopo

1. Resolver o provider selecionado no início da Code Review.
2. Revalidar disponibilidade e consentimento cloud antes de iniciar.
3. Congelar a instância do provider e o modo durante toda a execution.
4. Garantir que revisão por arquivo e síntese global usem o mesmo provider.
5. Registrar `provider` e `mode` no contrato/snapshot HTTP da Code Review.
6. Fazer o endpoint one-shot de AI review obedecer ao resolver ou removê-lo se estiver sem consumidor.
7. Exibir provider/modo usados na UI sem duplicar configuração desnecessária.
8. Cobrir Ollama, OpenAI autorizado, falta de consentimento, indisponibilidade e troca de seleção durante execução.
9. Atualizar documentação e referência da API.

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

Quando schema/rota mudar, executar `npm run docs:api` antes de `npm run docs:api:check`.

## Critério de conclusão

A atividade termina quando a Code Review usa o provider selecionado de forma consistente, a execution identifica provider/modo usados, mudanças de seleção posteriores não alteram uma revisão em andamento e toda a suíte obrigatória está verde.
