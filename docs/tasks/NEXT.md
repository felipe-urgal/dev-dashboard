# Próxima atividade

`docs/tasks/083-ai-proposed-edits-plan.md` é o plano detalhado e aprovado
para a próxima implementação: aplicação de edições propostas pelo
assistente de IA (`propose_workspace_edit`), reaproveitando integralmente o
mecanismo de preview/confirmação/rollback já entregue na task 077 (sem rota
nova para aplicar, sem novo caminho de escrita) e o fluxo não-bloqueante já
decidido no documento (o modelo recebe só a confirmação de que o preview foi
gerado; aplicar/cancelar acontece inteiramente no navegador).

Antes de implementar, revalidar rapidamente que nada mudou desde o plano:

- `packages/contracts/src/ai-assistant.ts` e `packages/contracts/src/project-files.ts`
  ainda com as mesmas formas de `AiTool`/`AiChatStreamEvent`/`ProjectWorkspaceEditPreview`;
- `apps/api/src/routes/project-workspace-edits.ts` ainda concentra a lógica
  de preview/apply do jeito descrito (para decidir se vale extrair um
  serviço reutilizável ou só importar as funções existentes);
- `apps/web/src/components/ProjectWorkspaceEditReview.vue` e o double do
  Ollama de `apps/web/e2e/fixtures/ollama-double.ts` (task 082) seguem
  utilizáveis como estão.

Ao concluir a implementação: atualizar `083-ai-proposed-edits-plan.md` com
o resultado real (ele nasceu como plano, não como registro de entrega),
adicionar a entrada em `docs/tasks/README.md` e substituir este arquivo
pelo próximo plano.

## Candidatos restantes (não escolhidos desta vez)

Continuam plausíveis e sem plano detalhado, para quando a 083 concluir:

- **Contexto semântico via embeddings locais e restauração de abas/estado**
  (adiados da task 081) — exigiria seu próprio desenho de índice, política
  de exclusão e tela de configurações;
- **Ferramentas de símbolo para o assistente de IA**
  (`get_symbol_definition`/`get_symbol_references`, adiadas da task 080) —
  exigem uma sessão de LSP iniciada pela própria API, sem depender do
  WebSocket do navegador;
- **Teste E2E dedicado para compleção inline (ghost text)** — tentado e
  descartado na task 082: o Monaco real cancela deterministicamente a
  requisição do provider por causa da própria máquina de debounce/versionamento
  interna do editor, não por um bug no produto; não voltar a tentar sem uma
  estratégia diferente (ex. mockar o provider diretamente em vez de
  depender do ciclo real do Monaco);
- outras lacunas do produto fora do arco de IA/editor, a serem levantadas
  numa auditoria própria (nos moldes de `docs/tasks/011-product-audit-and-planning.md`).
