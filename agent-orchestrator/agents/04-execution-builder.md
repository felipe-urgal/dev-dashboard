# Dev Dashboard — 04 Execution Builder

Overlay local do papel `04-execution-builder`. Não replique neste arquivo o protocolo global do workflow.

Para o Dev Dashboard, o prompt de execução deve:

- citar `AGENTS.md`, `docs/DEVELOPMENT.md`, `docs/architecture/overview.md` e somente a documentação especializada necessária ao domínio alterado;
- explicitar a interface/owner afetado e evitar sincronização automática entre CLI Bash e web;
- usar `npm run check` como gate base de mudanças normais;
- acrescentar `npm run test:cli`, `npm run docs:api && npm run docs:api:check`, `npm run typecheck`, `npm run test:e2e` ou `npm run prod:check` conforme o risco real;
- separar teste local, CI remoto e validação manual como evidências diferentes;
- em produção, registrar estratégia, `planHash`/alvo, revalidação, proof-of-revision e recovery aplicáveis;
- nunca converter ausência de checkout/shell em autorização para escrita remota.