# Migration Providers

Migration Providers separam inspeção read-only, planejamento e execução mutável. Ausência de evidência nunca equivale a “sem migrations pendentes”, e nenhuma mutation recebe `cwd`, executable ou argv como autoridade do browser.

## Inspeção read-only

O contrato usa `MigrationProvider` + `MigrationOverview`.

Estados:

- `up-to-date`: o provider comprovou que não há migrations pendentes;
- `pending`: o provider comprovou pendências;
- `unavailable`: a inspeção não pôde ser executada;
- `unknown`: houve execução/evidência, mas não foi possível classificar com segurança.

Providers atuais:

- Rails reutiliza a inspeção estruturada já existente;
- Prisma usa `npx --no-install prisma migrate status --schema <schema conhecido>` sem inferir pendências de texto livre;
- custom usa comando estruturado confiável + semântica explícita por exit code.

`MigrationOverviewService` escolhe provider de forma determinística e falha fechado.

## Contrato comum de mutation

`MigrationMutationProvider` estende o provider read-only somente com `planMutation`. O provider descreve um comando estruturado backend-owned; ele não controla lifecycle, streaming, cancelamento nem confirmação.

Essa separação evita criar uma engine por framework. Execução pertence a `MigrationMutationExecutionService`, que reutiliza `DetachableExecutionService`.

### Plano e identidade de execução

`MigrationMutationPlanningService` gera um plano contendo:

- projeto;
- provider;
- operação `apply`;
- database lógico;
- `environmentInstanceId`;
- runtime;
- `executionContextHash` opaco;
- evidência usada no preflight;
- comando estruturado somente quando o preflight está `ready`;
- `planHash` SHA-256.

O `executionContextHash` inclui internamente project/environment/cwd/runtime, mas não expõe o caminho. Se a Environment Instance mudar de cwd/runtime, o plano deixa de resolver para o mesmo contexto.

O `planHash` representa a autoridade estável de execução e deliberadamente não inclui timestamps. Ele incorpora `overviewHash`, fingerprint opaco de provider/status/database/applied/pending/evidence. Revalidações equivalentes preservam o hash; mudança de migrations observadas, provider, operação, database, Environment Instance, contexto, preflight ou comando produz outro hash.

O comando interno não possui schema HTTP e não deve ser serializado diretamente para o browser.

### Preflight

O preflight é fail-closed.

`ready` exige simultaneamente:

- Environment Instance resolvida pelo backend;
- runtime `host` neste corte;
- provider de mutation compatível;
- `MigrationOverview.provider` igual ao provider mutável;
- database comprovado pelo overview exatamente igual ao database solicitado;
- overview com estado `pending`;
- provider produzindo comando estruturado válido e sem shell wrapper.

Estados que não satisfazem essas provas ficam `blocked` ou `unavailable`.

Exemplos:

- Environment Instance inexistente/degradada: erro de planejamento;
- runtime `devcontainer`: bloqueado até existir adapter próprio;
- `up-to-date`: bloqueado;
- `unknown` / `unavailable`: indisponível;
- provider divergente entre inspeção e mutation: indisponível;
- fallback/mismatch de database entre pedido e inspeção: indisponível;
- falha de provider ou comando inválido: indisponível sem expor detalhes internos.

## Confirmação e revalidação

`MigrationMutationConfirmationService` usa:

- token aleatório de 32 bytes;
- TTL curto;
- uso único;
- vínculo a projeto, Environment Instance, provider, operação e `planHash`;
- confirmação apenas para preflight `ready`.

`MigrationMutationExecutionService.start()` reconstrói o plano, revalida a Environment Instance pelo `executionContextHash` e só então consome a confirmação. Um token preparado para outro plano não autoriza a execução.

## Execução destacável comum

O executor comum usa uma chave por projeto + Environment Instance e delega ao `DetachableExecutionService`.

Com isso, migration mutation ganha o mesmo comportamento já comprovado no dashboard:

- processo continua após disconnect;
- reattach recebe buffer acumulado;
- output passa pela máscara de segredos comum;
- cancelamento usa TERM → KILL;
- uma segunda mutation concorrente no mesmo ambiente é rejeitada;
- snapshot preserva provider, operação, database e `planHash`.

Ainda não existe rota HTTP comum para essa execução neste slice.

## Adapter Rails

`RailsMigrationMutationProvider` adapta somente `apply` para o catálogo existente do Rails:

- prefere `bin/rails db:migrate`;
- cai para `bundle exec rails db:migrate` quando aplicável;
- usa apenas projeto/cwd resolvido pela Environment Instance;
- não executa shell wrapper.

No primeiro corte, mutation comum Rails fica habilitável somente para um único database lógico `primary`. Projeto multi-database ou seleção de database secundário permanece fail-closed até existir comando explícito por database.

A composição da API usa esse adapter como mutation provider default, mas as rotas Rails existentes ainda não foram redirecionadas. `rollback`, `seed` e `prepare` continuam no `RailsMigrationPtyService` legado.

Prisma e providers custom continuam read-only até terem adapters mutáveis explícitos sob o mesmo contrato.
