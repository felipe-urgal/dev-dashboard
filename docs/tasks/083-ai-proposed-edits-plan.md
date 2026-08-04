# Task 083 — Aplicação de edições propostas pela IA (plano)

## Status

Planejada. Este documento é o plano detalhado a implementar na próxima
sessão de trabalho nesta parte do repositório — nenhum código foi escrito
ainda.

## Contexto

A task 080 (`docs/tasks/080-ollama-local-ai.md`) entregou o assistente de IA
local com um catálogo fechado de **quatro ferramentas somente leitura**
(`read_project_file`, `search_project_text`, `list_project_files`,
`get_git_diff`) e adiou explicitamente a aplicação de edições propostas pela
IA, por exigir "um formato de tool-calling estruturado e validado para
patches, mapeado com segurança para `ProjectWorkspaceEditRequest`". A task
077 (`docs/tasks/077-safe-editor-save.md`) já entregou exatamente esse
mecanismo — preview com token de confirmação de uso único, revalidação de
versão, escrita atômica com rollback — para edições vindas do LSP (rename,
refatoração). Esta task conecta as duas pontas: o assistente de IA passa a
poder propor uma edição, mas ela só é escrita em disco através do mesmo
caminho já auditado, com confirmação explícita do usuário.

## Objetivo

Adicionar uma quinta ferramenta ao catálogo do assistente,
`propose_workspace_edit`, que o modelo usa para propor uma alteração de
texto em um ou mais arquivos do projeto. A proposta nunca é escrita
diretamente: ela é sempre convertida em um preview do mecanismo da task 077
e exige confirmação explícita do usuário na mesma UI de revisão já usada
para edições de LSP (`ProjectWorkspaceEditReview.vue`).

## Decisão de arquitetura: nenhuma escrita nova, nenhuma rota nova para aplicar

O maior risco desta task é criar um segundo caminho de escrita paralelo ao
da task 077. Para evitar isso:

- `propose_workspace_edit` **não escreve nada**. Sua execução dentro de
  `AiAssistantService.executeTool` chama a mesma função de preview já usada
  por `POST /files/workspace-edits/preview`
  (`apps/api/src/routes/project-workspace-edits.ts`), reaproveitada como
  função de serviço (extrair, se necessário, a lógica de
  `WorkspaceEditService`/equivalente para ser chamável tanto pela rota REST
  quanto pelo assistente, em vez de duplicá-la).
- A ferramenta recebe do modelo **apenas** `path` e `edits` (mesmo formato
  de `ProjectWorkspaceTextEdit[]`: `range` + `newText`) — **nunca**
  `expectedVersion`. O `expectedVersion` de cada arquivo é lido pelo próprio
  servidor no momento da execução da ferramenta (mesma leitura que
  `ProjectFileService` já faz), porque o modelo não tem acesso a esse hash e
  não pode ser a fonte de verdade sobre qual versão do arquivo está
  editando — isso também elimina uma classe inteira de erro onde o modelo
  "inventa" uma versão desatualizada.
- Aplicar a edição continua sendo **exatamente** `POST
  /files/workspace-edits/apply` com o `confirmationToken` do preview —
  **nenhuma rota nova é criada para aplicar**. O painel de chat só precisa
  saber renderizar o preview e chamar a função de API que já existe
  (`applyProjectWorkspaceEdit`, já usada por `ProjectWorkspaceEditReview.vue`).

## Fluxo não-bloqueante (decisão explícita)

A ferramenta roda dentro do laço de tool-calling de `AiAssistantService.chat`
(`MAX_TOOL_ROUNDS = 4` rodadas). Uma alternativa seria bloquear essa rodada
até o usuário confirmar ou cancelar o preview na UI — rejeitada porque
prenderia a conexão SSE e o modelo por um tempo arbitrário (o usuário pode
levar minutos, ou nunca decidir). A decisão adotada:

1. `propose_workspace_edit` gera o preview (mesmos limites da task 077: até
   20 arquivos, até 200 edições por arquivo, 512 KiB por arquivo, 4 MiB de
   preview total) e retorna ao modelo, **na mesma rodada**, um resultado de
   ferramenta somente informativo: `{ status: 'pending_confirmation',
   files: [...caminhos], expiresAt }` — o modelo recebe confirmação de que
   a proposta foi registrada, não que foi aplicada, e normalmente encerra o
   turno explicando ao usuário o que propôs.
2. O preview completo (`ProjectWorkspaceEditPreview`, com conteúdo
   antes/depois) é enviado ao navegador por um novo evento de streaming,
   **não** pelo conteúdo textual da ferramenta (que fica truncado e é
   pensado para o modelo, não para renderizar diffs).
