# Dev Containers

Issue de origem: #595.

A integração de Dev Containers reutiliza a `DevelopmentEnvironmentInstance` existente. Ela não cria uma segunda identidade de ambiente nem uma engine paralela de execução.

## Primeiro corte: discovery read-only

O discovery reconhece apenas as localizações padrão da Dev Container CLI:

- `.devcontainer/devcontainer.json`;
- `.devcontainer.json`.

A configuração é considerada somente quando o arquivo é regular. Symlinks são ignorados nesse primeiro corte para não atravessar silenciosamente a raiz do projeto.

Quando existe configuração, o backend executa somente comandos estruturados da CLI:

1. `devcontainer --version`;
2. `devcontainer read-configuration --workspace-folder <project> --include-configuration --log-format json`.

Discovery não executa `up`, `exec`, `run-user-commands` nem lifecycle hooks.

## Contrato sanitizado

O snapshot interno preserva somente:

- estado do discovery;
- timestamp de observação;
- origem da configuração;
- versão da CLI;
- tipo resumido: `image | dockerfile | compose | unknown`;
- nome e service quando seguros e bounded;
- nomes dos lifecycle hooks declarados.

Valores de `remoteEnv`, `containerEnv`, comandos de lifecycle, mounts, paths internos e stdout/stderr brutos não entram no snapshot.

Falhas de CLI, parse ou filesystem viram estados explícitos e mensagens sanitizadas. Ausência de evidência não é promovida a ambiente utilizável.

## Superfície HTTP read-only

O discovery é exposto por:

`GET /api/projects/:projectId/dev-container`

A rota resolve o `Project` no backend e devolve somente o snapshot sanitizado do discovery. O schema HTTP é fechado: campos internos extras, configuração bruta, env, mounts, comandos e outros dados não declarados são descartados.

Estados como `cli-missing`, `unavailable` e `invalid-output` continuam respostas válidas de inspeção; a API não os promove a runtime utilizável.

## UI read-only

A ferramenta `Dev Container` no projeto consome o lifecycle preflight da Environment Instance selecionada. O preflight reutiliza internamente o discovery e preserva o resumo sanitizado necessário para que a tela faça **uma única inspeção por refresh**.

A UI deixa explícitos:

- estado `review | blocked | unavailable`, refinado pelo estado do discovery quando indisponível;
- runtime real da Environment Instance: `host | devcontainer`;
- tipo resumido da configuração;
- versão da Dev Container CLI;
- origem, nome seguro e serviço Compose quando disponíveis;
- nomes dos lifecycle hooks declarados;
- diagnóstico e limitações conhecidas, incluindo cleanup pendente e hooks diferidos.

A navegação preserva `environmentInstanceId`, mas não concede autoridade de path/cwd ao browser. A tela oferece apenas atualização do preflight e não possui ações de `up`, rebuild, exec, Terminal ou cleanup; `executionEnabled=false` permanece explícito.

## Lifecycle preflight read-only

Antes de qualquer mutation, o backend oferece:

`GET /api/projects/:projectId/dev-container/lifecycle-preflight`

Opcionalmente, a rota aceita somente `environmentInstanceId`. O backend resolve o `cwd` e o runtime a partir da Environment Instance; path, programa, argv, mounts e env não são autoridade do browser.

O preflight usa três estados:

- `review`: configuração `image` ou `dockerfile` estruturalmente elegível para revisão humana, mas ainda com `executionEnabled=false`;
- `blocked`: existe um blocker conhecido que impede avançar;
- `unavailable`: discovery/configuração não produziram evidência suficiente.

Regras fail-closed do primeiro corte:

- `initializeCommand` bloqueia o lifecycle, pois é um hook executado no host durante inicialização;
- configurações baseadas em Compose ficam bloqueadas até compartilhar ownership com o domínio Docker Compose;
- configuração de tipo `unknown` não recebe lifecycle;
- hooks pós-criação ficam apenas sinalizados como diferidos para futura execução controlada;
- todo plano em `review` exige confirmação futura;
- **nenhum plano habilita execução neste corte**.

A decisão de manter `executionEnabled=false` também evita criar um recurso sem cleanup completo: a Dev Container CLI atual oferece `up` e `exec`, mas ainda não implementa `stop`/`down`. Além disso, `--skip-post-create` omite os hooks pós-criação, mas não lista `initializeCommand` entre os hooks suprimidos. O executor mutável só deve entrar quando ownership e cleanup estiverem definidos de ponta a ponta.

## Ownership persistente preparado

Antes de habilitar `devcontainer up`, o backend mantém uma base de ownership separada por `environmentInstanceId`.

O store usa duas fases:

- `starting`: reserva persistida **antes** de criar o runtime, com token opaco gerado pelo backend;
- `owned`: a mesma reserva recebe o `containerId` estruturado retornado pela Dev Container CLI.

O vínculo inclui projeto, Environment Instance, path resolvido pelo backend e origem da configuração. Uma Environment Instance ou path já reservado não pode ser sobrescrito por outra criação.

O token foi desenhado para virar um `--id-label` backend-owned no executor futuro. Assim, se `devcontainer up` criar um container e falhar antes de retornar o envelope final, o cleanup poderá localizar apenas recursos marcados por uma reserva previamente persistida, em vez de inferir ownership por nome ou por containers globais.

