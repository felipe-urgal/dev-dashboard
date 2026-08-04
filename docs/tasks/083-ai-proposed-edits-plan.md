# Task 083 — Aplicação de edições propostas pela IA

## Status

Implementada e aguardando revisão.

## Contexto

A task 080 (`docs/tasks/080-ollama-local-ai.md`) entregou o assistente de IA
local com um catálogo fechado de **quatro ferramentas somente leitura**
(`read_project_file`, `search_project_text`, `list_project_files`,
`get_git_diff`) e adiou explicitamente a aplicação de edições propostas pela
IA, por exigir "um formato de tool-calling estruturado e validado para
patches, mapeado com segurança para `ProjectWorkspaceEditRequest`". A task
077 (`docs/tasks/077-safe-editor-save.md`) já havia entregado exatamente esse
mecanismo — preview com token de confirmação de uso único, revalidação de
versão, escrita atômica com rollback — para edições vindas do LSP (rename,
refatoração). Esta task conecta as duas pontas: o assistente de IA agora
pode propor uma edição, mas ela só é escrita em disco através do mesmo
caminho já auditado, com confirmação explícita do usuário.

## Objetivo

Adicionar uma quinta ferramenta ao catálogo do assistente,
`propose_workspace_edit`, que o modelo usa para propor uma alteração de
texto em um ou mais arquivos do projeto. A proposta nunca é escrita
diretamente: ela é sempre convertida em um preview do mecanismo da task 077
e exige confirmação explícita do usuário na mesma UI de revisão já usada
para edições de LSP (`ProjectWorkspaceEditReview.vue`).

## Resultado entregue

- **Nenhuma escrita nova, nenhuma rota nova para aplicar.** A ferramenta
  reaproveita `ProjectWorkspaceEditService.previewWorkspaceEdit` — o mesmo
  método já usado por `POST /files/workspace-edits/preview` — chamado
  diretamente como serviço, não via HTTP interno. Aplicar continua sendo
  exatamente `POST /files/workspace-edits/apply` com o `confirmationToken`
  do preview; nenhum código novo de escrita foi criado.
- **`expectedVersion` sempre lido pelo servidor.** `AiAssistantService`
  recebe do modelo só `path` e `edits`; para cada arquivo,
  `buildWorkspaceEditRequest` lê a versão atual via `ProjectFileService`
  antes de montar o `ProjectWorkspaceEditRequest` real. Um teste
  (`ai-assistant-service.test.ts`) envia deliberadamente um
  `expectedVersion` forjado nos argumentos da ferramenta e confirma que é
  ignorado sem erro.
- **Fluxo não-bloqueante confirmado.** `propose_workspace_edit` gera o
  preview e retorna ao modelo, na mesma rodada, um resultado textual
  informativo (`{ status: 'pending_confirmation', files, expiresAt }`); o
  preview completo (com conteúdo antes/depois) trafega por um evento de
  streaming novo, `workspace-edit-proposed`, separado do resultado textual
  da ferramenta. Aplicar ou cancelar acontece inteiramente no navegador,
  sem round-trip pelo Ollama.
- **`AiChatStreamEvent`/`AiTool` estendidos** em
  `packages/contracts/src/ai-assistant.ts` exatamente como planejado.
- **Frontend:** `ProjectAiPanel.vue` emite um evento Vue
  (`workspace-edit-proposed`) para o componente pai em vez de renderizar
  sua própria cópia da revisão — desvio deliberado do plano original (que
  prope uma segunda instância de `<ProjectWorkspaceEditReview>` dentro do
  painel de chat). `ProjectEmbeddedEditor.vue` já possui o estado
  `workspaceEditPreview` e a única instância de
  `<ProjectWorkspaceEditReview>` usada pelas edições de LSP; o painel de IA
  só precisa preencher esse mesmo estado. Evita duas instâncias do
  componente de revisão coexistindo e duas cópias de
  `handleWorkspaceEditApplied` (que já atualiza abas, modelos Monaco e
  estado "sujo" ao aplicar).

