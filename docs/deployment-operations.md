# Operação de deployments

Este guia cobre a operação de projetos com `Production Contract v1` válido e `production.enabled=true`.

O domínio suporta três estratégias operacionais:

- `strategy=command`: scripts `prod:*` canônicos do projeto;
- `strategy=git-managed` + `provider=vercel`: etapas locais + `provider-deploy` na Vercel;
- `strategy=self-update`: fluxo fechado usado somente pelo próprio Dev Dashboard.

Detalhes: [Production Contract](architecture/production-contract.md), [Domínio de deployment](architecture/deployment-domain.md) e [Segurança](architecture/security.md).

## Fluxo comum

Preparar um plano não executa mutação.

```text
Preparar deployment
        ↓
revisar projeto + branch + revision + etapas
        ↓
Confirmar e iniciar
        ↓
revalidar plano/revision
        ↓
executar a estratégia
        ↓
succeeded | failed | cancelled | recovery_required
```

A confirmação é de uso único e vinculada a `projectId + revision + planHash`. Mudança de checkout, contrato, revision ou plano invalida a confirmação anterior.

Não limpe working tree, descarte arquivos ou force branch apenas para liberar produção.

## Ambientes locais do projeto

Há duas fronteiras distintas:

```text
<projeto>/.dev-dashboard/.env.check.local
<projeto>/.dev-dashboard/.env.production.local
```

### `.env.check.local`

É usado pelo ambiente de check/testes. Quando `CHECK_DATABASE_URL` existe, o backend pode promovê-lo para `DATABASE_URL` no processo filho correspondente.

`prod:check` pode receber esse ambiente de check, mas continua isolado de `.env.production.local`. Assim o preflight não ganha credenciais de produção apenas porque faz parte de um deployment.

### `.env.production.local`

É opcional e destinado às etapas locais que realmente consultam ou alteram produção, como migration/verify conforme o contrato.

Regras:

- path fixo derivado de `Project.path`;
- somente arquivo regular;
- limite de 64 KiB;
- conteúdo não é retornado pela API;
- mantenha fora do Git e com permissões locais restritas;
- `provider-deploy` não recebe esse arquivo;
- `prod:check` não recebe esse arquivo.

Credenciais do provider continuam no ambiente do Dev Dashboard. `VERCEL_TOKEN`, por exemplo, não pertence ao projeto alvo nem ao `production.json`.

Mais detalhes: [project-local-environments.md](project-local-environments.md).

## `strategy=command`

Providers locais como systemd ou Docker Compose ficam encapsulados pelos scripts do próprio projeto. O Dashboard executa somente aliases canônicos reconhecidos, por exemplo:

```text
prod:check
prod:backup
prod:migrate
prod:deploy
prod:verify
```

A timeline depende das políticas declaradas:

```text
check → backup? → migrate? → deploy → verify
```

O Dashboard não interpreta os comandos internos de `systemctl`, `docker compose` ou outro mecanismo do projeto.

Se `prod:check` falhar com o código estável `P1001` do Prisma, o domínio pode classificá-lo como `DEPLOYMENT_CHECK_DATABASE_UNAVAILABLE` e mostrar orientação sanitizada. O Dashboard não inicia o banco automaticamente.

## `strategy=git-managed` + Vercel

Não existe `prod:deploy` local artificial. A promoção é uma etapa explícita:

```text
check → migrate? → provider-deploy → verify
```

Antes de criar o deployment, o backend consulta diretamente `origin/<production.branch>` e exige que o SHA continue igual à revision confirmada.

A Vercel recebe:

```text
target = production
project = production.external.project
repo = origem GitHub resolvida pelo backend
ref = production.branch
sha = revision confirmada
```

O browser não escolhe owner/repo/ref/SHA nem recebe o token.

### Credenciais Vercel

Na configuração local do Dev Dashboard:

```dotenv
VERCEL_TOKEN=...
# opcional quando necessário
VERCEL_TEAM_ID=team_...
```

Sem token, a integração fica `not-configured` e a mutação permanece bloqueada.

### `READY` não é health

