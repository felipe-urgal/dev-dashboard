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

## Handoff persistente

`scripts/self-update-helper.mjs` + `scripts/self-update-handoff.mjs` implementam o protocolo persistente v1 usado para transferir ownership de uma futura atualização para um processo externo.

O helper de handoff possui catálogo fechado:

```text
prepare
claim
inspect
recover
```

Ele não aplica código, não executa Git, não reinicia API/web, não chama `systemctl`, não usa sudo e não aceita comando/path/unit arbitrário.

Os handoffs ficam sob:

```text
${DEV_DASHBOARD_STATE_DIR:-~/.local/state/dev-dashboard}/self-update/
```

O diretório é mantido em `0700` e cada JSON em `0600`, com escrita por arquivo temporário + `rename`. O parser aplica shape fechado e limite de tamanho; arquivo não regular, symlink, JSON inválido, permissão aberta ou campo extra falha fechado.

Cada handoff registra somente metadados estruturados:

- `version=1`;
- `id` gerado pelo helper;
- `action=self-update` fixa;
- `projectId`;
- `targetRevision`;
- `planHash`;
- estado e timestamps;
- resultado terminal sanitizado quando existir.

O formato não possui shell, programa, argumentos, path de checkout, unit systemd ou credencial. O arquivo persistido também não concede autorização por si só.

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

## Agent instalado e lifecycle próprio

`scripts/self-update-agent.mjs` adiciona a segunda camada: uma cópia instalada fora da árvore do repositório, com processo próprio e canal local restrito.

O fluxo operacional atual é:

```bash
npm run self-update:agent -- install
npm run self-update:agent -- start
npm run self-update:agent -- status
npm run self-update:agent -- stop
```

A instalação padrão fica em:

```text
~/.local/lib/dev-dashboard/self-update-agent/
```

Cada instalação usa uma release identificada por SHA-256 dos arquivos do agent. O manifesto `current.json` registra os hashes esperados; antes de iniciar, todos os arquivos são revalidados como regulares, não symlinkados, privados e com hash íntegro.

O modo interno `serve` recusa execução quando o entrypoint não é exatamente a release instalada apontada pelo manifesto. Assim, um processo de longa duração não executa diretamente os arquivos mutáveis da checkout do projeto.

O processo é iniciado com `spawn(process.execPath, [...], { shell: false, detached: true })` e permanece independente do Fastify. Reiniciar API/web não encerra o agent. `stop` consulta primeiro o próprio agent por canal autenticado e só então sinaliza o PID retornado por essa instância.

Esta instalação ainda é **user-space e não privilegiada**. Ela resolve isolamento em relação ao repositório e lifecycle, mas não é uma autorização para ações root nem substitui uma futura revisão de privilégio mínimo.

## Canal local autenticado

O agent escuta apenas em Unix socket local. Por padrão:

```text
$XDG_RUNTIME_DIR/dev-dashboard/self-update-agent/agent.sock
```

Quando `XDG_RUNTIME_DIR` não existe, o runtime usa um diretório privado local definido pela implementação. O diretório fica `0700` e o socket `0600`.

Além da permissão do socket, o protocolo exige um token aleatório próprio do agent em:

```text
${DEV_DASHBOARD_CONFIG_DIR:-~/.config/dev-dashboard}/self-update-agent-token
```

O token usa `0600`, não é persistido no handoff, não aparece em resposta e é comparado em tempo constante. Ele é separado do token HTTP da API para não misturar autoridades.

Cada conexão aceita exatamente uma request JSON limitada. O protocolo v1 possui shape fechado e o catálogo remoto atual é somente:

```text
ping
inspect
claim
recover
```

Nenhuma request pode fornecer shell, programa, argumentos, unit, path de instalação, path de checkout ou credencial. As mutações (`claim`/`recover`) são serializadas pelo agent para evitar corrida sobre o mesmo estado persistido.

`ping` expõe apenas estado operacional, PID, ID da instância, hash da release e catálogo suportado. Paths locais e token não fazem parte da resposta.

## Recovery já disponível

Ao iniciar, o agent executa recovery conservador antes de aceitar novas requests. Handoffs que já estavam sob ownership externo (`accepted`, `applying`, `restarting` ou `verifying`) e não possuem resultado terminal são persistidos como `recovery_required` com código `SELF_UPDATE_HELPER_INTERRUPTED`.

Um handoff apenas `prepared` não é marcado como interrompido, porque o agent ainda não havia assumido sua execução.

Isso torna reinício/crash do agent diagnosticável, mas ainda não implementa rollback nem retoma uma atualização real.

## O que continua bloqueado

### Aplicação e restart reais

O catálogo remoto não contém operação para aplicar revision, executar Git, trocar artefato ou reiniciar serviço. Também não existe unit/path operacional recebido do cliente.

A próxima etapa da #487 precisa definir um catálogo mínimo e fixo para o próprio Dev Dashboard e provar que o update/restart continua depois que a API antiga parar.

### `production-health-not-validated`

Ainda falta readiness pós-restart executada pelo agent com timeout bounded antes de concluir sucesso.

### `privilege-model-not-validated`

Qualquer ação privilegiada precisa de escopo mínimo. O processo Fastify não receberá sudo amplo apenas para permitir self-update.

Se uma etapa privilegiada for inevitável, ela deve apontar para uma ação mínima instalada fora da árvore modificável do projeto, sem aceitar unit/path/comando livre.

## Por que o domínio atual não basta

O desenho alvo é:

```text
API atual coordena
    ↓
handoff é persistido
    ↓
agent instalado assume ownership por canal local autenticado
    ↓
API pode parar sem ser o único dono do estado
    ↓
agent aplica/reinicia/verifica
    ↓
resultado final permanece recuperável
```

As duas primeiras entregas cobrem persistência, ownership, instalação isolada, lifecycle e canal. Aplicação, restart e verify pós-restart continuam bloqueados.

## Condições para habilitar

`production.enabled=true` só pode ser considerado quando houver, no mínimo:

1. helper/agent externo separado da API;
2. helper instalado fora de caminho editável pelo repositório;
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

Os itens 1–4 possuem agora uma base concreta, mas o catálogo ainda não contém ações de update/restart e o gate continua fechado.

## Privilégio

Self-update não deve reutilizar a senha sudo do modal nem introduzir uma regra ampla `NOPASSWD` para Fastify.

O agent atual roda com o mesmo usuário e não possui ação privilegiada. Uma futura integração com systemd/root precisa ser tratada como nova fronteira de segurança e revisada antes de habilitar o contrato.

## Recovery

Falha de self-update precisa continuar diagnosticável depois do restart.

A execução futura ainda deverá diferenciar, pelo menos:

- update não iniciado;
- artefato/revision recusados;
- restart iniciado;
- nova API não voltou;
- readiness falhou;
- nova revision validada com sucesso.

Rollback automático só é aceitável se houver prova de que é seguro para o estado local. A regra padrão continua sendo recovery explícito, não reversão cega.

## Relação com as issues

A frente ampla de produção é #482. O trabalho específico de self-production/self-update é rastreado em **#487**.

O PR #505 tornou o contrato fail-closed explícito. O PR #520 adicionou protocolo/handoff e helper não privilegiado. A entrega seguinte adiciona instalação/lifecycle/canal, mantendo aplicação/restart/readiness e privilégio mínimo como blockers antes de fechar #487.
