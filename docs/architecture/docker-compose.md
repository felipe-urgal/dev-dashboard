# Docker Compose

O domínio Docker Compose usa o **Docker Compose CLI como adapter**. O Dashboard não implementa parser YAML próprio nem conversa diretamente com a Docker Engine no primeiro desenho.

## Primeiro recorte implementado

`apps/api/src/services/docker-compose-model.ts` normaliza duas saídas estruturadas do provider:

- `docker compose config --format json`;
- `docker compose ps --all --format json`.

O serviço deste recorte modela/valida dados e constrói argv fixo de inspeção.

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

Estado/health não reconhecido vira `unknown`; nunca é promovido para um estado saudável por heurística. Protocolo de porta ausente usa o default Compose `tcp`, enquanto valor explícito não reconhecido vira `unknown` em vez de ser convertido silenciosamente.

Campos como `Command` e endereço bruto do publisher não são transportados pelo normalizador.

## Segundo recorte: provider executável read-only

`DockerComposeProvider` executa somente os dois comandos de inspeção conhecidos, sempre com `cwd=Project.path`, timeout de 5 segundos e limite de 2 MiB por saída. O provider não recebe programa, argumentos ou path do browser.

Estados de disponibilidade são explícitos:

- `available`: config e runtime válidos;
- `runtime-unavailable`: a configuração foi resolvida, mas o estado dos containers não pôde ser consultado;
- `docker-missing`: o executável Docker não está no PATH da API;
- `compose-unavailable`: o adapter Compose não conseguiu resolver a configuração;
- `invalid-output`: a saída estruturada não pôde ser validada.

Erros brutos, stderr e stdout inválido não entram no snapshot. Quando o daemon está indisponível, a configuração já validada pode continuar sendo apresentada sem inventar runtime.

## Terceiro recorte: preflight de portas

`DockerComposePreflightService` faz uma verificação **somente leitura** antes de qualquer futuro `docker compose up`. Ele recebe o `ComposeConfigSnapshot` já validado e reutiliza `config.declaredPorts` no `PortInspectorService`, mantendo o Port Registry como autoridade canônica sobre declarações e conflitos de portas.

O resultado possui três estados:

- `ready`: todas as portas publicadas que precisam ser usadas estão comprovadamente disponíveis ou já pertencem a um serviço ativo do mesmo runtime Compose;
- `blocked`: pelo menos uma porta publicada está ocupada sem evidência de que pertence ao runtime Compose atual;
- `unavailable`: o Dashboard não conseguiu provar a situação das portas com segurança.

Uma porta ocupada por processo externo, outro projeto ou owner desconhecido **bloqueia** o preflight. O serviço não depende apenas do booleano `conflict` da tela geral de portas: para iniciar Compose, ausência de ownership comprovado é suficiente para impedir um falso `ready`.

Quando o runtime já mostra um serviço ativo (`running`, `restarting` ou `paused`) usando a mesma porta publicada pelo mesmo serviço Compose, essa ocupação é tratada como esperada. Isso permite revalidar uma stack já ativa sem classificá-la como conflito contra si própria.

O preflight também falha fechado quando a inspeção de portas está `unsupported`, `unavailable` ou truncada. Nesses casos, o Dashboard não tenta adivinhar disponibilidade.

### Evidência de conflito

Para cada bloqueio, o resultado mantém somente o necessário para diagnóstico:

- porta;
- serviço(s) Compose que a publicam;
- endereço observado;
- owner conhecido como projeto/processo gerenciado, processo externo ou `unknown`;
- sugestão de porta quando o Port Registry conseguir fornecê-la.

O preflight **não** mata processos, não remapeia portas, não altera Compose e não inicia/para containers.

## Segurança

- nenhum shell livre;
- comandos de inspeção possuem argv fixo;
- `cwd` vem do `Project` conhecido pelo backend;
- timeout e limite de output são aplicados antes da normalização;
- nenhum `down --volumes`, prune ou operação global;
- nenhuma credencial/environment value volta no snapshot;
- config/ps externos são tratados como input não confiável, com limites de serviços, nomes, portas e listas de profiles/dependências;
- indisponibilidade/truncamento do Port Inspector nunca é promovida para preflight seguro;
- ownership de porta só é assumido quando existe evidência positiva do runtime Compose atual.

## Próximos recortes

As próximas etapas podem adicionar ações explícitas `up/stop/restart/logs`, desde que cada mutação tenha ownership do Compose project, confirmação adequada, lifecycle idempotente e observabilidade. HTTP/UI só devem consumir contratos estáveis já comprovados pelo domínio.

Nenhuma ação destrutiva entra implicitamente nesse caminho.
