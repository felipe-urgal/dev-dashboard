# Task 117 — Smoke E2E de snapshot/restore de banco de dados

## Contexto

Item pendente em `tasks/PENDENCIAS.md`: "Expandir o Playwright para
operações de banco de dados (snapshot/restore) — exige um serviço de banco
na fixture." Scripts (task 106), mutações de branch Git (task 107) e commit
(task 108) já tinham cobertura; banco de dados era a última lacuna prevista
desde então.

## Decisão

Nenhum banco de verdade (MySQL/Postgres) no ambiente de CI. Em vez disso,
o harness E2E ganha binários `mysqldump`/`mysql` **fake** no `PATH` do
processo da API, no mesmo espírito do `bin/sidekiq` fake já usado pelo
`sample-rails-app` (tasks 106–108) e do padrão já usado pelos testes de
unidade do próprio serviço
(`apps/api/test/database-snapshot-service.test.ts`, que já faz exatamente
isso: `mysqldump` emite um dump fixo, `mysql` só drena o stdin). Reaproveitar
esse padrão em vez de subir um serviço de banco real evita depender de
infraestrutura extra no runner de CI e mantém o smoke determinístico.

## Mudanças

- `apps/web/e2e/fixtures/server-harness.ts`:
  - `sample-rails-app` ganha `config/database.yml` (adapter `mysql2`) —
    suficiente para `DatabaseDetectionService` reconhecer um ambiente
    suportado.
  - `writeFakeDatabaseBinaries()` cria `mysqldump`/`mysql` fakes num
    diretório próprio, prefixado no `PATH` do processo da API
    (`spawn(..., { env: { PATH: dbBin + delimiter + process.env.PATH } })`).
- `apps/web/e2e/tests/project-database.spec.ts` (novo), três casos:
  - gera um snapshot e completa o fluxo de restore em duas etapas (pedir →
    confirmar), contra `sample-rails-app`;
  - cancela a confirmação de restore sem completar a segunda etapa;
  - `sample-node-app` (sem `config/database.yml`/`DATABASE_URL`) não exibe
    a aba "Banco de dados" — a condição `databaseSupported` já esconde o
    link quando não há ambiente detectado, então o teste correto é
    verificar a ausência do link, não tentar abrir um painel que não deveria
    aparecer (esse foi o desenho inicial do teste, corrigido depois de rodar
    contra o app real e ver o timeout).

## Fora de escopo

- Rodar contra um banco de verdade (MySQL/Postgres real) — decisão
  deliberada, ver acima.
- Cobrir Postgres além de MySQL no smoke — um driver já basta para exercitar
  o fluxo de UI ponta a ponta; o restante da matriz de drivers já tem
  cobertura de unidade em `apps/api/test/database-snapshot-service.test.ts`.

## Arquivos

- `apps/web/e2e/fixtures/server-harness.ts`
- `apps/web/e2e/tests/project-database.spec.ts` (novo)

## Verificação

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
```

Rodei a suíte E2E completa localmente (`npx playwright test
--config=e2e/playwright.config.ts`, 24 specs) — todos passando, incluindo os
3 novos e os 21 pré-existentes (sem regressão pela mudança no fixture do
`sample-rails-app`).
