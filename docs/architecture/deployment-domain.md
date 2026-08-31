# Domínio de deployment

O Dev Dashboard possui um domínio de deployment separado do `process-manager`. Ele transforma um `Production Contract v1` válido em estado operacional estruturado sem ensinar o dashboard sobre detalhes internos de systemd, Docker Compose ou Vercel.

Nesta versão existem duas integrações deliberadamente diferentes:

- `strategy=command`: planeja e executa scripts `prod:*` canônicos do projeto;
- `strategy=git-managed` + `provider=vercel`: consulta o provider, compara revisions e normaliza a timeline sem disparar promoção remota.

Produção `disabled` continua fail-closed.

## Fronteira arquitetural

O fluxo `command` continua separado de processos de desenvolvimento:

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

O fluxo Vercel é somente leitura:

```text
ProjectStore
    │
    ▼
ProductionContractV1
    │
    ├── strategy=git-managed
    ├── provider=vercel
    └── external.project
    │
    ▼
ProductionDeploymentStatusService
    ├── GitDeploymentOriginRevisionResolver
    └── VercelDeploymentAdapter
            │
            ▼
      API REST da Vercel
```

O `process-manager` continua responsável por processos como servidor, teste, worker e webpack. Deployment tem semântica diferente: revision, confirmação forte quando há mutação local, etapas potencialmente irreversíveis, histórico próprio e representação explícita de provider externo.

## Plano `command`

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

## Etapas `command` por política

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

## Adapter Vercel `git-managed`

O adapter Vercel não adiciona um `prod:deploy` fictício. O projeto continua dono das operações locais que realmente existem, como `prod:check`, `prod:migrate` e `prod:verify`; promoção Git/Vercel continua sendo uma responsabilidade externa ao executor `command`.

### Mapeamento explícito

O vínculo com a Vercel vem exclusivamente de:

```json
{
  "production": {
    "strategy": "git-managed",
    "provider": "vercel",
    "external": {
      "project": "nome-ou-id-explicito"
    }
  }
}
```

O backend não deduz o projeto remoto pelo nome da pasta, repositório, workspace ou usuário autenticado. `VercelDeploymentAdapter` primeiro resolve `external.project` na API da Vercel e usa o ID canônico retornado para consultar deployments de produção.

### Credenciais

O token nunca pertence ao manifesto. O adapter usa somente configuração local do processo:

- `VERCEL_TOKEN` para autenticação;
- `VERCEL_TEAM_ID` opcional para escopo de time.

Esses valores não são persistidos pelo domínio, não são retornados ao browser e não entram nas mensagens sanitizadas de erro.

### Snapshot de produção

`GET /api/projects/:projectId/deployments/status` retorna um `ProductionDeploymentStatus` com:

- projeto/provider declarados;
- projeto Vercel resolvido;
- deployment atual com `target=production`, quando existir;
- URL, estado normalizado, branch e revision quando presentes no provider;
- revision já conhecida em `refs/remotes/origin/<production.branch>`;
- drift calculado por igualdade de SHA;
- operações locais `check`, `migrate` e `verify` declaradas;
- timeline do provider normalizada para os estados de etapa do domínio.

A leitura de `origin/<branch>` usa `git show-ref --verify --hash` com `shell: false`. Ela **não executa `git fetch`**. Ausência da ref remota resulta em `originRevision` ausente e `drift=unknown`, sem efeito colateral no repositório.

### Drift

O domínio usa três estados:

- `in-sync`: `originRevision === productionRevision`;
- `drift`: ambas existem e os SHAs diferem;
- `unknown`: uma das revisions não pôde ser determinada.

A comparação não tenta classificar automaticamente `behind`, `ahead` ou divergência por ancestralidade. Isso exigiria uma análise Git adicional e não deve ser inferido apenas pela desigualdade de SHA.

### Timeline do provider

O deployment Vercel usa uma etapa lógica `provider-deploy` com fase `deploying`. O estado remoto é normalizado assim:

| Vercel | Domínio |
| --- | --- |
| `QUEUED`, `INITIALIZING` | `pending` |
| `BUILDING` | `running` |
| `READY` | `succeeded` |
| `ERROR` | `failed` |
| `CANCELED` | `cancelled` |
| desconhecido | `pending` + estado provider `unknown` |

