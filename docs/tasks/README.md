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
