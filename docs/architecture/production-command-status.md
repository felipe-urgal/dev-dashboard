# Production Command Status v1

Projetos com `production.strategy=command` usam `prod:status` como leitura autoritativa e somente leitura da revision atualmente observada em produção.

## Protocolo

O script pode emitir os banners normais do package manager, mas deve emitir exatamente uma linha:

```text
DEV_DASHBOARD_PRODUCTION_STATUS_V1={"version":1,"revision":"<40-hex>","state":"ready"}
```

O JSON aceita somente:

- `version: 1`;
- `revision`: SHA Git completo de 40 caracteres hexadecimais;
- `state`: `ready`, `degraded` ou `unavailable`.

Campos extras, JSON inválido, mais de uma linha de protocolo, saída excessiva, exit code diferente de zero ou timeout deixam o estado de produção inconclusivo. O Dashboard não usa histórico de deployment como substituto da leitura viva.

## Semântica

- `ready` + revision igual a `origin/<production.branch>`: produção `in-sync`;
- `ready` + revision diferente: `drift`;
- `degraded`: revision é preservada para diagnóstico, mas Release Readiness não recebe `pass`;
- `unavailable`: produção é tratada como falha operacional;
- status ausente/inválido/timeout: estado `unknown`.

A revision de destino é lida do remote `origin` e a revision de produção vem somente de `prod:status`. Nenhum segredo ou stdout bruto é persistido.
