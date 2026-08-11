# Próxima atividade

O fechamento técnico da IA multi-provider (P0) foi consolidado e **mergeado em `main`** no
**PR #295**, seguindo [`AI-MULTI-PROVIDER-FINALIZATION.md`](AI-MULTI-PROVIDER-FINALIZATION.md). Não
há bloqueador conhecido pendente para os dois providers atuais (Ollama + OpenAI).

## Estado atual

Todos os P0 do checklist estão concluídos e mergeados. Os P1 foram revisados e classificados entre
validado e follow-up não bloqueante; esses follow-ups são hardening incremental, não bugs
conhecidos.

## Concluído nesta atividade — fault injection de persistência (item 12)

- `packages/core/test/project-ai-repositories.test.ts` ganhou fault injection para
  `ProjectAiConsentRepository` e `ProjectAiSelectionRepository`: falha simulada em `rename` (queda
  do processo entre `writeFile` e `rename`) e em `writeFile` (disco cheio) — em ambos os casos o
  arquivo real preserva o último estado válido, o estado em memória não avança, o `.tmp` órfão
  fica órfão sem corromper leituras futuras, e a próxima escrita bem-sucedida recupera o fluxo
  normalmente.
- `apps/web/test/project-ai-assistant-panel.test.ts` ganhou um teste visual dedicado: quando
  `PUT /providers/openai/consent` falha, a UI mantém `consentGranted` anterior, mostra a mensagem
  de erro do servidor e não expõe o botão de revogação (que só aparece com consentimento ativo).
- Isso fecha o follow-up do item 12 (`Persistência local`) em
  `tasks/AI-MULTI-PROVIDER-FINALIZATION.md`.

Gate rodado localmente para esta mudança: `typecheck`, `lint`, `format:check` (arquivos tocados),
suíte completa de `packages/core` e de `apps/web` — todos verdes.

## Próximos follow-ups não bloqueantes (ordem sugerida)

Nenhum deles bloqueia uso do multi-provider atual; escolher pela próxima sessão:

1. **Ampliar a matriz de regressão do Ollama** (item 11): Ollama offline, zero modelos, modelo
   removido no meio do uso, NDJSON incompleto, cancelamento de download longo.
2. **Métricas estruturadas de execution** (item 9): duração/estado terminal por execution — só se
   houver necessidade operacional real.
3. **Stress tests de budgets/tool results grandes** (itens 13 e 14) — só se surgirem casos reais de
   contexto grande.
4. **UX de fallback `offer` na Code Review** (item 8) — requer desenho explícito que evite revisão
   dupla/custo inesperado.
5. **Evolução da descoberta de modelos da OpenAI** (item 10) quando a API mudar; hoje o backend já
   rejeita qualquer modelo fora do catálogo retornado pelo provider.

P2 continua deliberadamente adiado: terceiro provider, `ProviderRegistry` dinâmico, fallback
automático e abstrações adicionais sem necessidade concreta.
