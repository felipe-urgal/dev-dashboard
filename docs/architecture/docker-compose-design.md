# Desenho — Docker Compose por serviços declarados e allowlist

## Status

Implementado na task 065 (start/stop/restart/logs) com logs pontuais e
limitados, e estendido na task 067 com build assíncrono por serviço. Item do
roadmap (Horizonte 3).

## Problema

Vários dos projetos escaneados por `DEV_BASE`/workspaces têm um
`docker-compose.yml` (ou `compose.yaml`) na raiz cobrindo dependências como
Postgres, Redis, Elasticsearch, Mailhog — hoje o dashboard não sabe nada
sobre isso. O usuário tem que abrir um terminal à parte para `docker compose
up -d`/`down`/`logs` antes de o projeto funcionar. É o mesmo tipo de
"paridade CLI→Web" que já motivou start/stop/restart de banco (tasks
056–057): expor no navegador uma ação que hoje só existe fora do dashboard.

## Escopo: só orquestração de serviços já declarados, nunca Dockerfile/imagem

Importante recortar o escopo desde já, porque "Docker" é um espaço grande
demais para uma única entrega:

- **Dentro do escopo**: ler o `docker-compose.yml`/`compose.yaml` que já
  existe no projeto, listar os serviços declarados, permitir
  start/stop/restart/logs por serviço, e (desde a task 067) `docker compose
  build <serviço>` para os serviços que só declaram `build:` — nunca criar
  ou editar Dockerfile/compose file pela UI.
- **Fora do escopo**: `docker exec` interativo, editar o compose file ou o
  Dockerfile pela UI, gerenciar volumes/redes/imagens soltos fora de um
  projeto, Docker Swarm/Kubernetes. Esses ficam registrados como não-metas,
  não como fases futuras — se algum dia fizerem sentido, é uma decisão de
  produto separada, não uma continuação natural deste desenho.

Esse recorte é o que torna o catálogo de ações fechável (ver seção de
segurança abaixo): "start/stop/restart/logs de um serviço que já existe na
config declarada" é uma superfície pequena e auditável, do mesmo tamanho das
ações que a API já expõe para banco de dados e Rails generators.

## Detecção (estática, sem executar Docker)

Mesmo espírito de `project-discovery`/`database-detection-service.ts`:
parsear o arquivo declarado, nunca inferir rodando comando algum.

1. Procurar `docker-compose.yml`, `docker-compose.yaml`, `compose.yml` ou
   `compose.yaml` na raiz do projeto (primeira ocorrência nessa ordem —
   mesma convenção de precedência que o próprio `docker compose` usa);
2. Parsear como YAML (mesma biblioteca já usada para `database.yml`,
   `packages/project-discovery`/`database-detection-service.ts` já
   dependem de um parser YAML — reaproveitar, não adicionar dependência
   nova);
3. Para cada chave em `services:`, extrair: nome do serviço, `image` (ou
   `build.context` se não houver `image` — sinaliza como "requer build",
   ver limitação abaixo), portas publicadas (`ports:`, formato
   `"host:container"`), e se depende de outro serviço (`depends_on`);
4. `docker compose config --services` **não** é usado na detecção (isso já
   seria "executar Docker" para popular a UI) — só quando o usuário pedir
   uma ação de fato. A lista exibida vem inteiramente do parse estático.

### O que fica de fora (documentar como limitação)

- `docker-compose.override.yml` e `-f` múltiplos: primeira versão só lê o
  arquivo principal. Merge de overrides é merge de YAML não-trivial
  (arrays vs. mapas dependendo da chave) — registrar como gap conhecido,
  não tentar reimplementar o merge do Compose;
- variáveis de interpolação (`${VAR}`, `.env` na raiz do projeto): exibidas
  como texto literal (`${POSTGRES_PASSWORD}`), sem resolver — resolver
  exigiria replicar a mesma lógica de precedência de `.env` que o Compose
  usa, fora de escopo da primeira entrega;
- serviços que só têm `build:` sem `image:`: aparecem na lista marcados
  como "requer build"; a partir da task 067 o dashboard oferece uma ação
  dedicada de build para esse caso (ver seção "Build assíncrono" abaixo) —
  antes disso, e ainda hoje quando o `ProcessManager` não está disponível
  (`DOCKER_BUILD_UNSUPPORTED`), o serviço fica só informativo até o usuário
  buildar manualmente fora do dashboard.

## Execução: catálogo fechado de ações, `execFile` sem shell

Mesmo padrão de todo o resto da API (`process-manager`, `rails generate`,
banco de dados): nunca concatenar string de shell.

```ts
// nunca isso:
// exec(`docker compose -f ${composeFile} up -d ${service}`)

// sempre isso:
execFile('docker', ['compose', '-f', composeFilePath, 'up', '-d', serviceName], {
  cwd: project.path,
  shell: false,
});
```

