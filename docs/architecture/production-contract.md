# Production Contract v1

O Dev Dashboard reconhece produção como uma capability declarativa. O contrato define **o que pode ser operado** sem transformar o Dashboard em executor genérico da infraestrutura de cada projeto.

Um contrato válido não autoriza mutação sozinho: o domínio de deployment ainda resolve Git, monta o plano, exige confirmação vinculada ao `planHash`, revalida o contexto e executa cada etapa pela camada correta.

## Manifesto

O projeto opta por produção em:

```text
.dev-dashboard/production.json
```

O formato v1 pode declarar:

- `enabled`;
- `strategy`: `command`, `git-managed`, `self-update` ou `disabled`;
- `provider`: `systemd`, `docker-compose`, `vercel` ou `none`;
- `branch`;
- aliases canônicos em `commands`;
- políticas de backup/migrations/rollback;
- health/readiness declarada;
- `external.project` quando o provider externo exige;
- documentação/blockers previstos pelo schema.

Strings obrigatórias vazias ou shapes não reconhecidos falham fechado.

## Operações canônicas

O manifesto não recebe qualquer script do `package.json`. Os aliases reconhecidos são fixos:

| Operação | Script |
| --- | --- |
| `prepare` | `prod:prepare` |
| `status` | `prod:status` |
| `check` | `prod:check` |
| `backup` | `prod:backup` |
| `migrate` | `prod:migrate` |
| `deploy` | `prod:deploy` |
| `verify` | `prod:verify` |
| `restoreCheck` | `prod:restore-check` |
| `rollback` | `prod:rollback` |
| `logs` | `prod:logs` |

O valor precisa corresponder ao alias esperado e o script precisa existir quando a estratégia o exige. O manifesto não contém corpo de script, shell, argv, token ou credencial.

`prod:prepare`, quando declarado, roda imediatamente antes de `prod:check` e usa a fronteira de ambiente de check. O Dashboard não interpreta o que esse hook prepara.

## Ambientes locais

O contrato não carrega valores de environment.

```text
.dev-dashboard/.env.check.local
.dev-dashboard/.env.production.local
```

- `prepare`/`check` podem usar o ambiente de check;
- etapas que realmente consultam/alteram produção podem usar `.env.production.local`;
- `prod:check` não recebe `.env.production.local`;
- `provider-deploy` não recebe o arquivo de produção do projeto;
- credenciais de provider permanecem no processo do Dev Dashboard.

Detalhes: [`../project-local-environments.md`](../project-local-environments.md).

## Estratégias

### `strategy=command`

Usada por projetos que encapsulam a infraestrutura em scripts `prod:*`, inclusive casos em que a implementação física usa systemd ou Docker Compose.

Requisitos mínimos típicos:

- `enabled=true`;
- provider local aceito;
- `prod:status`;
- `prod:check`;
- `prod:deploy`;
- `prod:verify`.

Prepare, backup, migration, logs, restore-check e rollback entram somente quando declarados/compatíveis com as políticas.

Exemplos:

```text
prepare? → check → backup? → deploy → verify
prepare? → check → backup? → migrate → deploy → verify
```

O Dashboard não interpreta o `systemctl`/`docker compose` interno do projeto.

### `strategy=git-managed`

Usada atualmente com Vercel.

Requisitos centrais:

- `enabled=true`;
- `provider=vercel`;
- `external.project`;
- `prod:check`;
- `prod:verify`;
- ausência de `prod:deploy` local;
- `prod:migrate` quando a política exigir migration separada.

A promoção é uma etapa explícita:

```text
prepare? → check → migrate? → provider-deploy → verify
```

Antes de `provider-deploy`, o backend consulta diretamente `origin/<production.branch>` e exige o mesmo SHA confirmado no plano. A Vercel recebe a revision exata, não apenas uma branch móvel.

A leitura de status do provider não substitui essa revalidação forte e `READY` não substitui `prod:verify`.

### `strategy=self-update`

Usada somente pelo próprio Dev Dashboard:

```text
production.enabled=true
strategy=self-update
provider=none
branch=main
commands.status=prod:status
commands.check=prod:check
```

Não existem `prod:deploy`, migrate, backup, rollback ou verify locais nessa estratégia. As políticas correspondentes ficam `not-configured`.

O plano é fechado:

```text
check → self-update
```

A revision alvo vem de `origin/main`. O domínio cria o handoff e transfere a execução ao agent/worker instalado fora da checkout. O browser não escolhe SHA, checkout, programa, argv, unit ou comando.

O worker aplica somente:

```text
git merge --ff-only <targetRevision>
```

Sucesso exige readiness e prova da revision em `x-dev-dashboard-revision`.

