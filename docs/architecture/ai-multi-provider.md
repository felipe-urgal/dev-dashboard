# IA no Dev Dashboard: histórico (removida)

> **Histórico — o produto não tem mais nenhuma capacidade de IA.** Este
> documento já descreveu uma arquitetura multi-provider (Ollama local +
> OpenAI cloud) com seleção por projeto, consentimento cloud e um Assistente
> IA completo (chat, compleção inline, catálogo de ferramentas, edição de
> workspace). Essa camada — Assistente IA, `AiProviderResolver`,
> `OpenAiProvider`, seleção de provider/modo por projeto e consentimento
> cloud — foi removida pela task 238 (ver `tasks/238-remover-assistente-ia.md`),
> que manteve deliberadamente a **Code review** (aba Git) rodando sobre um
> Ollama local fixo.
>
> Essa Code review simplificada foi removida também, num commit posterior
> sem task numerada correspondente (`ProjectGitCodeReviewPage.vue`,
> `GitAiCodeReviewService`, `AiAssistantService` e o endpoint
> `GET .../git/pull-request/ai-status` não existem mais no código atual).
> O dashboard web não tem hoje nenhuma rota, serviço ou componente de IA —
> nem Ollama, nem cloud. Este documento é mantido só como referência
> histórica de uma arquitetura que já existiu.

## Estado atual

Nenhum. Não há Assistente IA, Code review por IA, seleção de provider,
consentimento cloud nem integração com Ollama ou OpenAI no dashboard web.