Essa timeline é observacional. Ela não afirma que `check`, `migrate` ou `verify` já rodaram e não autoriza mutação remota.

### Migration e verify continuam independentes

Um contrato `git-managed` pode declarar:

```text
prod:check
prod:migrate
prod:verify
```

Essas operações continuam separadas da observação do deployment Vercel. Em uma política `migrations=before-deploy`, o adapter não executa migration automaticamente e não promove código antes dela.

Isso preserva fluxos seguros como:

```text
check
→ backup/checkpoint externo quando necessário
→ migrate
→ validar schema
→ promoção pelo fluxo Git/Vercel existente
→ acompanhar provider
→ verify
```

## Estados `command`

O contrato público de execução local usa os estados:

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

Executar produção `command` exige confirmação separada do planejamento. O token:

- é aleatório, com 32 bytes;
- possui TTL curto;
- é de uso único;
- fica vinculado a `projectId + revision + planHash`;
- não é persistido.

A confirmação não é uma autorização genérica para “fazer deploy”. Mudança de revision, branch, working tree ou plano exige novo planejamento e nova confirmação.

A consulta Vercel não recebe token de confirmação porque não inicia mutação.

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

## Autorização temporária de `sudo`

Quando um `prod:*` falha porque `sudo` exige senha/TTY, o deployment recebe `DEPLOYMENT_PRIVILEGE_REQUIRED`. Para projetos `strategy=command`, a UI local pode abrir a autorização temporária.

A senha é enviada apenas à API em loopback e usada uma vez em:

```text
sudo -S -v
```

Ela não é persistida, não é escrita em arquivo, não é colocada no ambiente e não é encaminhada ao stdin do script de produção.

Aceitar a senha ainda não significa que o ticket pode ser usado pelo deployment. Em configurações do sudoers como `timestamp_type=ppid`, o ticket é associado ao processo pai: um `sudo -n -v` executado diretamente pela API pode funcionar, mas outro `sudo` executado por `npm -> shell -> script` será autenticado separadamente.

Por isso `SudoSessionService` considera `authorized=true` somente depois de uma segunda validação não interativa executada a partir de outro processo pai:

```text
API
 ├── sudo -S -v          # recebe a senha
 └── processo descendente
       └── sudo -n -v    # precisa reutilizar o ticket sem senha
```

Se a segunda validação falhar, o modal permanece bloqueado e informa que é necessária uma regra `NOPASSWD` limitada aos comandos de produção. O dashboard não tenta alterar `timestamp_type`, criar regra ampla de sudoers ou repassar a senha ao projeto para forçar o deploy.

## Concorrência

A política inicial do executor `command` é conservadora: existe no máximo **um deployment ativo globalmente** no Dev Dashboard.

Isso é mais restritivo que bloquear somente o mesmo projeto, mas evita concorrência entre operações de produção que podem disputar recursos locais, backups ou infraestrutura compartilhada enquanto a visão global ainda não existe.

Snapshots Vercel são leituras externas e não ocupam esse slot.

## Falhas, cancelamento e irreversibilidade

O motor `command` diferencia o ponto da falha:

- falha/cancelamento antes de iniciar qualquer etapa irreversível → `failed` ou `cancelled`;
- falha/cancelamento durante ou depois de uma etapa irreversível → `recovery_required`.

`recovery_required` não executa rollback automaticamente. O Production Contract descreve a política de recuperação, mas a decisão de restaurar backup ou executar rollback continua explícita porque schema/data podem já ter mudado.

Se a API reiniciar enquanto um deployment estava ativo, o `DeploymentStore` recupera o registro como interrompido. Uma etapa irreversível marcada como `running` já conta como iniciada; portanto uma queda no meio de migration/deploy não é rebaixada incorretamente para `failed` comum.

O adapter Vercel desta fase não oferece rollback/cancelamento remoto.

## Falhas externas seguras

Falhas esperadas da integração Vercel viram estados operacionais estruturados em `providerAvailability`, acompanhados de códigos estáveis:

- `DEPLOYMENT_PROVIDER_INTEGRATION_UNAVAILABLE`;
- `DEPLOYMENT_PROVIDER_AUTH_FAILED`;
- `DEPLOYMENT_PROVIDER_QUOTA_EXCEEDED`;
- `DEPLOYMENT_PROVIDER_PROJECT_NOT_FOUND`;
- `DEPLOYMENT_PROVIDER_UNAVAILABLE`;
- `DEPLOYMENT_PROVIDER_RESPONSE_INVALID`.

