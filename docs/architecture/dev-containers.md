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
