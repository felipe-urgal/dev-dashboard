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

A revisão canônica da Stack aprovada no Check inicial é mantida durante todo o Start. Se a reobservação após uma mutação mostrar outra revisão/topologia, a próxima etapa é marcada `blocked` e **nenhum próximo owner é invocado**. Steps já executados continuam no resultado; não há rollback, repetição de operação nem uso da nova definição como autoridade para concluir o plano antigo. Essa proteção é um fence observacional por revisão, não substitui locks distribuídos nem um Job durável com reconciliação pós-crash. Alterações simultâneas posteriores à última leitura de Check ainda exigem fencing pelo owner antes da próxima mutação; a revisão não concede exclusividade nem autoriza reexecutar passos que possam ter sido concluídos por outra instância.

## Stop coordenado

`POST /api/stacks/:stackId/stop` percorre `stopOrder`, que é a ordem reversa da topologia.

Nodes `compose-service` delegam ao `DockerComposeLifecycleService.stop(project, service)`, preservando ownership persistido e limitando a mutação ao serviço explicitamente associado. Nodes `process` só são parados quando `processId`, `projectId` e `environmentInstanceId` ainda correspondem ao processo reconciliado pelo Process Manager. Server, worker, webpack e test usam os métodos de stop do próprio domínio; tipos sem adapter seguro ficam `blocked`.

Nodes `environment` e `health-check` são `retained`: Environment Instance é contexto operacional, não um processo genérico, e health check é somente leitura. O Stop não tenta encerrar checkout, worktree, container ou serviço externo por heurística.

Resultado parcial continua explícito como `completed`, `blocked` ou `failed`, com steps por node e um `StackCheck` final.

O Stop aplica o mesmo fence entre nodes: uma alteração de revisão detectada na reobservação após o Stop anterior interrompe a sequência antes de alcançar qualquer recurso da nova topologia, incluindo Compose reatribuído a outro serviço ou processo de outro ambiente. O resultado preserva `stopped` dos nodes já confirmados e `blocked` para a próxima etapa. Nenhuma recuperação automática ou autorização para retry é inferida.

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

### Administração pela interface

`GET /api/stacks/resources` oferece um catálogo somente leitura e autenticado
dos recursos que o servidor consegue identificar. Environment Instances vêm do
store local; processos exigem vínculo comprovado com Project e Environment
Instance; o health check de servidor é uma identidade conhecida; serviços
Compose só são oferecidos quando a configuração estruturada coincide com o
ownership do domínio Compose. Falhas de descoberta não inventam recursos.

A interface permite criar a primeira Stack e editar a topologia existente
usando exclusivamente targets escolhidos nesse catálogo. O browser cria apenas
identidades locais de nodes e dependências explícitas: não envia path, command
ou argv. O backend permanece responsável pela validação da definição,
referências básicas, ciclos e revisão esperada nas edições. Alvos previamente
persistidos podem continuar visíveis mesmo quando não aparecem no catálogo
atual, para permitir inspeção e remoção sem adotar recursos externos.

A confirmação de Stop conserva a revisão conhecida no início do diálogo e
recusa Checks cuja definição não corresponde à Stack exibida. Isso **não**
transforma o Stop em confirmação backend de plano multi-node, não cria um
job agregador e não substitui fencing físico entre Stacks distintas.

## Journal opt-in de operações (base de recovery)

O backend possui `StackOperationJournal`, um journal local de **metadados** versionados e limitados por tamanho (diretório `stack-operations-v1`, permissões `0700`/`0600`), com ID aleatório para cada solicitação e lock exclusivo por identidade da Stack (hash SHA-256 do ID). O journal registra intenção, revisão aceita, ordem de nodes e, após resposta do owner, somente `nodeId`/`state` dos steps retornados. Nunca persiste logs, caminhos, comandos ou diagnósticos brutos.