Estados do provider são normalizados e acompanhados até terminal. `READY` conclui `provider-deploy`, mas `prod:verify` continua sendo a prova funcional quando declarada.

A leitura de status/drift não faz `git fetch`; a prova forte da revision ocorre imediatamente antes da mutação externa.

## `strategy=self-update`

É exclusiva da produção do próprio Dev Dashboard:

```text
production.enabled=true
strategy=self-update
provider=none
branch=main
```

O plano é:

```text
check → self-update
```

A mutação:

1. resolve e confirma `origin/main`;
2. prepara handoff persistente;
3. transfere ownership para o agent/worker instalado fora da checkout;
4. encerra a API antiga somente após ownership comprovado;
5. aplica `git merge --ff-only <targetRevision>`;
6. reinicia o runtime;
7. exige `/api/health` saudável e `x-dev-dashboard-revision` igual à revision alvo;
8. reconcilia o deployment após o restart.

Não existe `npm run prod:deploy` para essa estratégia. `self-update:*` é tooling de engenharia e não bypass da confirmação normal.

A operação completa está em [PRODUCTION.md](PRODUCTION.md) e [architecture/self-production.md](architecture/self-production.md).

### Instalação local gerenciada por systemd

Quando `local:install` está ativo para a mesma checkout, o runtime permanente pertence à unit fixa:

```text
dev-dashboard.service
```

A integração é `systemd --user`, sem `sudo`, e só aceita a unit marcada/registrada pelo instalador.

O handoff do worker propaga a revision alvo e a raiz canônica da checkout já validada. `dev-web.mjs` só delega o restart quando a raiz real coincide com a instalação registrada e o marcador de ownership da unit é válido:

```text
systemctl --user restart dev-dashboard.service
```

Depois do restart, `/api/health` e `x-dev-dashboard-revision` continuam sendo obrigatórios. Se o runtime não voltar, diagnostique a causa antes de repetir o deployment; um restart manual pode recuperar a disponibilidade, mas não deve fabricar `succeeded` sem reconciliação do handoff.

## Cancelamento e irreversibilidade

Antes de qualquer etapa irreversível, falha/cancelamento pode terminar normalmente como `failed`/`cancelled`.

Depois que migration, promoção externa ou self-update iniciou efeito real, incerteza relevante pode resultar em:

```text
recovery_required
```

Não existe rollback cego genérico.

No self-update, depois que o worker assume ownership, a API antiga não oferece cancelamento como se ainda fosse dona da operação.

## Verify falhou depois da promoção

Para `command`/`git-managed`, quando somente o `verify` final falhou e o backend comprova que o contexto continua seguro, a UI pode oferecer **Verificar novamente**.

Esse fluxo repete apenas `prod:verify`; não repete check, backup, migration, deploy local ou `provider-deploy`.

## Concorrência

Existe no máximo um deployment mutável ativo globalmente. Leituras de status não ocupam esse slot.

Não encerre a API para contornar concorrência: uma mutação interrompida pode exigir recovery.

## Persistência

Deployments ficam sob:

```text
${DEV_DASHBOARD_STATE_DIR:-~/.local/state/dev-dashboard}/deployments/
```

O estado é privado e limitado. Tokens de confirmação, senha sudo e `VERCEL_TOKEN` não são persistidos.

Self-update mantém também handoff/locks sob o estado privado do Dashboard e agent instalado fora da checkout.

## Diagnóstico rápido

Para projetos comuns:

```bash
git status --short --branch
git remote -v
```

Para Vercel, valide configuração local sem imprimir o token e, quando necessário, confira a branch remota com `git ls-remote`.

Para o próprio Dashboard instalado:

```bash
npm run local:status
npm run prod:status
npm run prod:check
curl -i http://127.0.0.1:4343/api/health
```

## Limites atuais

O domínio não:

- faz `git push` automaticamente para liberar um plano;
- cria commit artificial para disparar provider;
- considera `READY` equivalente a health;
- executa rollback Vercel cego;
- transforma `self-update:*` em executor remoto genérico;
- oferece atualização transacional global entre providers.
