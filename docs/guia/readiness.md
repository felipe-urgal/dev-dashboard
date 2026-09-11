# Release Readiness

A aba **Readiness** consolida evidências verificáveis da branch antes de uma entrega. Ela é somente leitura e não executa ações de Git ou produção.

## Checklist de entrega

A tela apresenta os quatro domínios nesta ordem:

1. **Git** — estado da branch e sincronização.
2. **Testes** — evidência de uma execução completa comparável.
3. **Doctor** — saúde geral do projeto.
4. **Migrations** — estado conhecido das migrations.

No topo aparece a conclusão consolidada e o horário em que o snapshot foi gerado. Cada etapa mostra estado, resumo, evidência, horário observado e um atalho para a ferramenta responsável.

Os atalhos levam para Sincronização, Testes, Doctor ou Migrations. Readiness apenas apresenta a evidência; a ação continua pertencendo ao domínio correspondente.

## Estados

- **Pronto**: a evidência disponível não apresenta impedimento conhecido.
- **Atenção**: não há bloqueio determinístico, mas existe um ponto a revisar.
- **Bloqueado**: existe um bloqueio verificável antes da entrega.
- **Inconclusivo**: faltam evidências suficientes para classificar o domínio com segurança.

O estado geral vem do backend. A interface não transforma ausência de evidência em sucesso.

## Carregamento e falhas

Durante a consulta, a tela informa que os quatro domínios estão sendo verificados. Em caso de falha, o erro permanece explícito e a interface oferece nova tentativa.

## API

A web consulta `GET /api/projects/:projectId/release-readiness`. O snapshot contém `state`, `generatedAt` e `checks`; cada check traz identificação, estado, resumo, evidência, horário observado e destino de navegação.