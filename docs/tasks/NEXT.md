# Próxima atividade

## Task 104 — Padronizar lint com ESLint entre `apps/` e `packages/`

### Objetivo

O monorepo hoje não tem nenhum lint automatizado — `docs/PENDENCIAS.md`
("Qualidade e manutenção") registra isso como pendência desde a auditoria da
task 011/086. `npm run typecheck` pega erros de tipo, mas não pega import
não usado, `any` implícito evitável, código morto óbvio ou inconsistência de
estilo entre os workspaces TS (`apps/api`, `apps/web`, `packages/*`).

### Decisão principal

Primeira versão: só ESLint (regras de correção — `@typescript-eslint`,
`eslint-plugin-vue` para `apps/web`), sem Prettier. Formatação automática é
uma frente separada com risco de diff gigante em arquivos que não vão
mudar por motivo funcional; lint de correção primeiro, formatação depois se
fizer sentido. Rodar em modo não-bloqueante nesta entrega — reportar o
inventário de violações, corrigir apenas o que `--fix` resolve com segurança
(imports não usados, ordenação), e decidir arquivo a arquivo o que vale a
pena consertar manualmente vs. registrar como pendência futura. Não é
aceitável essa entrega reescrever centenas de arquivos de uma vez só por
causa de uma regra nova.

### Escopo

- `eslint.config.js` na raiz (flat config, compatível com o `engines.node`
  do `package.json` raiz), com overrides por workspace onde a base
  `@typescript-eslint/recommended` precisar de ajuste (ex. `packages/contracts`
  é só tipos, `apps/web` precisa do parser/plugin Vue);
- `npm run lint` na raiz (`--workspaces --if-present` ou script único
  cobrindo tudo, a definir durante a implementação) e `npm run lint:fix`;
- rodar `eslint --fix` uma vez no repositório inteiro só para as categorias
  seguras (imports não usados, ordenação de imports) e commitar o resultado
  separado de qualquer mudança de configuração;
- inventariar (não necessariamente corrigir) as violações restantes que
  exigem julgamento humano (`any` implícito, variáveis não usadas em
  parâmetros de callback, etc.) — decidir por categoria se entra nesta
  entrega ou fica registrada como pendência;
- adicionar `npm run lint` ao `.github/workflows/ci.yml`, depois de
  `typecheck` e antes de `build` (mesma ordem de `docs:api:check` já
  descrita no `CLAUDE.md`), **só depois que o repositório já estiver
  passando** — nunca habilitar o gate de CI com violações pendentes.

### Critérios de aceite

- `npm run lint` roda sem erro de configuração em todos os workspaces TS;
- nenhuma mudança de comportamento — só formatação/imports mecânicos e,
  quando fizer sentido, correções pontuais já revisadas;
- CI (`ci.yml`) passa com o novo passo de lint habilitado;
- `docs/PENDENCIAS.md` atualizado removendo o item "Padronizar lint e
  formatação com ESLint e Prettier" (ou reduzindo-o só a Prettier, se essa
  parte ficar para depois).

### Fora de escopo

- Prettier / formatação automática de estilo (espaçamento, aspas, etc.) —
  fica para uma entrega própria se for decidida depois;
- reescrever lógica para satisfazer regras mais rígidas do que
  `recommended` (ex. `strict-boolean-expressions`) — começar permissivo e
  apertar depois, não o contrário;
- lint do CLI Bash (`lib/`, `init.sh`) — isso é `shellcheck`, uma frente
  totalmente separada, não coberta por ESLint.
