# Task 080 — IA local com Ollama

## Status

Planejada. Começa após a revisão e o merge da task 079.

## Objetivo

Adicionar um painel de assistência de IA ao editor embutido usando **Ollama
local** como provedor padrão — sem chave de API, sem cobrança por token e sem
enviar código do usuário para um serviço remoto — conforme
`docs/architecture/embedded-ide-ai-design.md`.

## Resultado esperado

- painel lateral **IA** no editor, com chat sobre o arquivo atual ou seleção;
- ações rápidas: explicar seleção, corrigir problema, gerar testes, refatorar,
  perguntar sobre um símbolo;
- detecção do Ollama local (`GET /api/tags`) e listagem dos modelos já
  instalados, sem baixar nenhum automaticamente;
- streaming cancelável das respostas, convertido do NDJSON do Ollama para um
  contrato próprio autenticado;
- qualquer alteração proposta pela IA passa pelo mesmo preview/confirmação de
  `WorkspaceEdit` já usado pelos LSPs (tasks 077–079) — nunca aplicação direta;
- nenhuma persistência de conversa por padrão.

## Decisão de segurança principal

O navegador nunca fala diretamente com o Ollama. Um novo `AiAssistantService`
na API intermedeia toda chamada:

- destino fixo em loopback (`DEV_DASHBOARD_OLLAMA_URL`, só aceita HTTP em
  endereço de loopback — nunca uma URL remota) para impedir SSRF;
- catálogo fechado de ferramentas que o modelo pode invocar (`AiTool`):
  `read_project_file`, `search_project_text`, `list_project_files`,
  `get_symbol_definition`, `get_symbol_references`, `get_git_diff` — todas
  validadas e limitadas ao projeto atual, nunca um caminho absoluto e nunca
  shell;
- limites de bytes, arquivos e mensagens por requisição;
- nenhum download ou instalação de modelo iniciado pelo dashboard;
- resposta de raciocínio interno do modelo (quando exposta pelo provedor) não
  é armazenada nem exibida — só a resposta final, chamadas de ferramenta
  validadas e métricas operacionais seguras;
- cancelamento do request ao trocar de projeto, fechar o painel ou iniciar
  outra solicitação incompatível.

## Arquitetura proposta

### API e transporte

- `AiAssistantService` novo, seguindo o mesmo padrão de serviço local
  privilegiado das tasks 076–079 (ver `docs/architecture/security.md`);
- endpoints REST/streaming autenticados por token local, prefixados em
  `/api/projects/:projectId/ai/...`;
- conversão do NDJSON do Ollama (`/api/chat`, `/api/generate`) para um
  contrato de streaming próprio, com heartbeat e timeout;
- `GET /api/tags` e `POST /api/show` para listar modelos instalados e suas
  capacidades (`AiCapability`: `chat`, `edit`, `inline-completion`,
  `fill-in-the-middle`, `embeddings`, `tools`) sem assumir um modelo fixo.

### Contexto enviado ao modelo

Contexto padrão, pequeno e explícito (nunca o projeto inteiro):

1. instrução do usuário;
2. seleção atual ou trecho próximo ao cursor;
3. linguagem e caminho relativo do arquivo;
4. diagnósticos LSP associados (reaproveita tasks 078/079);
5. assinatura/símbolos relevantes;
6. diff Git do arquivo quando útil (reaproveita a task de diff Git existente).

Arquivos adicionais só entram via as ferramentas fechadas listadas acima,
nunca por escolha livre de caminho pelo modelo.

### Painel e ações no editor

- painel lateral **IA** no `ProjectEmbeddedEditor.vue`, seguindo o padrão
  visual das demais abas;
- ações rápidas por seleção/símbolo: Explicar, Corrigir, Gerar testes,
  Refatorar, Perguntar;
- qualquer edição proposta é convertida para o mesmo `ProjectWorkspaceEditRequest`
  da task 077 e passa pelo preview/confirmação existente antes de tocar disco.

## Critérios de aceite

- painel de IA funciona apenas com Ollama local detectado; ausência produz
  orientação clara, sem instalar nada;
- nenhuma chamada do navegador atinge o Ollama diretamente;
- ferramentas do modelo são limitadas ao catálogo fechado e à raiz do projeto;
- streaming é cancelável e não deixa requisições penduradas ao trocar de
  projeto ou fechar o painel;
- qualquer edição proposta exige preview e confirmação explícita;
- nenhuma conversa é persistida por padrão;
- typecheck, build, testes automatizados e smoke E2E passam.

## Testes previstos

- detecção de Ollama ausente sem tentativa de instalação;
- listagem de modelos e capacidades via `/api/tags` e `/api/show`;
- limite de bytes/arquivos/mensagens por requisição;
- catálogo fechado de ferramentas, com recusa de caminho fora do projeto;
- streaming convertido corretamente do NDJSON e cancelável;
- edição proposta pela IA segue o fluxo de preview/confirmação, nunca aplica
  diretamente;
- ausência de persistência de conversa entre sessões.

## Fora do escopo

- download ou gerenciamento de modelos Ollama pelo dashboard;
- provedores de IA remotos/pagos;
- busca semântica com embeddings (`/api/embed`) — avaliada apenas como fase
  posterior opt-in;
- completion inline/FIM no editor, planejada para a task 081;
- persistência de histórico de conversa.

## Próxima atividade

Task 081 — Compleção inline (ghost text/FIM) e contexto semântico ampliado,
conforme `docs/architecture/embedded-ide-ai-design.md`.
