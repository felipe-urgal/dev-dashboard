# Domínio de deployment local

O Dev Dashboard possui um domínio de deployment separado do `process-manager`. Ele existe para transformar um `Production Contract v1` válido em um plano explícito, confirmável e auditável de produção sem ensinar o dashboard sobre systemd, Docker Compose ou outros detalhes internos do projeto.

Nesta versão o motor executa somente contratos `strategy=command`. Home Music (`provider=systemd`) e Loto Lab (`provider=docker-compose`) são os primeiros casos suportados porque ambos escondem seu runtime atrás dos scripts canônicos `prod:*`.

Contratos `git-managed` continuam somente declarativos até o adapter externo correspondente ser implementado. Produção `disabled` continua fail-closed.

## Fronteira arquitetural

O fluxo é deliberadamente separado de processos de desenvolvimento:

```text
ProjectStore
    │
    ▼
ProductionContractV1
    │
    ▼
GitDeploymentRevisionResolver
    │
    ▼
DeploymentPlanner
    │
    ├── plano + planHash
    ▼
DeploymentConfirmationService
    │
    ├── token de uso único
    ▼
DeploymentService
    │
    ├── ProductionCommandAdapter
    └── DeploymentStore
```

O `process-manager` continua responsável por processos como servidor, teste, worker e webpack. Deployment tem semântica diferente: revision imutável, confirmação forte, etapas potencialmente irreversíveis, histórico próprio e recuperação conservadora após interrupção.

## Plano

Gerar um plano não executa nenhum script de produção. O backend:

1. resolve o `Project` já conhecido pelo `ProjectStore`;
2. exige `production.enabled=true`, capability `production` e `strategy=command`;
3. resolve a branch e o SHA Git atuais;
4. exige que o working tree esteja limpo, incluindo arquivos não rastreados;
5. exige que a branch atual seja a branch declarada no contrato;
6. converte políticas e comandos canônicos em uma sequência de etapas;
7. calcula um SHA-256 determinístico do projeto, provider, branch, revision e etapas.

O resultado inclui `projectId`, provider, branch, revision, `planHash`, horário de criação e as etapas planejadas.

### Working tree limpa

O plano é vinculado a uma revision Git, portanto alterações locais fora do commit não podem participar silenciosamente de uma execução confirmada. `GitDeploymentRevisionResolver` usa Git sem shell e recusa o plano com `DEPLOYMENT_WORKTREE_DIRTY` quando `git status --porcelain --untracked-files=normal` retorna qualquer alteração.

A mesma validação ocorre novamente ao iniciar o deployment, porque `start()` recalcula o plano antes de consumir a confirmação. Se o checkout mudar após a confirmação, o hash/revision deixa de corresponder ou o working tree deixa de ser limpo e a execução é recusada.

## Etapas por política

As operações possíveis continuam vindo exclusivamente do catálogo canônico do Production Contract.

Para um projeto com migrations no startup e backup obrigatório, como o Home Music:

```text
check → backup → deploy → verify
```

O `deploy` é marcado como potencialmente irreversível porque a migration pode acontecer dentro da inicialização da aplicação.

Para uma política de migration explícita antes do deploy:

```text
check → backup → migrate → deploy → verify
```

Nesse caso `migrate` é a etapa irreversível. O motor não inventa backup ou migration quando o contrato e as políticas não os declaram.

## Estados

O contrato público de deployment usa os estados:

- `planned`;
- `preparing`;
- `backing_up`;
- `migrating`;
- `deploying`;
- `verifying`;
- `succeeded`;
- `failed`;
- `recovery_required`;
- `cancelled`.

Cada etapa da timeline também registra estado, horários e exit code quando disponível.

## Confirmação

Executar produção exige confirmação separada do planejamento. O token:

- é aleatório, com 32 bytes;
- possui TTL curto;
- é de uso único;
- fica vinculado a `projectId + revision + planHash`;
- não é persistido.

A confirmação não é uma autorização genérica para “fazer deploy”. Mudança de revision, branch, working tree ou plano exige novo planejamento e nova confirmação.

## Adapter `command`

`ProductionCommandAdapter` não recebe programa, argumentos ou `cwd` do navegador.

Para cada etapa ele valida novamente que a operação corresponde ao script canônico reconhecido no contrato, por exemplo:

```text
deploy → prod:deploy
verify → prod:verify
```

O package manager é resolvido localmente pelo backend a partir do `packageManager`/lockfile e a execução assume a forma:

