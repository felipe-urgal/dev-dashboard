# Próxima atividade

A task 098 concluiu a migração faseada iniciada na task 096: todas as 24
operações do catálogo de mutações Git (`packages/contracts/src/git-mutation-catalog.ts`)
agora passam pelo mesmo mecanismo de confirmação e pelo mesmo histórico
persistente. Ver `docs/tasks/098-git-mutation-risk-policy-completa.md`.

Com isso, a política unificada de risco e histórico Git — item registrado em
`docs/PENDENCIAS.md` desde a auditoria da task 086 — está concluída.

## Escolhendo a próxima entrega

`docs/product/feature-opportunities-2026-08.md` (PR #188) traz uma auditoria
recente de oportunidades ainda sem entrega equivalente, com valor, tamanho,
risco e uma primeira fatia implementável já esboçada para cada uma. Os
candidatos priorizados como P0 são:

- **OPP-01** — Doctor por projeto e onboarding guiado (somente leitura,
  tamanho M, risco baixo);
- **OPP-02** — Conselheiro de impacto após mudanças Git (compara commit
  anterior/novo e recomenda ações, tamanho M, risco baixo);
- **OPP-03** — Gerenciador seguro de Git worktrees (tamanho M/L, risco
  médio);
- **OPP-05** — Inspetor seguro de portas locais (tamanho S/M, risco baixo);
- **OPP-06** — Preflight local antes de push/PR (tamanho M, risco baixo).

Conforme a nota do próprio documento, uma oportunidade só deve virar o plano
detalhado desta seção depois de ser escolhida e ganhar critérios de aceite
completos — isso ainda não foi feito. Ao decidir qual candidata puxar,
substituir esta seção pelo plano detalhado (objetivo, decisão principal,
escopo, critérios de aceite, fora de escopo) seguindo o padrão das entradas
anteriores deste arquivo.
