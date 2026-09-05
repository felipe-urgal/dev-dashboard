# Docker Compose

O domínio Docker Compose usa o **Docker Compose CLI como adapter**. O Dashboard não implementa parser YAML próprio nem conversa diretamente com a Docker Engine no primeiro desenho.

## Primeiro recorte implementado

`apps/api/src/services/docker-compose-model.ts` normaliza duas saídas estruturadas do provider:

- `docker compose config --format json`;
- `docker compose ps --all --format json`.

O serviço deste recorte apenas modela/valida dados e constrói argv fixo de inspeção. Ele ainda não inicia ou encerra containers.

## Configuração resolvida

A configuração normalizada preserva somente:

- nome lógico do Compose project quando disponível;
- serviços;
- imagem;
- profiles;
- dependências entre serviços;
- portas target/publicadas.

`environment`, build args, labels, comandos e demais estruturas que possam transportar secrets ou detalhes sem necessidade **não são copiados** para o modelo público do domínio.

As portas publicadas são convertidas pela função canônica `declaredPortsFromResolvedCompose()` do Port Registry. Assim Compose não cria uma segunda regra de declaração/ownership de portas.

## Estado runtime

O snapshot de `compose ps` preserva:

- service;
- container ID/name;
- state conhecido (`running`, `exited`, `restarting`, `created`, `paused`, `dead`);
- health (`healthy`, `unhealthy`, `starting`, `none`);
- exit code;
- portas publicadas.

Estado/health não reconhecido vira `unknown`; nunca é promovido para um estado saudável por heurística.

Campos como `Command` e endereço bruto do publisher não são transportados pelo normalizador.

## Segurança

- nenhum shell livre;
- comandos de inspeção possuem argv fixo;
- nenhum `down --volumes`, prune ou operação global;
- nenhuma credencial/environment value volta no snapshot;
- config/ps externos são tratados como input não confiável, com limites de serviços, nomes e portas;
- a execução futura deve resolver `cwd` a partir do Project validado no backend.

## Próximos recortes

A próxima etapa conecta o modelo a um provider executável com disponibilidade do Docker/Compose, timeout e limite de output; depois entram preflight com Port Registry e ações explícitas `up/stop/restart/logs` com ownership do Compose project.

Nenhuma ação destrutiva entra implicitamente nesse caminho.
