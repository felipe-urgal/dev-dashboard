# Operação de deployments

Este guia cobre a operação do Dev Dashboard para projetos com `Production Contract v1` válido e `production.enabled=true`.

O domínio suporta duas estratégias mutáveis:

- `strategy=command`: executa scripts `prod:*` canônicos do projeto;
- `strategy=git-managed` + `provider=vercel`: executa as etapas locais do contrato e cria/acompanha o deployment de produção na Vercel.

Detalhes arquiteturais: [Production Contract v1](architecture/production-contract.md), [Domínio de deployment](architecture/deployment-domain.md) e [Segurança](architecture/security.md).

## Pré-requisitos comuns

Antes de preparar um deployment, confira no projeto alvo:

```bash
git status --short --branch
```

O motor exige:

- repositório Git válido;
- HEAD em uma branch;
- branch atual igual a `production.branch`;
- working tree limpa, incluindo arquivos não rastreados;
- manifesto de produção válido;
- scripts `prod:*` exigidos pela estratégia/política.

Não limpe alterações automaticamente apenas para liberar produção. Faça commit, stash fora do fluxo de deployment ou descarte conscientemente.

## Fluxo comum

```text
Preparar deployment
        ↓
revisar projeto + branch + revision + etapas
        ↓
Confirmar e iniciar
        ↓
check / backup / migrate quando aplicáveis
        ↓
deploy local OU provider-deploy Vercel
        ↓
verify
        ↓
succeeded | failed | cancelled | recovery_required
```

Preparar o plano não executa mutações. A confirmação é vinculada ao plano, expira e só pode ser usada uma vez.

## `strategy=command`

Providers locais como systemd e Docker Compose continuam encapsulados pelo próprio projeto. O dashboard executa apenas aliases canônicos como:

```text
prod:check
prod:backup
prod:migrate
prod:deploy
prod:verify
```

A sequência depende das políticas. Exemplos:

```text
check → backup → deploy → verify
```

ou:

```text
check → backup → migrate → deploy → verify
```

O dashboard não interpreta internamente `systemctl` nem `docker compose`; isso pertence aos scripts do projeto.

## `strategy=git-managed` + Vercel

Projetos Vercel não possuem `prod:deploy` local. A promoção externa é uma etapa explícita `provider-deploy`.

Exemplo sem migration separada:

```text
prod:check
→ provider-deploy
→ prod:verify
```

Exemplo com `migrations=before-deploy`:

```text
prod:check
→ prod:migrate
→ provider-deploy
→ prod:verify
```

Backup/checkpoint continua sendo responsabilidade do contrato/política do projeto quando aplicável.

### Segurança da revision

No preview, o dashboard resolve a revision local e exige working tree limpa. Antes da mutação remota, ele consulta diretamente `origin/<production.branch>` e exige que o SHA continue igual à revision confirmada.

A promoção é recusada se:

- o remote não puder ser consultado;
- a branch remota não existir;
- a revision local não estiver publicada em `origin`;
- `origin/<branch>` tiver avançado depois do preview.

A Vercel recebe o **SHA exato confirmado**, além da branch. O dashboard não promove apenas uma ref móvel.

### Credenciais Vercel

Crie um `.env.local` na raiz do Dev Dashboard, fora do Git:

```dotenv
VERCEL_TOKEN=seu_token_local
# Somente quando o projeto estiver sob um time/escopo que exija:
VERCEL_TEAM_ID=team_xxx
```

`npm run dev` carrega `.env.local` automaticamente.

`VERCEL_TOKEN`:

- não pertence a `.dev-dashboard/production.json`;
- não deve ser colado em issue, PR ou log;
- não é persistido pelo domínio;
- não é retornado pela API;
- não é enviado pelo browser.

Depois de alterar `.env.local`, reinicie o Dev Dashboard para garantir que o processo da API recebeu a configuração.

### O que o adapter cria

O provider usa `production.external.project` para resolver o projeto Vercel. Para a mutação, o backend também resolve a origem GitHub do projeto local e envia à Vercel:

```text
target = production
project = external.project
repo = origem GitHub resolvida
ref = production.branch
sha = revision confirmada
```

O browser não escolhe esses valores.

### Acompanhamento

Após criar o deployment, o dashboard acompanha o deployment específico com polling bounded:

```text
QUEUED / INITIALIZING
        ↓
BUILDING
        ↓
READY | ERROR | CANCELED
```

`READY` conclui `provider-deploy`, mas não conclui o deployment inteiro. `prod:verify` ainda precisa validar a aplicação.

## Status, revision e drift

A tela consulta também:

```text
GET /api/projects/:projectId/deployments/status
```

O snapshot externo pode mostrar:

- projeto Vercel resolvido;
- último deployment de produção;
- URL e estado;
- branch/revision informadas pelo provider;
- revision local conhecida de `origin/<production.branch>`;
- `in-sync`, `drift` ou `unknown`;
- timeline normalizada do provider.

A consulta de status não executa `git fetch`. Por isso `drift=unknown` pode significar apenas que a ref remota ainda não está disponível localmente. Isso é diferente da prova remota feita imediatamente antes de um **novo** `provider-deploy`, que consulta o `origin` diretamente e falha fechado.

## Estados do provider

`providerAvailability` diferencia:

- `available`;
- `not-configured`;
- `auth-error`;
- `quota-limited`;
- `project-not-found`;
- `unavailable`;
- `invalid-response`.

Erros externos são convertidos para códigos `DEPLOYMENT_PROVIDER_*`. Resposta bruta da Vercel não é repassada ao navegador.

## Cancelamento

