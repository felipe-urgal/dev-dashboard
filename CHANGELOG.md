# Changelog

Gerado automaticamente por `scripts/generate-changelog.mjs` a partir de
`git log` — não edite manualmente, rode `npm run changelog` para
regenerar. Regenerar reescreve o arquivo inteiro a partir do histórico
completo do branch atual (não é um append incremental).

Commits são agrupados por "Task NNN" quando o assunto referencia uma task
numerada (convenção deste repo, ver `docs/tasks/`); commits sem task
numerada são agrupados por data. A ordem segue o histórico do Git, do mais
recente para o mais antigo.

Isto cobre só a parte de **changelog** do item "Automatizar changelog,
release e tags de versão" de `docs/PENDENCIAS.md`. Release e tags de
versão continuam pendentes de uma decisão de política de versionamento (o
projeto é `"private": true`) — ver a task 093 e o item correspondente em
`docs/PENDENCIAS.md`.

### 2026-08-05

- Corrige alinhamento em Dependências, scroll do editor e lista Markdown no README ([#202](../../pull/202))
- feat: adiciona central profissional de documentação ([#201](../../pull/201))
- packege (`7a84d46`)

### Task 103

- refactor: divide GitService e ScriptExecutionService por domínio (task 103) ([#199](../../pull/199))

### 2026-08-05

- fix: corrige commit e adiciona ambiente do servidor ([#200](../../pull/200))

### Task 102

- Task 102: adiciona conselheiro de impacto após mudanças Git ([#198](../../pull/198))

### 2026-08-05

- chore: adiciona consolidador temporário do PR 194 ([#196](../../pull/196))
- feat: adiciona inspetor seguro de portas locais ([#193](../../pull/193))
- ajustes (`49fc847`)
- feat: adiciona navegador de falhas e fluxos Git seguros ([#191](../../pull/191))

### Task 098

- Task 098: conclui a migração da política de risco e histórico Git ([#192](../../pull/192))

### 2026-08-05

- package (`5bedc4d`)
- feat: adiciona Project Doctor somente leitura ([#190](../../pull/190))
- Licença MIT, correções no painel Sidekiq/webpack e política de risco Git ([#189](../../pull/189))
- docs: add audited feature opportunities for daily development ([#188](../../pull/188))
- Atuação em 3 frentes: perfis de ambiente, Sidekiq/Webpack/credenciais, E2E ([#187](../../pull/187))
- packege (`d0b63a0`)

### 2026-08-04

- Adiciona adaptador seguro para abrir o servidor no navegador do sistema ([#186](../../pull/186))
- Gera documentação da API a partir dos JSON Schemas das rotas Fastify ([#185](../../pull/185))

### Task 093

- Task 093: automatiza geração de CHANGELOG a partir do git log ([#184](../../pull/184))

### Task 089

- Task 089: adiciona projetos recentes por workspace ([#183](../../pull/183))

### 2026-08-04

- Adiciona cache da detecção inicial do CLI para workspaces grandes ([#182](../../pull/182))

### Task 087

- Task 087: testes para helpers Sidekiq, Webpack, Credenciais e Server Core ([#181](../../pull/181))
- Task 087: adiciona exportação segura de logs ([#180](../../pull/180))
- Task 087: adiciona suíte de testes para helpers não interativos do CLI ([#179](../../pull/179))

### 2026-08-04

- Suíte de testes para helpers não interativos do CLI bash ([#177](../../pull/177))

### Task 086

- Task 086: audita prioridades pós-IDE ([#176](../../pull/176))

### Task 085

- Task 085: otimiza navegação em tablet com E2E responsivo ([#175](../../pull/175))

### Task 084

- Task 084: ferramentas de símbolo para o assistente de IA ([#174](../../pull/174))

### Task 083

- Task 083: aplicação de edições propostas pela IA e correções do painel ([#173](../../pull/173))

### 2026-08-04

- Corrige posição do painel de IA e tema padrão do editor ([#172](../../pull/172))
- Adiciona publicação de branches locais no origin ([#171](../../pull/171))

### Task 081

- Task 081 — Compleção inline com Ollama, realce de Haml e tokens Ruby no tema ([#170](../../pull/170))

### Task 080

- Task 080 — IA local com Ollama no editor embutido ([#169](../../pull/169))

### Task 079

- Task 079 — LSP Ruby/Rails e melhorias do editor embutido ([#168](../../pull/168))

### Task 078

- Task 078 — LSP JavaScript/TypeScript no editor ([#167](../../pull/167))

### Task 077

- Conclui Task 077 e melhora navegação, scroll e push ([#166](../../pull/166))
- Task 077 — operações seguras e layout do editor ([#165](../../pull/165))
- Task 077 — salvamento seguro no editor ([#164](../../pull/164))

### Task 076

- Task 076 — fundação da IDE embutida com Monaco ([#163](../../pull/163))

### Task 075

- Task 075 — auditoria inicial de acessibilidade ([#162](../../pull/162))

### 2026-08-03

- Substitui diálogos nativos por modal global ([#160](../../pull/160))
- Documenta IDE embutida com Monaco, LSP e IA local (`e088b9d`)
- Padroniza tipografia de Dependências e build ([#159](../../pull/159))
- Redesenha dependências e remove suporte a Docker ([#158](../../pull/158))
- Corrige migrations e coordenação entre banco local e Docker ([#157](../../pull/157))

### Task 073

- Tasks 073–074 — skeletons, runtime do banco e Dependências ([#156](../../pull/156))

### 2026-08-03

- Adiciona dependências e build por projeto ([#155](../../pull/155))
- feat(web): adiciona skeleton acessível à visão geral ([#154](../../pull/154))
- Remove arquivo temporário (`dd749f8`)
- placeholder (`d0fd7a0`)
- Adiciona notificações nativas opt-in ([#153](../../pull/153))
- Corrige falso-positivo de "servidor já rodando" quando Docker ocupa a porta ([#152](../../pull/152))
- Adiciona favoritos persistentes por projeto ([#151](../../pull/151))
- Melhora diagnóstico de falhas no Docker Compose e reconhece projetos dockerizados ([#150](../../pull/150))
- Adiciona health checks locais declarativos ([#149](../../pull/149))

### 2026-08-02

- Adiciona build assíncrono de serviços Docker Compose ([#148](../../pull/148))
- Adiciona variáveis seguras em tarefas Rake ([#147](../../pull/147))
- Adiciona controle seguro de serviços Docker Compose ([#146](../../pull/146))
- Adiciona abertura segura do editor local ([#145](../../pull/145))

### 2026-08-01

- fix command palette folder icon import ([#144](../../pull/144))
- Corrige parada de servidores e refatora componentes grandes ([#143](../../pull/143))
- fix migration syntax highlighting after comments ([#142](../../pull/142))
- fix: update vulnerable brace-expansion dependency (`ec449c5`)
- Refatoração pura de arquivos grandes — Fases 6 e 7 ([#140](../../pull/140))
- Exibe branch atual na lista de projetos ([#141](../../pull/141))
- Documenta plano de refatoração, Rake tasks e frentes do editor ([#139](../../pull/139))
- Refina catálogo de scripts ([#138](../../pull/138))
- Limpa a aba Banco de dados e adiciona pausar/reiniciar o banco local ([#135](../../pull/135))
- Transforma navegação rápida em central de comandos ([#137](../../pull/137))
- Amplia painel de logs ([#136](../../pull/136))
- Simplifica painel de servidor ([#134](../../pull/134))

### 2026-07-31

- Deixa o terminal de logs reativo ao tema, seguindo o padrão do diff do Git ([#133](../../pull/133))
- Corrige empilhamento visual da árvore de parâmetros e falso positivo de SQL ([#132](../../pull/132))
- Corrige syntax highlight do SQL: v-html não recebe o atributo de escopo do Vue ([#131](../../pull/131))
- Painel de logs do servidor: inspetor dividido, mais recente no topo, corrige travamento ([#130](../../pull/130))
- Melhora leitura do stream de logs com syntax highlight ([#129](../../pull/129))
- Corrige sincronização Git e ações de branches remotas ([#128](../../pull/128))
- fix(web): compacta comando longo na execução de testes ([#127](../../pull/127))
- Limpa o resultado de testes após sucesso ([#126](../../pull/126))
- docs: atualiza README/roadmap/security e remove docs concluídos ([#125](../../pull/125))
- package (`4a8cb1f`)
- Histórico com diff por arquivo e layout de tabela ([#120](../../pull/120))
- fix: faz README ocupar toda a largura ([#124](../../pull/124))
- refactor: remove menus laterais do README ([#123](../../pull/123))
- feat: exibe status da pull request no cabeçalho ([#121](../../pull/121))
- Corrige abertura e detecção de Pull Request existente ([#119](../../pull/119))
- chore: remove arquivo temporário acidental (`de4f01e`)
- x (`4bfbbda`)
- Evita criação de Pull Request duplicada ([#118](../../pull/118))
- Organiza fluxos Git em abas próprias ([#117](../../pull/117))
- Adiciona desfazer Git e abertura de Pull Request ([#116](../../pull/116))
- Inclui alterações atuais ao alterar o último commit ([#115](../../pull/115))
- Executa testes relacionados às alterações da branch ([#114](../../pull/114))
- packege (`8a51c43`)
- Snapshot e restore de banco no painel ([#113](../../pull/113))
- Diff no estilo GitHub: protótipo e implementação ([#111](../../pull/111))
- Restaura a largura da sincronização ([#112](../../pull/112))
- Padroniza os layouts das ferramentas Git ([#110](../../pull/110))

### 2026-07-30

- Simplifica o fluxo de commit no painel Git ([#109](../../pull/109))
- Remove Stash da navegação do Git ([#108](../../pull/108))
- Simplifica a sincronização da branch main ([#107](../../pull/107))
- Destaca a porta na listagem de projetos ([#106](../../pull/106))
- Simplifica o CRUD de branches no painel Git ([#105](../../pull/105))
- Remove avatares da listagem de projetos ([#104](../../pull/104))
- Adiciona ação para parar todos os servidores ([#103](../../pull/103))
- Remove o avatar dos detalhes do projeto ([#102](../../pull/102))
- Adiciona ação para iniciar servidores na visão geral ([#101](../../pull/101))
- Destaca a branch no cabeçalho de detalhes ([#100](../../pull/100))
- Simplifica o cabeçalho de detalhes do projeto ([#99](../../pull/99))
- Reorganização de arquivos grandes — fase 6, etapa 1: funções livres do process-manager.ts ([#98](../../pull/98))
- Reorganização de arquivos grandes — fase 5: conclusão da camada enhancer (11 arquivos) ([#97](../../pull/97))
- Reorganização de arquivos grandes — fase 5: quebra do log-visual-enhancer.ts ([#96](../../pull/96))
- Merge pull request #95 from felipe-urgal/claude/reorganizar-arquitetura-arquivos-fase5b (`990294f`)
- Reorganização de arquivos grandes — fase 5: quebra do git-summary-global-search-fix.ts (`ead2886`)
- Reorganização de arquivos grandes — fase 5: quebra do git-inline-file-diff-enhancer.ts (`afd5d12`)
- Reorganização de arquivos grandes — fase 5: quebra do git-summary-history-enhancer.ts (`e54b0e8`)
- Reorganização de arquivos grandes — fase 5: quebra do git-stash-enhancer.ts (`2902ad8`)
- Reorganização de arquivos grandes — fase 1: rotas Git e response-schemas por domínio ([#94](../../pull/94))

### Task 043

- feat(git): compõe e abre URL de PR/MR no painel Git (task 043) ([#91](../../pull/91))

### 2026-07-30

- Planejamento: reorganização dos arquivos grandes do monorepo ([#93](../../pull/93))
- Redesenha execução de testes com fluxo guiado ([#92](../../pull/92))
- Corrige travamento e classificação visual dos logs de testes ([#90](../../pull/90))
- Melhora a central de notificações ([#88](../../pull/88))

### 2026-07-29

- Melhora a visualização dos logs de testes ([#87](../../pull/87))
- Redesenha o explorador de scripts e tarefas ([#86](../../pull/86))
- chore: remove accidental placeholder (`848d6ae`)
- chore: seed scripts explorer branch (`2cf9dd2`)
- Redesenha o explorador de banco de dados do projeto ([#85](../../pull/85))
- fix(web): restaura quebra de linha no log de testes e adiciona limpeza do histórico ([#84](../../pull/84))
- docs: sincroniza documentação + fix: log de testes e cabeçalhos de diff ([#80](../../pull/80))
- Refina os diffs e os logs de testes ([#83](../../pull/83))
- Limita o Histórico à branch e aprimora todos os diffs ([#82](../../pull/82))
- Melhora quebra e destaque dos logs de testes e padroniza diffs inline ([#81](../../pull/81))
- Limpa logs órfãos sem estado correspondente (dev-clean gap) ([#79](../../pull/79))
- Redesenha a visualização e os logs de testes ([#78](../../pull/78))
- Corrige contexto repetido e rolagem do diff ([#77](../../pull/77))
- Aprimora feedback, busca e revisão do Git ([#76](../../pull/76))
- Ativa diff por arquivo no Resumo e compacta históricos ([#75](../../pull/75))
- Corrige diff por arquivo no Histórico ([#74](../../pull/74))
- Padroniza diff por arquivo nas áreas do Git ([#73](../../pull/73))
- Redesenha a página de Histórico do Git ([#72](../../pull/72))
- Redesenha a página de Diff do Git ([#71](../../pull/71))
- Redesenha Stash e pagina histórico da branch atual ([#70](../../pull/70))
- Melhora resumo, histórico e página de Commit do Git ([#69](../../pull/69))
- Moderniza navegação e sincronização do Git ([#68](../../pull/68))
- Redesenha a página de branches do Git ([#67](../../pull/67))
- Redesenha Git com origin, upstream e páginas separadas ([#66](../../pull/66))

### 2026-07-28

- Explica consultas SQL em português ([#65](../../pull/65))
- Remove arquivo acidental (`4af2792`)
- noop (`6e24522`)
- Destaca SQL, erros e resultados da busca nos logs ([#64](../../pull/64))
- Melhora leitura de logs Yarn, SQL e renderização ([#63](../../pull/63))
- Melhora visualização dos logs Rails ([#62](../../pull/62))
- ajustes (`202548b`)
- Redesenha aba de servidor conforme protótipo ([#61](../../pull/61))
- Redesenha detalhes do projeto com README, servidor e logs ([#60](../../pull/60))
- Adiciona commit rápido git-save ao painel Git do dashboard web ([#59](../../pull/59))

### Task 040

- Avisos locais de conclusão (task 040) ([#58](../../pull/58))

### 2026-07-28

- fix(e2e): aguarda ação da paleta aparecer antes de confirmar ([#57](../../pull/57))
- Melhora listagem de projetos ([#56](../../pull/56))
- Melhora sidebar e topbar do dashboard ([#55](../../pull/55))
- melhora configurações e alertas temporários ([#54](../../pull/54))
- ajusta css (`6a5d107`)
- Melhora painel global de atividade ([#53](../../pull/53))
- melhora página de processos e limpeza de finalizados ([#52](../../pull/52))
- Redesign da Dashboard: workspace na sidebar, lista de projetos e ajustes de acessibilidade ([#51](../../pull/51))

### Task 025

- docs: atualiza README e docs de arquitetura com features das tasks 025-035 ([#50](../../pull/50))

### 2026-07-27

- Code review: consolida resolveConfigDirectory e ajusta CI ([#49](../../pull/49))
- adiciona ações autorizadas à paleta ([#47](../../pull/47))
- adiciona paleta global de navegação ([#46](../../pull/46))

### Task 032

- feat(api,web): diagnóstico Bundler somente leitura (task 032) ([#45](../../pull/45))

### Task 031

- feat(api,web): migrations mutáveis do Rails com confirmação (task 031) ([#44](../../pull/44))

### Task 030

- feat(api,web): migrations status e routes do Rails, somente leitura (task 030) ([#42](../../pull/42))

### Task 029

- feat(api,web): eventos SSE para execuções de teste (task 029) ([#41](../../pull/41))

### Task 028

- feat(api,web): histórico persistente de execuções de teste (task 028) ([#40](../../pull/40))

### Task 027

- feat(api,web): executar arquivo de teste específico (task 027) ([#39](../../pull/39))

### 2026-07-27

- package (`3d0592e`)

### Task 026

- feat(api,web): commit e stash de Git com confirmação (task 026) ([#38](../../pull/38))

### Task 025

- feat(api,web): pull e push de Git com confirmação (task 025) ([#37](../../pull/37))

### Task 024

- feat(web): base de smoke E2E com Playwright (task 024) ([#36](../../pull/36))

### 2026-07-27

- consolida camadas de CSS do dashboard ([#35](../../pull/35))
- adiciona preferências de tema e densidade ([#34](../../pull/34))
- migra dashboard principal para padrões compartilhados ([#33](../../pull/33))
- migra painéis de projeto para Card ([#32](../../pull/32))

### Task 019

- feat(web): componente StatusBadge unificado + remove 5 famílias de classes ad hoc (task 019) ([#31](../../pull/31))

### Task 018

- feat(web): esqueleto de tokens + componente Card compartilhado (task 018) ([#30](../../pull/30))

### Task 017

- docs(design): revisão de design da etapa 1 da reforma (task 017) ([#29](../../pull/29))

### Task 016

- feat(git): criar e trocar branch com confirmação obrigatória (task 016) ([#28](../../pull/28))

### Task 015

- feat(git): diff Git somente leitura por arquivo (task 015) ([#27](../../pull/27))

### Task 014

- feat: página global /processes com filtros e limpeza segura (task 014) ([#26](../../pull/26))

### Task 013

- test(web): base de testes montados com vitest + jsdom (task 013) ([#25](../../pull/25))

### 2026-07-26

- feat(web): painel de atividade unificado — parte 2 (view /activity) ([#24](../../pull/24))

### Task 012

- feat(api): painel de atividade unificado — parte 1 (task 012) ([#23](../../pull/23))

### 2026-07-26

- docs: estender roadmap com paridade CLI, produtividade e DX; marcar áreas aspiracionais na IA ([#22](../../pull/22))
- docs: auditar produto e organizar planejamento futuro ([#21](../../pull/21))
- feat: realtime SSE for script execution events (API + Web) ([#20](../../pull/20))
- feat: persistir histórico de execuções e expor paginação na API e UI ([#19](../../pull/19))
- feat: mask sensitive content in logs and expose redaction metadata ([#18](../../pull/18))

### 2026-07-25

- feat(scripts): restore latest script execution and follow progress in UI ([#17](../../pull/17))
- package (`26b2a82`)
- feat: safe execution of cataloged project scripts (API, UI, contracts, docs) ([#16](../../pull/16))
- feat: distribuir dashboard web localmente com sessão segura ([#15](../../pull/15))
- Audita roadmap e adiciona diagnóstico do ambiente ([#14](../../pull/14))
- Adiciona catálogo seguro de scripts e tarefas do projeto ([#13](../../pull/13))
- Corrige inicialização do banco local via systemd ([#12](../../pull/12))
- corrige inicialização do banco via Docker Compose ([#11](../../pull/11))
- Start local database via Docker Compose; improve detection and security ([#10](../../pull/10))
- adiciona visão de banco de dados dos projetos ([#9](../../pull/9))
- feat: add project tests overview ([#7](../../pull/7))
- feat: add project git overview (`f47445b`)
- fix: harden project controls after review (`3b0438e`)

### 2026-07-24

- feat: add project details and local project controls (`a1e2434`)
- feat: add API schemas and project server settings (`7fb6df3`)

### 2026-07-23

- feat: add local API security (`349fa29`)
- feat: add web dashboard foundation (`0a58cd1`)
- Initial commit (`287ec4c`)
