# Task 135 — Smoke E2E do round-trip de tool-calling do assistente de IA

## Contexto

Último candidato registrado em `tasks/PENDENCIAS.md` ("Assistente de IA e
IDE embutida"): `propose_workspace_edit` e as ferramentas de símbolo
(`get_symbol_definition`/`get_symbol_references`) já tinham cobertura de
unidade (`apps/api/test/ai-assistant-service.test.ts`), mas nenhum smoke
E2E exercitava o caminho completo pelo navegador — porque o double do
Ollama usado no smoke (`apps/web/e2e/fixtures/ollama-double.ts`) nunca
emitia `tool_calls`, só respostas de texto simples.

## Mudança

- `ollama-double.ts`: `/api/chat` agora inspeciona a última mensagem do
  usuário e, se ela contiver um dos três gatilhos exportados
  (`OLLAMA_DOUBLE_PROPOSE_EDIT_TRIGGER`,
  `OLLAMA_DOUBLE_SYMBOL_DEFINITION_TRIGGER`,
  `OLLAMA_DOUBLE_SYMBOL_REFERENCES_TRIGGER`), responde com uma
  `tool_calls` no formato de function-calling do Ollama em vez do texto
  fixo de antes — sem mudar o comportamento default (nenhum gatilho
  presente continua respondendo com `OLLAMA_DOUBLE_ASSISTANT_REPLY`, o
  teste original permanece igual). Quando a última mensagem já é
  `role: 'tool'` (segunda rodada da conversa, depois de
  `AiAssistantService` executar a ferramenta e anexar o resultado), o
  double sempre responde com texto simples (`OLLAMA_DOUBLE_FOLLOW_UP_REPLY`),
  encerrando a rodada — não há lógica de modelo real, só o suficiente para
  fechar o loop de `AiAssistantService.streamOneRound`.
- A edição proposta em `propose_workspace_edit` tem alvo real e
  determinístico: a linha 2 de `package.json` no fixture `sample-node-app`
  (`  "name": "sample-node-app",`), trocando o nome do pacote — um arquivo
  e conteúdo que já existem no harness do smoke, sem precisar de fixture
  nova.
- `apps/web/e2e/tests/ai-assistant.spec.ts`: três testes novos.
  `propose_workspace_edit` exercita o fluxo inteiro: mensagem com o
  gatilho → painel de revisão (`ProjectWorkspaceEditReview`) aparece com o
  diff → "Aplicar alterações" → API real aplica a edição em disco →
  confirmação (`"1 arquivo atualizado pelo fluxo seguro."`). Os dois de
  símbolo verificam que o round-trip completo (chamada da ferramenta,
  execução real no servidor — que retorna `available: false` porque não
  há language server rodando no smoke, e essa resposta já é o suficiente
  para validar o transporte —, evento de resultado) chega até a UI:
  `get_symbol_definition: Definição consultada.`/`get_symbol_references: Referências consultadas.`
  no log de atividade do painel.

## Decisão de design

Testar `get_symbol_definition`/`get_symbol_references` **não** exige subir
um language server real (TypeScript/Ruby) no ambiente de smoke — o gap
identificado em `tasks/PENDENCIAS.md` era especificamente a plumbing de
tool-calling (double → execução no servidor → evento SSE → render no
painel), não o comportamento do LSP em si (já coberto por testes de
unidade em `apps/api/test/project-language-server-service.test.ts`). O
caminho "language server indisponível" (`available: false`) já passa pelo
mesmo código de `runTool`/`executeTool` e emite o mesmo evento
`tool-result`, então é suficiente para validar o round-trip sem o custo/
fragilidade de instalar e sincronizar um LSP real no CI.

## Fora de escopo (decisão explícita, herdada do item original)

- Language server real no ambiente de smoke E2E, para exercitar
  `get_symbol_definition`/`get_symbol_references` retornando localizações
  de verdade em vez de `available: false`.
- Qualquer outra ferramenta do catálogo (`read_project_file`,
  `search_project_text`, `list_project_files`, `get_git_diff`) — já
  exercitadas indiretamente pelo teste original (o modelo simulado nunca
  as chama, mas a UI que renderiza `tool-call`/`tool-result` é a mesma).

## Arquivos

- `apps/web/e2e/fixtures/ollama-double.ts`
- `apps/web/e2e/tests/ai-assistant.spec.ts`

## Verificação

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run docs:api:check
npm test
tests/cli/run.sh
```

Todos passando (601 testes na API, 372 no web, 20 no core, 59 no
process-manager, 57 no CLI bash); nenhuma rota HTTP mudou, `docs/architecture/api-reference.md`
continua com 156 rotas. Os 4 testes de `ai-assistant.spec.ts` (1 já
existente + 3 novos) rodados manualmente com sucesso via
`npx playwright test --config=e2e/playwright.config.ts e2e/tests/ai-assistant.spec.ts`
(usando um `executablePath` local só para contornar uma versão de
Chromium desalinhada neste ambiente de execução — não commitado; o
Chromium correto já está disponível em CI).