Catálogo fechado de ações — igual ao `DatabaseServiceAction` já existente
(`'start' | 'stop' | 'restart'`), com um quarto verbo específico de Compose:

```ts
export type ComposeServiceAction = 'start' | 'stop' | 'restart';
```

Mapeamento ação → comando (sempre com `-f <arquivo já resolvido na
detecção>`, nunca um caminho vindo do navegador):

| Ação | Comando |
|---|---|
| `start` | `docker compose -f <file> up -d <service>` |
| `stop` | `docker compose -f <file> stop <service>` |
| `restart` | `docker compose -f <file> restart <service>` |
| `logs` | `docker compose -f <file> logs --no-color --tail=<limite> <service>` |

`serviceName` é validado contra a lista já extraída na detecção (nunca uma
string livre do navegador) antes de entrar no array de argumentos — mesma
validação de allowlist que `resolveServerCommand`
(`packages/process-manager`) já faz para comandos de servidor conhecidos.

### `logs`: decisão implementada

`docker compose logs -f` (modo follow) seria um processo de vida longa —
mais próximo do padrão já usado por `ManagedProcess`
(`packages/process-manager`, `kind: 'server' | 'test'`) do que uma chamada
pontual. Duas opções, registradas aqui para decisão na hora de implementar:

- (A) tratar cada serviço Compose iniciado como um terceiro `kind` de
  `ManagedProcess` (`'compose-service'`), reaproveitando todo o
  rastreamento de PID/log/`observedExits` que já existe — mas isso exige
  generalizar `resolveLogFile`/`resolveProcessFile` e o regex de
  `sweepStaleProcesses`, como o `CLAUDE.md` já avisa que qualquer novo
  `kind` exige;
  - **RECOMENDADO nesta entrega**: mais retrabalho na hora de implementar,
    mas reaproveita rastreamento de PID/identidade via `/proc/<pid>/cwd`
    já testado, em vez de duplicar essa lógica para containers;
  - a identidade do processo rastreado, nesse caso, é o `docker compose`
    (ou o container em si, verificável via `docker inspect
    --format '{{.State.Pid}}'`) — decisão de detalhe para a implementação.
- (B) `logs` sem `-f`, uma chamada pontual com `--tail=N` (mesmo limite de
  262144 bytes já aplicado a leitura de log de processo gerenciado) — mais
  simples, mas sem streaming ao vivo; o usuário reabre a aba para atualizar.
  - mais simples de implementar corretamente na primeira entrega; streaming
    ao vivo fica como extensão separada.

A task 065 implementou a opção **(B)**. O `ProcessManager` atual identifica
uma única instância por `projectId + kind`; a opção (A) também precisaria de
identidade por serviço para permitir múltiplos seguidores de log. Essa
generalização não foi misturada à primeira entrega Compose.

## Build assíncrono (task 067)

`docker compose build <serviço>` pode levar minutos — ao contrário de
`start`/`stop`/`restart`/`logs`, que são chamadas pontuais com timeout curto
(`execFile`, 30s), build precisa rodar em background com progresso
consultável. Diferente da decisão de `logs` (opção B, chamada pontual), aqui
foi adotada a opção **(A)** que a seção "logs: decisão implementada" acima
já cogitava: build vira um terceiro `kind` de `ManagedProcess`,
`'compose-build'`, reaproveitando todo o rastreamento de PID/log/exit do
`packages/process-manager`.

Diferença importante em relação a `server`/`test`: o `ProcessManager`
original identificava no máximo uma instância por `projectId + kind`, o que
não serve para build — dois serviços do mesmo projeto (`app`, `sidekiq`)
podem buildar ao mesmo tempo. `resolveLogFile`/`resolveProcessFile`, as
chaves de `observedExits`/`exitWaiters`, e os regexes de
`sweepStaleProcesses` foram generalizados para aceitar um segmento de
instância opcional (`slugifyProcessInstance(serviceName)`) além do `kind` —
`server`/`test` continuam sem instância, compatíveis com os arquivos já
existentes em disco; `compose-build` sempre informa o nome do serviço como
instância, permitindo builds concorrentes por serviço no mesmo projeto.

- `POST /projects/:id/docker/services/:serviceName/build/start` — inicia
  `docker compose -f <file> build <serviço>` como processo gerenciado
  (spawn destacado, sem shell), rejeita com `PROCESS_ALREADY_RUNNING` (409)
  se já houver um build em andamento para aquele serviço.
- `GET /projects/:id/docker/services/:serviceName/build` — status pollável
  (`ManagedProcess | null`), mesmo formato de `GET /process` do servidor.
- `POST .../build/stop`, `GET/DELETE .../build/logs` — mesmo padrão de
  `server-process-routes.ts`, log limitado a 262144 bytes e mascarado.