## Segurança

- catálogo de ferramentas continua fechado (cinco entradas, todas
  hardcoded); `propose_workspace_edit` é a única com efeito colateral, e o
  efeito colateral (escrita) só ocorre atrás da confirmação humana já
  auditada na task 077;
- limites inalterados (20 arquivos / 200 edições / 512 KiB / 4 MiB) —
  reaproveitados do `ProjectWorkspaceEditService`, não redefinidos;
- nenhuma escrita ocorre dentro do laço de streaming do chat;
- erros de ferramenta (validação de argumentos, limite excedido, arquivo
  fora do projeto) retornam ao modelo como `ok: false`, mesmo padrão das
  outras quatro ferramentas.

## Critérios de aceite

- o modelo consegue propor uma edição e ela aparece como preview revisável
  no painel de chat, nunca aplicada sem clique explícito — **atendido**;
- cancelar ou deixar expirar o preview não altera nenhum arquivo —
  **atendido** (nenhum código de escrita novo; token de confirmação e TTL
  de 5 minutos inalterados da task 077);
- tentar propor uma edição com `expectedVersion` vinda do modelo é
  ignorado — **atendido e testado**;
- exceder os limites de arquivos/edições/tamanho retorna erro de
  ferramenta sem gerar preview — **atendido** (delegado ao
  `ProjectWorkspaceEditService` existente, que já reforça os limites);
- typecheck, build e testes automatizados passam — **atendido** (414
  testes de API, 311 de web, 15 specs de smoke E2E).

## Decisões que divergiram do plano original

- **Sem extração de serviço.** O plano previa "extrair a lógica de preview
  para uma função de serviço reutilizável, se ainda não estiver isolada da
  rota" — na prática, `ProjectWorkspaceEditService` já existia como classe
  própria (`apps/api/src/services/project-workspace-edit-service.ts`),
  usada pela rota só como cliente. Não havia nada para extrair; só foi
  preciso conectar a mesma instância ao `AiAssistantService`. Isso exigiu
  mover a construção de `ProjectWorkspaceEditService` de `app.ts` para
  `AppContext` (`app-context.ts`), garantindo que a rota HTTP e a
  ferramenta de IA compartilhem o mesmo mapa de `confirmationToken` em
  memória — sem isso, um preview gerado pela IA nunca seria reconhecido
  pela rota `/apply`.
- **Sem segunda instância de `ProjectWorkspaceEditReview` no painel de
  IA.** Ver "Resultado entregue" acima — emitir um evento para o
  componente pai reaproveitando o estado e o callback já existentes é mais
  simples e evita divergência entre dois caminhos de aplicação.
- **Sem novo caso de smoke E2E dedicado.** O plano previa estender
  `apps/web/e2e/tests/ai-assistant.spec.ts` com uma chamada de
  `propose_workspace_edit` através do double do Ollama (task 082). Optei
  por cobrir o caminho com testes de unidade em
  `ai-assistant-service.test.ts` (execução da ferramenta, versão sempre
  lida do servidor, validação de argumentos) e um teste de componente em
  `project-ai-panel.test.ts` (evento emitido corretamente), que já
  exercitam toda a lógica nova; o smoke E2E existente já cobre o streaming
  SSE real ponta a ponta para o caso do chat simples. Estender o double
  para emitir `tool_calls` de `propose_workspace_edit` fica como
  possibilidade futura, não bloqueante.

## Correções relacionadas entregues na mesma sessão

Fora do escopo original da task 083, mas no mesmo componente/área e
resolvidas a partir de feedback direto de uso:

