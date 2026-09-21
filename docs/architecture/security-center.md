# Security Center

O Security Center é uma superfície local e read-only de triagem. O provider atual é o Trivy para `secret` e `misconfiguration`, sempre executado pelo backend com argv fechado e cwd resolvido pelo projeto conhecido.

## Contrato de segurança

- o browser envia somente `projectId` e body vazio para iniciar um scan;
- stdout/stderr bruto, `Match`, trechos de código e conteúdo de secret não entram no DTO público;
- findings são normalizados por allowlist e bounded antes de sair do provider;
- scanner ausente é capability opcional e não derruba o restante do Dashboard;
- não existe instalação automática nem shell controlado pelo browser.

## Snapshot persistido

O Dashboard persiste somente o último `SecurityScanResult` concluído e já sanitizado de cada projeto.

- um arquivo bounded e atômico por `projectId`, com modo `0600`;
- o registro é vinculado a `projectId + projectPath`, evitando reaproveitar evidência de outro checkout;
- campos não pertencentes ao DTO sanitizado são descartados antes da escrita;
- falha ou output inválido não substitui o último snapshot válido;
- não existe histórico bruto de scans neste corte.

A leitura fica em:

`GET /api/projects/:projectId/security-center/snapshot`

A resposta inclui `storedAt` e freshness calculada a partir de `result.observedAt`. A janela atual é de 24 horas:

- `fresh`: idade menor ou igual a 24h;
- `stale`: idade superior a 24h.

Freshness é evidência, não autorização. Timestamp futuro também é tratado como `stale`, evitando promover clock skew ou estado adulterado a evidência recente.

## Release Readiness

O Release Readiness lê somente o snapshot persistido; ele nunca dispara um scan automaticamente.

Política explícita:

- sem snapshot: `unknown`;
- snapshot `stale`: `unknown`;
- `critical/high` em snapshot fresh: `block`;
- severity `unknown` sem blocker conhecido: `unknown`;
- somente `medium/low` em snapshot fresh: `warning`;
- snapshot fresh sem findings: `pass`.

A ação do check leva ao Security Center. Essa integração não altera a autoridade do browser e não transforma o resultado em permissão para merge, push, deploy ou release.
