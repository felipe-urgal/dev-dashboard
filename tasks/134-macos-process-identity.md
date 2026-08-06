# Task 134 — Identidade de processo no macOS + cobertura dedicada de `_dev_os`

## Contexto

Item de `tasks/PENDENCIAS.md` ("compatibilidade com macOS"), com o gap
específico já mapeado pela task 113: o dashboard web não tinha nenhuma
verificação de identidade de processo equivalente ao `/proc/<pid>/cwd` fora
do Linux (`verifyProcessDirectory` simplesmente retornava `true` — "não
verificado" — para qualquer plataforma que não fosse Linux), e o CLI bash
distinguia `mac`/`linux` em vários pontos (`_dev_os`) sem nenhuma cobertura
de teste dedicada.

**Limite honesto desta entrega**: não há uma máquina macOS disponível neste
ambiente para validar o comportamento real. O que foi implementado é
testado com saída simulada de `lsof`/`uname` (dependency injection), não
contra um macOS de verdade — os dois documentos tocados (`security.md`,
`operations-and-troubleshooting.md`) deixam essa distinção explícita, para
não prometer suporte validado que não existe.

## Mudança

### `packages/process-manager` — `verifyProcessDirectory`

- Passa a aceitar um segundo parâmetro opcional (`VerifyProcessDirectoryDeps`,
  `{ platform?, runLsof? }`) só para teste — o uso em produção (as três
  chamadas existentes em `process-status.ts`, `log-retention.ts`,
  `process-lifecycle.ts`) continua idêntico, sem segundo argumento.
- Novo ramo para `platform === 'darwin'`: roda
  `lsof -a -p <pid> -d cwd -Fn` (equivalente prático ao `/proc/<pid>/cwd`
  no macOS, que não tem `/proc`), parseia a linha `n<caminho>` do formato
  `-F` do `lsof`, e compara com o `cwd` esperado via `realpath`.
- Assimetria deliberada em relação ao Linux: no Linux, qualquer falha ao
  ler `/proc/<pid>/cwd` é tratada como identidade **não confirmada**
  (`false`) — no macOS, só uma divergência concreta (o `lsof` rodou e
  reportou um cwd que não bate) retorna `false`; qualquer falha em
  rodar/interpretar o `lsof` (binário ausente, sem permissão, saída
  inesperada) retorna `true`. Isso mantém o comportamento histórico de
  "não verificado, não bloqueia" que esta função já tinha para toda
  plataforma fora do Linux, em vez de introduzir um novo modo de falha que
  travaria operações no macOS por causa de uma dependência opcional
  ausente.

### `lib/core/checks.sh` — cobertura de `_dev_os`

- Nenhuma mudança de comportamento — só testes novos. `_dev_os` já
  despachava corretamente por `uname -s` (`Darwin` → `mac`, `Linux` →
  `linux`, resto → `other`), mas só o ramo `linux` era exercitado em CI
  (`ubuntu-latest`). `tests/cli/cases/01-core-checks.sh` agora testa os
  ramos `mac`/`other` colocando um `uname` falso na frente do `PATH` — a
  mesma técnica já usada nesta sessão para simular ausência de `jq`
  (task 132).

## Fora de escopo (decisão explícita)

- Validar contra um macOS real (CI só roda `ubuntu-latest`) — fica
  registrado como limite conhecido nos dois documentos tocados.
- Suporte a Windows nativo — matriz de suporte já marca como não suportado
  (task 113), sem mudança aqui.
- Testar o comportamento de cada consumidor de `_dev_os`
  (`lib/actions/browser.sh`, `lib/rails/database/service.sh`,
  `lib/core/services.sh`) — cada um só despacha para um comando externo
  (`open`, `brew services`, `xdg-open`) por uma linha de `case`; testar
  exigiria mockar múltiplos binários externos para pouco ganho. O gap
  documentado pela task 113 era especificamente a falta de cobertura do
  próprio `_dev_os`, que esta entrega fecha.
- Migração automática de schema (outro item do mesmo grupo em
  `tasks/PENDENCIAS.md`) — continua bloqueado por não existir `version: 2`
  ainda.

## Arquivos

- `packages/process-manager/src/process-state.ts`
  (`VerifyProcessDirectoryDeps`, `verifyProcessDirectoryDarwin`,
  `parseLsofCwd`), `packages/process-manager/src/index.ts` (exporta o tipo
  novo).
- `tests/cli/cases/01-core-checks.sh` (ramos `mac`/`other` de `_dev_os`).
- `docs/architecture/security.md` (seção "Identidade de processos"),
  `docs/operations-and-troubleshooting.md` (matriz de suporte + tabela de
  dependências de runtime, `lsof` agora também listado para o dashboard
  web no macOS).
- Testes novos: `packages/process-manager/test/process-state.test.ts`
  (sem pid, plataforma desconhecida, Linux confirma/rejeita via
  `/proc/<pid>/cwd` real do próprio processo de teste, macOS confirma/
  rejeita/degrada via `runLsof` injetado).

## Verificação

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run docs:api:check
npm test
tests/cli/run.sh
```

Todos passando (601 testes na API, 372 no web, 20 no core, 59 no
process-manager — 7 novos de `verifyProcessDirectory`, 57 no CLI bash — 2
novos em `01-core-checks.sh`); nenhuma rota HTTP mudou, `docs/architecture/api-reference.md`
continua com 156 rotas.
