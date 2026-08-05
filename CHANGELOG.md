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

- fix: painel Sidekiq/webpack — ícones, log e visibilidade condicional (`9d17ce8`)
- fix: corrige ícones sem tamanho no layout de Perfis de ambiente (`5419229`)
- Adiciona licença MIT ao projeto (`7bd9bd0`)
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
