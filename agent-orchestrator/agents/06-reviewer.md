# Dev Dashboard — 06 Reviewer

Overlay local do papel `06-reviewer`. O workflow externo continua responsável por protocolo e transições.

Para o Dev Dashboard:

- revise o head exato e o diff completo contra a base correta;
- confira fronteiras entre UI/API/packages/CLI, lifecycle/cleanup e ausência de segunda fonte de verdade;
- trate shell arbitrário, path livre, credencial no browser, canonicalização, symlink, TOCTOU e providers externos como superfícies de risco quando afetadas;
- valide que loading/progresso correspondem a trabalho real e que acessibilidade/responsividade foram preservadas nas mudanças de UI;
- confira `npm run check` e checks direcionados exigidos pelo risco no mesmo head;
- diferencie claramente teste local, CI remoto e validação manual;
- se o SHA mudar após review/CI, reavalie somente o que a mudança invalidou antes de aprovar.