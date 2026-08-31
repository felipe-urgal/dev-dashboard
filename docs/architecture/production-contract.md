# Production Contract v1

O Dev Dashboard reconhece produção como uma capability declarativa do projeto. Esta camada existe para padronizar **o contrato operacional**, sem padronizar a infraestrutura física usada por cada aplicação.

O contrato continua sendo apenas a declaração de capabilities e políticas. A execução local é uma camada separada: o domínio de deployment usa contratos válidos `strategy=command`, recalcula revision/plano, exige confirmação forte e executa somente scripts canônicos reconhecidos.

## Manifesto

Um projeto opta pelo contrato criando:

```text
.dev-dashboard/production.json
```

O formato atual usa `version: 1` e um objeto `production` com:

- `enabled`: informa se o ambiente de produção está operacionalmente habilitado;
- `strategy`: `command`, `git-managed` ou `disabled`;
- `provider`: `systemd`, `docker-compose`, `vercel` ou `none`;
- `branch`: branch canônica de produção;
- `commands`: referências para scripts npm canônicos `prod:*`;
- `policies`: políticas explícitas de backup, migrations e rollback/recovery;
- metadados opcionais de documentação, health, provider externo e bloqueadores.

Identificadores textuais obrigatórios, como `branch` e `external.project`, precisam conter conteúdo útil; strings compostas apenas por espaços são inválidas e mantêm o contrato fail-closed.

O contrato normalizado é exposto em `Project.production` com `version: 1`.

## Operações canônicas

O manifesto não pode escolher qualquer script do `package.json`. Cada operação possui um nome fixo:

| Operação | Script aceito |
| --- | --- |
| `status` | `prod:status` |
| `check` | `prod:check` |
| `backup` | `prod:backup` |
| `migrate` | `prod:migrate` |
| `deploy` | `prod:deploy` |
| `verify` | `prod:verify` |
| `restoreCheck` | `prod:restore-check` |
| `rollback` | `prod:rollback` |
| `logs` | `prod:logs` |

A validação exige duas coisas:

1. o valor declarado corresponde exatamente ao script canônico da operação;
2. o script existe de fato no `package.json` atual do projeto.

Por exemplo, `deploy: "postinstall"` é inválido mesmo que `postinstall` exista. O manifesto também não contém corpo de script, programa, argumentos ou linha de shell.

## Estratégias v1

### `command`

Usada hoje por providers locais como systemd e Docker Compose.

Requisitos mínimos:

- `enabled=true`;
- provider `systemd` ou `docker-compose`;
- `prod:status`;
- `prod:check`;
- `prod:deploy`;
- `prod:verify`.

Backup, migration, logs, restore-check e rollback são capabilities opcionais e continuam pertencendo ao próprio projeto.

O domínio de deployment local suporta esta estratégia. O dashboard não interpreta systemd ou Docker Compose diretamente: ele planeja operações canônicas e o adapter executa somente os aliases `prod:*` reconhecidos.

### `git-managed`

Usada inicialmente pelo provider Vercel.

Requisitos mínimos:

- `enabled=true`;
- provider `vercel`;
- `prod:check`;
- `prod:verify`;
- referência `external.project`;
- ausência de `prod:deploy` local.

O deploy remoto continua responsabilidade de um adapter externo específico. O motor `command` recusa esta estratégia com `DEPLOYMENT_STRATEGY_UNSUPPORTED`. Isso impede esconder `git push`, `vercel --prod` ou outra mutação externa atrás de um alias local genérico.

### `disabled`

Representa um projeto que já declara o contrato, mas ainda não deve ser tratado como produção habilitada.

Requisitos mínimos:

- `enabled=false`;
- provider `none`;
- `prod:status`;
- `prod:check`.

`reasonCode` e `blockedBy` permitem explicar o gate sem transformar projeto bloqueado em erro de health. O planner não cria deployment para produção desabilitada.

## Descoberta

`packages/project-discovery` continua responsável pela descoberta de Rails/Node e capabilities. Após a descoberta base, ele primeiro verifica se o projeto optou pelo manifesto de produção; somente quando `.dev-dashboard/production.json` existe relê os scripts atuais do `package.json` para cruzar o contrato com o catálogo real. Isso evita I/O redundante no caminho comum de projetos sem contrato.

