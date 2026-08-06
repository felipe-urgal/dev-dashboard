# Task 132 — Estratégia de compartilhamento de regras entre CLI bash e dashboard web

## Contexto

Item registrado em `tasks/PENDENCIAS.md` (seção "CLI Bash"): "Definir a
estratégia para compartilhar regras com web e API sem quebrar a
independência do CLI existente." Ao contrário das tasks 126-131 (escopo
concreto e pequeno), este item pedia uma decisão arquitetural — não havia
uma feature específica para implementar até essa decisão ser tomada.

## Investigação

Antes de propor opções, catalogamos a sobreposição real entre `lib/`
(bash) e os pacotes TS equivalentes:

- **Detecção de tipo de projeto**: `lib/projects/detect.sh`
  (`_project_detect_type`, 118 linhas no arquivo inteiro) vs.
  `packages/project-discovery/src/discovery.ts` (564 linhas). Já
  divergiam: bash fazia `grep -q "rails" Gemfile` (substring solta — um
  projeto com a gem `rails-html-sanitizer`, mas sem Rails de verdade, seria
  misdetectado); TS usava `^\s*gem\s+["']rails["']` (nome exato da gem).
  Mesma regra, dois resultados diferentes hoje — bug real, não hipotético.
- **Detecção de MySQL**: bash checa a string `"mysql2"` em `database.yml` e
  expõe isso como metadado (`mysql:yes/no`); o lado TS não tem equivalente
  granular — só uma capability genérica `database` (presença do arquivo,
  sem inspecionar o driver).
- **Atribuição de porta**: os dois começam em 3000 e incrementam evitando
  conflitos — hoje em sync, mas são implementações independentes.
- **Gerenciamento de processo**: `lib/server/core/start.sh` tem 74 linhas;
  `packages/process-manager` tem ~2780 linhas (retenção de log,
  rastreamento de saída, verificação de identidade via `/proc/<pid>/cwd`,
  etc.) — os dois lados divergiram tanto em escopo que não são mais
  implementações comparáveis da mesma regra.

## Decisão

Confirmado com o usuário: **regras de detecção em um arquivo declarativo
compartilhado**, não um core compartilhado nem duplicação sem controle.
Motivo: bash e TypeScript não compartilham runtime — não há como
literalmente compartilhar código executável entre os dois sem um dos lados
adotar o runtime do outro (ex. CLI bash passando a depender de Node), o que
quebraria o princípio explícito do CLI de "sem build step, sem compilador"
(`CLAUDE.md`) e exigiria decisão arquitetural e modelo de ameaça próprios —
fora do escopo desta task.

Escopo da extração: **só a detecção de tipo de projeto** (Rails/Node), por
ser a única regra hoje duplicada nos dois lados com o mesmo propósito
exato e com uma divergência real já encontrada. Detecção de capacidades
(MySQL, webpack, sidekiq) e gerenciamento de processo **permanecem
deliberadamente fora** — os dois lados já servem propósitos diferentes
nessas áreas (bash: flags rápidas para o dashboard interativo; TS: sistema
de capacidades mais rico para o produto web) e forçar paridade ali seria
uma regressão de funcionalidade para o lado que hoje é mais rico, não uma
correção de bug.

## Implementação

- `shared/project-type-rules.json` (novo, raiz do repo): fonte única da
  regra. Dois campos de padrão para a mesma regra —
  `gemNamePattern` (sintaxe `RegExp` do JavaScript) e
  `gemNamePatternPosix` (sintaxe POSIX ERE) — porque bash (`grep -E`) e
  TypeScript (`RegExp`) não compartilham sintaxe de regex; nenhum dos dois
  lados traduz automaticamente um formato para o outro.
- `packages/project-discovery/src/project-type-rules.ts` (novo):
  `loadProjectTypeRules()` lê e cacheia o arquivo compartilhado, resolvendo
  o caminho relativo à própria localização do módulo (`import.meta.url`) —
  estável tanto rodando de `src/` via `tsx` quanto de `dist/` compilado, sem
  depender do `cwd` do processo. Cai num padrão embutido idêntico ao valor
  atual do arquivo se ele estiver ausente/malformado — nunca lança erro.
  `discovery.ts` usa essa função em vez do antigo `hasGem(gemfile, 'rails')`
  para decidir o tipo do projeto (o `hasGem` genérico continua existindo,
  usado para detecção de sidekiq, que não faz parte da regra compartilhada).
- `lib/projects/detect.sh`: `_project_detect_type` extraído para uma nova
  função `_project_gemfile_is_rails`, que lê `gemNamePatternPosix` do
  arquivo compartilhado via `jq` quando disponível; sem `jq` (ou sem o
  arquivo), usa o mesmo padrão POSIX embutido como fallback.
- `lib/doctor/check.sh`: `dev-doctor` passa a verificar `jq` como
  dependência opcional (aviso, não bloqueio), mesmo padrão de `gum`/`gh`.
- `docs/architecture/overview.md`: nova seção "Regras compartilhadas entre
  CLI e web" (dentro de "Project Discovery") documentando o mecanismo e por
  que ele não se estende a process management.

## Fora de escopo (decisão explícita)

- Compartilhar detecção de capacidades (MySQL, webpack, sidekiq) — os dois
  lados já servem propósitos diferentes; forçar paridade seria regressão
  para o lado mais rico (TS).
- Compartilhar gerenciamento de processo — escopo e maturidade divergiram
  demais (`process-manager` é ~40x maior que o equivalente bash) para uma
  regra declarativa fazer sentido.
- CLI bash chamar um binário Node compartilhado (compartilhamento mais
  profundo) — quebraria o princípio de "sem build step, sem compilador" do
  CLI; precisaria de decisão arquitetural e modelo de ameaça próprios se
  algum dia for reconsiderado.
- Tradução automática entre sintaxe de regex JS e POSIX ERE — os dois
  campos de padrão no JSON são mantidos manualmente em sincronia; um
  comentário no próprio arquivo lembra disso.

## Arquivos

- `shared/project-type-rules.json` (novo).
- `packages/project-discovery/src/project-type-rules.ts` (novo),
  `packages/project-discovery/src/discovery.ts` (usa o loader).
- `lib/projects/detect.sh` (`_project_gemfile_is_rails` novo),
  `lib/doctor/check.sh` (checagem de `jq`).
- `docs/architecture/overview.md`.
- Testes novos: `packages/project-discovery/test/discovery.test.ts`
  (regressão `rails-html-sanitizer`, `loadProjectTypeRules`/`parseRules`
  com arquivo ausente/malformado/parcial), `tests/cli/cases/02-projects-helpers.sh`
  (mesma regressão em bash, mais o fallback sem `shared/project-type-rules.json`).

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

Todos passando (601 testes na API, 372 no web, 37 no CLI bash); nenhuma
rota HTTP mudou, então `docs/architecture/api-reference.md` não mudou (156
rotas, igual a antes desta entrega). Testado manualmente também o caminho
sem `jq` (path isolado sem o binário no `PATH`), confirmando que o
fallback embutido do bash produz o mesmo resultado que o arquivo
compartilhado.
