# Self-production do Dev Dashboard

O Dev Dashboard possui um domínio para operar produção de **outros** projetos, mas ainda não pode usar esse mesmo processo para reiniciar a própria API com segurança.

A razão é estrutural: um deployment `command` é coordenado pela API local. Se essa API executar seu próprio update/restart, o coordenador desaparece no meio da execução e não consegue persistir com confiança o resultado final, executar verify pós-restart ou decidir recuperação.

Por isso `.dev-dashboard/production.json` permanece `enabled=false`, `strategy=disabled` e `provider=none` até existir um mecanismo externo.

## Blockers

- `external-helper-not-implemented`: falta um helper/agent separado da API, com lifecycle próprio.
- `self-restart-handoff-not-implemented`: falta handoff persistente para o helper continuar a execução durante o restart da API.
- `production-health-not-validated`: falta health/readiness pós-restart usado pelo helper antes de concluir a atualização.
- `privilege-model-not-validated`: qualquer operação privilegiada precisa de escopo mínimo; não será dado sudo amplo ao processo Fastify.

## Contrato atual

`npm run prod:status` apenas relata o bloqueio. `npm run prod:check` falha de propósito. Não existe `prod:deploy` falso e o domínio de deployment não deve contornar esse gate.

## Condições para habilitar

Um PR futuro só pode mudar para produção habilitada quando houver, no mínimo:

1. helper externo com binário/script instalado fora de caminho editável pelo repositório quando executar ações privilegiadas;
2. protocolo de handoff contendo project/revision/plan persistidos;
3. restart/update que não dependa da API continuar viva;
4. health/readiness pós-restart com timeout bounded;
5. registro final de sucesso/falha recuperável;
6. modelo de privilégio mínimo auditável;
7. teste real de interrupção/restart;
8. documentação de instalação, logs e recuperação.

Essa restrição implementa a fase de self-update já registrada em `#482`; ela não deve ser removida apenas para fazer o próprio projeto aparecer como “produção pronta”.
