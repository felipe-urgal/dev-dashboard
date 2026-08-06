# Task 110 — Varredura recursiva de workspace (opt-in, biblioteca)

## Contexto

Item pendente em `tasks/PENDENCIAS.md` ("Descoberta e projetos complexos"):
a descoberta de projetos só lia filhos diretos do workspace, sem suporte a
monorepos onde os projetos ficam a mais de um nível de profundidade.

## Escopo desta entrega

Só `packages/project-discovery`. `scanWorkspace` ganhou um modo recursivo
opt-in (`recursive: true` em `ScanWorkspaceOptions`), com:

- `maxDepth` (padrão 3), `maxProjects` (padrão 200) e `timeoutMs` (padrão
  5000) como limites explícitos — cada um produz um warning dedicado
  (`SCAN_DEPTH_LIMIT_REACHED`, `SCAN_PROJECT_LIMIT_REACHED`, `SCAN_TIMEOUT`)
  e um resultado parcial, nunca uma varredura sem fim.
- Política de symlinks: `followSymlinks` (padrão `false`) — a varredura
  recursiva não desce em diretórios que são links simbólicos por padrão,
  para evitar ciclos e travessia para fora do workspace. O comportamento
  dos filhos diretos (modo não recursivo, já existente) não muda.
- Diretórios que já são projetos não são explorados por dentro (evita tratar
  `node_modules`/`vendor`/etc. de um projeto detectado como projeto
  aninhado).

O modo não recursivo (padrão, sem a opção) ficou byte-a-byte igual ao
anterior — nenhuma chamada existente muda de comportamento.

## Fora de escopo (não fica pendente sem dono, mas não faz parte desta entrega)

- Expor a opção na rota `POST /api/workspaces/:workspaceId/scan` e na UI
  (`apps/web`) — decisão de produto em aberto: opt-in por workspace? Com
  confirmação do custo (varredura mais lenta)? Isso é uma entrega própria,
  registrada em `tasks/PENDENCIAS.md`.
- Deduplicação de projetos alcançáveis por mais de um caminho (ex. symlink
  apontando para outro projeto já descoberto) — não avaliado porque
  `followSymlinks` é `false` por padrão; revisitar se a opção for exposta na
  API.

## Arquivos

- `packages/project-discovery/src/discovery.ts` — `walkForProjects`,
  `WalkContext`, novas opções e códigos de warning.
- `packages/project-discovery/test/discovery.test.ts` — cobertura para
  varredura recursiva bem-sucedida, `maxDepth`, `maxProjects`, `timeoutMs` e
  a política de symlinks (padrão vs. `followSymlinks: true`).
- `docs/architecture/overview.md` — seção "Varredura recursiva (opt-in)" em
  Project Discovery.

## Verificação

```bash
npm run typecheck
npm run build
npm test
```

Todos passando; suíte de `project-discovery` cobre os quatro warnings novos.

## Decisões

- Resultado parcial em vez de erro quando um limite é atingido — consistente
  com o padrão já usado por `PROJECT_DETECTION_FAILED`/
  `UNREADABLE_DIRECTORY` (warning por diretório, não aborta a varredura
  inteira).
- Não seguir symlinks por padrão na recursão, em vez de reaproveitar o
  comportamento atual dos filhos diretos (que já segue), porque profundidade
  ilimitada + symlink é o cenário concreto de ciclo infinito que a
  varredura recursiva introduz; filhos diretos continuam como estavam para
  não mudar comportamento observável de quem já chama `scanWorkspace` hoje.