- `DockerComposeService.runAction('start', …)` continua rejeitando serviços
  `requiresBuild` com `DOCKER_SERVICE_REQUIRES_BUILD`, exceto quando o
  último build desse serviço (via `ProcessManager`) terminou com
  `status: 'stopped'` e `exitCode: 0` — só então `up -d` fica liberado.
- Build não exige confirmação em duas etapas (diferente de `stop`/`restart`):
  não é destrutivo nem afeta outros projetos que compartilhem o serviço.
- UI: `ProjectDockerPanel.vue` faz polling adaptativo (1,5s enquanto algum
  build está `running`/`starting`, para quando todos terminam) — mesmo
  espírito de `useProjectProcessStatus`, mas por serviço em vez de por
  projeto, já que builds são concorrentes.

## Modelo de segurança

Segue o checklist de `docs/architecture/security.md` — nenhum ponto novo
além do que a API já pratica, mas vale registrar cada um aplicado a este
caso específico:

- **Catálogo fechado de ações**: `ComposeServiceAction` é uma união fechada
  de 4 valores; nenhuma string de shell arbitrária chega a `execFile`.
- **Nome de serviço validado contra a config já detectada**: o navegador
  nunca envia um nome de serviço livre — só um dos IDs que a própria API já
  devolveu na detecção. Requisição com um nome fora da lista falha como
  `DOCKER_SERVICE_NOT_FOUND` (404), nunca chega ao `execFile`.
- **Caminho do compose file nunca vem do navegador**: é resolvido pela
  detecção (raiz do projeto, allowlist de 4 nomes de arquivo conhecidos),
  igual ao caminho de log de processo gerenciado.
- **Sem shell**: `execFile('docker', [...])`, nunca `exec()`/`spawn(...,
  { shell: true })`.
- **Confirmação em duas etapas para `stop`/`restart`**: mesmo padrão de
  `prepareXConfirmation()`/`runX(token)` já usado em banco de dados e Rails
  generators — parar um serviço pode derrubar uma dependência que outros
  projetos abertos no dashboard também usam (ex. um Postgres compartilhado
  entre dois projetos Rails). `start` e `logs` não mutam nada compartilhado
  e não precisam do token.
- **`docker` ausente do PATH**: `dev-doctor` (CLI) e `npm run doctor` (web)
  já verificam dependências do ambiente — adicionar uma checagem
  opcional de `docker compose version` ali, e o overview marca
  `dockerAvailable: false` quando o binário não existe, sem erro — mesmo
  tratamento que `dev-doctor` já dá pra ausência do `gum` (aviso, não erro).
- **Escopo do processo continua só leitura de config + `execFile` com
  argumentos fechados** — a API nunca ganha acesso a Docker além do que um
  `docker compose <verbo> <serviço>` já delimitado permite; nenhum socket
  Docker é exposto a mais do que o processo da API já teria localmente.

## Contrato público (rascunho)

Seguindo o mesmo formato de `packages/contracts/src/database.ts`:

```ts
export type ComposeServiceAction = 'start' | 'stop' | 'restart';

export interface ComposeService {
  name: string;
  image?: string;
  requiresBuild: boolean;
  ports: string[];
  dependsOn: string[];
  running: boolean;
}

export interface ProjectComposeOverview {
  configured: boolean;
  dockerAvailable: boolean;
  composeFile?: string;
  services: ComposeService[];
}

export interface ComposeServiceActionConfirmation {
  token: string;
  serviceName: string;
  action: 'stop' | 'restart';
  expiresAt: string;
}

export interface ComposeServiceActionResult {
  serviceName: string;
  action: ComposeServiceAction;
  succeeded: true;
}
```

Build (task 067) não introduz um contrato novo — reaproveita `ManagedProcess`
de `packages/contracts/src/process.ts` (`kind: 'compose-build'`, novo campo
opcional `composeServiceName`) e `ProcessLogSnapshot`, os mesmos tipos já
usados por `server`/`test`.

`running` em `ComposeService` vem de `docker compose ps --status running --services`
rodado sob demanda quando a aba é aberta (mesmo espírito de estado
declarativo + "status" sob demanda que `database-detection-service.ts` já
usa pra `reachability`), não de um poller contínuo.

## Onde entra na UI

Novo painel `ProjectDockerPanel.vue`, mesmo nível de
`ProjectDatabasePanel.vue`/`ProjectServerPanel.vue` — aba própria "Docker"
em `ProjectDetailsView.vue`, condicional à capability `docker`. Lista de
serviços com badge de porta/estado, ação start/stop/restart por linha e uma
seção expansível de logs recentes.

## Resultado

A implementação segue a ordem proposta: detecção e contratos, status e logs
sem confirmação, `stop`/`restart` com confirmação, UI e diagnóstico opcional
(task 065); build assíncrono por serviço via `ManagedProcess` (task 067).
Overrides e streaming ao vivo (`docker compose logs -f`) permanecem fora do
escopo.
