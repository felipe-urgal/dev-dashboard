# AGENTS.md

Guia rápido para agentes de IA (Claude Code, Cursor, Copilot, etc.) que
forem trabalhar neste repositório. Complementa o `CLAUDE.md` — leia
ambos antes de editar qualquer arquivo.

## O que é este projeto em uma frase

Um repositório com **duas interfaces** para o mesmo domínio: um CLI bash
em `lib/` (carregado no shell do usuário via `init.sh`) e um dashboard
web TypeScript em `apps/` + `packages/`. Nenhum dos dois substitui o
outro; o web reaproveita conceitos por trás de uma API HTTP local.

## Regras de ouro

1. **Idioma**: todo texto criado ou editado (UI, comentários, mensagens
   de commit, documentação, PRs) é em **português brasileiro**.
2. **Documentação de tasks**: cada entrega funcional tem um arquivo
   numerado em `tasks/NNN-*.md`. `docs/` é só documentação viva do
   produto — planejamento e histórico de entregas vivem em `tasks/`. Ao
   concluir uma task:
   - registrar `tasks/NNN-*.md` com o resultado real
   (status, arquivos, decisões, limitações);
   - substituir `tasks/NEXT.md` pelo plano detalhado da próxima
     entrega;
   - atualizar `tasks/README.md` com a nova entrada e reconciliar
     `tasks/PENDENCIAS.md`.
3. **Segurança da API**: leia `docs/architecture/security.md` antes de
   adicionar qualquer rota. A API é um processo privilegiado local:
   nada de shell arbitrário, `cwd` sempre do `ProjectStore`, catálogo
   de ações fechado, schemas de resposta explícitos.
4. **CLI bash e web são independentes**: mudanças em `lib/*` não
   precisam tocar em `apps/`/`packages/` e vice-versa. Se precisar de
   compartilhamento, decida deliberadamente e documente.
5. **UI dupla no CLI bash**: qualquer função interativa deve suportar
   `gum` **e** o fallback puro (`read -r -p` + menu numerado).

## Layout do repositório

```
apps/
  api/         # Fastify, escuta em 127.0.0.1, autenticação por token
  web/         # Vue 3 + Vite SFCs, consome apenas a API
packages/
  contracts/         # Tipos TS puros compartilhados
  core/              # Configuração de workspaces, token local
  project-discovery/ # Detecção de projetos (Rails / Node)
  process-manager/   # Ciclo de vida de processos (server / test)
lib/           # CLI bash original (carregado pelo ~/.bashrc)
docs/
  architecture/  # overview.md, security.md
  tasks/         # NNN-*.md por entrega + NEXT.md + README.md
  roadmap.md
init.sh        # Entry point do CLI bash
```

## Comandos que você provavelmente vai rodar

```bash
npm install                    # uma vez, na raiz
npm run typecheck              # tsc --build em todos os workspaces
npm run build                  # packages primeiro, depois apps
npm test                       # --workspaces --if-present
npm run dev                    # API (:4343) + web (:5173) juntos
```

`build:packages` roda `contracts → core → project-discovery →
process-manager`. Os apps importam **`dist/`**, não o TS fonte — se
esqueceu de rebuildar após editar um package, o typecheck pode mentir.

## Convenções da API (backend `apps/api`)

- Fastify + JSON Schema. Cada rota tem `params`, `body`, `querystring`
  e `response` declarados explicitamente.
- Schemas de resposta ficam em `apps/api/src/http/response-schemas.ts` e
  **descartam campos não listados na serialização** — é a última linha
  de defesa para evitar vazamento.
- Erros passam por `apps/api/src/http/api-error.ts` (`ApiError` e
  `ApiErrorCode`). Adicionou um erro novo? Adicione o código na união.
- Rotas privadas exigem o header `X-Dev-Dashboard-Token`
  (`apps/api/src/security/local-security.ts`). `GET /api/health` é a
  única pública.
- Processos gerenciados usam `packages/process-manager`. O `kind` é
  `'server'` ou `'test'`; adicionar um novo kind exige generalizar
  `resolveLogFile`, `resolveProcessFile`, mapas `observedExits`,
  `exitWaiters` e o regex do `sweepStaleProcesses`.

## Convenções do frontend (`apps/web`)

- Vue 3 SFCs. Chamadas à API só via `apps/web/src/api.ts` (`requestJson`
  centraliza o tratamento de erro).
- Nunca acesse filesystem, execute comandos ou faça polling em portas
  a partir do frontend — é responsabilidade da API.
- Ao trocar de projeto, painéis devem invalidar seu estado (padrão
  `generation` em `ProjectGitPanel.vue` / `ProjectTestsPanel.vue`).
- Rotas ficam em `apps/web/src/router/index.ts`. A `ProjectDetailsView`
  reaproveita o mesmo componente para as sub-rotas
  (`project-details`, `project-git`, `project-tests`).

## Convenções do CLI bash (`lib/`)

- Comandos públicos: `dev-*`, `git-*`, `project-*` em kebab-case,
  exportados via `export -f`.
- Helpers privados: prefixados com `_`, snake_case, não exportados.
- Cada módulo de funcionalidade segue o trio
  `init.sh` + `helpers.sh` + `run.sh` (ou `start.sh` / `stop.sh` /
  `logs.sh` / `menu.sh`). Não invente convenção nova.
- Módulos opcionais são carregados com `required=false`; sua ausência
  emite aviso, não aborta.

## Testes

- Node test runner (`node --test`) com `tsx` para carregar `.ts`.
- Padrão de nome: `*.test.ts` em `test/` de cada workspace.
- Não há suíte automatizada para o CLI bash — a validação lá é manual
  ou usa a suíte do próprio projeto alvo.

## Como abrir e fechar uma task de trabalho

1. Ler `tasks/NEXT.md` e o `docs/architecture/overview.md`
   relevante.
2. Implementar, adicionando ao menos um teste automatizado quando o
   escopo suportar.
3. Rodar `npm run typecheck && npm run build && npm test`.
4. Atualizar o documento da task e o `tasks/README.md`.
5. Substituir `tasks/NEXT.md` pelo próximo plano.
6. Commit descritivo em português, PR em draft.

## O que evitar

- Executar `git` de escrita em nome do usuário sem instrução direta.
- Introduzir dependências novas em `packages/contracts` — ele é
  intencionalmente puro (só tipos).
- Aceitar caminhos absolutos vindos do navegador para operações de
  filesystem ou processo.
- Misturar convenções entre CLI bash e web sem discussão prévia.
- Deixar `dist/` desatualizado antes de rodar `dev`/`build`/`test`.
