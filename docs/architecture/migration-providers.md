# Migration Providers

Migration Providers separam inspeção read-only de qualquer execução mutável. O contrato comum precisa permanecer conservador: ausência de evidência nunca equivale a “sem migrations pendentes”, e mutation nunca recebe shell/path de autoridade do browser.

## Inspeção read-only

O contrato atual usa `MigrationProvider` + `MigrationOverview`.

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

O primeiro slice mutável é backend-only e **não executa migrations reais ainda**.

`MigrationMutationProvider` estende o provider comum com duas fases separadas:

- `planMutation`: produz apenas comando estruturado backend-owned;
- `executeMutation`: contrato de execução futura, ainda sem provider real habilitado neste slice.

O coordenador não aceita `cwd`, executable ou argv do browser. O `cwd` e o runtime vêm exclusivamente de `DevelopmentEnvironmentInstanceStore.resolveForProject()`.

### Plano

`MigrationMutationPlanningService` gera um plano hashado contendo:

- projeto;
- provider;
- operação `apply`;
- database lógico;
- `environmentInstanceId`;
- runtime;
- evidência usada no preflight;
- comando estruturado somente quando o preflight está `ready`;
- `planHash` SHA-256 vinculado a todo o plano interno.

O comando interno ainda não possui schema HTTP e não deve ser serializado diretamente para o browser em slices futuros.

### Preflight

O preflight é fail-closed.

`ready` exige simultaneamente:

- Environment Instance resolvida pelo backend;
- runtime `host` neste primeiro corte;
- provider de mutation compatível;
- `MigrationOverview.provider` igual ao provider mutável;
- overview com estado `pending`;
- provider produzindo comando estruturado válido e sem shell wrapper.

Estados que não satisfazem essas provas ficam `blocked` ou `unavailable`.

Exemplos:

- Environment Instance inexistente/degradada: erro de planejamento;
- runtime `devcontainer`: bloqueado até existir adapter próprio;
- `up-to-date`: bloqueado, pois não há mutation necessária;
- `unknown` / `unavailable`: indisponível;
- provider divergente entre inspeção e mutation: indisponível;
- falha de provider ou comando inválido: indisponível sem expor detalhes internos.

## Confirmação

`MigrationMutationConfirmationService` segue o mesmo padrão de confirmação curta usado em outros domínios:

- token aleatório de 32 bytes;
- TTL curto;
- uso único;
- vínculo a projeto, Environment Instance, provider, operação e `planHash`;
- somente planos com preflight `ready` podem receber confirmação.

Em um slice de execução, o coordenador deve reconstruir/revalidar o plano antes de consumir a confirmação. O token não transforma evidência stale em autorização válida.

## Compatibilidade com o Rails existente

O Rails PTY existente permanece intacto neste corte. Nenhuma rota ou UI foi redirecionada para o novo contrato.

A migração do Rails só deve ocorrer quando o coordenador comum de execução puder preservar streaming/cancelamento, Environment Instance, revalidação do plano e confirmação sem regressão.

Prisma e providers custom também continuam read-only até terem adapters de mutation explícitos sob o mesmo contrato.