#### Instalação local gerenciada

Quando a mesma checkout foi instalada com `npm run local:install`, o runtime permanente pode ser devolvido à unit fixa:

```text
dev-dashboard.service
```

A integração é `systemd --user`, sem `sudo`/root, e somente ocorre quando metadados + marcador de ownership do instalador comprovam a mesma checkout e a unit esperada.

O browser não fornece unit/path/comando. A operação autorizada é a constante `systemctl --user restart dev-dashboard.service` dentro dessa fronteira comprovada.

Há uma pendência operacional atual em **#659**: o handoff do redeploy gerenciado ainda pode falhar em propagar a raiz necessária para o `dev-web` reconhecer a instalação e devolver automaticamente o runtime ao systemd. Isso permanece uma falha de lifecycle/recovery; não amplia o contrato nem autoriza fallback inseguro.

Detalhes: [`self-production.md`](self-production.md) e [`../PRODUCTION.md`](../PRODUCTION.md).

### `strategy=disabled`

Representa produção declarada porém não operacional. `enabled=false`/blockers explicam o motivo e o planner não cria deployment mutável.

## Discovery fail-closed

`packages/project-discovery` valida manifesto, shape, estratégia e scripts reais.

```text
production.json ausente
  → sem capability production

manifesto válido
  → Project.production + capability production

manifesto inválido
  → productionWarning, sem capability falsa
```

Falha de um contrato não derruba o scan do workspace inteiro.

## Da declaração à execução

```text
Production Contract válido
      ↓
resolver branch/revision/working tree
      ↓
DeploymentPlan + planHash
      ↓
confirmationToken de uso único
      ↓
recalcular/revalidar
      ↓
executar pela estratégia correta
```

A confirmação fica vinculada a `projectId + revision + planHash`, possui TTL curto e não é persistida.

Para `command`/`git-managed`, working tree limpa e branch adequada fazem parte do preflight. Para `self-update`, `origin/main`, branch `main`, working tree limpa e fast-forward são novamente comprovados pelo worker antes da aplicação.

## Irreversibilidade e recovery

Migration, promoção externa e aplicação de self-update podem produzir efeito real antes de uma falha posterior.

Depois que uma etapa irreversível começou, incerteza relevante pode resultar em:

```text
recovery_required
```

O Dashboard não faz rollback cego.

Quando `command`/`git-managed` concluíram toda mutação e somente o `verify` final falhou, o domínio pode repetir **somente `prod:verify`** se timeline/contrato/revision ainda provarem um caso seguro.

## Credenciais

Credenciais não pertencem ao manifesto.

Vercel:

```text
VERCEL_TOKEN
VERCEL_TEAM_ID   # opcional
```

Self-update usa token próprio do agent em configuração privada local.

Esses valores não são enviados pelo browser nem persistidos no `DeploymentStore`.

## Segurança

O browser envia IDs, ações tipadas, `planHash` e confirmação. Ele não escolhe:

- shell/programa/argv;
- `cwd`/checkout;
- token de provider;
- SHA arbitrário de promoção;
- unit/comando de restart do self-update.

Providers externos são input não confiável e passam por limites/shape/erros sanitizados. Paths de documentação/health seguem validação própria e não transportam credenciais.

O self-update mantém uma fronteira adicional: agent instalado, Unix socket autenticado, handoff previamente vinculado, ownership antes do shutdown e proof-of-revision depois do restart.

Veja [`security.md`](security.md) e [`self-production-security-review.md`](self-production-security-review.md).

## API e UI

A capability `production` só aparece quando o contrato é válido. A superfície usa o mesmo domínio de plano/confirmação/timeline/histórico/recovery para as estratégias suportadas.

A visão global **Produção** reutiliza os mesmos planos e execuções; `Atualizar pendentes` não cria um segundo motor de deployment.

A referência exata de endpoints é gerada em [`api-reference.md`](api-reference.md).

## Escopo atual

Incluído:

- discovery fail-closed do Production Contract v1;
- `command`, `git-managed`, `self-update` e `disabled`;
- planner + `planHash` + confirmação;
- revalidação de revision;
- Vercel por SHA exato;
- timeline/histórico/log/recovery;
- retry seguro de verify;
- Produção por projeto e visão global;
- self-update com handoff/agent/worker e proof-of-revision;
- integração opcional do runtime instalado com `systemd --user`.

Fora de escopo:

- rollback Vercel automático;
- executor remoto genérico no self-update;
- root/unit system-wide para self-production;
- usar tooling interno como bypass da confirmação;
- atualização transacional global entre providers.

Pendências futuras ficam em issues. A limitação operacional imediata da self-production instalada está em #659.
