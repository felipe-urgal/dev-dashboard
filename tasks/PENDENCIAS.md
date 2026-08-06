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

- [ ] Executar caso ou `describe` de teste específico e persistir relatórios de
  cobertura — dividir em entregas separadas antes de implementar, porque os
  runners e formatos de relatório diferem.
- [ ] Avaliar GitHub CLI somente depois de definir seu modelo de autorização.

## Descoberta e projetos complexos

- [ ] Tela para alternar `recursiveScan` de um workspace **já cadastrado**
  pela UI — a task 111 entregou a opção no cadastro (checkbox no
  `WorkspaceManagerModal`) e `PATCH /api/workspaces/:workspaceId` na API,
  mas não existe hoje nenhuma tela de edição de workspace na UI (o modal só
  cria); só é possível alternar via API diretamente ou recadastrando.

## CLI Bash

- [ ] Definir a estratégia para compartilhar regras com web e API sem quebrar
  a independência do CLI existente.

## Qualidade e manutenção

- [ ] Expandir o Playwright para operações de banco de dados
  (snapshot/restore) — exige um serviço de banco na fixture. Scripts (task
  106), mutações de branch Git (task 107) e commit (task 108) já ganharam
  cobertura.
- [ ] Avaliar Prettier e uma política de formatação automática em entrega
  própria, evitando um diff massivo misturado com mudanças funcionais.
- [ ] Medir cobertura e definir metas por camada.

Esses itens não formam uma única frente coerente: cada um deve ganhar uma
task própria quando houver motivação, escopo e critério de saída concretos.

## Concluído recentemente (referência)

- Task 110 — Varredura recursiva de workspace (opt-in) em
  `packages/project-discovery`: `scanWorkspace({ recursive: true })` com
  `maxDepth`/`maxProjects`/`timeoutMs` e política de symlinks (não segue por
  padrão).
- Task 111 — Expõe a varredura recursiva na API e na UI: `Workspace.
  recursiveScan` persistido, checkbox no cadastro do workspace, `PATCH
  /api/workspaces/:workspaceId` para alternar depois. Falta só a tela de
  edição de workspace na UI (ver item acima).

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
`tasks/NEXT.md`.
