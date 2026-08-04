# Próxima atividade

A task 081 encerra o arco de planejamento documental de `docs/architecture/embedded-ide-ai-design.md`
(tasks 076–081): fundação da IDE embutida com Monaco, salvamento seguro,
LSP JavaScript/TypeScript, LSP Ruby/Rails, IA local com Ollama (chat +
catálogo fechado de ferramentas) e agora compleção inline (ghost text/FIM),
além de correções de legibilidade do editor (realce de sintaxe Haml, tokens
Ruby que faltavam no tema Monokai). Não há uma task 082 pré-planejada nesse
arco — os documentos de arquitetura que guiaram as tasks 076–081 não
descrevem nada além da compleção inline.

## O que isso significa para a próxima atividade

Diferente das entregas anteriores, não existe um plano detalhado esperando
para ser implementado. A próxima atividade deveria começar por uma auditoria
curta do estado atual do produto e do backlog — no espírito da
`docs/tasks/011-product-audit-and-planning.md` — para decidir com intenção o
que vem a seguir, em vez de inventar uma task nova sem lastro. Candidatos
plausíveis, todos mencionados como "fora de escopo" em tasks recentes e
ainda não comprometidos com um plano:

- **Contexto semântico via embeddings locais e restauração de abas/estado**
  (explicitamente adiados da task 081) — exigiria seu próprio desenho de
  índice, política de exclusão e tela de configurações;
- **Aplicação de edições propostas pela IA** (adiada da task 080) — exige
  um formato de tool-calling estruturado e validado para patches, mapeado
  com segurança para `ProjectWorkspaceEditRequest`;
- **Ferramentas de símbolo para o assistente de IA**
  (`get_symbol_definition`/`get_symbol_references`, adiadas da task 080) —
  exigem uma sessão de LSP iniciada pela própria API, sem depender do
  WebSocket do navegador;
- **Smoke E2E automatizado do assistente de IA em CI**, com um "test double"
  do Ollama (um serviço mínimo expondo `/api/tags`, `/api/show`,
  `/api/chat`, `/api/generate`) — as tasks 080/081 documentaram que o smoke
  E2E não roda contra um Ollama real neste ambiente; um double permitiria
  cobrir o caminho ponta a ponta sem depender de instalação local;
- outras lacunas do produto fora do arco de IA/editor, a serem levantadas
  numa auditoria própria.

Antes de começar a próxima implementação, revisar `docs/tasks/README.md`
(lista completa de entregas) e os documentos em `docs/architecture/` para
confirmar que a escolha não duplica algo já decidido ou já fora de escopo
por um motivo registrado.
