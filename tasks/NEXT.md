# Próxima atividade

Desenho novo em aberto: [`234-unificar-execucoes-em-terminal.md`](234-unificar-execucoes-em-terminal.md)
propõe migrar testes/migrations/build do transporte SSE (`script-execution/*`) para o mesmo
PTY+WebSocket já usado pelo Terminal/Console (`project-terminal-service.ts`), mantendo processos de
fundo (server/sidekiq/webpack) no modelo atual de log em arquivo + polling. Ainda é só desenho —
nenhuma linha de código foi alterada; a primeira atividade sugerida é a prova de conceito com
testes (item 1 do checklist).

O fechamento técnico da IA multi-provider (P0) está consolidado em `main` desde o **PR #295**,
seguindo [`AI-MULTI-PROVIDER-FINALIZATION.md`](AI-MULTI-PROVIDER-FINALIZATION.md). Não há
bloqueador conhecido pendente para os dois providers atuais (Ollama + OpenAI).

## Estado atual

Todos os P0 do checklist estão concluídos e mergeados. Dos follow-ups P1 não bloqueantes, seis dos
oito já foram fechados — só restam os itens 8 e 10 (ver "Próximos follow-ups" abaixo):

- **item 12** (persistência local) — fault injection de `writeFile`/`rename` e teste visual de
  falha de consentimento (PR #296).
- **item 11** (provider Ollama) — matriz de regressão ampliada: offline, zero modelos, modelo
  removido em uso, NDJSON incompleto, cancelamento de download (PR #297).
- **item 9** (observabilidade) — novo `apps/api/src/services/ai-execution-metrics.ts`: uma métrica
  estruturada (`executionKind`, `executionId`, `projectId`, `provider`, `mode`, `status`,
  `durationMs`, `errorCode` quando houver) é registrada exatamente uma vez, quando uma execution de
  implementation ou Code Review chega a um estado terminal — nunca prompt, diff, resumo ou achado
  (PR #297).
- **itens 13/14** (budgets fast/complete e tool calling) — stress tests dos quatro limites do modo
  `fast` do orquestrador: truncamento de tool result grande, corte por contexto acumulado, recusa
  de chamada repetida além do limite, e encerramento previsível ao esgotar os rounds sem
  convergência (PR #297).

Também no PR #296/#297, fora do checklist de fechamento multi-provider (pedido direto do usuário):
a Code Review IA ganhou comentários inline no diff (estilo GitHub) e um toggle **Diff / Arquivo
completo** por arquivo — este último busca o conteúdo atual via `GET /projects/:id/files/content`
(rota já existente) e destaca as linhas alteradas, com fallback para o Diff quando o arquivo não
pode ser lido.

Suíte completa verde no PR #297: `apps/api` 696/696, `apps/web` 389/389. Gate local (`typecheck`,
`lint`, `format:check`, `build`, `docs:api:check`) verde.

## Próximos follow-ups não bloqueantes (ordem sugerida)

Nenhum deles bloqueia uso do multi-provider atual; escolher pela próxima sessão:

1. **UX de fallback `offer` na Code Review** (item 8) — requer desenho explícito que evite revisão
   dupla/custo inesperado.
2. **Evolução da descoberta de modelos da OpenAI** (item 10) quando a API mudar; hoje o backend já
   rejeita qualquer modelo fora do catálogo retornado pelo provider.

P2 continua deliberadamente adiado: terceiro provider, `ProviderRegistry` dinâmico, fallback
automático e abstrações adicionais sem necessidade concreta.
