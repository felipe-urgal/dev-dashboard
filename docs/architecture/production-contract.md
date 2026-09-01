# Production Contract v1

O Dev Dashboard reconhece produção como uma capability declarativa do projeto. O contrato padroniza **o que pode ser operado** sem padronizar a infraestrutura física usada por cada aplicação.

O manifesto não autoriza shell arbitrário. Ele declara estratégia, provider, operações canônicas e políticas; o domínio de deployment continua responsável por resolver Git, montar o plano, exigir confirmação e executar cada etapa pela camada correta.

## Manifesto

Um projeto opta pelo contrato criando:

```text
.dev-dashboard/production.json
```

O formato atual usa `version: 1` e um objeto `production` com:

- `enabled`: informa se a produção está operacionalmente habilitada;
- `strategy`: `command`, `git-managed` ou `disabled`;
- `provider`: `systemd`, `docker-compose`, `vercel` ou `none`;
- `branch`: branch canônica de produção;
- `commands`: referências para scripts npm canônicos `prod:*`;
- `policies`: políticas explícitas de backup, migrations e rollback/recovery;
- `health`: health/readiness HTTP declarada, quando existir;
- `external.project`: projeto externo explícito para providers como Vercel;
- metadados opcionais de documentação e bloqueadores.

Identificadores obrigatórios, como `branch` e `external.project`, precisam conter conteúdo útil. Strings vazias ou compostas apenas por espaços mantêm o contrato fail-closed.

## Operações canônicas

O manifesto não escolhe qualquer script do `package.json`. Cada operação possui um nome fixo:

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

A validação exige que o valor corresponda exatamente ao alias canônico e que o script exista de fato no `package.json` atual. O manifesto não contém corpo de script, programa, argumentos, token ou linha de shell.

## Estratégias v1

### `command`

Usada por providers locais como systemd e Docker Compose.

Requisitos mínimos:

- `enabled=true`;
- provider `systemd` ou `docker-compose`;
- `prod:status`;
- `prod:check`;
- `prod:deploy`;
- `prod:verify`.

Backup, migration, logs, restore-check e rollback são capabilities adicionais quando declaradas. O dashboard não interpreta systemd ou Docker Compose diretamente: o projeto continua dono da implementação física de seus scripts `prod:*`.

### `git-managed`

Usada pelo provider Vercel.

Requisitos mínimos:

- `enabled=true`;
- `provider=vercel`;
- `prod:check`;
- `prod:verify`;
- `external.project`;
- ausência de `prod:deploy` local.

`prod:migrate` é exigido quando `policies.migrations=before-deploy`. O deployment remoto não é escondido atrás de um alias local: o plano usa uma etapa própria `provider-deploy`, executada pelo adapter Vercel.

O fluxo mutável suportado é:

```text
prod:check
→ backup/migrate quando a política exigir
→ provider-deploy na Vercel para a revision confirmada
→ prod:verify
```

Antes da mutação remota, o backend confirma que a revision planejada ainda é a revision publicada em `origin/<production.branch>` por consulta direta ao remote. Se não conseguir provar isso, falha fechado. A Vercel recebe o SHA exato confirmado, não apenas uma branch móvel.

A criação de deployment Vercel é suportada para origem GitHub reconhecida. A leitura de status continua normalizando metadados de GitHub, GitLab e Bitbucket quando o provider os retorna, mas isso não amplia automaticamente o executor mutável para essas origens.

### `disabled`

Representa um projeto que declara produção, mas ainda não pode ser operado.

Requisitos mínimos:

- `enabled=false`;
- `provider=none`;
- operações de status/check quando declaradas pelo contrato do projeto.

`reasonCode` e `blockedBy` explicam o gate. O planner não cria deployment para produção desabilitada.

## Descoberta fail-closed

`packages/project-discovery` cruza o manifesto com os scripts reais do projeto. O comportamento é:

```text
projeto detectado
      ↓
production.json ausente ───────────→ projeto sem capability production
      ↓
manifesto presente
      ↓
JSON + shape + estratégia + scripts válidos?
      ├─ não → productionWarning, sem capability production
      └─ sim → Project.production + capability production
```

Um contrato inválido não derruba o scan inteiro. A falha fica associada ao projeto em `Project.productionWarning`.

Warnings estáveis do v1 incluem:

