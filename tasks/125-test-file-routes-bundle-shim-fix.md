# Task 125 — Corrige causa real do CI vermelho no PR #232 (shim de `bundle` ausente)

## Contexto

O PR #232 (tasks 122/123) continuou vermelho na CI mesmo depois da task 124
(alargar margem dos limiares de cobertura). A task 124 diagnosticou errado:
atribuiu a falha a `packages/project-discovery` por causa da posição do log
(a tabela de cobertura desse workspace aparecia logo antes da linha
`##[error]Process completed with exit code 1.`), mas `project-discovery` é
só o **último** workspace da cadeia `npm run test --workspaces` (ordem
alfabética de `apps/*` depois `packages/*`) — o `##[error]` é o exit code
agregado do `npm run test --workspaces` inteiro, não de um workspace
específico, e caiu visualmente colado no relatório de cobertura de
`project-discovery` só por ser o último a rodar.

Puxando o log completo do job (não só os últimos 300 linhas), a falha real
está em `apps/api`, no arquivo `test/test-file-routes.test.ts` (criado na
task 123): dois testes do bloco "rotas de caso específico de teste (RSpec)"
falhavam com `500 !== 201` e, em seguida, `TypeError: Cannot read
properties of undefined (reading 'targetFile')` (falha em cascata do
primeiro erro).

## Causa raiz

O teste da task 123 inicia de verdade a execução de um caso RSpec via
`POST .../files/start`, o que faz a API chamar `processManager.startTest`,
que dá `spawn` real no comando resolvido — `bundle exec rspec
spec/models/user_spec.rb:42` para um projeto Rails. O runner da CI
(`ubuntu-latest`, só Node, sem Ruby/Bundler instalado) não tem o binário
`bundle` no `PATH`, então o `spawn` falha com `ENOENT`, a rota captura o
erro genérico e responde `500 TEST_START_FAILED` em vez de `201`.

No ambiente local (com Ruby/Bundler instalados, comuns em quem desenvolve
projetos Rails), o `spawn` de `bundle` funciona, então o teste passava sem
indicar problema — daí não ter sido pego antes do push. É por isso que a
task 124 não conseguiu reproduzir a falha localmente em nenhuma versão de
Node testada: o Node nunca foi o problema.

Esse padrão — depender de um binário externo real (`bundle`, `pg_dump`,
`psql`) só existir por acaso no `PATH` de quem roda o teste — já tinha sido
resolvido antes em `apps/api/test/database-snapshot-routes.test.ts`, que
cria um executável falso (`#!/usr/bin/env bash\n...`) num diretório
temporário e antepõe esse diretório ao `PATH` só durante o teste. O teste
novo da task 123 não seguiu esse padrão.

## Correção

`apps/api/test/test-file-routes.test.ts`, bloco "rotas de caso específico
de teste (RSpec)": cria um `bundle` falso (`exit 0`) em
`<fixtureRoot>/bin`, com `chmod 0o755`, e antepõe esse diretório ao
`process.env.PATH` antes de `buildApp`, restaurando o `PATH` original no
`context.after`. Mesmo padrão de `database-snapshot-routes.test.ts` (linhas
42-67 e 99), só trocando o binário simulado.

## O que a task 124 acertou e o que não

O alargamento de margem dos limiares de cobertura (task 124) continua
válido como prática defensiva — limiares colados no valor medido são
frágeis a qualquer variação de instrumentação entre patches do Node/V8 — e
não foi revertido. Mas o diagnóstico da task 124 (de que a causa raiz da
falha era exatamente essa fragilidade) estava incorreto; documentado aqui
para o histórico não ficar contraditório.

## Arquivos

- `apps/api/test/test-file-routes.test.ts` (shim de `bundle` no `PATH`).

## Verificação

```bash
node --import=tsx --test apps/api/test/test-file-routes.test.ts
npm run typecheck --workspace=@dev-dashboard/api
```

14/14 testes passando localmente. Aguardando confirmação do CI real após o
push.
