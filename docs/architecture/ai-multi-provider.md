# IA no Dev Dashboard: Code review com Ollama fixo

> **Histórico.** Este documento já descreveu uma arquitetura multi-provider
> (Ollama local + OpenAI cloud) com seleção por projeto, consentimento cloud e
> um Assistente IA completo (chat, compleção inline, catálogo de ferramentas,
> edição de workspace). Toda essa camada — Assistente IA, `AiProviderResolver`,
> `OpenAiProvider`, seleção de provider/modo por projeto e consentimento cloud
> — foi removida (ver `tasks/236-remover-assistente-ia.md`). O que resta é
> descrito abaixo.

## Estado atual

A única capacidade de IA que resta no dashboard web é a **Code review**,
dentro da aba **Git**. Ela roda inteiramente sobre o Ollama local, sem
seleção de provider, sem modo `fast`/`complete` configurável pelo usuário e
sem consentimento cloud — não existe mais provider cloud no produto.

- `AiAssistantService` (`apps/api/src/services/ai-assistant-service.ts`) é
  construído uma única vez em `app-context.ts` com `new OllamaProvider()` e
  expõe só `status()` (disponibilidade + modelos instalados) e `review()`
  (resposta única, sem ferramentas, usada pela Code review).
- `GitAiCodeReviewService` sempre usa essa mesma instância e o provider fixo
  `'ollama'` — não há mais parâmetro de resolver de provider no construtor.
- `GET /projects/:projectId/git/pull-request/ai-status` devolve
  disponibilidade e modelos instalados do Ollama local; é o único status de
  IA que a UI consulta, e alimenta o seletor de modelo da Code review.
- `DEV_DASHBOARD_OLLAMA_URL` continua aceitando somente HTTP em loopback.
- O catálogo de ferramentas do antigo Assistente IA (`read_project_file`,
  `search_project_text`, `list_project_files`, `get_git_diff`,
  `propose_workspace_edit`, `get_symbol_definition`,
  `get_symbol_references`) e o `AiOrchestrator` que o executava foram
  removidos — a Code review nunca usou ferramentas, só uma chamada fechada
  de revisão por arquivo mais uma síntese global opcional.
- Masking de conteúdo sensível (`maskSensitiveLogContent`) continua aplicado
  ao diff antes de qualquer chamada ao modelo.
- `AiExecutionMode` (`fast`/`complete`) continua existindo só para calibrar o
  budget da Code review (`ai-execution-policy.ts`: tamanho de diff, rounds,
  síntese global); não há mais seleção desse modo pelo usuário — a rota
  sempre usa o modo padrão.

## Arquitetura

```text
ProjectGitCodeReviewPage.vue
        │ GET  .../ai-status         (status do Ollama local)
        │ POST .../ai-review-executions
        ▼
GitAiCodeReviewService ──────────► AiAssistantService ──────────► OllamaProvider
  (execução em memória,               (status/review)                (HTTP local,
   arquivo por arquivo +                                               NDJSON,
   síntese global opcional)                                            masking)
```

## Segurança

Sem seleção de provider e sem consentimento cloud, a superfície de risco
específica de IA se reduz a: (1) o Ollama local só é alcançado via loopback
HTTP (`resolveOllamaBaseUrl`), (2) o diff enviado ao modelo passa pela mesma
barreira de masking usada no resto do dashboard, e (3) a taxonomia de erros
de IA (`AiErrorCode`) permanece estável para a Code review traduzir falhas do
Ollama em mensagens claras. Ver `docs/architecture/security.md` para o
modelo de ameaça geral da API.