O estado é escrito atomicamente fora do repositório. Arquivo ausente significa nenhum ownership conhecido; arquivo existente mas inválido/corrompido falha fechado. `release` exige projeto + Environment Instance + path + token exatos.

Este corte ainda não executa `up`, Docker stop/rm nem altera a Environment Instance.

## Adapter estruturado de criação

O comando futuro de criação já possui um adapter puro, ainda sem execução:

- programa fixo `devcontainer`;
- subcomando fixo `up`;
- `--workspace-folder` e `--config` derivados somente do contexto/backend;
- `--id-label devdashboard.environment=<token>` usando a reserva de ownership;
- `--skip-post-create` para não executar hooks pós-criação neste estágio;
- `--no-lockfile` para não modificar o repositório como efeito colateral do start;
- `--log-format json` para localizar o envelope final estruturado;
- nenhum `--remove-existing-container`, mount ou env adicional.

O parser procura somente o envelope final `outcome: success | error` na cauda limitada da saída. Em sucesso, preserva apenas `containerId`, usuário/workspace remotos bounded e `composeProjectName` quando presente. Em erro, preserva apenas `containerId` e `didStopContainer` quando estruturados. Mensagens, configuração, env e logs brutos não viram contrato.

`composeProjectName` é mantido internamente para permitir que o executor futuro detecte fail-closed uma configuração que tenha mudado para Compose depois do preflight.

Este adapter não chama `execFile`/`spawn`; ele apenas fecha argv e parsing antes do lifecycle mutável.

## Cleanup Docker scoped preparado

Como a Dev Container CLI de referência ainda não implementa `stop`/`down`, o cleanup futuro de configurações `image`/`dockerfile` usa um adapter Docker estritamente limitado ao ownership do Dashboard.

O adapter é puro e ainda não executa comandos. Ele prepara:

- descoberta por `docker container ls --all --quiet --no-trunc --filter label=devdashboard.environment=<token>`;
- falha fechada quando um token aponta para mais de um container;
- inspect do container exato com `--type container` e `--format` constante que retorna apenas `containerId | ownershipToken | running`;
- validação conjunta de `containerId` + label antes de qualquer cleanup;
- `docker container stop <containerId>`;
- `docker container rm <containerId>` sem `--force` e sem `--volumes`.

O inspect deliberadamente não retorna o objeto Docker completo, evitando transportar labels, mounts, env ou metadata que não participam da prova de ownership. A remoção não solicita exclusão de volumes.

Configurações Dev Container baseadas em Compose continuam fora deste adapter e permanecem bloqueadas até compartilhar ownership com o domínio Docker Compose existente.

## Confirmação de lifecycle preparada

A primeira criação terá confirmação explícita e curta. O serviço de confirmação é efêmero, single-use e vincula o token a um fingerprint semântico do preflight:

- projeto e Environment Instance;
- operação;
- runtime;
- estado/reason do preflight;
- estado do discovery;
- origem/versão da CLI;
- tipo, nome/serviço e nomes de hooks;
- limitações conhecidas.

Timestamp de observação e texto diagnóstico não entram no fingerprint, para permitir revalidação equivalente em outro instante. Qualquer mudança operacional relevante invalida a confirmação.

Somente preflight `review` de configuração `image | dockerfile`, em runtime `host` e marcado como `requiresConfirmation=true`, pode gerar ou consumir confirmação. Tokens expiram em 60 segundos por padrão e são consumidos uma única vez.

Este corte não expõe endpoint de confirmação e ainda não executa criação.

## Cleanup owned executável internamente

Sobre o adapter Docker scoped, existe um serviço interno de cleanup. Ele ainda não possui rota/UI, mas já fecha o lifecycle de remoção para um runtime owned:

1. resolve a Environment Instance no backend, inclusive quando está `degraded` após restart;
2. lê o ownership persistido pelo vínculo exato projeto + Environment Instance + path;
3. localiza o container somente pelo label opaco;
4. quando o ownership já está `owned`, exige que o ID encontrado seja o mesmo `containerId` persistido;
5. reinspeciona ID + label antes de mutar;
6. marca a Environment Instance como `stopping`;
7. executa `docker container stop <id>` somente quando necessário;
8. comprova que o container parou ou desapareceu;
9. executa `docker container rm <id>` sem force/volumes;
10. comprova ausência pelo mesmo label;
11. só então libera ownership e volta a Environment Instance para `runtime=host, lifecycle=ready`.

Uma reserva `starting` também pode ser recuperada pelo label caso uma futura criação falhe depois de criar o container mas antes de persistir o `containerId`.

Se o container já não existir, o serviço libera apenas o registro de ownership e normaliza o ambiente para host; nenhum recurso externo é removido. Ambiguidade, mismatch, falha de Docker ou falha ao liberar ownership deixam o estado fail-closed e, após mutation iniciada, marcam o lifecycle como `failed`.

Os comandos são executados sem shell, com timeout e buffer limitados, e erros brutos de Docker/filesystem não entram no erro de domínio.

## Fora deste corte

Os cortes entregues até aqui não:

- criam ou sobem containers;
- executam comandos dentro do runtime;
- alteram `ExecutionContext`;
- abrem Terminal no container;
- fazem rebuild/stop/cleanup;
- integram Compose ou Port Registry;
- concedem qualquer autoridade mutável pela API.

Lifecycle entra em recortes posteriores, com ownership comprovado, confirmação explícita e reuso dos domínios existentes.
