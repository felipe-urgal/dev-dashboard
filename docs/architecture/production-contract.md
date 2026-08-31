# Production Contract v1

O Dev Dashboard reconhece produção como uma capability declarativa do projeto. Esta camada existe para padronizar **o contrato operacional**, sem padronizar a infraestrutura física usada por cada aplicação.

Nesta versão, a descoberta é somente leitura: o dashboard identifica e valida o contrato, mas não executa deploy, migration, backup, rollback ou comandos de produção.

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

### `git-managed`

Usada inicialmente pelo provider Vercel.

Requisitos mínimos:

- `enabled=true`;
- provider `vercel`;
- `prod:check`;
- `prod:verify`;
- referência `external.project`;
- ausência de `prod:deploy` local.

O deploy remoto será responsabilidade de um adapter futuro. Esta estratégia impede esconder `git push`, `vercel --prod` ou outra mutação externa atrás de um alias local genérico.

### `disabled`

Representa um projeto que já declara o contrato, mas ainda não deve ser tratado como produção habilitada.

Requisitos mínimos:

- `enabled=false`;
- provider `none`;
- `prod:status`;
- `prod:check`.

`reasonCode` e `blockedBy` permitem explicar o gate sem transformar projeto bloqueado em erro de health.

## Descoberta

`packages/project-discovery` continua responsável pela descoberta de Rails/Node e capabilities. Após a descoberta base, ele procura o manifesto de produção e o cruza com os scripts atuais do projeto.

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

## Segurança

Esta entrega não executa nenhum script `prod:*`.

A separação deliberada é:

```text
manifesto versionado
      ↓
IDs canônicos de operação
      ↓
validação contra package.json real
      ↓
capability estruturada
      ↓
nenhuma execução nesta fase
```

O navegador recebe metadados estruturados pela API, mas não escolhe programa, argumentos nem corpo de shell. Quando o motor de deployment for implementado, ele deverá redetectar o catálogo no momento da execução, aplicar confirmação para mutações e resolver cada operação no backend; o manifesto validado não será, por si só, autorização para executar processo.

`documentation` só aceita caminho relativo sem `..`; health aceita apenas HTTP/HTTPS sem credenciais embutidas; o contrato não possui campos para tokens, connection strings ou variáveis secretas.

## API

Os schemas de projeto da API expõem dois campos opcionais:

- `production`: contrato v1 normalizado quando válido;
- `productionWarning`: warning estruturado quando o manifesto existe, mas é inválido.

A capability `production` só é adicionada quando o contrato é válido. `production.enabled=false` continua sendo um contrato válido e permite distinguir "produção bloqueada" de "projeto sem contrato".

## Escopo desta versão

Incluído no v1:

- tipos compartilhados;
- validação fechada;
- descoberta;
- serialização pela API;
- warnings estruturados;
- testes dos formatos `command`, `git-managed` e `disabled`.

Fora de escopo:

- executar qualquer `prod:*`;
- confirmação de deploy;
- jobs/timeline de deployment;
- integração com systemd, Docker ou Vercel;
- UI de Produção;
- self-update do Dev Dashboard.

Essas responsabilidades pertencem às fases seguintes da iniciativa de produção e não devem ser antecipadas dentro do discovery.