**Não é habilitado automaticamente no bootstrap**: sem uma interface/procedimento completo de revisão manual, uma operação `blocked`/`failed` ou interrompida deixa o lock deliberadamente retido. Testes e injeções de bootstrap confiáveis podem passar `stackOperationJournal` ao `buildApp`. Nesse modo, as rotas existentes Start/Stop/Restart verificam o Check e a revisão antes de persistir o intent e executar o owner; respostas podem incluir `operationId`. O endpoint autenticado `GET /api/stacks/:stackId/operations` oferece snapshots read-only. Activity/Jobs reutiliza esse journal como leitor de Jobs `stack-operation`, navegando a Stacks sem cancelamento. Sem injeção confiável, o endpoint retorna lista vazia e o lifecycle conserva o comportamento atual.

- Outra instância que observe uma operação `running` não pode presumir que seu processo original morreu; exibe `reconciliation-required`, sem replay nem autorização de novo dispatch.
- Resultados `completed` liberam a reivindicação; `blocked`, `failed` e erros incertos conservam o lock até revisão explícita futura. Falhas ao escrever o journal também bloqueiam por precaução.
- Os steps **não são atualizados ao vivo durante a execução HTTP** nesta primeira etapa: caso o processo caia, os passos em andamento são desconhecidos e devem ser reconciliados com o owner real. Não há retomada de mutações, rollback, fencing físico entre Stacks que compartilham serviços, lock distribuído entre filesystems, garantia contra queda abrupta antes do flush, nem interface de desbloqueio.
- A operação continua síncrona e vinculada ao request HTTP; este journal não deve ser apresentado como recuperação completa até que exista etapa durável por node, verificação pós-crash e controle manual do recurso.

## Resultado de operação por node (UI)

A resposta já existente de `POST Start/Stop/Restart` inclui `state`, os `steps` efetivamente processados (ou `nodeId` em Restart), `diagnostic` e um `StackCheck` ao término. A página de Stacks agora mantém **por Stack** o resultado da última operação retornada e o exibe separadamente do Check de saúde observado.

- `started/stopped/restarted` representam resultados retornados pelos owners existentes; `already-ready/already-stopped` não executam nova mutação; `retained` significa que o node não foi encerrado; `blocked` não significa que a operação foi executada; `failed` é falha reportada no passo, sem afirmar rollback.
- Apenas nodes presentes em `result.steps` (ou o target do Restart) são exibidos como resultados; os demais **não** ganham um evento de sucesso/falha presumido.
- Resultados são descartados antes de uma nova tentativa na mesma Stack e quando a revisão da definição muda; outras Stacks conservam seus resultados independentes. Nada é persistido no browser/servidor e nenhuma consulta adicional, polling ou comando é introduzido.
- Esta é uma evidência do **retorno daquela solicitação**, não um plano executável, cronologia durável ou atualização em tempo real. A leitura agregada de logs e o Check existentes continuam separados; Jobs reanexáveis do lifecycle multi-node ainda não são fornecidos pela orquestração de Stacks.

## Logs agregados

`GET /api/stacks/:stackId/logs` oferece uma leitura bounded dos logs dos nodes sem
transferir ownership para o domínio Stack.

Nodes `compose-service` reutilizam `DockerComposeLifecycleService.logs` para o
serviço explicitamente associado, preservando ownership, masking e truncation do
domínio Compose. Nodes `process` revalidam `processId + projectId +
environmentInstanceId` contra o Process Manager e usam o reader correspondente ao
tipo reconciliado do processo. Logs de `script` continuam pertencendo a Script
Execution e não são agregados por Stacks.

Environment Instance e health check não possuem stream próprio e aparecem como
`unsupported`. Falha de leitura ou drift de ownership afeta somente o node
correspondente como `unavailable`; o snapshot dos demais nodes continua útil.

A UI carrega esse snapshot sob demanda e permite atualização manual. Não existe novo
streaming, persistência duplicada ou executor de comandos nesse fluxo.

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