- `PRODUCTION_CONTRACT_UNREADABLE`;
- `PRODUCTION_CONTRACT_INVALID_JSON`;
- `PRODUCTION_CONTRACT_UNSUPPORTED_VERSION`;
- `PRODUCTION_CONTRACT_INVALID_SHAPE`;
- `PRODUCTION_CONTRACT_SCRIPT_MISSING`.

## Da declaração à execução

Um contrato válido **não autoriza sozinho** uma mutação de produção.

Para `command` e `git-managed`, o backend resolve branch, revision e working tree antes do plano. O working tree precisa estar limpo, inclusive arquivos não rastreados. O `planHash` cobre projeto, provider, branch, revision e etapas.

```text
Production Contract válido
      ↓
branch + revision + working tree limpa
      ↓
DeploymentPlan + planHash
      ↓
confirmationToken de uso único
      ↓
revalidação do plano
      ↓
execução das etapas pela camada correspondente
```

A confirmação fica vinculada a `projectId + revision + planHash`, possui TTL curto e só pode ser consumida uma vez. Mudança de checkout, revision, contrato ou plano invalida a autorização anterior.

No `git-managed`, existe uma defesa adicional imediatamente antes de `provider-deploy`: a revision de `origin/<branch>` é consultada diretamente e precisa continuar igual ao SHA confirmado.

## Políticas e irreversibilidade

As políticas determinam a timeline. Exemplos:

```text
command + migration no startup:
check → backup → deploy → verify

command + migration separada:
check → backup → migrate → deploy → verify

git-managed/Vercel + migration separada:
check → migrate → provider-deploy → verify
```

Uma migration ou promoção externa já iniciada pode produzir efeito parcial. Falhas posteriores podem resultar em `recovery_required`; o dashboard não executa rollback cego.

Quando a promoção já concluiu e somente o `verify` falhou, o domínio pode repetir **somente `prod:verify`** se a timeline, revision, contrato e ordem histórica provarem que o retry é seguro. Check, backup, migrate e provider-deploy não são repetidos nesse fluxo.

## Credenciais externas

Credenciais nunca pertencem ao Production Contract. Para Vercel, a API usa configuração local do processo do Dev Dashboard:

```text
VERCEL_TOKEN
VERCEL_TEAM_ID   # opcional
```

`npm run dev` carrega `.env.local` quando presente, permitindo manter essas variáveis fora do repositório. Tokens não são persistidos no domínio, não são retornados ao browser e não entram em logs sanitizados.

## Segurança

O navegador envia IDs, `planHash`, token de confirmação e ações tipadas. Ele não escolhe programa, argumentos, `cwd`, corpo de script, linha de shell, token Vercel ou SHA arbitrário para promoção.

O adapter local usa scripts canônicos e `shell: false`. O adapter Vercel usa o projeto externo declarado, a origem Git resolvida pelo backend e a revision já confirmada. Respostas externas possuem tamanho/shape limitados e erros são traduzidos para códigos locais estáveis.

`documentation` aceita somente caminho relativo seguro. Health aceita apenas HTTP/HTTPS sem credenciais. O contrato não possui campos para tokens, connection strings ou valores secretos.

Detalhes: [Segurança e modelo de ameaça](security.md).

## API e UI

A capability `production` só aparece quando o contrato é válido. Produção habilitada pode usar:

- planejamento e confirmação;
- início e cancelamento de deployment;
- histórico, detalhe e log;
- status do provider;
- retry seguro de verify quando elegível;
- autorização temporária de sudo apenas no fluxo local `command` quando necessária.

A superfície de Produção usa o mesmo domínio para `command` e `git-managed`; a diferença está em quem executa a etapa de promoção.

A referência exata dos endpoints é gerada em [api-reference.md](api-reference.md).

## Escopo atual

Incluído:

- Production Contract v1 e discovery fail-closed;
- `strategy=command` para systemd/Docker Compose via scripts `prod:*`;
- `strategy=git-managed` para deploy Vercel explícito;
- status/drift Vercel;
- planejamento, confirmação, timeline, histórico, logs, cancelamento e recovery;
- revalidação de revision local e de `origin/<branch>`;
- promoção Vercel por SHA exato;
- retry seguro de somente verify;
- UI de Produção por projeto.

Fora de escopo:

- rollback Vercel automático;
- self-update do Dev Dashboard enquanto a própria API é o coordenador;
- visão global/`Atualizar pendentes` entre providers distintos.

Self-production permanece documentada em [self-production.md](self-production.md); evolução multi-projeto permanece rastreada nas issues da frente de produção.
