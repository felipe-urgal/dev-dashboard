# Próxima atividade

A task 084 encerrou as ferramentas de símbolo do assistente de IA
(`get_symbol_definition`/`get_symbol_references`), o último candidato "sem
plano detalhado" que já tinha uma direção de arquitetura clara. Não há uma
task 085 pré-planejada.

## Candidatos sem plano detalhado

- **Contexto semântico via embeddings locais e restauração de abas/estado**
  (adiados da task 081) — exigiria seu próprio desenho de índice, política
  de exclusão e tela de configurações. O maior candidato remanescente do
  arco de IA/editor.
- **Teste E2E dedicado para compleção inline (ghost text)** — tentado e
  descartado na task 082: o Monaco real cancela deterministicamente a
  requisição do provider por causa da própria máquina de debounce/versionamento
  interna do editor, não por um bug no produto. Não reabrir sem uma
  estratégia diferente (ex. mockar o provider diretamente).
- **Estender o double do Ollama (task 082) para `propose_workspace_edit`
  e para as ferramentas de símbolo** — cobertos por testes de unidade nas
  tasks 083/084; um smoke E2E dedicado ficou registrado como possibilidade
  futura, não bloqueante.
- outras lacunas do produto fora do arco de IA/editor, a serem levantadas
  numa auditoria própria (nos moldes de
  `docs/tasks/011-product-audit-and-planning.md`) — o arco de IA/editor
  iniciado na task 076 está, na prática, com todas as capacidades centrais
  do desenho original (`docs/architecture/embedded-ide-ai-design.md`)
  entregues; vale reavaliar se o próximo ciclo deveria olhar para outra
  área do produto em vez de aprofundar mais esta.

Antes de começar a próxima implementação, revisar `docs/tasks/README.md`
(lista completa de entregas) e os documentos em `docs/architecture/` para
confirmar que a escolha não duplica algo já decidido ou já fora de escopo
por um motivo registrado.
