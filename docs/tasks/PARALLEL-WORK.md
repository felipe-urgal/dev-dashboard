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

Nenhuma frente paralela registrada. A task 089 — projetos recentes por
workspace — está reservada em `NEXT.md` como próxima entrega sequencial.

## Livres para pegar em paralelo

Cada uma toca uma área de arquivos distinta das outras linhas desta tabela e
da task 089 reservada. "Tamanho" e "Conflito conhecido" seguem a classificação
da task 086 e o texto atual de `docs/PENDENCIAS.md`.

| Atividade | Área principal | Tamanho | Conflito conhecido |
| --- | --- | --- | --- |
| Operações Sidekiq/Webpack/credenciais Rails | novas rotas em `apps/api/src/routes/rails*`, serviço em `apps/api/src/services/rails-inspection*`, painel Rails em `apps/web` | médio | nenhum com a 089; cuidado se outra frente também mexer em `rails-inspection-service.ts` |
| Adaptador seguro para abrir destino no navegador local | rota nova em `apps/api`, sem tocar painéis existentes | pequeno | nenhum |
| Perfis de ambiente reutilizáveis (sem segredos no frontend) | `packages/core`, rota em `apps/api/src/routes/settings.ts`, tela de Configurações | médio | pode disputar `packages/core` com a task 089; não iniciar enquanto ela estiver em andamento |
| Licença do projeto | arquivo `LICENSE` na raiz | trivial | nenhum |
| Documentação da API a partir dos JSON Schemas | script novo + `docs/`, leitura de `apps/api/src/routes/*` (sem alterar rotas) | pequeno/médio | somente leitura das rotas — seguro mesmo com rotas em edição, mas pode gerar diffs de doc se a rota mudar no meio do trabalho |
| Playwright para fluxos privilegiados adicionais | `apps/web/e2e/` | médio | espera a feature-alvo estar pronta; não editar o mesmo fluxo que outra frente está mudando na mesma hora |

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
- Task 090 — Cache da detecção inicial do CLI (`lib/projects/cache.sh`) por
  assinatura de mtime, com `detect_projects --force` para ignorar.
- Task 093 — Changelog automatizado (`scripts/generate-changelog.mjs`,
  `npm run changelog`), agrupado por task numerada ou data a partir do
  `git log`. Só a parte de changelog; release e tags de versão continuam
  pendentes de decisão de política de versionamento.
