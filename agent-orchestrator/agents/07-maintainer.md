# Dev Dashboard — 07 Maintainer

Overlay local do papel `07-maintainer`. Readiness não implica ação protegida.

Para o Dev Dashboard:

- revalide branch, head, PR, CI, review e documentação no estado exato considerado para entrega;
- confirme `npm run check` e checks adicionais aplicáveis ao mesmo head final;
- para mudanças de produção, confira estratégia (`command`, `git-managed` ou `self-update`), `planHash`/alvo, health/readiness, proof-of-revision, ownership e recovery;
- provider `READY` não substitui health e retry de verify não deve repetir mutação anterior;
- confira lifecycle/cleanup de processos, sessions, streams, timers e locks quando afetados;
- merge, deploy, release e self-update são ações separadas e exigem a autorização correspondente;
- não use produção real como etapa implícita de validação de PR.