# Local CI com act

Local CI usa `act` como provider opcional para reproduzir jobs do GitHub Actions no ambiente local. O resultado é sempre uma **aproximação local** e nunca substitui o estado remoto do GitHub CI.

## Invariantes

- `provider=act` permanece identificado no resultado;
- `approximation=true` é parte fixa da semântica;
- ausência de `act` ou Docker é estado suportado, não erro global do projeto;
- workflow, job e evento precisam vir de catálogo detectado;
- o backend constrói argv estruturado;
- não existe input de shell livre;
- secrets do GitHub e `.env` não são importados automaticamente;
- resultado local não satisfaz check remoto de Release Readiness.

## Catálogo seguro

`apps/api/src/services/local-ci-act.ts` estabelece o contrato interno de catálogo e a construção segura das intenções do provider.

Workflows aceitos precisam estar sob `.github/workflows/` e terminar em `.yml` ou `.yaml`. Paths absolutos, paths que escapam do diretório permitido e paths excessivamente longos são rejeitados. A execução de um job só pode ser construída se a combinação workflow/job/evento já existir no catálogo fornecido pelo discovery.

Job IDs e eventos usam tokens conservadores que não começam com `-`, impedindo que conteúdo do catálogo vire opção do CLI. Labels e versões são bounded; o catálogo retém no máximo 512 jobs e 64 eventos por job. A normalização monta o objeto final por allowlist, sem copiar propriedades externas extras por `spread`.

O argv de execução continua limitado à forma:

```text
act <evento> --job <job-id> --workflows <workflow-file>
```

Nenhum parâmetro de secret, mount, path externo ou flag arbitrária é derivado da UI.

## Discovery real

`apps/api/src/services/local-ci-discovery-service.ts` passa a preencher o catálogo diretamente dos workflows do repositório, sem depender de parse do output tabular do `act --list`.

A descoberta:

- resolve a raiz real do projeto;
- lê no máximo 64 arquivos `.yml|yaml` em `.github/workflows/`;
- rejeita symlinks e arquivos acima de 256 KiB;
- usa o parser `yaml` já presente no backend;
- extrai somente nome do workflow, job id/nome e eventos declarados;
- ignora workflow inválido/ilegível sem derrubar o catálogo inteiro.

O serviço não edita YAML e não tenta interpretar steps, scripts, expressions ou secrets como contrato próprio.

## Preflight de toolchain

A disponibilidade usa comandos fechados:

```text
act --version
docker info --format {{.ServerVersion}}
```

`act` ausente produz `act-missing`. Falha ao consultar o daemon Docker produz `docker-unavailable`. Quando ambos respondem, o catálogo fica `available` e preserva apenas versões curtas normalizadas; erro bruto, socket path ou stdout adicional não são transportados.

## Lifecycle de execução controlada

`apps/api/src/services/local-ci-execution-service.ts` executa somente uma seleção que continue pertencendo ao catálogo obtido imediatamente antes do start. O comando final continua vindo de `buildActJobCommand()`; o serviço de lifecycle não recebe shell nem argv livre.

Cada run recebe uma chave de ownership interna:

```text
local-ci:<projectId>:<runId>
```

Consulta e cancelamento exigem `projectId + runId`, impedindo que um run seja operado por outro projeto. A concorrência padrão é limitada a duas execuções simultâneas e cada run possui timeout de 30 minutos. Timeout e shutdown cancelam somente as chaves pertencentes ao Local CI.

A execução reutiliza `DetachableExecutionService`, portanto:

- desconexão de cliente não mata o processo;
- reattach recupera o buffer retido;
- logs passam pela máscara central de segredos;
- o buffer é bounded e sinaliza `truncated`;
- cancelamento segue TERM → KILL do lifecycle compartilhado.

### Ambiente isolado

Para Local CI, herdar todo `process.env` seria autoridade excessiva. Antes do start o serviço sobrescreve as variáveis ambientais herdadas e mantém apenas um allowlist operacional mínimo (`PATH`, `HOME`, usuário/shell, runtime temporário e contexto Docker), além de `CI=true`.

Variáveis como `GITHUB_TOKEN`, `DATABASE_URL` e demais entradas arbitrárias do processo não são propagadas. O serviço também não lê `.env`, GitHub Secrets ou parâmetros de secret da UI.

Essa barreira não transforma workflows não confiáveis em seguros: `act` ainda executa código definido no repositório com as permissões do usuário local. A UI futura deve deixar essa aproximação e esse boundary explícitos antes do start.

## Próximo recorte

Ainda faltam contrato HTTP/streaming e UI para selecionar, acompanhar, reanexar e cancelar runs. Esses consumidores devem compor o lifecycle acima, preservar permanentemente `provider=act` / `approximation=true` e não ampliar o catálogo de argv ou de ambiente.
