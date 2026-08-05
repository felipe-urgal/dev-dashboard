# Changelog

Gerado automaticamente por `scripts/generate-changelog.mjs` a partir de
`git log` — não edite manualmente, rode `npm run changelog` para
regenerar. Regenerar reescreve o arquivo inteiro a partir do histórico
completo do branch atual (não é um append incremental).

Commits são agrupados por "Task NNN" quando o assunto referencia uma task
numerada (convenção deste repo, ver `tasks/`); commits sem task
numerada são agrupados por data. A ordem segue o histórico do Git, do mais
recente para o mais antigo.

Isto cobre só a parte de **changelog** do item "Automatizar changelog,
release e tags de versão" de `tasks/PENDENCIAS.md`. Release e tags de
versão continuam pendentes de uma decisão de política de versionamento (o
projeto é `"private": true`) — ver o item correspondente em
`tasks/PENDENCIAS.md`.

### 2026-08-05

- remove docs velhor (`c4c35a1`)
- Corrige tabelas e links na visualização de README ([#218](../../pull/218))
- feat: separa Sidekiq e Webpack em abas dedicadas ([#217](../../pull/217))
- style: padroniza tipografia do Project Doctor ([#216](../../pull/216))
- Melhora Perfis de ambiente com editor dividido ([#211](../../pull/211))
- Remove resumo visual do health check no servidor ([#215](../../pull/215))
- Corrige borda da listagem de dependências e build ([#214](../../pull/214))
- feat: aplica versão 3 ao histórico de mutações ([#213](../../pull/213))
- feat: aplica versão compacta ao Project Doctor ([#212](../../pull/212))
- Exibe valores de variáveis de ambiente sob demanda ([#210](../../pull/210))
- Corrige alinhamento das bordas nas tabelas de processos ([#207](../../pull/207))
- package (`d55ee08`)
- Adiciona guia passo a passo do dashboard web, aba por aba ([#206](../../pull/206))
- Corrige avisos de router nos testes web e limpa imports pós-Fase 8 ([#205](../../pull/205))
- Merge remote-tracking branch 'refs/remotes/origin/main' (`25f4c56`)
- package (`b98e37f`)

### Task 104

- Task 104: padroniza lint com ESLint no monorepo ([#203](../../pull/203))

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
