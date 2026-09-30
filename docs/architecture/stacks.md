# Stacks

Stacks compose multiple existing project/runtime resources. They do not replace Workspace, Project, Development Environment Instance, Process Manager, Docker Compose, Port Registry or domain-specific lifecycle ownership.

## First slice: contract and topology

A Stack contains explicit nodes and explicit dependencies. Nodes point at resources already owned by existing domains:

- Development Environment Instance;
- managed process;
- Docker Compose service;
- known health check.

Dependencies are directional: `nodeId` depends on `dependsOnNodeId`.

The topology service validates the definition and creates a deterministic start order. Stop order is the exact reverse. Unknown nodes, self-dependencies, duplicate edges and cycles fail closed.

Dependency discovery is separate from topology persistence. It can surface explicit relations from existing domain evidence, but it never persists a relation automatically.

## Health

Node state uses:

- `ready`;
- `starting`;
- `stopped`;
- `failed`;
- `blocked`;
- `unknown`.

Aggregate health is conservative. Any failure wins, then blocked, then starting. The Stack is `ready` only when every observed node is ready, and `stopped` only when every node is stopped. Mixed or incomplete evidence becomes `unknown`.

## Persistência da definição

As definições explícitas de Stack são persistidas pelo backend em estado versionado.
A gravação valida a topologia antes de persistir, usa substituição atômica do arquivo
e mantém permissões restritivas. Entradas persistidas inválidas são ignoradas na
recarga em vez de contaminarem o conjunto válido.

A persistência não descobre dependências, não associa recursos ambiguamente e não
executa lifecycle. Ela apenas fornece uma fonte durável para a composição que o
usuário confirmou explicitamente.

## Validação de recursos

Antes de persistir uma definição, o backend comprova as referências básicas
contra o estado local conhecido. Todo node precisa apontar para um Project
existente. Quando o target carrega `environmentInstanceId`, a Environment
Instance precisa existir e pertencer ao mesmo Project declarado pelo node.

Essa validação é estritamente referencial e não tenta inferir serviço Compose, processo ou health check por
heurística. O objetivo é impedir referências órfãs ou cruzadas entre projetos antes
que qualquer lifecycle da Stack ganhe autoridade sobre esses recursos.

## API

O backend expõe CRUD autenticado para definições explícitas de Stack em
`/api/stacks`. A validação de schema descarta propriedades extras e bloqueia limites
fora do contrato; a validação de topologia continua sendo a autoridade para
referências, duplicidades e ciclos antes da persistência.

A superfície de definição permanece autenticada e não aceita path ou comando arbitrário.
Lifecycle é exposto separadamente por endpoints explícitos de `Check`, `Start`,
`Stop` e `Restart`, sempre delegando a mutação ao domínio proprietário do recurso.

## Check somente leitura

`GET /api/stacks/:stackId/check` retorna a definição da Stack, o plano
determinístico de start/stop e a saúde agregada observada naquele instante.

Nesta etapa, nodes de Environment Instance e processos gerenciados possuem evidência direta:
`ready`, `starting`, `stopped` e `failed` são derivados do lifecycle
backend-owned. `degraded` vira `unknown`, porque readiness não pode ser
comprovada. Nodes de processo usam o estado reconciliado do Process Manager e só são associados por `processId`, `projectId` e `environmentInstanceId` explícitos. Nodes de serviço Compose exigem ownership persistido compatível e inspeção estruturada do runtime; somente `running` com health `healthy` vira `ready`. Nodes `health-check` reutilizam o health check de servidor existente por meio do `checkId` conhecido `server`: exigem Environment Instance explícita, processo gerenciado em execução, porta conhecida e path configurado. `healthy` vira `ready`, `degraded` permanece `unknown` e `unavailable` vira `failed`.

Ausência de adapter, desaparecimento da Environment Instance ou drift de
ownership nunca vira `ready`; o Check sempre falha fechado para `unknown`.

## Start coordenado

`POST /api/stacks/:stackId/start` percorre a ordem topológica e revalida o estado após cada mutação. O fluxo só avança para dependentes quando o node anterior está comprovadamente `ready`.

No contrato mutável atual, somente nodes `compose-service` podem ser iniciados pela Stack. A mutação é delegada ao `DockerComposeLifecycleService` e é direcionada ao serviço explicitamente associado, evitando iniciar serviços Compose fora da definição da Stack. A resolução respeita a `Environment Instance`, inclusive worktrees host.

Nodes `environment`, `process` e `health-check` funcionam como gates de readiness: se já estiverem `ready`, o fluxo continua; caso contrário, o Start retorna `blocked` no node correto. O contrato atual de processo não contém comando suficiente para recriar com segurança um processo parado, portanto a Stack não inventa essa mutação.

Falha parcial é retornada explicitamente como `completed`, `blocked` ou `failed`, acompanhada dos steps processados e de um novo `StackCheck`.

## Stop coordenado

