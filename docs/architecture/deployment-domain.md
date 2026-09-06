# Domínio de deployment

O domínio de deployment é separado do `process-manager`. Ele transforma um `Production Contract v1` válido em plano, confirmação, execução, timeline e recovery sem transformar processos de desenvolvimento em deployments nem ensinar a UI sobre detalhes de infraestrutura.

Estratégias operacionais atuais:

- `strategy=command`;
- `strategy=git-managed` + Vercel;
- `strategy=self-update` do próprio Dev Dashboard.

`strategy=disabled` permanece sem mutação.

## Fronteira arquitetural

```text
ProjectStore
    ↓
ProductionContractV1
    ↓
resolver branch/revision
    ↓
DeploymentPlanner
    ├─ DeploymentPlan
    └─ planHash
    ↓
DeploymentConfirmationService
    ↓ token de uso único
DeploymentService
    ├─ ProductionCommandAdapter
    ├─ VercelDeploymentAdapter
    ├─ OriginRevisionResolver
    ├─ SelfUpdateHandoffService
    └─ DeploymentStore
```

O adapter responsável muda conforme a estratégia; planner, confirmação, persistência, timeline e regras conservadoras de recovery continuam compartilhados.

## Planejamento e confirmação

Gerar plano é somente leitura.

Para uma estratégia mutável, o backend resolve o projeto e o Production Contract, valida o contexto Git exigido e produz um plano determinístico com branch/revision/etapas/provider.

A confirmação:

- possui TTL curto;
- é de uso único;
- fica vinculada a `projectId + revision + planHash`;
- não é persistida.

`start()` recalcula/revalida o plano. Mudança de contrato, checkout, revision ou etapas torna a autorização stale.

## `strategy=command`

Executa somente scripts `prod:*` canônicos do projeto por package manager reconhecido, com `cwd=Project.path`, `shell: false`, stdin fechado e logs limitados/mascarados.

Timeline típica:

```text
prepare? → check → backup? → migrate? → deploy → verify
```

A infraestrutura física permanece escondida atrás do projeto consumidor. O Dashboard não interpreta se `prod:deploy` usa systemd, Docker Compose ou outro mecanismo.

### Ambiente

`prepare`/`check` podem usar:

```text
.dev-dashboard/.env.check.local
```

Etapas locais que realmente consultam/alteram produção podem usar:

```text
.dev-dashboard/.env.production.local
```

`prod:check` não recebe o arquivo de produção. `provider-deploy` também não.

Quando `CHECK_DATABASE_URL` existe no ambiente de check, o backend pode promovê-lo para `DATABASE_URL` no processo filho correspondente.

### Diagnóstico de check

O código estável `P1001` do Prisma em `prod:check` pode virar `DEPLOYMENT_CHECK_DATABASE_UNAVAILABLE` com mensagem sanitizada. Isso não concede ao Dashboard autoridade para iniciar o banco.

## `strategy=git-managed` + Vercel

A promoção externa é uma etapa tipada, nunca um `prod:deploy` artificial:

```text
prepare? → check → migrate? → provider-deploy → verify
```

Imediatamente antes de `provider-deploy`, o backend consulta diretamente:

```text
origin/<production.branch>
```

e exige o SHA confirmado no plano. A Vercel recebe a revision exata e a origem GitHub resolvida pelo backend.

O browser não escolhe owner/repo/ref/SHA ou token.

`READY` conclui a etapa do provider, não health funcional; `prod:verify` continua separado.

Leituras de status/drift podem usar a ref remota local conhecida e não fazem `git fetch`. Isso é diferente da prova remota forte usada para autorizar a mutação.

## `strategy=self-update`

A self-production do Dev Dashboard reutiliza o mesmo planner/confirmação/store, mas a etapa irreversível é transferida para um agent/worker independente da API antiga.

Plano fixo:

```text
check → self-update
```

Sequência operacional:

```text
resolver origin/main
      ↓
confirmar planHash/revision
      ↓
prepare + claim do handoff
      ↓
spawn do worker instalado
      ↓
provar execution.lock/PID
      ↓
shutdown controlado da API antiga
      ↓
revalidar checkout + origin/main + fast-forward
      ↓
git merge --ff-only <targetRevision>
      ↓
restart
      ↓
/api/health + x-dev-dashboard-revision
      ↓
reconciliação do deployment
```

