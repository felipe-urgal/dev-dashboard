# Security Center

O Security Center é uma superfície local e read-only de triagem. O provider atual é o Trivy para `secret` e `misconfiguration`, sempre executado pelo backend com argv fechado e cwd resolvido pelo projeto conhecido.

## Contrato de segurança

- o browser envia somente `projectId` e body vazio para iniciar um scan;
- stdout/stderr bruto, `Match`, trechos de código e conteúdo de secret não entram no DTO público;
- findings são normalizados por allowlist e bounded antes de sair do provider;
- `truncated`, `limit` (1.000) e `observedCount` (bounded em 1.000.000) indicam completude; entradas descartadas por segurança também tornam o scan inconclusivo;
- referências externas permitem só http/https sem credenciais, query string ou fragmento;
- scanner ausente é capability opcional e não derruba o restante do Dashboard;
- não existe instalação automática nem shell controlado pelo browser.

## Snapshot persistido

O Dashboard persiste somente o último `SecurityScanResult` concluído e já sanitizado de cada projeto.

- um arquivo bounded e atômico por `projectId`, com modo `0600`;
- o registro é vinculado a `projectId + projectPath`, evitando reaproveitar evidência de outro checkout;
- campos não pertencentes ao DTO sanitizado são descartados antes da escrita;
- falha ou output inválido não substitui o último snapshot válido;
- não existe histórico bruto de scans neste corte;
- snapshots antigos sem metadados de completude continuam consultáveis, mas são tratados como incompletos;
- o backend permite somente um scan por projeto de cada vez; novas solicitações recebem `execution.state: busy`, enquanto o GET retorna `inProgress`;
- logs estruturados registram somente início, sucesso ou falha com identificador de projeto e contagens, nunca stdout ou Match.

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
- `critical/high` em snapshot fresh: `block`, mesmo quando parcial;
- snapshot parcial, truncado ou legado sem blocker conhecido: `unknown` (nunca `pass`);
- severity `unknown` sem blocker conhecido: `unknown`;
- somente `medium/low` em snapshot fresh: `warning`;
- snapshot fresh, completo e sem findings: `pass`.

A ação do check leva ao Security Center. Essa integração não altera a autoridade do browser e não transforma o resultado em permissão para merge, push, deploy ou release.

## Triagem na UI

A interface distingue `Fresh`, `Stale` e `Nunca executado`. Snapshots stale permanecem visíveis, mas não comprovam readiness atual. A tabela permite filtrar severidade e categoria localmente, sem alterar as contagens globais. Cada finding possui detalhe expansível com regra, categoria, severidade, arquivo/linha, remediação e referência http/https. Match, conteúdo de arquivo e stdout não são renderizados. O estado de execução simultânea é consultado e atualizado até o fim do scan.
