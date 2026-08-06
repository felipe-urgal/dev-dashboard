# Próxima atividade

Nenhuma entrega sequencial está aprovada no momento.

A task mais recente concluída foi a **118 — Mede cobertura e define metas
por camada** (ver `tasks/118-test-coverage-thresholds.md`): política de
ratchet (piso = cobertura medida hoje, só sobe), aplicada direto no script
`test` de cada workspace via `--experimental-test-coverage` (Node) e
`@vitest/coverage-v8` (apps/web) — `npm test` já passa a bloquear regressão
de cobertura, sem comando novo pra lembrar.

Para escolher a próxima, veja os itens em aberto em `tasks/PENDENCIAS.md`
— só resta "Executar caso/`describe` específico de teste e persistir
relatórios de cobertura" na lista principal, mais os itens de "CLI Bash" e
"Distribuição, governança e compatibilidade".
