# Self-production do Dev Dashboard

O Dev Dashboard opera produção de outros projetos, mas ainda **não pode atualizar/reiniciar a própria API com segurança** usando o mesmo coordenador.

A razão é estrutural: um deployment é coordenado pela API local. Se essa API executar seu próprio update/restart, o processo que precisa persistir resultado, continuar a timeline, executar readiness e decidir recovery desaparece no meio da operação.

Por isso o contrato do próprio repositório permanece deliberadamente:

```text
production.enabled=false
strategy=disabled
provider=none
```

Esse estado é uma decisão de segurança, não uma ausência de configuração.

## Contrato atual

`.dev-dashboard/production.json` declara o gate de self-production e os blockers. `npm run prod:status` relata o estado; `npm run prod:check` falha de propósito enquanto o gate estiver fechado.

Não existe `prod:deploy` falso e o domínio não deve contornar `strategy=disabled`.

## Blockers

### `external-helper-not-implemented`

Falta um helper/agent separado da API, com lifecycle próprio, capaz de continuar a operação depois que a API atual parar.

### `self-restart-handoff-not-implemented`

Falta um protocolo persistente de handoff contendo pelo menos revision/plano/estado suficiente para o helper retomar e registrar o resultado.

### `production-health-not-validated`

Falta readiness pós-restart executada pelo helper com timeout bounded antes de concluir sucesso.

### `privilege-model-not-validated`

Qualquer ação privilegiada precisa de escopo mínimo. O processo Fastify não receberá sudo amplo apenas para permitir self-update.

## Por que o domínio atual não basta

O motor existente consegue recuperar uma execução interrompida de forma conservadora, mas isso não transforma um restart voluntário da própria API em um fluxo confiável.

```text
API atual coordena
    ↓
API para para ser atualizada
    ↓
coordenador deixa de existir
    ↓
quem aplica/reinicia/verifica/persiste resultado?
```

Sem helper externo, qualquer solução que diga “sucesso” depois de matar o próprio coordenador dependeria de suposição ou processo órfão sem protocolo confiável.

## Condições para habilitar

Um PR futuro só pode mudar `production.enabled=true` quando houver, no mínimo:

1. helper externo separado da API;
2. helper instalado fora de caminho editável pelo repositório quando executar ação privilegiada;
3. catálogo fechado de ações/units/paths;
4. canal local autenticado/restrito;
5. handoff persistido **antes** de parar a API;
6. aplicação/restart que não dependa da API antiga continuar viva;
7. readiness pós-restart com timeout bounded;
8. comprovação da revision realmente aplicada;
9. resultado final persistido/recuperável;
10. modelo de privilégio mínimo auditável;
11. teste real de interrupção/restart/recovery;
12. documentação de instalação, logs e troubleshooting.

## Privilégio

Self-update não deve reutilizar a senha sudo do modal nem introduzir uma regra ampla `NOPASSWD` para Fastify.

Se um helper privilegiado for necessário, a autorização deve apontar para uma ação mínima e estável, preferencialmente instalada fora da árvore modificável pelo projeto. O helper não aceita linha de shell arbitrária nem unit/path livre vindo do browser.

## Recovery

Falha de self-update precisa continuar diagnosticável depois do restart.

O helper deve diferenciar, pelo menos:

- update não iniciado;
- artefato/revision recusados;
- restart iniciado;
- nova API não voltou;
- readiness falhou;
- nova revision validada com sucesso.

Rollback automático só é aceitável se houver prova de que é seguro para o estado local. A regra padrão continua sendo recovery explícito, não reversão cega.

## Relação com as issues

A frente ampla de produção é #482. O trabalho específico de self-production/self-update é rastreado em **#487**.

O PR #505 torna o contrato fail-closed e sua documentação explícitos, mas **não fecha #487**: helper, handoff, readiness pós-restart e privilégio mínimo continuam trabalho futuro.
