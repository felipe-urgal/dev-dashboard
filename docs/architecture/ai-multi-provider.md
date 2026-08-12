# IA no Dev Dashboard: Code review com Ollama fixo

> **HistÃ³rico.** Este documento jÃ¡ descreveu uma arquitetura multi-provider
> (Ollama local + OpenAI cloud) com seleÃ§Ã£o por projeto, consentimento cloud e
> um Assistente IA completo (chat, compleÃ§Ã£o inline, catÃ¡logo de ferramentas,
> ediÃ§Ã£o de workspace). Toda essa camada â Assistente IA, `AiProviderResolver`,
> `OpenAiProvider`, seleÃ§Ã£o de provider/modo por projeto e consentimento cloud
> â foi removida (ver `tasks/238-remover-assistente-ia.md`). O que resta Ã©
> descrito abaixo.

## Estado atual

A Ãºnica capacidade de IA que resta no dashboard web Ã© a **Code review**,
dentro da aba **Git**. Ela roda inteiramente sobre o Ollama local, sem
seleÃ§Ã£o de provider, sem modo `fast`/`complete` configurÃ¡vel pelo usuÃ¡rio e
sem consentimento cloud â nÃ£o existe mais provider cloud no produto.

- `AiAssistantService` (`apps/api/src/services/ai-assistant-service.ts`) Ã©
  construÃ­do uma Ãºnica vez em `app-context.ts` com `new OllamaProvider()` e
  expÃµe sÃ³ `status()` (disponibilidade + modelos instalados) e `review()`
  (resposta Ãºnica, sem ferramentas, usada pela Code review).
- `GitAiCodeReviewService` sempre usa essa mesma instÃ¢ncia e o provider fixo
  `'ollama'` â nÃ£o hÃ¡ mais parÃ¢metro de resolver de provider no construtor.
- `GET /projects/:projectId/git/pull-request/ai-status` devolve
  disponibilidade e modelos instalados do Ollama local; Ã© o Ãºnico status de
  IA que a UI consulta, e alimenta o seletor de modelo da Code review.
- `DEV_DASHBOARD_OLLAMA_URL` continua aceitando somente HTTP em loopback.
- O catÃ¡logo de ferramentas do antigo Assistente IA (`read_project_file`,
  `search_project_text`, `list_project_files`, `get_git_diff`,
  `propose_workspace_edit`, `get_symbol_definition`,
  `get_symbol_references`) e o `AiOrchestrator` que o executava foram
  removidos â a Code review nunca usou ferramentas, sÃ³ uma chamada fechada
  de revisÃ£o por arquivo mais uma sÃ­ntese global opcional.
- Masking de conteÃºdo sensÃ­vel (`maskSensitiveLogContent`) continua aplicado
  ao diff antes de qualquer chamada ao modelo.
- `AiExecutionMode` (`fast`/`complete`) continua existindo sÃ³ para calibrar o
  budget da Code review (`ai-execution-policy.ts`: tamanho de diff, rounds,
  sÃ­ntese global); nÃ£o hÃ¡ mais seleÃ§Ã£o desse modo pelo usuÃ¡rio â a rota
  sempre usa o modo padrÃ£o.

## Arquitetura

```text
ProjectGitCodeReviewPage.vue
        â GET  .../ai-status         (status do Ollama local)
        â POST .../ai-review-executions
        â¼
GitAiCodeReviewService âââââââââââº AiAssistantService âââââââââââº OllamaProvider
  (execuÃ§Ã£o em memÃ³ria,               (status/review)                (HTTP local,
   arquivo por arquivo +                                               NDJSON,
   sÃ­ntese global opcional)                                            masking)
```

## SeguranÃ§a

Sem seleÃ§Ã£o de provider e sem consentimento cloud, a superfÃ­cie de risco
especÃ­fica de IA se reduz a: (1) o Ollama local sÃ³ Ã© alcanÃ§ado via loopback
HTTP (`resolveOllamaBaseUrl`), (2) o diff enviado ao modelo passa pela mesma
barreira de masking usada no resto do dashboard, e (3) a taxonomia de erros
de IA (`AiErrorCode`) permanece estÃ¡vel para a Code review traduzir falhas do
Ollama em mensagens claras. Ver `docs/architecture/security.md` para o
modelo de ameaÃ§a geral da API.
