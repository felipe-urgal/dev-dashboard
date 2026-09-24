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
