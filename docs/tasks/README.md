# Registro de tasks

Cada entrega funcional deve possuir um documento numerado nesta pasta. O documento registra objetivo, escopo, decisões, arquivos alterados, critérios de aceite, testes automatizados, roteiro de QA, limitações, resultado e referência do PR.

`NEXT.md` descreve a próxima atividade aprovada em detalhe. Ao concluir uma task, o registro atual deve ser atualizado com os resultados reais e `NEXT.md` deve ser substituído pelo próximo plano.

`PARALLEL-WORK.md` é diferente: uma lista de candidatas do inventário (`docs/PENDENCIAS.md`) sem sobreposição de arquivos entre si, para quando mais de uma frente está em implementação ao mesmo tempo.

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
- `043-git-pull-request-url.md` — equivalente ao `git-pr` do CLI: compõe e abre a URL de criação de PR/MR (GitHub ou GitLab) a partir do remote `origin` já configurado, publicando o branch primeiro quando necessário, sem chamar API de provedor nem exigir token de terceiros.
- `044-project-details-header.md` — simplificação do cabeçalho de detalhes do projeto, removendo as ações redundantes de copiar caminho, abrir Git e executar script.
- `045-project-details-branch.md` — remoção dos metadados secundários e do status de servidor do cabeçalho de detalhes, deixando a branch atual em destaque.
- `046-project-details-avatar.md` — remoção do avatar com iniciais do cabeçalho de detalhes e do recuo associado, preservando nome, tipo, caminho e branch.
- `047-git-branches-crud.md` — Branches como entrada padrão do painel Git, com lista unificada local/`origin`, criação prefixada, troca, renomeação e remoção forçada local, sem duplicar ações de sincronização.
- `048-git-sync-main.md` — Sincronização como primeira aba do painel Git, reduzida a uma operação confirmada que atualiza `main` a partir de `upstream/main` e publica em `origin/main`.
- `049-git-commit-simple.md` — Commit reduzido a duas operações: criação com todas as alterações rastreadas e correção segura do último commit via amend.
- `050-git-diff-github.md` — Diff no vocabulário do GitHub: arquivos empilhados com cabeçalho fixo e marcação de revisado, destaque intralinha, realce de sintaxe com detecção automática de linguagem e expansão de contexto por uma rota nova de faixas de linhas, restrita aos arquivos do próprio diff.
- `051-database-snapshots.md` — snapshot e restore de banco no painel (equivalente ao `db:snapshot`/`db:restore` do CLI): dump comprimido no diretório de estado, retenção de 10 por projeto e restauração em duas etapas, sempre a partir do ambiente detectado.
- `052-git-history-diff.md` — Histórico como componente Vue: tabela agrupada por dia com paginação, modal do commit com diff por arquivo na mesma leitura da aba Diff (destaque intralinha, realce de sintaxe, unificado/lado a lado) e remoção dos enhancers de DOM do histórico.
- `053-server-logs-inspector.md` — painel de logs do servidor como inspetor dividido (lista + dossiê da requisição selecionada), SQL agrupado com syntax highlight, explicação em português e detecção de N+1, árvore de parâmetros, log mais recente no topo, correção do travamento da aba no primeiro log grande (renderização com teto e "carregar mais antigas") e remoção dos enhancers de DOM órfãos da estrutura de cards antiga.
- `054-server-panel-cleanup.md` — simplificação da aba Servidor, removendo as prévias redundantes de atividade e logs, e ampliação do inspetor de Logs com status, métricas e ações rápidas em uma faixa horizontal no topo.
- `055-command-center.md` — central de comandos com busca fuzzy, modos por prefixo, recentes e execução segura de servidor, testes e scripts autorizados, além de atalhos profundos para Git e banco.
- `056-database-panel-cleanup.md` — remoção das abas Rotas e Dependências (fora de escopo da aba Banco de dados) e do botão morto "Abrir cliente"; pausar e reiniciar o banco local ao lado de iniciar, com aviso quando dois ambientes detectados compartilham o mesmo serviço systemd local.
- `057-database-multidb-and-migration-modal.md` — suporte a múltiplos bancos por ambiente no `database.yml` (Rails 6+), aba Banco de dados oculta quando nenhuma configuração é reconhecida, e detalhes de migration num modal com o código em syntax highlight.
- `058-remove-git-diff-enhancer.md` — aba Diff renderizada diretamente por `ProjectGitDiffPage.vue` (mesmo caminho já percorrido pelo Histórico na 052), removendo o app Vue aninhado e os enhancers de DOM que ficaram sem alvo depois da 050.
- `059-migrations-models-per-database.md` — Migrations e Modelos passam a reconhecer múltiplos bancos por ambiente (Rails 6+): um seletor de banco no topo de cada aba, migrations separadas por bloco em vez de concatenadas, e o schema lido do arquivo correto (`db/schema.rb` vs. `db/<nome>_schema.rb`).
- `060-rails-generators.md` — aba Operações (migrate/rollback/seed/db:prepare, deslocado de Migrations) mais dois formulários novos, gerar model e gerar migration, com catálogo fechado de tipo de coluna, validação de nome e confirmação em duas etapas — a primeira ação da aba Banco de dados que cria arquivos no projeto.
- `061-scripts-refinement.md` — Scripts abre diretamente no catálogo, com lista compacta e curadoria compartilhada que remove hooks e delega servidor, testes e migrations às áreas especializadas.
- `062-dashboard-project-branch.md` — visão geral exibe a branch Git atual em cada projeto, ao lado da porta, sem bloquear a linha quando a consulta complementar falha.
- `063-stop-servers-and-scripts-refactor.md` — corrige o falso timeout ao parar processos sem observador em memória e conclui a refatoração pura de todos os componentes Vue acima de 400 linhas na Fase 7.
- `064-local-project-editor.md` — abre o projeto em um editor local conhecido, detectado no `PATH`, por catálogo fechado e processo sem shell.
- `065-docker-compose-services.md` — detecta serviços declarados no Docker Compose e oferece start, stop, restart e logs limitados por allowlist, sem shell ou build de imagens.
- `066-rake-task-variables.md` — detecta tarefas Rake e variáveis `ENV` estaticamente, gera formulário e executa com ambiente estruturado e confirmação vinculada aos valores.
- `067-docker-compose-build.md` — build assíncrono por serviço Docker Compose como um terceiro `kind` de processo gerenciado (`compose-build`), com identidade por serviço, polling adaptativo na UI, e liberação do `start` só após um build bem-sucedido.
- `068-server-health-checks.md` — health checks HTTP locais declarativos, com detecção de caminhos comuns, configuração relativa validada, timeout curto, classificação por status, polling apenas na aba Servidor e destino fixo em `127.0.0.1`.
- `069-project-favorites.md` — favoritos persistentes por projeto, reaplicados após scans, com arquivo privado, rota autenticada, atualização otimista e ordenação no topo da visão geral.
- `070-native-notifications.md` — notificações nativas opt-in para testes, scripts e builds com ao menos 30 segundos, somente com a aba oculta, deduplicadas pela central de avisos e com preferência local do navegador.
- `071-overview-loading-skeleton.md` — skeleton compartilhado e acessível na Visão geral, com anúncio imediato, atraso visual curto, espaço reservado e movimento reduzido.
- `072-project-dependencies-build.md` — aba de dependências e build para Rails e Node, com Bundler, lockfile Node, execução segura, histórico e correção da leitura de migrations em wrappers Docker.
- `073-global-loading-skeletons.md` — aplica o mesmo skeleton a Atividade, Processos e Configurações, preserva dados durante refresh e mapeia toda a documentação Markdown.
- `074-database-runtime-and-dependencies-layout.md` — distingue banco local de Docker pela porta publicada, coordena start/stop entre runtimes e compacta o layout responsivo de Dependências.
- `075-initial-accessibility-audit.md` — auditoria de landmarks, nomes, descrições, comunicação de estado, teclado e contraste nas páginas globais, com guardas automatizadas na suíte web.
- `076-embedded-ide-foundation-plan.md` — planejamento documental da IDE embutida com Monaco, leitura segura, escrita posterior, LSP JavaScript/TypeScript e Ruby/Rails, além de IA gratuita local com Ollama nas tasks 076–081.
- `077-safe-editor-save.md` — editor de texto seguro com salvamento versionado, operações estruturais confirmadas, watcher dos arquivos abertos, comparação em três vias e `WorkspaceEdit` textual com rollback.
- `078-javascript-typescript-lsp.md` — plano do LSP JavaScript/TypeScript com gateway autenticado, processo sob demanda, recursos semânticos e revisão segura de `WorkspaceEdit`.
- `079-ruby-rails-lsp.md` — LSP Ruby/Rails: gateway generalizado por `(projeto, kind)`, catálogo fechado de detecção do `ruby-lsp` sem instalação automática, capacidade Rails runtime com opt-in confirmado, e correções de UI do editor embutido (fonte do explorer, indicador de arquivo alterado, abas de preview/fixar, tema Monokai).
- `080-ollama-local-ai.md` — assistente de IA local com Ollama: painel de chat no editor embutido, ações rápidas, detecção de modelos instalados e catálogo fechado de quatro ferramentas somente leitura (arquivo, busca, listagem, diff Git), com streaming SSE cancelável sempre intermediado pela API.
- `081-inline-completion.md` — compleção inline (ghost text/FIM) com Ollama local: debounce via `CancellationToken` do Monaco, cancelamento efetivo, cache curto, modelo próprio independente do painel de chat; realce de sintaxe Haml (tokenizer Monarch novo) e tokens Ruby que faltavam no tema Monokai. Encerra o arco de planejamento das tasks 076–081.
- `082-ollama-e2e-smoke-double.md` — smoke E2E do assistente de IA em CI usando um "test double" HTTP do Ollama (`/api/tags`, `/api/show`, `/api/chat`, `/api/generate`), cobrindo o painel de chat ponta a ponta sem depender de instalação local do Ollama.
- `083-ai-proposed-edits-plan.md` — quinta ferramenta do assistente, `propose_workspace_edit`: reaproveita o preview/confirmação/rollback da task 077 sem rota nova para aplicar, `expectedVersion` sempre lido pelo servidor e fluxo não-bloqueante em relação ao modelo; painel de IA redimensionável, correção da rolagem durante o streaming, mensagem clara de timeout do Ollama e log da falha de conexão do LSP.
- `084-ai-symbol-tools-plan.md` — sexta e sétima ferramentas do assistente, `get_symbol_definition`/`get_symbol_references`: uma requisição LSP "de uma vez" disparada pelo servidor, sem depender de WebSocket do navegador — correlator de requisição/resposta com IDs negativos, mesma sessão/processo que o navegador usaria, nenhuma rota HTTP nova.
- `085-tablet-navigation-e2e.md` — app shell usa drawer entre 761 e 900 px, preserva a sidebar completa mesmo com a preferência desktop recolhida e amplia o smoke Playwright para desktop, tablet e tela estreita.
- `086-post-ide-priority-audit.md` — auditoria documental pós-IDE que compara pendências com o código atual, prioriza exportação segura de logs e divide frentes grandes antes de novas implementações.
- `087-safe-log-export.md` — exporta no navegador somente os snapshots de servidor, testes e scripts já limitados e mascarados, com nome seguro, metadados, `Blob` compartilhado e revogação do `ObjectURL`.
- `088-cli-non-interactive-tests.md` — primeira suíte automatizada do CLI bash: `tests/cli/run.sh` cobre helpers não interativos (`_dev_*`, `_project_*`, `_git_*`, `_new_*`) sem framework externo, distinta dos menus de `lib/*/tests/`; ampliada pelo PR #179 com testes Bats de Git e testes do orquestrador `scripts/dev.mjs`.
- `089-project-recents.md` — projetos recentes por workspace: registra só entrada deliberada em rota de detalhe (não scans/polling/command palette), estado local privado em `project-recents.json`, favoritos sempre acima de recentes, no máximo cinco recentes não favoritos com indicação visual.
- `090-cli-detection-cache.md` — cache da detecção inicial (`detect_projects`) por assinatura de mtime de `DEV_BASE`/overrides/projetos em `lib/projects/cache.sh`, com `detect_projects --force` para ignorar o cache, resolvendo o TODO deixado em `init.sh`.
- `091-api-docs-generator.md` — `scripts/generate-api-docs.mjs` gera `docs/architecture/api-reference.md` executando os plugins de rota reais de `apps/api/src/routes/*.ts` contra um stub mínimo de Fastify, sem duplicar schemas à mão; `npm run docs:api`/`docs:api:check`, ligado ao CI.
- `092-browser-adapter.md` — adaptador seguro para abrir a URL do servidor gerenciado no navegador padrão do sistema operacional: catálogo fechado de destino (`server`), URL resolvida pela API a partir do `ProcessManager`, e `spawn` sem shell por sistema operacional (`open`/`xdg-open`/`cmd /c start`).
- `093-generate-changelog.md` — `scripts/generate-changelog.mjs` (`npm run changelog`) gera `CHANGELOG.md` na raiz a partir de `git log`, agrupado por task numerada quando o assunto do commit referencia uma, senão por data; escopo reduzido só a changelog, release e tags de versão ficam pendentes de decisão de política de versionamento.