`POST /api/stacks/:stackId/stop` percorre `stopOrder`, que é a ordem reversa da topologia.

Nodes `compose-service` delegam ao `DockerComposeLifecycleService.stop(project, service)`, preservando ownership persistido e limitando a mutação ao serviço explicitamente associado. Nodes `process` só são parados quando `processId`, `projectId` e `environmentInstanceId` ainda correspondem ao processo reconciliado pelo Process Manager. Server, worker, webpack e test usam os métodos de stop do próprio domínio; tipos sem adapter seguro ficam `blocked`.

Nodes `environment` e `health-check` são `retained`: Environment Instance é contexto operacional, não um processo genérico, e health check é somente leitura. O Stop não tenta encerrar checkout, worktree, container ou serviço externo por heurística.

Resultado parcial continua explícito como `completed`, `blocked` ou `failed`, com steps por node e um `StackCheck` final.

## Restart direcionado

`POST /api/stacks/:stackId/nodes/:nodeId/restart` reinicia um node específico quando o domínio subjacente já possui uma operação segura.

Neste slice, somente `compose-service` é mutável. Antes do restart, as dependências explícitas do node precisam estar comprovadamente `ready`. A Stack resolve a Environment Instance, exige runtime host e delega ao `DockerComposeLifecycleService.restart(project, service)`, preservando ownership persistido, preflight e Port Registry. As reservas de porta são limitadas ao serviço alvo.

Nodes `process`, `environment` e `health-check` retornam `blocked` porque hoje não existe contrato suficiente para um restart genérico seguro. A Stack não transforma stop+start em restart de processo sem conhecer novamente o comando e os parâmetros originais.

O resultado informa `restarted`, `blocked` ou `failed` e inclui um novo `StackCheck`. O check pode mostrar `starting` logo após o restart; isso não é promovido artificialmente para `ready`.

## Superfície Web

A página global de Stacks reutiliza os contratos de Check/Start/Stop/Restart existentes
para mostrar topologia, estado e lifecycle sem criar executor paralelo.

Cada node oferece navegação para o domínio proprietário quando o contrato permite um
destino inequívoco. Serviços Compose abrem Compose e health checks conhecidos abrem
Servidor, preservando `environmentInstanceId` quando disponível. Nodes de Environment
Instance e processo usam o detalhe neutro do projeto: a definição da Stack não carrega
o runtime da Environment Instance nem o `ManagedProcess.kind`, portanto a UI não
infere Sidekiq/Webpack/Testes/Servidor a partir de ids ou nomes.

## Discovery confirmado de dependências

`GET /api/stacks/:stackId/dependency-suggestions` é somente leitura. O primeiro
provider reutiliza a configuração estruturada já resolvida pelo Docker Compose e
transforma apenas relações explícitas de `depends_on` em sugestões.

Uma sugestão só é emitida quando o serviço origem e o serviço dependência
correspondem inequivocamente a nodes `compose-service` da mesma combinação de
Project + Environment Instance. Relações já persistidas são omitidas. Relações
ambíguas, serviços ausentes e sugestões que tornariam a topologia inválida/cíclica
são descartadas e permanecem como diagnóstico, nunca como autoridade.

A evidência da sugestão preserva fonte `compose`, Project, Environment Instance,
serviços envolvidos e `observedAt`. Configuração Compose continua útil para
discovery mesmo quando o runtime dos containers está indisponível, porque
`depends_on` pertence à configuração declarada.

O Project Profile atual descreve capacidades, não relações entre recursos. Por isso
ele não é usado para inventar dependências. Novas fontes só devem entrar quando
expuserem uma relação estruturada equivalente.

Na UI, a sugestão é apresentada com sua evidência e a ação explícita **Adicionar**.
Somente essa ação envia a definição atualizada ao CRUD existente de Stacks. O
`StackDefinitionService` e o `StackTopologyService` continuam revalidando a
definição antes da persistência; consultar discovery nunca altera a Stack.

## Timeline operacional

Start, Stop e Restart registram eventos no domínio `stack` da infraestrutura de
Activity existente. O registro é por node, usando o `projectId` real do recurso,
`environmentInstanceId` quando disponível e `resourceRef.kind=stack-node`.

A timeline registra início, sucesso, falha e bloqueio como
`started | succeeded | failed | warning`. Falha ao persistir observabilidade é
best-effort e nunca altera o resultado do lifecycle principal. A página global de
Atividade expõe esses eventos e oferece navegação de volta para Stacks.

## Estado do MVP backend

O MVP de Stacks cobre definição persistida, topologia, Check, Start, Stop e Restart
seguro nos domínios suportados, UI básica, navegação para domínios responsáveis,
timeline operacional e discovery confirmado de relações Compose.

Adapters mutáveis adicionais são extensões futuras, não requisito para o fechamento
do MVP. Cada operação futura deve continuar delegando ao domínio proprietário e
preservar ownership, revalidação e limites de segurança.
