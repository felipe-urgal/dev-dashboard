# Task 051 — Snapshot e restore de banco no painel

## Status

Implementação concluída. `typecheck`, `build`, `test` e o smoke Playwright
aprovados; fluxo completo (gerar → listar → confirmar → restaurar) verificado
com a API real, usando clientes de banco simulados no `PATH`.

## Objetivo

Levar ao painel de banco o equivalente ao `db:snapshot` e `db:restore` do CLI
bash: guardar o estado do banco antes de trocar de branch e restaurá-lo quando
necessário, sem que o navegador escolha host, usuário, banco ou caminho.

## Resultado

### API

- `DatabaseSnapshotService` gera o dump com o cliente do próprio banco
  (`mysqldump` ou `pg_dump`), comprime com gzip e grava em
  `<estado>/db-snapshots/<projeto>/<uuid>.sql.gz`, com metadados em
  `<uuid>.json` (diretório `0700`, arquivos `0600`);
- o rótulo do snapshot vem da branch atual do projeto, como no CLI;
- retenção de 10 snapshots por projeto, aplicada a cada criação;
- restore lê o `.sql.gz`, descomprime e alimenta `mysql`/`psql` por stdin;
- rotas novas:
  - `GET /projects/:projectId/database/snapshots`
  - `POST /projects/:projectId/database/snapshots`
  - `POST /projects/:projectId/database/snapshots/:snapshotId/restore/confirmation`
  - `POST /projects/:projectId/database/snapshots/:snapshotId/restore`
- contratos novos: `DatabaseSnapshot`, `DatabaseSnapshotList`,
  `DatabaseSnapshotConfirmation`, `DatabaseRestoreResult`.

### Interface

- nova aba **Snapshots** no explorador de banco, disponível para qualquer tipo
  de projeto (não é exclusiva de Rails);
- métricas de quantidade, ambiente de origem e data do último snapshot;
- botão **Gerar snapshot**, desabilitado quando nenhum ambiente MySQL ou
  PostgreSQL foi detectado, com o motivo explicado em tela;
- lista com rótulo, data, banco, driver e tamanho;
- **Restaurar** abre a confirmação inline ("Restaurar sobrescreve o banco
  atual") com Confirmar/Cancelar — só o Confirmar dispara a operação.

## Segurança

Seguindo o checklist de `docs/architecture/security.md`:

- o navegador envia apenas o id do ambiente e o id do snapshot; host, porta,
  usuário, senha e banco vêm sempre da detecção do próprio projeto. Campos de
  conexão enviados no corpo são descartados pelo schema;
- o id do snapshot é validado como UUID no schema da rota e na leitura dos
  metadados — o caminho do arquivo é sempre montado internamente;
- os subprocessos são criados com `spawn` sem `shell`, com argumentos fixos por
  driver; a senha vai por `MYSQL_PWD`/`PGPASSWORD`, nunca na linha de comando;
- restore exige confirmação em duas etapas: token aleatório de 32 bytes, TTL de
  um minuto, vinculado ao projeto e ao snapshot, comparado com `timingSafeEqual`
  e consumido na primeira tentativa;
- as respostas trazem apenas metadados — o dump nunca é servido, e não existe
  rota de download;
- os arquivos ficam no diretório de estado (`~/.local/state/dev-dashboard`),
  fora de qualquer diretório servido estaticamente;
- teto de 512 MB por dump e timeout de 10 minutos: ao estourar, o processo é
  encerrado e o arquivo parcial é removido;
- adaptadores fora de MySQL/PostgreSQL são recusados com
  `DATABASE_SNAPSHOT_UNSUPPORTED`; cliente ausente no `PATH` vira
  `DATABASE_SNAPSHOT_TOOL_MISSING`.

## Arquivos principais

- `apps/api/src/services/database-snapshot-service.ts`
- `apps/api/src/services/database-detection-service.ts`
- `apps/api/src/routes/database.ts`
- `apps/api/src/http/response-schemas/rails.ts`
- `apps/api/src/http/api-error.ts`
- `apps/api/src/app-context.ts`
- `apps/web/src/composables/useProjectDatabaseSnapshots.ts`
- `apps/web/src/components/ProjectDatabasePanel.vue`
- `apps/web/src/database/snapshots.css`
- `apps/web/src/api/rails.ts`
- `packages/contracts/src/database.ts`

## Testes

- `apps/api/test/database-snapshot-service.test.ts` — criação e compressão,
  ambiente inexistente, adaptador sem suporte, cliente ausente, restore em duas
  etapas com token de uso único, confirmação que não vale para outro snapshot,
  snapshot inexistente, retenção e falha do cliente sem deixar arquivo pela
  metade;
- `apps/api/test/database-snapshot-routes.test.ts` — token exigido, listagem,
  criação, campos de conexão do corpo ignorados, id fora do formato UUID,
  restore sem confirmação, restore em duas etapas, ausência de caminho de
  arquivo na resposta e projeto inexistente;
- `apps/web/test/project-database-snapshots.test.ts` — estado vazio, criação,
  confirmação em duas etapas, cancelamento e erro devolvido pela API.

## Limitações

- snapshots agendados, upload e download pelo navegador seguem fora do escopo;
- só MySQL/MariaDB e PostgreSQL: outros adaptadores aparecem como não
  suportados;
- não há remoção manual de um snapshot — a retenção de 10 é quem limpa;
- o restore usa o ambiente registrado no snapshot; se aquele ambiente sumir da
  detecção, a operação é recusada em vez de escolher outro;
- a interface não acompanha o progresso do dump: a ação fica em "Gerando
  snapshot…" até a API responder.
