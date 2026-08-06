# Task 116 — Automatiza release e tags de versão

## Contexto

Item pendente em `tasks/PENDENCIAS.md`: "Automatizar release e tags de
versão", bloqueado por uma decisão de política de versionamento que a nota
do item dizia explicitamente não caber a uma única frente decidir sozinha.
Confirmado com o usuário: o projeto **continua privado** (`"private":
true`, sem publicação em registro npm) — isso define o escopo: a
automação serve só para rastrear histórico/compatibilidade via tag Git e
GitHub Release, não para publicar pacote em lugar nenhum.

## Decisão

Versionamento `MAJOR.MINOR.PATCH` no `package.json` raiz. Sem cadência
fixa — release é manual e sob demanda (`workflow_dispatch`), consistente
com o fato de o projeto não ter consumidores externos esperando um
calendário. Dois workflows, respeitando o processo de PR já existente no
repositório (nenhum push direto em `main`):

1. **`.github/workflows/release-prepare.yml`** — disparo manual, escolhe
   `patch`/`minor`/`major`. Roda `npm run release -- <bump>`
   (`scripts/release.mjs`, novo): incrementa a versão em `package.json` e
   regenera `CHANGELOG.md` (reaproveita `generateChangelog` de
   `scripts/generate-changelog.mjs`, task 093). Abre um PR normal
   (`chore(release): vX.Y.Z`) — passa pela mesma revisão de qualquer outra
   mudança, não pula CI nem proteção de branch.
2. **`.github/workflows/release-tag.yml`** — dispara em push em `main` que
   toca `package.json`. Lê a versão atual; se a tag `vX.Y.Z`
   correspondente ainda não existe (idempotente — protege contra qualquer
   outro push que toque `package.json` sem mudar a versão), cria a tag e
   um GitHub Release com notas autogeradas pelo próprio GitHub
   (`gh release create --generate-notes`, a partir dos PRs mergeados desde
   o release anterior) — evita reinventar extração de "mudanças desde a
   última tag" quando o GitHub já resolve isso nativamente.

## Fora de escopo

- Publicação em registro npm — decidida como não aplicável (projeto
  privado).
- Cadência automática de release (ex. semanal, a cada N merges) — decidida
  como manual/sob demanda.
- Versionar `packages/*` individualmente — todos são `"private": true` e
  consumidos só via workspace protocol dentro do próprio monorepo; só a
  versão raiz é incrementada.

## Arquivos

- `scripts/release.mjs`, `scripts/release.test.mjs` (novos)
- `.github/workflows/release-prepare.yml`,
  `.github/workflows/release-tag.yml` (novos)
- `package.json` (script `release`)
- `scripts/generate-changelog.mjs` (texto do cabeçalho do `CHANGELOG.md`
  atualizado — não referencia mais a decisão pendente)
- `CHANGELOG.md` (regenerado)
- `CONTRIBUTING.md` (nova seção "Release")

## Verificação

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm test
```

Testei `computeNextVersion`/`bumpPackageJsonVersion` isoladamente (fora do
repositório, para não disparar um bump real da versão como efeito colateral
de escrever esta task) e validei a sintaxe YAML dos dois workflows novos.
Não executei os workflows de verdade — isso depende de disparo manual do
usuário (`workflow_dispatch`) e não faz sentido acionar um release real
como parte desta entrega.
