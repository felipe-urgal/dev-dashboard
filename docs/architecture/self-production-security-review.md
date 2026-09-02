# Security review — self-production

A revisão final do PR D conclui que `strategy=self-update` pode ser habilitada sem ampliar o modelo de privilégio do Dev Dashboard.

## Decisão

O fluxo suportado permanece integralmente user-space:

- checkout, Git e runtime pertencem ao mesmo usuário;
- agent, token, socket e estado vivem em diretórios privados do usuário;
- a aplicação é somente `git merge --ff-only` da revision confirmada de `origin/main`;
- o restart executa somente o entrypoint fixo `scripts/dev-web.mjs`;
- não há `sudo`, `systemctl`, unit configurável, shell arbitrário ou path recebido do browser.

Portanto, `privilege-model-not-validated` está encerrado sem introduzir root. Se uma futura forma de instalação exigir serviço de sistema, ela precisará de uma nova revisão de ameaça e de uma ação privilegiada mínima, separada do contrato v1.

## Fronteiras revisadas

### Browser → deployment

O browser continua limitado a `projectId`, `planHash` e token de confirmação. Branch e SHA são resolvidos pelo backend. Para self-update, o target é obtido diretamente de `origin/main`.

### Deployment → handoff

A etapa `self-update` não passa pelo adapter de comandos. O handoff usa ID determinístico derivado do deployment e carrega somente `projectId`, `targetRevision` e `planHash` já confirmados.

### API → agent

O canal remoto do agent continua fechado em `ping`, `inspect`, `claim` e `recover`. O browser não controla programa, argv, checkout, URL, unit ou credencial.

### Agent → worker

`execute <handoff-id>` é local e só aceita um handoff previamente persistido/assumido. Antes do shutdown da API, o worker precisa comprovar ownership exclusivo via lock privado e PID esperado.

### Worker → checkout/runtime

Antes da mutação são exigidos owner local, checkout real, working tree limpa, branch `main`, `origin/main` exata e fast-forward. Depois do restart, health sem proof-of-revision não gera sucesso.

## Resultado

A revisão não identificou necessidade de nova autoridade privilegiada. A habilitação permanece fail-closed nos pontos em que contrato, agent, revision, ownership, fast-forward, restart ou readiness não possam ser comprovados.

A descrição operacional completa está em `docs/architecture/self-production.md`.