A API antiga só encerra depois que ownership externo foi comprovado.

### Runtime instalado

Quando `local:install` comprova uma instalação gerenciada para a mesma checkout, o restart deve retornar o runtime à unit fixa:

```text
dev-dashboard.service
```

A delegação é `systemd --user`, sem root, e exige metadados + marcador de ownership do instalador. Nome de unit/path/comando não vêm do browser.

A falha operacional atual desse handoff está rastreada em **#659**: o redeploy pode deixar de propagar a raiz necessária para o `dev-web` reconhecer a instalação, exigindo recuperação manual por `systemctl --user restart dev-dashboard.service`. Até a correção, esse caso não pode ser interpretado como deployment concluído.

Detalhes em [`self-production.md`](self-production.md).

## Concorrência

Existe no máximo um deployment mutável ativo globalmente. A regra inclui self-update: ele também possui efeitos sobre recursos locais compartilhados e sobre a própria API.

Leituras de status não ocupam esse slot.

## Cancelamento

- etapas locais `command`: TERM e escalada bounded para KILL;
- `provider-deploy`: interrompe acompanhamento e tenta cancelamento remoto best-effort quando suportado;
- `self-update`: depois que o worker assume ownership e a API antiga entrega a operação, não existe cancelamento fingido pela API antiga.

## Irreversibilidade e recovery

Estados terminais relevantes:

```text
succeeded
failed
cancelled
recovery_required
```

Antes de uma etapa irreversível, falha/cancelamento pode terminar normalmente. Depois que migration, promoção externa ou aplicação de self-update começou, incerteza relevante pode exigir `recovery_required`.

O domínio não executa rollback cego.

Se a API reiniciar durante uma operação, o store reconcilia o que pode ser comprovado. No self-update, o resultado do handoff/agent é usado para restaurar o estado; ausência de evidência nunca cria sucesso.

## Retry de verify

Para `command`/`git-managed`, quando todas as mutações anteriores terminaram e somente o `verify` final falhou, o backend pode repetir **somente `prod:verify`** se contrato, timeline e revision ainda comprovarem um caso seguro.

Self-update não possui `prod:verify` local; sua prova final é readiness + revision.

## Credenciais e logs

Vercel usa configuração local do processo:

```text
VERCEL_TOKEN
VERCEL_TEAM_ID
```

Self-update usa token próprio do agent.

Nenhum desses valores pertence ao manifesto ou ao request do browser.

Logs locais passam por limites/masking. Corpos brutos de provider não viram contrato público ou log operacional por padrão.

## Persistência

Deployments:

```text
${DEV_DASHBOARD_STATE_DIR:-~/.local/state/dev-dashboard}/deployments/
```

Self-update mantém também estado/handoff/locks privados próprios.

Tokens de confirmação, senha sudo e credenciais de provider não são persistidos no deployment.

## Sudo

Sudo pertence somente a etapas `strategy=command` que realmente precisem de privilégio e usem a fronteira já prevista. A senha não é persistida nem encaminhada ao script de produção.

Self-update do Dev Dashboard não usa sudo/root. A integração de instalação permanente é `systemd --user`.

## API

As rotas privadas de deployment cobrem plano, confirmação, start, histórico/detalhe/log, status, cancelamento e retry de verify quando aplicável.

A referência exata e atualizada é gerada em [`api-reference.md`](api-reference.md); não mantenha uma segunda lista manual de endpoints aqui.

## Invariantes

Mudanças no domínio precisam preservar:

1. branch/revision/plano resolvidos pelo backend;
2. confirmação forte vinculada ao plano;
3. aliases locais fechados;
4. provider externo sem autoridade vinda da UI;
5. prova remota antes de promoção git-managed;
6. provider `READY` separado de health;
7. irreversibilidade/recovery explícitos;
8. credenciais fora de contratos/logs/persistência;
9. um único lifecycle mutável global;
10. self-update sem executor remoto genérico;
11. ownership externo antes do shutdown da API antiga;
12. sucesso de self-update somente com proof-of-revision.