O adapter limita o corpo aceito da resposta externa, valida a forma dos campos usados e nunca repassa a mensagem bruta do provider ao browser. Rate limit HTTP `429` e códigos conhecidos de cota são normalizados para `quota-limited`.

## Logs e persistência

O estado `command` fica fora do repositório, sob o diretório de estado do Dev Dashboard:

```text
${DEV_DASHBOARD_STATE_DIR:-~/.local/state/dev-dashboard}/deployments/
```

O store mantém:

- registros JSON de deployments;
- logs JSON separados;
- histórico limitado por projeto;
- arquivos com permissão `0600` em diretório privado `0700`.

Logs possuem teto de 512 KiB por deployment por padrão e preservam apenas a cauda UTF-8 quando excedem o limite. Todo chunk de stdout/stderr passa por `maskSensitiveLogContent` **antes** da persistência; o store registra também se houve masking e quantas substituições ocorreram.

Tokens de confirmação nunca são persistidos. O snapshot Vercel não persiste `VERCEL_TOKEN` nem corpo bruto da API externa.

## API

As rotas privadas do domínio são:

```text
POST /api/projects/:projectId/deployments/plan
POST /api/projects/:projectId/deployments/confirmations
POST /api/projects/:projectId/deployments
GET  /api/projects/:projectId/deployments
GET  /api/projects/:projectId/deployments/status
GET  /api/projects/:projectId/deployments/:deploymentId
GET  /api/projects/:projectId/deployments/:deploymentId/log
POST /api/projects/:projectId/deployments/:deploymentId/cancel
GET  /api/projects/:projectId/deployments/sudo
POST /api/projects/:projectId/deployments/sudo
```

Todas usam schemas fechados. O browser envia IDs, `planHash` e token de confirmação nas rotas mutáveis; nunca envia comando, programa, argumentos, path de projeto, token Vercel ou corpo de script. A única entrada sensível adicional é a senha no `POST .../deployments/sudo`, restrito a loopback e usada somente para `sudo -S -v` durante a própria requisição.

## Diagnóstico operacional

Quando o plano `command` for recusado:

- `DEPLOYMENT_PRODUCTION_UNAVAILABLE`: confirme o Production Contract/capability;
- `DEPLOYMENT_STRATEGY_UNSUPPORTED`: use a operação correspondente à estratégia declarada;
- `DEPLOYMENT_BRANCH_MISMATCH`: troque para a branch de produção declarada;
- `DEPLOYMENT_WORKTREE_DIRTY`: faça commit ou descarte todas as mudanças locais, incluindo arquivos não rastreados;
- `DEPLOYMENT_REVISION_UNAVAILABLE`: confirme que o projeto é um repositório Git válido e não está em detached HEAD;
- `DEPLOYMENT_PLAN_STALE`: gere novo plano e nova confirmação;
- `DEPLOYMENT_ALREADY_RUNNING`: aguarde ou cancele conscientemente o deployment ativo;
- `DEPLOYMENT_PRIVILEGE_REQUIRED`: se a senha for aceita mas a autorização continuar bloqueada, o host não permite reutilizar o ticket na árvore do deployment (por exemplo, `timestamp_type=ppid`); configure `NOPASSWD` apenas para os comandos de produção necessários.

Quando `providerAvailability` não for `available`, trate o drift como desconhecido até a integração voltar a produzir um snapshot válido. Não crie commits artificiais para contornar quota ou forçar novo deployment.

Quando um histórico `command` terminar em `recovery_required`, consulte a timeline e o log antes de qualquer ação manual. Não repita o deployment automaticamente: primeiro confirme qual etapa irreversível chegou a iniciar e siga a política de backup/rollback do projeto.

## Limites atuais

Esta versão não implementa:

- disparo/promoção de deployment Vercel pelo Dev Dashboard;
- rollback automático local ou Vercel;
- execução paralela entre projetos;
- self-update do Dev Dashboard;
- visão global de deployments pendentes;
- `git fetch` implícito durante a leitura de status.

Esses limites mantêm o domínio revisável sem enfraquecer o contrato de segurança.
