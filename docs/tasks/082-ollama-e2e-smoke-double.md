# Task 082 — Smoke E2E do assistente de IA com um double do Ollama

## Status

Implementada e aguardando revisão.

## Contexto

As tasks 076–081 encerraram o arco de planejamento documental da IDE
embutida (`docs/architecture/embedded-ide-ai-design.md`), terminando com o
assistente de IA local via Ollama (chat com catálogo fechado de ferramentas
na task 080, compleção inline na task 081). Nenhuma das duas conseguiu
exercitar o caminho ponta a ponta no smoke E2E: `docs/tasks/080-ollama-local-ai.md`
e `docs/tasks/081-inline-completion.md` registram explicitamente que o
Ollama real não está instalado neste ambiente, então o smoke E2E (Playwright)
nunca cobriu o painel de chat nem a compleção inline.

`docs/tasks/NEXT.md` (auditoria de produto para decidir a atividade seguinte,
já que não havia uma task 082 pré-planejada) listou um "test double" do
Ollama — um serviço HTTP mínimo expondo `/api/tags`, `/api/show`, `/api/chat`
e `/api/generate` — como o candidato mais autocontido entre as lacunas
levantadas, por não exigir nenhuma decisão de arquitetura nova (ao contrário
de embeddings locais, aplicação de edições propostas pela IA ou ferramentas
de símbolo, todos adiados por exigirem desenho próprio).

## Objetivo

Cobrir o assistente de IA no smoke E2E existente (`apps/web/e2e`) sem
depender de uma instalação real do Ollama, usando um double HTTP que imita
só os quatro endpoints que `AiAssistantService` de fato chama.

## Resultado entregue

- `apps/web/e2e/fixtures/ollama-double.ts`: servidor HTTP standalone
  (`node:http`, sem dependências novas) escutando em `127.0.0.1` numa porta
  efêmera, com handlers determinísticos para os quatro endpoints:
  - `GET /api/tags` → um modelo instalado (`e2e-mock-model`);
  - `POST /api/show` → capacidades `completion`, `tools` e `insert` (para o
    modelo ser elegível tanto ao chat quanto à compleção inline, sem exercitar
    tool-calling);
  - `POST /api/chat` → resposta NDJSON com um `message.content` fixo seguido
    de `done: true`, no mesmo formato que `AiAssistantService.streamOneRound`
    já espera (confirmado contra `apps/api/test/ai-assistant-service.test.ts`,
    que já fakeava esse formato em memória, mas nunca via um servidor HTTP
    real);
  - `POST /api/generate` → `{ response: "texto sugerido" }` para a compleção.
- `apps/web/e2e/fixtures/server-harness.ts`: `startFixtureServer` agora sobe
  o double antes do processo da API e passa sua URL via
  `DEV_DASHBOARD_OLLAMA_URL` no ambiente do processo filho;
  `stopFixtureServer` derruba o double simetricamente. Nenhum outro teste
  precisou mudar — o double só passa a existir no ambiente, não força nenhum
  teste a interagir com IA.
- `apps/web/e2e/tests/ai-assistant.spec.ts`: abre o editor embutido, abre o
  painel "IA", confirma que o modelo do double aparece selecionado, envia uma
  mensagem e confirma que a resposta do double chega ao transcript e que a
  conversa conclui (botão "Enviar" volta a aparecer).

## Decisões

- **Sem tool-calling no double.** O catálogo de ferramentas
  (`read_project_file`, `search_project_text`, `list_project_files`,
  `get_git_diff`) já tem cobertura de unidade em
  `apps/api/test/ai-assistant-service.test.ts` com um fake em memória: refazer
  esse caminho como smoke E2E exigiria o double decidir dinamicamente quando
  emitir `tool_calls`, o que testaria o double, não o produto. O smoke cobre
  o que só um teste ponta a ponta real cobre: o painel de chat detecta o
  Ollama (rota `/ai/status`), envia a conversa pela rota SSE real
  (`/ai/chat`) e renderiza a resposta.
- **Double vive em `apps/web/e2e/fixtures`, não em `apps/api`.** Só o
  ambiente de E2E do frontend precisa de uma instância HTTP real do Ollama;
  os testes de unidade da API já fakeiam `fetch` diretamente (mais rápido,
  sem porta de rede). Duplicar o double lá dentro misturaria dois padrões de
  teste para o mesmo problema.
- **Compleção inline (ghost text) não ganhou um teste E2E dedicado.**
  Simular a interação do Monaco com o widget de ghost text via Playwright
  (digitar, aguardar o debounce de 400ms, inspecionar a decoração inline) é
  frágil e testaria comportamento do Monaco, não do double; o double já
  expõe `/api/generate` e fica disponível para uma cobertura futura caso o
  produto precise. O chat cobre o caminho mais importante e mais arriscado
  (streaming SSE, catálogo de ferramentas, ciclo de vida da conversa).

## Critérios de aceite

- smoke E2E do assistente de IA roda em CI sem depender de instalação local
  do Ollama — **atendido**;
- nenhum teste existente do smoke E2E muda de comportamento — **atendido**
  (15/15 specs existentes continuam passando);
- typecheck, build e testes automatizados (API + E2E) passam —
  **atendido**.

## Testes automatizados

- `apps/web/e2e/tests/ai-assistant.spec.ts` (novo): painel de chat detecta o
  modelo do double e conclui uma conversa.
- Suíte completa de smoke E2E (`npm run test:e2e`): 15 specs, incluindo o
  novo, passam.
- `apps/api/test/*` (410 testes): nenhuma regressão.

## Fora do escopo

- teste E2E dedicado para compleção inline (ghost text) — ver decisões acima;
- exercitar o catálogo de ferramentas (`tool_calls`) no smoke E2E — coberto
  por unidade, não por E2E;
- qualquer um dos outros candidatos listados em `docs/tasks/NEXT.md`
  (embeddings locais, aplicação de edições propostas pela IA, ferramentas de
  símbolo) — permanecem como candidatos futuros, sem plano detalhado.