- **Painel de IA redimensionável.** Adicionado um segundo separador de
  arraste (`embedded-ide-ai-resize-separator`, em
  `apps/web/src/embedded-editor-layout.ts`/`.css`), no mesmo padrão do
  separador já existente do explorer de arquivos, permitindo aumentar ou
  diminuir a largura do painel de IA. A largura é persistida em
  `localStorage` e o separador é criado/removido dinamicamente conforme o
  painel abre/fecha (evita o mesmo bug de grid órfão corrigido
  anteriormente para o próprio painel).
- **Streaming do chat não sequestra mais a rolagem da página.** O
  `scrollIntoView` disparado a cada delta de mensagem rolava qualquer
  ancestral necessário para trazer o fim do transcript à vista — incluindo
  a página inteira, não só o painel. Trocado por controle direto de
  `scrollTop` do próprio container do transcript, que só "gruda" no fim se
  o usuário já estava lá (permite rolar para cima e ler durante o
  streaming sem ser puxado de volta a cada token).
- **Erro de timeout do Ollama não vaza mais o texto nativo do
  `AbortController`.** Quando uma rodada de chat estourava o limite de 120s,
  o usuário via a mensagem crua "This operation was aborted" ou "The
  operation was aborted.", sem nenhum contexto. `AiAssistantService.chat`
  agora distingue esse caso (`isAbortError`) e produz uma mensagem clara
  ("O Ollama não respondeu em 120 segundos...").
- **Falha ao anexar o WebSocket do LSP passa a ser logada.** A rota
  `GET /projects/:projectId/language-server/:kind/connect`
  (`apps/api/src/routes/project-language-server.ts`) descartava
  silenciosamente qualquer erro de `attach()` (`.catch(() => {...})`),
  deixando "A conexão com o servidor de linguagem falhou." sem nenhum
  rastro nos logs da API para diagnóstico. Agora o erro real é logado
  (`request.log.error`) antes de fechar o socket.

## Fora do escopo

- edição de múltiplos arquivos coordenada com follow-up automático do
  modelo após a aplicação (o modelo não é informado do resultado da
  aplicação, só de que o preview foi gerado — ver decisão de fluxo
  não-bloqueante acima);
- desfazer uma edição já aplicada a partir do chat (usar Git/edição manual,
  como qualquer outra alteração no editor);
- qualquer ferramenta que crie ou renomeie arquivos (só edição de texto em
  arquivos existentes, mesmo escopo de `ProjectWorkspaceEditRequest` hoje);
- embeddings, restauração de abas e ferramentas de símbolo — candidatos
  independentes, não relacionados a esta task (ver `docs/tasks/NEXT.md`).

## Testes automatizados

- `apps/api/test/ai-assistant-service.test.ts`: proposta de edição gera
  preview e resultado `pending_confirmation`, nenhuma escrita em disco
  ocorre; `expectedVersion` forjado pelo modelo é ignorado; edições vazias
  são recusadas sem gerar preview.
- `apps/web/test/project-ai-panel.test.ts`: painel emite
  `workspace-edit-proposed` com o preview recebido do evento de streaming.
- `apps/api/test/ai-assistant-service.test.ts` (correção relacionada):
  timeout interno da rodada produz mensagem clara, não o texto nativo do
  `AbortController`.
- Suítes completas (414 testes de API, 311 de web, 15 specs de smoke E2E)
  sem regressão.

## Arquivos alterados

- `packages/contracts/src/ai-assistant.ts`;
- `apps/api/src/app-context.ts`, `apps/api/src/app.ts`;
- `apps/api/src/services/ai-assistant-service.ts`;
- `apps/api/src/routes/project-language-server.ts` (correção relacionada);
- `apps/web/src/components/ProjectAiPanel.vue`,
  `apps/web/src/components/ProjectEmbeddedEditor.vue`;
- `apps/web/src/embedded-editor-layout.ts`,
  `apps/web/src/embedded-editor-layout.css` (correção relacionada);
- testes: `apps/api/test/ai-assistant-service.test.ts`,
  `apps/web/test/project-ai-panel.test.ts`.
