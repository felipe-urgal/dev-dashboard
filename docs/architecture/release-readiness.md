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

## Primeiro recorte implementado

O núcleo puro em `apps/api/src/services/release-readiness.ts` normaliza três fontes locais já existentes:

### Git

- working tree dirty: `block`;
- detached HEAD/branch desconhecida: `warning`;
- branch sem upstream: `unknown`, porque `ahead=0/behind=0` sem referência remota não prova sincronização;
- branch com commits locais ainda não publicados (`ahead > 0`): `block`;
- branch atrás da referência remota (`behind > 0`): `block`;
- branch divergente (`ahead > 0` e `behind > 0`): `block`;
- `pass` somente quando há upstream conhecido, working tree limpa e `ahead=0/behind=0`.

### Testes

Somente uma execução com `scope=full-suite` e identidade compatível com o contexto atual pode produzir `pass`.

A identidade comparável segue o contrato do Test Intelligence:

- mesma `gitRevision`;
- mesmo `gitDirtyFingerprint`;
- mesmo `environmentInstanceId` quando houver identidade explícita de ambiente.

O Readiness recebe a identidade atual já resolvida pelo consumidor; ele não a inventa a partir de path/branch. Se a identidade atual estiver ausente, se a execução não possuir revisão/fingerprint compatíveis ou se não existir full suite comparável, o check fica `unknown`.

Quando existem execuções de outros contextos, o núcleo procura a full suite mais recente que seja realmente comparável. Um run mais novo de outra revisão não invalida uma evidência compatível ainda fresca, mas também nunca é usado como substituto.

Uma execução `targeted`, mesmo verde, não equivale à suíte completa. Resultado comparável stale ou sem conclusão vira `unknown`; suíte completa comparável recente com falha vira `block`.

A janela de freshness é fornecida pelo consumidor da regra. O núcleo não inventa uma política global de idade.

### Project Doctor

- `healthy`: `pass`;
- `attention`: `warning`;
- `blocked`: `block`.

Cada check preserva evidência, timestamp e uma ação de navegação. O serviço não executa a ação.

## Segundo recorte: agregação das fontes reais

`ReleaseReadinessService` conecta o núcleo às fontes já existentes do backend:

- `GitService.getOverview()`;
- `TestExecutionHistoryService.history()`;
- `captureTestExecutionGitIdentity()`;
- `ProjectDoctorService.getReport()`.

As quatro consultas são independentes e uma indisponibilidade não apaga as demais evidências. Se Git, histórico ou Doctor falhar, somente o check correspondente fica `unknown`. Falha ao capturar revisão/fingerprint atual também mantém Testes em `unknown`; uma execução verde antiga nunca é promovida por fallback.

A janela de freshness continua sendo fornecida pelo consumidor em `testMaxAgeMs` e precisa ser positiva. O serviço não escolhe silenciosamente uma política global.

## Terceiro recorte: contrato HTTP

A API expõe o snapshot agregado em:

```text
GET /api/projects/:projectId/release-readiness
```

A resposta possui schema fechado e retorna:

```text
{ readiness: ReleaseReadinessSnapshot }
```

A rota não replica regras de Git/Testes/Doctor. Ela apenas resolve o projeto conhecido pelo `ProjectStore`, valida a política de freshness e delega ao `ReleaseReadinessService` real.

### Freshness na borda HTTP

O consumidor pode informar:

```text
?testMaxAgeSeconds=<segundos>
```

A janela é bounded entre **60 segundos e 24 horas**. Quando omitida, a política documentada da API usa **30 minutos**. A conversão para `testMaxAgeMs` acontece apenas na borda; o domínio continua recebendo a janela explicitamente.

Valores fora do intervalo ou malformados produzem `400`. Projeto inexistente produz `404 PROJECT_NOT_FOUND`.

### Contrato de resposta

O schema HTTP aceita somente:

- estados `pass`, `warning`, `block`, `unknown`;
- checks `git`, `tests`, `doctor`;
- ações para `synchronization`, `tests` e `doctor`;
- summary/evidence/timestamps já produzidos pelo domínio.

Campos internos das fontes, paths do projeto, comandos, stdout/stderr e objetos de implementação não fazem parte da resposta.

A API continua **somente leitura**. Um snapshot `pass` não autoriza merge, push ou deploy. Qualquer mutação futura continua obrigada a executar seu próprio preflight/revalidation no momento da ação.

## Quarto recorte: superfície de projeto

A UI expõe Release Readiness em `/projects/:projectId/readiness`, dentro do mesmo contexto e navegação das demais ferramentas do projeto.

`ProjectReleaseReadinessPanel.vue` é deliberadamente um consumidor do contrato HTTP. Ele não recalcula prioridade, não reinterpreta freshness e não transforma `unknown` em sucesso.

A tela apresenta:

- estado agregado com linguagem explícita para `pass`, `warning`, `block` e `unknown`;
- summary, evidence e `observedAt` de cada check;
- `generatedAt` do snapshot;
- falha de carregamento como estado visível com retry;
- aviso permanente de que Readiness não autoriza merge, push ou deploy.

As ações continuam sendo navegação para o domínio responsável:

```text
synchronization -> /projects/:projectId/git?tab=sync
tests           -> /projects/:projectId/tests
doctor          -> /projects/:projectId/doctor
```

A UI não executa correções automaticamente. O backend continua sendo a única autoridade das regras e dos estados do snapshot.

## Limites atuais

Ainda não inclui migrations, Production Contract nem CI remoto. Essas fontes entram incrementalmente sem alterar a semântica dos estados acima nem exigir que a UI conheça regras específicas de provider/framework.

Falha ou ausência de uma fonte deve continuar produzindo `unknown` para aquela regra, e nunca um falso `pass`.