```text
<package-manager> run <script-prod-canônico>
```

com:

- `cwd` igual ao `Project.path` vindo do `ProjectStore`;
- `shell: false`;
- stdin fechado;
- stdout/stderr capturados;
- `SIGTERM` antes de `SIGKILL` em cancelamento;
- nenhum argumento de shell vindo do manifesto ou request.

Por isso o dashboard não precisa saber que `prod:deploy` usa `systemctl` no Home Music ou `docker compose` no Loto Lab.

## Concorrência

A política inicial é conservadora: existe no máximo **um deployment ativo globalmente** no Dev Dashboard.

Isso é mais restritivo que bloquear somente o mesmo projeto, mas evita concorrência entre operações de produção que podem disputar recursos locais, backups ou infraestrutura compartilhada enquanto a visão global ainda não existe. Uma política mais permissiva exige evidência e mudança explícita de contrato.

## Falhas, cancelamento e irreversibilidade

O motor diferencia o ponto da falha:

- falha/cancelamento antes de iniciar qualquer etapa irreversível → `failed` ou `cancelled`;
- falha/cancelamento durante ou depois de uma etapa irreversível → `recovery_required`.

`recovery_required` não executa rollback automaticamente. O Production Contract descreve a política de recuperação, mas a decisão de restaurar backup ou executar rollback continua explícita porque schema/data podem já ter mudado.

Se a API reiniciar enquanto um deployment estava ativo, o `DeploymentStore` recupera o registro como interrompido. Uma etapa irreversível marcada como `running` já conta como iniciada; portanto uma queda no meio de migration/deploy não é rebaixada incorretamente para `failed` comum.

## Logs e persistência

O estado fica fora do repositório, sob o diretório de estado do Dev Dashboard:

```text
${DEV_DASHBOARD_STATE_DIR:-~/.local/state/dev-dashboard}/deployments/
```

O store mantém:

- registros JSON de deployments;
- logs JSON separados;
- histórico limitado por projeto;
- arquivos com permissão `0600` em diretório privado `0700`.

Logs possuem teto de 512 KiB por deployment por padrão e preservam apenas a cauda UTF-8 quando excedem o limite. Todo chunk de stdout/stderr passa por `maskSensitiveLogContent` **antes** da persistência; o store registra também se houve masking e quantas substituições ocorreram.

Tokens de confirmação nunca são persistidos.

## API

As rotas privadas do domínio são:

```text
POST /api/projects/:projectId/deployments/plan
POST /api/projects/:projectId/deployments/confirmations
POST /api/projects/:projectId/deployments
GET  /api/projects/:projectId/deployments
GET  /api/projects/:projectId/deployments/:deploymentId
GET  /api/projects/:projectId/deployments/:deploymentId/log
POST /api/projects/:projectId/deployments/:deploymentId/cancel
```

Todas usam schemas fechados. O browser envia IDs, `planHash` e token de confirmação; nunca envia comando, programa, argumentos, path de projeto ou corpo de script.

## Diagnóstico operacional

Quando o plano for recusado:

- `DEPLOYMENT_PRODUCTION_UNAVAILABLE`: confirme o Production Contract/capability;
- `DEPLOYMENT_STRATEGY_UNSUPPORTED`: o motor local aceita somente `strategy=command`;
- `DEPLOYMENT_BRANCH_MISMATCH`: troque para a branch de produção declarada;
- `DEPLOYMENT_WORKTREE_DIRTY`: faça commit ou descarte todas as mudanças locais, incluindo arquivos não rastreados;
- `DEPLOYMENT_REVISION_UNAVAILABLE`: confirme que o projeto é um repositório Git válido e não está em detached HEAD;
- `DEPLOYMENT_PLAN_STALE`: gere novo plano e nova confirmação;
- `DEPLOYMENT_ALREADY_RUNNING`: aguarde ou cancele conscientemente o deployment ativo.

Quando um histórico terminar em `recovery_required`, consulte a timeline e o log antes de qualquer ação manual. Não repita o deployment automaticamente: primeiro confirme qual etapa irreversível chegou a iniciar e siga a política de backup/rollback do projeto.

## Limites atuais

Esta versão não implementa:

- adapter Vercel/`git-managed`;
- rollback automático;
- execução paralela entre projetos;
- UI de Produção;
- self-update do Dev Dashboard;
- visão global de deployments pendentes.

Esses limites mantêm o primeiro motor de execução pequeno e revisável sem enfraquecer o contrato de segurança.
