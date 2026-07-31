# Registro de tasks

Cada entrega funcional deve possuir um documento numerado nesta pasta. O documento registra objetivo, escopo, decisões, arquivos alterados, critérios de aceite, testes automatizados, roteiro de QA, limitações, resultado e referência do PR.

`NEXT.md` descreve a próxima atividade aprovada em detalhe. Ao concluir uma task, o registro atual deve ser atualizado com os resultados reais e `NEXT.md` deve ser substituído pelo próximo plano.

## Status

- `001-project-git.md` — implementação da visão Git somente leitura.
- `002-project-tests.md` — implementação da visão de testes do projeto.
- `003-project-database.md` — inspeção e inicialização segura de serviços locais de banco via systemd, com autorização polkit compatível com a API destacada.
- `004-project-scripts.md` — catálogo seguro e somente leitura de scripts Node, tarefas Rails e executáveis conhecidos, com encerramento do grupo da detecção Rails no timeout.
- `005-roadmap-audit.md` — reconciliação do roadmap com o produto atual e diagnóstico não destrutivo do ambiente web.
- `006-local-web-distribution.md` — distribuição local em origem única, frontend estático, sessão segura de navegador e comando `dev-web`.
- `007-safe-catalog-execution.md` — execução segura e cancelável dos itens reconhecidos do catálogo, com confirmação por risco, logs limitados e restauração da última execução ao voltar para a página.
- `008-log-protection-retention.md` — mascaramento central de credenciais nas três fontes de logs, metadados explícitos na API, avisos na UI e consolidação da retenção local limitada.
- `009-execution-history.md` — persistência versionada e limitada do histórico do catálogo, reconciliação segura após reinício, paginação por IDs e consulta no painel.