3. Aplicar ou cancelar acontece inteiramente no navegador, fora do ciclo do
   modelo: o usuário revisa e confirma na mesma `ProjectWorkspaceEditReview`
   já existente, que chama `POST /files/workspace-edits/apply` diretamente
   — sem round-trip pelo Ollama.
4. Se o usuário cancelar ou deixar o token expirar (5 minutos, já garantido
   pela task 077), nada acontece; não há necessidade de "avisar" o modelo,
   já que a conversa pode ter avançado para outros assuntos.

## Contratos a adicionar (`packages/contracts/src/ai-assistant.ts`)

```ts
export type AiTool =
  | 'read_project_file'
  | 'search_project_text'
  | 'list_project_files'
  | 'get_git_diff'
  | 'propose_workspace_edit'; // novo

export type AiChatStreamEvent =
  | { type: 'message-delta'; content: string }
  | { type: 'tool-call'; tool: AiTool; arguments: Record<string, unknown> }
  | { type: 'tool-result'; tool: AiTool; ok: boolean; summary: string }
  | { type: 'workspace-edit-proposed'; preview: ProjectWorkspaceEditPreview } // novo
  | { type: 'done' }
  | { type: 'error'; message: string };
```

`ProjectWorkspaceEditPreview` já existe em `packages/contracts/src/project-files.ts`
— reaproveitado sem alteração.

## Definição da ferramenta (Ollama function-calling)

Adicionada a `TOOL_DEFINITIONS` em `ai-assistant-service.ts`, no mesmo
formato das quatro existentes:

```ts
{
  type: 'function',
  function: {
    name: 'propose_workspace_edit',
    description:
      'Propõe uma edição de texto em um ou mais arquivos do projeto atual. '
      + 'A edição não é aplicada automaticamente: o usuário revisa e confirma '
      + 'antes de qualquer escrita em disco.',
    parameters: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            required: ['path', 'edits'],
            properties: {
              path: { type: 'string', description: 'Caminho relativo do arquivo.' },
              edits: {
                type: 'array',
                maxItems: 200,
                items: {
                  type: 'object',
                  required: ['range', 'newText'],
                  properties: {
                    range: {
                      type: 'object',
                      required: ['start', 'end'],
                      properties: {
                        start: { type: 'object', required: ['line', 'column'], properties: { line: { type: 'number' }, column: { type: 'number' } } },
                        end: { type: 'object', required: ['line', 'column'], properties: { line: { type: 'number' }, column: { type: 'number' } } },
                      },
                    },
                    newText: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}
```

## Execução no servidor (`executeTool`)

Novo `case 'propose_workspace_edit'` em `AiAssistantService.executeTool`:

1. valida a forma bruta dos argumentos (reaproveitar o schema de validação
   já usado pela rota `/workspace-edits/preview`, não reimplementar);
2. para cada `path` recebido, lê a versão atual via `ProjectFileService`
   (mesma função que a rota usa) e monta o `ProjectWorkspaceFileEdit` real
   com `expectedVersion` correto — **ignora** qualquer versão vinda do
   modelo, se ele tentar enviar uma;
3. chama a função de preview compartilhada (extraída de
   `project-workspace-edits.ts` para um serviço reutilizável, ex.
   `WorkspaceEditService.preview(...)`) com os mesmos limites e mesma
   geração de `confirmationToken`;
4. em caso de sucesso: emite `{ type: 'workspace-edit-proposed', preview }`
   via `handlers.send`, e retorna ao modelo (como resultado textual da
   ferramenta, para a conversa) um resumo curto — não o diff completo —
   ex. `{ status: 'pending_confirmation', files: ['a/b.rb'], expiresAt }`;
5. em caso de erro de validação/limite: retorna erro de ferramenta normal
   (`ok: false`, mesmo padrão das outras quatro), sem gerar preview.

## Frontend (`ProjectAiPanel.vue`)

- novo estado local `pendingEditPreview: ProjectWorkspaceEditPreview | null`,
  setado pelo handler de `workspace-edit-proposed` no callback de streaming
  (mesmo padrão de `activityLog`/`errorMessage` já existentes);
- renderiza `<ProjectWorkspaceEditReview>` (já existe, usado por
  `ProjectEmbeddedEditor.vue`) dentro do painel de chat quando
  `pendingEditPreview` não é nulo, com os mesmos eventos `@applied`/`@cancel`;
- ao aplicar com sucesso, o painel de arquivos precisa saber que o(s)
  arquivo(s) editado(s) mudaram no disco — reaproveitar o mesmo evento que
  `handleWorkspaceEditApplied` já dispara em `ProjectEmbeddedEditor.vue` (a
  ferramenta roda no contexto do mesmo componente pai, então o callback
  pode ser o mesmo, passado como prop para `ProjectAiPanel`);
