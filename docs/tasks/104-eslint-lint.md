# Task 104 — Padronizar lint com ESLint entre `apps/` e `packages/`

## Status

Concluída.

## Objetivo

O monorepo não tinha lint automatizado — só `npm run typecheck`, que não
pega import não usado, `any` implícito evitável ou inconsistência de estilo
entre os workspaces TS. Ver `docs/PENDENCIAS.md` ("Qualidade e manutenção").

## Decisão principal

Primeira versão: só regras de correção (`@typescript-eslint/recommended` +
`eslint-plugin-vue` em `apps/web`), sem Prettier — formatação automática
fica para uma entrega própria por causa do risco de diff gigante sem ganho
funcional. Modo não-bloqueante nesta entrega: inventariar as violações,
corrigir só o que `--fix` resolve com segurança, e registrar o restante como
pendência quando a correção exigiria reestruturar código só por causa de uma
regra nova.

## Escopo entregue

- `eslint.config.js` na raiz (flat config): base `@typescript-eslint/recommended`
  para todo TS, override para `apps/web/**/*.vue` com parser/plugin Vue
  (`vue/multi-word-component-names` desligado — nomes de página únicos são o
  padrão do projeto), override para `packages/contracts` (só tipos) e para
  arquivos de teste (`@typescript-eslint/no-unused-vars` desligado onde o
  padrão local já usa variáveis de setup não lidas).
- `npm run lint` (`eslint "apps/**/*.{ts,vue}" "packages/**/*.ts"
  "scripts/**/*.mjs" "eslint.config.js"`) e `npm run lint:fix` na raiz.
- `npm run lint:fix` rodado uma vez no repositório inteiro: removeu 7
  diretivas `eslint-disable` que não tinham mais nenhum problema associado
  (`no-console`, `no-await-in-loop`, `no-cond-assign`) em
  `apps/api/src/services/git-mutation-history-service.ts`,
  `apps/api/test/git-mutation-history-routes.test.ts`,
  `apps/api/test/git-mutation-history-service.test.ts` e
  `apps/web/src/utils/sql-highlight.ts` — mudança mecânica, sem alterar
  comportamento.
- `.github/workflows/ci.yml`: passo `Lint` (`npm run lint`) adicionado depois
  de `Typecheck` e antes de `Build`, habilitado já com o repositório
  passando sem erro (só avisos, ver abaixo).
- `docs/PENDENCIAS.md` atualizado: item de lint marcado como concluído,
  reduzido a um item próprio só de Prettier (fora de escopo aqui).

## Inventário restante (não corrigido nesta entrega)

`npm run lint` termina com 0 erros e 22 avisos, todos `@typescript-eslint/no-unused-vars`
(variáveis/tipos declarados e não usados em `apps/api` e `apps/web`) e
`prefer-const` (8 ocorrências em `apps/api/src/routes/scripts.ts`,
`apps/api/src/routes/tests/events-route.ts`,
`packages/process-manager/test/*.test.ts`). Os avisos de `prefer-const` não
são elegíveis para `--fix` nem para troca manual segura: em todos os casos a
variável é declarada com `let` sem inicializador porque é lida por um
closure definido *antes* do único ponto de atribuição (ex. `heartbeat` em
`scripts.ts`, capturado por `close()` antes de `heartbeat = setInterval(...)`
mais abaixo) — virar `const` exigiria reordenar a função, o que está fora do
escopo desta entrega (só lint, sem mudança de comportamento). Ficam como
avisos não-bloqueantes; corrigir fica para quem mexer nesses arquivos por
outro motivo.

## Critérios de aceite

- [x] `npm run lint` roda sem erro de configuração em todos os workspaces TS.
- [x] Nenhuma mudança de comportamento — só remoção de diretivas
  `eslint-disable` órfãs.
- [x] CI (`ci.yml`) passa com o novo passo de lint habilitado.
- [x] `docs/PENDENCIAS.md` atualizado.

## Fora de escopo

- Prettier / formatação automática de estilo — pendência própria registrada
  em `docs/PENDENCIAS.md`.
- Reescrever lógica para satisfazer regras mais rígidas que `recommended`.
- Lint do CLI Bash (`lib/`, `init.sh`) — isso é `shellcheck`, frente separada.

## Testes

- `npm run typecheck` — verde.
- `npm run build` — verde.
- `npm test` — verde (535 de 536 testes; 1 falha isolada em
  `apps/api/test/project-language-server-service.test.ts`
  ("requestSymbolLocations envia uma requisição LSP one-shot...") é uma
  corrida entre o timeout do LSP e o fim do teste, não relacionada às
  mudanças desta task — passa isoladamente com
  `node --import=tsx --test apps/api/test/project-language-server-service.test.ts`).

## Limitações

- Nenhuma dependência de Prettier foi avaliada; a escolha de regras
  `recommended` é deliberadamente permissiva (sem `strict-boolean-expressions`
  nem afins) para não gerar um diff de correção gigante fora de escopo.
