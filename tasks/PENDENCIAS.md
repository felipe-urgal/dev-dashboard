# Atividades pendentes

Inventário do que ainda falta implementar no Dev Dashboard. Este documento
lista só trabalho em aberto; itens concluídos ficam registrados em
`tasks/<NNN>-*.md` — `docs/` guarda apenas documentação viva do produto, não
o histórico de entregas.

## Assistente de IA e IDE embutida — candidatos ainda sem plano detalhado

- [ ] Contexto semântico via embeddings locais e restauração de abas/estado
  entre sessões — exigem desenho próprio de índice, política de exclusão e
  tela de configurações; duas frentes distintas, grandes e não bloqueantes,
  atrás de melhorias operacionais menores.
- Teste E2E dedicado para compleção inline (ghost text): **tentado e
  descartado** — o Monaco real cancela deterministicamente a requisição do
  provider por causa da própria máquina de debounce/versionamento interna do
  editor (`InlineCompletionsSource`), não por um bug no produto. Não reabrir
  sem uma estratégia diferente (ex. mockar o provider em vez de depender do
  ciclo real do Monaco).
- Smoke E2E dedicado para `propose_workspace_edit` e para as ferramentas de
  símbolo (já cobertos por testes de unidade; estender o double do Ollama
  para emitir os `tool_calls` correspondentes fica como possibilidade futura,
  não bloqueante).

## Produto e fluxos operacionais

- [ ] **Stash sem UI**: a task 026 entregou stash no painel Git, mas o
  redesenho das tasks 047–050 não migrou essa parte — hoje não existe
  nenhuma aba, botão ou rota para stash em `ProjectGitPanel.vue`.
  `apps/web/src/git-stash-enhancer.ts` (e seu CSS/diretório `git-stash/`)
  ainda existem no repositório mas não são mais importados por `main.ts`;
  a API (`apps/api/src/routes/git-stash.ts`, `GitStashService`) continua
  ativa e testada, só sem nenhum consumidor no frontend. Decisão pendente:
  remover o código órfão (frontend morto + rotas/serviço não utilizados) ou
  reconstruir a UI de stash como componente Vue, no padrão atual do painel
  Git. Descoberto ao planejar a task 108 (E2E de commit).
- [ ] Executar caso ou `describe` de teste específico e persistir relatórios de
  cobertura — dividir em entregas separadas antes de implementar, porque os
  runners e formatos de relatório diferem.
- [ ] Avaliar GitHub CLI somente depois de definir seu modelo de autorização.

## Descoberta e projetos complexos

- [ ] Detectar monorepos e oferecer scans recursivos opt-in com limites de
  profundidade, quantidade, timeout e diretórios ignorados — a descoberta
  atual lê apenas filhos diretos; a recursão depende também de política
  explícita para symlinks e deduplicação.
- [ ] Definir e implementar uma política explícita para symlinks.

## CLI Bash

- [ ] Definir a estratégia para compartilhar regras com web e API sem quebrar
  a independência do CLI existente.

## Qualidade e manutenção

- [ ] Expandir o Playwright para operações de banco de dados
  (snapshot/restore) — exige um serviço de banco na fixture. Scripts (task
  106), mutações de branch Git (task 107) e commit (task 108) já ganharam
  cobertura; stash não tem UI para testar (ver item acima).
- [ ] Avaliar Prettier e uma política de formatação automática em entrega
  própria, evitando um diff massivo misturado com mudanças funcionais.
- [ ] Medir cobertura e definir metas por camada.

Esses itens não formam uma única frente coerente: cada um deve ganhar uma
task própria quando houver motivação, escopo e critério de saída concretos.

## Distribuição, governança e compatibilidade

- [ ] Automatizar release e tags de versão. Fica pendente de uma decisão de
  política de versionamento (cadência de release, formato de tag, se o
  projeto algum dia será publicado — hoje `package.json` raiz tem
  `"private": true`) que não cabe a uma única frente paralela decidir
  sozinha.
- [ ] Criar uma política versionada de migração e backup do estado local.
- [ ] Publicar a matriz de suporte de sistemas operacionais e runtimes.
- [ ] Validar e implementar compatibilidade com macOS.
- [ ] Definir uma estratégia específica para Windows, considerando diferenças
  de processos, sinais e filesystem.

## Extensibilidade futura

- [ ] Definir um manifesto declarativo de extensões e capacidades.
- [ ] Criar adaptadores versionados e revisados.
- [ ] Permitir temas e painéis adicionais sem execução remota.

## Avaliado e adiado

- `dev-kill-port`: não deve ser portado enquanto não houver validação segura da
  identidade do processo dono da porta; o comando atual pode encerrar um PID
  alheio ao dashboard.

## Fora do escopo atual

- shell livre, plugins remotos arbitrários e exposição da API na rede;
- integrações de IA como dependência do fluxo principal (o assistente
  continua opcional, local e isolado em seu próprio painel).

## Como manter este inventário

Ao concluir uma atividade, remova-a daqui, registre o resultado no documento
da task em `tasks/<NNN>-*.md` e reconcilie `tasks/roadmap.md` e
`tasks/NEXT.md`. Para candidatas que não competem pelos mesmos arquivos e
podem avançar em paralelo, ver `tasks/PARALLEL-WORK.md`.