- `010-realtime-execution-events.md` — acompanhamento SSE autenticado e limitado das execuções do catálogo, com recuperação determinística por HTTP.
- `011-product-audit-and-planning.md` — auditoria integral do produto e da documentação, reconciliação do roadmap e priorização das próximas entregas.
- `012-unified-activity-panel.md` — painel de atividade unificado completo: contrato `Activity`, `ActivityService` agregador, rota `GET /api/activities`, view Vue `/activity` com filtros e paginação, e helpers testáveis.
- `013-ui-test-baseline.md` — inaugura a camada de testes de componentes montados no frontend (`vitest` + jsdom + `@vue/test-utils`), com quatro casos cobrindo os estados vazio/carregando/erro/sucesso da `ActivityView`.
- `014-global-processes-page.md` — página global `/processes` listando servidores e testes gerenciados, com filtros fechados, limpeza segura de estados obsoletos e a nova rota `GET /api/processes`.
- `015-git-diff-read-only.md` — diff Git somente leitura (resumido e por arquivo) com truncamento em 262 KiB, mascaramento de segredos e validação de path contra o diretório do projeto.
- `016-git-branch-mutations.md` — primeira mutação Git: criar branch a partir do HEAD e trocar de branch, com confirmação obrigatória, validação de nome e recusa quando a árvore de trabalho está suja.
- `017-design-review.md` — etapa 1 da reforma de design: auditoria do vocabulário visual atual e decisões registradas em `docs/design/redesign-2026.md` (tokens, padrões de componente, densidade, tema, roteiro da etapa 2). Só documentação.
- `018-tokens-and-card.md` — etapa 2 da reforma: esqueleto de camadas CSS com `apps/web/src/styles/tokens.css`, componente `<Card>` compartilhado e migração do `ProjectCard` como prova de conceito.
- `019-status-badge.md` — componente `<StatusBadge>` compartilhado alimentado pelos tokens de status, com mapeadores por domínio e remoção das cinco famílias de classes ad hoc do CSS legado.
- `020-project-detail-cards.md` — migração dos cinco painéis de detalhe do projeto para `<Card>`, com cabeçalhos por slots e remoção das superfícies duplicadas.
- `021-dashboard-cards.md` — migração do hero, workspace, métricas e lista de projetos do dashboard principal para `<Card>`, `<StatusBadge>` e tokens compartilhados.
- `022-theme-density.md` — preferências persistentes de tema e densidade, controles acessíveis e migração visual da sidebar para tokens.
- `023-css-consolidation.md` — consolidação final do CSS legado em camadas, migração de cores ativas para tokens e guardas automatizadas da arquitetura visual.
- `024-e2e-smoke.md` — base de smoke E2E com Playwright em origem única, fixtures determinísticas e sem estado pessoal, cobrindo navegação, tema/densidade, responsividade e um baseline visual da sidebar.
- `025-git-pull-push.md` — pull (fast-forward apenas) e push do branch atual com a mesma política de confirmação e validação de árvore limpa das mutações de branch, incluindo publicação do branch em "origin" no primeiro push.
- `026-git-commit-stash.md` — commit (staged ou "incluir todas as alterações") e stash (guardar/restaurar o mais recente) com a mesma política de confirmação das demais mutações Git, fechando a série "Git em etapas" do roadmap.
- `027-test-focused-execution.md` — execução de um arquivo de teste específico (Vitest, Jest, node:test, RSpec, Rails Test e pytest), reaproveitando o motor de execução existente do catálogo de testes.
- `028-test-execution-history.md` — histórico persistente e paginado das execuções de teste por projeto, sobrevivendo a reinícios da API, reconciliado a partir do snapshot único mantido pelo `ProcessManager`.
- `029-test-execution-events.md` — eventos SSE autenticados para a execução de teste em andamento (estado + log), substituindo o polling do painel pelo mesmo padrão de reconexão com backoff do catálogo de scripts.
- `030-rails-migrations-routes.md` — inspeção Rails somente leitura de migrations e rotas reconhecidas.
- `031-rails-migrations-mutable.md` — operações Rails de migrations com catálogo fechado e confirmação obrigatória.
- `032-bundler-diagnostics.md` — diagnóstico Bundler somente leitura para projetos Rails.
- `033-command-palette-navigation.md` — primeira fatia da command palette, com busca e navegação client-side por teclado.
- `034-command-palette-actions.md` — ações autorizadas de servidor na command palette, com disponibilidade por capacidade/estado, risco explícito, confirmação em duas etapas e correção do ciclo de foco modal.
- `035-safe-retention-settings.md` — configurações autenticadas e limitadas de retenção, persistência privada, tela dedicada e correção do estado desconhecido da paleta.
- `036-processes-page-refresh.md` — reforma visual da página global de processos, filtros e resumo por estado, com limpeza manual imediata de todos os finalizados e preservação dos processos ativos.
- `037-activity-page-refresh.md` — reforma visual do painel global de atividade, com resumo correto antes da paginação, busca, agrupamento por data e tabela responsiva.
- `038-settings-page-refresh.md` — reforma visual de Configurações, estado de alterações pendentes e descarte automático dos alertas transitórios do frontend.
- `039-global-shell-refresh.md` — reforma da sidebar e topbar, navegação principal com Visão geral e drawer funcional em telas pequenas.
- `040-avisos-locais.md` — central de avisos locais na topbar para conclusões de testes, scripts e servidores, com região aria-live, deduplicação por execução, limite fechado e sem persistência.
- `041-git-save-panel.md` — commit rápido "salvar tudo" no painel Git (equivalente ao `git-save` do CLI), preparando todas as alterações e commitando com prefixo derivado do branch, sob a mesma confirmação em duas etapas das demais mutações Git.
- `042-process-maintenance-cleanup.md` — limpeza de logs órfãos sem estado correspondente (lacuna real do `dev-clean` do CLI), estendendo `sweepStaleProcesses`; `dev-kill-port` avaliado e adiado por conflitar com a validação de identidade de processos.
- `043-git-pull-request-url.md` — equivalente ao `git-pr` do CLI: compõe e abre a URL de criação de PR/MR (GitHub ou GitLab) a partir do remote "origin" já configurado, publicando o branch primeiro quando necessário, sem chamar API de provedor nem exigir token de terceiros.
- `044-project-details-header.md` — simplificação do cabeçalho de detalhes do projeto, removendo as ações redundantes de copiar caminho, abrir Git e executar script.
- `045-project-details-branch.md` — remoção dos metadados secundários e do status de servidor do cabeçalho de detalhes, deixando a branch atual em destaque.
- `046-project-details-avatar.md` — remoção do avatar com iniciais do cabeçalho de detalhes e do recuo associado, preservando nome, tipo, caminho e branch.
- `047-git-branches-crud.md` — Branches como entrada padrão do painel Git, com lista unificada local/`origin`, criação prefixada, troca, renomeação e remoção forçada local, sem duplicar ações de sincronização.
- `048-git-sync-main.md` — Sincronização como primeira aba do painel Git, reduzida a uma operação confirmada que atualiza `main` a partir de `upstream/main` e publica em `origin/main`.
- `049-git-commit-simple.md` — Commit reduzido a duas operações: criação com todas as alterações rastreadas e correção segura do último commit via amend.
- `050-git-diff-github.md` — Diff no vocabulário do GitHub: arquivos empilhados com cabeçalho fixo e marcação de revisado, destaque intralinha, realce de sintaxe com detecção automática de linguagem e expansão de contexto por uma rota nova de faixas de linhas, restrita aos arquivos do próprio diff.
- `051-database-snapshots.md` — snapshot e restore de banco no painel (equivalente ao `db:snapshot`/`db:restore` do CLI): dump comprimido no diretório de estado, retenção de 10 por projeto e restauração em duas etapas, sempre a partir do ambiente detectado.