O comportamento é fail-closed:

```text
projeto detectado
      ↓
production.json ausente ───────────→ projeto normal, sem capability production
      ↓
manifesto presente
      ↓
JSON + shape + estratégia + scripts válidos?
      ├─ não → productionWarning, sem capability production
      └─ sim → Project.production + capability production
```

Um contrato inválido não remove o projeto do workspace e não derruba o scan inteiro. A falha fica associada ao projeto em `Project.productionWarning`.

Warnings estáveis do v1:

- `PRODUCTION_CONTRACT_UNREADABLE`;
- `PRODUCTION_CONTRACT_INVALID_JSON`;
- `PRODUCTION_CONTRACT_UNSUPPORTED_VERSION`;
- `PRODUCTION_CONTRACT_INVALID_SHAPE`;
- `PRODUCTION_CONTRACT_SCRIPT_MISSING`.

## Da declaração à execução

Um contrato válido **não autoriza sozinho** uma mutação de produção. Para `strategy=command`, o backend segue uma segunda fronteira:

```text
Production Contract válido
      ↓
branch + revision Git + working tree limpa
      ↓
DeploymentPlan + planHash
      ↓
confirmationToken de uso único
      ↓
revalidação do plano
      ↓
ProductionCommandAdapter
```

O plano é calculado sem executar scripts. A confirmação fica vinculada a `projectId + revision + planHash`, possui TTL curto e é consumida uma única vez.

O working tree precisa estar limpo, inclusive de arquivos não rastreados. Isso impede confirmar o SHA A e executar código local que não pertence ao SHA A. `start()` recalcula o plano antes de consumir o token; mudanças entre planejamento e execução são recusadas.

As políticas do contrato determinam a timeline. Por exemplo, backup obrigatório e migrations no startup produzem `check → backup → deploy → verify`, com `deploy` tratado como potencialmente irreversível. Migration explícita antes do deploy produz `check → backup → migrate → deploy → verify`, com `migrate` irreversível.

Detalhes do motor, estados, persistência e troubleshooting estão em [Domínio de deployment local](deployment-domain.md).

## Segurança

O navegador recebe metadados estruturados e identificadores. Ele não escolhe programa, argumentos, `cwd`, corpo de script ou linha de shell.

O adapter local:

- aceita somente operações canônicas já reconhecidas no contrato;
- resolve package manager no backend;
- deriva `cwd` de `Project.path` vindo do `ProjectStore`;
- executa com `shell: false`;
- fecha stdin;
- mascara stdout/stderr antes da persistência;
- usa `SIGTERM` antes de escalonar para `SIGKILL` em cancelamento;
- não executa rollback cego após uma etapa irreversível.

`documentation` só aceita caminho relativo sem `..`; health aceita apenas HTTP/HTTPS sem credenciais, query string ou fragmento; o contrato não possui campos para tokens, connection strings ou variáveis secretas.

## API

Os schemas de projeto expõem dois campos opcionais:

- `production`: contrato v1 normalizado quando válido;
- `productionWarning`: warning estruturado quando o manifesto existe, mas é inválido.

A capability `production` só é adicionada quando o contrato é válido. `production.enabled=false` continua sendo um contrato válido e permite distinguir "produção bloqueada" de "projeto sem contrato".

Para contratos `command` habilitados, a API também expõe o domínio de deployments: planejamento, confirmação, start, histórico, detalhe, log e cancelamento. A referência exata dos endpoints é gerada em `docs/architecture/api-reference.md`.

## Escopo atual

Incluído:

- tipos compartilhados do Production Contract v1;
- validação fechada e discovery fail-closed;
- serialização do contrato pela API;
- planner local para `strategy=command`;
- confirmação vinculada a revision e hash do plano;
- execução de scripts `prod:*` canônicos com `shell: false`;
- timeline, histórico e logs locais limitados;
- detecção de falha antes/depois de etapa irreversível;
- recuperação conservadora após interrupção do dashboard.

Fora de escopo:

- adapter Vercel/`git-managed`;
- rollback automático;
- UI de Produção;
- self-update do Dev Dashboard;
- visão global de produção e atualização de pendentes.

Essas responsabilidades permanecem em adapters/camadas posteriores, sem enfraquecer o contrato declarativo.
