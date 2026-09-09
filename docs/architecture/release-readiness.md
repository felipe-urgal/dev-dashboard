# Release Readiness

Release Readiness é uma camada de decisão somente leitura que agrega evidências já produzidas pelo Dev Dashboard para responder se uma branch possui sinais suficientes para seguir no fluxo de entrega.

Ela **não autoriza merge, push ou deployment** e não substitui os preflights/revalidações executados no momento de uma mutação sensível.

## Estados

Cada check usa um estado explícito:

- `pass`: existe evidência recente e suficiente para a regra;
- `warning`: a entrega pode exigir atenção, mas a regra não é um bloqueio determinístico;
- `block`: existe uma condição verificável que impede considerar o item pronto;
- `unknown`: não existe evidência suficiente ou a evidência está stale/inconclusiva.

O estado agregado usa a ordem conservadora `block > unknown > warning > pass`. Não existe score numérico de produtividade ou confiança.

## Fontes implementadas

O núcleo em `apps/api/src/services/release-readiness.ts` normaliza quatro fontes já existentes. A integração de Migrations conecta os recortes das issues #571 e #589 sem ampliar a autoridade do Readiness.

### Git

- working tree dirty: `block`;
- detached HEAD/branch desconhecida: `warning`;
- branch sem upstream: `unknown`;
- branch com commits locais ainda não publicados: `block`;
- branch atrás da referência remota: `block`;
- branch divergente: `block`;
- `pass` somente quando há upstream conhecido, working tree limpa e `ahead=0/behind=0`.

### Testes

Somente uma execução com `scope=full-suite` e identidade compatível com o contexto atual pode produzir `pass`.

A identidade comparável segue o contrato do Test Intelligence:

- mesma `gitRevision`;
- mesmo `gitDirtyFingerprint`;
- mesmo `environmentInstanceId` quando houver identidade explícita de ambiente.

Execução `targeted`, evidência stale, identidade ausente ou incompatível permanecem `unknown`. Suíte completa comparável recente com falha vira `block`.

A janela de freshness é fornecida pelo consumidor da regra. O núcleo não inventa uma política global de idade.

### Project Doctor

- `healthy`: `pass`;
- `attention`: `warning`;
- `blocked`: `block`.

### Migrations

Release Readiness consome diretamente o `MigrationOverview` produzido pelo contrato comum de Migration Providers:

- `up-to-date`: `pass`;
- `pending`: `block`;
- `unavailable`: `unknown`;
- `unknown`: `unknown`.

O Readiness não conhece Rails, Prisma ou providers custom. `provider`, listas de migrations e detalhes específicos de framework não participam da decisão. A evidência e o `observedAt` já normalizados pelo `MigrationOverview` são preservados no check.

Ausência de provider ou falha de inspeção nunca significam schema atualizado. Se a consulta de migrations falhar inesperadamente, somente o check `migrations` fica `unknown`.

Cada check preserva evidência, timestamp e uma ação de navegação. O serviço não executa a ação.

## Agregação das fontes reais

`ReleaseReadinessService` conecta o núcleo às fontes existentes do backend:

- `GitService.getOverview()`;
- `TestExecutionHistoryService.history()`;
- `captureTestExecutionGitIdentity()`;
- `ProjectDoctorService.getReport()`;
- `MigrationOverviewService.inspect()`.

As fontes são consultadas de forma independente e uma indisponibilidade não apaga as demais evidências. Falha ao capturar revisão/fingerprint atual mantém Testes em `unknown`; falha de qualquer outra fonte mantém apenas o check correspondente em `unknown`.

A janela de freshness continua sendo fornecida pelo consumidor em `testMaxAgeMs` e precisa ser positiva.

## Contrato HTTP

A API expõe o snapshot agregado em:

```text
GET /api/projects/:projectId/release-readiness
```

A resposta possui schema fechado e retorna:

```text
{ readiness: ReleaseReadinessSnapshot }
```

A rota não replica regras de Git, Testes, Doctor ou Migrations. Ela apenas resolve o projeto conhecido pelo `ProjectStore`, valida a política de freshness e delega ao `ReleaseReadinessService` real.

### Freshness na borda HTTP

O consumidor pode informar:

```text
?testMaxAgeSeconds=<segundos>
```

A janela é bounded entre **60 segundos e 24 horas**. Quando omitida, a política documentada da API usa **30 minutos**. Valores fora do intervalo ou malformados produzem `400`. Projeto inexistente produz `404 PROJECT_NOT_FOUND`.

### Contrato de resposta

O schema HTTP aceita somente:

- estados `pass`, `warning`, `block`, `unknown`;
- checks `git`, `tests`, `doctor`, `migrations`;
- ações para `synchronization`, `tests`, `doctor`, `migrations`;
- summary/evidence/timestamps já produzidos pelo domínio.

Campos internos das fontes, paths do projeto, comandos, stdout/stderr e objetos de implementação não fazem parte da resposta.

A API continua **somente leitura**. Um snapshot `pass` não autoriza merge, push ou deploy.

## Superfície de projeto

A UI expõe Release Readiness em `/projects/:projectId/readiness` e consome o contrato HTTP sem recalcular prioridade, freshness ou regras de provider.

A tela apresenta estado agregado, summary, evidence, timestamps, falha explícita com retry e o aviso permanente de que Readiness não autoriza merge, push ou deploy.

As ações navegam para o domínio responsável:

```text
synchronization -> /projects/:projectId/git?tab=sync
tests           -> /projects/:projectId/tests
doctor          -> /projects/:projectId/doctor
migrations      -> /projects/:projectId/migrations
```

A UI não executa correções automaticamente.

## Limites atuais

Production Contract e CI remoto ainda não fazem parte do snapshot. Essas fontes podem entrar incrementalmente sem alterar a semântica dos estados acima.

Falha ou ausência de uma fonte deve continuar produzindo `unknown` para aquela regra, e nunca um falso `pass`.
