# 001 — Visão Git do projeto

## Status

Implementada, aguardando code review e QA.

## Objetivo

Disponibilizar na página do projeto uma visão confiável e somente leitura do repositório Git, sem permitir operações que alterem arquivos, referências ou remotos.

## Escopo entregue

- rota web `/projects/:projectId/git`;
- endpoint `GET /api/projects/:projectId/git`;
- detecção de projeto sem repositório Git;
- branch atual, detached HEAD e upstream;
- ahead/behind conforme `git status --porcelain=v2 --branch`;
- estado limpo ou alterado;
- arquivos adicionados, modificados, removidos, renomeados, copiados, não rastreados, conflitantes e com mudança de tipo;
- último commit e até 20 commits recentes;
- atualização manual;
- estados de carregamento, erro, repositório ausente e repositório sem commits;
- resposta HTTP com schema fechado;
- execução do Git por `execFile`, sem shell intermediário.

## Fora do escopo

- stage/unstage;
- commit;
- checkout ou criação de branch;
- pull, push ou fetch;
- descarte de alterações;
- edição de remotos.

## Decisões técnicas

1. O caminho vem exclusivamente do `ProjectStore`; a rota não recebe caminhos locais.
2. Os comandos usam `execFile('git', args)` com argumentos estruturados.
3. `GIT_OPTIONAL_LOCKS=0` evita locks desnecessários em consultas somente leitura.
4. O status usa porcelain v2 e separação NUL para suportar espaços e caracteres especiais em nomes.
5. Repositórios sem commits são válidos e retornam histórico vazio.
6. A UI invalida respostas antigas ao trocar de projeto.

## Arquivos principais

- `packages/contracts/src/git.ts`
- `apps/api/src/services/git-service.ts`
- `apps/api/src/routes/projects.ts`
- `apps/api/src/http/response-schemas.ts`
- `apps/web/src/components/ProjectGitPanel.vue`
- `apps/web/src/views/ProjectDetailsView.vue`
- `apps/web/src/router/index.ts`

## Critérios de aceite

- [x] projeto sem Git apresenta estado vazio controlado;
- [x] repositório limpo apresenta branch e zero alterações;
- [x] alterações locais são listadas com status;
- [x] branch sem upstream não gera erro;
- [x] detached HEAD é identificado;
- [x] histórico é limitado a 20 commits;
- [x] atualização manual não mistura respostas entre projetos;
- [x] endpoint não aceita caminho arbitrário;
- [x] nenhuma operação Git de escrita é executada.

## QA manual

1. Abrir um projeto Git limpo e confirmar branch, upstream e histórico.
2. Modificar um arquivo rastreado e clicar em **Atualizar**.
3. Criar um arquivo não rastreado e confirmar o status.
4. Renomear e remover arquivos e conferir os rótulos.
5. Abrir um projeto sem `.git`.
6. Abrir um repositório recém-inicializado, ainda sem commits.
7. Fazer checkout de um commit e confirmar `HEAD destacado`.
8. Alternar rapidamente entre dois projetos e confirmar que dados não se misturam.
9. Recarregar diretamente `/projects/:projectId/git`.
10. Conferir layout em largura móvel.

## Resultado de validação

Preencher após execução no repositório:

- typecheck: pendente;
- build: pendente;
- testes automatizados: pendente;
- QA manual: pendente;
- PR: pendente.

## Limitações conhecidas

- ahead/behind depende de referências remotas já existentes localmente; esta task não executa `fetch`;
- submódulos aparecem conforme o status reportado pelo Git, sem painel próprio;
- repositórios muito grandes têm saída limitada pelo buffer de 4 MiB.

## Próxima atividade

Descrita em `docs/tasks/NEXT.md`.
