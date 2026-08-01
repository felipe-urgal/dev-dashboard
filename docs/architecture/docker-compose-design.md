# Desenho — Docker Compose por serviços declarados e allowlist

## Status

Desenhado, não implementado. Item do roadmap (Horizonte 3,
`docs/roadmap.md`), sem código escrito ainda.

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
  existe no projeto, listar os serviços declarados, e permitir
  start/stop/restart/logs por serviço — nunca criar, editar ou buildar
  imagem.
- **Fora do escopo**: `docker build`, `docker exec` interativo, editar o
  compose file pela UI, gerenciar volumes/redes/imagens soltos fora de um
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
  como "requer build" e **sem** ação de start disponível — buildar imagem
  está fora do escopo (seção acima), então esses serviços ficam somente
  informativos até o usuário buildar manualmente fora do dashboard.

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
export type ComposeServiceAction = 'start' | 'stop' | 'restart' | 'logs';
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

### `logs`: reaproveitar o modelo de leitura de log existente, não SSE novo

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
    ao vivo fica como extensão natural depois, sem mudar o contrato
    público (só adicionar um parâmetro `follow`).

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
  opcional de `docker compose version` ali, e a detecção do projeto marca
  `supported: false` quando o binário não existe, sem erro — mesmo
  tratamento que `dev-doctor` já dá pra ausência do `gum` (aviso, não erro).
- **Escopo do processo continua só leitura de config + `execFile` com
  argumentos fechados** — a API nunca ganha acesso a Docker além do que um
  `docker compose <verbo> <serviço>` já delimitado permite; nenhum socket
  Docker é exposto a mais do que o processo da API já teria localmente.

## Contrato público (rascunho)

Seguindo o mesmo formato de `packages/contracts/src/database.ts`:

```ts
export type ComposeServiceAction = 'start' | 'stop' | 'restart' | 'logs';

export interface ComposeService {
  name: string;
  image?: string;
  requiresBuild: boolean;
  ports: string[];
  dependsOn: string[];
  running: boolean;
}

export interface ProjectComposeOverview {
  supported: boolean;
  composeFile?: string;
  services: ComposeService[];
}

export interface ComposeServiceActionConfirmation {
  token: string;
  serviceName: string;
  action: ComposeServiceAction;
  expiresAt: string;
}

export interface ComposeServiceActionResult {
  serviceName: string;
  action: ComposeServiceAction;
  succeeded: boolean;
}
```

`running` em `ComposeService` vem de `docker compose ps --format json`
rodado sob demanda quando a aba é aberta (mesmo espírito de "supported"
declarativo + "status" sob demanda que `database-detection-service.ts` já
usa pra `reachability`), não de um poller contínuo.

## Onde entra na UI

Novo painel `ProjectDockerPanel.vue`, mesmo nível de
`ProjectDatabasePanel.vue`/`ProjectServerPanel.vue` — aba própria "Docker"
em `ProjectDetailsView.vue`, condicional a `supported` (mesmo padrão já
usado pra ocultar a aba "Banco de dados" quando o projeto não tem banco,
task 056). Lista de serviços com badge de porta/estado, ação start/stop/
restart por linha, e uma view de logs (modal ou seção expansível — decisão
de UI na hora de implementar, mesmo padrão do modal de migration da task
057).

## Próximo passo

Sem implementação ainda. Falta decidir entre a opção (A) e (B) de `logs`
(recomendação acima é (A), mas é o ponto de maior custo de implementação
do desenho inteiro) antes de abrir a primeira branch. Depois dessa decisão,
a ordem natural de implementação é: detecção (`docker-compose-service.ts`
+ contratos) → rotas `start`/`logs` (sem confirmação) → `stop`/`restart`
(com confirmação) → UI.
