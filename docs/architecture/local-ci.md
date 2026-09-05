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

## Primeiro recorte implementado

`apps/api/src/services/local-ci-act.ts` estabelece o contrato interno de catálogo e a construção segura das intenções do provider.

Workflows aceitos precisam estar sob `.github/workflows/` e terminar em `.yml` ou `.yaml`. A execução de um job só pode ser construída se a combinação workflow/job/evento já existir no catálogo fornecido pelo discovery.

O argv de execução é limitado à forma:

```text
act <evento> --job <job-id> --workflows <workflow-file>
```

Nenhum parâmetro de secret, mount, path externo ou flag arbitrária é derivado da UI.

## Descoberta

Este recorte deliberadamente **não parseia por regex o output tabular do `act --list`**. O catálogo deve ser preenchido por uma fonte de discovery confiável em recorte posterior. Se a versão instalada não oferecer saída estável o suficiente, a integração deve manter estado `unsupported/unknown` em vez de inventar interpretação.

## Lifecycle futuro

A execução real deve reutilizar a infraestrutura de job/PTY destacável já existente, com:

- ownership explícito;
- limite de concorrência;
- timeout;
- cancelamento;
- cleanup no shutdown;
- logs bounded;
- indicação visual permanente de aproximação local.
