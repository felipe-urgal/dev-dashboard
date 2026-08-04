# Próxima atividade

A task 083 encerrou a aplicação de edições propostas pela IA
(`propose_workspace_edit`), a última peça grande do arco de IA/editor
iniciado na task 076. Não há uma task 084 pré-planejada — os candidatos
remanescentes seguem os mesmos listados desde a auditoria pós-task-082, sem
plano detalhado ainda.

## Candidatos sem plano detalhado

- **Ferramentas de símbolo para o assistente de IA**
  (`get_symbol_definition`/`get_symbol_references`, adiadas da task 080) —
  exigem uma sessão de LSP iniciada pela própria API, sem depender do
  WebSocket do navegador.
- **Contexto semântico via embeddings locais e restauração de abas/estado**
  (adiados da task 081) — exigiria seu próprio desenho de índice, política
  de exclusão e tela de configurações.
- **Teste E2E dedicado para compleção inline (ghost text)** — tentado e
  descartado na task 082: o Monaco real cancela deterministicamente a
  requisição do provider por causa da própria máquina de debounce/versionamento
  interna do editor, não por um bug no produto. Não reabrir sem uma
  estratégia diferente (ex. mockar o provider diretamente).
- **Estender o double do Ollama (task 082) para `propose_workspace_edit`**
  — a task 083 cobriu esse caminho com testes de unidade; um smoke E2E
  dedicado (double emitindo `tool_calls` de proposta de edição, UI
  aplicando via `ProjectWorkspaceEditReview`) ficou registrado como
  possibilidade futura, não bloqueante, em
  `docs/tasks/083-ai-proposed-edits-plan.md`.
- outras lacunas do produto fora do arco de IA/editor, a serem levantadas
  numa auditoria própria (nos moldes de
  `docs/tasks/011-product-audit-and-planning.md`).

Antes de começar a próxima implementação, revisar `docs/tasks/README.md`
(lista completa de entregas) e os documentos em `docs/architecture/` para
confirmar que a escolha não duplica algo já decidido ou já fora de escopo
por um motivo registrado.