### `command`

O processo local recebe `SIGTERM`; se necessário, há escalada para `SIGKILL` depois do período de tolerância.

### Vercel

Durante `provider-deploy`, o cancelamento:

1. interrompe o polling local;
2. tenta cancelar o deployment remoto em andamento quando suportado;
3. persiste o resultado de forma conservadora.

Cancelamento remoto é best-effort. Se uma etapa irreversível já iniciou, o estado pode terminar em `recovery_required`.

## Verify falhou depois do deploy

Se a promoção terminou e apenas `prod:verify` falhou, **não prepare outro deployment imediatamente**.

Quando a timeline e a revision ainda provam um caso seguro, a UI oferece **Verificar novamente**. Esse fluxo repete somente `prod:verify`.

Ele não repete:

- check;
- backup;
- migrate;
- `prod:deploy`;
- `provider-deploy` Vercel.

Se o backend considerar o snapshot stale, a UI volta ao fluxo de um novo plano.

## `recovery_required`

Esse estado pede investigação manual. Não significa “faça rollback automaticamente”.

Procedimento:

1. identifique a primeira etapa irreversível na timeline;
2. leia o log mascarado;
3. confira provider/aplicação/schema reais;
4. consulte `production.policies.rollback`;
5. valide backup/checkpoint quando houver;
6. gere novo plano somente depois de entender o estado atual.

Para Vercel, não promova cegamente um deployment antigo quando migration/schema já avançou.

## Concorrência

Existe no máximo um deployment mutável ativo globalmente. A regra vale para `command` e `git-managed`.

Leituras de status Vercel são somente leitura e não ocupam esse slot.

Não encerre a API apenas para contornar a concorrência: uma interrupção no meio de uma etapa irreversível pode produzir `recovery_required`.

## Persistência

Deployments são registrados em:

```text
${DEV_DASHBOARD_STATE_DIR:-~/.local/state/dev-dashboard}/deployments/
```

O diretório é privado e contém histórico/timeline/logs limitados. Tokens de confirmação e `VERCEL_TOKEN` não são persistidos.

## Reinício ou crash

Na inicialização, execuções que estavam ativas são recuperadas conservadoramente.

- sem etapa irreversível iniciada: falha/interrupção comum;
- com etapa irreversível iniciada ou concluída: `recovery_required`.

Não repita automaticamente um deployment interrompido.

## Códigos de erro comuns

| Código | Significado | Ação |
| --- | --- | --- |
| `DEPLOYMENT_PRODUCTION_UNAVAILABLE` | contrato/capability não permite a operação | valide `.dev-dashboard/production.json` e faça novo scan |
| `DEPLOYMENT_BRANCH_MISMATCH` | branch atual difere da branch de produção | troque para a branch declarada |
| `DEPLOYMENT_WORKTREE_DIRTY` | existem mudanças locais | commit/stash/descarte conscientemente |
| `DEPLOYMENT_REVISION_UNAVAILABLE` | Git/HEAD ou revision necessária não pôde ser resolvida | verifique repositório, remote e branch |
| `DEPLOYMENT_PLAN_STALE` | revision/plano mudou depois do preview | gere novo plano e confirmação |
| `DEPLOYMENT_CONFIRMATION_REQUIRED` | token ausente/expirado/usado/incompatível | gere nova confirmação |
| `DEPLOYMENT_ALREADY_RUNNING` | já existe deployment ativo | acompanhe/cancele o atual |
| `DEPLOYMENT_COMMAND_FAILED` | `prod:*` local terminou com erro | leia timeline/log e respeite `failurePoint` |
| `DEPLOYMENT_PROVIDER_INTEGRATION_UNAVAILABLE` | `VERCEL_TOKEN` ausente | configure `.env.local` e reinicie o dashboard |
| `DEPLOYMENT_PROVIDER_AUTH_FAILED` | token/escopo recusado | valide token e `VERCEL_TEAM_ID` localmente |
| `DEPLOYMENT_PROVIDER_QUOTA_EXCEEDED` | limite externo | aguarde; não crie commits artificiais |
| `DEPLOYMENT_PROVIDER_PROJECT_NOT_FOUND` | `external.project` não existe no escopo | corrija contrato/escopo |
| `DEPLOYMENT_PROVIDER_UNAVAILABLE` | provider/transporte indisponível | tente novamente sem inferir sucesso |
| `DEPLOYMENT_PROVIDER_RESPONSE_INVALID` | resposta Vercel não passou na validação | investigue mudança de API/provider |

## Diagnóstico rápido Vercel

Se a tela mostrar integração não configurada:

```bash
cd /caminho/do/dev-dashboard
printf 'VERCEL_TOKEN configurado? '; test -n "$VERCEL_TOKEN" && echo sim || echo nao
```

Se você usa `.env.local`, não use `cat` em uma sessão que possa ser capturada. Apenas confirme que o arquivo existe e reinicie `npm run dev`.

Se autenticação funcionar, mas o projeto não for encontrado, confira `production.external.project` no projeto alvo e o escopo do token/team.

Se o plano for recusado por revision remota, confira sem alterar nada:

```bash
git status --short --branch
git remote -v
git ls-remote --heads origin main
```

Troque `main` pela `production.branch` do contrato.

## Limites atuais

O domínio ainda não:

- faz `git push` em nome do usuário;
- cria commit artificial para disparar Vercel;
- executa rollback Vercel automático;
- considera `READY` equivalente a health;
- atualiza o próprio Dev Dashboard durante o restart da API;
- oferece atualização global/transacional entre providers distintos.

Esses limites são deliberados.
