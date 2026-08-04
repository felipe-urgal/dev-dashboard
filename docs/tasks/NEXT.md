# Próxima atividade

A task 082 fechou um dos candidatos levantados na auditoria pós-arco
076–081: o smoke E2E do assistente de IA agora roda em CI contra um double
HTTP do Ollama, sem depender de instalação local. Assim como antes da 082,
não há uma task 083 pré-planejada — os documentos de arquitetura que
guiaram 076–081 não descrevem nada além do que já foi implementado.

## O que isso significa para a próxima atividade

Os candidatos remanescentes da auditoria anterior (`docs/tasks/082-ollama-e2e-smoke-double.md`
registra qual foi escolhido e por quê) continuam plausíveis e sem plano
detalhado:

- **Contexto semântico via embeddings locais e restauração de abas/estado**
  (adiados da task 081) — exigiria seu próprio desenho de índice, política
  de exclusão e tela de configurações;
- **Aplicação de edições propostas pela IA** (adiada da task 080) — exige
  um formato de tool-calling estruturado e validado para patches, mapeado
  com segurança para `ProjectWorkspaceEditRequest`;
- **Ferramentas de símbolo para o assistente de IA**
  (`get_symbol_definition`/`get_symbol_references`, adiadas da task 080) —
  exigem uma sessão de LSP iniciada pela própria API, sem depender do
  WebSocket do navegador;
- **Teste E2E dedicado para compleção inline (ghost text)** — adiado da
  task 082 por ser frágil de simular via Playwright (debounce do Monaco,
  decoração inline); o double do Ollama já expõe `/api/generate` e está
  pronto para essa cobertura se o produto justificar o investimento;
- outras lacunas do produto fora do arco de IA/editor, a serem levantadas
  numa auditoria própria (nos moldes de `docs/tasks/011-product-audit-and-planning.md`).

Antes de começar a próxima implementação, revisar `docs/tasks/README.md`
(lista completa de entregas) e os documentos em `docs/architecture/` para
confirmar que a escolha não duplica algo já decidido ou já fora de escopo
por um motivo registrado.
