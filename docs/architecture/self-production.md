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

## Base de handoff já implementada

Existe uma primeira base não privilegiada em `scripts/self-update-helper.mjs` + `scripts/self-update-handoff.mjs`. Ela é um processo executável separado do Fastify e implementa somente o protocolo persistente necessário para evoluir o self-update sem matar o coordenador antes de registrar estado.

O helper atual possui catálogo fechado de operações:

```text
prepare
claim
inspect
recover
```

Ele **não** aplica código, não executa Git, não reinicia API/web, não chama `systemctl`, não usa sudo e não aceita comando/path/unit arbitrário.

O comando pode ser inspecionado localmente com:

```bash
npm run self-update:helper --
```

Nesta fase ele é tooling de engenharia, ainda executado a partir da árvore do repositório. Isso **não** satisfaz o requisito de instalação isolada para uma futura ação privilegiada.

## Protocolo persistente v1

Os handoffs ficam sob:

```text
${DEV_DASHBOARD_STATE_DIR:-~/.local/state/dev-dashboard}/self-update/
```

O diretório é mantido em `0700` e cada JSON em `0600`, com escrita por arquivo temporário + `rename`. O parser aplica shape fechado e limite de tamanho; arquivo não regular, symlink, JSON inválido ou campo extra falha fechado.

Cada handoff registra somente metadados estruturados:

- `version=1`;
- `id` gerado pelo helper;
- `action=self-update` fixa;
- `projectId`;
- `targetRevision`;
- `planHash`;
- estado e timestamps;
- resultado terminal sanitizado quando existir.

O formato **não possui** campo de shell, programa, argumentos, path de checkout, unit systemd ou credencial. O arquivo persistido também não é uma autorização por si só; a instalação/canal autenticado e o catálogo operacional ainda precisam ser implementados antes de qualquer mutação real.

### Estados

O protocolo reconhece:

```text
prepared
  ↓
accepted
  ↓
applying
  ↓
restarting
  ↓
verifying
  ↓
succeeded
```

Falhas depois de o helper assumir o handoff podem terminar em `failed` ou `recovery_required` conforme a etapa. Transições fora do grafo fechado são recusadas.

A entrega atual executa somente até `accepted`. Os estados posteriores já fazem parte do formato para que update/restart/readiness futuros possam persistir progresso sem mudar o contrato durante uma interrupção.

## Recovery já disponível

`recover` examina handoffs que o helper já havia aceitado e que ficaram sem resultado terminal. Esses registros são persistidos como `recovery_required` com código local `SELF_UPDATE_HELPER_INTERRUPTED`.

Um handoff apenas `prepared` não é marcado como interrompido, porque o helper ainda não assumiu sua execução.

Isso torna interrupções diagnosticáveis, mas ainda não implementa rollback nem retoma uma atualização real.

## Blockers que permanecem

### Helper operacional/instalado

A fonte do helper e o protocolo existem, mas ainda falta instalá-lo fora de caminho editável pelo repositório e dar a ele lifecycle próprio para permanecer disponível durante update/restart real.

### Execução de self-update

Ainda falta o catálogo mínimo que aplique uma revision comprovada e reinicie somente os serviços autorizados. Nenhuma dessas ações existe nesta etapa.

### `production-health-not-validated`

Falta readiness pós-restart executada pelo helper com timeout bounded antes de concluir sucesso.

### `privilege-model-not-validated`

Qualquer ação privilegiada precisa de escopo mínimo. O processo Fastify não receberá sudo amplo apenas para permitir self-update.

Os identificadores históricos de blocker no manifesto continuam representando o gate amplo até a integração operacional ser fechada; a existência do scaffold não habilita produção.

## Por que o domínio atual não basta

O motor existente consegue recuperar uma execução interrompida de forma conservadora, mas isso não transforma um restart voluntário da própria API em um fluxo confiável.

```text
API atual coordena
    ↓
handoff é persistido e assumido por processo externo
    ↓
API pode parar sem ser o único dono do estado
    ↓
helper instalado aplica/reinicia/verifica
    ↓
resultado final permanece recuperável
```

A entrega atual cobre somente a persistência e a transferência explícita de ownership. Aplicação, restart e verify pós-restart permanecem bloqueados.

## Condições para habilitar

`production.enabled=true` só pode ser considerado quando houver, no mínimo:

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

Os itens de protocolo/persistência são base necessária, mas não são suficientes isoladamente para abrir o gate.

## Privilégio

Self-update não deve reutilizar a senha sudo do modal nem introduzir uma regra ampla `NOPASSWD` para Fastify.

Se um helper privilegiado for necessário, a autorização deve apontar para uma ação mínima e estável, instalada fora da árvore modificável pelo projeto. O helper não aceita linha de shell arbitrária nem unit/path livre vindo do browser.

O helper desta primeira fase é deliberadamente não privilegiado.

## Recovery

Falha de self-update precisa continuar diagnosticável depois do restart.

O protocolo já distingue ownership aceito e interrupção do helper. A execução futura ainda deverá diferenciar, pelo menos:

- update não iniciado;
- artefato/revision recusados;
- restart iniciado;
- nova API não voltou;
- readiness falhou;
- nova revision validada com sucesso.

Rollback automático só é aceitável se houver prova de que é seguro para o estado local. A regra padrão continua sendo recovery explícito, não reversão cega.

## Relação com as issues

A frente ampla de produção é #482. O trabalho específico de self-production/self-update é rastreado em **#487**.

O PR #505 tornou o contrato fail-closed explícito. A implementação incremental posterior começa pelo handoff/helper não privilegiado; instalação isolada, canal local, aplicação/restart, readiness e privilégio mínimo continuam necessários antes de fechar #487.