- **catálogo de ações rápidas não muda** — o botão "Corrigir" já existente
  continua só descrevendo a instrução em texto; é o modelo que decide, na
  resposta, se vale propor uma edição via ferramenta.

## Segurança

Reaplica o checklist de `docs/architecture/security.md` sem introduzir
superfície nova:

- nenhuma rota nova é criada — reaproveita `POST
  /files/workspace-edits/preview` (via chamada de serviço interna, não
  HTTP) e `POST /files/workspace-edits/apply` (inalterado);
- catálogo de ferramentas continua fechado (cinco entradas, todas
  hardcoded); `propose_workspace_edit` é a única com efeito colateral, e o
  efeito colateral (escrita) só ocorre atrás da confirmação humana já
  auditada na task 077;
- `expectedVersion` sempre lido pelo servidor, nunca aceito do modelo —
  elimina a possibilidade de o modelo forçar uma escrita "por cima" de uma
  versão que ele não viu de fato;
- limites inalterados (20 arquivos / 200 edições / 512 KiB / 4 MiB) —
  reaproveitados, não redefinidos;
- nenhuma escrita ocorre dentro do laço de streaming do chat — a escrita é
  sempre uma ação HTTP síncrona e independente, disparada por um clique
  explícito do usuário;
- erros de ferramenta (limite excedido, arquivo fora do projeto, etc.)
  retornam ao modelo como `ok: false` com a mesma mensagem que a rota REST
  já produz — nenhuma informação nova exposta.

## Critérios de aceite

- o modelo consegue propor uma edição e ela aparece como preview revisável
  no painel de chat, nunca aplicada sem clique explícito;
- cancelar ou deixar expirar o preview não altera nenhum arquivo;
- tentar propor uma edição com `expectedVersion` vinda do modelo é
  ignorado (o servidor sempre relê a versão atual);
- exceder os limites de arquivos/edições/tamanho retorna erro de ferramenta
  sem gerar preview;
- aplicar o preview usa exatamente a mesma rota e mesmo comportamento de
  rollback já testado na task 077 — nenhum teste de rollback precisa ser
  duplicado, só a nova cobertura de como o preview chega até lá a partir do
  assistente;
- typecheck, build e testes automatizados (unidade + smoke E2E, reaproveitando
  o double do Ollama da task 082) passam em CI.

## Fora do escopo

- edição de múltiplos arquivos coordenada com follow-up automático do
  modelo após a aplicação (o modelo não é informado do resultado da
  aplicação, só de que o preview foi gerado — ver decisão de fluxo
  não-bloqueante acima);
- desfazer uma edição já aplicada a partir do chat (usar Git/edição manual,
  como qualquer outra alteração no editor);
- qualquer ferramenta que crie ou renomeie arquivos (só edição de texto em
  arquivos existentes, mesmo escopo de `ProjectWorkspaceEditRequest` hoje);
- embeddings e restauração de abas — candidatos independentes, não
  relacionados a esta task (ver `docs/tasks/README.md`/histórico de
  `NEXT.md`).

## Arquivos a alterar (estimativa)

- `packages/contracts/src/ai-assistant.ts` — novo `AiTool` e evento de
  stream;
- `apps/api/src/services/ai-assistant-service.ts` — nova entrada em
  `TOOL_DEFINITIONS`, novo `case` em `executeTool`, novo evento emitido em
  `runTool`;
- `apps/api/src/routes/project-workspace-edits.ts` — extrair a lógica de
  preview para uma função de serviço reutilizável (se ainda não estiver
  isolada da rota), sem mudar o contrato HTTP existente;
- `apps/api/src/routes/ai-assistant.ts` — nenhuma mudança de schema
  esperada (o evento novo trafega pelo mesmo SSE já existente);
- `apps/web/src/components/ProjectAiPanel.vue` — novo estado e render do
  preview;
- `apps/web/src/components/ProjectEmbeddedEditor.vue` — repassar o callback
  de arquivo alterado para `ProjectAiPanel` (provavelmente já como prop,
  verificar durante a implementação);
- testes novos em `apps/api/test/ai-assistant-service.test.ts` (execução da
  ferramenta, versão sempre lida do servidor, limites) e um caso no smoke
  E2E (`apps/web/e2e/tests/ai-assistant.spec.ts`, estendendo o double do
  Ollama da task 082 para emitir uma chamada de `propose_workspace_edit` e
  verificar que o preview aparece e a aplicação funciona).
