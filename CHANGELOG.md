# Changelog

Gerado automaticamente por `scripts/generate-changelog.mjs` a partir de
`git log` — não edite manualmente, rode `npm run changelog` para
regenerar. Regenerar reescreve o arquivo inteiro a partir do histórico
completo do branch atual (não é um append incremental).

Commits são agrupados por "Task NNN" quando o assunto referencia uma task
numerada (convenção deste repo, ver `tasks/`); commits sem task
numerada são agrupados por data. A ordem segue o histórico do Git, do mais
recente para o mais antigo.

Release e tags de versão (`vX.Y.Z`) são automatizados por
`.github/workflows/release-prepare.yml` e `release-tag.yml`
(`scripts/release.mjs`, task 116) — o projeto é `"private": true`, sem
publicação em registro npm; ver "Release" em `CONTRIBUTING.md`.

### Task 114

- Task 114 + 115: modelo de autorização do gh e Prettier/formatação ([#228](../../pull/228))

### Task 113

- Task 113: publica a matriz de suporte de sistemas operacionais e runtimes ([#227](../../pull/227))

### Task 112

- Task 112: lista workspaces cadastrados com switch de varredura recursiva ([#226](../../pull/226))

### 2026-08-06

- package (`2887a9e`)

### Task 111

- Task 111: expõe a varredura recursiva de workspace na API e na UI ([#225](../../pull/225))

### Task 110

- Task 110: varredura recursiva de workspace (opt-in) em project-discovery ([#224](../../pull/224))

### Task 109

- Task 109: remove código órfão de stash (frontend, API, contracts) ([#223](../../pull/223))

### Task 108

- Task 108: E2E de commit Git; achado do stash sem UI no painel Git ([#222](../../pull/222))

### Task 107

- Task 107: E2E de mutações de branch Git (sucesso, erro, vazio, troca de projeto) ([#221](../../pull/221))

### Task 106

- Task 106: E2E do catálogo de scripts (carregamento, sucesso, erro, troca de projeto) ([#220](../../pull/220))

### Task 105

- Task 105: revisão dirigida do npm audit; reconcilia docs/ vs tasks/ ([#219](../../pull/219))

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
