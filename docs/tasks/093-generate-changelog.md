# Task 093 — Changelog automatizado

## Status

Concluída (escopo reduzido — ver "Decisão" abaixo).

## Contexto

Executada como frente paralela do inventário de `docs/PENDENCIAS.md`, seção
"Distribuição, governança e compatibilidade": "Automatizar changelog,
release e tags de versão." Rodou ao mesmo tempo que outras duas frentes
paralelas em worktrees separados (task 091 — documentação da API; task 092 —
adaptador de navegador) e a task 089 (projetos recentes), sem tocar em
`apps/`, `packages/` nem `lib/`.

## Decisão principal: só changelog, sem release nem tags

O item original do inventário juntava três coisas de natureza bem
diferente: gerar um changelog (mecânico, sem julgamento de política) e
automatizar release/tags de versão (exige decidir cadência de release,
formato de tag semver, e se este projeto algum dia será publicado — hoje
`package.json` raiz tem `"private": true` e não há indicação de que isso vai
mudar). Essa segunda parte não é uma decisão técnica que uma frente paralela
deva tomar sozinha; ela muda o significado do repositório (de "ferramenta
interna" para "software distribuído com contrato de versão").

Por isso este trabalho implementa **só a geração de changelog** a partir do
`git log` existente. Release e tags de versão voltam para
`docs/PENDENCIAS.md` como item separado, explicitamente pendente de decisão
de política de versionamento — não implementado, não removido do
inventário.

Nenhum workflow de CI foi criado ou alterado (`.github/workflows/` não foi
tocado) — o script roda localmente, sob demanda, via `npm run changelog`.

## Escopo

- `scripts/generate-changelog.mjs` (novo): lê `git log` (hash, data,
  assunto) via `execFileSync`, agrupa commits consecutivos por "Task NNN"
  quando o assunto referencia uma task numerada (convenção observada em
  `git log --oneline` deste repo — "Task 090: ...", "Task 077 — ...",
  "Tasks 073–074 — ..."), ou por data quando não há task, e escreve
  `CHANGELOG.md` na raiz. Funções puras (`parseGitLog`, `extractTaskLabel`,
  `extractPrNumber`, `groupCommits`, `formatChangelog`) separadas de I/O
  (`runGitLog`, `main`), seguindo o padrão de `scripts/doctor.mjs` e
  `scripts/dev.mjs` (injeção de dependência via `options`, bloco
  `if (import.meta.url === ...)` para permitir import sem executar);
- `scripts/generate-changelog.test.mjs` (novo): cobre extração de task/PR,
  parsing do log delimitado e agrupamento, incluindo o caso de uma mesma
  task reaparecer mais tarde sem estar contígua no histórico (vira um novo
  grupo, não um só espalhado);
- script npm `changelog` no `package.json` raiz;
- `CHANGELOG.md` (novo, gerado e commitado): cobre o histórico completo do
  branch no momento da geração — 55 commits, agrupados em ~40 seções por
  task/data;
- `docs/PENDENCIAS.md`, `docs/tasks/PARALLEL-WORK.md`,
  `docs/tasks/README.md` atualizados.

## Como funciona

`npm run changelog` reescreve `CHANGELOG.md` inteiro a partir do
`git log` atual — não é um append incremental, é regeneração determinística.
Isso evita divergência entre o arquivo e o histórico real e evita qualquer
lógica de merge/diff do conteúdo anterior. O cabeçalho do arquivo (fixo,
gerado pelo próprio script) documenta essa regra e a limitação de escopo
(changelog sim, release/tag não) para quem abrir o arquivo sem ler esta
task.

Regra de agrupamento: percorre os commits do mais novo ao mais antigo;
commits consecutivos cujo assunto contém "Task NNN"/"Tasks NNN" (regex
`/\btasks?\s+(\d+)/i`, primeiro número encontrado) formam um único grupo
`### Task NNN`; uma sequência de commits sem task forma um grupo `### AAAA-MM-DD`
por data. Se uma task volta a aparecer mais tarde no histórico sem ser
contígua (não observado nos commits atuais, mas possível), vira um novo
grupo `### Task NNN` separado, na ordem cronológica correta — não há
consolidação de grupos não-contíguos, para não reordenar o changelog para
fora da ordem do Git.

Cada linha de commit vira `- <assunto sem o "(#NNN)"> ([#NNN](../../pull/NNN))`
quando o assunto termina em `(#NNN)` (padrão de squash-merge do GitHub,
maioria dos commits deste repo); caso contrário, `- <assunto> (\`<hash curto>\`)`.

## Critérios de aceite

- `npm run changelog` gera/atualiza `CHANGELOG.md` na raiz sem erros;
- commits com "Task NNN"/"Tasks NNN" no assunto ficam agrupados sob o
  cabeçalho da task correspondente;
- commits sem task ficam agrupados por data;
- o cabeçalho do arquivo deixa explícito que release e tags de versão não
  são cobertos por este script;
- rodar o script de novo sem novos commits produz o mesmo conteúdo
  (determinístico);
- nenhum arquivo em `.github/workflows/`, `apps/` ou `packages/` foi
  alterado.

## Testes automatizados

- `node --test scripts/generate-changelog.test.mjs` — 6 testes, 0 falhas
  (`extractTaskLabel`, `extractPrNumber`, `parseGitLog`, `groupCommits` em
  dois cenários, `formatChangelog`);
- `npm test` (raiz) roda `node --test scripts/*.test.mjs` automaticamente,
  incluindo o arquivo novo — sem workspace dedicado, sem configuração
  adicional.

## Roteiro de QA manual

```bash
npm run changelog
head -40 CHANGELOG.md   # confirma cabeçalho com a ressalva de escopo
grep -c '^### ' CHANGELOG.md   # confirma que há seções por task e por data
```

## Limitações

- o parsing de task é só o assunto do commit (`%s`), não o corpo — uma task
  referenciada só no corpo da mensagem (raro no histórico observado) não é
  agrupada por task;
- não distingue merge commits de commits diretos; mensagens de squash-merge
  do GitHub (`Título (#NNN)`) são o caso comum e já são tratadas (link de
  PR); commits diretos sem PR caem no formato com hash curto;
- não há bump de versão, não há criação de tag Git, não há workflow de CI —
  deliberado, ver "Decisão principal" acima;
- regenerar o changelog depois de um `git rebase`/`filter-branch` que altere
  hashes vai mudar os hashes curtos exibidos para commits sem PR; não é um
  problema na prática deste repo (histórico linear via squash-merge), mas
  vale registrar.

## Arquivos alterados

- `scripts/generate-changelog.mjs` (novo)
- `scripts/generate-changelog.test.mjs` (novo)
- `CHANGELOG.md` (novo, gerado)
- `package.json`
- `docs/PENDENCIAS.md`
- `docs/tasks/PARALLEL-WORK.md`
- `docs/tasks/README.md`
- `docs/tasks/093-generate-changelog.md` (este arquivo)
