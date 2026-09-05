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

## Lifecycle futuro

A execução real ainda deve reutilizar a infraestrutura de job/PTY destacável já existente, com:

- ownership explícito;
- limite de concorrência;
- timeout;
- cancelamento;
- cleanup no shutdown;
- logs bounded;
- indicação visual permanente de aproximação local.

Esse lifecycle não faz parte deste recorte de discovery/preflight e não deve ser simulado por processo ad-hoc.
