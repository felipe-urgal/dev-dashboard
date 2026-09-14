# Dev Dashboard — 01 Discovery

Overlay local do papel `01-discovery`. O protocolo global permanece no `agent-orchestrator`.

Para o Dev Dashboard:

- confirme primeiro o comportamento real em código, testes, PRs abertos e documentação do domínio afetado;
- identifique se a demanda pertence à CLI Bash, Dashboard Vue, API, package compartilhado ou domínio de produção antes de propor solução;
- não sincronize CLI e web automaticamente: preserve a independência das duas interfaces quando o produto não exigir equivalência;
- em UI, use “simples, ágil e funcional” para remover redundância e evitar telas, filtros ou estados sem necessidade concreta;
- em produção, descubra estratégia (`command`, `git-managed` ou `self-update`), autoridade e recovery antes de fechar requisitos;
- critérios de sucesso devem ser observáveis e não podem tratar CI, teste local ou validação manual como evidências equivalentes.