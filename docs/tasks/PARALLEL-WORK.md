# Frentes paralelas

`NEXT.md` continua reservado para o plano detalhado da **próxima entrega
única**, atualizado só quando a task corrente é concluída (ver
`docs/tasks/README.md`). Este documento é diferente: uma lista curada de
candidatas do inventário (`docs/PENDENCIAS.md`) que **não competem pelos
mesmos arquivos**, para quando mais de uma pessoa/agente está implementando
ao mesmo tempo. Antes de pegar uma linha daqui, confira a coluna "Conflito
conhecido" contra o que já está em andamento.

Ao começar uma atividade desta lista, marque-a com o branch/PR em uso; ao
terminar, mova o resultado para `docs/tasks/README.md` (com o número de task
seguinte livre) e remova a linha daqui.

## Em andamento

Nenhuma frente paralela registrada no momento.

## Livres para pegar em paralelo

Nenhuma candidata livre no momento — ver "Exigem decisão de arquitetura"
abaixo para o que falta destravar.

## Exigem decisão de arquitetura antes de começar (não pegar direto)

Não são "livres" — cada uma precisa de uma definição de escopo (ver
`docs/tasks/086-post-ide-priority-audit.md`) antes de virar código:

- política de risco e histórico unificado das mutações Git (atravessa todos
  os `apps/api/src/services/git-*` e vários componentes `ProjectGit*`);
- caso/`describe` de teste específico e cobertura (por runner);
- detecção de monorepos e scans recursivos (`packages/project-discovery`);
- lint/formatação (ESLint/Prettier) — definir regras antes, porque rodar
  `--fix` depois toca praticamente todo `apps/`/`packages/` e colide com
  qualquer branch aberto;
- refatoração de `git-service.ts`/`script-execution-service.ts` — mesmo
  motivo: mexe em serviços que várias frentes Git/scripts importam;
- revisão de `npm audit` — mudanças em `package-lock.json` tendem a gerar
  conflito de merge com qualquer outro branch que também tenha instalado
  dependência nesse meio tempo.

## Concluídas recentemente (referência)

- Task 087 — Exportação segura de logs no navegador para servidor, testes e
  scripts, sem rota de arquivo bruto.
- Task 088 — Suíte de testes para helpers não interativos do CLI bash
  (`tests/cli/`), PR #177; ampliada com testes Bats e do orquestrador no PR
  #179.
- Task 089 — Projetos recentes por workspace, complementando os favoritos.
- Task 090 — Cache da detecção inicial do CLI (`lib/projects/cache.sh`) por
  assinatura de mtime, com `detect_projects --force` para ignorar.
- Task 091 — Documentação da API gerada a partir dos JSON Schemas
  (`scripts/generate-api-docs.mjs`, `docs/architecture/api-reference.md`,
  `npm run docs:api`/`docs:api:check`).
- Task 092 — Adaptador seguro para abrir o destino do servidor gerenciado no
  navegador padrão do sistema operacional, com catálogo fechado de destino e
  de comando por sistema operacional, sem shell.
- Task 093 — Changelog automatizado (`scripts/generate-changelog.mjs`,
  `npm run changelog`), agrupado por task numerada ou data a partir do
  `git log`. Só a parte de changelog; release e tags de versão continuam
  pendentes de decisão de política de versionamento.
- Task 094 — Perfis de ambiente reutilizáveis em Configurações
  (`EnvironmentProfileRepository`, `/api/settings/environment-profiles`),
  sem persistir valor de variáveis de nome sensível.
- Task 095 — Operações Sidekiq/webpack-dev-server via dois novos `kind` de
  processo gerenciado (`worker`, `webpack`) e status somente leitura de
  credenciais Rails, sem ler o conteúdo dos arquivos criptografados.
- Licença do projeto — MIT, `LICENSE` na raiz e campo `license` em
  `package.json` (item trivial, sem arquivo de task próprio).
- Task 096 — Primeira etapa da política unificada de risco e histórico Git:
  catálogo fechado, confirmação e histórico compartilhados, `GitService`
  migrado.
- Task 097 — Aba "Variáveis de ambiente" por projeto, lendo o catálogo
  fechado de arquivos `.env`, sem expor valor de variável sensível.
- Task 098 — Conclui a migração da task 096: os sete serviços Git restantes
  (sync, stash avançado, renomear/excluir/publicar branch, desfazer,
  `DashboardGitService`) passaram a usar a mesma confirmação e o mesmo
  histórico compartilhados — as 24 operações do catálogo geram evento.
